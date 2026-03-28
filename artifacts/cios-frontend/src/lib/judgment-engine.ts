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

type OutcomeVerdict = "Adoption Likely" | "Adoption Uncertain" | "Adoption Unlikely" | "Insufficient Data";
type ConfidenceLevel = "High" | "Moderate" | "Low";

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

export interface ExecutiveJudgmentResult {
  mostLikelyOutcome: OutcomeVerdict;
  probability: number;
  confidence: ConfidenceLevel;
  reasoning: string;
  analogPattern: AnalogPatternSummary | null;
  reversalTriggers: ReversalTrigger[];
  convergenceNote: string | null;
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

function determineVerdict(pct: number): OutcomeVerdict {
  if (pct >= 60) return "Adoption Likely";
  if (pct >= 40) return "Adoption Uncertain";
  if (pct >= 10) return "Adoption Unlikely";
  return "Insufficient Data";
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

  let reasoning = `Case classification: ${caseType}. `;

  if (gap >= 15) {
    reasoning += `There is a ${gap}-point execution gap between evidence strength (${brandPct}%) and the gate-constrained forecast (${finalPct}%), indicating that operational barriers — not product quality — are limiting the outlook. `;
  } else if (gap < 5) {
    reasoning += `Evidence strength and operational readiness are well-aligned (${brandPct}% vs ${finalPct}%), suggesting the forecast accurately reflects current conditions. `;
  } else {
    reasoning += `A moderate ${gap}-point gap between brand outlook (${brandPct}%) and forecast (${finalPct}%) suggests some gate constraints are partially dampening the evidence signal. `;
  }

  if (weakGates.length > 0) {
    reasoning += `Key unresolved constraints: ${weakGates.slice(0, 3).join(", ")}. `;
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
        reasoning += `, closely aligning with the current forecast — reinforcing confidence in the projection. `;
      } else if (diff > 5) {
        reasoning += `, which is below the current forecast by ${Math.abs(diff)} pts — suggesting the forecast may be optimistic relative to historical patterns. `;
      } else {
        reasoning += `, which exceeded the current forecast by ${Math.abs(diff)} pts — suggesting room for upside if similar conditions materialize. `;
      }
    }
  }

  return reasoning.trim();
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
      description: `New supporting evidence in "${topUpward[0].name}" domain could shift the balance — currently the strongest positive signal`,
      direction: "upward",
    });
  }

  const topDownward = drivers
    .filter(d => d.direction === "Downward" && d.contributionPoints < 0)
    .sort((a, b) => a.contributionPoints - b.contributionPoints);
  if (topDownward.length > 0 && finalPct >= 50) {
    triggers.push({
      description: `Deterioration in "${topDownward[0].name}" could reverse the favorable outlook — currently the strongest headwind`,
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
    return `The current forecast (${finalPct}%) converges with the analog-weighted base (${analogBasePct}%), providing mutual validation between the Bayesian model and historical outcomes.`;
  }
  if (finalPct > analogBasePct) {
    return `The current forecast (${finalPct}%) exceeds the analog-weighted base (${analogBasePct}%) by ${diff} pts. This may reflect favorable conditions not present in historical comparables, or optimism that warrants monitoring.`;
  }
  return `The current forecast (${finalPct}%) is below the analog-weighted base (${analogBasePct}%) by ${diff} pts. Historical cases in similar contexts performed better — the gap may be due to gate constraints that could resolve.`;
}

export function generateExecutiveJudgment(input: JudgmentInput): ExecutiveJudgmentResult {
  const { brandOutlookPct, finalForecastPct, gates, drivers, analogContext } = input;

  const caseType = classifyCaseType(gates, drivers);
  const mostLikelyOutcome = determineVerdict(finalForecastPct);
  const confidence = determineConfidence(gates, analogContext, brandOutlookPct, finalForecastPct);
  const reasoning = buildReasoning(caseType, gates, drivers, brandOutlookPct, finalForecastPct, analogContext);
  const analogPattern = buildAnalogPattern(analogContext);
  const reversalTriggers = buildReversalTriggers(gates, drivers, finalForecastPct);
  const convergenceNote = buildConvergenceNote(finalForecastPct, analogContext);

  return {
    mostLikelyOutcome,
    probability: finalForecastPct,
    confidence,
    reasoning,
    analogPattern,
    reversalTriggers,
    convergenceNote,
  };
}
