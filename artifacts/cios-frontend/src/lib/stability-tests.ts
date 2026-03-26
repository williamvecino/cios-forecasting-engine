import { runCoreForecast } from "./core-forecast-engine";
import type { ForecastCaseInput } from "./types";

export interface StabilityTestResult {
  passed: boolean;
  testName: string;
  details: string;
}

function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return false;
  }
  return true;
}

export function runStabilitySuite(baseCase: ForecastCaseInput): StabilityTestResult[] {
  const results: StabilityTestResult[] = [];

  const repeated = Array.from({ length: 50 }, () => runCoreForecast(baseCase));
  const first = repeated[0];

  const repeatabilityPassed = repeated.every(
    (r) =>
      r.adjustedProbability === first.adjustedProbability &&
      r.posteriorProbability === first.posteriorProbability &&
      r.inputFingerprint === first.inputFingerprint &&
      r.runId === first.runId
  );

  results.push({
    passed: repeatabilityPassed,
    testName: "Repeatability",
    details: repeatabilityPassed
      ? "Same case produced identical outputs across 50 runs."
      : "Outputs changed across repeated runs with identical inputs.",
  });

  const boundsPassed = repeated.every(
    (r) =>
      r.priorProbability >= 0 &&
      r.priorProbability <= 1 &&
      r.posteriorProbability >= 0 &&
      r.posteriorProbability <= 1 &&
      r.adjustedProbability >= 0 &&
      r.adjustedProbability <= 1
  );

  results.push({
    passed: boundsPassed,
    testName: "Probability Bounds",
    details: boundsPassed
      ? "All forecast probabilities remained within valid bounds."
      : "One or more forecast probabilities exceeded valid bounds.",
  });

  const signalShapes = repeated.map((r) => r.appliedSignals);
  const orderPassed = signalShapes.every((arr) =>
    arraysEqual(arr, signalShapes[0])
  );

  results.push({
    passed: orderPassed,
    testName: "Signal Ordering Stability",
    details: orderPassed
      ? "Signal ordering and applied effective likelihood ratios remained stable."
      : "Signal ordering or weighting varied unexpectedly.",
  });

  const baselineCase: ForecastCaseInput = {
    ...baseCase,
    environment: {
      specialtyActorProfile: "general",
      payerEnvironment: "balanced",
      guidelineLeverage: "medium",
      competitiveLandscape: "entrenched_standard_of_care",
      accessFrictionIndex: 0.5,
      adoptionPhase: "early_adoption",
      forecastHorizonMonths: 12,
    },
  };

  const baselineRun = runCoreForecast(baselineCase);
  const backwardCompatible =
    Math.abs(baselineRun.adjustedProbability - baselineRun.posteriorProbability) < 0.12;

  results.push({
    passed: backwardCompatible,
    testName: "Default Environment Compatibility",
    details: backwardCompatible
      ? "Default environment remains close to legacy baseline behavior."
      : "Default environment appears to shift forecasts too strongly.",
  });

  const lowFriction = runCoreForecast({
    ...baseCase,
    environment: {
      ...baseCase.environment,
      accessFrictionIndex: 0.1,
    },
  });

  const highFriction = runCoreForecast({
    ...baseCase,
    environment: {
      ...baseCase.environment,
      accessFrictionIndex: 0.9,
    },
  });

  const sensitivityPassed =
    lowFriction.adjustedProbability > highFriction.adjustedProbability;

  results.push({
    passed: sensitivityPassed,
    testName: "Sensitivity Sanity",
    details: sensitivityPassed
      ? "Lower access friction correctly increased forecast probability."
      : "Sensitivity direction was not logically correct.",
  });

  return results;
}
