import { Router } from "express";
import { db } from "@workspace/db";
import { caseLibraryTable, casesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { retrieveAnalogs } from "../lib/analog-engine.js";

const router = Router();

router.get("/case-library", async (_req, res) => {
  const rows = await db.select().from(caseLibraryTable).orderBy(caseLibraryTable.createdAt);
  res.json(rows);
});

router.post("/case-library", async (req, res) => {
  const body = req.body;
  const [created] = await db.insert(caseLibraryTable).values({
    id: randomUUID(),
    caseId: body.caseId || `ANALOG-${Date.now()}`,
    therapyArea: body.therapyArea,
    productType: body.productType,
    specialty: body.specialty,
    evidenceType: body.evidenceType,
    lifecycleStage: body.lifecycleStage,
    actorMix: body.actorMix,
    marketAccessConditions: body.marketAccessConditions,
    outcomePattern: body.outcomePattern,
    adoptionTrajectory: body.adoptionTrajectory,
    keyInflectionSignals: body.keyInflectionSignals,
    finalObservedOutcome: body.finalObservedOutcome,
    finalProbability: body.finalProbability,
    notes: body.notes,
  }).returning();
  res.status(201).json(created);
});

router.put("/case-library/:analogId", async (req, res) => {
  const body = req.body;
  const [updated] = await db.update(caseLibraryTable)
    .set({
      therapyArea: body.therapyArea,
      productType: body.productType,
      specialty: body.specialty,
      evidenceType: body.evidenceType,
      lifecycleStage: body.lifecycleStage,
      actorMix: body.actorMix,
      marketAccessConditions: body.marketAccessConditions,
      outcomePattern: body.outcomePattern,
      adoptionTrajectory: body.adoptionTrajectory,
      keyInflectionSignals: body.keyInflectionSignals,
      finalObservedOutcome: body.finalObservedOutcome,
      finalProbability: body.finalProbability,
      notes: body.notes,
    })
    .where(eq(caseLibraryTable.id, req.params.analogId))
    .returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

router.delete("/case-library/:analogId", async (req, res) => {
  await db.delete(caseLibraryTable).where(eq(caseLibraryTable.id, req.params.analogId));
  res.status(204).send();
});

router.get("/cases/:caseId/analogs", async (req, res) => {
  const caseRow = await db.select().from(casesTable).where(eq(casesTable.caseId, req.params.caseId)).limit(1);
  const library = await db.select().from(caseLibraryTable);

  const row = caseRow[0] as any;
  const query = {
    therapyArea: row?.therapeuticArea || row?.primaryBrand,
    specialty: row?.specialty || row?.primarySpecialtyProfile,
    productType: row?.assetType || "Medication",
    evidenceType: "Phase 3 RCT",
    specialtyProfile: row?.primarySpecialtyProfile,
    payerEnvironment: row?.payerEnvironment ?? undefined,
    primaryBrand: (row?.assetName || row?.primaryBrand) ?? undefined,
  };

  const matches = retrieveAnalogs(query, library, 5);
  res.json(matches);
});

export default router;
