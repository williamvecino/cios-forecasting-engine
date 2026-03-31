export interface AdoptionDistribution {
  alpha: number;
  beta: number;
  mean: number;
  variance: number;
  mode: number | null;
  concentration: number;
}

export interface GateConstraint {
  gate_id: string;
  gate_label: string;
  status: "unresolved" | "weak" | "moderate" | "strong";
  constrains_probability_to: number;
}

export interface GateAdjustment {
  gate_id: string;
  gate_label: string;
  alphaShift: number;
  betaShift: number;
  reason: string;
}

export interface GateDominationDiagnostic {
  gateDominated: boolean;
  warning: string | null;
  unconstrainedProbability: number;
  constrainedProbability: number;
  gateImpactRatio: number;
  achievableCeiling: number;
  readinessScore: number;
}

export interface DistributionResult {
  unconstrained: AdoptionDistribution;
  constrained: AdoptionDistribution;
  thresholdProbability: number;
  outcomeThreshold: number;
  gateAdjustments: GateAdjustment[];
  readinessScore: number;
  achievableCeiling: number;
  gateDomination: GateDominationDiagnostic;
}

const GATE_SEVERITY: Record<string, number> = {
  strong: 0,
  moderate: 0.25,
  weak: 0.55,
  unresolved: 0.85,
};

function lnGamma(z: number): number {
  const g = 7;
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  }
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (z + i);
  }
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  if (x > (a + 1) / (a + b + 2)) {
    return 1 - regularizedIncompleteBeta(1 - x, b, a);
  }

  const lnBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
  const front = Math.exp(
    Math.log(x) * a + Math.log(1 - x) * b - lnBeta
  ) / a;

  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let c = 1;
  let result = d;

  for (let m = 1; m <= 200; m++) {
    let numerator = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + numerator * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + numerator / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    result *= d * c;

    numerator = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + numerator * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + numerator / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = d * c;
    result *= delta;

    if (Math.abs(delta - 1) < 1e-10) break;
  }

  return front * result;
}

function betaCDF(x: number, alpha: number, beta: number): number {
  return regularizedIncompleteBeta(x, alpha, beta);
}

export function buildAdoptionDistribution(
  posteriorProbability: number,
  confidenceLevel: string,
  signalCount: number,
  evidenceDiversityScore: number,
): AdoptionDistribution {
  const p = Math.max(0.01, Math.min(0.99, posteriorProbability));

  const confidenceMultiplier: Record<string, number> = {
    High: 1.0,
    Moderate: 0.65,
    Developing: 0.4,
    Low: 0.25,
  };
  const confMult = confidenceMultiplier[confidenceLevel] ?? 0.5;

  const signalConcentration = Math.min(signalCount, 15) * 1.5;
  const diversityBonus = evidenceDiversityScore * 5;

  const baseConcentration = 4;
  const concentration = baseConcentration + (signalConcentration + diversityBonus) * confMult;

  const alpha = p * concentration;
  const beta = (1 - p) * concentration;

  const safeAlpha = Math.max(alpha, 1.01);
  const safeBeta = Math.max(beta, 1.01);

  const mean = safeAlpha / (safeAlpha + safeBeta);
  const variance = (safeAlpha * safeBeta) / ((safeAlpha + safeBeta) ** 2 * (safeAlpha + safeBeta + 1));
  const mode = (safeAlpha > 1 && safeBeta > 1)
    ? (safeAlpha - 1) / (safeAlpha + safeBeta - 2)
    : null;

  return { alpha: safeAlpha, beta: safeBeta, mean, variance, mode, concentration: safeAlpha + safeBeta };
}

export function computeReadinessScore(gates: GateConstraint[]): number {
  if (gates.length === 0) return 1.0;
  let score = 1.0;
  for (const gate of gates) {
    const severity = GATE_SEVERITY[gate.status] ?? 0;
    score *= (1 - severity);
  }
  return Number(Math.max(0, Math.min(1, score)).toFixed(4));
}

export function computeAchievableCeiling(gates: GateConstraint[]): number {
  if (gates.length === 0) return 1.0;
  let ceiling = 1.0;
  for (const gate of gates) {
    const severity = GATE_SEVERITY[gate.status] ?? 0;
    if (severity === 0) continue;
    const bindingFraction = severity;
    const gateCeiling = 1.0 - bindingFraction * (1.0 - gate.constrains_probability_to);
    ceiling = Math.min(ceiling, gateCeiling);
  }
  return Number(Math.max(0.02, Math.min(1, ceiling)).toFixed(4));
}

export function applyGateConstraints(
  dist: AdoptionDistribution,
  gates: GateConstraint[],
): { adjusted: AdoptionDistribution; adjustments: GateAdjustment[]; achievableCeiling: number } {
  const adjustments: GateAdjustment[] = [];
  const achievableCeiling = computeAchievableCeiling(gates);

  let alpha = dist.alpha;
  let beta = dist.beta;
  const concentration = alpha + beta;
  const currentMean = alpha / concentration;

  if (currentMean > achievableCeiling && achievableCeiling < 1.0) {
    const targetMean = achievableCeiling;
    const newAlpha = targetMean * concentration;
    const newBeta = (1 - targetMean) * concentration;
    const alphaShift = newAlpha - alpha;
    const betaShift = newBeta - beta;

    alpha = Math.max(1.01, newAlpha);
    beta = Math.max(1.01, newBeta);

    const activeGateCount = gates.filter(g => (GATE_SEVERITY[g.status] ?? 0) > 0).length;
    for (const gate of gates) {
      const severity = GATE_SEVERITY[gate.status] ?? 0;
      if (severity === 0) continue;
      adjustments.push({
        gate_id: gate.gate_id,
        gate_label: gate.gate_label,
        alphaShift: Number((alphaShift / activeGateCount).toFixed(4)),
        betaShift: Number((betaShift / activeGateCount).toFixed(4)),
        reason: `${gate.gate_label} (${gate.status}): ceiling ${(computeAchievableCeiling([gate]) * 100).toFixed(0)}% — constrains achievable outcome range`,
      });
    }
  } else {
    for (const gate of gates) {
      const severity = GATE_SEVERITY[gate.status] ?? 0;
      if (severity === 0) continue;
      adjustments.push({
        gate_id: gate.gate_id,
        gate_label: gate.gate_label,
        alphaShift: 0,
        betaShift: 0,
        reason: `${gate.gate_label} (${gate.status}): distribution already within achievable range`,
      });
    }
  }

  const mean = alpha / (alpha + beta);
  const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
  const mode = (alpha > 1 && beta > 1)
    ? (alpha - 1) / (alpha + beta - 2)
    : null;

  return {
    adjusted: { alpha, beta, mean, variance, mode, concentration: alpha + beta },
    adjustments,
    achievableCeiling,
  };
}

export function probabilityOfThreshold(dist: AdoptionDistribution, threshold: number): number {
  const t = Math.max(0, Math.min(1, threshold));
  const pBelow = betaCDF(t, dist.alpha, dist.beta);
  return Math.max(0, Math.min(1, 1 - pBelow));
}

export function detectGateDomination(
  unconstrained: AdoptionDistribution,
  constrained: AdoptionDistribution,
  threshold: number,
  achievableCeiling: number,
  readinessScore: number,
): GateDominationDiagnostic {
  const unconstrainedProb = probabilityOfThreshold(unconstrained, threshold);
  const constrainedProb = probabilityOfThreshold(constrained, threshold);

  const gateImpact = Math.abs(unconstrainedProb - constrainedProb);
  const gateImpactRatio = unconstrainedProb > 0.01
    ? gateImpact / unconstrainedProb
    : 0;

  const gateDominated = gateImpactRatio > 0.5 && gateImpact > 0.05;

  const warning = gateDominated
    ? `Gate Domination Warning: Gate constraints account for ${(gateImpactRatio * 100).toFixed(0)}% of the probability reduction (${(gateImpact * 100).toFixed(1)}pp). Probability is primarily determined by constraint status rather than signal evidence. Readiness: ${(readinessScore * 100).toFixed(0)}%.`
    : null;

  return {
    gateDominated,
    warning,
    unconstrainedProbability: Number(unconstrainedProb.toFixed(4)),
    constrainedProbability: Number(constrainedProb.toFixed(4)),
    gateImpactRatio: Number(gateImpactRatio.toFixed(4)),
    achievableCeiling,
    readinessScore,
  };
}

export function computeDistributionForecast(
  posteriorProbability: number,
  confidenceLevel: string,
  signalCount: number,
  evidenceDiversityScore: number,
  gates: GateConstraint[],
  outcomeThresholdRaw: string | number | null | undefined,
): DistributionResult {
  const unconstrained = buildAdoptionDistribution(
    posteriorProbability,
    confidenceLevel,
    signalCount,
    evidenceDiversityScore,
  );

  const { adjusted: constrained, adjustments: gateAdjustments, achievableCeiling } = applyGateConstraints(unconstrained, gates);
  const readinessScore = computeReadinessScore(gates);

  let outcomeThreshold: number;
  if (typeof outcomeThresholdRaw === "number") {
    outcomeThreshold = outcomeThresholdRaw;
  } else if (typeof outcomeThresholdRaw === "string") {
    const m = outcomeThresholdRaw.match(/(\d+(?:\.\d+)?)\s*%/);
    outcomeThreshold = m ? parseFloat(m[1]) / 100 : 0.5;
  } else {
    outcomeThreshold = 0.5;
  }

  const thresholdProbability = probabilityOfThreshold(constrained, outcomeThreshold);

  const gateDomination = detectGateDomination(
    unconstrained,
    constrained,
    outcomeThreshold,
    achievableCeiling,
    readinessScore,
  );

  return {
    unconstrained,
    constrained,
    thresholdProbability,
    outcomeThreshold,
    gateAdjustments,
    readinessScore,
    achievableCeiling,
    gateDomination,
  };
}

export function computeThresholdSensitivity(
  dist: AdoptionDistribution,
  baseThreshold: number,
): Array<{ threshold: number; probability: number }> {
  const points: Array<{ threshold: number; probability: number }> = [];
  const step = 0.05;
  for (let t = 0.05; t <= 0.95; t += step) {
    points.push({
      threshold: Number(t.toFixed(2)),
      probability: Number(probabilityOfThreshold(dist, t).toFixed(4)),
    });
  }
  return points;
}
