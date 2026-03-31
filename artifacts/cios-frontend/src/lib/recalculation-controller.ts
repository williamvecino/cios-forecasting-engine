import type { ForecastCaseInput, ForecastOutput } from "./types";

const API = import.meta.env.VITE_API_URL || "";

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
    const res = await fetch(`${API}/api/forecast/recalculate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Forecast computation failed (${res.status})`);
    }

    const output: ForecastOutput = await res.json();
    return {
      status: "ready",
      lastOutput: output,
      errorMessage: null,
      dirtyReason: null,
    };
  } catch (error: unknown) {
    return {
      status: "error",
      lastOutput: null,
      errorMessage: error instanceof Error ? error.message : "Unknown recalculation error",
      dirtyReason: null,
    };
  }
}
