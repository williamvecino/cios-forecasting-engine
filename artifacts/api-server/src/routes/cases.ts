import { Router } from "express";
import { db } from "@workspace/db";
import { casesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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
