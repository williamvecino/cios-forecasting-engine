import { DecisionQuestion } from "./types";

export function mapDecisionQuestionToCaseInput(q: DecisionQuestion) {
  return {
    assetName: q.subject || "Unknown Asset",
    assetType: "Medication",
    geography: q.populationOrEntities?.join(", ") || "US",
    strategicQuestion: q.interpretedQuestion || q.rawInput,
    outcomeDefinition: q.outcome,
    timeHorizon: q.timeHorizon || "12 months",
    primaryBrand: q.subject || "Unknown Asset",
    comparator: q.comparator,
    questionType: q.questionType,
  };
}
