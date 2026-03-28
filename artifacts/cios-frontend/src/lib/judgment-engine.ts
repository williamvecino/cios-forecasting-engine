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
    if (pct >= 60) return "Launch or approval on track within forecast window";
    if (pct >= 40) return "Launch timing uncertain — delay remains plausible";
    return "Launch delay more likely than on-time approval";
  }
  if (/adopt|prescrib|uptake|utiliz/i.test(q)) {
    if (pct >= 60) return "Meaningful adoption likely within forecast window";
    if (pct >= 40) return "Moderate adoption possible, but not yet certain";
    return "Low adoption most probable — barriers outweigh drivers";
  }
  if (/share|market position|displacement|competitive/i.test(q)) {
    if (pct >= 60) return "Share gain or competitive advantage likely";
    if (pct >= 40) return "Market position uncertain — share stabilization most likely";
    return "Share loss or competitive pressure more likely";
  }
  if (/guideline|nccn|recommendation|inclusion/i.test(q)) {
    if (pct >= 60) return "Guideline inclusion likely within forecast window";
    if (pct >= 40) return "Guideline update timing uncertain";
    return "Guideline inclusion unlikely within forecast window";
  }
  if (/payer|access|reimbursement|coverage|formulary/i.test(q)) {
    if (pct >= 60) return "Favorable access outcome likely";
    if (pct >= 40) return "Access pathway uncertain — mixed payer signals";
    return "Access barriers likely to persist";
  }
  if (/account|target|segment|who adopt/i.test(q)) {
    if (pct >= 60) return "Adoption concentrated in targeted segment";
    if (pct >= 40) return "Adoption pattern uncertain across segments";
    return "Broad adoption unlikely — segment-specific strategy needed";
  }

  if (pct >= 60) return "Favorable outcome likely within forecast window";
  if (pct >= 40) return "Outcome uncertain — competing scenarios remain plausible";
  return "Unfavorable outcome more likely given current evidence";
}

function determineConfidence(
  gates: EventGate[],
  analogContext: AnalogContext | null,
  brandPct: number,
  finalPct: number
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

  if (gates.length >= 3) score += 10;

  if (score >= 60) return "High";
  if (score >= 35) return "Moderate";
  return "Low";
}

function classifyUncertainty(
  gates: EventGate[],
  drivers: Driver[],
  confidence: ConfidenceLevel
): { type: UncertaintyType; explanation: string } {
  if (confidence === "High") {
    return {
      type: "well_resolved",
      explanation: "Confidence is high — evidence base is sufficient, gates are mostly resolved, and analog patterns reinforce the call.",
    };
  }

  const unresolvedGates = gates.filter(g => g.status === "unresolved");
  const weakGates = gates.filter(g => g.status === "weak");
  const upDrivers = drivers.filter(d => d.direction === "Upward" && d.contributionPoints > 0);
  const downDrivers = drivers.filter(d => d.direction === "Downward" && d.contributionPoints < 0);
  const hasConflict = upDrivers.length > 0 && downDrivers.length > 0;

  if (unresolvedGates.length >= 2) {
    return {
      type: "missing_evidence",
      explanation: `Uncertainty is driven by missing evidence — ${unresolvedGates.length} gate${unresolvedGates.length > 1 ? "s" : ""} remain unresolved (${unresolvedGates.map(g => g.gate_label).join(", ")}). The system cannot distinguish between outcomes until these conditions are observed.`,
    };
  }

  if (hasConflict && Math.abs(upDrivers.length - downDrivers.length) <= 1) {
    return {
      type: "conflicting_signals",
      explanation: "Uncertainty is driven by conflicting evidence — positive and negative signals are roughly balanced, pulling the forecast in opposing directions. Resolution depends on which signal domain moves first.",
    };
  }

  if (weakGates.length >= 2) {
    return {
      type: "gating_barriers",
      explanation: `Uncertainty is driven by gating barriers — ${weakGates.length} condition${weakGates.length > 1 ? "s" : ""} are partially resolved but not yet strong enough to remove their probability ceiling (${weakGates.map(g => g.gate_label).join(", ")}).`,
    };
  }

  if (drivers.length < 3) {
    return {
      type: "weak_evidence",
      explanation: "Uncertainty is driven by weak evidence — too few signals have been evaluated to build a reliable forecast. Adding more evidence would meaningfully change confidence.",
    };
  }

  return {
    type: "conflicting_signals",
    explanation: "Uncertainty reflects a mixed evidence picture — no single factor dominates, and the outcome depends on which conditions resolve first.",
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
    reasoning += `There is a ${gap}-point gap between evidence strength (${brandPct}%) and the constrained forecast (${finalPct}%), indicating that operational barriers — not product quality — are limiting the outlook. `;
  } else if (gap < 5) {
    reasoning += `Evidence strength and operational readiness are well-aligned (${brandPct}% vs ${finalPct}%), suggesting the forecast accurately reflects current conditions. `;
  } else {
    reasoning += `A moderate ${gap}-point gap between evidence strength (${brandPct}%) and forecast (${finalPct}%) suggests some conditions are partially dampening the signal. `;
  }

  if (weakGates.length > 0) {
    reasoning += `Key unresolved conditions: ${weakGates.slice(0, 3).join(", ")}. `;
  }
  if (strongGates.length > 0) {
    reasoning += `Favorable conditions: ${strongGates.slice(0, 2).join(", ")}. `;
  }

  if (analogContext && analogContext.topMatches.length > 0) {
    const bestMatch = analogContext.topMatches[0];
    if (bestMatch.finalProbability !== null) {
      const analogPct = Math.round(bestMatch.finalProbability * 100);
      reasoning += `The closest historical analog (${bestMatch.caseId}, ${bestMatch.similarityScore}% similarity) resolved at ${analogPct}%`;
      const diff = finalPct - analogPct;
      if (Math.abs(diff) <= 5) {
        reasoning += `, closely aligning with the current forecast — reinforcing this call. `;
      } else if (diff > 5) {
        reasoning += `, which is below the current forecast by ${Math.abs(diff)} pts — suggesting the call may be more optimistic than precedent supports. `;
      } else {
        reasoning += `, which exceeded the current forecast by ${Math.abs(diff)} pts — suggesting room for upside if similar conditions materialize. `;
      }
    }
  }

  return reasoning.trim();
}

function extractKeyDrivers(drivers: Driver[]): string[] {
  const sorted = [...drivers].sort((a, b) => Math.abs(b.contributionPoints) - Math.abs(a.contributionPoints));
  return sorted.slice(0, 3).map(d => {
    const sign = d.contributionPoints > 0 ? "+" : "";
    return `${d.name} (${sign}${d.contributionPoints} pts)`;
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
      return `Monitor "${weakestGate.gate_label}" before committing resources. This single condition is the difference between a favorable and unfavorable call.`;
    }
    return "Wait for one more confirming signal before committing. The call is close to tipping.";
  }
  if (finalPct >= 40 && finalPct < 50) {
    return "Do not base plans on this outcome yet. Competing scenarios remain equally plausible. Revisit after the next milestone.";
  }
  if (finalPct >= 25 && finalPct < 40) {
    if (caseType.includes("Access Constrained")) {
      return "Prepare for an unfavorable outcome unless access conditions change. Consider alternative pathways or extended timelines.";
    }
    return "Treat this as low-probability. Maintain awareness but do not allocate significant resources to this scenario.";
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
      reason: `Currently ${g.status} — resolving this would raise the probability ceiling from ≤${Math.round(g.constrains_probability_to * 100)}%`,
    });
  }

  const topDrivers = [...drivers]
    .sort((a, b) => Math.abs(b.contributionPoints) - Math.abs(a.contributionPoints))
    .slice(0, 2);
  for (const d of topDrivers) {
    if (!items.some(i => i.label.toLowerCase() === d.name.toLowerCase())) {
      items.push({
        label: d.name,
        reason: `${d.direction === "Upward" ? "Positive" : "Negative"} driver with ${Math.abs(d.contributionPoints)} pts impact — changes here would most move the forecast`,
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
    return `What specific milestone or event would resolve "${gate.gate_label}" from ${gate.status} to strong?`;
  }

  const topNegative = drivers
    .filter(d => d.direction === "Downward" && d.contributionPoints < 0)
    .sort((a, b) => a.contributionPoints - b.contributionPoints);

  if (topNegative.length > 0) {
    return `What would need to change for "${topNegative[0].name}" to stop constraining the forecast?`;
  }

  return "Which upcoming data readout or market event is most likely to change this forecast?";
}

function buildAnalogPattern(
  analogContext: AnalogContext | null
): AnalogPatternSummary | null {
  if (!analogContext || analogContext.topMatches.length === 0) return null;

  const best = analogContext.topMatches[0];
  const probPct = best.finalProbability !== null ? Math.round(best.finalProbability * 100) : null;

  let patternLabel = "Structural Reference";
  let description = best.adoptionLesson;

  if (best.confidenceBand === "High") {
    patternLabel = "Strong Historical Precedent";
  } else if (best.confidenceBand === "Moderate") {
    patternLabel = "Partial Historical Parallel";
  }

  if (analogContext.scenarios.base) {
    const basePct = Math.round(analogContext.scenarios.base.probability);
    description += ` Analog-weighted base probability: ${basePct}% (from ${analogContext.scenarios.base.sampleSize} calibrated case${analogContext.scenarios.base.sampleSize !== 1 ? "s" : ""}).`;
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
      description: `"${g.gate_label}" resolves from ${g.status} to strong — removes the ≤${Math.round(g.constrains_probability_to * 100)}% cap`,
      direction: "upward",
      gate: g.gate_label,
    });
  }

  const strongGates = gates.filter(g => g.status === "strong");
  for (const g of strongGates.slice(0, 1)) {
    triggers.push({
      description: `"${g.gate_label}" regresses from strong — would reintroduce a probability ceiling`,
      direction: "downward",
      gate: g.gate_label,
    });
  }

  const topUpward = drivers
    .filter(d => d.direction === "Upward" && d.contributionPoints > 0)
    .sort((a, b) => b.contributionPoints - a.contributionPoints);
  if (topUpward.length > 0 && finalPct < 50) {
    triggers.push({
      description: `New supporting evidence in "${topUpward[0].name}" domain could shift the balance`,
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
    return `The current forecast (${finalPct}%) converges with the analog-weighted base (${analogBasePct}%), providing mutual validation between the model and historical outcomes.`;
  }
  if (finalPct > analogBasePct) {
    return `The current forecast (${finalPct}%) exceeds the analog-weighted base (${analogBasePct}%) by ${diff} pts. This may reflect favorable conditions not present in historical comparables, or optimism that warrants monitoring.`;
  }
  return `The current forecast (${finalPct}%) is below the analog-weighted base (${analogBasePct}%) by ${diff} pts. Historical cases in similar contexts performed better — the gap may close as conditions resolve.`;
}

export function generateExecutiveJudgment(input: JudgmentInput): ExecutiveJudgmentResult {
  const { brandOutlookPct, finalForecastPct, gates, drivers, analogContext, questionText } = input;

  const caseType = classifyCaseType(gates, drivers);
  const mostLikelyOutcome = inferOutcomeFromQuestion(questionText, finalForecastPct);
  const confidence = determineConfidence(gates, analogContext, brandOutlookPct, finalForecastPct);
  const reasoning = buildReasoning(caseType, gates, drivers, brandOutlookPct, finalForecastPct, analogContext);
  const keyDrivers = extractKeyDrivers(drivers);
  const analogPattern = buildAnalogPattern(analogContext);
  const reversalTriggers = buildReversalTriggers(gates, drivers, finalForecastPct);
  const convergenceNote = buildConvergenceNote(finalForecastPct, analogContext);
  const { type: uncertaintyType, explanation: uncertaintyExplanation } = classifyUncertainty(gates, drivers, confidence);
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
