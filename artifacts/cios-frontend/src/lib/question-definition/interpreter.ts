import { DecisionQuestion } from "./types";

export function buildInterpretedQuestion(q: DecisionQuestion): string {
  if (q.rawInput?.trim()) {
    return q.rawInput.trim();
  }

  const subject = q.subject || "";
  const outcome = q.outcome || "";
  const entities = q.populationOrEntities?.join(", ") || "";
  const time = q.timeHorizon || "";

  if (!subject && !outcome && !entities) return "";

  switch (q.questionType) {
    case "comparative":
      if (entities && subject && time) {
        return `Will ${entities} differ in adoption of ${subject} within ${time}?`;
      }
      break;
    case "ranking":
      if (entities && subject) {
        return `Which of ${entities} will lead adoption of ${subject}?`;
      }
      break;
    default:
      break;
  }

  return q.rawInput || "";
}
