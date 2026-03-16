import { db } from "@workspace/db";
import { calibrationLogTable, lrCorrectionsTable, bucketCorrectionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export const BUCKETS = [
  { label: "0.40-0.60", min: 0.40, max: 0.60 },
  { label: "0.60-0.75", min: 0.60, max: 0.75 },
  { label: "0.75-0.90", min: 0.75, max: 0.90 },
  { label: "0.90+",     min: 0.90, max: 1.01 },
];

export function getBucket(p: number): string | null {
  const b = BUCKETS.find((bk) => p >= bk.min && p < bk.max);
  return b ? b.label : null;
}

export async function getLrCorrections(): Promise<Record<string, number>> {
  const rows = await db.select().from(lrCorrectionsTable);
  const map: Record<string, number> = {};
  for (const row of rows) {
    map[row.signalType] = row.correctionFactor;
  }
  return map;
}

export async function getBucketCorrections(): Promise<Record<string, number>> {
  const rows = await db.select().from(bucketCorrectionsTable);
  const map: Record<string, number> = {};
  for (const row of rows) {
    map[row.bucket] = row.correctionPp ?? 0;
  }
  return map;
}

const DECAY_LAMBDA: Record<string, number> = {
  "Phase III clinical":       0.06,
  "Guideline inclusion":      0.05,
  "Regulatory / clinical":    0.08,
  "KOL endorsement":          0.18,
  "Access / commercial":      0.22,
  "Competitor counteraction": 0.25,
  "Operational friction":     0.20,
  "Field intelligence":       0.35,
};

export function computeDecay(signalType: string, ageMonths: number): number {
  const lambda = DECAY_LAMBDA[signalType] ?? 0.15;
  return Math.exp(-lambda * ageMonths);
}

export const MIN_SAMPLE_FOR_CORRECTION = 5;
export const CORRECTION_THRESHOLD = 0.10;
export const MAX_CORRECTION = 0.20;

export const MIN_BUCKET_SAMPLE = 3;
export const BUCKET_THRESHOLD = 0.08;
export const MAX_BUCKET_CORRECTION_PP = 0.15;

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

async function computeAndSaveBucketCorrections(): Promise<{ updated: string[]; skipped: string[] }> {
  const rows = await db.select().from(calibrationLogTable);
  const calibrated = rows.filter((r) => r.observedOutcome !== null);

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

export async function computeAndSaveCorrections(): Promise<{
  lr: { updated: string[]; skipped: string[] };
  bucket: { updated: string[]; skipped: string[] };
}> {
  const [lr, bucket] = await Promise.all([
    computeAndSaveLrCorrections(),
    computeAndSaveBucketCorrections(),
  ]);
  return { lr, bucket };
}
