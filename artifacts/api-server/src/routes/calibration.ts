import { Router } from "express";
import { db } from "@workspace/db";
import { calibrationLogTable, lrCorrectionsTable, bucketCorrectionsTable, casesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { enrichCalibrationWithMetadata, deriveQuestionType } from "../lib/case-context.js";
import { getBucket, getLrCorrections, getBucketCorrections, BUCKETS } from "../lib/calibration-utils.js";

const router = Router();

const MIN_SAMPLE_FOR_CORRECTION = 5;
const CORRECTION_THRESHOLD = 0.10;
const MAX_CORRECTION = 0.20;

const MIN_BUCKET_SAMPLE = 3;
const BUCKET_THRESHOLD = 0.08;
const MAX_BUCKET_CORRECTION_PP = 0.15;

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

// ── Expansion Targets: highest-priority case-library gaps ────────────────────
router.get("/calibration/expansion-targets", async (_req, res) => {
  const [calRows] = await Promise.all([
    db.select().from(calibrationLogTable),
  ]);

  // Enrich ALL rows (resolved + unresolved) with metadata
  const enriched = await enrichCalibrationWithMetadata(calRows);

  // ── By therapy area ───────────────────────────────────────────────────────
  const taMap: Record<string, { total: number; resolved: number }> = {};
  for (const r of enriched) {
    const ta = r.therapeuticArea ?? "Unknown";
    if (!taMap[ta]) taMap[ta] = { total: 0, resolved: 0 };
    taMap[ta].total++;
    if (r.observedOutcome !== null) taMap[ta].resolved++;
  }

  const byTherapyArea = Object.entries(taMap)
    .map(([ta, s]) => ({
      therapyArea: ta,
      totalForecasts: s.total,
      resolvedCases: s.resolved,
      unresolvedCases: s.total - s.resolved,
      gapScore: s.total > 0 ? Number(((s.total - s.resolved) / s.total).toFixed(2)) : 1,
    }))
    .filter((x) => x.unresolvedCases > 0)
    .sort((a, b) => b.unresolvedCases - a.unresolvedCases || b.gapScore - a.gapScore)
    .slice(0, 10);

  // ── By probability bucket ─────────────────────────────────────────────────
  const bucketMapData: Record<string, { total: number; resolved: number }> = {};
  for (const bk of BUCKETS) bucketMapData[bk.label] = { total: 0, resolved: 0 };
  for (const r of enriched) {
    const bk = BUCKETS.find((b) => r.predictedProbability >= b.min && r.predictedProbability < b.max);
    if (!bk) continue;
    bucketMapData[bk.label].total++;
    if (r.observedOutcome !== null) bucketMapData[bk.label].resolved++;
  }

  const byBucket = Object.entries(bucketMapData)
    .map(([bk, s]) => ({
      bucket: bk,
      totalForecasts: s.total,
      resolvedCases: s.resolved,
      unresolvedCases: s.total - s.resolved,
      gapScore: s.total > 0 ? Number(((s.total - s.resolved) / s.total).toFixed(2)) : 1,
    }))
    .sort((a, b) => b.unresolvedCases - a.unresolvedCases || b.gapScore - a.gapScore);

  // ── By question type ──────────────────────────────────────────────────────
  const qtMap: Record<string, { total: number; resolved: number }> = {};
  for (const r of enriched) {
    const qt = r.questionType ?? "other";
    if (!qtMap[qt]) qtMap[qt] = { total: 0, resolved: 0 };
    qtMap[qt].total++;
    if (r.observedOutcome !== null) qtMap[qt].resolved++;
  }

  const byQuestionType = Object.entries(qtMap)
    .map(([qt, s]) => ({
      questionType: qt,
      totalForecasts: s.total,
      resolvedCases: s.resolved,
      unresolvedCases: s.total - s.resolved,
      gapScore: s.total > 0 ? Number(((s.total - s.resolved) / s.total).toFixed(2)) : 1,
    }))
    .filter((x) => x.unresolvedCases > 0)
    .sort((a, b) => b.unresolvedCases - a.unresolvedCases || b.gapScore - a.gapScore);

  const totalResolved = enriched.filter((r) => r.observedOutcome !== null).length;
  const totalForecasts = enriched.length;
  const criticalGaps = [
    ...byTherapyArea.filter((x) => x.resolvedCases === 0),
    ...byBucket.filter((x) => x.resolvedCases === 0),
    ...byQuestionType.filter((x) => x.resolvedCases === 0),
  ].length;

  res.json({
    byTherapyArea,
    byBucket,
    byQuestionType,
    summary: {
      totalForecasts,
      totalResolved,
      totalUnresolved: totalForecasts - totalResolved,
      criticalGaps,
      resolutionRate: totalForecasts > 0
        ? Number((totalResolved / totalForecasts).toFixed(2))
        : 0,
    },
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

// ── Canonical question-type definitions ──────────────────────────────────────
const CANONICAL_QUESTION_TYPES = [
  {
    type: "adoption_probability",
    label: "Adoption Probability",
    description: "Will this product be adopted? Probability of reaching a defined uptake level.",
    keywords: ["probability", "likely", "will", "adoption"],
  },
  {
    type: "threshold_achievement",
    label: "Threshold Achievement",
    description: "Will the product reach a specific numeric target (e.g., ≥20% share, ≥50 prescribers)?",
    keywords: ["target", "threshold", "achieve", "reach", "≥", ">="],
  },
  {
    type: "competitive_comparison",
    label: "Competitive Comparison",
    description: "How does this product compare to a competitor or class alternative?",
    keywords: ["compared to", "versus", "vs.", "competitive"],
  },
  {
    type: "market_share",
    label: "Market Share",
    description: "What share of the addressable market will this product capture?",
    keywords: ["market share", "share of"],
  },
  {
    type: "time_to_adoption",
    label: "Time to Adoption",
    description: "How quickly will adoption occur? Includes timeline and milestone questions.",
    keywords: ["time to", "within", "months", "quarters"],
  },
  {
    type: "specialty_penetration",
    label: "Specialty Penetration",
    description: "How deeply will adoption penetrate a specific prescriber specialty?",
    keywords: ["penetrat", "specialist", "prescrib"],
  },
  {
    type: "other",
    label: "Other / Unclassified",
    description: "Questions that do not match a canonical type. Review for reclassification.",
    keywords: [],
  },
] as const;

const OVERCONCENTRATION_THRESHOLD = 0.60;
const OVERCONCENTRATION_MIN_RESOLVED = 5;

// ── 1. Case Acquisition Planner ───────────────────────────────────────────────
router.get("/calibration/acquisition-plan", async (_req, res) => {
  const calRows = await db.select().from(calibrationLogTable);
  const enriched = await enrichCalibrationWithMetadata(calRows);

  const resolved = enriched.filter((r) => r.observedOutcome !== null);
  const totalForecasts = enriched.length;

  // ── Per-segment scoring ──────────────────────────────────────────────────
  type AcqEntry = {
    dimension: "therapy_area" | "bucket" | "question_type";
    key: string;
    label: string;
    totalForecasts: number;
    resolvedCases: number;
    unresolvedCases: number;
    gapScore: number;
    priority: "critical" | "high" | "medium" | "normal";
    urgencyMultiplier: number;
    coverageMultiplier: number;
    acquisitionScore: number;
    whyItMatters: string;
    casesNeededForThreshold: number;
    casesNeededForMediumConfidence: number;
    expectedImpact: string;
  };

  const maxForecasts = Math.max(totalForecasts, 1);

  function scoreEntry(n: number, total: number): Pick<AcqEntry, "priority" | "urgencyMultiplier" | "acquisitionScore" | "coverageMultiplier"> {
    const urgencyMultiplier =
      n === 0 ? 3.0 :
      n <= 2  ? 2.0 :
      n <= 4  ? 1.5 : 1.0;
    const priority: AcqEntry["priority"] =
      n === 0 ? "critical" :
      n <= 2  ? "high" :
      n <= 4  ? "medium" : "normal";
    const coverageMultiplier = total / maxForecasts;
    const unresolvedCount = total - n;
    const acquisitionScore = Number((unresolvedCount * urgencyMultiplier * coverageMultiplier).toFixed(4));
    return { priority, urgencyMultiplier, coverageMultiplier, acquisitionScore };
  }

  function impactText(n: number, addNeededForThreshold: number, addNeededForMedium: number): string {
    if (n === 0) return "First resolved case will establish a calibration anchor — any correction better than none";
    if (addNeededForThreshold > 0) return `Adding ${addNeededForThreshold} case(s) reaches the local correction threshold — enables active bias correction`;
    if (addNeededForMedium > 0) return `Already at correction threshold — ${addNeededForMedium} more case(s) reaches medium confidence (n≥5, stable direction)`;
    return "At medium confidence — further cases improve correction stability and move toward high confidence (n≥5 + stable direction)";
  }

  const entries: AcqEntry[] = [];

  // ── Therapy areas ──────────────────────────────────────────────────────────
  const taMap: Record<string, { total: number; resolved: number }> = {};
  for (const r of enriched) {
    const ta = r.therapeuticArea ?? "Unknown";
    if (!taMap[ta]) taMap[ta] = { total: 0, resolved: 0 };
    taMap[ta].total++;
    if (r.observedOutcome !== null) taMap[ta].resolved++;
  }
  for (const [ta, s] of Object.entries(taMap)) {
    if (s.total - s.resolved === 0) continue;
    const sc = scoreEntry(s.resolved, s.total);
    const needed = Math.max(0, 3 - s.resolved);
    const neededMed = Math.max(0, 5 - s.resolved);
    const gapScore = Number(((s.total - s.resolved) / s.total).toFixed(2));
    entries.push({
      dimension: "therapy_area",
      key: ta,
      label: ta,
      totalForecasts: s.total,
      resolvedCases: s.resolved,
      unresolvedCases: s.total - s.resolved,
      gapScore,
      ...sc,
      whyItMatters: s.resolved === 0
        ? `No resolved cases in ${ta} — the calibration engine has no local signal here and falls to global defaults`
        : `Only ${s.resolved} resolved case(s) in ${ta} — below the ${3}-case local correction threshold; bias corrections unavailable`,
      casesNeededForThreshold: needed,
      casesNeededForMediumConfidence: neededMed,
      expectedImpact: impactText(s.resolved, needed, neededMed),
    });
  }

  // ── Probability buckets ────────────────────────────────────────────────────
  const bucketMapData: Record<string, { total: number; resolved: number }> = {};
  for (const bk of BUCKETS) bucketMapData[bk.label] = { total: 0, resolved: 0 };
  for (const r of enriched) {
    const bk = BUCKETS.find((b) => r.predictedProbability >= b.min && r.predictedProbability < b.max);
    if (!bk) continue;
    bucketMapData[bk.label].total++;
    if (r.observedOutcome !== null) bucketMapData[bk.label].resolved++;
  }
  for (const [bk, s] of Object.entries(bucketMapData)) {
    if (s.total - s.resolved === 0) continue;
    const sc = scoreEntry(s.resolved, s.total);
    const needed = Math.max(0, 3 - s.resolved);
    const neededMed = Math.max(0, 5 - s.resolved);
    const gapScore = s.total > 0 ? Number(((s.total - s.resolved) / s.total).toFixed(2)) : 1;
    entries.push({
      dimension: "bucket",
      key: bk,
      label: `Probability bucket ${bk}`,
      totalForecasts: s.total,
      resolvedCases: s.resolved,
      unresolvedCases: s.total - s.resolved,
      gapScore,
      ...sc,
      whyItMatters: s.resolved === 0
        ? `Zero resolved cases in the ${bk} bucket — all ${s.total} active forecast(s) here lack any calibration baseline`
        : `Only ${s.resolved} resolved case(s) in bucket ${bk} — global bucket correction is the only available signal; local segment inactive`,
      casesNeededForThreshold: needed,
      casesNeededForMediumConfidence: neededMed,
      expectedImpact: impactText(s.resolved, needed, neededMed),
    });
  }

  // ── Question types ─────────────────────────────────────────────────────────
  const qtMap: Record<string, { total: number; resolved: number }> = {};
  for (const r of enriched) {
    const qt = r.questionType ?? "other";
    if (!qtMap[qt]) qtMap[qt] = { total: 0, resolved: 0 };
    qtMap[qt].total++;
    if (r.observedOutcome !== null) qtMap[qt].resolved++;
  }
  for (const [qt, s] of Object.entries(qtMap)) {
    if (s.total - s.resolved === 0) continue;
    const canon = CANONICAL_QUESTION_TYPES.find((c) => c.type === qt);
    const sc = scoreEntry(s.resolved, s.total);
    const needed = Math.max(0, 3 - s.resolved);
    const neededMed = Math.max(0, 5 - s.resolved);
    const gapScore = s.total > 0 ? Number(((s.total - s.resolved) / s.total).toFixed(2)) : 1;
    entries.push({
      dimension: "question_type",
      key: qt,
      label: canon?.label ?? qt,
      totalForecasts: s.total,
      resolvedCases: s.resolved,
      unresolvedCases: s.total - s.resolved,
      gapScore,
      ...sc,
      whyItMatters: s.resolved === 0
        ? `No resolved cases for "${canon?.label ?? qt}" questions — this question pattern cannot be calibrated at all`
        : `Only ${s.resolved} resolved case(s) for "${canon?.label ?? qt}" questions — correction threshold not met`,
      casesNeededForThreshold: needed,
      casesNeededForMediumConfidence: neededMed,
      expectedImpact: impactText(s.resolved, needed, neededMed),
    });
  }

  // Sort by acquisitionScore desc, then priority ascending
  const priorityOrder = { critical: 0, high: 1, medium: 2, normal: 3 };
  entries.sort((a, b) =>
    priorityOrder[a.priority] - priorityOrder[b.priority] ||
    b.acquisitionScore - a.acquisitionScore
  );

  const ranked = entries.map((e, i) => ({ rank: i + 1, ...e }));

  const criticalCount = ranked.filter((e) => e.priority === "critical").length;
  const highCount = ranked.filter((e) => e.priority === "high").length;

  res.json({
    plan: ranked,
    summary: {
      totalEntries: ranked.length,
      criticalCount,
      highCount,
      totalResolved: resolved.length,
      totalForecasts,
    },
    generatedAt: new Date().toISOString(),
  });
});

// ── 2. Question-Type Taxonomy Hardening ───────────────────────────────────────
router.get("/calibration/question-type-taxonomy", async (_req, res) => {
  const calRows = await db.select().from(calibrationLogTable);
  const enriched = await enrichCalibrationWithMetadata(calRows);

  const resolved = enriched.filter((r) => r.observedOutcome !== null);
  const totalResolved = resolved.length;
  const totalAll = enriched.length;

  // Count per type — include ALL canonical types even if count=0
  const countMap: Record<string, { total: number; resolved: number }> = {};
  for (const c of CANONICAL_QUESTION_TYPES) countMap[c.type] = { total: 0, resolved: 0 };

  for (const r of enriched) {
    const qt = r.questionType ?? "other";
    if (!countMap[qt]) countMap[qt] = { total: 0, resolved: 0 };
    countMap[qt].total++;
    if (r.observedOutcome !== null) countMap[qt].resolved++;
  }

  // Overconcentration: one type >60% of resolved cases (when n_resolved ≥ 5)
  const overconcentrated = totalResolved >= OVERCONCENTRATION_MIN_RESOLVED
    ? Object.entries(countMap)
        .filter(([, s]) => totalResolved > 0 && s.resolved / totalResolved > OVERCONCENTRATION_THRESHOLD)
        .map(([qt]) => qt)
    : [];

  const types = CANONICAL_QUESTION_TYPES.map((canon) => {
    const s = countMap[canon.type] ?? { total: 0, resolved: 0 };
    const resolvedShare = totalResolved > 0 ? Number((s.resolved / totalResolved).toFixed(3)) : 0;
    const resolutionRate = s.total > 0 ? Number((s.resolved / s.total).toFixed(2)) : 0;
    const isOverconcentrated = overconcentrated.includes(canon.type);
    const meetsThreshold = s.resolved >= 3;
    const meetsMediumConfidence = s.resolved >= 5;

    return {
      type: canon.type,
      label: canon.label,
      description: canon.description,
      totalForecasts: s.total,
      resolvedCases: s.resolved,
      resolvedShare,
      resolutionRate,
      meetsThreshold,
      meetsMediumConfidence,
      isOverconcentrated,
      statusNote: isOverconcentrated
        ? `⚠ Overconcentrated — ${(resolvedShare * 100).toFixed(0)}% of resolved cases. Diversify to other question types for robust cross-type calibration.`
        : s.resolved === 0
          ? "No resolved cases — unclassifiable pattern cannot be calibrated"
          : s.resolved < 3
            ? `${s.resolved} resolved case(s) — below local correction threshold (need ${3 - s.resolved} more)`
            : s.resolved < 5
              ? `At correction threshold — ${5 - s.resolved} more case(s) to medium confidence`
              : "Sufficient for calibration",
    };
  });

  // Any forecasts with uncategorised question types not in canonical list
  const unknownTypes = Object.keys(countMap).filter(
    (qt) => !CANONICAL_QUESTION_TYPES.find((c) => c.type === qt)
  );

  res.json({
    types,
    unknownTypes,
    overconcentrated,
    overconcentrationThreshold: OVERCONCENTRATION_THRESHOLD,
    summary: {
      totalForecasts: totalAll,
      totalResolved,
      typesWithResolvedCases: types.filter((t) => t.resolvedCases > 0).length,
      typesAtThreshold: types.filter((t) => t.meetsThreshold).length,
      typesAtMediumConfidence: types.filter((t) => t.meetsMediumConfidence).length,
      hasOverconcentration: overconcentrated.length > 0,
    },
    generatedAt: new Date().toISOString(),
  });
});

// ── 3. Resolved-Case Ingestion Workflow ───────────────────────────────────────
router.post("/calibration/resolved-cases", async (req, res) => {
  const {
    predictedProbability,
    observedOutcome,
    therapeuticArea,
    questionType,
    caseMode = "live",
    diseaseState = null,
    specialty = null,
    notes = null,
    predictionDate = null,
  } = req.body as {
    predictedProbability: number;
    observedOutcome: number;
    therapeuticArea: string;
    questionType: string;
    caseMode?: "demo" | "live";
    diseaseState?: string | null;
    specialty?: string | null;
    notes?: string | null;
    predictionDate?: string | null;
  };

  // Validate required fields
  if (
    typeof predictedProbability !== "number" ||
    predictedProbability < 0 || predictedProbability > 1
  ) {
    return res.status(400).json({ error: "predictedProbability must be a number between 0 and 1" });
  }
  if (
    typeof observedOutcome !== "number" ||
    observedOutcome < 0 || observedOutcome > 1
  ) {
    return res.status(400).json({ error: "observedOutcome must be a number between 0 and 1" });
  }
  if (!therapeuticArea || typeof therapeuticArea !== "string") {
    return res.status(400).json({ error: "therapeuticArea is required" });
  }
  if (!questionType || typeof questionType !== "string") {
    return res.status(400).json({ error: "questionType is required" });
  }

  const canonTypes = CANONICAL_QUESTION_TYPES.map((c) => c.type) as string[];
  if (!canonTypes.includes(questionType)) {
    return res.status(400).json({
      error: `questionType must be one of: ${canonTypes.join(", ")}`,
    });
  }

  // Derived values
  const forecastError = Number((observedOutcome - predictedProbability).toFixed(8));
  const brierComponent = Number(Math.pow(predictedProbability - observedOutcome, 2).toFixed(8));
  const bucket = getBucket(predictedProbability);

  const id = randomUUID();
  const forecastId = `INGEST-${Date.now()}-${id.slice(0, 8)}`;
  const caseId = `INGESTED-${id.slice(0, 8)}`;

  // Build snapshotJson so enrichCalibrationWithMetadata can read metadata
  // without needing a corresponding casesTable row
  const snapshotJson = JSON.stringify({
    _ingested: true,
    _caseContext: {
      therapeuticArea,
      diseaseState: diseaseState ?? undefined,
      specialty: specialty ?? undefined,
      caseMode,
      strategicQuestion: null,
      questionType,
    },
  });

  const insertData: {
    id: string;
    forecastId: string;
    caseId: string;
    predictedProbability: number;
    observedOutcome: number;
    forecastError: number;
    brierComponent: number;
    notes: string | null;
    snapshotJson: string;
    predictionDate?: Date;
  } = {
    id,
    forecastId,
    caseId,
    predictedProbability,
    observedOutcome,
    forecastError,
    brierComponent,
    notes: notes ?? null,
    snapshotJson,
  };

  if (predictionDate) {
    const parsed = new Date(predictionDate);
    if (!isNaN(parsed.getTime())) {
      insertData.predictionDate = parsed;
    }
  }

  await db.insert(calibrationLogTable).values(insertData as any);

  // Recompute corrections to incorporate the new data point
  try {
    await computeAndSaveCorrections();
  } catch (_e) {
    // Non-fatal — row is inserted; corrections will recompute on next scheduled run
  }

  res.status(201).json({
    id,
    forecastId,
    caseId,
    predictedProbability,
    observedOutcome,
    forecastError,
    brierComponent,
    bucket,
    therapeuticArea,
    questionType,
    caseMode,
    message: "Resolved case ingested and calibration corrections recomputed.",
  });
});

// ── 4. Learning Impact Simulation ─────────────────────────────────────────────
router.post("/calibration/impact-simulation", async (req, res) => {
  const {
    therapyArea,
    bucket,
    questionType,
    additionalCases,
    assumedMeanError = null,
  } = req.body as {
    therapyArea: string;
    bucket: string;
    questionType: string;
    additionalCases: number;
    assumedMeanError?: number | null;
  };

  if (!therapyArea || !bucket || !questionType) {
    return res.status(400).json({ error: "therapyArea, bucket, and questionType are required" });
  }
  if (typeof additionalCases !== "number" || additionalCases < 1 || additionalCases > 50) {
    return res.status(400).json({ error: "additionalCases must be between 1 and 50" });
  }

  const calRows = await db.select().from(calibrationLogTable);
  const enriched = await enrichCalibrationWithMetadata(calRows);

  // Current state: resolved cases in this local segment (therapyArea × bucket)
  const bk = BUCKETS.find((b) => b.label === bucket);
  const localSegment = enriched.filter(
    (r) =>
      r.observedOutcome !== null &&
      r.therapeuticArea === therapyArea &&
      bk &&
      r.predictedProbability >= bk.min &&
      r.predictedProbability < bk.max
  );

  // Current state: resolved cases in global bucket (all therapy areas)
  const globalBucket = enriched.filter(
    (r) =>
      r.observedOutcome !== null &&
      bk &&
      r.predictedProbability >= bk.min &&
      r.predictedProbability < bk.max
  );

  const currentLocalN = localSegment.length;
  const currentGlobalN = globalBucket.length;

  const MIN_LOCAL_N = 3;
  const LOCAL_ERROR_THRESHOLD = 0.08;
  const HIGH_CONFIDENCE_N = 5;

  // Determine current fallback level
  function getFallbackLevel(localN: number, localMeanError: number | null, globalN: number): string {
    if (localN >= MIN_LOCAL_N && localMeanError !== null && Math.abs(localMeanError) > LOCAL_ERROR_THRESHOLD) {
      return "local_segment";
    }
    if (globalN >= MIN_LOCAL_N) return "global_bucket";
    return "raw";
  }

  // Compute current mean error from local segment
  const currentMeanError = currentLocalN > 0
    ? localSegment.reduce((sum, r) => sum + (r.forecastError ?? 0), 0) / currentLocalN
    : null;

  // Use assumed mean error for simulation; fall back to current or a neutral default
  const simMeanError = assumedMeanError !== null
    ? assumedMeanError
    : currentMeanError ?? -0.10;

  const currentFallback = getFallbackLevel(currentLocalN, currentMeanError, currentGlobalN);
  const currentConfidence =
    currentLocalN >= HIGH_CONFIDENCE_N ? "high" :
    currentLocalN >= MIN_LOCAL_N ? "medium" :
    currentGlobalN >= HIGH_CONFIDENCE_N ? "medium" :
    currentGlobalN >= MIN_LOCAL_N ? "low" : "low";

  // Projected state after additionalCases
  const projLocalN = currentLocalN + additionalCases;
  const projGlobalN = currentGlobalN + additionalCases;
  const projFallback = getFallbackLevel(projLocalN, simMeanError, projGlobalN);
  const projConfidence =
    projLocalN >= HIGH_CONFIDENCE_N ? "high" :
    projLocalN >= MIN_LOCAL_N ? "medium" :
    projGlobalN >= HIGH_CONFIDENCE_N ? "medium" :
    projGlobalN >= MIN_LOCAL_N ? "low" : "low";

  const correctionThresholdReached =
    projLocalN >= MIN_LOCAL_N && Math.abs(simMeanError) > LOCAL_ERROR_THRESHOLD;
  const mediumConfidenceReached = projConfidence === "medium" || projConfidence === "high";
  const highConfidenceReached = projConfidence === "high";

  const casesNeededForThreshold = Math.max(0, MIN_LOCAL_N - currentLocalN);
  const casesNeededForMedium = Math.max(0, MIN_LOCAL_N - currentLocalN);
  const casesNeededForHigh = Math.max(0, HIGH_CONFIDENCE_N - currentLocalN);

  // Build interpretation
  let interpretation = "";
  if (correctionThresholdReached && currentFallback === "raw") {
    interpretation = `Adding ${additionalCases} case(s) moves this segment from raw (no calibration) to local_segment correction active. Bias correction of ~${(simMeanError * 50).toFixed(1)}pp would be applied.`;
  } else if (correctionThresholdReached && !mediumConfidenceReached) {
    interpretation = `Correction threshold reached but confidence remains low (n=${projLocalN}, need n≥5 for medium). ${casesNeededForMedium} more case(s) needed for medium confidence.`;
  } else if (mediumConfidenceReached && !highConfidenceReached) {
    interpretation = `Medium confidence reached (n=${projLocalN}). ${casesNeededForHigh} more case(s) needed for high confidence. Correction is active and considered reliable.`;
  } else if (highConfidenceReached) {
    interpretation = `High confidence reached (n=${projLocalN}). Local segment is well-calibrated. Further cases increase correction stability.`;
  } else {
    interpretation = `After adding ${additionalCases} case(s), the segment reaches n=${projLocalN}. Still below the correction threshold (need n≥3 with |meanError|>8pp). Continue adding cases.`;
  }

  res.json({
    input: { therapyArea, bucket, questionType, additionalCases, assumedMeanError: simMeanError },
    currentState: {
      localN: currentLocalN,
      globalN: currentGlobalN,
      fallbackLevel: currentFallback,
      confidenceLevel: currentConfidence,
      currentMeanError: currentMeanError !== null ? Number(currentMeanError.toFixed(4)) : null,
    },
    projectedState: {
      localN: projLocalN,
      globalN: projGlobalN,
      fallbackLevel: projFallback,
      confidenceLevel: projConfidence,
      assumedMeanError: Number(simMeanError.toFixed(4)),
    },
    correctionThresholdReached,
    mediumConfidenceReached,
    highConfidenceReached,
    casesNeededForThreshold: Math.max(0, casesNeededForThreshold - additionalCases),
    casesNeededForMediumConfidence: Math.max(0, casesNeededForMedium - additionalCases),
    casesNeededForHighConfidence: Math.max(0, casesNeededForHigh - additionalCases),
    interpretation,
    generatedAt: new Date().toISOString(),
  });
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
