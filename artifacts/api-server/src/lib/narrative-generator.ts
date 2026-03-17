export interface NarrativeInput {
  caseId: string;
  strategicQuestion: string;
  assetName: string;
  therapeuticArea: string;
  currentProbability: number;
  priorProbability: number;
  confidenceLevel: string;
  timeHorizon: string;
  forecastDate: string;
  predictionId?: string;
  positiveDrivers: { description: string; signalType: string; likelihoodRatio: number }[];
  negativeDrivers: { description: string; signalType: string; likelihoodRatio: number }[];
  interpretation: {
    primaryStatement: string;
    topSupportiveActor: string;
    topConstrainingActor: string;
    highestImpactSignal: string;
    recommendedAction: string;
    behavioralSummary: string;
  };
  sensitivityAnalysis: {
    upwardSignals: { description: string; deltaIfRemoved: number }[];
    downwardSignals: { description: string; deltaIfRemoved: number }[];
    swingFactor: { description: string; probabilityDeltaIfReversed: number; interpretation: string } | null;
    stabilityNote: string;
  };
}

export interface StrategicNarrative {
  caseId: string;
  predictionId: string | null;
  forecastDate: string;
  generatedAt: string;
  sections: {
    headline: string;
    coreForecastStatement: string;
    supportingDrivers: string;
    risksAndCounterSignals: string;
    interpretation: string;
    strategicImplication: string;
    whatWouldChangeTheForecast: string;
  };
}

function pct(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

function directionWord(prob: number): string {
  if (prob >= 0.7) return "likely";
  if (prob >= 0.5) return "moderately likely";
  if (prob >= 0.3) return "uncertain but possible";
  return "unlikely";
}

function changeDescription(current: number, prior: number): string {
  const delta = current - prior;
  const absDelta = Math.abs(delta);
  if (absDelta < 0.02) return "essentially unchanged from the prior estimate";
  const direction = delta > 0 ? "increased" : "decreased";
  const magnitude = absDelta >= 0.15 ? "substantially" : absDelta >= 0.08 ? "moderately" : "slightly";
  return `${magnitude} ${direction} from the prior estimate of ${pct(prior)}`;
}

function confidenceQualifier(level: string): string {
  if (level === "High") return "with high confidence";
  if (level === "Moderate") return "with moderate confidence";
  return "with limited confidence due to sparse evidence";
}

function formatDriverBullets(drivers: NarrativeInput["positiveDrivers"]): string {
  if (drivers.length === 0) return "No significant drivers identified in this category.";
  return drivers
    .map((d) => `• ${d.description} (${d.signalType}, LR ${d.likelihoodRatio.toFixed(2)})`)
    .join("\n");
}

export function generateNarrative(input: NarrativeInput): StrategicNarrative {
  const {
    caseId,
    strategicQuestion,
    assetName,
    currentProbability,
    priorProbability,
    confidenceLevel,
    timeHorizon,
    forecastDate,
    predictionId,
    positiveDrivers,
    negativeDrivers,
    interpretation,
    sensitivityAnalysis,
  } = input;

  const prob = pct(currentProbability);
  const direction = directionWord(currentProbability);
  const change = changeDescription(currentProbability, priorProbability);
  const confidence = confidenceQualifier(confidenceLevel);

  const headline = `${assetName}: ${prob} probability of achieving target outcome — ${direction} within ${timeHorizon}`;

  const coreForecastStatement =
    `The current Bayesian forecast for "${strategicQuestion}" stands at ${prob}, ${change}. ` +
    `Based on ${positiveDrivers.length + negativeDrivers.length} validated signals evaluated ${confidence}, ` +
    `the evidence ${currentProbability >= 0.5 ? "favors" : "does not yet favor"} the target outcome within the ${timeHorizon} forecast horizon. ` +
    `${interpretation.primaryStatement}.`;

  const supportingDrivers = positiveDrivers.length > 0
    ? `The forecast is supported by ${positiveDrivers.length} positive signal${positiveDrivers.length > 1 ? "s" : ""}. ` +
      `The primary supportive actor group is ${interpretation.topSupportiveActor}.\n\n` +
      formatDriverBullets(positiveDrivers)
    : "No positive drivers currently support the forecast.";

  const risksAndCounterSignals = negativeDrivers.length > 0
    ? `${negativeDrivers.length} constraining signal${negativeDrivers.length > 1 ? "s" : ""} ${negativeDrivers.length > 1 ? "are" : "is"} exerting downward pressure. ` +
      `The top constraining actor group is ${interpretation.topConstrainingActor}.\n\n` +
      formatDriverBullets(negativeDrivers)
    : "No significant counter-signals or risk factors are currently identified.";

  const interpretationText =
    `${interpretation.behavioralSummary} ` +
    `The highest-impact signal in the current evidence set is: "${interpretation.highestImpactSignal}" ` +
    `The recommended strategic action is to ${interpretation.recommendedAction.toLowerCase()}.`;

  const strategicImplication =
    currentProbability >= 0.7
      ? `At ${prob}, the forecast signals a strong favorable position. If this trajectory holds, strategic planning should proceed on the assumption that the target outcome is achievable. Resource allocation, commercial sequencing, and stakeholder engagement should reflect this probability band.`
      : currentProbability >= 0.5
        ? `At ${prob}, the forecast suggests a cautiously favorable position but with meaningful uncertainty remaining. Strategic planning should prepare for the target outcome while maintaining contingency options. Key decisions should be staged against incoming signal milestones.`
        : `At ${prob}, the forecast indicates the target outcome faces significant headwinds. Strategic planning should prioritize identifying and addressing the specific barriers that are constraining the probability. Scenario planning for alternative outcomes is advisable.`;

  const whatWouldChange = (() => {
    const parts: string[] = [];
    if (sensitivityAnalysis.upwardSignals.length > 0) {
      const upList = sensitivityAnalysis.upwardSignals
        .slice(0, 3)
        .map((s) => `"${s.description}" (removing it shifts probability by ${pct(Math.abs(s.deltaIfRemoved))})`)
        .join("; ");
      parts.push(`Key upward drivers that would weaken the forecast if removed: ${upList}.`);
    }
    if (sensitivityAnalysis.downwardSignals.length > 0) {
      const downList = sensitivityAnalysis.downwardSignals
        .slice(0, 3)
        .map((s) => `"${s.description}" (removing it shifts probability by +${pct(Math.abs(s.deltaIfRemoved))})`)
        .join("; ");
      parts.push(`Key downward pressures that would strengthen the forecast if removed: ${downList}.`);
    }
    if (sensitivityAnalysis.swingFactor) {
      parts.push(sensitivityAnalysis.swingFactor.interpretation);
    }
    if (sensitivityAnalysis.stabilityNote) {
      parts.push(sensitivityAnalysis.stabilityNote);
    }
    return parts.join(" ");
  })();

  return {
    caseId,
    predictionId: predictionId ?? null,
    forecastDate,
    generatedAt: new Date().toISOString(),
    sections: {
      headline,
      coreForecastStatement,
      supportingDrivers,
      risksAndCounterSignals,
      interpretation: interpretationText,
      strategicImplication,
      whatWouldChangeTheForecast: whatWouldChange,
    },
  };
}
