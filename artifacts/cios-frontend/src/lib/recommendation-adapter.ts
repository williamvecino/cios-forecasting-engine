import type { Recommendation } from "@workspace/contracts";

export type { Recommendation };

function formatPct(v: number) {
  return (v * 100).toFixed(1) + "%";
}

function formatPts(v: number) {
  const pts = (v * 100).toFixed(1);
  return v >= 0 ? `+${pts}` : pts;
}

export function deriveRecommendation(
  probability: number,
  priorProbability: number,
  confidenceLevel: string
): Recommendation {
  const change = probability - priorProbability;

  let headline: string;
  let rationale: string;
  let riskNote: string;
  let monitorNext: string[];

  if (probability >= 0.7) {
    headline = "Accelerate execution. Evidence supports forward momentum.";
    rationale = `The forecast is currently at ${formatPct(probability)} (${formatPts(change)} pts from prior), supported by favorable signals. This advantage window may compress if competitive dynamics shift or key evidence is contradicted.`;
    riskNote = "Primary risk: complacency. High-probability outcomes can reverse quickly if disconfirming evidence emerges.";
    monitorNext = [
      "Competitor clinical or regulatory readouts",
      "Payer policy changes in priority accounts",
      "New guideline commentary or society updates",
    ];
  } else if (probability >= 0.5) {
    headline = "Selectively invest. Evidence is favorable but not yet decisive.";
    rationale = `At ${formatPct(probability)}, the forecast is above baseline but not yet in the high-conviction zone. The 1-2 signals that would push probability above 70% should be the primary acquisition targets.`;
    riskNote = "Moderate uncertainty remains. Avoid over-committing resources until confidence strengthens.";
    monitorNext = [
      "Pending evidence that could shift probability above 70%",
      "KOL validation of the current signal pattern",
      "Competitive landscape evolution",
    ];
  } else if (probability >= 0.3) {
    headline = "Reassess assumptions. Evidence is mixed and outcome uncertain.";
    rationale = `The forecast at ${formatPct(probability)} reflects a balanced evidence base. Neither supporting nor opposing signals are dominant. Focus on identifying the highest-leverage gaps.`;
    riskNote = "The question may need reframing. Consider whether the strategic question itself is well-calibrated.";
    monitorNext = [
      "Highest-leverage evidence gaps",
      "Whether the prior probability still reflects market reality",
      "Stakeholder sentiment shifts",
    ];
  } else {
    headline = "Consider strategic pivot. Current evidence does not support a positive outcome.";
    rationale = `At ${formatPct(probability)}, signals are predominantly opposing. Continuing the current strategy without new supporting evidence is unlikely to change the trajectory.`;
    riskNote = "Continued investment without evidence reversal carries significant opportunity cost.";
    monitorNext = [
      "What would need to change for probability to meaningfully shift",
      "Alternative strategic framings",
      "Exit or pivot timing considerations",
    ];
  }

  if (confidenceLevel === "Low" || confidenceLevel === "Developing") {
    riskNote += " Note: confidence is limited — forecast reliability will improve with more validated signals.";
  }

  return { headline, rationale, riskNote, monitorNext };
}

export function deriveInterpretation(probability: number): string {
  if (probability >= 0.6) return "Current signals support a favorable outcome within the forecast window.";
  if (probability >= 0.4) return "Signals are mixed. The outcome is within a zone of genuine uncertainty.";
  return "Current signals suggest the outcome faces material headwinds.";
}

export interface ForecastInterpretation {
  priority: string;
  priorityLabel: "execute" | "reduce-uncertainty" | "identify-barriers";
  probabilityBandLabel: string;
  interpretationSummary: string;
  nextActions: string[];
  questionRefinementSuggestions: string[];
  cautionNote: string | null;
}

function getProbabilityBandLabel(p: number): string {
  if (p >= 0.85) return "Strong momentum";
  if (p >= 0.7) return "Favorable";
  if (p >= 0.5) return "Uncertain / developing";
  if (p >= 0.35) return "At-risk";
  return "Low likelihood";
}

function getTargetLanguage(target: string): { noun: string; verb: string; scope: string } {
  switch (target) {
    case "physician":
      return { noun: "physician adoption trajectory", verb: "prescribing behavior", scope: "this physician" };
    case "institution":
      return { noun: "account strategy outlook", verb: "institutional adoption", scope: "this account" };
    case "subspecialty":
      return { noun: "segment targeting outlook", verb: "subspecialty adoption", scope: "this subspecialty segment" };
    case "specialty":
      return { noun: "segment targeting outlook", verb: "specialty-level uptake", scope: "this specialty segment" };
    default:
      return { noun: "market strategy outlook", verb: "market-level adoption", scope: "the broader market" };
  }
}

function getConfidenceSentence(confidence: string): string {
  if (confidence === "Low" || confidence === "Developing")
    return "The forecast is currently unstable due to limited signal density and should be treated cautiously — directional trends may shift materially with new evidence.";
  if (confidence === "Moderate" || confidence === "Medium")
    return "The forecast is directionally useful but remains sensitive to new signals — a single strong contradictory input could meaningfully shift the outlook.";
  return "The forecast is relatively stable and unlikely to shift unless contradictory high-reliability signals emerge.";
}

function buildNextActions(inputs: {
  probability: number;
  confidence: string;
  positiveDrivers: { name: string; lr: number }[];
  negativeDrivers: { name: string; lr: number }[];
  signalCount: number;
  targetLang: { noun: string; verb: string; scope: string };
}): string[] {
  const { probability, confidence, positiveDrivers, negativeDrivers, signalCount, targetLang } = inputs;
  const posStrength = positiveDrivers.reduce((sum, d) => sum + Math.abs(d.lr - 1), 0);
  const negStrength = negativeDrivers.reduce((sum, d) => sum + Math.abs(d.lr - 1), 0);
  const negDominate = negStrength > posStrength && negativeDrivers.length > 0;
  const posStrongLowConf = posStrength > negStrength && (confidence === "Low" || confidence === "Developing");
  const highProbHighConf = probability > 0.7 && (confidence === "High");

  if (highProbHighConf) {
    return [
      `Lock in resource commitments aligned with the favorable ${targetLang.noun}`,
      `Establish monitoring triggers for early warning of ${targetLang.verb} trajectory reversal`,
      "Identify the 1-2 signals whose contradiction would most impact the current position",
      signalCount < 5
        ? "Consider expanding signal coverage to protect against blind-spot risk"
        : "Signal density is adequate — prioritize signal recency and quality audits",
    ];
  }

  if (posStrongLowConf) {
    return [
      "Prioritize acquiring higher-reliability signals to validate the positive trajectory before committing resources",
      `Seek independent corroboration of the strongest positive driver${positiveDrivers.length > 0 ? ` (${positiveDrivers[0].name})` : ""}`,
      "Delay major execution decisions until confidence improves — the positive tilt may not be durable",
      `Map the specific evidence gaps that would move confidence from ${confidence} to High for ${targetLang.scope}`,
    ];
  }

  if (negDominate) {
    return [
      `Classify each barrier signal as structural (market/regulatory) or tactical (resolvable with targeted action) for ${targetLang.scope}`,
      negativeDrivers.length > 0
        ? `Assess whether ${negativeDrivers[0].name} is a permanent constraint or can be addressed within the forecast window`
        : "Identify the single highest-leverage barrier to address first",
      `Identify what single evidence change would shift ${targetLang.verb} probability above 50%`,
      positiveDrivers.length > 0
        ? `Determine whether ${positiveDrivers[0].name} can strengthen enough to offset the dominant barriers`
        : "Search for unreported positive signals that may not yet be captured in the evidence base",
    ];
  }

  if (probability >= 0.5) {
    return [
      `Map the 1-2 highest-leverage evidence gaps that would shift ${targetLang.verb} probability above 70%`,
      `Validate the strongest positive signal with an independent data source for ${targetLang.scope}`,
      negativeDrivers.length > 0
        ? `Assess whether ${negativeDrivers[0].name} is structural or resolvable within the forecast window`
        : "Search for disconfirming evidence to test whether the positive tilt is durable",
      confidence === "Low" || confidence === "Developing"
        ? "Add validated signals to improve forecast stability before increasing resource allocation"
        : "Continue current monitoring cadence while watching for decisive signals",
    ];
  }

  return [
    `Classify each negative signal as structural or tactical for ${targetLang.scope}`,
    `Identify what single evidence change would shift ${targetLang.verb} probability above 50%`,
    positiveDrivers.length > 0
      ? `Determine whether ${positiveDrivers[0].name} could strengthen enough to offset barriers`
      : "Search for any unreported positive signals that may not yet be captured",
    "Consider whether a strategic pivot or question reframing would yield a more actionable forecast",
  ];
}

function buildRefinementSuggestions(inputs: {
  target: string;
  timeHorizon: string;
  geography: string | null;
  signalCount: number;
  probability: number;
  negativeDrivers: { name: string }[];
}): string[] {
  const { target, timeHorizon, geography, signalCount, probability, negativeDrivers } = inputs;
  const suggestions: string[] = [];

  if (target === "market") {
    suggestions.push("Narrow the target from market-level to specialty, subspecialty, institution, or physician-level for a higher-resolution read on adoption dynamics");
  } else if (target === "specialty") {
    suggestions.push("Consider drilling into subspecialty or institution-level questions to isolate where adoption momentum is strongest or weakest");
  } else {
    suggestions.push("Compare this target's trajectory against the broader market-level or specialty-level baseline to determine if it is an outlier");
  }

  if (!geography) {
    suggestions.push("Specify geography to sharpen the forecast — regional dynamics (formulary, payer mix, KOL influence) can materially differ");
  } else {
    suggestions.push(`Evaluate whether the ${geography} geography is representative or if other regions show different signal patterns`);
  }

  const vagueHorizons = ["tbd", "ongoing", "undefined", ""];
  if (vagueHorizons.includes((timeHorizon || "").toLowerCase())) {
    suggestions.push("Define a specific time horizon (e.g., 6 months, 12 months) — vague timelines reduce forecast actionability");
  } else {
    suggestions.push(`Assess whether the ${timeHorizon} window is realistic given the current evidence trajectory${probability < 0.5 ? " and barrier profile" : ""}`);
  }

  if (signalCount < 4) {
    suggestions.push("Expand the signal base — forecasts with few signals carry hidden fragility regardless of probability level");
  } else if (negativeDrivers.length > 0) {
    suggestions.push(`Investigate whether ${negativeDrivers[0].name} could amplify under stress conditions or competitive shifts`);
  } else {
    suggestions.push("Add a counter-scenario question to stress-test the current thesis from the opposing direction");
  }

  return suggestions;
}

export function deriveForecastInterpretation(inputs: {
  probability: number;
  prior: number;
  confidence: string;
  keyDrivers: { name: string; direction: string; lr: number; signalType: string }[];
  signalCount: number;
  target: string;
  timeHorizon: string;
  geography?: string | null;
}): ForecastInterpretation {
  const { probability, prior, confidence, keyDrivers, signalCount, target, timeHorizon, geography } = inputs;
  const pct = (probability * 100).toFixed(1);
  const changeNum = (probability - prior) * 100;
  const changePts = changeNum.toFixed(1);
  const changePrefix = changeNum >= 0 ? "+" : "";
  const positiveDrivers = keyDrivers.filter(d => d.direction === "Positive");
  const negativeDrivers = keyDrivers.filter(d => d.direction === "Negative");
  const topDriver = keyDrivers.length > 0 ? keyDrivers[0].name : null;

  const bandLabel = getProbabilityBandLabel(probability);
  const targetLang = getTargetLanguage(target);
  const confidenceSentence = getConfidenceSentence(confidence);

  let priority: string;
  let priorityLabel: ForecastInterpretation["priorityLabel"];
  let coreSummary: string;

  if (probability > 0.7) {
    priority = "Execute strategy";
    priorityLabel = "execute";
    coreSummary = `At ${pct}% (${changePrefix}${changePts} pts from prior), the ${targetLang.noun} strongly favors the outcome. ${positiveDrivers.length} positive driver${positiveDrivers.length !== 1 ? "s" : ""} dominate the signal mix${topDriver ? `, led by ${topDriver}` : ""}. The ${timeHorizon} window supports forward execution on ${targetLang.verb}.`;
  } else if (probability >= 0.5) {
    priority = "Reduce uncertainty";
    priorityLabel = "reduce-uncertainty";
    coreSummary = `At ${pct}% (${changePrefix}${changePts} pts from prior), the ${targetLang.noun} leans favorable but hasn't reached conviction for ${targetLang.scope}. ${positiveDrivers.length} positive vs. ${negativeDrivers.length} negative driver${negativeDrivers.length !== 1 ? "s" : ""} — the balance hasn't tipped decisively. The priority is identifying what would push ${targetLang.verb} above 70%.`;
  } else {
    priority = "Identify barriers";
    priorityLabel = "identify-barriers";
    coreSummary = `At ${pct}% (${changePrefix}${changePts} pts from prior), the evidence weighs against the outcome for ${targetLang.scope}. ${negativeDrivers.length} barrier signal${negativeDrivers.length !== 1 ? "s" : ""} are suppressing ${targetLang.verb}${topDriver ? `, most notably ${topDriver}` : ""}. The priority is understanding which barriers are structural vs. resolvable.`;
  }

  const interpretationSummary = `${coreSummary} ${confidenceSentence}`;

  const nextActions = buildNextActions({
    probability,
    confidence,
    positiveDrivers,
    negativeDrivers,
    signalCount,
    targetLang,
  });

  const questionRefinementSuggestions = buildRefinementSuggestions({
    target,
    timeHorizon,
    geography: geography ?? null,
    signalCount,
    probability,
    negativeDrivers,
  });

  let cautionNote: string | null = null;
  if (confidence === "Low" || confidence === "Developing") {
    cautionNote = "Low confidence — this forecast has limited signal support. Treat all outputs as preliminary and avoid high-commitment decisions until the evidence base strengthens.";
  } else if ((confidence === "Moderate" || confidence === "Medium") && signalCount < 3) {
    cautionNote = "Moderate confidence with thin signal coverage — forecast direction is indicative but may shift with additional evidence.";
  }

  return {
    priority,
    priorityLabel,
    probabilityBandLabel: bandLabel,
    interpretationSummary,
    nextActions,
    questionRefinementSuggestions,
    cautionNote,
  };
}
