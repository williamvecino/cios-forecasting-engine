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

function applyLocalDependencyCompression(input: ForecastCaseInput): ForecastCaseInput {
  const signals = input.signals;
  if (!signals || signals.length === 0) return input;

  const rootGroups = new Map<string, Array<{ idx: number; lr: number }>>();
  signals.forEach((s: any, idx: number) => {
    const root = s.rootEvidenceId || s.eventFamilyId || s.sourceCluster;
    if (root) {
      if (!rootGroups.has(root)) rootGroups.set(root, []);
      rootGroups.get(root)!.push({ idx, lr: s.likelihoodRatio ?? 1 });
    }
  });

  const compressed = [...signals];
  for (const [, group] of rootGroups) {
    if (group.length <= 1) continue;
    group.sort((a, b) => Math.abs(Math.log(b.lr || 1)) - Math.abs(Math.log(a.lr || 1)));
    for (let i = 1; i < group.length; i++) {
      const orig = (compressed[group[i].idx] as any).likelihoodRatio ?? 1;
      const dampened = 1 + (orig - 1) * 0.3;
      (compressed[group[i].idx] as any) = { ...compressed[group[i].idx] as any, likelihoodRatio: dampened };
    }
  }

  return { ...input, signals: compressed };
}

export async function recalculateForecast(
  input: ForecastCaseInput
): Promise<ForecastRunState> {
  try {
    const compressedInput = applyLocalDependencyCompression(input);
    const output = runCoreForecast(compressedInput);
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
