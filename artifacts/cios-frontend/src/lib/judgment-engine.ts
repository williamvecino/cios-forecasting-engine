import { decomposeConstraints, enforceDecomposition, type ConstraintDecomposition } from "./constraint-drivers";
import { differentiateSignals, detectSignalImbalance, type SignalHierarchy, type SignalImbalance, type DifferentiatedSignal, type SignalTier } from "./signal-differentiation";

interface EventGate {
  gate_id: string;
  gate_label: string;
  description: string;
  status: string;
  reasoning: string;
  constrains_probability_to: number;
}

interface Driver {
  id: string;
  name: string;
  direction: "Upward" | "Downward";
  strength: "Low" | "Medium" | "High";
  contributionPoints: number;
}

interface AnalogMatch {
  caseId: string;
  therapyArea: string | null;
  specialty: string | null;
  productType: string | null;
  evidenceType: string | null;
  assetName: string | null;
  diseaseState: string | null;
  finalObservedOutcome: string | null;
  keyBarrier: string | null;
  keyEnabler: string | null;
  similarityScore: number;
  confidenceBand: "High" | "Moderate" | "Low";
  matchedDimensions: string[];
  keyDifferences: string[];
  adoptionLesson: string;
  finalProbability: number | null;
}

interface AnalogContext {
  topMatches: AnalogMatch[];
  calibratedCount: number;
  scenarios: {
    optimistic: { probability: number; analogCaseId: string; rationale: string } | null;
    base: { probability: number; rationale: string; sampleSize: number } | null;
    pessimistic: { probability: number; analogCaseId: string; rationale: string } | null;
  };
}

export interface JudgmentInput {
  priorPct: number;
  brandOutlookPct: number;
  finalForecastPct: number;
  minGateCapPct: number;
  executionGapPts: number;
  gates: EventGate[];
  drivers: Driver[];
  analogContext: AnalogContext | null;
  questionText: string;
}

type ConfidenceLevel = "High" | "Moderate" | "Low";
type UncertaintyType = "missing_evidence" | "conflicting_signals" | "gating_barriers" | "weak_evidence" | "well_resolved";

interface ReversalTrigger {
  description: string;
  direction: "upward" | "downward";
  gate?: string;
}

interface AnalogPatternSummary {
  patternLabel: string;
  description: string;
  analogCaseId: string | null;
  analogProbability: number | null;
  similarityScore: number;
}

export interface AnalogCaseDetail {
  caseId: string;
  brand: string;
  indication: string;
  similarity: string;
  outcome: string;
  lesson: string;
  confidence: "High" | "Moderate" | "Low";
  keyBarrier: string | null;
  keyEnabler: string | null;
  similarityScore: number;
  matchedDimensions: string[];
  keyDifferences: string[];
}

interface MonitorItem {
  label: string;
  reason: string;
}

interface IntegrityCheck {
  rule: string;
  passed: boolean;
  detail: string;
}

interface ConfidenceAudit {
  gateResolutionScore: number;
  analogScore: number;
  convergenceScore: number;
  gateCountScore: number;
  conflictPenalty: number;
  gapPenalty: number;
  rawTotal: number;
  finalLevel: ConfidenceLevel;
}

interface OutcomeAudit {
  questionCategory: string;
  probabilityBand: string;
  ruleTriggered: string;
}

interface PostureAudit {
  ruleTriggered: string;
  caseType: string;
}

export interface RankedDriverAudit {
  name: string;
  impactScore: number;
  rank: "High" | "Moderate" | "Low";
}

export interface ConstraintDecompositionAudit {
  gateId: string;
  gateLabel: string;
  gateStatus: string;
  isAbstract: boolean;
  drivers: RankedDriverAudit[];
}

export interface JudgmentAudit {
  inputs: {
    priorPct: number;
    brandOutlookPct: number;
    finalForecastPct: number;
    minGateCapPct: number;
    executionGapPts: number;
    upwardDriverCount: number;
    downwardDriverCount: number;
    topPositiveDrivers: string[];
    topNegativeDrivers: string[];
    gateStates: { label: string; status: string; capPct: number }[];
  };
  confidenceAudit: ConfidenceAudit;
  outcomeAudit: OutcomeAudit;
  postureAudit: PostureAudit;
  integrityChecks: IntegrityCheck[];
  integrityPassed: boolean;
  constraintDecomposition: ConstraintDecompositionAudit[];
  signalImbalance: SignalImbalance;
}

export interface PrimaryConstraintDriver {
  name: string;
  rank: "High" | "Moderate" | "Low";
  impactScore: number;
}

export interface PrimaryConstraint {
  label: string;
  status: string;
  drivers: PrimaryConstraintDriver[];
  lever: string;
}

export interface ExecutiveJudgmentResult {
  mostLikelyOutcome: string;
  probability: number;
  confidence: ConfidenceLevel;
  reasoning: string;
  keyDrivers: string[];
  primaryConstraints: PrimaryConstraint[];
  signalHierarchy: SignalHierarchy;
  analogCases: AnalogCaseDetail[];
  analogPattern: AnalogPatternSummary | null;
  reversalTriggers: ReversalTrigger[];
  convergenceNote: string | null;
  decisionPosture: string;
  uncertaintyType: UncertaintyType;
  uncertaintyExplanation: string;
  monitorList: MonitorItem[];
  nextBestQuestion: string;
  caseType: string;
  _audit: JudgmentAudit;
}

function classifyCaseType(gates: EventGate[], drivers: Driver[]): string {
  const weakOrUnresolved = gates.filter(g => g.status === "weak" || g.status === "unresolved");
  const strongGates = gates.filter(g => g.status === "strong");
  const upwardDrivers = drivers.filter(d => d.direction === "Upward");
  const downwardDrivers = drivers.filter(d => d.direction === "Downward");

  const hasAccessBarrier = gates.some(g =>
    /access|payer|reimbursement|formulary|authorization/i.test(g.gate_label) &&
    (g.status === "weak" || g.status === "unresolved")
  );
  const hasEvidenceStrength = gates.some(g =>
    /evidence|clinical|efficacy|trial/i.test(g.gate_label) &&
    (g.status === "strong" || g.status === "moderate")
  );
  const hasTimingRisk = gates.some(g =>
    /time|horizon|timeline|feasibility/i.test(g.gate_label) &&
    (g.status === "weak" || g.status === "unresolved")
  );

  if (hasEvidenceStrength && hasAccessBarrier) return "Strong Evidence — Access Constrained";
  if (weakOrUnresolved.length >= gates.length * 0.6) return "Early Stage — Multiple Unresolved Gates";
  if (strongGates.length >= gates.length * 0.6) return "Favorable Conditions — Adoption Aligned";
  if (hasTimingRisk && upwardDrivers.length > downwardDrivers.length) return "Positive Signals — Timeline Risk";
  if (downwardDrivers.length > upwardDrivers.length * 1.5) return "Headwind Dominant";
  return "Mixed Signals — Outcome Dependent on Gate Resolution";
}

function categorizeQuestion(questionText: string): string {
  const q = questionText.toLowerCase();
  if (/launch|approval|fda|ema|regulatory/i.test(q)) return "launch";
  if (/adopt|prescrib|uptake|utiliz/i.test(q)) return "adoption";
  if (/share|market position|displacement|competitive/i.test(q)) return "share";
  if (/guideline|nccn|recommendation|inclusion/i.test(q)) return "guideline";
  if (/payer|access|reimbursement|coverage|formulary/i.test(q)) return "access";
  if (/account|target|segment|who adopt/i.test(q)) return "segment";
  return "general";
}

const OUTCOME_TEMPLATES: Record<string, { high: string; mid: string; low: string }> = {
  launch: {
    high: "Launch or approval is on track within the forecast window",
    mid: "Launch timing is uncertain — a delay remains plausible",
    low: "A delay is more likely than on-time approval",
  },
  adoption: {
    high: "Meaningful adoption is likely within the forecast window",
    mid: "Moderate adoption is possible, but not yet certain",
    low: "Adoption is constrained — current barriers limit near-term uptake",
  },
  share: {
    high: "Share gain or competitive advantage is likely",
    mid: "Market position is uncertain — share stabilization is the safer assumption",
    low: "Share loss or competitive pressure is more likely",
  },
  guideline: {
    high: "Guideline inclusion is likely within the forecast window",
    mid: "Guideline update timing remains uncertain",
    low: "Guideline inclusion is unlikely within the forecast window",
  },
  access: {
    high: "A favorable access outcome is likely",
    mid: "The access pathway is uncertain — mixed payer signals",
    low: "Access barriers are likely to persist",
  },
  segment: {
    high: "Adoption is concentrated in the targeted segment",
    mid: "Adoption patterns across segments remain uncertain",
    low: "Broad adoption is unlikely — a segment-specific strategy is needed",
  },
  general: {
    high: "A favorable outcome is likely within the forecast window",
    mid: "The outcome is uncertain — competing scenarios remain plausible",
    low: "An unfavorable outcome is more likely given current evidence",
  },
};

type OutcomePolarity = "positive" | "neutral" | "negative";

function inferOutcome(category: string, pct: number, hasHardCap: boolean, upCount: number, downCount: number): { verdict: string; band: string; rule: string; polarity: OutcomePolarity } {
  const template = OUTCOME_TEMPLATES[category] || OUTCOME_TEMPLATES.general;

  if (pct >= 60) {
    return { verdict: template.high, band: ">=60", rule: `${category}_high_band`, polarity: "positive" };
  }
  if (pct >= 40) {
    return { verdict: template.mid, band: "40-59", rule: `${category}_mid_band`, polarity: "neutral" };
  }

  return { verdict: template.low, band: "<40", rule: `${category}_low_band${hasHardCap && upCount > downCount ? "_gate_constrained" : ""}`, polarity: "negative" };
}

function computeConfidence(
  gates: EventGate[],
  analogContext: AnalogContext | null,
  brandPct: number,
  finalPct: number,
  drivers: Driver[]
): ConfidenceAudit {
  const resolvedGates = gates.filter(g => g.status === "strong" || g.status === "moderate");
  const gateResolutionScore = Math.round((resolvedGates.length / Math.max(gates.length, 1)) * 30);

  let analogScore = 0;
  if (analogContext) {
    const highAnalogs = analogContext.topMatches.filter(m => m.confidenceBand === "High");
    analogScore += Math.min(highAnalogs.length * 10, 30);
    if (analogContext.calibratedCount >= 3) analogScore += 10;
  }

  const gap = Math.abs(brandPct - finalPct);
  let convergenceScore = 0;
  let gapPenalty = 0;
  if (gap < 10) convergenceScore = 20;
  else if (gap < 20) convergenceScore = 10;
  else if (gap >= 35) gapPenalty = 25;
  else if (gap >= 25) gapPenalty = 15;

  const gateCountScore = gates.length >= 3 ? 10 : 0;

  let conflictPenalty = 0;
  const up = drivers.filter(d => d.direction === "Upward" && d.contributionPoints > 0);
  const down = drivers.filter(d => d.direction === "Downward" && d.contributionPoints < 0);
  if (up.length > 0 && down.length > 0 && Math.abs(up.length - down.length) <= 2) {
    conflictPenalty = 10;
  }

  const rawTotal = gateResolutionScore + analogScore + convergenceScore + gateCountScore - gapPenalty - conflictPenalty;

  let finalLevel: ConfidenceLevel;
  if (rawTotal >= 60) finalLevel = "High";
  else if (rawTotal >= 35) finalLevel = "Moderate";
  else finalLevel = "Low";

  return {
    gateResolutionScore,
    analogScore,
    convergenceScore,
    gateCountScore,
    conflictPenalty,
    gapPenalty,
    rawTotal,
    finalLevel,
  };
}

function classifyUncertainty(
  gates: EventGate[],
  drivers: Driver[],
  confidence: ConfidenceLevel,
  brandPct: number,
  finalPct: number
): { type: UncertaintyType; explanation: string } {
  const gap = Math.abs(brandPct - finalPct);
  const upDrivers = drivers.filter(d => d.direction === "Upward" && d.contributionPoints > 0);
  const downDrivers = drivers.filter(d => d.direction === "Downward" && d.contributionPoints < 0);
  const hasConflict = upDrivers.length > 0 && downDrivers.length > 0;

  if (confidence === "High" && gap < 20 && !hasConflict) {
    return {
      type: "well_resolved",
      explanation: "We have a clear picture. The evidence is consistent, key conditions are mostly resolved, and similar prior cases reinforce this view.",
    };
  }

  if (gap >= 20) {
    const constraintGates = gates.filter(g => g.status === "weak" || g.status === "unresolved" || g.status === "moderate");
    const constraintNames = constraintGates.slice(0, 2).map(g => g.gate_label).join(" and ");
    return {
      type: "gating_barriers",
      explanation: `The underlying evidence supports a stronger outcome, but operational constraints${constraintNames ? ` (${constraintNames})` : ""} are holding the forecast ${gap} points below the product's potential. The confidence depends on whether these barriers resolve, not on the quality of the evidence.`,
    };
  }

  const unresolvedGates = gates.filter(g => g.status === "unresolved");
  if (unresolvedGates.length >= 2) {
    const names = unresolvedGates.map(g => g.gate_label).join(", ");
    return {
      type: "missing_evidence",
      explanation: `We do not yet have enough evidence to make a confident call. ${unresolvedGates.length} key condition${unresolvedGates.length > 1 ? "s" : ""} remain unresolved (${names}). Until we observe progress on these, the picture remains incomplete.`,
    };
  }

  if (hasConflict && Math.abs(upDrivers.length - downDrivers.length) <= 1) {
    return {
      type: "conflicting_signals",
      explanation: "Positive and negative signals are roughly balanced, pulling the outlook in opposite directions. The situation will become clearer as one set of signals gains momentum over the other.",
    };
  }

  const weakGates = gates.filter(g => g.status === "weak");
  if (weakGates.length >= 2) {
    const names = weakGates.map(g => g.gate_label).join(", ");
    return {
      type: "gating_barriers",
      explanation: `${weakGates.length} condition${weakGates.length > 1 ? "s are" : " is"} partially resolved but not yet strong enough to allow progress (${names}). These are holding back the outlook.`,
    };
  }

  if (drivers.length < 3) {
    return {
      type: "weak_evidence",
      explanation: "Too few signals have been evaluated to build a reliable view. Gathering more evidence would meaningfully change the confidence level.",
    };
  }

  return {
    type: "conflicting_signals",
    explanation: "No single factor dominates the picture. The outcome depends on which conditions resolve first.",
  };
}

function buildReasoningWithDrivers(
  caseType: string,
  gates: EventGate[],
  drivers: Driver[],
  brandPct: number,
  finalPct: number,
  analogContext: AnalogContext | null,
  decompositions: ConstraintDecomposition[]
): string {
  const weakGates = gates.filter(g => g.status === "weak" || g.status === "unresolved");
  const strongGateNames = gates.filter(g => g.status === "strong").map(g => g.gate_label);
  const gap = Math.abs(brandPct - finalPct);

  const parts: string[] = [];

  if (gap >= 15) {
    parts.push(`The clinical evidence is stronger than the operational readiness — there is a ${gap}-point gap between what the product deserves and what the market is ready to deliver. The barriers are practical, not clinical.`);
  } else if (gap < 5) {
    parts.push("Evidence and operational readiness are well aligned. The current outlook accurately reflects conditions on the ground.");
  } else {
    parts.push("Some operational conditions are partially limiting what the evidence would otherwise support.");
  }

  const constraintGates = gates.filter(g => g.status !== "strong");
  for (const gate of constraintGates.slice(0, 2)) {
    const decomp = decompositions.find(d => d.gateId === gate.gate_id);
    if (decomp && decomp.drivers.length > 0) {
      const topDrivers = decomp.drivers.filter(d => d.rank === "High" || d.rank === "Moderate").slice(0, 3);
      if (topDrivers.length > 0) {
        const driverList = topDrivers.map(d => d.name).join(", ");
        parts.push(`Primary constraint: ${gate.gate_label}. Specific drivers: ${driverList}.`);
      } else {
        parts.push(`Primary constraint: ${gate.gate_label}. Drivers ranked below threshold — barrier impact is diffuse rather than concentrated.`);
      }
    } else {
      parts.push(`Key condition still holding this back: ${gate.gate_label}.`);
    }
  }

  if (strongGateNames.length > 0) {
    parts.push(`Conditions working in favor: ${strongGateNames.slice(0, 2).join(", ")}.`);
  }

  if (analogContext && analogContext.topMatches.length > 0) {
    const bestMatch = analogContext.topMatches[0];
    if (bestMatch.finalProbability !== null) {
      const analogPct = Math.round(bestMatch.finalProbability * 100);
      const diff = finalPct - analogPct;
      if (Math.abs(diff) <= 5) {
        parts.push(`Historically, the closest comparable case (${bestMatch.caseId}) resolved at ${analogPct}%, which closely matches the current outlook — reinforcing this view.`);
      } else if (diff > 5) {
        parts.push(`Historically, the closest comparable case (${bestMatch.caseId}) resolved at ${analogPct}%, which is below the current outlook by ${Math.abs(diff)} points — suggesting we may be more optimistic than precedent supports.`);
      } else {
        parts.push(`Historically, the closest comparable case (${bestMatch.caseId}) resolved at ${analogPct}%, which exceeded the current outlook by ${Math.abs(diff)} points — suggesting room for upside if similar conditions emerge.`);
      }
    }
  }

  return parts.join(" ");
}

function buildDecisionPosture(
  finalPct: number,
  confidence: ConfidenceLevel,
  caseType: string,
  gates: EventGate[]
): { posture: string; rule: string } {
  const weakestGate = gates
    .filter(g => g.status === "weak" || g.status === "unresolved")
    .sort((a, b) => a.constrains_probability_to - b.constrains_probability_to)[0];

  if (finalPct >= 65 && confidence === "High") {
    return { posture: "Plan for this outcome. Evidence and precedent support it. Shift resources toward execution.", rule: "high_prob_high_conf" };
  }
  if (finalPct >= 60 && confidence !== "Low") {
    return { posture: "Prepare for a favorable outcome, but maintain contingency. One key condition has not fully resolved.", rule: "high_prob_not_low_conf" };
  }
  if (finalPct >= 50 && finalPct < 60) {
    if (weakestGate) {
      return { posture: `Watch "${weakestGate.gate_label}" before committing resources. This single condition is the difference between a favorable and unfavorable outcome.`, rule: "mid_prob_weakest_gate" };
    }
    return { posture: "Wait for one more confirming signal before committing. The call is close to tipping.", rule: "mid_prob_no_weak_gate" };
  }
  if (finalPct >= 40 && finalPct < 50) {
    return { posture: "Do not base plans on this outcome yet. Competing scenarios remain equally plausible. Revisit after the next milestone.", rule: "low_mid_prob" };
  }
  if (finalPct >= 25 && finalPct < 40) {
    if (caseType.includes("Access Constrained") || caseType.includes("Evidence")) {
      return { posture: "Adoption is constrained by operational barriers, not product weakness. Focus investment on resolving the primary access or readiness constraint before committing to broader launch.", rule: "low_prob_barrier_constrained" };
    }
    return { posture: "Current conditions make this outcome unlikely within the forecast window. Monitor the primary barrier for signs of movement before increasing investment.", rule: "low_prob_general" };
  }
  return { posture: "This outcome is unlikely under current conditions. Do not plan around it. Reassess only if a fundamental shift occurs.", rule: "very_low_prob" };
}

function runIntegrityChecks(
  brandPct: number,
  finalPct: number,
  confidence: ConfidenceLevel,
  uncertaintyType: UncertaintyType,
  polarity: OutcomePolarity,
  upCount: number,
  downCount: number,
  gates: EventGate[],
  gap: number
): IntegrityCheck[] {
  const checks: IntegrityCheck[] = [];
  const allGatesModerateOrStrong = gates.every(g => g.status === "moderate" || g.status === "strong");
  const strongGateCount = gates.filter(g => g.status === "strong").length;

  checks.push({
    rule: "positive_majority_with_strong_gates_cannot_produce_strongly_negative_outcome",
    passed: !(upCount > downCount && allGatesModerateOrStrong && brandPct >= 60 && polarity === "negative"),
    detail: upCount > downCount && allGatesModerateOrStrong && brandPct >= 60 && polarity === "negative"
      ? `${upCount} positive vs ${downCount} negative drivers with all gates moderate/strong and ${brandPct}% brand strength — outcome polarity is "negative" but should be at least "neutral"`
      : "N/A — conditions not met",
  });

  checks.push({
    rule: "uncertainty_language_cannot_pair_with_high_confidence",
    passed: !(confidence === "High" && (uncertaintyType === "conflicting_signals" || uncertaintyType === "missing_evidence" || uncertaintyType === "gating_barriers")),
    detail: confidence === "High" && uncertaintyType !== "well_resolved"
      ? `Confidence is High but uncertainty type is "${uncertaintyType}" — these are contradictory`
      : "N/A — no contradiction",
  });

  checks.push({
    rule: "large_gap_cannot_produce_high_confidence",
    passed: !(confidence === "High" && gap >= 20),
    detail: gap >= 20
      ? `Execution gap is ${gap} points — confidence cannot be High with this level of constraint`
      : "N/A — gap is small",
  });

  checks.push({
    rule: "strong_gates_with_positive_majority_should_not_produce_sub_30_forecast",
    passed: !(strongGateCount >= 2 && upCount > downCount * 1.5 && finalPct < 30),
    detail: strongGateCount >= 2 && upCount > downCount * 1.5 && finalPct < 30
      ? `${strongGateCount} strong gates with ${upCount} positive vs ${downCount} negative — final ${finalPct}% is too low for these conditions`
      : "N/A — conditions not met",
  });

  checks.push({
    rule: "moderate_gate_cannot_cap_below_50",
    passed: !gates.some(g => g.status === "moderate" && g.constrains_probability_to < 0.50),
    detail: gates.some(g => g.status === "moderate" && g.constrains_probability_to < 0.50)
      ? `A moderate gate is capping below 50% — moderate gates should cap in the 50-75% range`
      : "N/A — all moderate gates within expected range",
  });

  return checks;
}

function extractKeyDrivers(drivers: Driver[]): string[] {
  const sorted = [...drivers].sort((a, b) => Math.abs(b.contributionPoints) - Math.abs(a.contributionPoints));
  return sorted.slice(0, 3).map(d => {
    const direction = d.contributionPoints > 0 ? "supporting" : "constraining";
    return `${d.name} (${direction})`;
  });
}

function buildMonitorList(
  gates: EventGate[],
  drivers: Driver[],
  reversalTriggers: ReversalTrigger[]
): MonitorItem[] {
  const items: MonitorItem[] = [];

  const weakGates = gates.filter(g => g.status === "weak" || g.status === "unresolved");
  for (const g of weakGates.slice(0, 2)) {
    items.push({
      label: g.gate_label,
      reason: `Currently ${g.status} — progress here would improve the outlook`,
    });
  }

  const topDrivers = [...drivers]
    .sort((a, b) => Math.abs(b.contributionPoints) - Math.abs(a.contributionPoints))
    .slice(0, 2);
  for (const d of topDrivers) {
    if (!items.some(i => i.label.toLowerCase() === d.name.toLowerCase())) {
      items.push({
        label: d.name,
        reason: `${d.direction === "Upward" ? "Positive" : "Negative"} factor — changes here would most move the outlook`,
      });
    }
  }

  return items.slice(0, 4);
}

function buildPrimaryConstraints(
  constraintDecompositions: ConstraintDecomposition[],
  finalPct: number,
  brandOutlookPct: number
): PrimaryConstraint[] {
  const nonStrong = constraintDecompositions.filter(cd => cd.gateStatus !== "strong");
  if (nonStrong.length === 0) return [];

  return nonStrong.map(cd => {
    const topDrivers = cd.drivers.slice(0, 3).map(d => ({
      name: d.name,
      rank: d.rank,
      impactScore: d.impactScore,
    }));

    let lever: string;
    const topDriver = cd.drivers[0];
    if (topDriver) {
      const upliftEstimate = cd.gateStatus === "weak" ? 15 : cd.gateStatus === "unresolved" ? 12 : 8;
      const projectedPct = Math.min(brandOutlookPct, finalPct + upliftEstimate);
      lever = `Resolving ${topDriver.name.toLowerCase()} could raise the outlook from ${finalPct}% to ~${projectedPct}%.`;
    } else {
      lever = `Resolving this constraint would improve the outlook.`;
    }

    return {
      label: cd.gateLabel,
      status: cd.gateStatus,
      drivers: topDrivers,
      lever,
    };
  });
}

function buildNextBestQuestion(
  gates: EventGate[],
  drivers: Driver[]
): string {
  const weakGates = gates
    .filter(g => g.status === "weak" || g.status === "unresolved")
    .sort((a, b) => a.constrains_probability_to - b.constrains_probability_to);

  if (weakGates.length > 0) {
    return `What specific milestone or event would resolve "${weakGates[0].gate_label}"?`;
  }

  const topNegative = drivers
    .filter(d => d.direction === "Downward" && d.contributionPoints < 0)
    .sort((a, b) => a.contributionPoints - b.contributionPoints);

  if (topNegative.length > 0) {
    return `What would need to change for "${topNegative[0].name}" to stop holding back progress?`;
  }

  return "Which upcoming data readout or market event is most likely to change this outlook?";
}

function buildAnalogCases(analogContext: AnalogContext | null): AnalogCaseDetail[] {
  if (!analogContext || analogContext.topMatches.length === 0) return [];

  return analogContext.topMatches
    .filter(m => m.adoptionLesson && (m.assetName || m.therapyArea))
    .map(m => ({
      caseId: m.caseId,
      brand: m.assetName || m.therapyArea || "Unknown",
      indication: m.diseaseState || m.specialty || m.therapyArea || "Not specified",
      similarity: m.matchedDimensions.length > 0
        ? m.matchedDimensions.join("; ")
        : `${m.similarityScore}% match across clinical and market dimensions`,
      outcome: m.finalObservedOutcome || (m.finalProbability !== null
        ? `Historical adoption reached ${Math.round(m.finalProbability * 100)}%`
        : "Outcome recorded"),
      lesson: m.adoptionLesson,
      confidence: m.confidenceBand,
      keyBarrier: m.keyBarrier || null,
      keyEnabler: m.keyEnabler || null,
      similarityScore: m.similarityScore,
      matchedDimensions: m.matchedDimensions,
      keyDifferences: m.keyDifferences,
    }));
}

function buildAnalogPattern(analogContext: AnalogContext | null): AnalogPatternSummary | null {
  if (!analogContext || analogContext.topMatches.length === 0) return null;

  const best = analogContext.topMatches[0];
  const probPct = best.finalProbability !== null ? Math.round(best.finalProbability * 100) : null;

  let patternLabel = "Reference Case";
  let description = best.adoptionLesson;

  if (best.confidenceBand === "High") patternLabel = "Strong Historical Precedent";
  else if (best.confidenceBand === "Moderate") patternLabel = "Partial Historical Parallel";

  if (analogContext.scenarios.base) {
    const basePct = Math.round(analogContext.scenarios.base.probability);
    const count = analogContext.scenarios.base.sampleSize;
    description += ` Based on ${count} similar prior case${count !== 1 ? "s" : ""}, the expected outcome was ${basePct}%.`;
  }

  return { patternLabel, description, analogCaseId: best.caseId, analogProbability: probPct, similarityScore: best.similarityScore };
}

function buildReversalTriggers(gates: EventGate[], drivers: Driver[], finalPct: number): ReversalTrigger[] {
  const triggers: ReversalTrigger[] = [];

  for (const g of gates.filter(g => g.status === "weak" || g.status === "unresolved").slice(0, 2)) {
    triggers.push({ description: `"${g.gate_label}" resolves favorably — would remove a key barrier holding back the outlook`, direction: "upward", gate: g.gate_label });
  }

  for (const g of gates.filter(g => g.status === "strong").slice(0, 1)) {
    triggers.push({ description: `"${g.gate_label}" deteriorates — would reintroduce a barrier that is currently cleared`, direction: "downward", gate: g.gate_label });
  }

  const topUpward = drivers.filter(d => d.direction === "Upward" && d.contributionPoints > 0).sort((a, b) => b.contributionPoints - a.contributionPoints);
  if (topUpward.length > 0 && finalPct < 50) {
    triggers.push({ description: `New supporting evidence in the "${topUpward[0].name}" area could shift the balance`, direction: "upward" });
  }

  const topDownward = drivers.filter(d => d.direction === "Downward" && d.contributionPoints < 0).sort((a, b) => a.contributionPoints - b.contributionPoints);
  if (topDownward.length > 0 && finalPct >= 50) {
    triggers.push({ description: `Deterioration in "${topDownward[0].name}" could reverse the favorable outlook`, direction: "downward" });
  }

  return triggers;
}

function buildConvergenceNote(finalPct: number, analogContext: AnalogContext | null): string | null {
  if (!analogContext?.scenarios?.base) return null;
  const analogBasePct = Math.round(analogContext.scenarios.base.probability);
  const diff = Math.abs(finalPct - analogBasePct);

  if (diff <= 5) return `The current outlook (${finalPct}%) closely matches what similar prior cases delivered (${analogBasePct}%), reinforcing this view.`;
  if (finalPct > analogBasePct) return `The current outlook (${finalPct}%) is more optimistic than prior cases (${analogBasePct}%) by ${diff} points. This may reflect favorable conditions not seen before, or optimism that warrants monitoring.`;
  return `The current outlook (${finalPct}%) is below what prior cases delivered (${analogBasePct}%) by ${diff} points. Historically, similar situations performed better — the gap may close as conditions resolve.`;
}

export function generateExecutiveJudgment(input: JudgmentInput): ExecutiveJudgmentResult {
  const { priorPct, brandOutlookPct, finalForecastPct, minGateCapPct, executionGapPts, gates, drivers, analogContext, questionText } = input;

  const upDrivers = drivers.filter(d => d.direction === "Upward");
  const downDrivers = drivers.filter(d => d.direction === "Downward");
  const topPositive = [...upDrivers].sort((a, b) => b.contributionPoints - a.contributionPoints).slice(0, 3).map(d => d.name);
  const topNegative = [...downDrivers].sort((a, b) => a.contributionPoints - b.contributionPoints).slice(0, 3).map(d => d.name);

  const caseType = classifyCaseType(gates, drivers);
  const questionCategory = categorizeQuestion(questionText);
  const hasHardCap = gates.some(g => g.status === "weak" || g.status === "unresolved");

  const { verdict, band, rule: outcomeRule, polarity } = inferOutcome(questionCategory, finalForecastPct, hasHardCap, upDrivers.length, downDrivers.length);

  const confidenceAudit = computeConfidence(gates, analogContext, brandOutlookPct, finalForecastPct, drivers);
  const confidence = confidenceAudit.finalLevel;

  const { type: uncertaintyType, explanation: uncertaintyExplanation } = classifyUncertainty(gates, drivers, confidence, brandOutlookPct, finalForecastPct);

  const integrityChecks = runIntegrityChecks(
    brandOutlookPct, finalForecastPct, confidence, uncertaintyType, polarity,
    upDrivers.length, downDrivers.length, gates, executionGapPts
  );
  const integrityPassed = integrityChecks.every(c => c.passed);

  let adjustedOutcome = verdict;
  let adjustedPolarity = polarity;
  let adjustedConfidence = confidence;
  let adjustedFinalPct = finalForecastPct;
  const correctedGates = gates.map(g => ({ ...g }));

  if (!integrityPassed) {
    const failedChecks = integrityChecks.filter(c => !c.passed);
    for (const check of failedChecks) {
      if (check.rule === "positive_majority_with_strong_gates_cannot_produce_strongly_negative_outcome") {
        const template = OUTCOME_TEMPLATES[questionCategory] || OUTCOME_TEMPLATES.general;
        adjustedOutcome = template.mid;
        adjustedPolarity = "neutral";
      }
      if (check.rule === "uncertainty_language_cannot_pair_with_high_confidence" || check.rule === "large_gap_cannot_produce_high_confidence") {
        adjustedConfidence = "Moderate";
      }
      if (check.rule === "strong_gates_with_positive_majority_should_not_produce_sub_30_forecast") {
        adjustedFinalPct = 30;
        const template = OUTCOME_TEMPLATES[questionCategory] || OUTCOME_TEMPLATES.general;
        adjustedOutcome = template.low;
        adjustedPolarity = "negative";
      }
      if (check.rule === "moderate_gate_cannot_cap_below_50") {
        for (const g of correctedGates) {
          if (g.status === "moderate" && g.constrains_probability_to < 0.50) {
            g.constrains_probability_to = 0.50;
          }
        }
      }
    }
  }

  const constraintDecompositions = decomposeConstraints(correctedGates);
  let decompositionEnforced = true;
  try { enforceDecomposition(constraintDecompositions); } catch (e: any) {
    decompositionEnforced = false;
    integrityChecks.push({
      rule: "DECOMP-ENFORCEMENT",
      passed: false,
      detail: e?.message || "Abstract constraint missing driver decomposition",
    });
  }

  const { posture, rule: postureRule } = buildDecisionPosture(adjustedFinalPct, adjustedConfidence, caseType, correctedGates);
  const reasoning = buildReasoningWithDrivers(caseType, correctedGates, drivers, brandOutlookPct, adjustedFinalPct, analogContext, constraintDecompositions);
  const keyDrivers = extractKeyDrivers(drivers);
  const analogCases = buildAnalogCases(analogContext);
  const analogPattern = buildAnalogPattern(analogContext);
  const reversalTriggers = buildReversalTriggers(correctedGates, drivers, adjustedFinalPct);
  const convergenceNote = buildConvergenceNote(adjustedFinalPct, analogContext);
  const monitorList = buildMonitorList(correctedGates, drivers, reversalTriggers);
  const nextBestQuestion = buildNextBestQuestion(correctedGates, drivers);

  const primaryConstraints = buildPrimaryConstraints(constraintDecompositions, adjustedFinalPct, brandOutlookPct);

  const signalHierarchy = differentiateSignals(drivers, correctedGates.map(g => ({ gate_label: g.gate_label, status: g.status })));
  const signalImbalance = detectSignalImbalance(signalHierarchy);

  const constraintDecompositionAudit = constraintDecompositions.map(cd => ({
    gateId: cd.gateId,
    gateLabel: cd.gateLabel,
    gateStatus: cd.gateStatus,
    isAbstract: cd.isAbstract,
    drivers: cd.drivers.map(d => ({ name: d.name, impactScore: d.impactScore, rank: d.rank })),
  }));

  const audit: JudgmentAudit = {
    inputs: {
      priorPct,
      brandOutlookPct,
      finalForecastPct,
      minGateCapPct,
      executionGapPts,
      upwardDriverCount: upDrivers.length,
      downwardDriverCount: downDrivers.length,
      topPositiveDrivers: topPositive,
      topNegativeDrivers: topNegative,
      gateStates: gates.map(g => ({ label: g.gate_label, status: g.status, capPct: Math.round(g.constrains_probability_to * 100) })),
    },
    confidenceAudit,
    outcomeAudit: { questionCategory, probabilityBand: band, ruleTriggered: outcomeRule },
    postureAudit: { ruleTriggered: postureRule, caseType },
    integrityChecks,
    integrityPassed: integrityChecks.every(c => c.passed),
    constraintDecomposition: constraintDecompositionAudit,
    signalImbalance,
  };

  return {
    mostLikelyOutcome: adjustedOutcome,
    probability: adjustedFinalPct,
    confidence: adjustedConfidence,
    reasoning,
    keyDrivers,
    primaryConstraints,
    signalHierarchy,
    analogCases,
    analogPattern,
    reversalTriggers,
    convergenceNote,
    decisionPosture: posture,
    uncertaintyType,
    uncertaintyExplanation,
    monitorList,
    nextBestQuestion,
    caseType,
    _audit: audit,
  };
}
