export type SignalDirection = "positive" | "negative" | "neutral";

export interface SignalInput {
  id: string;
  label: string;
  likelihoodRatio: number;
  reliability: number;
  strength: number;
  direction: SignalDirection;
  enabled?: boolean;
}

export interface AppliedSignal {
  id: string;
  label: string;
  enabled: boolean;
  effectiveLikelihoodRatio: number;
  direction: SignalDirection;
}

export interface ForecastCaseInput {
  caseId: string;
  question: string;
  priorProbability: number;
  signals: SignalInput[];
  environment: ActorEnvironmentConfig;
}

export interface ForecastOutput {
  runId: string;
  caseId: string;
  question: string;
  priorProbability: number;
  posteriorProbability: number;
  adjustedProbability: number;
  priorMultiplier: number;
  posteriorMultiplier: number;
  signalCount: number;
  effectiveSignalCount: number;
  appliedSignals: AppliedSignal[];
  explanation: string[];
  engineVersion: string;
  environmentFingerprint: string;
  inputFingerprint: string;
}

export type {
  SpecialtyActorProfile,
  PayerEnvironment,
  GuidelineLeverage,
  CompetitiveLandscape,
  AdoptionPhase,
  ForecastHorizonMonths,
  ActorEnvironmentConfig,
  EnvironmentAdjustmentResult,
} from "./forecast-environment";
