import { Router } from "express";
import { db, forecastLedgerTable, casesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { ResolveOutcomeRequest } from "@workspace/contracts";

const router = Router();

function computeCalibrationBucket(probability: number): string {
  const pct = probability * 100;
  const lower = Math.floor(pct / 10) * 10;
  const upper = lower + 10;
  return `${lower}–${upper}%`;
}

router.get("/forecast-ledger", async (_req, res) => {
  const entries = await db
    .select()
    .from(forecastLedgerTable)
    .orderBy(desc(forecastLedgerTable.forecastDate));
  res.json(entries);
});

router.get("/forecast-ledger/:predictionId", async (req, res) => {
  const rows = await db
    .select()
    .from(forecastLedgerTable)
    .where(eq(forecastLedgerTable.predictionId, req.params.predictionId))
    .limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Ledger entry not found" });
  res.json(rows[0]);
});

router.post("/cases/:caseId/record-forecast", async (req, res) => {
  const { caseId } = req.params;
  const { timeHorizon, expectedResolutionDate } = req.body as {
    timeHorizon: string;
    expectedResolutionDate?: string;
  };

  const caseRows = await db.select().from(casesTable).where(eq(casesTable.caseId, caseId)).limit(1);
  if (!caseRows[0]) return res.status(404).json({ error: "Case not found" });
  const caseData = caseRows[0];

  if (caseData.currentProbability == null) {
    return res.status(400).json({ error: "No forecast available for this case. Run a forecast first." });
  }

  const predictionId = `PRED-${Date.now()}`;
  const forecastProbability = caseData.currentProbability;
  const bucket = computeCalibrationBucket(forecastProbability);

  const [entry] = await db.insert(forecastLedgerTable).values({
    id: randomUUID(),
    predictionId,
    caseId,
    strategicQuestion: caseData.strategicQuestion,
    forecastProbability,
    forecastDate: new Date(),
    timeHorizon: timeHorizon || caseData.timeHorizon || "12 months",
    expectedResolutionDate: expectedResolutionDate ? new Date(expectedResolutionDate) : null,
    calibrationBucket: bucket,
  }).returning();

  res.status(201).json(entry);
});

router.patch("/forecast-ledger/:predictionId/resolve", async (req, res) => {
  const { predictionId } = req.params;
  const { actualOutcome, resolutionDate } = req.body as ResolveOutcomeRequest;

  if (actualOutcome !== 0 && actualOutcome !== 1) {
    return res.status(400).json({ error: "actualOutcome must be 0 or 1" });
  }

  const rows = await db
    .select()
    .from(forecastLedgerTable)
    .where(eq(forecastLedgerTable.predictionId, predictionId))
    .limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Ledger entry not found" });

  const entry = rows[0];
  const predictionError = Math.abs(entry.forecastProbability - actualOutcome);

  const [updated] = await db
    .update(forecastLedgerTable)
    .set({
      actualOutcome,
      resolutionDate: resolutionDate ? new Date(resolutionDate) : new Date(),
      predictionError,
      updatedAt: new Date(),
    })
    .where(eq(forecastLedgerTable.predictionId, predictionId))
    .returning();

  res.json(updated);
});

router.get("/cases/:caseId/forecast-ledger", async (req, res) => {
  const entries = await db
    .select()
    .from(forecastLedgerTable)
    .where(eq(forecastLedgerTable.caseId, req.params.caseId))
    .orderBy(desc(forecastLedgerTable.forecastDate));
  res.json(entries);
});

export default router;
