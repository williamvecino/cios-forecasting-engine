export interface ForecastSnapshot {
  caseId: string;
  snapshotVersion: number;
  decisionPattern: string | null;
  primaryConstraint: string | null;
  topDrivers: string[];
  baselinePrior: number;
  forecastProbability: number;
  forecastDirection: "favorable" | "unfavorable" | "neutral";
  recommendedAction: string | null;
  signalCount: number;
  signalHash: string;
  canonicalHash: string;
}

export interface DriftResult {
  hasMaterialDrift: boolean;
  driftFields: DriftDetail[];
  consistencyScore: "high" | "moderate" | "low";
  message: string | null;
}

export interface DriftDetail {
  field: string;
  previousValue: string | number | null;
  currentValue: string | number | null;
  severity: "material" | "minor";
}

function forecastDirection(prob: number): "favorable" | "unfavorable" | "neutral" {
  if (prob >= 0.55) return "favorable";
  if (prob <= 0.45) return "unfavorable";
  return "neutral";
}

export function buildForecastSnapshot(
  caseId: string,
  version: number,
  data: {
    decisionPattern: string | null;
    primaryConstraint: string | null;
    topDriverDescriptions: string[];
    baselinePrior: number;
    forecastProbability: number;
    recommendedAction: string | null;
    signalCount: number;
    signalIds: string[];
    canonicalFields: Record<string, unknown> | null;
  },
): ForecastSnapshot {
  const signalHash = simpleHash(data.signalIds.sort().join("|"));
  const canonicalHash = simpleHash(stableStringify(data.canonicalFields ?? {}));

  return {
    caseId,
    snapshotVersion: version,
    decisionPattern: data.decisionPattern,
    primaryConstraint: data.primaryConstraint,
    topDrivers: data.topDriverDescriptions.slice(0, 3),
    baselinePrior: data.baselinePrior,
    forecastProbability: data.forecastProbability,
    forecastDirection: forecastDirection(data.forecastProbability),
    recommendedAction: data.recommendedAction,
    signalCount: data.signalCount,
    signalHash,
    canonicalHash,
  };
}

export function detectDrift(
  previous: ForecastSnapshot,
  current: ForecastSnapshot,
): DriftResult {
  const drifts: DriftDetail[] = [];

  if (previous.decisionPattern !== current.decisionPattern) {
    drifts.push({
      field: "Decision Pattern",
      previousValue: previous.decisionPattern,
      currentValue: current.decisionPattern,
      severity: "material",
    });
  }

  if (previous.primaryConstraint !== current.primaryConstraint) {
    drifts.push({
      field: "Primary Constraint",
      previousValue: previous.primaryConstraint,
      currentValue: current.primaryConstraint,
      severity: "material",
    });
  }

  const prevDriverSet = new Set(previous.topDrivers);
  const currDriverSet = new Set(current.topDrivers);
  const driverOverlap = [...prevDriverSet].filter((d) => currDriverSet.has(d)).length;
  const driverTotal = Math.max(prevDriverSet.size, currDriverSet.size);
  if (driverTotal > 0 && driverOverlap / driverTotal < 0.5) {
    drifts.push({
      field: "Top Drivers",
      previousValue: previous.topDrivers.join("; "),
      currentValue: current.topDrivers.join("; "),
      severity: "material",
    });
  }

  const probDelta = Math.abs(current.forecastProbability - previous.forecastProbability);
  if (probDelta > 0.10) {
    drifts.push({
      field: "Forecast Probability",
      previousValue: previous.forecastProbability,
      currentValue: current.forecastProbability,
      severity: "material",
    });
  }

  if (previous.forecastDirection !== current.forecastDirection) {
    drifts.push({
      field: "Forecast Direction",
      previousValue: previous.forecastDirection,
      currentValue: current.forecastDirection,
      severity: "material",
    });
  }

  if (
    previous.recommendedAction &&
    current.recommendedAction &&
    previous.recommendedAction !== current.recommendedAction
  ) {
    const prevWords = new Set(previous.recommendedAction.toLowerCase().split(/\s+/));
    const currWords = new Set(current.recommendedAction.toLowerCase().split(/\s+/));
    const overlap = [...prevWords].filter((w) => currWords.has(w)).length;
    const total = Math.max(prevWords.size, currWords.size);
    if (total > 0 && overlap / total < 0.4) {
      drifts.push({
        field: "Recommended Action",
        previousValue: previous.recommendedAction,
        currentValue: current.recommendedAction,
        severity: "material",
      });
    }
  }

  const materialDrifts = drifts.filter((d) => d.severity === "material");
  const hasMaterialDrift = materialDrifts.length > 0 && previous.canonicalHash === current.canonicalHash;

  let consistencyScore: "high" | "moderate" | "low";
  if (materialDrifts.length === 0) {
    consistencyScore = "high";
  } else if (materialDrifts.length <= 2) {
    consistencyScore = "moderate";
  } else {
    consistencyScore = "low";
  }

  let message: string | null = null;
  if (hasMaterialDrift) {
    message = `Inconsistent run detected — ${materialDrifts.map((d) => d.field).join(", ")} changed without a material case change.`;
  }

  return { hasMaterialDrift, driftFields: drifts, consistencyScore, message };
}

export function computeConsistencyFromHistory(
  snapshots: ForecastSnapshot[],
): { score: "high" | "moderate" | "low"; details: string } {
  if (snapshots.length <= 1) {
    return { score: "high", details: "Initial run — no comparison available." };
  }

  let materialDriftCount = 0;
  let totalComparisons = 0;

  for (let i = 1; i < snapshots.length; i++) {
    const result = detectDrift(snapshots[i - 1], snapshots[i]);
    totalComparisons++;
    if (result.hasMaterialDrift) materialDriftCount++;
  }

  const driftRate = materialDriftCount / totalComparisons;

  if (driftRate === 0) {
    return { score: "high", details: `${totalComparisons} run(s) compared — all consistent.` };
  }
  if (driftRate <= 0.3) {
    return {
      score: "moderate",
      details: `${materialDriftCount} of ${totalComparisons} run(s) showed material drift.`,
    };
  }
  return {
    score: "low",
    details: `${materialDriftCount} of ${totalComparisons} run(s) showed material drift — review case definition.`,
  };
}

function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(stableStringify).join(",") + "]";
  const sorted = Object.keys(obj as Record<string, unknown>).sort();
  return "{" + sorted.map((k) => `${JSON.stringify(k)}:${stableStringify((obj as Record<string, unknown>)[k])}`).join(",") + "}";
}

function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
