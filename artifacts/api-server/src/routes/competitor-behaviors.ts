import { Router } from "express";
import { db, competitorBehaviorsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";

const VALID_STATUSES = ["Proposed", "Monitoring", "Confirmed", "Closed"] as const;

const VALID_BEHAVIOR_TYPES = [
  "TrialAcceleration",
  "RegulatoryDelay",
  "PricingShift",
  "ContractingExpansion",
  "LabelExpansion",
  "ManufacturingConstraint",
  "CommercialScaleUp",
  "SupportProgramExpansion",
  "EvidenceStrategyShift",
] as const;

const router = Router();

router.get("/competitor-behaviors", async (_req, res) => {
  const entries = await db
    .select()
    .from(competitorBehaviorsTable)
    .orderBy(desc(competitorBehaviorsTable.createdAt));
  res.json(entries);
});

router.get("/competitor-behaviors/:behaviorId", async (req, res) => {
  const rows = await db
    .select()
    .from(competitorBehaviorsTable)
    .where(eq(competitorBehaviorsTable.behaviorId, req.params.behaviorId))
    .limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Behavior record not found" });
  res.json(rows[0]);
});

router.get("/cases/:caseId/competitor-behaviors", async (req, res) => {
  const entries = await db
    .select()
    .from(competitorBehaviorsTable)
    .where(eq(competitorBehaviorsTable.relatedCaseId, req.params.caseId))
    .orderBy(desc(competitorBehaviorsTable.createdAt));
  res.json(entries);
});

router.post("/competitor-behaviors", async (req, res) => {
  const body = req.body;

  if (!body.competitorName || !body.assetName || !body.behaviorType) {
    return res.status(400).json({ error: "competitorName, assetName, and behaviorType are required" });
  }

  if (!VALID_BEHAVIOR_TYPES.includes(body.behaviorType)) {
    return res.status(400).json({ error: `Invalid behaviorType. Must be one of: ${VALID_BEHAVIOR_TYPES.join(", ")}` });
  }

  const status = VALID_STATUSES.includes(body.status) ? body.status : "Proposed";
  const likelihood = body.likelihoodEstimate != null
    ? Math.max(0, Math.min(1, Number(body.likelihoodEstimate)))
    : null;

  const [entry] = await db.insert(competitorBehaviorsTable).values({
    id: randomUUID(),
    behaviorId: `CB-${Date.now()}`,
    competitorName: body.competitorName,
    assetName: body.assetName,
    behaviorType: body.behaviorType,
    behaviorDescription: body.behaviorDescription || null,
    likelihoodEstimate: likelihood,
    strategicImpact: body.strategicImpact || null,
    expectedTiming: body.expectedTiming || null,
    relatedCaseId: body.relatedCaseId || null,
    sourceBasis: body.sourceBasis || null,
    status,
    notes: body.notes || null,
  }).returning();

  res.status(201).json(entry);
});

router.patch("/competitor-behaviors/:behaviorId", async (req, res) => {
  const { behaviorId } = req.params;
  const body = req.body;

  const rows = await db
    .select()
    .from(competitorBehaviorsTable)
    .where(eq(competitorBehaviorsTable.behaviorId, behaviorId))
    .limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Behavior record not found" });

  if (body.behaviorType && !VALID_BEHAVIOR_TYPES.includes(body.behaviorType)) {
    return res.status(400).json({ error: `Invalid behaviorType. Must be one of: ${VALID_BEHAVIOR_TYPES.join(", ")}` });
  }

  const updates: Record<string, any> = { updatedAt: new Date() };
  if (body.competitorName) updates.competitorName = body.competitorName;
  if (body.assetName) updates.assetName = body.assetName;
  if (body.behaviorType) updates.behaviorType = body.behaviorType;
  if (body.behaviorDescription !== undefined) updates.behaviorDescription = body.behaviorDescription;
  if (body.likelihoodEstimate !== undefined) {
    updates.likelihoodEstimate = body.likelihoodEstimate != null
      ? Math.max(0, Math.min(1, Number(body.likelihoodEstimate)))
      : null;
  }
  if (body.strategicImpact !== undefined) updates.strategicImpact = body.strategicImpact;
  if (body.expectedTiming !== undefined) updates.expectedTiming = body.expectedTiming;
  if (body.relatedCaseId !== undefined) updates.relatedCaseId = body.relatedCaseId;
  if (body.sourceBasis !== undefined) updates.sourceBasis = body.sourceBasis;
  if (body.status && VALID_STATUSES.includes(body.status)) updates.status = body.status;
  if (body.notes !== undefined) updates.notes = body.notes;

  const [updated] = await db
    .update(competitorBehaviorsTable)
    .set(updates)
    .where(eq(competitorBehaviorsTable.behaviorId, behaviorId))
    .returning();

  res.json(updated);
});

router.delete("/competitor-behaviors/:behaviorId", async (req, res) => {
  const { behaviorId } = req.params;
  const rows = await db
    .select()
    .from(competitorBehaviorsTable)
    .where(eq(competitorBehaviorsTable.behaviorId, behaviorId))
    .limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Behavior record not found" });

  await db.delete(competitorBehaviorsTable).where(eq(competitorBehaviorsTable.behaviorId, behaviorId));
  res.json({ deleted: true, behaviorId });
});

export default router;
