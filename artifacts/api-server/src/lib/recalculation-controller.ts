import type { ForecastCaseInput, ForecastOutput, SignalInput } from "./types";
import { runCoreForecast } from "./core-forecast-engine";
import { runDependencyAnalysis } from "./signal-dependency-engine";
import type { Signal } from "@workspace/db/schema";

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

function toAnalysisSignals(inputs: SignalInput[]): Signal[] {
  return inputs.map((s) => ({
    id: s.id,
    signalId: s.id,
    caseId: "",
    candidateId: null,
    brand: null,
    signalDescription: s.label,
    signalType: "",
    direction: s.direction === "positive" ? "Positive" : s.direction === "negative" ? "Negative" : "Neutral",
    strengthScore: s.strength,
    reliabilityScore: s.reliability,
    likelihoodRatio: s.likelihoodRatio,
    scope: "national",
    timing: "current",
    route: null,
    targetPopulation: null,
    miosFlag: "No",
    ohosFlag: "No",
    weightedSignalScore: null,
    actorAdjustedImpact: null,
    activeLikelihoodRatio: null,
    absoluteImpact: null,
    correlationGroup: null,
    signalScope: "market",
    appliesToTargetId: null,
    appliesToSpecialty: null,
    appliesToSubspecialty: null,
    appliesToInstitutionId: null,
    appliesToGeography: null,
    eventFamilyId: null,
    status: "active",
    createdByType: "human",
    createdById: null,
    strength: null,
    reliability: null,
    sourceLabel: null,
    sourceUrl: null,
    evidenceSnippet: null,
    observedAt: null,
    notes: null,
    interpretationId: null,
    rootEvidenceId: null,
    signalLineage: null,
    sourceCluster: null,
    dependencyRole: null,
    lineageConfidence: null,
    novelInformationFlag: null,
    echoVsTranslation: null,
    lineageOverride: false,
    identifierSource: null,
    identifierType: null,
    identifierValue: null,
    verificationStatus: "unverified",
    registryMatch: null,
    verificationTimestamp: null,
    verificationRedFlags: null,
    createdAt: null,
    updatedAt: null,
  }));
}

export async function recalculateForecast(
  input: ForecastCaseInput
): Promise<ForecastRunState> {
  try {
    const fullSignals = toAnalysisSignals(input.signals);
    const analysis = runDependencyAnalysis(fullSignals);

    const compressionMap = new Map<string, number>();
    for (const cs of analysis.compressedSignals) {
      if (cs.compressionFactor < 1.0) {
        compressionMap.set(cs.originalSignalId, cs.compressedLikelihoodRatio);
      }
    }

    const compressedSignals: SignalInput[] = input.signals.map((s) => {
      const compressedLR = compressionMap.get(s.id);
      return compressedLR !== undefined ? { ...s, likelihoodRatio: compressedLR } : s;
    });

    const output = runCoreForecast({ ...input, signals: compressedSignals });

    if (analysis.confidenceCeiling && analysis.confidenceCeiling.maxAllowedProbability < 1.0) {
      const cap = analysis.confidenceCeiling.maxAllowedProbability;
      if (output.posteriorProbability > cap) {
        output.posteriorProbability = cap;
      }
      if (output.posteriorProbability < 1 - cap) {
        output.posteriorProbability = 1 - cap;
      }
      if (output.adjustedProbability > cap) {
        output.adjustedProbability = cap;
      }
      if (output.adjustedProbability < 1 - cap) {
        output.adjustedProbability = 1 - cap;
      }
    }

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
