import type { Signal } from "@workspace/db";
import { runDependencyAnalysis, type DependencyAnalysisResult } from "./signal-dependency-engine.js";

export interface EchoCheckResult {
  check: "evidence_echo";
  passed: boolean;
  echoesDetected: number;
  compressedCount: number;
  redundancyPenalty: number;
  independentEvidenceCount: number;
  totalSignalCount: number;
  clusters: Array<{
    rootDescription: string;
    clusterSize: number;
    echoCount: number;
    translationCount: number;
  }>;
  summary: string;
}

export interface AnchorCheckResult {
  check: "anchor_bias";
  passed: boolean;
  directionChangeDetected: boolean;
  priorDirection: "positive" | "negative" | "neutral";
  currentDirection: "positive" | "negative" | "neutral";
  updateSensitivityMultiplier: number;
  confidenceStabilityReduction: number;
  conflictingSignals: number;
  alignedSignals: number;
  summary: string;
}

export interface MissingSignalCheckResult {
  check: "missing_signal";
  passed: boolean;
  implicitNegativeSignals: Array<{
    category: string;
    expectedEvent: string;
    absence: string;
    impliedLr: number;
  }>;
  totalImplicitNegatives: number;
  adjustedLrProduct: number;
  summary: string;
}

export interface CorrelationCheckResult {
  check: "correlation";
  passed: boolean;
  correlatedPairs: Array<{
    signalA: string;
    signalB: string;
    sharedDriver: string;
    independenceReduction: number;
  }>;
  adjustedIndependenceScore: number;
  rawIndependenceScore: number;
  causalDrivers: string[];
  independentEvidenceCount: number;
  summary: string;
}

export interface OverconfidenceCheckResult {
  check: "overconfidence";
  passed: boolean;
  uncertaintyRange: { low: number; high: number };
  volatilityScore: number;
  signalConcentration: number;
  fragility: number;
  diversityScore: number;
  summary: string;
}

export interface CalibrationChecksResult {
  checksRun: number;
  checksPassed: number;
  checksFailed: number;
  independentEvidenceCount: number;
  totalSignalCount: number;
  independenceRatio: number;
  adjustedProbability: number;
  uncertaintyRange: { low: number; high: number };
  volatilityScore: number;
  evidenceEcho: EchoCheckResult;
  anchorBias: AnchorCheckResult;
  missingSignal: MissingSignalCheckResult;
  correlation: CorrelationCheckResult;
  overconfidence: OverconfidenceCheckResult;
}

const EXPECTED_SIGNAL_CATEGORIES: Record<string, Array<{ category: string; expectedEvent: string; absence: string; impliedLr: number }>> = {
  clinical: [
    { category: "Safety", expectedEvent: "Phase III safety data published", absence: "No safety data available — risk unquantified", impliedLr: 0.9 },
    { category: "Guideline", expectedEvent: "Major guideline body has reviewed evidence", absence: "No guideline review — adoption pathway unclear", impliedLr: 0.92 },
    { category: "Real-world evidence", expectedEvent: "Real-world validation of trial results", absence: "No RWE confirmation — trial-practice gap unknown", impliedLr: 0.93 },
  ],
  regulatory: [
    { category: "Advisory committee", expectedEvent: "Advisory committee review completed", absence: "No advisory committee input — regulatory sentiment unknown", impliedLr: 0.88 },
    { category: "Safety", expectedEvent: "Post-marketing safety assessment", absence: "No post-marketing safety data", impliedLr: 0.9 },
    { category: "Regulatory precedent", expectedEvent: "Comparable class approval precedent", absence: "No class precedent — novel regulatory territory", impliedLr: 0.85 },
  ],
  adoption: [
    { category: "Payer/access", expectedEvent: "Payer coverage determination", absence: "No payer coverage signal — access pathway unknown", impliedLr: 0.88 },
    { category: "KOL endorsement", expectedEvent: "Key opinion leader public endorsement", absence: "No KOL endorsement — physician awareness gap", impliedLr: 0.92 },
    { category: "Competitive", expectedEvent: "Competitive landscape assessment", absence: "No competitive intelligence — market position unclear", impliedLr: 0.9 },
  ],
  default: [
    { category: "Safety", expectedEvent: "Safety profile assessment", absence: "No safety data available", impliedLr: 0.92 },
    { category: "Competitive", expectedEvent: "Competitive environment analysis", absence: "No competitive signal", impliedLr: 0.93 },
  ],
};

const CAUSAL_DRIVER_KEYWORDS: Record<string, string[]> = {
  "trial_efficacy": ["phase III", "phase 3", "primary endpoint", "met endpoint", "efficacy", "pivotal trial", "clinical outcome", "hazard ratio", "p-value"],
  "regulatory_pathway": ["FDA", "EMA", "CHMP", "advisory committee", "approval", "regulatory", "review division", "BLA", "NDA", "MAA"],
  "safety_profile": ["safety", "adverse", "ARIA", "side effect", "toxicity", "death", "mortality", "black box", "REMS", "contraindication"],
  "payer_access": ["payer", "coverage", "formulary", "prior authorization", "reimbursement", "copay", "cost", "price", "rebate", "Part D", "Medicare"],
  "guideline_adoption": ["guideline", "ACC", "AHA", "ASCO", "NCCN", "recommendation", "first-line", "standard of care"],
  "kol_influence": ["KOL", "key opinion leader", "expert", "conference", "presentation", "endorsement", "thought leader"],
  "competitive_pressure": ["competitor", "competitive", "market share", "switch", "displacement", "alternative", "generic", "biosimilar"],
};

function detectCaseCategory(signals: Signal[], questionText: string): string {
  const combined = `${questionText} ${signals.map(s => s.signalDescription ?? "").join(" ")}`.toLowerCase();
  if (combined.includes("approve") || combined.includes("regulatory") || combined.includes("fda") || combined.includes("ema")) return "regulatory";
  if (combined.includes("endpoint") || combined.includes("trial") || combined.includes("clinical outcome") || combined.includes("phase iii")) return "clinical";
  if (combined.includes("adopt") || combined.includes("prescri") || combined.includes("market share") || combined.includes("formulary")) return "adoption";
  return "default";
}

function detectCausalDriver(desc: string): string | null {
  const lower = desc.toLowerCase();
  let bestDriver: string | null = null;
  let bestScore = 0;
  for (const [driver, keywords] of Object.entries(CAUSAL_DRIVER_KEYWORDS)) {
    const score = keywords.filter(kw => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestDriver = driver;
    }
  }
  return bestScore >= 1 ? bestDriver : null;
}

function runEchoCheck(signals: Signal[], depAnalysis: DependencyAnalysisResult): EchoCheckResult {
  const echoesDetected = depAnalysis.clusters.reduce((sum, c) => sum + c.echoCount, 0);
  const compressedCount = depAnalysis.compressedSignals.filter(s => s.compressionFactor < 1).length;
  const redundancyPenalty = depAnalysis.metrics.concentrationPenalty;
  const independentEvidenceCount = depAnalysis.metrics.independentEvidenceFamilies;

  const clusters = depAnalysis.clusters.map(c => ({
    rootDescription: c.rootSignal.signal.signalDescription?.slice(0, 100) ?? "",
    clusterSize: c.clusterSignalCount,
    echoCount: c.echoCount,
    translationCount: c.translationCount,
  }));

  const hasEchoes = echoesDetected > 0;
  return {
    check: "evidence_echo",
    passed: !hasEchoes,
    echoesDetected,
    compressedCount,
    redundancyPenalty,
    independentEvidenceCount,
    totalSignalCount: signals.length,
    clusters,
    summary: hasEchoes
      ? `${echoesDetected} echo(es) detected — ${independentEvidenceCount} independent evidence families after compression (${signals.length} raw signals, ${compressedCount} compressed).`
      : `${independentEvidenceCount} independent evidence families identified. No echoes detected.`,
  };
}

function runAnchorCheck(
  signals: Signal[],
  priorProbability: number,
  currentProbability: number,
): AnchorCheckResult {
  const positiveSignals = signals.filter(s => (s.direction ?? "").toLowerCase() === "positive");
  const negativeSignals = signals.filter(s => (s.direction ?? "").toLowerCase() === "negative");

  const priorDirection: "positive" | "negative" | "neutral" =
    priorProbability > 0.55 ? "positive" : priorProbability < 0.45 ? "negative" : "neutral";
  const netSignalDirection = positiveSignals.length - negativeSignals.length;
  const currentDirection: "positive" | "negative" | "neutral" =
    netSignalDirection > 1 ? "positive" : netSignalDirection < -1 ? "negative" : "neutral";

  const directionChangeDetected = priorDirection !== "neutral" && currentDirection !== "neutral" && priorDirection !== currentDirection;

  let updateSensitivityMultiplier = 1.0;
  let confidenceStabilityReduction = 0;

  if (directionChangeDetected) {
    updateSensitivityMultiplier = 1.25;
    confidenceStabilityReduction = 0.15;
  } else if (positiveSignals.length > 0 && negativeSignals.length > 0) {
    const conflictRatio = Math.min(positiveSignals.length, negativeSignals.length) / Math.max(positiveSignals.length, negativeSignals.length);
    if (conflictRatio > 0.6) {
      updateSensitivityMultiplier = 1.1;
      confidenceStabilityReduction = 0.05;
    }
  }

  return {
    check: "anchor_bias",
    passed: !directionChangeDetected,
    directionChangeDetected,
    priorDirection,
    currentDirection,
    updateSensitivityMultiplier,
    confidenceStabilityReduction,
    conflictingSignals: Math.min(positiveSignals.length, negativeSignals.length),
    alignedSignals: Math.max(positiveSignals.length, negativeSignals.length),
    summary: directionChangeDetected
      ? `Direction change detected: prior was ${priorDirection} (${(priorProbability * 100).toFixed(0)}%) but signal evidence points ${currentDirection}. Update sensitivity increased by ${Math.round((updateSensitivityMultiplier - 1) * 100)}%. Confidence stability reduced.`
      : `No anchor bias detected. Prior direction (${priorDirection}) aligns with evidence direction (${currentDirection}).`,
  };
}

function runMissingSignalCheck(
  signals: Signal[],
  questionText: string,
): MissingSignalCheckResult {
  const category = detectCaseCategory(signals, questionText);
  const expectedCategories = EXPECTED_SIGNAL_CATEGORIES[category] ?? EXPECTED_SIGNAL_CATEGORIES.default;

  const CATEGORY_SIGNAL_TYPE_MAP: Record<string, string[]> = {
    "Safety": ["safety", "adverse event", "tolerability"],
    "Guideline": ["guideline consensus", "guideline", "clinical guideline"],
    "Real-world evidence": ["real-world evidence", "rwe", "observational"],
    "Advisory committee": ["advisory committee", "adcom", "advisory"],
    "Regulatory precedent": ["regulatory precedent", "regulatory", "precedent"],
    "Payer/access": ["payer", "access / commercial", "access", "reimbursement", "coverage"],
    "KOL endorsement": ["kol", "kol endorsement", "key opinion leader", "expert opinion"],
    "Competitive": ["competitive", "competitive intelligence", "market competition"],
  };

  const presentTypes = new Set<string>();
  for (const s of signals) {
    const type = (s.signalType ?? "").toLowerCase().trim();
    const desc = (s.signalDescription ?? "").toLowerCase();
    for (const exp of expectedCategories) {
      const mappedTypes = CATEGORY_SIGNAL_TYPE_MAP[exp.category] ?? [];
      const catLower = exp.category.toLowerCase();
      const typeMatch = mappedTypes.some(mt => type.includes(mt) || type === mt);
      const descMatch = desc.includes(catLower) || mappedTypes.some(mt => desc.includes(mt));
      if (typeMatch || descMatch) {
        presentTypes.add(exp.category);
      }
    }
  }

  const implicitNegativeSignals = expectedCategories.filter(exp => !presentTypes.has(exp.category));

  let adjustedLrProduct = 1.0;
  for (const neg of implicitNegativeSignals) {
    adjustedLrProduct *= neg.impliedLr;
  }

  return {
    check: "missing_signal",
    passed: implicitNegativeSignals.length === 0,
    implicitNegativeSignals,
    totalImplicitNegatives: implicitNegativeSignals.length,
    adjustedLrProduct,
    summary: implicitNegativeSignals.length > 0
      ? `${implicitNegativeSignals.length} expected signal category(ies) missing: ${implicitNegativeSignals.map(n => n.category).join(", ")}. Implicit negative adjustment factor: ${adjustedLrProduct.toFixed(3)}.`
      : "All expected signal categories are represented. No missing signal adjustment needed.",
  };
}

function runCorrelationCheck(signals: Signal[], depAnalysis: DependencyAnalysisResult): CorrelationCheckResult {
  const independentFamilies = depAnalysis.metrics.independentEvidenceFamilies;
  const signalDrivers: Array<{ signalId: string; description: string; drivers: string[] }> = [];

  for (const s of signals) {
    const desc = s.signalDescription ?? "";
    const drivers: string[] = [];
    for (const [driver, keywords] of Object.entries(CAUSAL_DRIVER_KEYWORDS)) {
      const matches = keywords.filter(kw => desc.toLowerCase().includes(kw)).length;
      if (matches >= 1) drivers.push(driver);
    }
    signalDrivers.push({ signalId: s.signalId, description: desc.slice(0, 80), drivers });
  }

  const correlatedPairs: CorrelationCheckResult["correlatedPairs"] = [];
  const causalDriverSet = new Set<string>();

  for (let i = 0; i < signalDrivers.length; i++) {
    for (let j = i + 1; j < signalDrivers.length; j++) {
      const shared = signalDrivers[i].drivers.filter(d => signalDrivers[j].drivers.includes(d));
      if (shared.length > 0) {
        for (const driver of shared) {
          causalDriverSet.add(driver);
          correlatedPairs.push({
            signalA: signalDrivers[i].description,
            signalB: signalDrivers[j].description,
            sharedDriver: driver,
            independenceReduction: 0.15 * shared.length,
          });
        }
      }
    }
  }

  const uniqueDrivers = [...causalDriverSet];
  const rawIndependenceScore = signals.length > 0
    ? independentFamilies / signals.length
    : 1.0;
  const correlationPenalty = Math.min(correlatedPairs.length * 0.05, 0.4);
  const adjustedIndependenceScore = Math.max(0.2, rawIndependenceScore - correlationPenalty);

  return {
    check: "correlation",
    passed: correlatedPairs.length <= 2,
    correlatedPairs: correlatedPairs.slice(0, 10),
    adjustedIndependenceScore,
    rawIndependenceScore: Number(rawIndependenceScore.toFixed(2)),
    causalDrivers: uniqueDrivers,
    independentEvidenceCount: independentFamilies,
    summary: correlatedPairs.length > 0
      ? `${correlatedPairs.length} correlated signal pair(s) sharing ${uniqueDrivers.length} causal driver(s): ${uniqueDrivers.join(", ")}. ${independentFamilies} independent evidence families from ${signals.length} signals. Independence score: ${adjustedIndependenceScore.toFixed(2)}.`
      : `No shared causal drivers detected. ${independentFamilies} independent evidence families from ${signals.length} signals. Full independence assumed.`,
  };
}

function runOverconfidenceCheck(
  probability: number,
  signals: Signal[],
  depAnalysis: DependencyAnalysisResult,
  correlationResult: CorrelationCheckResult,
): OverconfidenceCheckResult {
  const fragility = depAnalysis.metrics.posteriorFragilityScore;
  const diversity = depAnalysis.metrics.evidenceDiversityScore;
  const independentFamilies = depAnalysis.metrics.independentEvidenceFamilies;

  const signalConcentration = independentFamilies > 0 && signals.length > 0
    ? 1 - (independentFamilies / Math.max(signals.length, 1))
    : 1.0;

  const positiveCount = signals.filter(s => (s.direction ?? "").toLowerCase() === "positive").length;
  const negativeCount = signals.filter(s => (s.direction ?? "").toLowerCase() === "negative").length;
  const directionBalance = independentFamilies > 0
    ? Math.abs(positiveCount - negativeCount) / independentFamilies
    : 0;

  const volatilityBase = (fragility * 0.3) + (signalConcentration * 0.25) + ((1 - diversity) * 0.2) + ((1 - correlationResult.adjustedIndependenceScore) * 0.15) + (directionBalance * 0.1);
  const volatilityScore = Math.min(1.0, Math.max(0, volatilityBase));

  const baseWidth = 0.08;
  const volatilityWidth = volatilityScore * 0.20;
  const familyPenalty = independentFamilies <= 2 ? 0.06 : independentFamilies <= 4 ? 0.03 : 0;
  const halfWidth = baseWidth + volatilityWidth + familyPenalty;

  const low = Math.max(0.01, probability - halfWidth);
  const high = Math.min(0.99, probability + halfWidth);

  const isOverconfident = volatilityScore > 0.5 || (halfWidth > 0.15 && (probability > 0.85 || probability < 0.15));

  return {
    check: "overconfidence",
    passed: !isOverconfident,
    uncertaintyRange: { low: Number(low.toFixed(4)), high: Number(high.toFixed(4)) },
    volatilityScore: Number(volatilityScore.toFixed(3)),
    signalConcentration: Number(signalConcentration.toFixed(3)),
    fragility: Number(fragility.toFixed(3)),
    diversityScore: Number(diversity.toFixed(3)),
    summary: isOverconfident
      ? `Overconfidence risk detected. Volatility score: ${(volatilityScore * 100).toFixed(0)}%. Uncertainty range: ${(low * 100).toFixed(1)}%–${(high * 100).toFixed(1)}%. Evidence diversity: ${(diversity * 100).toFixed(0)}%. Fragility: ${(fragility * 100).toFixed(0)}%.`
      : `Probability ${(probability * 100).toFixed(1)}% within acceptable confidence bounds. Uncertainty range: ${(low * 100).toFixed(1)}%–${(high * 100).toFixed(1)}%. Volatility: ${(volatilityScore * 100).toFixed(0)}%.`,
  };
}

export function runCalibrationChecks(
  signals: Signal[],
  priorProbability: number,
  currentProbability: number,
  questionText: string,
): CalibrationChecksResult {
  if (signals.length === 0) {
    const emptyResult: CalibrationChecksResult = {
      checksRun: 5,
      checksPassed: 5,
      checksFailed: 0,
      independentEvidenceCount: 0,
      totalSignalCount: 0,
      independenceRatio: 0,
      adjustedProbability: currentProbability,
      uncertaintyRange: { low: Math.max(0.01, currentProbability - 0.15), high: Math.min(0.99, currentProbability + 0.15) },
      volatilityScore: 0,
      evidenceEcho: { check: "evidence_echo", passed: true, echoesDetected: 0, compressedCount: 0, redundancyPenalty: 0, independentEvidenceCount: 0, totalSignalCount: 0, clusters: [], summary: "No signals to check." },
      anchorBias: { check: "anchor_bias", passed: true, directionChangeDetected: false, priorDirection: "neutral", currentDirection: "neutral", updateSensitivityMultiplier: 1.0, confidenceStabilityReduction: 0, conflictingSignals: 0, alignedSignals: 0, summary: "No signals to check." },
      missingSignal: { check: "missing_signal", passed: true, implicitNegativeSignals: [], totalImplicitNegatives: 0, adjustedLrProduct: 1.0, summary: "No signals to check." },
      correlation: { check: "correlation", passed: true, correlatedPairs: [], adjustedIndependenceScore: 1.0, rawIndependenceScore: 1.0, causalDrivers: [], independentEvidenceCount: 0, summary: "No signals to check." },
      overconfidence: { check: "overconfidence", passed: true, uncertaintyRange: { low: Math.max(0.01, currentProbability - 0.15), high: Math.min(0.99, currentProbability + 0.15) }, volatilityScore: 0, signalConcentration: 0, fragility: 0, diversityScore: 0, summary: "No signals — prior probability only." },
    };
    return emptyResult;
  }

  const depAnalysis = runDependencyAnalysis(signals);

  const echoCheck = runEchoCheck(signals, depAnalysis);
  const anchorCheck = runAnchorCheck(signals, priorProbability, currentProbability);
  const missingCheck = runMissingSignalCheck(signals, questionText);
  const correlationCheck = runCorrelationCheck(signals, depAnalysis);
  const overconfidenceCheck = runOverconfidenceCheck(currentProbability, signals, depAnalysis, correlationCheck);

  let adjustedProbability = currentProbability;

  if (missingCheck.adjustedLrProduct < 1.0) {
    const missingShift = (1 - missingCheck.adjustedLrProduct) * 0.5;
    adjustedProbability = adjustedProbability * (1 - missingShift);
  }

  if (correlationCheck.adjustedIndependenceScore < 0.8) {
    const extremeness = Math.abs(adjustedProbability - 0.5);
    const dampeningFactor = (1 - correlationCheck.adjustedIndependenceScore) * 0.3;
    adjustedProbability = 0.5 + (adjustedProbability - 0.5) * (1 - dampeningFactor);
  }

  adjustedProbability = Math.max(0.01, Math.min(0.99, Number(adjustedProbability.toFixed(4))));

  const checks = [echoCheck, anchorCheck, missingCheck, correlationCheck, overconfidenceCheck];
  const passed = checks.filter(c => c.passed).length;

  return {
    checksRun: 5,
    checksPassed: passed,
    checksFailed: 5 - passed,
    independentEvidenceCount: echoCheck.independentEvidenceCount,
    totalSignalCount: signals.length,
    independenceRatio: signals.length > 0
      ? Number((echoCheck.independentEvidenceCount / signals.length).toFixed(2))
      : 0,
    adjustedProbability,
    uncertaintyRange: overconfidenceCheck.uncertaintyRange,
    volatilityScore: overconfidenceCheck.volatilityScore,
    evidenceEcho: echoCheck,
    anchorBias: anchorCheck,
    missingSignal: missingCheck,
    correlation: correlationCheck,
    overconfidence: overconfidenceCheck,
  };
}
