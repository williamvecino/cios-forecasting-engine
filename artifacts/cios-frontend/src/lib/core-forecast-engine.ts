import type {
  AppliedSignal,
  ForecastCaseInput,
  ForecastOutput,
  SignalInput,
} from "./types";
import { computeEnvironmentAdjustments } from "./forecast-environment";
import { clamp, deterministicHash, normalizeProbability, round4 } from "./stability";

const ENGINE_VERSION = "CIOS_ENGINE_V1_STABILIZED";

function normalizeSignal(signal: SignalInput): SignalInput {
  return {
    ...signal,
    enabled: signal.enabled ?? true,
    likelihoodRatio: clamp(signal.likelihoodRatio, 0.2, 5),
    reliability: clamp(signal.reliability, 0, 1),
    strength: clamp(signal.strength, 0, 1),
  };
}

function sortSignalsDeterministically(signals: SignalInput[]): SignalInput[] {
  return [...signals].map(normalizeSignal).sort((a, b) => a.id.localeCompare(b.id));
}

function probabilityToOdds(p: number): number {
  const normalized = normalizeProbability(p);
  return normalized / (1 - normalized);
}

function oddsToProbability(odds: number): number {
  return normalizeProbability(odds / (1 + odds));
}

function applySignalsToPrior(
  priorProbability: number,
  signals: SignalInput[]
): {
  posteriorProbability: number;
  appliedSignals: AppliedSignal[];
  effectiveSignalCount: number;
} {
  let odds = probabilityToOdds(priorProbability);
  const appliedSignals: AppliedSignal[] = [];
  let effectiveSignalCount = 0;

  for (const signal of signals) {
    const rawLR = signal.enabled ? signal.likelihoodRatio : 1;
    appliedSignals.push({
      id: signal.id,
      label: signal.label,
      enabled: !!signal.enabled,
      effectiveLikelihoodRatio: rawLR,
      direction: signal.direction,
    });
    if (signal.enabled) {
      odds *= rawLR;
      effectiveSignalCount += rawLR !== 1 ? 1 : 0;
    }
  }

  return {
    posteriorProbability: oddsToProbability(odds),
    appliedSignals,
    effectiveSignalCount,
  };
}

export function runCoreForecast(input: ForecastCaseInput): ForecastOutput {
  const stableSignals = sortSignalsDeterministically(input.signals);
  const env = computeEnvironmentAdjustments(input.environment);
  const normalizedPrior = normalizeProbability(input.priorProbability);

  const inputFingerprint = deterministicHash({
    caseId: input.caseId,
    question: input.question,
    priorProbability: normalizedPrior,
    signals: stableSignals,
    environment: env.normalizedConfig,
    engineVersion: ENGINE_VERSION,
  });

  const signalPass = applySignalsToPrior(normalizedPrior, stableSignals);
  const posteriorProbability = normalizeProbability(signalPass.posteriorProbability);
  const posteriorOdds =
    probabilityToOdds(posteriorProbability) * env.priorMultiplier * env.posteriorMultiplier;
  const adjustedProbability = oddsToProbability(posteriorOdds);
  const environmentFingerprint = deterministicHash(env.normalizedConfig);

  return {
    runId: deterministicHash({ inputFingerprint, adjustedProbability, posteriorProbability }),
    caseId: input.caseId,
    question: input.question,
    priorProbability: normalizedPrior,
    posteriorProbability,
    adjustedProbability,
    priorMultiplier: env.priorMultiplier,
    posteriorMultiplier: env.posteriorMultiplier,
    signalCount: stableSignals.length,
    effectiveSignalCount: signalPass.effectiveSignalCount,
    appliedSignals: signalPass.appliedSignals,
    explanation: env.explanation,
    engineVersion: ENGINE_VERSION,
    environmentFingerprint,
    inputFingerprint,
  };
}
