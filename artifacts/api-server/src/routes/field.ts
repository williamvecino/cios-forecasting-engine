import { Router } from "express";
import { db } from "@workspace/db";
import { fieldIntelligenceTable } from "@workspace/db";
import { randomUUID } from "crypto";

const router = Router();

router.get("/field-intelligence", async (_req, res) => {
  const rows = await db.select().from(fieldIntelligenceTable).orderBy(fieldIntelligenceTable.createdAt);
  res.json(rows);
});

router.post("/field-intelligence", async (req, res) => {
  const body = req.body;
  const totalScore =
    (body.urgencyScore ?? 0) +
    (body.credibilityScore ?? 0) +
    (body.frequencyScore ?? 0) +
    (body.potentialImpact ?? 0);

  const [created] = await db.insert(fieldIntelligenceTable).values({
    id: randomUUID(),
    feedbackId: `FB-${Date.now()}`,
    brand: body.brand,
    audienceType: body.audienceType,
    specialty: body.specialty,
    subspecialty: body.subspecialty,
    region: body.region,
    sourceRole: body.sourceRole,
    sourceName: body.sourceName,
    signalCategory: body.signalCategory,
    observedBarrier: body.observedBarrier,
    rawFieldFeedback: body.rawFieldFeedback,
    beliefShiftRisk: body.beliefShiftRisk,
    messageMismatchRisk: body.messageMismatchRisk,
    accessRisk: body.accessRisk,
    competitiveRisk: body.competitiveRisk,
    urgencyScore: body.urgencyScore,
    credibilityScore: body.credibilityScore,
    frequencyScore: body.frequencyScore,
    potentialImpact: body.potentialImpact,
    totalSignalScore: totalScore,
    ciosSignalDirection: body.ciosSignalDirection,
    suggestedRoute: body.suggestedRoute,
    fieldActionNeeded: body.fieldActionNeeded,
    notes: body.notes,
  }).returning();
  res.status(201).json(created);
});

export default router;
