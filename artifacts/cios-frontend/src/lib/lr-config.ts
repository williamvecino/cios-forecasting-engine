export const SIGNAL_TYPES = [
  "Phase III clinical",
  "Guideline inclusion",
  "KOL endorsement",
  "Field intelligence",
  "Operational friction",
  "Competitor counteraction",
  "Access / commercial",
  "Regulatory / clinical",
  "Access friction",
  "Experience infrastructure",
] as const;

export type SignalType = (typeof SIGNAL_TYPES)[number];

export const SCOPE_VALUES = ["local", "regional", "national", "global"] as const;
export type Scope = (typeof SCOPE_VALUES)[number];

export const TIMING_VALUES = ["early", "current", "late"] as const;
export type Timing = (typeof TIMING_VALUES)[number];

export interface LRRange {
  min: number;
  max: number;
}

/**
 * LR_RANGES define the magnitude of evidence for each signal type,
 * expressed as a positive-direction LR (> 1.0 = supports adoption).
 *
 * Some types are inherently directional:
 *   - "Operational friction" and "Competitor counteraction" are always
 *     constraining, so their ranges are already < 1.0.
 *
 * For types that can go either way (Regulatory/clinical, Phase III
 * clinical, etc.), computeLR inverts the result for negative signals.
 */
/**
 * REMS taxonomy mapping:
 *   - REMS burden / certification / documentation / monitoring complexity → "Access friction"
 *   - REMS simplification / integrated support / digital workflow / call-center enablement → "Experience infrastructure"
 */
export const LR_RANGES: Record<SignalType, LRRange> = {
  "Phase III clinical":          { min: 1.8, max: 2.5 },
  "Guideline inclusion":         { min: 1.7, max: 2.2 },
  "KOL endorsement":             { min: 1.2, max: 1.4 },
  "Field intelligence":          { min: 0.8, max: 1.3 },
  "Operational friction":        { min: 0.6, max: 0.9 },
  "Competitor counteraction":    { min: 0.7, max: 0.9 },
  "Access / commercial":         { min: 1.1, max: 1.6 },
  "Regulatory / clinical":       { min: 1.3, max: 2.0 },
  "Access friction":             { min: 0.5, max: 0.85 },
  "Experience infrastructure":   { min: 1.1, max: 1.5 },
};

const ATTRIBUTE_WEIGHTS = {
  strength: 0.35,
  credibility: 0.30,
  scope: 0.20,
  timing: 0.15,
};

function normalizeStrength(value: number): number {
  return (value - 1) / 4;
}

function normalizeCredibility(value: number): number {
  return (value - 1) / 4;
}

function normalizeScope(scope: Scope): number {
  const map: Record<Scope, number> = {
    local: 0,
    regional: 0.33,
    national: 0.67,
    global: 1,
  };
  return map[scope];
}

function normalizeTiming(timing: Timing): number {
  const map: Record<Timing, number> = {
    early: 0.25,
    current: 1,
    late: 0.5,
  };
  return map[timing];
}

/**
 * Compute the Bayesian likelihood ratio for a signal.
 *
 * Direction semantics:
 *   - "Positive": LR > 1.0 (signal increases posterior probability).
 *   - "Negative": LR < 1.0 (signal decreases posterior probability).
 *
 * The LR_RANGES define evidence magnitude. Direction determines whether
 * the raw LR is used as-is or inverted (1/LR) to place it on the
 * correct side of 1.0.
 */
export function computeLR(
  signalType: string,
  strength: number,
  credibility: number,
  scope: Scope,
  timing: Timing,
  direction: "Positive" | "Negative" = "Positive"
): number {
  const range = LR_RANGES[signalType as SignalType];
  if (!range) return 1.0;

  const normalizedScore =
    ATTRIBUTE_WEIGHTS.strength * normalizeStrength(strength) +
    ATTRIBUTE_WEIGHTS.credibility * normalizeCredibility(credibility) +
    ATTRIBUTE_WEIGHTS.scope * normalizeScope(scope) +
    ATTRIBUTE_WEIGHTS.timing * normalizeTiming(timing);

  const rawLR = range.min + normalizedScore * (range.max - range.min);

  // Apply direction: ensure the LR is on the correct side of 1.0
  let lr: number;
  if (direction === "Negative" && rawLR > 1.0) {
    lr = 1 / rawLR;
  } else if (direction === "Positive" && rawLR < 1.0) {
    lr = 1 / rawLR;
  } else {
    lr = rawLR;
  }

  return Number(lr.toFixed(3));
}

export function lrToStrengthLabel(lr: number, direction: string): { label: string; color: string } {
  if (direction === "Positive") {
    if (lr >= 2.2) return { label: "Very strong evidence for adoption", color: "text-success" };
    if (lr >= 1.7) return { label: "Strong evidence for adoption", color: "text-success" };
    if (lr >= 1.3) return { label: "Moderate evidence for adoption", color: "text-success/70" };
    if (lr >= 1.05) return { label: "Weak evidence for adoption", color: "text-muted-foreground" };
    return { label: "Minimal signal strength", color: "text-muted-foreground" };
  } else {
    if (lr <= 0.65) return { label: "Significant headwind — major barrier", color: "text-destructive" };
    if (lr <= 0.78) return { label: "Moderate headwind — active barrier", color: "text-destructive/80" };
    if (lr <= 0.9) return { label: "Mild headwind — monitor closely", color: "text-warning" };
    return { label: "Weak constraint — low urgency", color: "text-muted-foreground" };
  }
}
