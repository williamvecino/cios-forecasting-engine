import { Router } from "express";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import {
  discoveryRunsTable,
  discoveryCandidatesTable,
  discoveryCandidateSignalsTable,
  casesTable,
  signalsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { runDiscovery } from "../lib/adopter-discovery.js";


const router = Router();

router.post("/discovery-runs", async (req, res) => {
  const { questionText, geography, therapyArea, targetType, specialty, subspecialty, timeHorizon } = req.body;

  if (!questionText || typeof questionText !== "string" || questionText.trim().length < 5) {
    return res.status(400).json({ error: "questionText is required (min 5 characters)" });
  }

  const result = runDiscovery({ questionText, geography, therapyArea, targetType, specialty, subspecialty, timeHorizon });
  const runId = `DISC-${Date.now()}`;

  const [run] = await db.insert(discoveryRunsTable).values({
    runId,
    questionText,
    parsedQuestionJson: result.parsedQuestion,
    geography: result.parsedQuestion.geography,
    therapyArea: result.parsedQuestion.therapyArea,
    targetType: result.parsedQuestion.targetType,
    specialty: result.parsedQuestion.specialty,
    subspecialty: result.parsedQuestion.subspecialty,
    timeHorizon: result.parsedQuestion.timeHorizon,
    runStatus: "completed",
    totalCandidatesFound: result.totalCandidates,
    totalSignalsFound: result.totalSignals,
  }).returning();

  for (const c of result.candidates) {
    const candidateId = `CAND-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await db.insert(discoveryCandidatesTable).values({
      candidateId,
      discoveryRunId: runId,
      candidateType: c.candidateType,
      candidateName: c.candidateName,
      specialty: c.specialty,
      subspecialty: c.subspecialty,
      institutionName: c.institutionName,
      geography: c.geography,
      sourceConfidence: "medium",
      evidenceCompleteness: c.evidenceCompleteness,
      prepScore: c.prepScore,
      suggestedAction: c.suggestedAction,
      positiveSignals: c.positiveSignals,
      negativeSignals: c.negativeSignals,
      neutralSignals: c.neutralSignals,
    });

    for (const s of c.signals) {
      const signalId = `DSIG-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await db.insert(discoveryCandidateSignalsTable).values({
        signalId,
        candidateId,
        discoveryRunId: runId,
        signalType: s.signalType,
        direction: s.direction,
        strength: s.strength,
        reliability: s.reliability,
        signalScope: s.signalScope,
        sourceLabel: s.sourceLabel,
        sourceUrl: s.sourceUrl,
        evidenceSnippet: s.evidenceSnippet,
        eventFamilyId: s.eventFamilyId || null,
        status: "candidate",
      });
    }
  }

  res.json({
    runId,
    parsedQuestion: result.parsedQuestion,
    totalCandidates: result.totalCandidates,
    totalSignals: result.totalSignals,
    status: "completed",
  });
});

router.get("/discovery-runs", async (_req, res) => {
  const runs = await db.select().from(discoveryRunsTable).orderBy(discoveryRunsTable.createdAt);
  res.json(runs.reverse());
});

router.get("/discovery-runs/:runId", async (req, res) => {
  const [run] = await db.select().from(discoveryRunsTable).where(eq(discoveryRunsTable.runId, req.params.runId));
  if (!run) return res.status(404).json({ error: "Run not found" });

  const candidates = await db.select().from(discoveryCandidatesTable).where(eq(discoveryCandidatesTable.discoveryRunId, req.params.runId));
  candidates.sort((a, b) => (b.prepScore ?? 0) - (a.prepScore ?? 0));

  const allSignals = await db.select().from(discoveryCandidateSignalsTable).where(eq(discoveryCandidateSignalsTable.discoveryRunId, req.params.runId));

  const candidatesWithSignals = candidates.map(c => ({
    ...c,
    signals: allSignals.filter(s => s.candidateId === c.candidateId),
  }));

  res.json({ ...run, candidates: candidatesWithSignals });
});

router.get("/discovery-candidates/:candidateId", async (req, res) => {
  const [candidate] = await db.select().from(discoveryCandidatesTable).where(eq(discoveryCandidatesTable.candidateId, req.params.candidateId));
  if (!candidate) return res.status(404).json({ error: "Candidate not found" });

  const signals = await db.select().from(discoveryCandidateSignalsTable).where(eq(discoveryCandidateSignalsTable.candidateId, req.params.candidateId));

  res.json({ ...candidate, signals });
});

router.post("/discovery-candidate-signals/:signalId/validate", async (req, res) => {
  const [signal] = await db.select().from(discoveryCandidateSignalsTable).where(eq(discoveryCandidateSignalsTable.signalId, req.params.signalId));
  if (!signal) return res.status(404).json({ error: "Signal not found" });

  await db.update(discoveryCandidateSignalsTable)
    .set({ status: "validated", updatedAt: new Date() })
    .where(eq(discoveryCandidateSignalsTable.signalId, req.params.signalId));

  res.json({ signalId: req.params.signalId, status: "validated" });
});

router.post("/discovery-candidate-signals/:signalId/reject", async (req, res) => {
  const [signal] = await db.select().from(discoveryCandidateSignalsTable).where(eq(discoveryCandidateSignalsTable.signalId, req.params.signalId));
  if (!signal) return res.status(404).json({ error: "Signal not found" });

  await db.update(discoveryCandidateSignalsTable)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(eq(discoveryCandidateSignalsTable.signalId, req.params.signalId));

  res.json({ signalId: req.params.signalId, status: "rejected" });
});

router.post("/discovery-candidate-signals/:signalId/defer", async (req, res) => {
  const [signal] = await db.select().from(discoveryCandidateSignalsTable).where(eq(discoveryCandidateSignalsTable.signalId, req.params.signalId));
  if (!signal) return res.status(404).json({ error: "Signal not found" });

  await db.update(discoveryCandidateSignalsTable)
    .set({ status: "candidate", updatedAt: new Date() })
    .where(eq(discoveryCandidateSignalsTable.signalId, req.params.signalId));

  res.json({ signalId: req.params.signalId, status: "candidate" });
});

router.post("/discovery-candidates/:candidateId/send-to-cios", async (req, res) => {
  const [candidate] = await db.select().from(discoveryCandidatesTable).where(eq(discoveryCandidatesTable.candidateId, req.params.candidateId));
  if (!candidate) return res.status(404).json({ error: "Candidate not found" });

  const signals = await db.select().from(discoveryCandidateSignalsTable).where(eq(discoveryCandidateSignalsTable.candidateId, req.params.candidateId));
  const validatedSignals = signals.filter(s => s.status === "validated");

  if (validatedSignals.length === 0) {
    return res.status(400).json({ error: "No validated signals to promote. Validate at least one signal before sending to CIOS." });
  }

  const caseId = `CASE-${Date.now()}`;
  const targetType = candidate.candidateType === "physician" ? "physician" : "institution";
  const question = candidate.candidateType === "physician"
    ? `Will ${candidate.candidateName} at ${candidate.institutionName} adopt the therapy within the forecast window?`
    : `Will ${candidate.candidateName} add the therapy to formulary within the forecast window?`;

  await db.insert(casesTable).values({
    id: randomUUID(),
    caseId,
    assetName: candidate.specialty || "Discovery",
    therapeuticArea: candidate.specialty || "General",
    specialty: candidate.specialty,
    subspecialty: candidate.subspecialty,
    strategicQuestion: question,
    priorProbability: 0.5,
    currentProbability: 0.5,
    confidenceLevel: "Low",
    geography: candidate.geography,
    targetType,
    targetId: candidate.candidateType === "physician" ? candidate.candidateName : null,
    institutionName: candidate.institutionName,
  });

  for (const vs of validatedSignals) {
    const signalId = `SIG-${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const strengthNum = vs.strength === "high" ? 5 : vs.strength === "medium" ? 3 : 2;
    const reliabilityNum = vs.reliability === "high" ? 5 : vs.reliability === "medium" ? 3 : 2;
    const direction = vs.direction === "positive" ? "Positive" : vs.direction === "negative" ? "Negative" : "Neutral";

    await db.insert(signalsTable).values({
      id: randomUUID(),
      signalId,
      caseId,
      signalDescription: vs.evidenceSnippet || vs.signalType,
      signalType: vs.signalType === "Specialty match" ? "Field intelligence"
        : vs.signalType === "Trial participation" ? "Phase III clinical"
        : vs.signalType === "Publication activity" ? "KOL endorsement"
        : vs.signalType === "Conference faculty" ? "KOL endorsement"
        : vs.signalType === "Institutional readiness" ? "Field intelligence"
        : vs.signalType === "Formulary openness" ? "Access / commercial"
        : vs.signalType === "Innovation adoption history" ? "Field intelligence"
        : vs.signalType === "Procedural capability" ? "Field intelligence"
        : vs.signalType === "Patient volume indicator" ? "Field intelligence"
        : "Field intelligence",
      direction,
      strengthScore: strengthNum,
      reliabilityScore: reliabilityNum,
      likelihoodRatio: 1.0,
      signalScope: vs.signalScope === "physician" ? "physician"
        : vs.signalScope === "institution" ? "institution"
        : "market",
    });
  }

  await db.update(discoveryCandidatesTable)
    .set({ status: "promoted", suggestedAction: "sent to CIOS", updatedAt: new Date() })
    .where(eq(discoveryCandidatesTable.candidateId, req.params.candidateId));

  res.json({
    candidateId: req.params.candidateId,
    createdCaseId: caseId,
    promotedSignals: validatedSignals.length,
    status: "promoted",
  });
});

router.post("/discovery-candidates/:candidateId/hold", async (req, res) => {
  await db.update(discoveryCandidatesTable)
    .set({ status: "on-hold", updatedAt: new Date() })
    .where(eq(discoveryCandidatesTable.candidateId, req.params.candidateId));

  res.json({ candidateId: req.params.candidateId, status: "on-hold" });
});

router.post("/discovery-candidates/:candidateId/remove", async (req, res) => {
  await db.update(discoveryCandidatesTable)
    .set({ status: "removed", updatedAt: new Date() })
    .where(eq(discoveryCandidatesTable.candidateId, req.params.candidateId));

  res.json({ candidateId: req.params.candidateId, status: "removed" });
});

export default router;
