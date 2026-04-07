type ScoringSignal = {
  id: string;
  direction?: "positive" | "negative" | "neutral";
  strengthScore?: number;
  reliabilityScore?: number;
  independenceScore?: number;
};

export function computeSimpleScore(_signals: ScoringSignal[]): number {
  console.warn("[simple-score] Local probability computation disabled — use authoritative ForecastResult from server");
  return 0;
}
