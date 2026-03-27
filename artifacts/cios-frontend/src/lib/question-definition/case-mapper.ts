import type { DecisionQuestion } from "./types";

export interface CaseInput {
  strategicQuestion: string;
  timeHorizon: string;
  priorProbability: number;
  primaryBrand: string;
  assetName: string;
  therapeuticArea?: string;
  geography?: string;
  outcomeDefinition?: string;
  targetType?: string;
}

export function mapDecisionQuestionToCaseInput(q: DecisionQuestion): CaseInput {
  const entities = q.populationOrEntities || [];

  const geographyEntities = entities.filter((e) =>
    /northeast|south|midwest|west|region|area|geography/i.test(e)
  );

  return {
    strategicQuestion: q.interpretedQuestion || q.rawInput,
    timeHorizon: q.timeHorizon || "12 months",
    priorProbability: 0.5,
    primaryBrand: q.subject || "Custom",
    assetName: q.subject || "Custom",
    outcomeDefinition: q.outcome || undefined,
    geography: geographyEntities.length > 0 ? geographyEntities.join(", ") : "US",
    targetType: q.questionType === "ranking" || q.questionType === "comparative" ? "segment" : "market",
  };
}
