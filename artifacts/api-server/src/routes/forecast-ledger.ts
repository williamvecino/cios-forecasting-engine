import { Router } from "express";
import { db, forecastLedgerTable, casesTable } from "@workspace/db";
import { eq, desc, and, isNotNull, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

const router = Router();

function computeCalibrationBucket(probability: number): string {
  const pct = probability * 100;
  const lower = Math.floor(pct / 10) * 10;
  const upper = lower + 10;
  return `${lower}–${upper}%`;
}

function computeBrierScore(predicted: number, outcome: number): number {
  return Number(Math.pow(predicted - outcome, 2).toFixed(6));
}

router.get("/forecast-ledger", async (_req, res) => {
  const entries = await db
    .select()
    .from(forecastLedgerTable)
    .orderBy(desc(forecastLedgerTable.forecastDate));
  res.json(entries);
});

router.get("/forecast-ledger/entry/:predictionId", async (req, res) => {
  const rows = await db
    .select()
    .from(forecastLedgerTable)
    .where(eq(forecastLedgerTable.predictionId, req.params.predictionId))
    .limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Ledger entry not found" });
  res.json(rows[0]);
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

router.get("/cases/:caseId/forecast-ledger", async (req, res) => {
  const entries = await db
    .select()
    .from(forecastLedgerTable)
    .where(eq(forecastLedgerTable.caseId, req.params.caseId))
    .orderBy(desc(forecastLedgerTable.updateVersion));
  res.json(entries);
});

router.get("/cases/:caseId/forecast-ledger/latest", async (req, res) => {
  const rows = await db
    .select()
    .from(forecastLedgerTable)
    .where(eq(forecastLedgerTable.caseId, req.params.caseId))
    .orderBy(desc(forecastLedgerTable.updateVersion))
    .limit(1);
  if (!rows[0]) return res.status(404).json({ error: "No ledger entries for this case" });
  res.json(rows[0]);
});

router.post("/cases/:caseId/record-forecast", async (req, res) => {
  const { caseId } = req.params;
  const { timeHorizon, expectedResolutionDate, rationale } = req.body as {
    timeHorizon?: string;
    expectedResolutionDate?: string;
    rationale?: string;
  };

  const caseRows = await db.select().from(casesTable).where(eq(casesTable.caseId, caseId)).limit(1);
  if (!caseRows[0]) return res.status(404).json({ error: "Case not found" });
  const caseData = caseRows[0];

  if (caseData.currentProbability == null) {
    return res.status(400).json({ error: "No forecast available for this case. Run a forecast first." });
  }

  const prevVersionRows = await db.select({ updateVersion: forecastLedgerTable.updateVersion, predictionId: forecastLedgerTable.predictionId })
    .from(forecastLedgerTable)
    .where(eq(forecastLedgerTable.caseId, caseId))
    .orderBy(desc(forecastLedgerTable.updateVersion))
    .limit(1);
  const nextVersion = (prevVersionRows[0]?.updateVersion ?? 0) + 1;
  const previousPredictionId = prevVersionRows[0]?.predictionId ?? null;

  const predictionId = `PRED-${Date.now()}`;
  const forecastProbability = caseData.currentProbability;
  const bucket = computeCalibrationBucket(forecastProbability);

  const [entry] = await db.insert(forecastLedgerTable).values({
    id: randomUUID(),
    predictionId,
    caseId,
    strategicQuestion: caseData.strategicQuestion ?? "Unspecified question",
    decisionDomain: caseData.therapeuticArea ?? null,
    forecastProbability,
    forecastDate: new Date(),
    timeHorizon: timeHorizon || caseData.timeHorizon || "12 months",
    expectedResolutionDate: expectedResolutionDate ? new Date(expectedResolutionDate) : null,
    priorProbability: caseData.priorProbability,
    confidenceLevel: caseData.confidenceLevel,
    updateVersion: nextVersion,
    previousPredictionId,
    updateRationale: rationale || (nextVersion === 1 ? "Initial forecast" : null),
    resolutionStatus: "open",
    calibrationBucket: bucket,
  }).returning();

  res.status(201).json(entry);
});

router.patch("/forecast-ledger/:predictionId/resolve", async (req, res) => {
  const { predictionId } = req.params;
  const { resolutionStatus, resolvedOutcome, resolutionDate } = req.body as {
    resolutionStatus: string;
    resolvedOutcome?: number;
    resolutionDate?: string;
  };

  const validStatuses = ["resolved_true", "resolved_false", "partially_resolved", "not_resolvable"];
  if (!validStatuses.includes(resolutionStatus)) {
    return res.status(400).json({ error: `resolutionStatus must be one of: ${validStatuses.join(", ")}` });
  }

  if (resolutionStatus === "partially_resolved") {
    if (resolvedOutcome === undefined || resolvedOutcome === null) {
      return res.status(400).json({ error: "resolvedOutcome is required for partially_resolved status" });
    }
    const num = Number(resolvedOutcome);
    if (!Number.isFinite(num) || num < 0 || num > 1) {
      return res.status(400).json({ error: "resolvedOutcome must be a finite number between 0 and 1" });
    }
  }

  const rows = await db
    .select()
    .from(forecastLedgerTable)
    .where(eq(forecastLedgerTable.predictionId, predictionId))
    .limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Ledger entry not found" });

  const entry = rows[0];

  let actualOutcome: number | null = null;
  if (resolutionStatus === "resolved_true") actualOutcome = 1;
  else if (resolutionStatus === "resolved_false") actualOutcome = 0;
  else if (resolutionStatus === "partially_resolved") actualOutcome = Number(resolvedOutcome);

  let brierScore: number | null = null;
  let predictionError: number | null = null;
  if (actualOutcome !== null) {
    brierScore = computeBrierScore(entry.forecastProbability, actualOutcome);
    predictionError = Number(Math.abs(entry.forecastProbability - actualOutcome).toFixed(6));
  }

  const [updated] = await db
    .update(forecastLedgerTable)
    .set({
      resolutionStatus,
      resolvedOutcome: actualOutcome,
      actualOutcome,
      resolutionDate: resolutionDate ? new Date(resolutionDate) : new Date(),
      brierScore,
      predictionError,
      updatedAt: new Date(),
    })
    .where(eq(forecastLedgerTable.predictionId, predictionId))
    .returning();

  res.json(updated);
});

router.patch("/forecast-ledger/:predictionId/rationale", async (req, res) => {
  const { predictionId } = req.params;
  const { rationale } = req.body as { rationale: string };

  if (!rationale || rationale.trim().length === 0) {
    return res.status(400).json({ error: "Rationale is required" });
  }

  const [updated] = await db
    .update(forecastLedgerTable)
    .set({ updateRationale: rationale.trim(), updatedAt: new Date() })
    .where(eq(forecastLedgerTable.predictionId, predictionId))
    .returning();

  if (!updated) return res.status(404).json({ error: "Ledger entry not found" });
  res.json(updated);
});

router.get("/forecast-ledger/calibration/summary", async (_req, res) => {
  const allResolved = await db
    .select()
    .from(forecastLedgerTable)
    .where(isNotNull(forecastLedgerTable.brierScore));

  if (allResolved.length === 0) {
    return res.json({
      totalResolved: 0,
      meanBrierScore: null,
      calibrationBuckets: [],
    });
  }

  const meanBrier = allResolved.reduce((sum, e) => sum + (e.brierScore ?? 0), 0) / allResolved.length;

  const bucketMap = new Map<string, { count: number; totalBrier: number; sumPredicted: number; sumActual: number }>();
  for (const e of allResolved) {
    const bucket = e.calibrationBucket ?? "unknown";
    if (!bucketMap.has(bucket)) bucketMap.set(bucket, { count: 0, totalBrier: 0, sumPredicted: 0, sumActual: 0 });
    const b = bucketMap.get(bucket)!;
    b.count++;
    b.totalBrier += e.brierScore ?? 0;
    b.sumPredicted += e.forecastProbability;
    b.sumActual += e.actualOutcome ?? 0;
  }

  const calibrationBuckets = Array.from(bucketMap.entries()).map(([bucket, data]) => ({
    bucket,
    count: data.count,
    meanBrierScore: Number((data.totalBrier / data.count).toFixed(4)),
    meanPredicted: Number((data.sumPredicted / data.count).toFixed(4)),
    meanActual: Number((data.sumActual / data.count).toFixed(4)),
  })).sort((a, b) => a.bucket.localeCompare(b.bucket));

  res.json({
    totalResolved: allResolved.length,
    meanBrierScore: Number(meanBrier.toFixed(4)),
    calibrationBuckets,
  });
});

router.get("/cases/:caseId/forecast-ledger/calibration", async (req, res) => {
  const resolved = await db
    .select()
    .from(forecastLedgerTable)
    .where(and(
      eq(forecastLedgerTable.caseId, req.params.caseId),
      isNotNull(forecastLedgerTable.brierScore)
    ));

  if (resolved.length === 0) {
    return res.json({ totalResolved: 0, meanBrierScore: null });
  }

  const meanBrier = resolved.reduce((sum, e) => sum + (e.brierScore ?? 0), 0) / resolved.length;
  res.json({
    totalResolved: resolved.length,
    meanBrierScore: Number(meanBrier.toFixed(4)),
  });
});

export default router;
