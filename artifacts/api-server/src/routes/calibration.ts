import { Router } from "express";
import { db } from "@workspace/db";
import { calibrationLogTable, lrCorrectionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const router = Router();

const MIN_SAMPLE_FOR_CORRECTION = 5;
const CORRECTION_THRESHOLD = 0.10; // 10pp systematic error triggers correction
const MAX_CORRECTION = 0.20;       // cap at ±20% per application

// ── Exported helper: returns { signalType -> correctionFactor } map ──────────
export async function getLrCorrections(): Promise<Record<string, number>> {
  const rows = await db.select().from(lrCorrectionsTable);
  const map: Record<string, number> = {};
  for (const row of rows) {
    map[row.signalType] = row.correctionFactor;
  }
  return map;
}

// ── Internal: recompute corrections from calibrated cases ────────────────────
async function computeAndSaveCorrections(): Promise<{
  updated: string[];
  skipped: string[];
}> {
  const rows = await db.select().from(calibrationLogTable);
  const calibrated = rows.filter((r) => r.observedOutcome !== null && r.snapshotJson);

  const typeMap: Record<string, number[]> = {};

  for (const row of calibrated) {
    let snapshot: any;
    try { snapshot = JSON.parse(row.snapshotJson!); } catch { continue; }
    const signalDetails: any[] = snapshot.signalDetails ?? [];
    const activeTypes = [...new Set(
      signalDetails.map((s: any) => s.signalType as string).filter(Boolean)
    )];
    for (const st of activeTypes) {
      if (!typeMap[st]) typeMap[st] = [];
      typeMap[st].push(row.forecastError!);
    }
  }

  const updated: string[] = [];
  const skipped: string[] = [];

  for (const [signalType, errors] of Object.entries(typeMap)) {
    if (errors.length < MIN_SAMPLE_FOR_CORRECTION) {
      skipped.push(`${signalType} (n=${errors.length} < ${MIN_SAMPLE_FOR_CORRECTION})`);
      continue;
    }

    const meanError = errors.reduce((s, e) => s + e, 0) / errors.length;

    if (Math.abs(meanError) < CORRECTION_THRESHOLD) {
      skipped.push(`${signalType} (error=${(meanError * 100).toFixed(1)}pp < threshold)`);
      continue;
    }

    // Correction direction:
    // - Overforecast (meanError < 0): reduce LR → correctionFactor < 1
    // - Underforecast (meanError > 0): increase LR → correctionFactor > 1
    const rawAdjustment = meanError * 0.5; // half of observed error as correction
    const clampedAdj = Math.max(-MAX_CORRECTION, Math.min(MAX_CORRECTION, rawAdjustment));
    const correctionFactor = Number((1 + clampedAdj).toFixed(4));

    const direction = meanError > 0 ? "underforecast" : "overforecast";
    const reason = `${signalType}: ${direction} by ${(Math.abs(meanError) * 100).toFixed(1)}pp ` +
      `across ${errors.length} calibrated cases. ` +
      `Correction factor ${correctionFactor} applied (${clampedAdj >= 0 ? "+" : ""}${(clampedAdj * 100).toFixed(1)}% LR adjustment).`;

    // Upsert: delete existing then insert new correction
    await db.delete(lrCorrectionsTable).where(eq(lrCorrectionsTable.signalType, signalType));
    await db.insert(lrCorrectionsTable).values({
      id: randomUUID(),
      signalType,
      correctionFactor,
      sampleSize: errors.length,
      meanForecastError: Number(meanError.toFixed(4)),
      direction,
      appliedAt: new Date(),
      reason,
    });

    updated.push(signalType);
  }

  return { updated, skipped };
}

router.get("/calibration", async (_req, res) => {
  const rows = await db.select().from(calibrationLogTable).orderBy(calibrationLogTable.predictionDate);
  res.json(rows.map(mapEntry));
});

router.post("/calibration/:forecastId/outcome", async (req, res) => {
  const body = req.body;
  const observed = body.observedOutcome;
  const existing = await db.select().from(calibrationLogTable)
    .where(eq(calibrationLogTable.forecastId, req.params.forecastId)).limit(1);
  if (!existing[0]) return res.status(404).json({ error: "Forecast not found" });

  const brierComponent = Math.pow(existing[0].predictedProbability - observed, 2);
  const forecastError = observed - existing[0].predictedProbability;

  const [updated] = await db.update(calibrationLogTable)
    .set({
      observedOutcome: observed,
      brierComponent,
      forecastError,
      notes: body.notes || existing[0].notes,
      userFeedback: body.userFeedback,
      reviewerComments: body.reviewerComments,
    })
    .where(eq(calibrationLogTable.forecastId, req.params.forecastId))
    .returning();

  // Auto-trigger correction recomputation after each new outcome
  computeAndSaveCorrections().catch((err) =>
    console.warn("[calibration] correction auto-compute failed:", err)
  );

  res.json(mapEntry(updated));
});

router.get("/calibration/stats", async (_req, res) => {
  const rows = await db.select().from(calibrationLogTable);
  const calibrated = rows.filter((r) => r.observedOutcome !== null);

  const meanBrier = calibrated.length > 0
    ? calibrated.reduce((s, r) => s + (r.brierComponent ?? 0), 0) / calibrated.length
    : null;
  const meanError = calibrated.length > 0
    ? calibrated.reduce((s, r) => s + (r.forecastError ?? 0), 0) / calibrated.length
    : null;

  const bands = [
    { label: "0–0.2", min: 0, max: 0.2 },
    { label: "0.2–0.4", min: 0.2, max: 0.4 },
    { label: "0.4–0.6", min: 0.4, max: 0.6 },
    { label: "0.6–0.8", min: 0.6, max: 0.8 },
    { label: "0.8–1.0", min: 0.8, max: 1.0 },
  ];

  const bandStats = bands.map((b) => {
    const inBand = calibrated.filter(
      (r) => r.predictedProbability >= b.min && r.predictedProbability < b.max
    );
    const meanPred = inBand.length > 0
      ? inBand.reduce((s, r) => s + r.predictedProbability, 0) / inBand.length
      : null;
    const meanAct = inBand.length > 0
      ? inBand.reduce((s, r) => s + (r.observedOutcome ?? 0), 0) / inBand.length
      : null;
    return { band: b.label, count: inBand.length, meanPredicted: meanPred, meanActual: meanAct };
  });

  res.json({
    totalForecasts: rows.length,
    calibratedForecasts: calibrated.length,
    meanBrierScore: meanBrier,
    meanForecastError: meanError,
    bandStats,
  });
});

router.get("/calibration/error-patterns", async (_req, res) => {
  const rows = await db.select().from(calibrationLogTable);
  const calibrated = rows.filter((r) => r.observedOutcome !== null && r.snapshotJson);

  const typeMap: Record<string, { errors: number[]; briers: number[] }> = {};
  const actorMap: Record<string, { errors: number[]; briers: number[] }> = {};

  for (const row of calibrated) {
    let snapshot: any;
    try { snapshot = JSON.parse(row.snapshotJson!); } catch { continue; }

    const signalDetails: any[] = snapshot.signalDetails ?? [];
    const activeTypes = [...new Set(
      signalDetails.map((s: any) => s.signalType as string)
        .filter((t): t is string => Boolean(t) && t !== "Unknown")
    )];
    for (const st of activeTypes) {
      if (!typeMap[st]) typeMap[st] = { errors: [], briers: [] };
      typeMap[st].errors.push(row.forecastError!);
      typeMap[st].briers.push(row.brierComponent!);
    }

    const actors: any[] = snapshot.actorAggregation ?? [];
    for (const a of actors) {
      if (!a.actor || Math.abs(a.netActorEffect ?? 0) < 0.05) continue;
      if (!actorMap[a.actor]) actorMap[a.actor] = { errors: [], briers: [] };
      actorMap[a.actor].errors.push(row.forecastError!);
      actorMap[a.actor].briers.push(row.brierComponent!);
    }
  }

  const toPattern = (
    name: string,
    data: { errors: number[]; briers: number[] },
    category: "signal_type" | "actor"
  ) => {
    const n = data.errors.length;
    const meanError = data.errors.reduce((s, e) => s + e, 0) / n;
    const meanBrier = data.briers.reduce((s, b) => s + b, 0) / n;
    return {
      name,
      category,
      sampleSize: n,
      meanError: Number(meanError.toFixed(4)),
      meanBrierScore: Number(meanBrier.toFixed(4)),
      bias: meanError > 0.05 ? "under" as const : meanError < -0.05 ? "over" as const : "balanced" as const,
    };
  };

  const signalPatterns = Object.entries(typeMap)
    .map(([name, data]) => toPattern(name, data, "signal_type"))
    .sort((a, b) => Math.abs(b.meanError) - Math.abs(a.meanError));

  const actorPatterns = Object.entries(actorMap)
    .map(([name, data]) => toPattern(name, data, "actor"))
    .sort((a, b) => Math.abs(b.meanError) - Math.abs(a.meanError));

  res.json({ signalPatterns, actorPatterns, calibratedCount: calibrated.length });
});

// ── LR Corrections audit trail ───────────────────────────────────────────────
router.get("/calibration/lr-corrections", async (_req, res) => {
  const rows = await db.select().from(lrCorrectionsTable)
    .orderBy(lrCorrectionsTable.appliedAt);
  res.json({
    corrections: rows.map((r) => ({
      signalType: r.signalType,
      correctionFactor: r.correctionFactor,
      sampleSize: r.sampleSize,
      meanForecastError: r.meanForecastError,
      direction: r.direction,
      appliedAt: r.appliedAt,
      reason: r.reason,
      status: r.sampleSize >= MIN_SAMPLE_FOR_CORRECTION ? "active" : "pending_threshold",
      thresholdRequired: MIN_SAMPLE_FOR_CORRECTION,
    })),
    thresholdRequired: MIN_SAMPLE_FOR_CORRECTION,
    errorThreshold: CORRECTION_THRESHOLD,
  });
});

// ── Manual trigger: recompute all corrections ────────────────────────────────
router.post("/calibration/compute-corrections", async (_req, res) => {
  try {
    const result = await computeAndSaveCorrections();
    res.json({
      message: "Corrections recomputed.",
      updated: result.updated,
      skipped: result.skipped,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

function mapEntry(r: typeof calibrationLogTable.$inferSelect) {
  return {
    id: r.id,
    forecastId: r.forecastId,
    caseId: r.caseId,
    predictionDate: r.predictionDate,
    predictedProbability: r.predictedProbability,
    observedOutcome: r.observedOutcome,
    brierComponent: r.brierComponent,
    forecastError: r.forecastError,
    notes: r.notes,
    userFeedback: r.userFeedback,
    reviewerComments: r.reviewerComments,
    hasSnapshot: Boolean(r.snapshotJson),
  };
}

export default router;
