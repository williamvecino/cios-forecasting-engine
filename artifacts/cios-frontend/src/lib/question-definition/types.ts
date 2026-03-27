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

  subject: string;
  outcome: string;
  populationOrEntities: string[];
  comparator?: string;
  timeHorizon: string;
  successMetric?: string;

  missingFields: string[];
  isComplete: boolean;
  interpretedQuestion: string;
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
  subject: "Subject",
  outcome: "Outcome",
  populationOrEntities: "Groups being evaluated",
  comparator: "Comparator",
  timeHorizon: "Time horizon",
  successMetric: "Success definition",
};
