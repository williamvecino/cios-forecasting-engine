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
  "phase iii clinical": [1.2, 1.0, 0.95, 1.1, 0.95, 0.9],
  "regulatory / clinical": [1.2, 1.0, 0.95, 1.1, 0.95, 0.9],
  "field intelligence": [0.95, 1.15, 1.0, 0.9, 1.0, 1.0],
  "access / commercial": [0.9, 0.95, 1.25, 0.95, 1.05, 1.0],
  "guideline / policy": [1.05, 0.95, 1.0, 1.35, 1.0, 0.95],
  "guideline inclusion": [1.05, 0.95, 1.0, 1.35, 1.0, 0.95],
  "safety / tolerability": [1.1, 1.2, 1.05, 1.0, 1.0, 0.95],
  "operational / deployment": [0.9, 1.0, 0.95, 0.9, 1.25, 1.0],
  "operational friction": [0.9, 1.0, 0.95, 0.9, 1.25, 1.0],
  "competitive": [0.95, 1.0, 1.0, 0.9, 0.95, 1.35],
  "competitor counteraction": [0.95, 1.0, 1.0, 0.9, 0.95, 1.35],
  "heor / economic": [0.95, 0.95, 1.2, 1.0, 1.0, 1.0],
  "kol sentiment": [1.3, 0.95, 0.9, 1.0, 0.95, 0.9],
  "kol endorsement": [1.3, 0.95, 0.9, 1.0, 0.95, 0.9],
  "patient / demand": [0.9, 1.05, 0.95, 0.9, 1.0, 0.95],
  "outcomes / pro": [1.1, 1.1, 0.95, 1.0, 0.95, 0.9],
  "unmapped": [1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
};

// Keyword multipliers — matched against signal description + target population text at runtime.
// These are disease-AGNOSTIC routing weights: any signal for any asset in any therapy area
// will automatically pick up the right actor adjustments based on what the signal text says.
// Add new keywords freely to extend coverage to additional specialties and contexts.
// Format: { keyword: [KOL, Community, HealthSys, Payer, Guideline, Competitor] }
export const KEYWORD_MULTIPLIERS: Record<string, number[]> = {
  // ── HCP channel keywords ──────────────────────────────────────────────────
  "academic":           [1.2,  0.95, 1.0,  1.1,  0.95, 0.95],
  "kol":                [1.2,  0.95, 0.95, 1.05, 0.95, 0.95],
  "community":          [0.95, 1.2,  1.0,  0.95, 1.0,  1.0 ],
  "specialist":         [1.05, 1.1,  0.95, 1.0,  0.95, 1.0 ],
  "primary care":       [0.9,  1.15, 1.0,  0.9,  1.0,  1.0 ],

  // ── Access / payer keywords ───────────────────────────────────────────────
  "payer":              [0.9,  0.95, 1.25, 0.95, 1.0,  1.0 ],
  "access":             [0.9,  0.95, 1.25, 0.95, 1.0,  1.0 ],
  "formulary":          [0.9,  0.95, 1.3,  1.0,  1.0,  1.0 ],
  "prior auth":         [0.9,  0.95, 1.2,  1.0,  1.0,  1.0 ],
  "step therapy":       [0.9,  0.9,  1.2,  1.05, 1.0,  1.05],
  "reimbursement":      [0.9,  0.95, 1.2,  1.0,  1.0,  1.0 ],

  // ── Guideline / society keywords ──────────────────────────────────────────
  "guideline":          [1.05, 0.95, 1.0,  1.3,  0.95, 0.95],
  "pathway":            [1.05, 0.95, 1.0,  1.2,  1.0,  0.95],
  "society":            [1.1,  0.95, 1.0,  1.1,  0.95, 0.95],

  // ── Health system / site-of-care keywords ─────────────────────────────────
  "hospital":           [0.95, 1.0,  1.0,  0.95, 1.2,  1.0 ],
  "health system":      [0.95, 1.0,  1.0,  0.95, 1.2,  1.0 ],
  "idn":                [0.95, 1.0,  1.0,  0.95, 1.25, 1.0 ],
  "infusion":           [0.95, 0.95, 1.1,  1.0,  1.1,  1.0 ],

  // ── Therapy area keywords — disease-agnostic, matched from signal text ────
  "pulmonology":        [1.1,  1.05, 0.95, 1.05, 1.0,  0.95],
  "respiratory":        [1.0,  1.1,  0.95, 1.0,  1.0,  0.95],
  "cardiology":         [0.95, 1.1,  1.1,  1.0,  1.05, 1.05],
  "oncology":           [1.15, 0.95, 1.0,  1.0,  1.0,  1.1 ],
  "hematology":         [1.15, 0.9,  1.0,  1.0,  1.0,  1.1 ],
  "dermatology":        [0.9,  1.15, 1.0,  0.95, 1.0,  1.05],
  "psychiatry":         [0.9,  1.05, 1.15, 0.95, 1.0,  1.05],
  "neurology":          [1.1,  0.95, 1.0,  1.0,  1.05, 1.0 ],
  "infectious disease": [1.05, 0.95, 1.0,  1.15, 1.0,  0.95],
  "rheumatology":       [1.1,  0.95, 1.0,  1.0,  1.05, 1.05],
  "immunology":         [1.1,  0.95, 1.0,  1.0,  1.05, 1.05],
  "gastroenterology":   [1.0,  1.05, 1.0,  1.0,  1.0,  1.05],
  "nephrology":         [0.95, 1.05, 1.1,  1.0,  1.0,  1.0 ],
  "endocrinology":      [0.95, 1.1,  1.0,  1.0,  1.0,  1.0 ],
  "rare disease":       [1.15, 0.9,  0.95, 1.1,  1.0,  0.9 ],
  "orphan":             [1.15, 0.9,  0.95, 1.1,  1.0,  0.9 ],
  "device":             [1.0,  0.95, 1.15, 0.95, 1.05, 1.1 ],
  "diagnostic":         [1.05, 0.9,  1.1,  0.95, 1.05, 1.05],
  "digital":            [0.95, 1.0,  1.05, 0.9,  1.0,  1.0 ],

  // ── Disease-specific examples — extend this list freely ───────────────────
  "ntm":                [1.1,  1.0,  0.95, 1.05, 1.0,  0.95], // non-tuberculous mycobacteria
  "nsclc":              [1.15, 0.9,  1.0,  1.0,  1.0,  1.1 ], // non-small cell lung cancer
  "hfref":              [0.95, 1.1,  1.1,  1.0,  1.05, 1.05], // heart failure rEF
  "ra":                 [1.1,  0.95, 1.0,  1.0,  1.05, 1.1 ], // rheumatoid arthritis
  "t2dm":               [0.95, 1.15, 1.0,  1.0,  1.0,  1.05], // type 2 diabetes
  "psoriasis":          [0.9,  1.15, 1.0,  0.95, 1.0,  1.1 ],
  "mdd":                [0.9,  1.05, 1.15, 0.95, 1.0,  1.05], // major depressive disorder
  "copd":               [1.0,  1.1,  0.95, 1.0,  1.0,  1.05],

  // ── Competitive dynamics keywords ─────────────────────────────────────────
  "competitor":         [0.95, 1.0,  1.0,  0.95, 0.95, 1.25],
  "generic":            [0.95, 0.95, 1.1,  0.95, 0.95, 1.25],
  "biosimilar":         [0.95, 0.95, 1.1,  0.95, 0.95, 1.2 ],
  "launch":             [1.0,  1.0,  1.0,  1.0,  1.0,  1.15],
  "switch":             [0.95, 1.05, 1.0,  0.95, 1.0,  1.1 ],
  "label expansion":    [1.0,  1.05, 1.0,  1.0,  1.05, 1.0 ],
  "indication":         [1.0,  1.0,  1.0,  1.0,  1.05, 1.05],
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

const ACTOR_BEHAVIOR_TEMPLATES: Record<
  string,
  { supportive: string; neutral: string; resistive: string }
> = {
  "Academic KOLs": {
    supportive:
      "Expected to present data at major congresses, author supportive publications, and anchor prescriber confidence through peer influence.",
    neutral:
      "Observing evidence with cautious interest — likely to await larger datasets or real-world outcomes before publicly endorsing.",
    resistive:
      "May raise questions about comparative evidence or highlight unmet durability concerns in peer forums, slowing early adoption.",
  },
  "Community Physicians": {
    supportive:
      "Broadly receptive to prescribing given clear guideline clarity and accessible access; real-world uptake volume likely to scale.",
    neutral:
      "Waiting for experience from early adopters and payer access confirmation before routinely incorporating into practice.",
    resistive:
      "Habitual patterns and reimbursement friction are dampening trial initiation; significant educational investment required.",
  },
  "Specialty Extenders / PCPs": {
    supportive:
      "Actively referring or co-managing patients; will amplify reach beyond specialist-only population.",
    neutral:
      "Limited familiarity with the indication — prescribing will follow specialist leadership rather than independent initiation.",
    resistive:
      "Minimal engagement anticipated; adoption will remain confined to specialist-initiated pathways.",
  },
  "Payers / Access": {
    supportive:
      "Favorable coverage positioning reduces patient-level friction; broad formulary placement expected to unlock volume.",
    neutral:
      "Step-edit or PA requirements in place — access is conditional and will require case-by-case justification.",
    resistive:
      "Restrictive formulary tiers or non-coverage rulings are creating material access barriers that will suppress uptake.",
  },
  "Guideline / Society Bodies": {
    supportive:
      "Inclusion in treatment algorithms or preferred therapy designation gives prescribers explicit clinical license to adopt broadly.",
    neutral:
      "Under review or pending data — prescribers are waiting for guideline clarity before committing at scale.",
    resistive:
      "Current guidelines favor alternative approaches; off-guideline use creates clinical-liability hesitancy among cautious prescribers.",
  },
  "Competitor Counteraction": {
    supportive:
      "Competitive noise is low or misdirected — minimal disruption to messaging and account access.",
    neutral:
      "Established competitors are maintaining formulary position but not actively counter-detailing; status quo access protected.",
    resistive:
      "Aggressive counter-detailing, rebate defense, and formulary-tier competition are eroding differentiation at the point of prescribing.",
  },
};

export function interpretActorEffect(effect: number): string {
  if (effect > 0.25) return "Strong support";
  if (effect > 0.05) return "Moderate support";
  if (effect < -0.25) return "Strong constraint";
  if (effect < -0.05) return "Moderate constraint";
  return "Neutral / mixed";
}

export function actorStance(effect: number): string {
  if (effect > 0.25) return "Strongly supportive";
  if (effect > 0.05) return "Supportive";
  if (effect < -0.25) return "Strongly resistive";
  if (effect < -0.05) return "Resistive";
  return "Neutral";
}

export function getExpectedBehavior(actorName: string, effect: number): string {
  const templates = ACTOR_BEHAVIOR_TEMPLATES[actorName];
  if (!templates) {
    if (effect > 0.05)
      return "This stakeholder group is responding favorably and is expected to support adoption through their sphere of influence.";
    if (effect < -0.05)
      return "This stakeholder group is exhibiting resistance behaviors that will require targeted mitigation efforts.";
    return "This stakeholder group is observing from a neutral position — engagement strategy should monitor for inflection.";
  }
  if (effect > 0.05) return templates.supportive;
  if (effect < -0.05) return templates.resistive;
  return templates.neutral;
}

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
