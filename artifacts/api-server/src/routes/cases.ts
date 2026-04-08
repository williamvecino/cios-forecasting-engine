import { Router } from "express";
import { db } from "@workspace/db";
import { casesTable, caseLibraryTable, signalsTable, calibrationLogTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { buildCanonicalCase } from "../lib/canonical-case.js";
import { verifyPmid } from "../lib/evidence-verification.js";
import { detectLifecycleStageFromFDA } from "../lib/lifecycle-detect.js";

const router = Router();

router.get("/cases", async (_req, res) => {
  const cases = await db.select().from(casesTable).orderBy(casesTable.createdAt);
  res.json(cases.map(mapCase));
});

router.post("/cases", async (req, res) => {
  const body = req.body;

  const hasPivotalEvidence = !!(body.primaryTrialName?.trim() && body.primaryTrialPmid?.trim() && body.primaryTrialResult?.trim());

  const id = randomUUID();
  const caseId = body.caseId || `CASE-${Date.now()}`;
  const assetName = body.assetName || body.primaryBrand || "Unknown Asset";
  const canonical = buildCanonicalCase(
    caseId,
    body.strategicQuestion || "",
    assetName,
    {
      outcomeThreshold: body.outcomeThreshold,
      timeHorizon: body.timeHorizon,
      therapeuticArea: body.therapeuticArea,
      diseaseState: body.diseaseState,
      outcomeDefinition: body.outcomeDefinition,
      priorArchetype: body.priorArchetype,
    },
  );

  const [created] = await db.insert(casesTable).values({
    id,
    caseId,
    assetName,
    assetType: body.assetType || "Medication",
    therapeuticArea: body.therapeuticArea,
    diseaseState: body.diseaseState,
    specialty: body.specialty,
    geography: body.geography || "US",
    strategicQuestion: body.strategicQuestion,
    outcomeDefinition: body.outcomeDefinition,
    outcomeThreshold: body.outcomeThreshold || null,
    timeHorizon: body.timeHorizon || "12 months",
    priorProbability: body.priorProbability,
    primaryBrand: assetName,
    primarySpecialtyProfile: body.primarySpecialtyProfile || "General",
    payerEnvironment: body.payerEnvironment || "Balanced",
    guidelineLeverage: body.guidelineLeverage || "Medium",
    competitorProfile: body.competitorProfile || "Entrenched standard of care",
    targetType: body.targetType || "market",
    targetId: body.targetId || null,
    subspecialty: body.subspecialty || null,
    institutionName: body.institutionName || null,
    accessFrictionIndex: body.accessFrictionIndex != null ? Number(body.accessFrictionIndex) : 0.5,
    adoptionPhase: body.adoptionPhase || "early_adoption",
    forecastHorizonMonths: body.forecastHorizonMonths != null ? Number(body.forecastHorizonMonths) : 12,
    isDemo: body.isDemo || "false",
    priorArchetype: body.priorArchetype || null,
    priorRationale: body.priorRationale || null,
    primaryTrialName: body.primaryTrialName?.trim() || null,
    primaryTrialPmid: body.primaryTrialPmid?.trim() || null,
    primaryTrialResult: body.primaryTrialResult?.trim() || null,
    secondaryEvidence: body.secondaryEvidence?.trim() || null,
    canonicalFields: canonical,
    fieldsLockedAt: new Date(),
  }).returning();

  if (hasPivotalEvidence) {
    const pivotalSignalId = `PIVOTAL-${caseId}`;
    const trialName = body.primaryTrialName.trim();
    const pmid = body.primaryTrialPmid?.trim() || "";
    const result = body.primaryTrialResult?.trim() || "";

    // Verify PMID against PubMed before trusting it
    let registryMatch = false;
    let verificationStatus: "verified" | "invalid" | "unverified" = "unverified";
    if (pmid) {
      const check = await verifyPmid(pmid);
      registryMatch = check.outcome === "valid";
      verificationStatus = check.outcome === "valid" ? "verified" : check.outcome === "invalid" ? "invalid" : "unverified";
    }

    await db.insert(signalsTable).values({
      id: randomUUID(),
      signalId: pivotalSignalId,
      caseId,
      brand: assetName,
      signalDescription: `Pivotal trial: ${trialName} — ${result}`,
      signalType: "Phase III clinical trial",
      direction: "Positive",
      strengthScore: 0.9,
      reliabilityScore: 0.95,
      likelihoodRatio: 1.0,
      scope: "national",
      timing: "current",
      status: "candidate",
      createdByType: "human",
      createdById: "analyst",
      sourceLabel: trialName,
      sourceUrl: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : null,
      evidenceSnippet: result,
      identifierType: pmid ? "PMID" : null,
      identifierValue: pmid || null,
      verificationStatus,
      registryMatch,
      evidenceClass: "Eligible",
      countTowardPosterior: false, // Must go through transition workflow to activate
      signalFamily: "pivotal-trial",
      noveltyFlag: true,
    });
  }

  let stageDetection: { stage: string; rationale: string } | null = null;
  try {
    stageDetection = await detectLifecycleStageFromFDA(assetName);
    if (stageDetection) {
      await db.update(casesTable).set({
        drugStage: stageDetection.stage,
        drugStageRationale: stageDetection.rationale,
      }).where(eq(casesTable.caseId, caseId));
      (created as any).drugStage = stageDetection.stage;
      (created as any).drugStageRationale = stageDetection.rationale;
    }
  } catch (err: any) {
    console.error("[lifecycle-detect] FDA lookup failed:", err.message);
  }

  res.status(201).json(mapCase(created));
});

router.get("/cases/:caseId", async (req, res) => {
  const row = await db.select().from(casesTable).where(eq(casesTable.caseId, req.params.caseId)).limit(1);
  if (!row[0]) return res.status(404).json({ error: "Not found" });
  res.json(mapCase(row[0]));
});

router.patch("/cases/:caseId/lifecycle-stage", async (req, res) => {
  const { stage } = req.body as { stage?: string };
  const validStages = ["INVESTIGATIONAL", "RECENTLY_APPROVED", "ESTABLISHED", "MATURE"];
  if (!stage || !validStages.includes(stage)) {
    return res.status(400).json({ error: `Invalid stage. Must be one of: ${validStages.join(", ")}` });
  }

  const [existing] = await db.select().from(casesTable).where(eq(casesTable.caseId, req.params.caseId)).limit(1);
  if (!existing) return res.status(404).json({ error: "Case not found" });

  const STAGE_LABELS: Record<string, string> = {
    INVESTIGATIONAL: "Investigational",
    RECENTLY_APPROVED: "Recently Approved",
    ESTABLISHED: "Established",
    MATURE: "Mature",
  };

  await db.update(casesTable).set({
    drugStage: stage,
    drugStageRationale: `Manually overridden by analyst to: ${STAGE_LABELS[stage]}.`,
  }).where(eq(casesTable.caseId, req.params.caseId));

  return res.json({
    caseId: req.params.caseId,
    drugStage: stage,
    drugStageRationale: `Manually overridden by analyst to: ${STAGE_LABELS[stage]}.`,
  });
});

router.put("/cases/:caseId", async (req, res) => {
  const body = req.body;

  const [existing] = await db.select().from(casesTable).where(eq(casesTable.caseId, req.params.caseId)).limit(1);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const LOCKED_FIELDS = ["outcomeDefinition", "outcomeThreshold", "timeHorizon", "priorArchetype", "strategicQuestion", "priorProbability"] as const;
  const isLocked = !!existing.fieldsLockedAt;
  const explicitUnlock = body._unlockFields === true;

  if (isLocked && !explicitUnlock) {
    const violations: string[] = [];
    for (const f of LOCKED_FIELDS) {
      if (body[f] !== undefined && body[f] !== existing[f]) {
        violations.push(f);
      }
    }
    if (violations.length > 0) {
      return res.status(409).json({
        error: "LOCKED_FIELD_VIOLATION",
        message: `Fields [${violations.join(", ")}] are locked after question acceptance. Pass _unlockFields: true to override.`,
        lockedFields: violations,
        lockedAt: existing.fieldsLockedAt,
      });
    }
  }

  const assetName = body.assetName || body.primaryBrand;

  const updateSet: Record<string, unknown> = {
    assetName: assetName,
    assetType: body.assetType,
    therapeuticArea: body.therapeuticArea,
    diseaseState: body.diseaseState,
    specialty: body.specialty,
    geography: body.geography,
    strategicQuestion: body.strategicQuestion,
    outcomeDefinition: body.outcomeDefinition,
    outcomeThreshold: body.outcomeThreshold ?? undefined,
    timeHorizon: body.timeHorizon,
    priorProbability: body.priorProbability,
    primaryBrand: assetName,
    primarySpecialtyProfile: body.primarySpecialtyProfile,
    payerEnvironment: body.payerEnvironment,
    guidelineLeverage: body.guidelineLeverage,
    competitorProfile: body.competitorProfile,
    targetType: body.targetType,
    targetId: body.targetId,
    subspecialty: body.subspecialty,
    institutionName: body.institutionName,
    accessFrictionIndex: body.accessFrictionIndex != null ? Number(body.accessFrictionIndex) : undefined,
    adoptionPhase: body.adoptionPhase ?? undefined,
    forecastHorizonMonths: body.forecastHorizonMonths != null ? Number(body.forecastHorizonMonths) : undefined,
    priorArchetype: body.priorArchetype ?? undefined,
    priorRationale: body.priorRationale ?? undefined,
    lastUpdate: new Date(),
  };

  if (explicitUnlock) {
    const newCanonical = buildCanonicalCase(
      req.params.caseId,
      body.strategicQuestion || existing.strategicQuestion,
      assetName || existing.assetName || "",
      {
        outcomeThreshold: body.outcomeThreshold ?? existing.outcomeThreshold,
        timeHorizon: body.timeHorizon ?? existing.timeHorizon,
        therapeuticArea: body.therapeuticArea ?? existing.therapeuticArea,
        diseaseState: body.diseaseState ?? existing.diseaseState,
        outcomeDefinition: body.outcomeDefinition ?? existing.outcomeDefinition,
        priorArchetype: body.priorArchetype ?? existing.priorArchetype,
      },
    );
    (updateSet as any).canonicalFields = newCanonical;
    (updateSet as any).fieldsLockedAt = new Date();
  }

  const [updated] = await db.update(casesTable)
    .set(updateSet as any)
    .where(eq(casesTable.caseId, req.params.caseId))
    .returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(mapCase(updated));
});

router.delete("/cases/:caseId", async (req, res) => {
  await db.delete(casesTable).where(eq(casesTable.caseId, req.params.caseId));
  res.status(204).send();
});

router.patch("/cases/:caseId/outcome", async (req, res) => {
  const { actualAdoptionRate, actualOutcomeNotes } = req.body;
  const [updated] = await db
    .update(casesTable)
    .set({
      actualAdoptionRate: actualAdoptionRate !== undefined ? Number(actualAdoptionRate) : undefined,
      actualOutcomeNotes: actualOutcomeNotes ?? undefined,
      outcomeRecordedAt: new Date(),
    })
    .where(eq(casesTable.caseId, req.params.caseId))
    .returning();
  if (!updated) return res.status(404).json({ error: "Not found" });

  // Close the most recent open calibration entry for this case
  if (actualAdoptionRate !== undefined && actualAdoptionRate !== null) {
    const observedFrac = Number(actualAdoptionRate) / 100;
    const [latestLog] = await db
      .select()
      .from(calibrationLogTable)
      .where(eq(calibrationLogTable.caseId, req.params.caseId))
      .orderBy(desc(calibrationLogTable.predictionDate))
      .limit(1);

    if (latestLog && latestLog.observedOutcome === null) {
      const brierComponent = Math.pow(latestLog.predictedProbability - observedFrac, 2);
      const forecastError = observedFrac - latestLog.predictedProbability;
      await db
        .update(calibrationLogTable)
        .set({ observedOutcome: observedFrac, brierComponent, forecastError })
        .where(eq(calibrationLogTable.id, latestLog.id));
    }
  }

  res.json(updated);
});

router.post("/cases/:caseId/publish-to-library", async (req, res) => {
  const { caseId } = req.params;
  const [caseRow] = await db.select().from(casesTable).where(eq(casesTable.caseId, caseId));
  if (!caseRow) return res.status(404).json({ error: "Case not found" });

  const signals = await db.select().from(signalsTable).where(eq(signalsTable.caseId, caseId));

  // Build signal mix: count signal types
  const signalMix: Record<string, number> = {};
  for (const s of signals) {
    signalMix[s.signalType] = (signalMix[s.signalType] ?? 0) + 1;
  }

  const adoptionRate = caseRow.actualAdoptionRate;
  const adoptionTrajectory = caseRow.outcomeDefinition ?? null;
  const finalProb = adoptionRate !== null && adoptionRate !== undefined
    ? adoptionRate / 100
    : caseRow.currentProbability ?? null;

  const [library] = await db.insert(caseLibraryTable).values({
    id: randomUUID(),
    caseId: caseRow.caseId,
    therapyArea: caseRow.therapeuticArea ?? "Unknown",
    productType: caseRow.assetType ?? "Medication",
    specialty: caseRow.specialty ?? "General",
    evidenceType: signals.some((s) => s.signalType === "Phase III clinical") ? "Phase 3 RCT" : "Mixed evidence",
    lifecycleStage: "Commercial",
    actorMix: [caseRow.primarySpecialtyProfile, caseRow.payerEnvironment].filter(Boolean).join(" / ") || null,
    marketAccessConditions: caseRow.payerEnvironment ?? null,
    outcomePattern: caseRow.actualOutcomeNotes ?? null,
    adoptionTrajectory: adoptionTrajectory,
    keyInflectionSignals: signals.slice(0, 3).map((s) => `${s.signalType}: ${s.signalDescription}`).join("; ") || null,
    finalObservedOutcome: caseRow.actualOutcomeNotes ?? null,
    finalProbability: finalProb,
    notes: `Published from active case ${caseRow.caseId}. Asset: ${caseRow.assetName ?? caseRow.primaryBrand}.`,
    signalMix,
    sourceCaseId: caseId,
  }).returning();

  await db.update(casesTable)
    .set({ outcomePublishedToLibrary: "true" })
    .where(eq(casesTable.caseId, caseId));

  res.status(201).json(library);
});

function mapCase(c: typeof casesTable.$inferSelect) {
  return {
    id: c.id,
    caseId: c.caseId,
    assetName: c.assetName || c.primaryBrand,
    assetType: c.assetType,
    therapeuticArea: c.therapeuticArea,
    diseaseState: c.diseaseState,
    specialty: c.specialty,
    geography: c.geography,
    strategicQuestion: c.strategicQuestion,
    outcomeDefinition: c.outcomeDefinition,
    outcomeThreshold: c.outcomeThreshold,
    timeHorizon: c.timeHorizon,
    priorProbability: c.priorProbability,
    currentProbability: c.currentProbability,
    confidenceLevel: c.confidenceLevel,
    primaryBrand: c.assetName || c.primaryBrand, // backward compat for generated hooks
    primarySpecialtyProfile: c.primarySpecialtyProfile,
    payerEnvironment: c.payerEnvironment,
    guidelineLeverage: c.guidelineLeverage,
    competitorProfile: c.competitorProfile,
    topSupportiveActor: c.topSupportiveActor,
    topConstrainingActor: c.topConstrainingActor,
    miosRoutingCheck: c.miosRoutingCheck,
    ohosRoutingCheck: c.ohosRoutingCheck,
    targetType: c.targetType || "market",
    targetId: c.targetId,
    subspecialty: c.subspecialty,
    institutionName: c.institutionName,
    isDemo: c.isDemo,
    priorArchetype: c.priorArchetype,
    priorRationale: c.priorRationale,
    primaryTrialName: c.primaryTrialName,
    primaryTrialPmid: c.primaryTrialPmid,
    primaryTrialResult: c.primaryTrialResult,
    secondaryEvidence: c.secondaryEvidence,
    canonicalFields: c.canonicalFields,
    fieldsLockedAt: c.fieldsLockedAt,
    lastUpdate: c.lastUpdate,
    drugStage: (c as any).drugStage || null,
    drugStageRationale: (c as any).drugStageRationale || null,
    signalCount: 0,
  };
}

export default router;
