import { Router } from "express";
import { db } from "@workspace/db";
import { casesTable, caseLibraryTable, signalsTable, calibrationLogTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";

const router = Router();

router.get("/cases", async (_req, res) => {
  const cases = await db.select().from(casesTable).orderBy(casesTable.createdAt);
  res.json(cases.map(mapCase));
});

router.post("/cases", async (req, res) => {
  const body = req.body;
  const id = randomUUID();
  const caseId = body.caseId || `CASE-${Date.now()}`;
  const assetName = body.assetName || body.primaryBrand || "Unknown Asset";
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
    timeHorizon: body.timeHorizon || "12 months",
    priorProbability: body.priorProbability,
    primaryBrand: assetName,
    primarySpecialtyProfile: body.primarySpecialtyProfile || "General",
    payerEnvironment: body.payerEnvironment || "Balanced",
    guidelineLeverage: body.guidelineLeverage || "Medium",
    competitorProfile: body.competitorProfile || "Entrenched standard of care",
    isDemo: "false",
  }).returning();
  res.status(201).json(mapCase(created));
});

router.get("/cases/:caseId", async (req, res) => {
  const row = await db.select().from(casesTable).where(eq(casesTable.caseId, req.params.caseId)).limit(1);
  if (!row[0]) return res.status(404).json({ error: "Not found" });
  res.json(mapCase(row[0]));
});

router.put("/cases/:caseId", async (req, res) => {
  const body = req.body;
  const assetName = body.assetName || body.primaryBrand;
  const [updated] = await db.update(casesTable)
    .set({
      assetName: assetName,
      assetType: body.assetType,
      therapeuticArea: body.therapeuticArea,
      diseaseState: body.diseaseState,
      specialty: body.specialty,
      geography: body.geography,
      strategicQuestion: body.strategicQuestion,
      outcomeDefinition: body.outcomeDefinition,
      timeHorizon: body.timeHorizon,
      priorProbability: body.priorProbability,
      primaryBrand: assetName,
      primarySpecialtyProfile: body.primarySpecialtyProfile,
      payerEnvironment: body.payerEnvironment,
      guidelineLeverage: body.guidelineLeverage,
      competitorProfile: body.competitorProfile,
      lastUpdate: new Date(),
    })
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
    isDemo: c.isDemo,
    lastUpdate: c.lastUpdate,
    signalCount: 0,
  };
}

export default router;
