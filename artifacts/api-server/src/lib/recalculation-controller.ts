import type { ForecastCaseInput, ForecastOutput } from "./types";
import { runCoreForecast } from "./core-forecast-engine";
import { runDependencyAnalysis, applyCompressionToSignals } from "./signal-dependency-engine";

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
    const analysis = runDependencyAnalysis(input.signals as any);
    const compressedSignals = applyCompressionToSignals(input.signals as any, analysis);
    const compressedInput = { ...input, signals: compressedSignals as any };
    const output = runCoreForecast(compressedInput);

    if (analysis.confidenceCeiling && analysis.confidenceCeiling.maxAllowedProbability < 1.0) {
      const cap = analysis.confidenceCeiling.maxAllowedProbability;
      if (output.posterior > cap) {
        output.posterior = cap;
      }
      if (output.posterior < 1 - cap) {
        output.posterior = 1 - cap;
      }
    }

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
