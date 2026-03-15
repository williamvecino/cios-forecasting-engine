import { Router } from "express";
import { db } from "@workspace/db";
import { scenariosTable, casesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const router = Router();

router.get("/scenarios", async (req, res) => {
  const caseId = req.query.caseId as string | undefined;
  const query = db.select().from(scenariosTable);
  const rows = caseId
    ? await query.where(eq(scenariosTable.caseId, caseId))
    : await query;
  res.json(rows);
});

router.post("/scenarios", async (req, res) => {
  const body = req.body;
  const caseRow = await db.select().from(casesTable).where(eq(casesTable.caseId, body.caseId)).limit(1);
  const currentProb = caseRow[0]?.currentProbability ?? caseRow[0]?.priorProbability ?? 0.5;

  const direction = body.direction === "Positive" ? 1 : -1;
  const newProbability = Math.max(0, Math.min(1, currentProb + direction * Math.abs(body.estimatedImpact)));

  const [created] = await db.insert(scenariosTable).values({
    id: randomUUID(),
    scenarioId: `SCN-${Date.now()}`,
    caseId: body.caseId,
    hypotheticalSignal: body.hypotheticalSignal,
    direction: body.direction,
    estimatedImpact: body.estimatedImpact,
    newProbability,
    notes: body.notes,
  }).returning();
  res.status(201).json(created);
});

export default router;
