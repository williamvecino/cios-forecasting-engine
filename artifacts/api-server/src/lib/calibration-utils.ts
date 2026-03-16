import { db } from "@workspace/db";
import { lrCorrectionsTable, bucketCorrectionsTable } from "@workspace/db";

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
