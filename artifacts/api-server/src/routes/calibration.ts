import { Router } from "express";
import { db } from "@workspace/db";
import { calibrationLogTable, lrCorrectionsTable, bucketCorrectionsTable, casesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { enrichCalibrationWithMetadata, deriveQuestionType } from "../lib/case-context.js";

const router = Router();

const MIN_SAMPLE_FOR_CORRECTION = 5;
const CORRECTION_THRESHOLD = 0.10;
const MAX_CORRECTION = 0.20;

const MIN_BUCKET_SAMPLE = 3;
const BUCKET_THRESHOLD = 0.08;
const MAX_BUCKET_CORRECTION_PP = 0.15;

// ── Probability buckets ──────────────────────────────────────────────────────
const BUCKETS = [
  { label: "0.40-0.60", min: 0.40, max: 0.60 },
  { label: "0.60-0.75", min: 0.60, max: 0.75 },
  { label: "0.75-0.90", min: 0.75, max: 0.90 },
  { label: "0.90+",     min: 0.90, max: 1.01 },
];

export function getBucket(p: number): string | null {
  const b = BUCKETS.find((bk) => p >= bk.min && p < bk.max);
  return b ? b.label : null;
}

// ── Exported helper: { signalType -> correctionFactor } ─────────────────────
export async function getLrCorrections(): Promise<Record<string, number>> {
  const rows = await db.select().from(lrCorrectionsTable);
  const map: Record<string, number> = {};
  for (const row of rows) {
    map[row.signalType] = row.correctionFactor;
  }
  return map;
}

// ── Exported helper: { bucket -> correctionPp } ──────────────────────────────
export async function getBucketCorrections(): Promise<Record<string, number>> {
  const rows = await db.select().from(bucketCorrectionsTable);
  const map: Record<string, number> = {};
  for (const row of rows) {
    map[row.bucket] = row.correctionPp ?? 0;
  }
  return map;
}

// ── Internal: recompute signal-type LR corrections ──────────────────────────
async function computeAndSaveLrCorrections(): Promise<{ updated: string[]; skipped: string[] }> {
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
    const rawAdj = meanError * 0.5;
    const clampedAdj = Math.max(-MAX_CORRECTION, Math.min(MAX_CORRECTION, rawAdj));
    const correctionFactor = Number((1 + clampedAdj).toFixed(4));
    const direction = meanError > 0 ? "underforecast" : "overforecast";
    const reason = `${signalType}: ${direction} by ${(Math.abs(meanError) * 100).toFixed(1)}pp across ${errors.length} cases. Factor ${correctionFactor} applied.`;

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

// ── Internal: recompute bucket probability corrections (with guardrails) ─────
async function computeAndSaveBucketCorrections(): Promise<{ updated: string[]; skipped: string[] }> {
  const rows = await db.select().from(calibrationLogTable);
  const calibrated = rows.filter((r) => r.observedOutcome !== null);

  // Load existing bucket rows for flip detection
  const existingBucketRows = await db.select().from(bucketCorrectionsTable);
  const existingByBucket: Record<string, typeof existingBucketRows[0]> = {};
  for (const row of existingBucketRows) {
    existingByBucket[row.bucket] = row;
  }

  const updated: string[] = [];
  const skipped: string[] = [];

  for (const bk of BUCKETS) {
    const inBucket = calibrated
      .filter((r) => r.predictedProbability >= bk.min && r.predictedProbability < bk.max)
      .sort((a, b) => new Date(b.predictionDate!).getTime() - new Date(a.predictionDate!).getTime());

    if (inBucket.length < MIN_BUCKET_SAMPLE) {
      skipped.push(`${bk.label} (n=${inBucket.length} < ${MIN_BUCKET_SAMPLE})`);
      continue;
    }

    // Recency-weighted mean: exp(−0.1 × rank), rank 0 = most recent
    const DECAY = 0.1;
    let weightedSum = 0;
    let weightTotal = 0;
    for (let i = 0; i < inBucket.length; i++) {
      const w = Math.exp(-DECAY * i);
      weightedSum += (inBucket[i].forecastError ?? 0) * w;
      weightTotal += w;
    }
    const meanError = weightedSum / weightTotal;
    const meanAbsoluteError = inBucket.reduce((s, r) => s + Math.abs(r.forecastError ?? 0), 0) / inBucket.length;

    if (Math.abs(meanError) < BUCKET_THRESHOLD) {
      skipped.push(`${bk.label} (meanError=${(meanError * 100).toFixed(1)}pp < ${BUCKET_THRESHOLD * 100}pp threshold)`);
      continue;
    }

    const rawCorrPp = meanError * 0.5;
    const correctionPp = Number(
      Math.max(-MAX_BUCKET_CORRECTION_PP, Math.min(MAX_BUCKET_CORRECTION_PP, rawCorrPp)).toFixed(4)
    );

    const direction = meanError > 0 ? "underforecast" : "overforecast";

    // Guardrails: flip detection + warnings
    const existing = existingByBucket[bk.label];
    const previousDirection = existing?.direction ?? null;
    const flipped = previousDirection !== null && previousDirection !== direction;
    const flipCount = (existing?.flipCount ?? 0) + (flipped ? 1 : 0);
    const lowSampleWarning = inBucket.length < 5;
    const directionFlipWarning = flipped;

    const reason =
      `Bucket ${bk.label}: ${direction} by ${(Math.abs(meanError) * 100).toFixed(1)}pp ` +
      `across ${inBucket.length} cases (recency-weighted). ` +
      `Adjustment ${correctionPp >= 0 ? "+" : ""}${(correctionPp * 100).toFixed(1)}pp applied.` +
      (directionFlipWarning ? ` ⚠ Direction flipped from ${previousDirection}.` : "") +
      (lowSampleWarning ? ` ⚠ Low sample size (n=${inBucket.length}).` : "");

    await db.delete(bucketCorrectionsTable).where(eq(bucketCorrectionsTable.bucket, bk.label));
    await db.insert(bucketCorrectionsTable).values({
      id: randomUUID(),
      bucket: bk.label,
      correctionPp,
      sampleSize: inBucket.length,
      meanForecastError: Number(meanError.toFixed(4)),
      meanAbsoluteError: Number(meanAbsoluteError.toFixed(4)),
      direction,
      previousDirection,
      flipCount,
      lowSampleWarning,
      directionFlipWarning,
      recencyWeighted: true,
      appliedAt: new Date(),
      reason,
    });
    updated.push(bk.label);
  }

  return { updated, skipped };
}

// ── Combined auto-trigger (both correction types) ───────────────────────────
async function computeAndSaveCorrections(): Promise<{
  lr: { updated: string[]; skipped: string[] };
  bucket: { updated: string[]; skipped: string[] };
}> {
  const [lr, bucket] = await Promise.all([
    computeAndSaveLrCorrections(),
    computeAndSaveBucketCorrections(),
  ]);
  return { lr, bucket };
}

// ── Routes ───────────────────────────────────────────────────────────────────

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
    { label: "0–0.2",  min: 0,   max: 0.2 },
    { label: "0.2–0.4",min: 0.2, max: 0.4 },
    { label: "0.4–0.6",min: 0.4, max: 0.6 },
    { label: "0.6–0.8",min: 0.6, max: 0.8 },
    { label: "0.8–1.0",min: 0.8, max: 1.0 },
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

router.get("/calibration/lr-corrections", async (_req, res) => {
  const rows = await db.select().from(lrCorrectionsTable).orderBy(lrCorrectionsTable.appliedAt);
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

router.get("/calibration/bucket-corrections", async (_req, res) => {
  const rows = await db.select().from(bucketCorrectionsTable).orderBy(bucketCorrectionsTable.bucket);
  res.json({
    corrections: rows.map((r) => ({
      bucket: r.bucket,
      correctionPp: r.correctionPp,
      sampleSize: r.sampleSize,
      meanForecastError: r.meanForecastError,
      direction: r.direction,
      appliedAt: r.appliedAt,
      reason: r.reason,
      status: r.sampleSize >= MIN_BUCKET_SAMPLE ? "active" : "pending_threshold",
    })),
    thresholdRequired: MIN_BUCKET_SAMPLE,
    errorThreshold: BUCKET_THRESHOLD,
    maxCorrectionPp: MAX_BUCKET_CORRECTION_PP,
    buckets: BUCKETS.map((b) => b.label),
  });
});

// ── Diagnostics: full bucket + pre/post calibration inspection ───────────────
router.get("/calibration/diagnostics", async (_req, res) => {
  const [calRows, bucketRows, lrRows] = await Promise.all([
    db.select().from(calibrationLogTable),
    db.select().from(bucketCorrectionsTable),
    db.select().from(lrCorrectionsTable),
  ]);
  const calibrated = calRows.filter((r) => r.observedOutcome !== null);

  // Per-bucket breakdown
  const bucketByLabel: Record<string, typeof bucketRows[0]> = {};
  for (const r of bucketRows) bucketByLabel[r.bucket] = r;

  const bucketDiagnostics = BUCKETS.map((bk) => {
    const inBucket = calibrated.filter(
      (r) => r.predictedProbability >= bk.min && r.predictedProbability < bk.max
    );
    const stored = bucketByLabel[bk.label];
    const isActive = stored && Math.abs(stored.correctionPp ?? 0) > 0;
    const sampleSize = inBucket.length;
    const meanSignedError = sampleSize > 0
      ? inBucket.reduce((s, r) => s + (r.forecastError ?? 0), 0) / sampleSize
      : null;
    const meanAbsoluteError = sampleSize > 0
      ? inBucket.reduce((s, r) => s + Math.abs(r.forecastError ?? 0), 0) / sampleSize
      : null;

    return {
      bucket: bk.label,
      sampleSize,
      meanSignedError: meanSignedError !== null ? Number(meanSignedError.toFixed(4)) : null,
      meanAbsoluteError: meanAbsoluteError !== null ? Number(meanAbsoluteError.toFixed(4)) : null,
      correctionAppliedPp: stored?.correctionPp ?? null,
      direction: stored?.direction ?? null,
      lastUpdated: stored?.appliedAt ?? null,
      isActive: isActive ?? false,
      belowThreshold: !isActive && sampleSize >= MIN_BUCKET_SAMPLE,
      warnings: {
        lowSample: stored?.lowSampleWarning ?? (sampleSize < 5 && sampleSize >= MIN_BUCKET_SAMPLE),
        directionFlip: stored?.directionFlipWarning ?? false,
        flipCount: stored?.flipCount ?? 0,
        pendingThreshold: sampleSize < MIN_BUCKET_SAMPLE,
      },
      recencyWeighted: stored?.recencyWeighted ?? false,
    };
  });

  // Aggregate pre-calibration vs post-calibration (cases that have outcomes)
  let totalRawError = 0, totalCalibError = 0, count = 0;
  const caseLevel = calibrated.map((r) => {
    const bucket = getBucket(r.predictedProbability);
    const bucketCorrPp = bucket ? (bucketByLabel[bucket]?.correctionPp ?? 0) : 0;
    const calibrated_prob = Math.max(0.01, Math.min(0.99, r.predictedProbability + bucketCorrPp));
    const rawErr = (r.observedOutcome ?? 0) - r.predictedProbability;
    const calibErr = (r.observedOutcome ?? 0) - calibrated_prob;
    totalRawError += rawErr;
    totalCalibError += calibErr;
    count++;
    return {
      caseId: r.caseId,
      bucket,
      preCalibratedProbability: r.predictedProbability,
      bucketCorrectionPp: bucketCorrPp,
      postCalibratedProbability: Number(calibrated_prob.toFixed(4)),
      actual: r.observedOutcome,
      rawError: Number(rawErr.toFixed(4)),
      calibratedError: Number(calibErr.toFixed(4)),
    };
  });

  res.json({
    bucketDiagnostics,
    caseLevel,
    aggregate: {
      calibratedCaseCount: count,
      meanRawError: count > 0 ? Number((totalRawError / count).toFixed(4)) : null,
      meanCalibratedError: count > 0 ? Number((totalCalibError / count).toFixed(4)) : null,
      absoluteDeltaMean: count > 0 ? Number((Math.abs(totalCalibError / count) - Math.abs(totalRawError / count)).toFixed(4)) : null,
    },
    guardrailConfig: {
      minBucketSample: MIN_BUCKET_SAMPLE,
      errorThreshold: BUCKET_THRESHOLD,
      maxCorrectionPp: MAX_BUCKET_CORRECTION_PP,
      recencyDecayLambda: 0.1,
    },
    lrCorrectionsActive: lrRows.length,
    generatedAt: new Date().toISOString(),
  });
});

// ── Validation Report: structured raw vs calibrated vs actual ────────────────
router.get("/calibration/validation-report", async (_req, res) => {
  const [calRows, bucketRows] = await Promise.all([
    db.select().from(calibrationLogTable),
    db.select().from(bucketCorrectionsTable),
  ]);
  const calibratedRaw = calRows.filter((r) => r.observedOutcome !== null);
  // Enrich every row with case metadata (joins cases table for historical rows)
  const enriched = await enrichCalibrationWithMetadata(calibratedRaw);

  const bucketByLabel: Record<string, typeof bucketRows[0]> = {};
  for (const r of bucketRows) bucketByLabel[r.bucket] = r;

  const cases = enriched.map((r) => {
    const bucket = getBucket(r.predictedProbability);
    const bucketCorrPp = bucket ? (bucketByLabel[bucket]?.correctionPp ?? 0) : 0;
    const calibratedProb = Math.max(0.01, Math.min(0.99, r.predictedProbability + bucketCorrPp));
    const actual = r.observedOutcome!;
    const rawError = actual - r.predictedProbability;
    const calibError = actual - calibratedProb;
    const improved = Math.abs(calibError) < Math.abs(rawError);

    return {
      caseId: r.caseId,
      therapyArea: r.therapeuticArea ?? null,
      diseaseState: r.diseaseState ?? null,
      specialty: r.specialty ?? null,
      questionType: r.questionType,
      caseMode: r.caseMode,
      bucket,
      rawProbability: r.predictedProbability,
      calibratedProbability: Number(calibratedProb.toFixed(4)),
      actual,
      rawError: Number(rawError.toFixed(4)),
      calibratedError: Number(calibError.toFixed(4)),
      bucketCorrectionPp: bucketCorrPp,
      improved,
      predictionDate: r.predictionDate,
    };
  });

  // Helper: summary stats for a group of cases
  function groupStats(group: typeof cases) {
    if (group.length === 0) return null;
    const meanRaw = group.reduce((s, c) => s + c.rawError, 0) / group.length;
    const meanCalib = group.reduce((s, c) => s + c.calibratedError, 0) / group.length;
    const meanAbsRaw = group.reduce((s, c) => s + Math.abs(c.rawError), 0) / group.length;
    const meanAbsCalib = group.reduce((s, c) => s + Math.abs(c.calibratedError), 0) / group.length;
    const improvementCount = group.filter((c) => c.improved).length;
    const improvePct = improvementCount / group.length;
    const improvementPp = (meanAbsRaw - meanAbsCalib) * 100;
    return {
      n: group.length,
      meanRawError: Number(meanRaw.toFixed(4)),
      meanCalibratedError: Number(meanCalib.toFixed(4)),
      meanAbsRawError: Number(meanAbsRaw.toFixed(4)),
      meanAbsCalibratedError: Number(meanAbsCalib.toFixed(4)),
      improvementRate: Number(improvePct.toFixed(3)),
      improvementPp: Number(improvementPp.toFixed(2)),
      verdict: Math.abs(meanCalib) < Math.abs(meanRaw) ? "improving" : "degrading",
    };
  }

  // Bucket-level summary
  const bucketSummary = BUCKETS.map((bk) => {
    const inBucket = cases.filter((c) => c.bucket === bk.label);
    if (inBucket.length === 0) return { bucket: bk.label, n: 0 };
    return { bucket: bk.label, ...groupStats(inBucket) };
  });

  // Therapy area breakout (now real data from metadata join)
  const taMap: Record<string, typeof cases> = {};
  for (const c of cases) {
    const ta = c.therapyArea ?? "Unknown";
    if (!taMap[ta]) taMap[ta] = [];
    taMap[ta].push(c);
  }
  const therapyAreaBreakout = Object.entries(taMap).map(([ta, taCases]) => ({
    therapyArea: ta,
    ...groupStats(taCases),
  })).sort((a: any, b: any) => b.n - a.n);

  // Question type breakout
  const qtMap: Record<string, typeof cases> = {};
  for (const c of cases) {
    const qt = c.questionType ?? "other";
    if (!qtMap[qt]) qtMap[qt] = [];
    qtMap[qt].push(c);
  }
  const questionTypeBreakout = Object.entries(qtMap).map(([qt, qtCases]) => ({
    questionType: qt,
    ...groupStats(qtCases),
  })).sort((a: any, b: any) => b.n - a.n);

  // Overall verdict with segmentation analysis
  const totalAbsRaw = cases.reduce((s, c) => s + Math.abs(c.rawError), 0);
  const totalAbsCalib = cases.reduce((s, c) => s + Math.abs(c.calibratedError), 0);
  const overallVerdict = cases.length < 4
    ? "insufficient_data"
    : totalAbsCalib < totalAbsRaw ? "improving" : "degrading";

  // Detect mixed behavior: some therapy areas improving, some degrading
  const taVerdicts = therapyAreaBreakout.filter((t: any) => (t.n ?? 0) >= 2).map((t: any) => t.verdict);
  const hasMixedBehavior = taVerdicts.includes("improving") && taVerdicts.includes("degrading");
  const segmentedVerdict = cases.length < 4
    ? "insufficient_segmented_data"
    : hasMixedBehavior
    ? "mixed"
    : overallVerdict === "improving" ? "broadly_improving" : "broadly_degrading";

  // Coverage check
  const moderateCases = cases.filter((c) => c.bucket === "0.60-0.75" || c.bucket === "0.40-0.60");
  const highConfCases = cases.filter((c) => c.bucket === "0.75-0.90" || c.bucket === "0.90+");
  const psychiatryCases = cases.filter((c) =>
    (c.therapyArea ?? "").toLowerCase().includes("psychiatry") ||
    (c.specialty ?? "").toLowerCase().includes("psychiatry") ||
    (c.diseaseState ?? "").toLowerCase().includes("psychiatry")
  );
  const cardiologyCases = cases.filter((c) =>
    (c.therapyArea ?? "").toLowerCase().includes("cardio") ||
    (c.specialty ?? "").toLowerCase().includes("cardio")
  );

  res.json({
    cases,
    bucketSummary,
    therapyAreaBreakout,
    questionTypeBreakout,
    coverageCheck: {
      moderateCases: moderateCases.length,
      highConfCases: highConfCases.length,
      psychiatryCases: psychiatryCases.length,
      cardiologyCases: cardiologyCases.length,
      meetsRequirements: moderateCases.length >= 2 && highConfCases.length >= 2,
    },
    overall: {
      n: cases.length,
      meanAbsRawError: cases.length > 0 ? Number((totalAbsRaw / cases.length).toFixed(4)) : null,
      meanAbsCalibratedError: cases.length > 0 ? Number((totalAbsCalib / cases.length).toFixed(4)) : null,
      verdict: overallVerdict,
      segmentedVerdict,
      mixedBehaviorDetected: hasMixedBehavior,
    },
    generatedAt: new Date().toISOString(),
  });
});

// ── Coverage Map: system maturity grid by bucket × therapy area ──────────────
router.get("/calibration/coverage-map", async (_req, res) => {
  const [calRows, bucketRows] = await Promise.all([
    db.select().from(calibrationLogTable),
    db.select().from(bucketCorrectionsTable),
  ]);
  const calibratedRaw = calRows.filter((r) => r.observedOutcome !== null);
  const enriched = await enrichCalibrationWithMetadata(calibratedRaw);
  const allCases = await enrichCalibrationWithMetadata(calRows); // includes unresolved

  const bucketByLabel: Record<string, typeof bucketRows[0]> = {};
  for (const r of bucketRows) bucketByLabel[r.bucket] = r;

  // Unique therapy areas (resolved cases only)
  const therapyAreas = [...new Set(enriched.map((r) => r.therapeuticArea ?? "Unknown"))].sort();

  // Unique question types (resolved)
  const questionTypes = [...new Set(enriched.map((r) => r.questionType))].sort();

  // Build grid: rows = therapyAreas, cols = buckets
  function cellStats(rows: typeof enriched, bucketLabel: string) {
    const bk = BUCKETS.find((b) => b.label === bucketLabel)!;
    const inCell = rows.filter(
      (r) => r.predictedProbability >= bk.min && r.predictedProbability < bk.max
    );
    const resolvedCount = inCell.filter((r) => r.observedOutcome !== null).length;
    const storedBucket = bucketByLabel[bucketLabel];
    const correctionActive = storedBucket && Math.abs(storedBucket.correctionPp ?? 0) > 0;
    const lowSampleWarning = storedBucket?.lowSampleWarning ?? (resolvedCount > 0 && resolvedCount < 5);
    return {
      n: resolvedCount,
      correctionActive: correctionActive ?? false,
      lowSampleWarning: lowSampleWarning ?? false,
      bucketThresholdMet: resolvedCount >= 3,
      maturity: resolvedCount >= 10 ? "high" : resolvedCount >= 5 ? "medium" : resolvedCount >= 3 ? "low" : "none" as string,
    };
  }

  const byTherapyArea = therapyAreas.map((ta) => {
    const taRows = enriched.filter((r) => (r.therapeuticArea ?? "Unknown") === ta);
    return {
      therapyArea: ta,
      buckets: BUCKETS.reduce((acc, bk) => {
        acc[bk.label] = cellStats(taRows, bk.label);
        return acc;
      }, {} as Record<string, ReturnType<typeof cellStats>>),
      totalResolved: taRows.length,
    };
  });

  const byQuestionType = questionTypes.map((qt) => {
    const qtRows = enriched.filter((r) => r.questionType === qt);
    return {
      questionType: qt,
      buckets: BUCKETS.reduce((acc, bk) => {
        acc[bk.label] = cellStats(qtRows, bk.label);
        return acc;
      }, {} as Record<string, ReturnType<typeof cellStats>>),
      totalResolved: qtRows.length,
    };
  });

  // Global row (all cases)
  const globalBuckets = BUCKETS.reduce((acc, bk) => {
    acc[bk.label] = cellStats(enriched, bk.label);
    return acc;
  }, {} as Record<string, ReturnType<typeof cellStats>>);

  res.json({
    buckets: BUCKETS.map((b) => b.label),
    globalRow: { label: "All cases", buckets: globalBuckets, totalResolved: enriched.length },
    byTherapyArea,
    byQuestionType,
    totalResolvedCases: enriched.length,
    totalForecasts: calRows.length,
    generatedAt: new Date().toISOString(),
  });
});

router.post("/calibration/compute-corrections", async (_req, res) => {
  try {
    const result = await computeAndSaveCorrections();
    res.json({
      message: "Corrections recomputed.",
      lr: result.lr,
      bucket: result.bucket,
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
