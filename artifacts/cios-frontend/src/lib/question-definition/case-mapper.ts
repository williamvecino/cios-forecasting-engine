import { DecisionQuestion } from "./types";

const ARCHETYPE_PRIORS: Record<string, number> = {
  "Launch Adoption Risk": 0.50,
  "Competitive Displacement Risk": 0.40,
  "Market Access Constraint": 0.45,
  "Regulatory Outcome Risk": 0.35,
  "Early Adoption Acceleration": 0.55,
  "Clinical Differentiation Sustainability": 0.45,
};

export function mapDecisionQuestionToCaseInput(q: DecisionQuestion & { priorArchetype?: string; priorRationale?: string; outcomeThreshold?: string }) {
  const prior = q.priorArchetype ? (ARCHETYPE_PRIORS[q.priorArchetype] ?? 0.50) : 0.50;
  const threshold = q.outcomeThreshold || q.outcome || "target outcome";
  return {
    assetName: q.subject || "Unknown Asset",
    assetType: "Medication",
    geography: q.populationOrEntities?.join(", ") || "US",
    specialty: "General",
    strategicQuestion: q.interpretedQuestion || q.rawInput,
    outcomeDefinition: q.outcome || threshold,
    outcomeThreshold: threshold,
    timeHorizon: q.timeHorizon || "12 months",
    priorProbability: prior,
    currentProbability: prior,
    primaryBrand: q.subject || "Unknown Asset",
    comparator: q.comparator,
    questionType: q.questionType,
    priorArchetype: q.priorArchetype || null,
    priorRationale: q.priorRationale || null,
    confidenceLevel: "Developing",
    isDraft: "false",
  };
}
