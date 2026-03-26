import type { TrendState } from "@/components/case-library/mini-curve";
import type { DriverType } from "@/components/case-library/driver-icons";

export interface CaseCardData {
  caseId: string;
  strategicQuestion: string;
  probability: number;
  baseScenario: number;
  upsideScenario: number;
  downsideScenario: number;
  trend: TrendState;
  drivers: DriverType[];
  status: string;
  suggestion: string;
  updatedAt: string;
}

const TREND_OPTIONS: TrendState[] = ["rising", "flat", "declining", "volatile"];

const DRIVER_POOL: DriverType[] = [
  "evidence",
  "access",
  "competition",
  "guideline",
  "timing",
  "adoption",
];

const SUGGESTIONS = [
  "Monitor access closely",
  "Momentum improving",
  "Scenario-sensitive case",
  "Barrier reduction needed",
  "Watch competitive response",
  "Guideline alignment strengthening",
  "Evidence gap closing",
  "Timing window narrowing",
];

const STATUSES = ["Monitoring", "Active", "Escalated", "Stable", "Watch"];

function deriveTrend(prob: number): TrendState {
  if (prob >= 0.6) return "rising";
  if (prob >= 0.4) return "flat";
  if (prob >= 0.25) return "volatile";
  return "declining";
}

function deriveDrivers(idx: number): DriverType[] {
  const count = 2 + (idx % 3);
  const start = idx % DRIVER_POOL.length;
  const result: DriverType[] = [];
  for (let i = 0; i < count; i++) {
    result.push(DRIVER_POOL[(start + i) % DRIVER_POOL.length]);
  }
  return result;
}

function deriveSuggestion(idx: number): string {
  return SUGGESTIONS[idx % SUGGESTIONS.length];
}

function deriveStatus(prob: number, idx: number): string {
  if (prob >= 0.7) return "Active";
  if (prob <= 0.2) return "Escalated";
  return STATUSES[idx % STATUSES.length];
}

export function enrichCase(
  raw: {
    caseId: string;
    strategicQuestion: string;
    currentProbability: number | null;
    updatedAt: string;
  },
  idx: number
): CaseCardData {
  const prob = raw.currentProbability ?? 0.5;
  const base = prob;
  const upside = Math.min(1, prob + 0.12 + (idx % 5) * 0.02);
  const downside = Math.max(0, prob - 0.1 - (idx % 4) * 0.03);

  return {
    caseId: raw.caseId,
    strategicQuestion: raw.strategicQuestion,
    probability: prob,
    baseScenario: base,
    upsideScenario: upside,
    downsideScenario: downside,
    trend: deriveTrend(prob),
    drivers: deriveDrivers(idx),
    status: deriveStatus(prob, idx),
    suggestion: deriveSuggestion(idx),
    updatedAt: raw.updatedAt,
  };
}
