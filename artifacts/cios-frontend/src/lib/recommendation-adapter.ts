export interface Recommendation {
  headline: string;
  rationale: string;
  riskNote: string;
  monitorNext: string[];
}

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
