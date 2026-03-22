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
  interpretationSummary: string;
  nextActions: string[];
  questionRefinementSuggestions: string[];
}

export function deriveForecastInterpretation(inputs: {
  probability: number;
  prior: number;
  confidence: string;
  keyDrivers: { name: string; direction: string; lr: number; signalType: string }[];
  signalCount: number;
  target: string;
  timeHorizon: string;
}): ForecastInterpretation {
  const { probability, prior, confidence, keyDrivers, signalCount, target, timeHorizon } = inputs;
  const pct = (probability * 100).toFixed(1);
  const changeNum = (probability - prior) * 100;
  const changePts = changeNum.toFixed(1);
  const changePrefix = changeNum >= 0 ? "+" : "";
  const positiveDrivers = keyDrivers.filter(d => d.direction === "Positive");
  const negativeDrivers = keyDrivers.filter(d => d.direction === "Negative");
  const topDriver = keyDrivers.length > 0 ? keyDrivers[0].name : null;

  if (probability > 0.7) {
    return {
      priority: "Execute strategy",
      priorityLabel: "execute",
      interpretationSummary: `At ${pct}% (${changePrefix}${changePts} pts from prior), the evidence base strongly favors the outcome${target !== "market" ? ` for this ${target}-level question` : ""}. ${positiveDrivers.length} positive driver${positiveDrivers.length !== 1 ? "s" : ""} dominate the signal mix${topDriver ? `, led by ${topDriver}` : ""}. The ${timeHorizon} window supports forward execution.`,
      nextActions: [
        "Lock in resource commitments aligned with the favorable forecast",
        "Identify the 1-2 signals that could reverse the current trajectory",
        confidence === "Low" || confidence === "Developing"
          ? "Add higher-reliability signals to strengthen confidence before major commitments"
          : "Track competitive response signals for early warning of trajectory change",
      ],
      questionRefinementSuggestions: [
        "Consider narrowing the time horizon to test near-term execution readiness",
        negativeDrivers.length > 0
          ? `Investigate whether ${negativeDrivers[0].name} could amplify under stress conditions`
          : "Add a counter-scenario question to stress-test the bullish thesis",
        signalCount < 4
          ? "Expand the signal base — high probability with few signals carries hidden fragility"
          : "The signal density is adequate; focus on signal quality over quantity",
      ],
    };
  }

  if (probability >= 0.5) {
    return {
      priority: "Reduce uncertainty",
      priorityLabel: "reduce-uncertainty",
      interpretationSummary: `At ${pct}% (${changePrefix}${changePts} pts from prior), the outcome leans favorable but hasn't reached conviction${target !== "market" ? ` at the ${target} level` : ""}. ${positiveDrivers.length} positive vs. ${negativeDrivers.length} negative driver${negativeDrivers.length !== 1 ? "s" : ""} — the balance hasn't tipped decisively. The priority is identifying what would push above 70%.`,
      nextActions: [
        "Map the 1-2 highest-leverage evidence gaps that would shift probability above 70%",
        "Validate the strongest positive signal with an independent data source",
        negativeDrivers.length > 0
          ? `Assess whether ${negativeDrivers[0].name} is structural or resolvable`
          : "Search for disconfirming evidence to test whether the positive tilt is durable",
      ],
      questionRefinementSuggestions: [
        "Break this question into sub-questions targeting each key uncertainty",
        `Consider whether the ${timeHorizon} time horizon is compressing or expanding the true probability`,
        target === "market"
          ? "Narrow the target scope (specialty, institution, or physician) for a higher-resolution read"
          : "Compare this target's trajectory against the broader market-level question",
      ],
    };
  }

  return {
    priority: "Identify barriers",
    priorityLabel: "identify-barriers",
    interpretationSummary: `At ${pct}% (${changePrefix}${changePts} pts from prior), the evidence weighs against the outcome${target !== "market" ? ` at the ${target} level` : ""}. ${negativeDrivers.length} barrier signal${negativeDrivers.length !== 1 ? "s" : ""} are driving the forecast below 50%${topDriver ? `, most notably ${topDriver}` : ""}. The priority is understanding which barriers are structural vs. resolvable.`,
    nextActions: [
      "Classify each negative signal as structural (market/regulatory) or tactical (resolvable with action)",
      "Identify what single evidence change would shift probability above 50%",
      positiveDrivers.length > 0
        ? `Determine whether ${positiveDrivers[0].name} could strengthen enough to offset barriers`
        : "Search for any unreported positive signals that may not yet be captured",
    ],
    questionRefinementSuggestions: [
      "Reframe the question to test whether a narrower or alternative outcome is more achievable",
      `Evaluate whether the ${timeHorizon} window is realistic given the barrier profile`,
      target === "market"
        ? "Test whether specific institutions or physicians show more favorable micro-trajectories"
        : "Compare against the market-level baseline to determine if this target is an outlier",
    ],
  };
}
