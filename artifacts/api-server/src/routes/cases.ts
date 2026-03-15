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
  const [created] = await db.insert(casesTable).values({
    id,
    caseId,
    strategicQuestion: body.strategicQuestion,
    outcomeDefinition: body.outcomeDefinition,
    timeHorizon: body.timeHorizon || "12 months",
    priorProbability: body.priorProbability,
    primaryBrand: body.primaryBrand,
    primarySpecialtyProfile: body.primarySpecialtyProfile || "General",
    payerEnvironment: body.payerEnvironment || "Balanced",
    guidelineLeverage: body.guidelineLeverage || "Medium",
    competitorProfile: body.competitorProfile || "Entrenched standard of care",
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
  const [updated] = await db.update(casesTable)
    .set({
      strategicQuestion: body.strategicQuestion,
      outcomeDefinition: body.outcomeDefinition,
      timeHorizon: body.timeHorizon,
      priorProbability: body.priorProbability,
      primaryBrand: body.primaryBrand,
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
    strategicQuestion: c.strategicQuestion,
    outcomeDefinition: c.outcomeDefinition,
    timeHorizon: c.timeHorizon,
    priorProbability: c.priorProbability,
    currentProbability: c.currentProbability,
    confidenceLevel: c.confidenceLevel,
    primaryBrand: c.primaryBrand,
    primarySpecialtyProfile: c.primarySpecialtyProfile,
    payerEnvironment: c.payerEnvironment,
    guidelineLeverage: c.guidelineLeverage,
    competitorProfile: c.competitorProfile,
    topSupportiveActor: c.topSupportiveActor,
    topConstrainingActor: c.topConstrainingActor,
    miosRoutingCheck: c.miosRoutingCheck,
    ohosRoutingCheck: c.ohosRoutingCheck,
    lastUpdate: c.lastUpdate,
    signalCount: 0,
  };
}

export default router;
