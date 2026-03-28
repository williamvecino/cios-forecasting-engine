import { deterministicHash } from "./stability";

const MAX_ACTIVE_DRIVERS = 25;

interface DriverInput {
  id: string;
  name: string;
  logLr: number;
  lr: number;
  signalType: string;
  confidence: number;
}

interface ForecastLogEntry {
  timestamp: number;
  driverCount: number;
  largestShift: number;
  finalProbability: number;
}

const forecastLog: ForecastLogEntry[] = [];
const MAX_LOG_ENTRIES = 50;

let cachedStateHash: string | null = null;
let cachedDriverResult: any[] | null = null;

export function computeDriverInputHash(
  signals: DriverInput[],
  totalShift: number,
  activeCaseId: string,
): string {
  const hashInput = {
    caseId: activeCaseId,
    totalShift,
    signals: signals.map((s) => ({
      id: s.id,
      lr: s.lr,
      confidence: s.confidence,
    })),
  };
  return deterministicHash(hashInput);
}

export function getDriverCache(): {
  hash: string | null;
  result: any[] | null;
} {
  return { hash: cachedStateHash, result: cachedDriverResult };
}

export function setDriverCache(hash: string, result: any[]): void {
  cachedStateHash = hash;
  cachedDriverResult = result;
}

export function clearDriverCache(): void {
  cachedStateHash = null;
  cachedDriverResult = null;
}

export function deduplicateSignals(signals: DriverInput[]): {
  unique: DriverInput[];
  removedCount: number;
} {
  const seen = new Map<string, DriverInput>();
  for (const sig of signals) {
    if (!seen.has(sig.id)) {
      seen.set(sig.id, sig);
    }
  }
  const unique = Array.from(seen.values());
  const removedCount = signals.length - unique.length;
  if (removedCount > 0) {
    console.log(`[forecast-perf] duplicate_removed count=${removedCount}`);
  }
  return { unique, removedCount };
}

export function enforceDriverLimit(
  signals: DriverInput[],
): DriverInput[] {
  if (signals.length <= MAX_ACTIVE_DRIVERS) return signals;
  const sorted = [...signals].sort((a, b) => b.confidence - a.confidence);
  const kept = sorted.slice(0, MAX_ACTIVE_DRIVERS);
  const archived = sorted.slice(MAX_ACTIVE_DRIVERS);
  console.log(
    `[forecast-perf] driver_limit_enforced kept=${kept.length} archived=${archived.length}`,
  );
  return kept;
}

export function logForecastRun(
  driverCount: number,
  largestShift: number,
  finalProbability: number,
): void {
  forecastLog.push({
    timestamp: Date.now(),
    driverCount,
    largestShift,
    finalProbability,
  });
  if (forecastLog.length > MAX_LOG_ENTRIES) {
    forecastLog.splice(0, forecastLog.length - MAX_LOG_ENTRIES);
  }
}

export function getForecastLog(): readonly ForecastLogEntry[] {
  return forecastLog;
}

export { MAX_ACTIVE_DRIVERS };
