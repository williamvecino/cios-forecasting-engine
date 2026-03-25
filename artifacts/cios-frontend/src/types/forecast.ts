import type { CoreSignalType, SignalSubtype } from "../lib/signal-taxonomy";

export type ForecastDirection = "positive" | "negative" | "neutral";
export type ConfidenceBand = "low" | "medium" | "high";

export interface SignalRecord {
  id: string;
  caseId: string;
  createdAt: string;

  title: string;
  description: string;

  signalType: CoreSignalType;
  signalSubtype?: SignalSubtype;

  actor?: string;
  source?: string;
  sourceUrl?: string;

  direction: ForecastDirection;

  strengthScore?: number;
  reliabilityScore?: number;
  independenceScore?: number;
  confidenceBand?: ConfidenceBand;

  notes?: string;

  isCalibrationRelevant?: boolean;
  observedOutcomeLinked?: boolean;
}

export interface ForecastRecord {
  id: string;
  caseId: string;
  createdAt: string;
  updatedAt?: string;

  question: string;
  predictedProbability: number;
  actualOutcome?: number;

  signals: SignalRecord[];

  actor?: string;
  market?: string;
  asset?: string;
  horizon?: string;
  status?: "open" | "resolved";
}

export interface CalibrationRow {
  forecastId: string;
  caseId: string;
  predictedProbability: number;
  actualOutcome: number;
  brierScore: number;
  errorPp: number;
  activeSignalTypes: CoreSignalType[];
  activeSignalSubtypes: SignalSubtype[];
}

export interface BiasBySignalType {
  signalType: CoreSignalType;
  label: string;
  n: number;
  meanErrorPp: number;
  meanBrier: number;
  calibrated: boolean;
}

export interface CalibrationSummary {
  totalForecasts: number;
  calibratedRecords: number;
  coveragePct: number;
  meanBrierScore: number | null;
  meanForecastErrorPp: number | null;
  biasBySignalType: BiasBySignalType[];
  resolvedRows: CalibrationRow[];
}
