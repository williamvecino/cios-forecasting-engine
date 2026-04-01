import type { Signal } from "@workspace/db";
import { createHash } from "crypto";

const MAX_SINGLE_DRIVER_SHIFT_BASE = 0.15;
const MAX_TOTAL_SHIFT = 0.40;

function getMaxSingleDriverShift(signalCount: number): number {
  if (signalCount <= 2) return 0.30;
  if (signalCount <= 4) return 0.25;
  if (signalCount <= 6) return 0.20;
  return 0.15;
}
const GATE_WEAK_PROBABILITY_CAP = 0.70;

export interface GuardrailLog {
  duplicate_driver_detected: string[];
  duplicate_driver_removed: string[];
  driver_shift_capped: string[];
  total_shift_normalized: boolean;
  probability_limited_by_gate: boolean;
  relevance_penalty_applied: string[];
  recalculation_skipped: boolean;
  input_validation_errors: string[];
  diagnostics: {
    driver_count: number;
    duplicate_drivers_detected: number;
    largest_single_shift: number;
    total_shift: number;
    gating_constraints_triggered: string[];
    final_probability_limit_reason: string | null;
  };
}

function newGuardrailLog(): GuardrailLog {
  return {
    duplicate_driver_detected: [],
    duplicate_driver_removed: [],
    driver_shift_capped: [],
    total_shift_normalized: false,
    probability_limited_by_gate: false,
    relevance_penalty_applied: [],
    recalculation_skipped: false,
    input_validation_errors: [],
    diagnostics: {
      driver_count: 0,
      duplicate_drivers_detected: 0,
      largest_single_shift: 0,
      total_shift: 0,
      gating_constraints_triggered: [],
      final_probability_limit_reason: null,
    },
  };
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((t) => t.length > 2)
  );
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

export function deduplicateDrivers(signals: Signal[], log: GuardrailLog): Signal[] {
  const seen = new Map<string, Signal>();
  const result: Signal[] = [];

  for (const s of signals) {
    let isDuplicate = false;
    let duplicateOfId = "";

    for (const [existingId, existing] of seen) {
      if (existingId === s.signalId) {
        isDuplicate = true;
        duplicateOfId = existingId;
        break;
      }
      const sim = jaccardSimilarity(
        s.signalDescription ?? "",
        existing.signalDescription ?? ""
      );
      if (sim > 0.75) {
        isDuplicate = true;
        duplicateOfId = existingId;
        break;
      }
    }

    if (isDuplicate) {
      log.duplicate_driver_detected.push(s.signalId);
      const existing = seen.get(duplicateOfId)!;
      if ((s.reliabilityScore ?? 0) > (existing.reliabilityScore ?? 0)) {
        const idx = result.findIndex((r) => r.signalId === existing.signalId);
        if (idx >= 0) result[idx] = s;
        seen.delete(duplicateOfId);
        seen.set(s.signalId, s);
        log.duplicate_driver_removed.push(duplicateOfId);
      } else {
        log.duplicate_driver_removed.push(s.signalId);
      }
    } else {
      seen.set(s.signalId, s);
      result.push(s);
    }
  }

  log.diagnostics.duplicate_drivers_detected = log.duplicate_driver_detected.length;
  return result;
}

export function applyRelevancePenalty(signals: Signal[], log: GuardrailLog): Signal[] {
  return signals.map((s) => {
    const confidence = (s as any).translation_confidence as string | undefined;
    const relevanceNote = (s as any).question_relevance_note as string | undefined;
    const isLowRelevance = confidence === "low" ||
      (relevanceNote && /does not directly|upstream only|not directly applicable/i.test(relevanceNote));
    if (isLowRelevance) {
      log.relevance_penalty_applied.push(s.signalId);
      const lr = s.likelihoodRatio ?? 1;
      const centered = lr - 1;
      const penalized = 1 + centered * 0.5;
      return { ...s, likelihoodRatio: Number(penalized.toFixed(4)) };
    }
    return s;
  });
}

export function validateEngineInputs(
  priorProbability: number,
  signals: Signal[],
  log: GuardrailLog
): boolean {
  const errors: string[] = [];

  if (
    priorProbability == null ||
    typeof priorProbability !== "number" ||
    isNaN(priorProbability) ||
    priorProbability <= 0 ||
    priorProbability >= 1
  ) {
    errors.push(`Invalid prior probability: ${priorProbability}`);
  }

  for (const s of signals) {
    if (!s.signalId) errors.push("Signal missing signalId");
    if (!s.direction || !["Positive", "Negative", "Neutral"].includes(s.direction)) {
      errors.push(`Signal ${s.signalId}: invalid direction "${s.direction}"`);
    }
    if (s.strengthScore == null || isNaN(Number(s.strengthScore))) {
      errors.push(`Signal ${s.signalId}: missing or invalid strengthScore`);
    }
    if (s.reliabilityScore == null || isNaN(Number(s.reliabilityScore))) {
      errors.push(`Signal ${s.signalId}: missing or invalid reliabilityScore`);
    }
    if (s.likelihoodRatio == null || isNaN(Number(s.likelihoodRatio)) || Number(s.likelihoodRatio) <= 0) {
      errors.push(`Signal ${s.signalId}: missing or invalid likelihoodRatio`);
    }
  }

  log.input_validation_errors = errors;
  return errors.length === 0;
}

export function capSingleDriverShift(
  priorProbability: number,
  engineProbability: number,
  signalDetails: Array<{
    signalId: string;
    likelihoodRatio: number;
    effectiveLikelihoodRatio: number;
    description: string;
  }>,
  log: GuardrailLog
): number {
  if (signalDetails.length === 0) return engineProbability;

  const capLimit = getMaxSingleDriverShift(signalDetails.length);
  const totalShift = engineProbability - priorProbability;
  let largestSingleShift = 0;
  let needsCapping = false;

  const priorOdds = priorProbability / (1 - priorProbability);
  const totalLR = signalDetails.reduce((p, s) => p * s.effectiveLikelihoodRatio, 1);

  for (const s of signalDetails) {
    const lrWithout = totalLR / s.effectiveLikelihoodRatio;
    const oddsWithout = priorOdds * lrWithout;
    const probWithout = oddsWithout / (1 + oddsWithout);
    const singleShift = Math.abs(engineProbability - probWithout);
    if (singleShift > largestSingleShift) largestSingleShift = singleShift;

    if (singleShift > capLimit) {
      log.driver_shift_capped.push(s.signalId);
      needsCapping = true;
    }
  }

  log.diagnostics.largest_single_shift = Number((largestSingleShift * 100).toFixed(1));
  log.diagnostics.total_shift = Number((Math.abs(totalShift) * 100).toFixed(1));

  if (needsCapping) {
    let cappedOdds = priorOdds;
    for (const s of signalDetails) {
      const direction = s.effectiveLikelihoodRatio >= 1 ? 1 : -1;
      const maxLR = direction > 0
        ? Math.min(s.effectiveLikelihoodRatio, 1 + capLimit * 4)
        : Math.max(s.effectiveLikelihoodRatio, 1 / (1 + capLimit * 4));
      cappedOdds *= maxLR;
    }
    const cappedProb = cappedOdds / (1 + cappedOdds);
    return Math.max(0.0001, Math.min(0.9999, cappedProb));
  }

  return engineProbability;
}

export function normalizeTotalShift(
  priorProbability: number,
  currentProbability: number,
  log: GuardrailLog
): number {
  const totalShift = currentProbability - priorProbability;
  log.diagnostics.total_shift = Number((Math.abs(totalShift) * 100).toFixed(1));

  if (Math.abs(totalShift) > MAX_TOTAL_SHIFT) {
    log.total_shift_normalized = true;
    const normalizedShift = Math.sign(totalShift) * MAX_TOTAL_SHIFT;
    return priorProbability + normalizedShift;
  }
  return currentProbability;
}

export interface GateStatus {
  gate_id: string;
  gate_label: string;
  status: "strong" | "moderate" | "weak" | "unresolved";
}

export function applyEventGatingConstraint(
  probability: number,
  gates: GateStatus[],
  log: GuardrailLog
): number {
  const requiredGateIds = [
    "line_of_therapy_applicability",
    "stakeholder_applicability",
    "time_horizon_feasibility",
    "threshold_attainment",
  ];

  const triggeredGates: string[] = [];

  for (const gate of gates) {
    if (gate.status === "weak" || gate.status === "unresolved") {
      triggeredGates.push(gate.gate_id);
    }
  }

  for (const reqId of requiredGateIds) {
    const found = gates.find((g) => g.gate_id === reqId);
    if (!found) {
      triggeredGates.push(`${reqId} (missing)`);
    }
  }

  if (triggeredGates.length > 0) {
    log.probability_limited_by_gate = true;
    log.diagnostics.gating_constraints_triggered = triggeredGates;
    if (probability > GATE_WEAK_PROBABILITY_CAP) {
      log.diagnostics.final_probability_limit_reason =
        `Capped at ${GATE_WEAK_PROBABILITY_CAP * 100}% due to unresolved/weak gates: ${triggeredGates.join(", ")}`;
      return GATE_WEAK_PROBABILITY_CAP;
    }
  }

  return probability;
}

const forecastCache = new Map<string, { result: any; timestamp: number }>();
const CACHE_TTL_MS = 30_000;

export function computeStateHash(inputs: Record<string, any>): string {
  const sorted = JSON.stringify(sortKeysDeep(inputs));
  return createHash("sha256").update(sorted).digest("hex").slice(0, 16);
}

function sortKeysDeep(value: any): any {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = sortKeysDeep(value[key]);
    }
    return out;
  }
  return value;
}

export function getCachedResult(stateHash: string): any | null {
  const cached = forecastCache.get(stateHash);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }
  forecastCache.delete(stateHash);
  return null;
}

export function setCachedResult(stateHash: string, result: any): void {
  if (forecastCache.size > 100) {
    const oldest = forecastCache.keys().next().value;
    if (oldest) forecastCache.delete(oldest);
  }
  forecastCache.set(stateHash, { result, timestamp: Date.now() });
}

export function runAllPreEngineGuardrails(
  priorProbability: number,
  signals: Signal[],
  log: GuardrailLog
): { valid: boolean; signals: Signal[] } {
  const valid = validateEngineInputs(priorProbability, signals, log);
  if (!valid) return { valid: false, signals };

  const deduped = deduplicateDrivers(signals, log);
  const withRelevance = applyRelevancePenalty(deduped, log);

  log.diagnostics.driver_count = withRelevance.length;
  return { valid: true, signals: withRelevance };
}

export function runAllPostEngineGuardrails(
  priorProbability: number,
  engineProbability: number,
  signalDetails: Array<{
    signalId: string;
    likelihoodRatio: number;
    effectiveLikelihoodRatio: number;
    description: string;
  }>,
  gates: GateStatus[],
  log: GuardrailLog,
  options?: { skipGateConstraint?: boolean },
): number {
  let prob = capSingleDriverShift(priorProbability, engineProbability, signalDetails, log);
  prob = normalizeTotalShift(priorProbability, prob, log);
  if (!options?.skipGateConstraint) {
    prob = applyEventGatingConstraint(prob, gates, log);
  }
  prob = Math.max(0.0001, Math.min(0.9999, prob));
  return Number(prob.toFixed(4));
}
