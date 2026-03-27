import { DecisionQuestion } from "./types";

export function getMissingFields(q: Partial<DecisionQuestion>): string[] {
  const missing: string[] = [];

  if (!q.subject) missing.push("subject");
  if (!q.outcome) missing.push("outcome");

  switch (q.questionType) {
    case "binary":
      if (!q.populationOrEntities) missing.push("populationOrEntities");
      if (!q.timeHorizon) missing.push("timeHorizon");
      break;

    case "comparative":
      if (!q.populationOrEntities || q.populationOrEntities.length < 2)
        missing.push("populationOrEntities");
      if (!q.timeHorizon) missing.push("timeHorizon");
      break;

    case "ranking":
      if (!q.populationOrEntities || q.populationOrEntities.length < 2)
        missing.push("populationOrEntities");
      if (!q.timeHorizon) missing.push("timeHorizon");
      break;

    case "threshold":
      if (!q.populationOrEntities) missing.push("populationOrEntities");
      if (!q.timeHorizon) missing.push("timeHorizon");
      if (!q.successMetric) missing.push("successMetric");
      break;

    case "timing":
      if (!q.populationOrEntities) missing.push("populationOrEntities");
      break;
  }

  return missing;
}

export function isQuestionComplete(q: Partial<DecisionQuestion>): boolean {
  return getMissingFields(q).length === 0;
}
