export type QuestionType =
  | "binary"
  | "comparative"
  | "ranking"
  | "threshold"
  | "timing";

export interface DecisionQuestion {
  id: string;
  rawInput: string;
  questionType: QuestionType;

  subject?: string;
  outcome?: string;
  populationOrEntities?: string[];
  comparator?: string;
  timeHorizon?: string;
  successMetric?: string;

  missingFields: string[];
  isComplete: boolean;
  interpretedQuestion?: string;

  createdAt: string;
}

export interface DraftQuestion {
  rawInput: string;
  overrides: Record<string, string>;
  editingField: string | null;
  clarificationValue: string;
}

export function createEmptyDraft(): DraftQuestion {
  return {
    rawInput: "",
    overrides: {},
    editingField: null,
    clarificationValue: "",
  };
}

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  binary: "Yes / No",
  comparative: "Comparative",
  ranking: "Ranking",
  threshold: "Threshold",
  timing: "Timing",
};

export const FIELD_LABELS: Record<string, string> = {
  subject: "What are we evaluating?",
  outcome: "What outcome are we predicting?",
  populationOrEntities: "Which groups are we comparing?",
  comparator: "Compared to what?",
  timeHorizon: "Over what time period?",
  successMetric: "How do we define success?",
};
