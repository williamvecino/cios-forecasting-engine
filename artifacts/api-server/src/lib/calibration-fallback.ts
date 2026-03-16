/**
 * Hierarchical calibration fallback and segment confidence scoring.
 *
 * Fallback hierarchy (applied in order):
 *   Level 0 — local_segment  : therapyArea × bucket, n ≥ 3, |meanError| > 8pp
 *   Level 1 — global_bucket  : all resolved cases in bucket, n ≥ 3, |meanError| > 8pp
 *   Level 2 — signal_type_only: some data exists but below threshold — LR corrections embedded in raw
 *   Level 3 — raw            : no resolved cases at all in this bucket
 */
import { db } from "@workspace/db";
import { calibrationLogTable, bucketCorrectionsTable } from "@workspace/db";
import { enrichCalibrationWithMetadata } from "./case-context.js";

const BUCKETS = [
  { label: "0.40-0.60", min: 0.40, max: 0.60 },
  { label: "0.60-0.75", min: 0.60, max: 0.75 },
  { label: "0.75-0.90", min: 0.75, max: 0.90 },
  { label: "0.90+",     min: 0.90, max: 1.01 },
];

const MIN_LOCAL_N = 3;
const LOCAL_ERROR_THRESHOLD = 0.08;  // 8pp — minimum meaningful error to correct
const MAX_CORRECTION_PP = 0.15;      // ±15pp hard cap

export interface HierarchicalCalibrationResult {
  calibratedProbability: number;
  fallbackLevel: "local_segment" | "global_bucket" | "signal_type_only" | "raw";
  fallbackReason: string;
  bucket: string | null;
  localSegmentN: number;
  globalBucketN: number;
  correctionAppliedPp: number;
  localSegmentCorrectionPp: number | null;
  globalBucketCorrectionPp: number | null;
}

export interface CalibrationConfidenceResult {
  level: "high" | "medium" | "low";
  reason: string;
  localSegmentN: number;
  globalBucketN: number;
  correctionStable: boolean;
  localSegmentUsed: boolean;
  caseProfileSimilarity: number;
}

export interface NearestCalibratedSegment {
  therapyArea: string;
  bucket: string;
  n: number;
  meanError: number;
  relation: "same_therapy_area" | "same_bucket" | "other";
}

function getBucketLabel(p: number): string | null {
  return BUCKETS.find((b) => p >= b.min && p < b.max)?.label ?? null;
}

function getBucketBounds(label: string) {
  return BUCKETS.find((b) => b.label === label) ?? null;
}

function recencyWeightedMeanError(
  rows: Array<{ forecastError: number | null; predictionDate: Date | string | null }>
): number {
  const sorted = [...rows].sort(
    (a, b) =>
      new Date(b.predictionDate ?? 0).getTime() -
      new Date(a.predictionDate ?? 0).getTime()
  );
  const DECAY = 0.1;
  let sum = 0, weight = 0;
  for (let i = 0; i < sorted.length; i++) {
    const w = Math.exp(-DECAY * i);
    sum += (sorted[i].forecastError ?? 0) * w;
    weight += w;
  }
  return weight > 0 ? sum / weight : 0;
}

/**
 * Compute hierarchical calibration fallback for a forecast.
 * Returns the corrected probability and which fallback level was used.
 */
export async function computeHierarchicalCalibration(
  rawProbability: number,
  therapyArea: string | null,
  _questionType: string | null,
): Promise<HierarchicalCalibrationResult> {
  const bucket = getBucketLabel(rawProbability);
  const bounds = bucket ? getBucketBounds(bucket) : null;

  const [allCalRows, bucketRows] = await Promise.all([
    db.select().from(calibrationLogTable),
    db.select().from(bucketCorrectionsTable),
  ]);

  const resolved = allCalRows.filter((r) => r.observedOutcome !== null);
  const enriched = await enrichCalibrationWithMetadata(resolved);

  const globalBucketCases = bounds
    ? enriched.filter(
        (r) => r.predictedProbability >= bounds.min && r.predictedProbability < bounds.max
      )
    : [];
  const globalBucketN = globalBucketCases.length;

  const bucketRow = bucket ? bucketRows.find((r) => r.bucket === bucket) : null;
  const globalBucketCorrPp = bucketRow?.correctionPp ?? 0;

  // Local segment: same therapyArea AND same probability bucket
  let localSegmentN = 0;
  let localMeanError: number | null = null;
  if (bounds && therapyArea) {
    const localCases = globalBucketCases.filter((r) => r.therapeuticArea === therapyArea);
    localSegmentN = localCases.length;
    if (localSegmentN >= MIN_LOCAL_N) {
      localMeanError = recencyWeightedMeanError(
        localCases.map((r) => ({ forecastError: r.forecastError, predictionDate: r.predictionDate }))
      );
    }
  }

  // ── Level 0: Local segment ─────────────────────────────────────────────────
  if (
    localSegmentN >= MIN_LOCAL_N &&
    localMeanError !== null &&
    Math.abs(localMeanError) > LOCAL_ERROR_THRESHOLD
  ) {
    const rawCorr = localMeanError * 0.5;
    const corrPp = Math.max(-MAX_CORRECTION_PP, Math.min(MAX_CORRECTION_PP, rawCorr));
    const calibrated = Math.max(0.01, Math.min(0.99, rawProbability + corrPp));
    return {
      calibratedProbability: Number(calibrated.toFixed(4)),
      fallbackLevel: "local_segment",
      fallbackReason:
        `Local segment (${therapyArea} × ${bucket}): ${localSegmentN} resolved cases, ` +
        `|meanError|=${(Math.abs(localMeanError) * 100).toFixed(1)}pp. ` +
        `Applied ${corrPp >= 0 ? "+" : ""}${(corrPp * 100).toFixed(1)}pp local correction.`,
      bucket,
      localSegmentN,
      globalBucketN,
      correctionAppliedPp: Number((corrPp * 100).toFixed(1)),
      localSegmentCorrectionPp: Number((corrPp * 100).toFixed(1)),
      globalBucketCorrectionPp: Number((globalBucketCorrPp * 100).toFixed(1)),
    };
  }

  // ── Level 1: Global bucket ─────────────────────────────────────────────────
  if (bucket && globalBucketN >= MIN_LOCAL_N && Math.abs(globalBucketCorrPp) > 0) {
    const calibrated = Math.max(0.01, Math.min(0.99, rawProbability + globalBucketCorrPp));
    const localNote =
      localSegmentN > 0
        ? `; local segment n=${localSegmentN}${localMeanError !== null ? `, |error|=${(Math.abs(localMeanError) * 100).toFixed(1)}pp` : ""} — below threshold`
        : `; no local segment data${therapyArea ? ` for ${therapyArea}` : ""}`;
    return {
      calibratedProbability: Number(calibrated.toFixed(4)),
      fallbackLevel: "global_bucket",
      fallbackReason:
        `Global bucket (${bucket}): ${globalBucketN} resolved cases. ` +
        `Applied ${globalBucketCorrPp >= 0 ? "+" : ""}${(globalBucketCorrPp * 100).toFixed(1)}pp correction${localNote}.`,
      bucket,
      localSegmentN,
      globalBucketN,
      correctionAppliedPp: Number((globalBucketCorrPp * 100).toFixed(1)),
      localSegmentCorrectionPp: null,
      globalBucketCorrectionPp: Number((globalBucketCorrPp * 100).toFixed(1)),
    };
  }

  // ── Level 2: Signal-type corrections only ─────────────────────────────────
  if (globalBucketN > 0) {
    return {
      calibratedProbability: rawProbability,
      fallbackLevel: "signal_type_only",
      fallbackReason:
        `Bucket (${bucket ?? "unknown"}): ${globalBucketN} resolved case(s) — ` +
        `below minimum of ${MIN_LOCAL_N}. Bucket correction bypassed; ` +
        `signal-type LR corrections remain active within forecast probability.`,
      bucket,
      localSegmentN,
      globalBucketN,
      correctionAppliedPp: 0,
      localSegmentCorrectionPp: null,
      globalBucketCorrectionPp: 0,
    };
  }

  // ── Level 3: Raw ──────────────────────────────────────────────────────────
  return {
    calibratedProbability: rawProbability,
    fallbackLevel: "raw",
    fallbackReason:
      `No resolved cases in bucket (${bucket ?? "unknown"}). ` +
      `Forecast is raw Bayesian output; no bucket correction applied.`,
    bucket,
    localSegmentN: 0,
    globalBucketN: 0,
    correctionAppliedPp: 0,
    localSegmentCorrectionPp: null,
    globalBucketCorrectionPp: null,
  };
}

/**
 * Compute a structured confidence-in-calibration score.
 * Kept separate from forecast probability.
 */
export async function computeSegmentConfidence(
  hierarchical: HierarchicalCalibrationResult,
  therapyArea: string | null,
): Promise<CalibrationConfidenceResult> {
  const [bucketRows, allCalRows] = await Promise.all([
    db.select().from(bucketCorrectionsTable),
    db.select().from(calibrationLogTable),
  ]);

  const bucketRow = hierarchical.bucket
    ? bucketRows.find((r) => r.bucket === hierarchical.bucket)
    : null;
  const correctionStable =
    !(bucketRow?.directionFlipWarning ?? false) && (bucketRow?.flipCount ?? 0) === 0;

  const resolved = allCalRows.filter((r) => r.observedOutcome !== null);
  let caseProfileSimilarity = 0;
  if (therapyArea && resolved.length > 0) {
    const enriched = await enrichCalibrationWithMetadata(resolved);
    const matchingTA = enriched.filter((r) => r.therapeuticArea === therapyArea);
    caseProfileSimilarity = Number((matchingTA.length / resolved.length).toFixed(2));
  }

  const { localSegmentN, globalBucketN, fallbackLevel, bucket } = hierarchical;
  const localSegmentUsed = fallbackLevel === "local_segment";

  let level: "high" | "medium" | "low";
  let reason: string;

  if (localSegmentUsed && localSegmentN >= 5 && correctionStable) {
    level = "high";
    reason = `${localSegmentN} resolved cases in local segment (${therapyArea} × ${bucket}); correction direction stable.`;
  } else if (localSegmentUsed && localSegmentN >= 3) {
    level = "medium";
    reason = `Local segment correction active (n=${localSegmentN}) but below high-confidence threshold of 5.`;
  } else if (globalBucketN >= 5 && correctionStable) {
    level = "medium";
    reason = `${globalBucketN} resolved cases in global bucket (${bucket}); stable. Local segment insufficient${therapyArea ? ` for ${therapyArea}` : ""}.`;
  } else if (globalBucketN >= 3) {
    level = "low";
    reason =
      `${globalBucketN} resolved cases in global bucket — below medium threshold. ` +
      (correctionStable ? "Correction direction stable." : "⚠ Direction instability detected.");
  } else if (globalBucketN > 0) {
    level = "low";
    reason = `Sparse — ${globalBucketN} resolved case(s) in bucket. Calibration not yet reliable.`;
  } else {
    level = "low";
    reason = "Uncalibrated region — no resolved cases in this bucket. Raw Bayesian output only.";
  }

  return {
    level,
    reason,
    localSegmentN,
    globalBucketN,
    correctionStable,
    localSegmentUsed,
    caseProfileSimilarity,
  };
}

/**
 * Find the nearest well-calibrated segment to aid interpretation of sparse forecasts.
 * Returns the therapyArea × bucket cell with the most resolved cases,
 * preferring those sharing therapyArea or bucket with the current case.
 */
export async function findNearestCalibratedSegment(
  therapyArea: string | null,
  bucket: string | null,
): Promise<NearestCalibratedSegment | null> {
  const allCalRows = await db.select().from(calibrationLogTable);
  const resolved = allCalRows.filter((r) => r.observedOutcome !== null);
  if (resolved.length === 0) return null;

  const enriched = await enrichCalibrationWithMetadata(resolved);

  // Group by therapyArea × bucket
  const cellMap: Record<string, { ta: string; bk: string; errors: number[] }> = {};
  for (const r of enriched) {
    const ta = r.therapeuticArea ?? "Unknown";
    const bk = getBucketLabel(r.predictedProbability) ?? "unknown";
    const key = `${ta}||${bk}`;
    if (!cellMap[key]) cellMap[key] = { ta, bk, errors: [] };
    cellMap[key].errors.push(r.forecastError ?? 0);
  }

  // Score each cell: prioritize same therapyArea or same bucket
  const cells = Object.values(cellMap).map((c) => ({
    therapyArea: c.ta,
    bucket: c.bk,
    n: c.errors.length,
    meanError: Number(
      (c.errors.reduce((s, e) => s + e, 0) / c.errors.length * 100).toFixed(1)
    ),
    relation: (c.ta === therapyArea
      ? "same_therapy_area"
      : c.bk === bucket
      ? "same_bucket"
      : "other") as NearestCalibratedSegment["relation"],
  }));

  // Skip the current cell (exact match on both dimensions)
  const others = cells.filter(
    (c) => !(c.therapyArea === therapyArea && c.bucket === bucket)
  );

  if (others.length === 0) return null;

  // Sort: same_therapy_area first, then same_bucket, then by n descending
  others.sort((a, b) => {
    const priority = { same_therapy_area: 0, same_bucket: 1, other: 2 };
    if (priority[a.relation] !== priority[b.relation]) return priority[a.relation] - priority[b.relation];
    return b.n - a.n;
  });

  return others[0];
}
