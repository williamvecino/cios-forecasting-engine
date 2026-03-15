import { Router } from "express";
import { db } from "@workspace/db";
import { signalsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const router = Router();

router.get("/cases/:caseId/signals", async (req, res) => {
  const signals = await db.select().from(signalsTable)
    .where(eq(signalsTable.caseId, req.params.caseId))
    .orderBy(signalsTable.createdAt);
  res.json(signals);
});

router.post("/cases/:caseId/signals", async (req, res) => {
  const body = req.body;
  const id = randomUUID();
  const signalId = body.signalId || `SIG-${Date.now()}`;
  const weightedScore = (body.strengthScore ?? 0) * (body.reliabilityScore ?? 0);
  const [created] = await db.insert(signalsTable).values({
    id,
    signalId,
    caseId: req.params.caseId,
    candidateId: body.candidateId || signalId,
    brand: body.brand,
    signalDescription: body.signalDescription,
    signalType: body.signalType,
    direction: body.direction,
    strengthScore: body.strengthScore,
    reliabilityScore: body.reliabilityScore,
    likelihoodRatio: body.likelihoodRatio,
    route: body.route,
    targetPopulation: body.targetPopulation,
    miosFlag: body.miosFlag || (body.route?.includes("MIOS") ? "Yes" : "No"),
    ohosFlag: body.ohosFlag || (body.route?.includes("OHOS") ? "Yes" : "No"),
    weightedSignalScore: weightedScore,
    activeLikelihoodRatio: body.likelihoodRatio,
  }).returning();
  res.status(201).json(created);
});

router.put("/signals/:signalId", async (req, res) => {
  const body = req.body;
  const [updated] = await db.update(signalsTable)
    .set({
      signalDescription: body.signalDescription,
      signalType: body.signalType,
      direction: body.direction,
      strengthScore: body.strengthScore,
      reliabilityScore: body.reliabilityScore,
      likelihoodRatio: body.likelihoodRatio,
      route: body.route,
      targetPopulation: body.targetPopulation,
      miosFlag: body.miosFlag,
      ohosFlag: body.ohosFlag,
      weightedSignalScore: (body.strengthScore ?? 0) * (body.reliabilityScore ?? 0),
    })
    .where(eq(signalsTable.signalId, req.params.signalId))
    .returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

router.delete("/signals/:signalId", async (req, res) => {
  await db.delete(signalsTable).where(eq(signalsTable.signalId, req.params.signalId));
  res.status(204).send();
});

export default router;
