import { DecisionQuestion } from "./types";

export function mapDecisionQuestionToCaseInput(q: DecisionQuestion) {
  return {
    title: q.interpretedQuestion,
    subject: q.subject,
    outcome: q.outcome,
    entities: q.populationOrEntities,
    timeHorizon: q.timeHorizon,
    successMetric: q.successMetric,
    comparator: q.comparator,
    questionType: q.questionType,
  };
}
