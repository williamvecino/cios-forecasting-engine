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
  populationOrEntities: "Who or what are we comparing?",
  comparator: "Compared to what?",
  timeHorizon: "Over what time period?",
  successMetric: "How do we define success?",
};
