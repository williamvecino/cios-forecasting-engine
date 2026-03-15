export type ActorIndex = 0 | 1 | 2 | 3 | 4 | 5;

export const ACTOR_NAMES = [
  "Academic KOLs",
  "Community Physicians",
  "Specialty Extenders / PCPs",
  "Payers / Access",
  "Guideline / Society Bodies",
  "Competitor Counteraction",
] as const;

export const CANONICAL_ACTORS = [
  "Academic KOLs",
  "Community Physicians",
  "Health Systems",
  "Payers / Access",
  "Guideline Bodies",
  "Competitor Counteraction",
] as const;

export const SIGNAL_TYPE_MULTIPLIERS: Record<string, number[]> = {
  "clinical evidence": [1.2, 1.0, 0.95, 1.1, 0.95, 0.9],
  "field intelligence": [0.95, 1.15, 1.0, 0.9, 1.0, 1.0],
  "access / commercial": [0.9, 0.95, 1.25, 0.95, 1.05, 1.0],
  "guideline / policy": [1.05, 0.95, 1.0, 1.35, 1.0, 0.95],
  "safety / tolerability": [1.1, 1.2, 1.05, 1.0, 1.0, 0.95],
  "operational / deployment": [0.9, 1.0, 0.95, 0.9, 1.25, 1.0],
  "competitive": [0.95, 1.0, 1.0, 0.9, 0.95, 1.35],
  "heor / economic": [0.95, 0.95, 1.2, 1.0, 1.0, 1.0],
  "kol sentiment": [1.3, 0.95, 0.9, 1.0, 0.95, 0.9],
  "patient / demand": [0.9, 1.05, 0.95, 0.9, 1.0, 0.95],
  "outcomes / pro": [1.1, 1.1, 0.95, 1.0, 0.95, 0.9],
  "unmapped": [1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
};

export const KEYWORD_MULTIPLIERS: Record<string, number[]> = {
  "academic": [1.2, 0.95, 1.0, 1.1, 0.95, 0.95],
  "kol": [1.2, 0.95, 0.95, 1.05, 0.95, 0.95],
  "community": [0.95, 1.2, 1.0, 0.95, 1.0, 1.0],
  "specialist": [1.05, 1.1, 0.95, 1.0, 0.95, 1.0],
  "primary care": [0.9, 1.15, 1.0, 0.9, 1.0, 1.0],
  "payer": [0.9, 0.95, 1.25, 0.95, 1.0, 1.0],
  "access": [0.9, 0.95, 1.25, 0.95, 1.0, 1.0],
  "formulary": [0.9, 0.95, 1.3, 1.0, 1.0, 1.0],
  "guideline": [1.05, 0.95, 1.0, 1.3, 0.95, 0.95],
  "hospital": [0.95, 1.0, 1.0, 0.95, 1.2, 1.0],
  "health system": [0.95, 1.0, 1.0, 0.95, 1.2, 1.0],
  "idn": [0.95, 1.0, 1.0, 0.95, 1.25, 1.0],
  "pulmonology": [1.1, 1.05, 0.95, 1.05, 1.0, 0.95],
  "cardiology": [0.95, 1.1, 1.1, 1.0, 1.05, 1.05],
  "oncology": [1.15, 0.95, 1.0, 1.0, 1.0, 1.1],
  "dermatology": [0.9, 1.15, 1.0, 0.95, 1.0, 1.05],
  "psychiatry": [0.9, 1.05, 1.15, 0.95, 1.0, 1.05],
  "infectious disease": [1.05, 0.95, 1.0, 1.15, 1.0, 0.95],
  "competitor": [0.95, 1.0, 1.0, 0.95, 0.95, 1.25],
  "generic": [0.95, 0.95, 1.1, 0.95, 0.95, 1.25],
  "launch": [1.0, 1.0, 1.0, 1.0, 1.0, 1.15],
  "switch": [0.95, 1.05, 1.0, 0.95, 1.0, 1.1],
  "ntm": [1.1, 1.0, 0.95, 1.05, 1.0, 0.95],
};

export const SPECIALTY_PROFILE_MODIFIERS: Record<string, number[]> = {
  "general": [1, 1, 1, 1, 1, 1],
  "pulmonology / rare disease": [1.15, 1.05, 0.95, 1.1, 1.0, 0.95],
  "cardiology / mixed specialist": [0.95, 1.15, 1.1, 1.0, 1.05, 1.05],
  "oncology / academic-led": [1.2, 0.95, 1.05, 1.0, 1.0, 1.1],
  "dermatology / community-led": [0.9, 1.2, 1.0, 0.95, 1.0, 1.05],
  "psychiatry / access-sensitive": [0.9, 1.1, 1.2, 0.95, 1.0, 1.05],
  "infectious disease / guideline-led": [1.05, 0.95, 1.0, 1.2, 1.0, 0.95],
};

export const PAYER_ENV_MODIFIERS: Record<string, number[]> = {
  "balanced": [1, 1, 1, 1, 1, 1],
  "commercial-heavy": [0.95, 1.0, 1.15, 0.95, 1.0, 1.05],
  "medicare-heavy": [0.95, 1.0, 1.1, 1.05, 1.0, 1.0],
  "medicaid-heavy": [0.9, 0.95, 1.2, 1.0, 1.05, 1.0],
  "integrated delivery / idn": [0.95, 1.0, 1.05, 1.0, 1.2, 1.0],
};

export const GUIDELINE_LEVERAGE_MODIFIERS: Record<string, number[]> = {
  "low": [0.95, 1.05, 1.0, 0.8, 1.0, 1.0],
  "medium": [1, 1, 1, 1, 1, 1],
  "high": [1.05, 0.95, 1.0, 1.25, 1.0, 0.95],
};

export const COMPETITOR_PROFILE_MODIFIERS: Record<string, number[]> = {
  "whitespace / limited direct competition": [1.0, 1.0, 0.95, 1.0, 1.0, 0.8],
  "entrenched standard of care": [1.05, 0.95, 1.05, 1.0, 1.0, 1.2],
  "aggressive branded competitor": [1.0, 0.95, 1.0, 1.0, 1.0, 1.25],
  "generic erosion risk": [0.95, 0.95, 1.1, 0.95, 1.0, 1.15],
  "crowded class / multiple competitors": [1.0, 0.95, 1.05, 1.0, 1.0, 1.2],
};

export function getPharmaMultiplier(
  signalType: string,
  targetPopulation: string,
  brand: string,
  actorIndex: ActorIndex
): number {
  const typeKey = signalType.toLowerCase().trim();
  const baseMultiplier =
    (SIGNAL_TYPE_MULTIPLIERS[typeKey] ?? SIGNAL_TYPE_MULTIPLIERS["unmapped"])[actorIndex];

  const combinedText = ((targetPopulation ?? "") + " " + (brand ?? "")).toLowerCase();
  let keywordAdj = 0;
  for (const [keyword, multipliers] of Object.entries(KEYWORD_MULTIPLIERS)) {
    if (combinedText.includes(keyword)) {
      keywordAdj += multipliers[actorIndex] - 1.0;
    }
  }

  return Math.min(1.6, baseMultiplier * (1 + keywordAdj));
}
