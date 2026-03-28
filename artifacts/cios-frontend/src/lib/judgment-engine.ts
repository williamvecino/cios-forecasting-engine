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

interface JudgmentInput {
  brandOutlookPct: number;
  finalForecastPct: number;
  gates: EventGate[];
  drivers: Driver[];
  analogContext: AnalogContext | null;
  questionText: string;
}

type OutcomeVerdict = string;
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

interface MonitorItem {
  label: string;
  reason: string;
}

export interface ExecutiveJudgmentResult {
  mostLikelyOutcome: OutcomeVerdict;
  probability: number;
  confidence: ConfidenceLevel;
  reasoning: string;
  keyDrivers: string[];
  analogPattern: AnalogPatternSummary | null;
  reversalTriggers: ReversalTrigger[];
  convergenceNote: string | null;
  decisionPosture: string;
  uncertaintyType: UncertaintyType;
  uncertaintyExplanation: string;
  monitorList: MonitorItem[];
  nextBestQuestion: string;
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

function inferOutcomeFromQuestion(questionText: string, pct: number): string {
  const q = questionText.toLowerCase();

  if (/launch|approval|fda|ema|regulatory/i.test(q)) {
    if (pct >= 60) return "Launch or approval is on track within the forecast window";
    if (pct >= 40) return "Launch timing is uncertain — a delay remains plausible";
    return "A delay is more likely than on-time approval";
  }
  if (/adopt|prescrib|uptake|utiliz/i.test(q)) {
    if (pct >= 60) return "Meaningful adoption is likely within the forecast window";
    if (pct >= 40) return "Moderate adoption is possible, but not yet certain";
    return "Low adoption is most probable — barriers outweigh supporting factors";
  }
  if (/share|market position|displacement|competitive/i.test(q)) {
    if (pct >= 60) return "Share gain or competitive advantage is likely";
    if (pct >= 40) return "Market position is uncertain — share stabilization is the safer assumption";
    return "Share loss or competitive pressure is more likely";
  }
  if (/guideline|nccn|recommendation|inclusion/i.test(q)) {
    if (pct >= 60) return "Guideline inclusion is likely within the forecast window";
    if (pct >= 40) return "Guideline update timing remains uncertain";
    return "Guideline inclusion is unlikely within the forecast window";
  }
  if (/payer|access|reimbursement|coverage|formulary/i.test(q)) {
    if (pct >= 60) return "A favorable access outcome is likely";
    if (pct >= 40) return "The access pathway is uncertain — mixed payer signals";
    return "Access barriers are likely to persist";
  }
  if (/account|target|segment|who adopt/i.test(q)) {
    if (pct >= 60) return "Adoption is concentrated in the targeted segment";
    if (pct >= 40) return "Adoption patterns across segments remain uncertain";
    return "Broad adoption is unlikely — a segment-specific strategy is needed";
  }

  if (pct >= 60) return "A favorable outcome is likely within the forecast window";
  if (pct >= 40) return "The outcome is uncertain — competing scenarios remain plausible";
  return "An unfavorable outcome is more likely given current evidence";
}

function determineConfidence(
  gates: EventGate[],
  analogContext: AnalogContext | null,
  brandPct: number,
  finalPct: number,
  drivers?: Driver[]
): ConfidenceLevel {
  let score = 0;

  const resolvedGates = gates.filter(g => g.status === "strong" || g.status === "moderate");
  score += (resolvedGates.length / Math.max(gates.length, 1)) * 30;

  if (analogContext) {
    const highAnalogs = analogContext.topMatches.filter(m => m.confidenceBand === "High");
    score += Math.min(highAnalogs.length * 10, 30);
    if (analogContext.calibratedCount >= 3) score += 10;
  }

  const gap = Math.abs(brandPct - finalPct);
  if (gap < 10) score += 20;
  else if (gap < 20) score += 10;
  else if (gap >= 35) score -= 25;
  else if (gap >= 25) score -= 15;

  if (gates.length >= 3) score += 10;

  if (drivers && drivers.length > 0) {
    const up = drivers.filter(d => d.direction === "Upward" && d.contributionPoints > 0);
    const down = drivers.filter(d => d.direction === "Downward" && d.contributionPoints < 0);
    if (up.length > 0 && down.length > 0 && Math.abs(up.length - down.length) <= 2) {
      score -= 10;
    }
  }

  if (score >= 60) return "High";
  if (score >= 35) return "Moderate";
  return "Low";
}

function classifyUncertainty(
  gates: EventGate[],
  drivers: Driver[],
  confidence: ConfidenceLevel,
  brandPct?: number,
  finalPct?: number
): { type: UncertaintyType; explanation: string } {
  const gap = Math.abs((brandPct ?? 0) - (finalPct ?? 0));
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
    const weakGates = gates.filter(g => g.status === "weak" || g.status === "unresolved" || g.status === "moderate");
    const constraintNames = weakGates.slice(0, 2).map(g => g.gate_label).join(" and ");
    return {
      type: "gating_barriers",
      explanation: `The underlying evidence supports a stronger outcome, but operational constraints${constraintNames ? ` (${constraintNames})` : ""} are holding the forecast ${gap} points below the product's potential. The confidence depends on whether these barriers resolve, not on the quality of the evidence.`,
    };
  }

  const unresolvedGates = gates.filter(g => g.status === "unresolved");
  const weakGatesOnly = gates.filter(g => g.status === "weak");

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

  if (weakGatesOnly.length >= 2) {
    const names = weakGatesOnly.map(g => g.gate_label).join(", ");
    return {
      type: "gating_barriers",
      explanation: `${weakGatesOnly.length} condition${weakGatesOnly.length > 1 ? "s are" : " is"} partially resolved but not yet strong enough to allow progress (${names}). These are holding back the outlook.`,
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

function buildReasoning(
  caseType: string,
  gates: EventGate[],
  drivers: Driver[],
  brandPct: number,
  finalPct: number,
  analogContext: AnalogContext | null
): string {
  const weakGates = gates
    .filter(g => g.status === "weak" || g.status === "unresolved")
    .map(g => g.gate_label);
  const strongGates = gates
    .filter(g => g.status === "strong")
    .map(g => g.gate_label);
  const gap = Math.abs(brandPct - finalPct);

  let reasoning = "";

  if (gap >= 15) {
    reasoning += `The clinical evidence is stronger than the operational readiness — there is a ${gap}-point gap between what the product deserves and what the market is ready to deliver. The barriers are practical, not clinical. `;
  } else if (gap < 5) {
    reasoning += `Evidence and operational readiness are well aligned. The current outlook accurately reflects conditions on the ground. `;
  } else {
    reasoning += `Some operational conditions are partially limiting what the evidence would otherwise support. `;
  }

  if (weakGates.length > 0) {
    reasoning += `Key conditions still holding this back: ${weakGates.slice(0, 3).join(", ")}. `;
  }
  if (strongGates.length > 0) {
    reasoning += `Conditions working in favor: ${strongGates.slice(0, 2).join(", ")}. `;
  }

  if (analogContext && analogContext.topMatches.length > 0) {
    const bestMatch = analogContext.topMatches[0];
    if (bestMatch.finalProbability !== null) {
      const analogPct = Math.round(bestMatch.finalProbability * 100);
      reasoning += `Historically, the closest comparable case (${bestMatch.caseId}) resolved at ${analogPct}%`;
      const diff = finalPct - analogPct;
      if (Math.abs(diff) <= 5) {
        reasoning += `, which closely matches the current outlook — reinforcing this view. `;
      } else if (diff > 5) {
        reasoning += `, which is below the current outlook by ${Math.abs(diff)} points — suggesting we may be more optimistic than precedent supports. `;
      } else {
        reasoning += `, which exceeded the current outlook by ${Math.abs(diff)} points — suggesting room for upside if similar conditions emerge. `;
      }
    }
  }

  return reasoning.trim();
}

function extractKeyDrivers(drivers: Driver[]): string[] {
  const sorted = [...drivers].sort((a, b) => Math.abs(b.contributionPoints) - Math.abs(a.contributionPoints));
  return sorted.slice(0, 3).map(d => {
    const direction = d.contributionPoints > 0 ? "supporting" : "constraining";
    return `${d.name} (${direction})`;
  });
}

function buildDecisionPosture(
  finalPct: number,
  confidence: ConfidenceLevel,
  caseType: string,
  gates: EventGate[],
  questionText: string
): string {
  const weakestGate = gates
    .filter(g => g.status === "weak" || g.status === "unresolved")
    .sort((a, b) => a.constrains_probability_to - b.constrains_probability_to)[0];

  if (finalPct >= 65 && confidence === "High") {
    return "Plan for this outcome. Evidence and precedent support it. Shift resources toward execution.";
  }
  if (finalPct >= 60 && confidence !== "Low") {
    return "Prepare for a favorable outcome, but maintain contingency. One key condition has not fully resolved.";
  }
  if (finalPct >= 50 && finalPct < 60) {
    if (weakestGate) {
      return `Watch "${weakestGate.gate_label}" before committing resources. This single condition is the difference between a favorable and unfavorable outcome.`;
    }
    return "Wait for one more confirming signal before committing. The call is close to tipping.";
  }
  if (finalPct >= 40 && finalPct < 50) {
    return "Do not base plans on this outcome yet. Competing scenarios remain equally plausible. Revisit after the next milestone.";
  }
  if (finalPct >= 25 && finalPct < 40) {
    if (caseType.includes("Access Constrained") || caseType.includes("Evidence")) {
      return "Adoption is constrained by operational barriers, not product weakness. Focus investment on resolving the primary access or readiness constraint before committing to broader launch.";
    }
    return "Current conditions make this outcome unlikely within the forecast window. Monitor the primary barrier for signs of movement before increasing investment.";
  }
  return "This outcome is unlikely under current conditions. Do not plan around it. Reassess only if a fundamental shift occurs.";
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

function buildNextBestQuestion(
  gates: EventGate[],
  drivers: Driver[],
  caseType: string,
  questionText: string
): string {
  const weakGates = gates
    .filter(g => g.status === "weak" || g.status === "unresolved")
    .sort((a, b) => a.constrains_probability_to - b.constrains_probability_to);

  if (weakGates.length > 0) {
    const gate = weakGates[0];
    return `What specific milestone or event would resolve "${gate.gate_label}"?`;
  }

  const topNegative = drivers
    .filter(d => d.direction === "Downward" && d.contributionPoints < 0)
    .sort((a, b) => a.contributionPoints - b.contributionPoints);

  if (topNegative.length > 0) {
    return `What would need to change for "${topNegative[0].name}" to stop holding back progress?`;
  }

  return "Which upcoming data readout or market event is most likely to change this outlook?";
}

function buildAnalogPattern(
  analogContext: AnalogContext | null
): AnalogPatternSummary | null {
  if (!analogContext || analogContext.topMatches.length === 0) return null;

  const best = analogContext.topMatches[0];
  const probPct = best.finalProbability !== null ? Math.round(best.finalProbability * 100) : null;

  let patternLabel = "Reference Case";
  let description = best.adoptionLesson;

  if (best.confidenceBand === "High") {
    patternLabel = "Strong Historical Precedent";
  } else if (best.confidenceBand === "Moderate") {
    patternLabel = "Partial Historical Parallel";
  }

  if (analogContext.scenarios.base) {
    const basePct = Math.round(analogContext.scenarios.base.probability);
    const count = analogContext.scenarios.base.sampleSize;
    description += ` Based on ${count} similar prior case${count !== 1 ? "s" : ""}, the expected outcome was ${basePct}%.`;
  }

  return {
    patternLabel,
    description,
    analogCaseId: best.caseId,
    analogProbability: probPct,
    similarityScore: best.similarityScore,
  };
}

function buildReversalTriggers(
  gates: EventGate[],
  drivers: Driver[],
  finalPct: number
): ReversalTrigger[] {
  const triggers: ReversalTrigger[] = [];

  const weakGates = gates.filter(g => g.status === "weak" || g.status === "unresolved");
  for (const g of weakGates.slice(0, 2)) {
    triggers.push({
      description: `"${g.gate_label}" resolves favorably — would remove a key barrier holding back the outlook`,
      direction: "upward",
      gate: g.gate_label,
    });
  }

  const strongGates = gates.filter(g => g.status === "strong");
  for (const g of strongGates.slice(0, 1)) {
    triggers.push({
      description: `"${g.gate_label}" deteriorates — would reintroduce a barrier that is currently cleared`,
      direction: "downward",
      gate: g.gate_label,
    });
  }

  const topUpward = drivers
    .filter(d => d.direction === "Upward" && d.contributionPoints > 0)
    .sort((a, b) => b.contributionPoints - a.contributionPoints);
  if (topUpward.length > 0 && finalPct < 50) {
    triggers.push({
      description: `New supporting evidence in the "${topUpward[0].name}" area could shift the balance`,
      direction: "upward",
    });
  }

  const topDownward = drivers
    .filter(d => d.direction === "Downward" && d.contributionPoints < 0)
    .sort((a, b) => a.contributionPoints - b.contributionPoints);
  if (topDownward.length > 0 && finalPct >= 50) {
    triggers.push({
      description: `Deterioration in "${topDownward[0].name}" could reverse the favorable outlook`,
      direction: "downward",
    });
  }

  return triggers;
}

function buildConvergenceNote(
  finalPct: number,
  analogContext: AnalogContext | null
): string | null {
  if (!analogContext?.scenarios?.base) return null;
  const analogBasePct = Math.round(analogContext.scenarios.base.probability);
  const diff = Math.abs(finalPct - analogBasePct);

  if (diff <= 5) {
    return `The current outlook (${finalPct}%) closely matches what similar prior cases delivered (${analogBasePct}%), reinforcing this view.`;
  }
  if (finalPct > analogBasePct) {
    return `The current outlook (${finalPct}%) is more optimistic than prior cases (${analogBasePct}%) by ${diff} points. This may reflect favorable conditions not seen before, or optimism that warrants monitoring.`;
  }
  return `The current outlook (${finalPct}%) is below what prior cases delivered (${analogBasePct}%) by ${diff} points. Historically, similar situations performed better — the gap may close as conditions resolve.`;
}

export function generateExecutiveJudgment(input: JudgmentInput): ExecutiveJudgmentResult {
  const { brandOutlookPct, finalForecastPct, gates, drivers, analogContext, questionText } = input;

  const caseType = classifyCaseType(gates, drivers);
  const mostLikelyOutcome = inferOutcomeFromQuestion(questionText, finalForecastPct);
  const confidence = determineConfidence(gates, analogContext, brandOutlookPct, finalForecastPct, drivers);
  const reasoning = buildReasoning(caseType, gates, drivers, brandOutlookPct, finalForecastPct, analogContext);
  const keyDrivers = extractKeyDrivers(drivers);
  const analogPattern = buildAnalogPattern(analogContext);
  const reversalTriggers = buildReversalTriggers(gates, drivers, finalForecastPct);
  const convergenceNote = buildConvergenceNote(finalForecastPct, analogContext);
  const { type: uncertaintyType, explanation: uncertaintyExplanation } = classifyUncertainty(gates, drivers, confidence, brandOutlookPct, finalForecastPct);
  const decisionPosture = buildDecisionPosture(finalForecastPct, confidence, caseType, gates, questionText);
  const monitorList = buildMonitorList(gates, drivers, reversalTriggers);
  const nextBestQuestion = buildNextBestQuestion(gates, drivers, caseType, questionText);

  return {
    mostLikelyOutcome,
    probability: finalForecastPct,
    confidence,
    reasoning,
    keyDrivers,
    analogPattern,
    reversalTriggers,
    convergenceNote,
    decisionPosture,
    uncertaintyType,
    uncertaintyExplanation,
    monitorList,
    nextBestQuestion,
  };
}
