import { Router } from "express";
import { db } from "@workspace/db";
import { calibrationLogTable } from "@workspace/db";
import { randomUUID } from "crypto";
import { enrichCalibrationWithMetadata } from "../lib/case-context.js";
import { getBucket, BUCKETS, computeAndSaveCorrections } from "../lib/calibration-utils.js";

const router = Router();

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

// ── Expansion Targets: highest-priority case-library gaps ────────────────────
router.get("/calibration/expansion-targets", async (_req, res) => {
  const [calRows] = await Promise.all([
    db.select().from(calibrationLogTable),
  ]);

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

  const countMap: Record<string, { total: number; resolved: number }> = {};
  for (const c of CANONICAL_QUESTION_TYPES) countMap[c.type] = { total: 0, resolved: 0 };

  for (const r of enriched) {
    const qt = r.questionType ?? "other";
    if (!countMap[qt]) countMap[qt] = { total: 0, resolved: 0 };
    countMap[qt].total++;
    if (r.observedOutcome !== null) countMap[qt].resolved++;
  }

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

  const forecastError = Number((observedOutcome - predictedProbability).toFixed(8));
  const brierComponent = Number(Math.pow(predictedProbability - observedOutcome, 2).toFixed(8));
  const bucket = getBucket(predictedProbability);

  const id = randomUUID();
  const forecastId = `INGEST-${Date.now()}-${id.slice(0, 8)}`;
  const caseId = `INGESTED-${id.slice(0, 8)}`;

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

  const bk = BUCKETS.find((b) => b.label === bucket);
  const localSegment = enriched.filter(
    (r) =>
      r.observedOutcome !== null &&
      r.therapeuticArea === therapyArea &&
      bk &&
      r.predictedProbability >= bk.min &&
      r.predictedProbability < bk.max
  );

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

  function getFallbackLevel(localN: number, localMeanError: number | null, globalN: number): string {
    if (localN >= MIN_LOCAL_N && localMeanError !== null && Math.abs(localMeanError) > LOCAL_ERROR_THRESHOLD) {
      return "local_segment";
    }
    if (globalN >= MIN_LOCAL_N) return "global_bucket";
    return "raw";
  }

  const currentMeanError = currentLocalN > 0
    ? localSegment.reduce((sum, r) => sum + (r.forecastError ?? 0), 0) / currentLocalN
    : null;

  const simMeanError = assumedMeanError !== null
    ? assumedMeanError
    : currentMeanError ?? -0.10;

  const currentFallback = getFallbackLevel(currentLocalN, currentMeanError, currentGlobalN);
  const currentConfidence =
    currentLocalN >= HIGH_CONFIDENCE_N ? "high" :
    currentLocalN >= MIN_LOCAL_N ? "medium" :
    currentGlobalN >= HIGH_CONFIDENCE_N ? "medium" :
    currentGlobalN >= MIN_LOCAL_N ? "low" : "low";

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

export default router;
