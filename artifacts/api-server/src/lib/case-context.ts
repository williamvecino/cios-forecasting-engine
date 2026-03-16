/**
 * Shared case-context utilities: questionType derivation, metadata enrichment.
 */
import { db } from "@workspace/db";
import { casesTable, calibrationLogTable, bucketCorrectionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// ── Question type derivation from strategic question text ────────────────────
export type QuestionType =
  | "adoption_probability"
  | "threshold_achievement"
  | "competitive_comparison"
  | "market_share"
  | "time_to_adoption"
  | "specialty_penetration"
  | "other";

export function deriveQuestionType(strategicQuestion: string | null): QuestionType {
  if (!strategicQuestion) return "other";
  const q = strategicQuestion.toLowerCase();
  if (q.includes("market share") || q.includes("share of")) return "market_share";
  if (q.includes("compared to") || q.includes("versus") || q.includes("vs.") || q.includes("competitive")) return "competitive_comparison";
  if (q.includes("time to") || q.includes("within") || q.includes("months") || q.includes("quarters")) return "time_to_adoption";
  if (q.includes("target") || q.includes("threshold") || q.includes("achieve") || q.includes("reach") || q.includes("≥") || q.includes(">=")) return "threshold_achievement";
  if (q.includes("penetrat") || q.includes("specialist") || q.includes("prescrib")) return "specialty_penetration";
  if (q.includes("probability") || q.includes("likely") || q.includes("will") || q.includes("adoption")) return "adoption_probability";
  return "other";
}

// ── Get case metadata with fallback ─────────────────────────────────────────
export async function getCaseMetadata(caseId: string) {
  const [caseRow] = await db
    .select()
    .from(casesTable)
    .where(eq(casesTable.caseId, caseId))
    .limit(1);
  if (!caseRow) return null;
  return {
    caseId,
    therapeuticArea: caseRow.therapeuticArea ?? null,
    diseaseState: caseRow.diseaseState ?? null,
    specialty: caseRow.specialty ?? null,
    strategicQuestion: caseRow.strategicQuestion ?? null,
    timeHorizon: caseRow.timeHorizon ?? "12 months",
    caseMode: caseRow.isDemo === "true" ? "demo" as const : "live" as const,
    questionType: deriveQuestionType(caseRow.strategicQuestion),
    actorContext: {
      payerEnvironment: caseRow.payerEnvironment ?? "Balanced",
      guidelineLeverage: caseRow.guidelineLeverage ?? "Medium",
      competitorProfile: caseRow.competitorProfile ?? "Entrenched standard of care",
      primarySpecialtyProfile: caseRow.primarySpecialtyProfile ?? "General",
    },
  };
}

// ── Enrich calibration log rows with case metadata via join ─────────────────
export async function enrichCalibrationWithMetadata(
  calRows: (typeof calibrationLogTable.$inferSelect)[]
): Promise<(typeof calibrationLogTable.$inferSelect & {
  therapeuticArea: string | null;
  diseaseState: string | null;
  specialty: string | null;
  strategicQuestion: string | null;
  questionType: QuestionType;
  caseMode: "demo" | "live";
})[]> {
  // Bulk-fetch all case metadata for the case IDs in this set
  const caseIds = [...new Set(calRows.map((r) => r.caseId))];
  const caseRows = caseIds.length > 0
    ? await db.select().from(casesTable)
    : [];
  const caseByIds: Record<string, typeof casesTable.$inferSelect> = {};
  for (const c of caseRows) caseByIds[c.caseId] = c;

  return calRows.map((row) => {
    // First try snapshot metadata (new rows), then fall back to live case join
    let snapshot: any = {};
    try { snapshot = JSON.parse(row.snapshotJson ?? "{}"); } catch {}
    const ctx = snapshot._caseContext ?? {};

    const caseData = caseByIds[row.caseId];
    const therapeuticArea = ctx.therapeuticArea ?? caseData?.therapeuticArea ?? null;
    const diseaseState = ctx.diseaseState ?? caseData?.diseaseState ?? null;
    const specialty = ctx.specialty ?? caseData?.specialty ?? null;
    const strategicQuestion = ctx.strategicQuestion ?? caseData?.strategicQuestion ?? null;
    const caseMode: "demo" | "live" = ctx.caseMode ?? (caseData?.isDemo === "true" ? "demo" : "live");

    // Prefer explicit questionType from _caseContext (ingested rows set this directly),
    // then fall back to deriving it from the strategic question text
    const explicitQuestionType = ctx.questionType as ReturnType<typeof deriveQuestionType> | undefined;
    const questionType = explicitQuestionType ?? deriveQuestionType(strategicQuestion);

    return {
      ...row,
      therapeuticArea,
      diseaseState,
      specialty,
      strategicQuestion,
      questionType,
      caseMode,
    };
  });
}

// ── Coverage note for a probability value in context of bucket data ──────────
export async function getCoverageNote(
  predictedProbability: number,
  therapeuticArea: string | null
): Promise<string> {
  const [calRows, bucketRows] = await Promise.all([
    db.select({ caseId: calibrationLogTable.caseId, predictedProbability: calibrationLogTable.predictedProbability, observedOutcome: calibrationLogTable.observedOutcome }).from(calibrationLogTable),
    db.select().from(bucketCorrectionsTable),
  ]);
  const calibrated = calRows.filter((r) => r.observedOutcome !== null);

  // What bucket does this forecast fall into?
  const BUCKETS = [
    { label: "0.40-0.60", min: 0.40, max: 0.60 },
    { label: "0.60-0.75", min: 0.60, max: 0.75 },
    { label: "0.75-0.90", min: 0.75, max: 0.90 },
    { label: "0.90+",     min: 0.90, max: 1.01 },
  ];
  const bucket = BUCKETS.find((bk) => predictedProbability >= bk.min && predictedProbability < bk.max);
  if (!bucket) return "Outside calibrated range — no correction context";

  const inBucket = calibrated.filter(
    (r) => r.predictedProbability >= bucket.min && r.predictedProbability < bucket.max
  );
  const n = inBucket.length;
  const corrRow = bucketRows.find((r) => r.bucket === bucket.label);
  const isActive = corrRow && Math.abs(corrRow.correctionPp ?? 0) > 0;
  const hasFlipWarning = corrRow?.directionFlipWarning ?? false;
  const hasLowSample = corrRow?.lowSampleWarning ?? false;

  if (n >= 10 && isActive && !hasFlipWarning) {
    return `Well-calibrated region — ${n} resolved cases in this bucket, active correction, stable direction`;
  } else if (n >= 5 && isActive) {
    const warn = hasFlipWarning ? " ⚠ direction instability observed" : "";
    return `Developing calibration — ${n} cases in bucket, active correction${warn}`;
  } else if (n >= 3) {
    return `Emerging calibration — ${n} cases in bucket, ${isActive ? "correction active" : "below correction threshold"}`;
  } else if (n > 0) {
    return `Sparse region — only ${n} resolved case(s) in this bucket, calibration not yet reliable`;
  }
  return `Uncalibrated region — no resolved cases in this bucket yet`;
}
