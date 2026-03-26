import type { ForecastCaseInput, ForecastOutput } from "./types";
import { runCoreForecast } from "./core-forecast-engine";

export interface ForecastRunState {
  status: "idle" | "dirty" | "running" | "ready" | "error";
  lastOutput: ForecastOutput | null;
  errorMessage: string | null;
  dirtyReason: string | null;
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

export async function recalculateForecast(
  input: ForecastCaseInput
): Promise<ForecastRunState> {
  try {
    const output = runCoreForecast(input);
    return {
      status: "ready",
      lastOutput: output,
      errorMessage: null,
      dirtyReason: null,
    };
  } catch (error: any) {
    return {
      status: "error",
      lastOutput: null,
      errorMessage: error?.message ?? "Unknown recalculation error",
      dirtyReason: null,
    };
  }
}
