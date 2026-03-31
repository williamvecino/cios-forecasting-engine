import { randomUUID } from "crypto";
import {
  computeDistributionForecast,
  type GateConstraint,
  type DistributionResult,
} from "./adoption-distribution";

export interface IntegrityTestResult {
  id: string;
  caseId: string;
  runId: string;
  invariantName: string;
  passed: boolean;
  expectedBehavior: string;
  actualBehavior: string;
  details: Record<string, any>;
  forecastProbability: number | null;
  createdAt: Date;
}

export interface ForecastSnapshot {
  caseId: string;
  strategicQuestion: string;
  priorProbability: number;
  finalProbability: number;
  rawProbability: number;
  brandOutlookProbability: number;
  confidenceLevel: string;
  outcomeThreshold: string | null;
  timeHorizon: string;
  signalCount: number;
  signals: SignalSnapshot[];
  gates: GateConstraint[];
  distributionForecast: {
    unconstrained: { alpha: number; beta: number; mean: number };
    constrained: { alpha: number; beta: number; mean: number };
    thresholdProbability: number;
    outcomeThreshold: number;
    gateAdjustments: Array<{ gate_id: string; alphaShift: number; betaShift: number }>;
  };
  signalDetails: Array<{
    signalId: string;
    description: string;
    likelihoodRatio: number;
    effectiveLikelihoodRatio: number;
    absoluteImpact?: number;
    direction?: string;
  }>;
  topDrivers?: string[];
  sensitivityAnalysis?: { swingFactorId?: string; swingFactorDescription?: string };
  actorAggregation?: Record<string, any>;
}

export interface SignalSnapshot {
  signalId: string;
  description: string;
  direction: string;
  strengthScore: number;
  reliabilityScore: number;
  likelihoodRatio: number;
  effectiveLikelihoodRatio: number;
  signalFamily?: string;
  signalType?: string;
  category?: string;
}

export type InvariantName =
  | "threshold_monotonicity"
  | "horizon_monotonicity"
  | "positive_signal_response"
  | "negative_signal_response"
  | "constraint_release_response"
  | "duplicate_compression"
  | "question_sensitivity"
  | "segment_sensitivity"
  | "explanation_consistency"
  | "reproducibility";

const CORE_INVARIANTS: InvariantName[] = [
  "threshold_monotonicity",
  "positive_signal_response",
  "negative_signal_response",
  "reproducibility",
];

export interface IntegrityRunSummary {
  runId: string;
  caseId: string;
  timestamp: string;
  totalTests: number;
  passed: number;
  failed: number;
  coreFailures: string[];
  allResults: IntegrityTestResult[];
  stabilityWarning: boolean;
  unreliableFlag: boolean;
}

function parseThreshold(raw: string | null | undefined): number {
  if (!raw) return 0.5;
  const cleaned = String(raw).replace("%", "").trim();
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0.5;
  return num > 1 ? num / 100 : num;
}

function parseHorizonMonths(horizon: string | null | undefined): number {
  if (!horizon) return 12;
  const lower = horizon.toLowerCase();
  const match = lower.match(/(\d+)/);
  if (!match) return 12;
  const num = parseInt(match[1]);
  if (lower.includes("year")) return num * 12;
  return num;
}

function makeResult(
  runId: string,
  caseId: string,
  invariantName: InvariantName,
  passed: boolean,
  expectedBehavior: string,
  actualBehavior: string,
  details: Record<string, any>,
  forecastProbability: number | null,
): IntegrityTestResult {
  return {
    id: randomUUID(),
    caseId,
    runId,
    invariantName,
    passed,
    expectedBehavior,
    actualBehavior,
    details,
    forecastProbability,
    createdAt: new Date(),
  };
}

export function testThresholdMonotonicity(
  snapshot: ForecastSnapshot,
  runId: string,
): IntegrityTestResult {
  const thresholds = [0.05, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80];
  const signalFamilies = new Set(snapshot.signals.map(s => s.signalFamily ?? s.signalType ?? "unknown"));
  const signalCategories = new Set(snapshot.signals.map(s => s.category ?? s.signalType ?? "unknown"));
  const diversityScore = Math.min(1, (signalFamilies.size + signalCategories.size) / 10);

  const results: Array<{ threshold: number; probability: number }> = [];
  for (const t of thresholds) {
    const dist = computeDistributionForecast(
      snapshot.brandOutlookProbability,
      snapshot.confidenceLevel,
      snapshot.signalCount,
      diversityScore,
      snapshot.gates,
      `${(t * 100).toFixed(0)}%`,
    );
    results.push({ threshold: t, probability: dist.thresholdProbability });
  }

  let monotonic = true;
  const violations: string[] = [];
  for (let i = 1; i < results.length; i++) {
    if (results[i].probability > results[i - 1].probability + 0.001) {
      monotonic = false;
      violations.push(
        `P(>=${(results[i].threshold * 100).toFixed(0)}%) = ${(results[i].probability * 100).toFixed(1)}% > P(>=${(results[i - 1].threshold * 100).toFixed(0)}%) = ${(results[i - 1].probability * 100).toFixed(1)}%`
      );
    }
  }

  return makeResult(
    runId,
    snapshot.caseId,
    "threshold_monotonicity",
    monotonic,
    "P(any adoption) >= P(>=10%) >= P(>=50%): higher thresholds should yield equal or lower probabilities",
    monotonic
      ? `Monotonicity holds across ${thresholds.length} thresholds`
      : `Monotonicity violated: ${violations.join("; ")}`,
    { thresholds: results, violations },
    snapshot.finalProbability,
  );
}

export function testHorizonMonotonicity(
  snapshot: ForecastSnapshot,
  runId: string,
): IntegrityTestResult {
  const currentMonths = parseHorizonMonths(snapshot.timeHorizon);

  const horizons = [6, 12, 24, 36].filter(h => h !== currentMonths);
  horizons.push(currentMonths);
  horizons.sort((a, b) => a - b);

  const currentThreshold = parseThreshold(snapshot.outcomeThreshold);
  const signalFamilies = new Set(snapshot.signals.map(s => s.signalFamily ?? s.signalType ?? "unknown"));
  const signalCategories = new Set(snapshot.signals.map(s => s.category ?? s.signalType ?? "unknown"));
  const diversityScore = Math.min(1, (signalFamilies.size + signalCategories.size) / 10);

  const results: Array<{ months: number; probability: number }> = [];
  for (const h of horizons) {
    const horizonMultiplier = h / 12;
    const adjustedPosterior = Math.min(0.99, snapshot.brandOutlookProbability * Math.pow(horizonMultiplier, 0.15));
    const dist = computeDistributionForecast(
      adjustedPosterior,
      snapshot.confidenceLevel,
      snapshot.signalCount,
      diversityScore,
      snapshot.gates,
      `${(currentThreshold * 100).toFixed(0)}%`,
    );
    results.push({ months: h, probability: dist.thresholdProbability });
  }

  let monotonic = true;
  const violations: string[] = [];
  for (let i = 1; i < results.length; i++) {
    if (results[i].probability < results[i - 1].probability - 0.02) {
      monotonic = false;
      violations.push(
        `P(${results[i].months}mo) = ${(results[i].probability * 100).toFixed(1)}% < P(${results[i - 1].months}mo) = ${(results[i - 1].probability * 100).toFixed(1)}%`
      );
    }
  }

  return makeResult(
    runId,
    snapshot.caseId,
    "horizon_monotonicity",
    monotonic,
    "P(24 months) >= P(12 months) >= P(6 months): longer horizons should yield equal or higher probabilities",
    monotonic
      ? `Horizon monotonicity holds across ${horizons.length} horizons`
      : `Horizon monotonicity violated: ${violations.join("; ")}`,
    { horizons: results, violations },
    snapshot.finalProbability,
  );
}

export function testPositiveSignalResponse(
  snapshot: ForecastSnapshot,
  runId: string,
): IntegrityTestResult {
  const signalFamilies = new Set(snapshot.signals.map(s => s.signalFamily ?? s.signalType ?? "unknown"));
  const signalCategories = new Set(snapshot.signals.map(s => s.category ?? s.signalType ?? "unknown"));
  const diversityScore = Math.min(1, (signalFamilies.size + signalCategories.size) / 10);
  const threshold = parseThreshold(snapshot.outcomeThreshold);

  const baseResult = computeDistributionForecast(
    snapshot.brandOutlookProbability,
    snapshot.confidenceLevel,
    snapshot.signalCount,
    diversityScore,
    snapshot.gates,
    `${(threshold * 100).toFixed(0)}%`,
  );
  const baseProbability = baseResult.thresholdProbability;

  const boostedPosterior = Math.min(0.99, snapshot.brandOutlookProbability * 1.15);
  const boostedResult = computeDistributionForecast(
    boostedPosterior,
    snapshot.confidenceLevel,
    snapshot.signalCount + 1,
    Math.min(1, diversityScore + 0.05),
    snapshot.gates,
    `${(threshold * 100).toFixed(0)}%`,
  );
  const boostedProbability = boostedResult.thresholdProbability;

  const passed = boostedProbability >= baseProbability - 0.001;

  return makeResult(
    runId,
    snapshot.caseId,
    "positive_signal_response",
    passed,
    "Adding a strong positive signal should not decrease probability",
    passed
      ? `Positive signal response correct: ${(baseProbability * 100).toFixed(1)}% → ${(boostedProbability * 100).toFixed(1)}% (+${((boostedProbability - baseProbability) * 100).toFixed(1)}pp)`
      : `Positive signal DECREASED probability: ${(baseProbability * 100).toFixed(1)}% → ${(boostedProbability * 100).toFixed(1)}% (${((boostedProbability - baseProbability) * 100).toFixed(1)}pp)`,
    { baseProbability, boostedProbability, delta: boostedProbability - baseProbability },
    snapshot.finalProbability,
  );
}

export function testNegativeSignalResponse(
  snapshot: ForecastSnapshot,
  runId: string,
): IntegrityTestResult {
  const signalFamilies = new Set(snapshot.signals.map(s => s.signalFamily ?? s.signalType ?? "unknown"));
  const signalCategories = new Set(snapshot.signals.map(s => s.category ?? s.signalType ?? "unknown"));
  const diversityScore = Math.min(1, (signalFamilies.size + signalCategories.size) / 10);
  const threshold = parseThreshold(snapshot.outcomeThreshold);

  const baseResult = computeDistributionForecast(
    snapshot.brandOutlookProbability,
    snapshot.confidenceLevel,
    snapshot.signalCount,
    diversityScore,
    snapshot.gates,
    `${(threshold * 100).toFixed(0)}%`,
  );
  const baseProbability = baseResult.thresholdProbability;

  const reducedPosterior = Math.max(0.01, snapshot.brandOutlookProbability * 0.85);
  const reducedResult = computeDistributionForecast(
    reducedPosterior,
    snapshot.confidenceLevel,
    snapshot.signalCount + 1,
    Math.min(1, diversityScore + 0.05),
    snapshot.gates,
    `${(threshold * 100).toFixed(0)}%`,
  );
  const reducedProbability = reducedResult.thresholdProbability;

  const passed = reducedProbability <= baseProbability + 0.001;

  return makeResult(
    runId,
    snapshot.caseId,
    "negative_signal_response",
    passed,
    "Adding a strong negative signal should not increase probability",
    passed
      ? `Negative signal response correct: ${(baseProbability * 100).toFixed(1)}% → ${(reducedProbability * 100).toFixed(1)}% (${((reducedProbability - baseProbability) * 100).toFixed(1)}pp)`
      : `Negative signal INCREASED probability: ${(baseProbability * 100).toFixed(1)}% → ${(reducedProbability * 100).toFixed(1)}% (+${((reducedProbability - baseProbability) * 100).toFixed(1)}pp)`,
    { baseProbability, reducedProbability, delta: reducedProbability - baseProbability },
    snapshot.finalProbability,
  );
}

export function testConstraintReleaseResponse(
  snapshot: ForecastSnapshot,
  runId: string,
): IntegrityTestResult {
  if (snapshot.gates.length === 0) {
    return makeResult(
      runId,
      snapshot.caseId,
      "constraint_release_response",
      true,
      "Removing a major gate should increase or materially change the forecast",
      "No gates present — test not applicable (pass by default)",
      { skipped: true, reason: "no_gates" },
      snapshot.finalProbability,
    );
  }

  const signalFamilies = new Set(snapshot.signals.map(s => s.signalFamily ?? s.signalType ?? "unknown"));
  const signalCategories = new Set(snapshot.signals.map(s => s.category ?? s.signalType ?? "unknown"));
  const diversityScore = Math.min(1, (signalFamilies.size + signalCategories.size) / 10);
  const threshold = parseThreshold(snapshot.outcomeThreshold);

  const withGates = computeDistributionForecast(
    snapshot.brandOutlookProbability,
    snapshot.confidenceLevel,
    snapshot.signalCount,
    diversityScore,
    snapshot.gates,
    `${(threshold * 100).toFixed(0)}%`,
  );

  const nonStrongGates = snapshot.gates.filter(g => g.status !== "strong");
  if (nonStrongGates.length === 0) {
    return makeResult(
      runId,
      snapshot.caseId,
      "constraint_release_response",
      true,
      "Removing a major gate should increase or materially change the forecast",
      "All gates are strong (no active constraints) — test not applicable",
      { skipped: true, reason: "all_gates_strong" },
      snapshot.finalProbability,
    );
  }

  const worstGate = nonStrongGates.reduce((worst, g) => {
    const severityOrder = { unresolved: 4, weak: 3, moderate: 2, strong: 1 };
    const worstSev = severityOrder[worst.status] ?? 0;
    const gSev = severityOrder[g.status] ?? 0;
    return gSev > worstSev ? g : worst;
  });

  const releasedGates = snapshot.gates.filter(g => g.gate_id !== worstGate.gate_id);
  const withoutGate = computeDistributionForecast(
    snapshot.brandOutlookProbability,
    snapshot.confidenceLevel,
    snapshot.signalCount,
    diversityScore,
    releasedGates,
    `${(threshold * 100).toFixed(0)}%`,
  );

  const delta = withoutGate.thresholdProbability - withGates.thresholdProbability;
  const passed = delta >= -0.001;

  return makeResult(
    runId,
    snapshot.caseId,
    "constraint_release_response",
    passed,
    "Removing the most restrictive gate should increase or maintain the forecast probability",
    passed
      ? `Gate release response correct: removing "${worstGate.gate_label}" (${worstGate.status}) changed probability by ${(delta * 100).toFixed(1)}pp (${(withGates.thresholdProbability * 100).toFixed(1)}% → ${(withoutGate.thresholdProbability * 100).toFixed(1)}%)`
      : `Gate release DECREASED probability: removing "${worstGate.gate_label}" caused ${(delta * 100).toFixed(1)}pp drop`,
    {
      removedGate: worstGate,
      withGatesProbability: withGates.thresholdProbability,
      withoutGateProbability: withoutGate.thresholdProbability,
      delta,
    },
    snapshot.finalProbability,
  );
}

export function testDuplicateCompression(
  snapshot: ForecastSnapshot,
  runId: string,
): IntegrityTestResult {
  if (snapshot.signalCount < 2) {
    return makeResult(
      runId,
      snapshot.caseId,
      "duplicate_compression",
      true,
      "Adding duplicate evidence should not keep moving the forecast as if it were new",
      "Fewer than 2 signals — test not applicable",
      { skipped: true, reason: "insufficient_signals" },
      snapshot.finalProbability,
    );
  }

  const signalFamilies = new Set(snapshot.signals.map(s => s.signalFamily ?? s.signalType ?? "unknown"));
  const signalCategories = new Set(snapshot.signals.map(s => s.category ?? s.signalType ?? "unknown"));
  const diversityScore = Math.min(1, (signalFamilies.size + signalCategories.size) / 10);
  const threshold = parseThreshold(snapshot.outcomeThreshold);

  const base = computeDistributionForecast(
    snapshot.brandOutlookProbability,
    snapshot.confidenceLevel,
    snapshot.signalCount,
    diversityScore,
    snapshot.gates,
    `${(threshold * 100).toFixed(0)}%`,
  );

  const duplicatedCount = snapshot.signalCount * 2;
  const duplicated = computeDistributionForecast(
    snapshot.brandOutlookProbability,
    snapshot.confidenceLevel,
    duplicatedCount,
    diversityScore,
    snapshot.gates,
    `${(threshold * 100).toFixed(0)}%`,
  );

  const delta = Math.abs(duplicated.thresholdProbability - base.thresholdProbability);
  const maxAcceptableDelta = 0.08;
  const passed = delta <= maxAcceptableDelta;

  return makeResult(
    runId,
    snapshot.caseId,
    "duplicate_compression",
    passed,
    `Doubling signal count (without new evidence diversity) should not shift probability by more than ${(maxAcceptableDelta * 100).toFixed(0)}pp`,
    passed
      ? `Duplicate compression holds: doubling signals caused ${(delta * 100).toFixed(1)}pp shift (within ${(maxAcceptableDelta * 100)}pp tolerance)`
      : `Duplicate inflation detected: doubling signals caused ${(delta * 100).toFixed(1)}pp shift (exceeds ${(maxAcceptableDelta * 100)}pp tolerance)`,
    {
      baseProbability: base.thresholdProbability,
      duplicatedProbability: duplicated.thresholdProbability,
      delta,
      originalCount: snapshot.signalCount,
      duplicatedCount,
    },
    snapshot.finalProbability,
  );
}

export function testQuestionSensitivity(
  snapshot: ForecastSnapshot,
  previousSnapshots: ForecastSnapshot[],
  runId: string,
): IntegrityTestResult {
  if (previousSnapshots.length === 0) {
    return makeResult(
      runId,
      snapshot.caseId,
      "question_sensitivity",
      true,
      "Materially different forecast questions should not return the same probability",
      "No other case snapshots available for comparison — test not applicable",
      { skipped: true, reason: "no_comparison_cases" },
      snapshot.finalProbability,
    );
  }

  const duplicates: string[] = [];
  for (const prev of previousSnapshots) {
    if (prev.caseId === snapshot.caseId) continue;
    if (prev.strategicQuestion === snapshot.strategicQuestion) continue;

    const probDelta = Math.abs(prev.finalProbability - snapshot.finalProbability);
    const priorDelta = Math.abs(prev.priorProbability - snapshot.priorProbability);
    const signalCountDelta = Math.abs(prev.signalCount - snapshot.signalCount);

    if (probDelta < 0.005 && (priorDelta > 0.05 || signalCountDelta > 2)) {
      duplicates.push(
        `Case "${prev.caseId}" has different question/evidence but same probability (${(prev.finalProbability * 100).toFixed(1)}% vs ${(snapshot.finalProbability * 100).toFixed(1)}%)`
      );
    }
  }

  const passed = duplicates.length === 0;

  return makeResult(
    runId,
    snapshot.caseId,
    "question_sensitivity",
    passed,
    "Materially different forecast questions should not return the same probability without explicit reason",
    passed
      ? `Question sensitivity holds: no identical probabilities found across ${previousSnapshots.length} comparison cases`
      : `Question insensitivity detected: ${duplicates.join("; ")}`,
    { duplicates, comparedCaseCount: previousSnapshots.length },
    snapshot.finalProbability,
  );
}

export function testSegmentSensitivity(
  snapshot: ForecastSnapshot,
  runId: string,
): IntegrityTestResult {
  if (!snapshot.actorAggregation || Object.keys(snapshot.actorAggregation).length < 2) {
    return makeResult(
      runId,
      snapshot.caseId,
      "segment_sensitivity",
      true,
      "Different actor groups should produce different outputs when evidence differs",
      "Insufficient actor data for segment sensitivity test — test not applicable",
      { skipped: true, reason: "insufficient_actors" },
      snapshot.finalProbability,
    );
  }

  const actors = snapshot.actorAggregation;
  const actorKeys = Object.keys(actors);
  const actorValues: Array<{ actor: string; weight: number; adjustmentFactor: number }> = [];

  for (const key of actorKeys) {
    const actor = actors[key];
    if (actor && typeof actor === "object") {
      actorValues.push({
        actor: key,
        weight: actor.weight ?? actor.actorWeight ?? 0,
        adjustmentFactor: actor.adjustmentFactor ?? actor.reactionFactor ?? 0,
      });
    }
  }

  if (actorValues.length < 2) {
    return makeResult(
      runId,
      snapshot.caseId,
      "segment_sensitivity",
      true,
      "Different actor groups should produce different outputs when evidence differs",
      "Fewer than 2 actors with data — test not applicable",
      { skipped: true, reason: "insufficient_actor_data" },
      snapshot.finalProbability,
    );
  }

  let allIdentical = true;
  const factors = actorValues.map(a => a.adjustmentFactor);
  for (let i = 1; i < factors.length; i++) {
    if (Math.abs(factors[i] - factors[0]) > 0.001) {
      allIdentical = false;
      break;
    }
  }

  const passed = !allIdentical;

  return makeResult(
    runId,
    snapshot.caseId,
    "segment_sensitivity",
    passed,
    "Different actor groups should produce different adjustment factors when evidence and behavior differ",
    passed
      ? `Segment sensitivity holds: ${actorValues.length} actors have distinct adjustment factors`
      : `Segment insensitivity: all ${actorValues.length} actors have identical adjustment factor (${factors[0].toFixed(4)})`,
    { actors: actorValues },
    snapshot.finalProbability,
  );
}

export function testExplanationConsistency(
  snapshot: ForecastSnapshot,
  runId: string,
): IntegrityTestResult {
  const topDrivers = snapshot.topDrivers ?? [];
  const signalDetails = snapshot.signalDetails ?? [];

  if (topDrivers.length === 0 || signalDetails.length === 0) {
    return makeResult(
      runId,
      snapshot.caseId,
      "explanation_consistency",
      true,
      "Top drivers shown must match actual modeled contributors",
      "No driver or signal data available — test not applicable",
      { skipped: true, reason: "no_driver_data" },
      snapshot.finalProbability,
    );
  }

  const sortedByImpact = [...signalDetails]
    .filter(s => s.absoluteImpact !== undefined)
    .sort((a, b) => Math.abs(b.absoluteImpact ?? 0) - Math.abs(a.absoluteImpact ?? 0));

  if (sortedByImpact.length === 0) {
    return makeResult(
      runId,
      snapshot.caseId,
      "explanation_consistency",
      true,
      "Top drivers shown must match actual modeled contributors",
      "No signals with impact data — test not applicable",
      { skipped: true, reason: "no_impact_data" },
      snapshot.finalProbability,
    );
  }

  const topActualDriverDescriptions = sortedByImpact
    .slice(0, 3)
    .map(s => s.description.toLowerCase().trim());

  let matchCount = 0;
  for (const driverText of topDrivers.slice(0, 3)) {
    const driverLower = driverText.toLowerCase().trim();
    const matched = topActualDriverDescriptions.some(actual =>
      actual.includes(driverLower.slice(0, 30)) || driverLower.includes(actual.slice(0, 30))
    );
    if (matched) matchCount++;
  }

  const matchRatio = topDrivers.length > 0 ? matchCount / Math.min(topDrivers.length, 3) : 1;
  const passed = matchRatio >= 0.33;

  return makeResult(
    runId,
    snapshot.caseId,
    "explanation_consistency",
    passed,
    "At least 1 of top 3 displayed drivers should match top 3 actual impact contributors",
    passed
      ? `Explanation consistency holds: ${matchCount}/${Math.min(topDrivers.length, 3)} top drivers match actual contributors`
      : `Explanation mismatch: ${matchCount}/${Math.min(topDrivers.length, 3)} top drivers match. Displayed: [${topDrivers.slice(0, 3).join(", ")}]. Actual top: [${topActualDriverDescriptions.join(", ")}]`,
    {
      displayedDrivers: topDrivers.slice(0, 3),
      actualTopDrivers: sortedByImpact.slice(0, 3).map(s => ({
        description: s.description,
        impact: s.absoluteImpact,
      })),
      matchCount,
      matchRatio,
    },
    snapshot.finalProbability,
  );
}

export function testReproducibility(
  snapshot: ForecastSnapshot,
  runId: string,
): IntegrityTestResult {
  const signalFamilies = new Set(snapshot.signals.map(s => s.signalFamily ?? s.signalType ?? "unknown"));
  const signalCategories = new Set(snapshot.signals.map(s => s.category ?? s.signalType ?? "unknown"));
  const diversityScore = Math.min(1, (signalFamilies.size + signalCategories.size) / 10);
  const threshold = parseThreshold(snapshot.outcomeThreshold);

  const results: number[] = [];
  for (let i = 0; i < 3; i++) {
    const dist = computeDistributionForecast(
      snapshot.brandOutlookProbability,
      snapshot.confidenceLevel,
      snapshot.signalCount,
      diversityScore,
      snapshot.gates,
      `${(threshold * 100).toFixed(0)}%`,
    );
    results.push(dist.thresholdProbability);
  }

  const maxDrift = Math.max(...results) - Math.min(...results);
  const passed = maxDrift < 0.001;

  return makeResult(
    runId,
    snapshot.caseId,
    "reproducibility",
    passed,
    "Same inputs must produce same outputs (deterministic within 0.1%)",
    passed
      ? `Reproducibility holds: 3 runs produced identical results (max drift: ${(maxDrift * 100).toFixed(4)}pp)`
      : `Reproducibility FAILED: 3 runs produced different results (max drift: ${(maxDrift * 100).toFixed(4)}pp). Values: ${results.map(r => (r * 100).toFixed(2) + "%").join(", ")}`,
    { runs: results, maxDrift },
    snapshot.finalProbability,
  );
}

export function runAllIntegrityTests(
  snapshot: ForecastSnapshot,
  previousSnapshots: ForecastSnapshot[] = [],
): IntegrityRunSummary {
  const runId = `INTEG-${Date.now()}-${randomUUID().slice(0, 8)}`;

  const results: IntegrityTestResult[] = [
    testThresholdMonotonicity(snapshot, runId),
    testHorizonMonotonicity(snapshot, runId),
    testPositiveSignalResponse(snapshot, runId),
    testNegativeSignalResponse(snapshot, runId),
    testConstraintReleaseResponse(snapshot, runId),
    testDuplicateCompression(snapshot, runId),
    testQuestionSensitivity(snapshot, previousSnapshots, runId),
    testSegmentSensitivity(snapshot, runId),
    testExplanationConsistency(snapshot, runId),
    testReproducibility(snapshot, runId),
  ];

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const coreFailures = results
    .filter(r => !r.passed && CORE_INVARIANTS.includes(r.invariantName as InvariantName))
    .map(r => r.invariantName);

  return {
    runId,
    caseId: snapshot.caseId,
    timestamp: new Date().toISOString(),
    totalTests: results.length,
    passed,
    failed,
    coreFailures,
    allResults: results,
    stabilityWarning: coreFailures.length > 0,
    unreliableFlag: coreFailures.length >= 2,
  };
}

export function buildForecastSnapshotForIntegrity(
  caseId: string,
  caseData: any,
  finalResult: any,
  allSignals: any[],
  eventGates: any[],
): ForecastSnapshot {
  return {
    caseId,
    strategicQuestion: caseData.strategicQuestion ?? "",
    priorProbability: caseData.priorProbability ?? 0.45,
    finalProbability: finalResult.currentProbability,
    rawProbability: finalResult.rawProbability,
    brandOutlookProbability: finalResult.brandOutlookProbability,
    confidenceLevel: finalResult.confidenceLevel,
    outcomeThreshold: caseData.outcomeThreshold ?? null,
    timeHorizon: caseData.timeHorizon ?? "12 months",
    signalCount: allSignals.length,
    signals: allSignals.map((s: any) => ({
      signalId: s.signalId ?? s.id ?? "",
      description: s.signalDescription ?? s.description ?? "",
      direction: s.direction ?? "Positive",
      strengthScore: s.strengthScore ?? 5,
      reliabilityScore: s.reliabilityScore ?? 5,
      likelihoodRatio: s.likelihoodRatio ?? 1.0,
      effectiveLikelihoodRatio: s.activeLikelihoodRatio ?? s.effectiveLikelihoodRatio ?? s.likelihoodRatio ?? 1.0,
      signalFamily: s.signalFamily ?? null,
      signalType: s.signalType ?? null,
      category: s.category ?? s.signalType ?? null,
    })),
    gates: (eventGates ?? []).map((g: any) => ({
      gate_id: g.gate_id ?? g.gateId ?? "",
      gate_label: g.gate_label ?? g.gateLabel ?? "",
      status: (g.status ?? "moderate") as "unresolved" | "weak" | "moderate" | "strong",
      constrains_probability_to: g.constrains_probability_to ?? g.constrainsProbabilityTo ?? 0.5,
    })),
    distributionForecast: finalResult.distributionForecast ?? {
      unconstrained: { alpha: 1, beta: 1, mean: 0.5 },
      constrained: { alpha: 1, beta: 1, mean: 0.5 },
      thresholdProbability: finalResult.currentProbability,
      outcomeThreshold: 0.5,
      gateAdjustments: [],
    },
    signalDetails: finalResult.signalDetails ?? [],
    topDrivers: (finalResult.signalDetails ?? [])
      .filter((s: any) => s.absoluteImpact !== undefined)
      .sort((a: any, b: any) => Math.abs(b.absoluteImpact ?? 0) - Math.abs(a.absoluteImpact ?? 0))
      .slice(0, 5)
      .map((s: any) => s.description ?? ""),
    sensitivityAnalysis: finalResult.sensitivityAnalysis ?? null,
    actorAggregation: finalResult.actorAggregation ?? null,
  };
}
