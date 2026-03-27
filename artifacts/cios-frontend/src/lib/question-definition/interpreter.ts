import { DecisionQuestion } from "./types";

export function buildInterpretedQuestion(q: DecisionQuestion): string {
  const subject = q.subject || "the subject";
  const outcome = q.outcome || "the outcome";
  const entities = q.populationOrEntities?.join(", ") || "the population";
  const time = q.timeHorizon || "the defined time horizon";
  const metric = q.successMetric;

  switch (q.questionType) {
    case "binary":
      return `Will ${entities} achieve ${outcome} for ${subject} within ${time}?`;

    case "comparative":
      return `Will ${entities} differ in ${outcome} for ${subject} within ${time}?`;

    case "ranking":
      return `Which of ${entities} is most likely to lead ${outcome} for ${subject} within ${time}?`;

    case "threshold":
      return `Will ${outcome} for ${subject} reach ${metric} among ${entities} within ${time}?`;

    case "timing":
      return `When will ${entities} achieve ${outcome} for ${subject}?`;

    default:
      return q.rawInput;
  }
}
