import type { DecisionQuestion } from "./types";

export function buildInterpretedQuestion(q: Partial<DecisionQuestion>): string {
  const qt = q.questionType || "binary";
  const subject = q.subject || "this product";
  const outcome = q.outcome || "the expected outcome";
  const entities = q.populationOrEntities || [];
  const time = q.timeHorizon;
  const metric = q.successMetric;
  const comparator = q.comparator;

  const entityStr = entities.length > 0 ? entities.join(", ") : "target population";
  const timeStr = time ? ` within ${time}` : "";

  switch (qt) {
    case "binary": {
      const metricStr = metric ? ` (${metric})` : "";
      return `Will ${subject} achieve ${outcome}${metricStr} among ${entityStr}${timeStr}?`;
    }

    case "comparative": {
      if (entities.length >= 2) {
        const first = entities[0];
        const rest = entities.slice(1).join(", ");
        const comp = comparator || "compared to";
        return `Will ${first} show ${outcome} of ${subject} ${comp} ${rest}${timeStr}?`;
      }
      return `Which entities will show stronger ${outcome} of ${subject}${timeStr}?`;
    }

    case "ranking": {
      return `Which ${entityStr} are most likely to lead ${outcome} of ${subject}${timeStr}?`;
    }

    case "threshold": {
      const metricStr = metric || "the target threshold";
      return `Will ${outcome} of ${subject} exceed ${metricStr} among ${entityStr}${timeStr}?`;
    }

    case "timing": {
      return `When will ${entityStr} begin ${outcome} of ${subject}?`;
    }

    default:
      return q.rawInput || "";
  }
}
