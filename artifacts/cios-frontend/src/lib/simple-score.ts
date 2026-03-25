type ScoringSignal = {
  id: string;
  direction?: "positive" | "negative" | "neutral";
  strengthScore?: number;
  reliabilityScore?: number;
  independenceScore?: number;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function computeSimpleScore(signals: ScoringSignal[]): number {
  if (!signals.length) return 0;

  let total = 0;

  for (const signal of signals) {
    const strength = clamp01(signal.strengthScore ?? 0.5);
    const reliability = clamp01(signal.reliabilityScore ?? 0.5);
    const independence = clamp01(signal.independenceScore ?? 0.5);

    const base = strength * reliability * independence;

    const directionMultiplier =
      signal.direction === "positive"
        ? 1
        : signal.direction === "negative"
        ? -1
        : 0;

    total += base * directionMultiplier;
  }

  const normalized = ((total / Math.max(signals.length, 1)) + 1) / 2;
  return Math.round(clamp01(normalized) * 1000) / 10;
}
