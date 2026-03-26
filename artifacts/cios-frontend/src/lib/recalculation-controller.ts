export interface ForecastRunState {
  status: "idle" | "dirty" | "running" | "ready" | "error";
  lastOutput: ForecastRunOutput | null;
  errorMessage: string | null;
  dirtyReason: string | null;
}

export interface ForecastRunOutput {
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
  explanation: string[];
  engineVersion: string;
  environmentFingerprint: string;
  inputFingerprint: string;
}

export const initialForecastRunState: ForecastRunState = {
  status: "idle",
  lastOutput: null,
  errorMessage: null,
  dirtyReason: null,
};

export function markForecastDirty(
  current: ForecastRunState,
  reason: string
): ForecastRunState {
  return {
    ...current,
    status: "dirty",
    dirtyReason: reason,
  };
}
