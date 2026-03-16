import { Router } from "express";
import { db } from "@workspace/db";
import { casesTable, signalsTable, actorsTable, calibrationLogTable, AGENT_ARCHETYPES } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { runForecastEngine } from "../lib/forecast-engine.js";
import { simulateAgents } from "../lib/agent-engine.js";
import { getLrCorrections, getBucketCorrections, getBucket } from "./calibration.js";

const router = Router();

router.get("/cases/:caseId/forecast", async (req, res) => {
  const caseRow = await db.select().from(casesTable).where(eq(casesTable.caseId, req.params.caseId)).limit(1);
  if (!caseRow[0]) return res.status(404).json({ error: "Case not found" });
  const caseData = caseRow[0];

  const signals = await db.select().from(signalsTable).where(eq(signalsTable.caseId, req.params.caseId));
  const actors = await db.select().from(actorsTable).where(eq(actorsTable.specialtyProfile, "General")).orderBy(actorsTable.slotIndex);

  if (actors.length === 0) {
    return res.status(400).json({ error: "No actors configured. Please seed the database first." });
  }

  // ── Apply LR corrections and freshness decay ─────────────────────────────
  const corrections = await getLrCorrections();
  const now = Date.now();
  const signalsWithAdjustedLR = signals.map((s) => {
    const correction = corrections[s.signalType ?? ""] ?? 1.0;
    const ageMonths = s.createdAt
      ? (now - new Date(s.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 30)
      : 0;
    const decayFactor = computeDecay(s.signalType ?? "", ageMonths);
    const adjusted = (s.likelihoodRatio ?? 1) * correction * decayFactor;
    return { ...s, likelihoodRatio: Number(adjusted.toFixed(4)) };
  });

  // ── Run agent simulation ─────────────────────────────────────────────────
  let agentSimulationResult: Parameters<typeof runForecastEngine>[8] = undefined;
  if (signalsWithAdjustedLR.length > 0) {
    const { agentResults, agentDerivedActorTranslation } = simulateAgents(signalsWithAdjustedLR);
    const enrichedResults = agentResults.map((r) => {
      const arch = AGENT_ARCHETYPES.find((a) => a.id === r.agentId);
      return { ...r, influenceScore: arch?.influenceScore ?? 1 };
    });
    agentSimulationResult = { agentDerivedActorTranslation, agentResults: enrichedResults };
  }

  const result = runForecastEngine(
    req.params.caseId,
    caseData.priorProbability,
    signalsWithAdjustedLR,
    actors.map((a) => ({
      actorName: a.actorName,
      influenceWeight: a.influenceWeight,
      positiveResponseFactor: a.positiveResponseFactor,
      negativeResponseFactor: a.negativeResponseFactor,
      outcomeOrientation: a.outcomeOrientation,
      slotIndex: a.slotIndex,
    })),
    caseData.primarySpecialtyProfile ?? "General",
    caseData.payerEnvironment ?? "Balanced",
    caseData.guidelineLeverage ?? "Medium",
    caseData.competitorProfile ?? "Entrenched standard of care",
    agentSimulationResult
  );

  // ── Apply bucket-level probability correction (downstream calibration) ───
  const bucketCorrections = await getBucketCorrections();
  const rawProbability = result.currentProbability;
  const bucket = getBucket(rawProbability);
  const bucketCorrectionPp = bucket ? (bucketCorrections[bucket] ?? 0) : 0;
  const calibratedProbability = bucket && bucketCorrectionPp !== 0
    ? Math.max(0.01, Math.min(0.99, rawProbability + bucketCorrectionPp))
    : rawProbability;

  const finalResult = {
    ...result,
    currentProbability: calibratedProbability,
    rawProbability,
    bucketCorrectionApplied: bucketCorrectionPp !== 0
      ? { bucket, correctionPp: bucketCorrectionPp }
      : null,
  };

  await db.update(casesTable).set({
    currentProbability: calibratedProbability,
    confidenceLevel: result.confidenceLevel,
    topSupportiveActor: result.topSupportiveActor,
    topConstrainingActor: result.topConstrainingActor,
    miosRoutingCheck: result.interpretation.miosRoutingCheck,
    ohosRoutingCheck: result.interpretation.ohosRoutingCheck,
    lastUpdate: new Date(),
  }).where(eq(casesTable.caseId, req.params.caseId));

  const forecastId = `FCAST-${Date.now()}`;
  await db.insert(calibrationLogTable).values({
    id: randomUUID(),
    forecastId,
    caseId: req.params.caseId,
    predictedProbability: calibratedProbability,
    snapshotJson: JSON.stringify(finalResult),
  }).onConflictDoNothing();

  res.json({ ...finalResult, forecastId, savedAt: new Date().toISOString() });
});

// Freshness decay factor: exp(-λ × ageMonths)
const DECAY_LAMBDA: Record<string, number> = {
  "Phase III clinical":       0.06,
  "Guideline inclusion":      0.05,
  "Regulatory / clinical":    0.08,
  "KOL endorsement":          0.18,
  "Access / commercial":      0.22,
  "Competitor counteraction": 0.25,
  "Operational friction":     0.20,
  "Field intelligence":       0.35,
};

function computeDecay(signalType: string, ageMonths: number): number {
  const lambda = DECAY_LAMBDA[signalType] ?? 0.15;
  return Math.exp(-lambda * ageMonths);
}

export default router;
