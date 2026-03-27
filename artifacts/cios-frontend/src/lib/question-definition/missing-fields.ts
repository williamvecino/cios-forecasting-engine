import type { DecisionQuestion, QuestionType } from "./types";

type PartialDQ = Partial<DecisionQuestion>;

const REQUIRED_BY_TYPE: Record<QuestionType, string[]> = {
  binary: ["subject", "outcome", "populationOrEntities", "timeHorizon"],
  comparative: ["subject", "outcome", "populationOrEntities", "timeHorizon", "comparator"],
  ranking: ["subject", "outcome", "populationOrEntities", "timeHorizon"],
  threshold: ["subject", "outcome", "populationOrEntities", "timeHorizon", "successMetric"],
  timing: ["subject", "outcome", "populationOrEntities"],
};

const MIN_ENTITIES: Record<QuestionType, number> = {
  binary: 1,
  comparative: 2,
  ranking: 1,
  threshold: 1,
  timing: 1,
};

function isGenericEntity(e: string): boolean {
  const generic = [
    "regions", "geographic areas", "segments", "markets",
    "centers", "groups", "stakeholders", "populations",
  ];
  return generic.includes(e.toLowerCase());
}

export function getMissingFields(question: PartialDQ): string[] {
  const qt = question.questionType || "binary";
  const required = REQUIRED_BY_TYPE[qt];
  const missing: string[] = [];

  for (const field of required) {
    if (field === "populationOrEntities") {
      const entities = question.populationOrEntities || [];
      const minRequired = MIN_ENTITIES[qt];

      if (entities.length === 0) {
        missing.push("populationOrEntities");
      } else if (entities.length < minRequired) {
        missing.push("populationOrEntities");
      } else if (
        qt === "comparative" &&
        entities.length <= 1 &&
        entities.every(isGenericEntity)
      ) {
        missing.push("populationOrEntities");
      }
    } else {
      const val = (question as any)[field];
      if (!val || (typeof val === "string" && !val.trim())) {
        missing.push(field);
      }
    }
  }

  return missing;
}

export function isQuestionComplete(question: PartialDQ): boolean {
  return getMissingFields(question).length === 0;
}

export function getClarificationPrompt(field: string, questionType: QuestionType): string {
  const prompts: Record<string, Record<string, string>> = {
    subject: {
      default: "What product, strategy, or topic is this about?",
    },
    outcome: {
      default: "What outcome are you trying to predict?",
    },
    populationOrEntities: {
      comparative: "Which specific groups should be compared?",
      ranking: "Which specific groups or regions should be ranked?",
      default: "Who is the target population?",
    },
    comparator: {
      default: "What are you comparing against?",
    },
    timeHorizon: {
      default: "What time horizon should be used?",
    },
    successMetric: {
      threshold: "What threshold should count as success?",
      default: "What defines success?",
    },
  };

  const fieldPrompts = prompts[field];
  if (!fieldPrompts) return `Please provide: ${field}`;
  return fieldPrompts[questionType] || fieldPrompts.default;
}
