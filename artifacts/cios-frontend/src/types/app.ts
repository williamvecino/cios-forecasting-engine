export type NavKey =
  | "questions"
  | "adopter-discovery"
  | "event-radar"
  | "signal-detection"
  | "signal-review"
  | "dashboard"
  | "forecast-ledger"
  | "calibration"
  | "system-map";

export type WorkflowStep =
  | "question"
  | "adopters"
  | "events"
  | "detection"
  | "review"
  | "forecast"
  | "learning";

export type ActiveQuestion = {
  id: string;
  title: string;
  therapyArea?: string;
  geography?: string;
  horizon?: string;
  targetPopulation?: string;
  adoptionDefinition?: string;
} | null;

export type SignalStatus = "candidate" | "reviewed" | "validated" | "active" | "archived" | "rejected";
