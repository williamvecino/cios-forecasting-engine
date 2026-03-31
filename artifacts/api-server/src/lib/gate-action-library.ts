export interface DecisionAction {
  gateName: string;
  blockingCondition: string;
  requiredAction: string;
  owner: string;
  timeline: string;
  resolutionMetric: string;
  forecastImpact: string;
  priorityScore: number;
}

export interface GateActionEntry {
  blockingCondition: string;
  requiredAction: string;
  defaultOwner: string;
  defaultTimeline: string;
  defaultMetric: string;
}

const GATE_ACTION_MAP: Record<string, GateActionEntry[]> = {
  "clinical evidence": [
    {
      blockingCondition: "Insufficient pivotal trial data to support efficacy claims",
      requiredAction: "Complete Phase III readout and publish primary endpoint results",
      defaultOwner: "Clinical Development Lead",
      defaultTimeline: "6-12 months",
      defaultMetric: "Primary endpoint p-value < 0.05 with clinically meaningful effect size",
    },
  ],
  "payer access": [
    {
      blockingCondition: "Restricted formulary placement or step-therapy requirements",
      requiredAction: "Submit health economic dossier and negotiate tier placement with top 5 payers",
      defaultOwner: "Market Access Lead",
      defaultTimeline: "3-6 months",
      defaultMetric: "Unrestricted Tier 2 placement in ≥60% of covered lives",
    },
  ],
  "physician awareness": [
    {
      blockingCondition: "Low unaided awareness among target prescribers",
      requiredAction: "Launch KOL engagement program and peer-reviewed publication plan",
      defaultOwner: "Medical Affairs Director",
      defaultTimeline: "3-6 months",
      defaultMetric: "Unaided awareness ≥40% among target HCPs",
    },
  ],
  "competitive landscape": [
    {
      blockingCondition: "Strong incumbent or imminent competitor launch",
      requiredAction: "Develop differentiation strategy and head-to-head positioning materials",
      defaultOwner: "Brand Strategy Lead",
      defaultTimeline: "1-3 months",
      defaultMetric: "Differentiation message recall ≥50% in target segment",
    },
  ],
  "safety profile": [
    {
      blockingCondition: "Unresolved safety signal or boxed warning concern",
      requiredAction: "Complete post-marketing safety analysis and update REMS if required",
      defaultOwner: "Pharmacovigilance Lead",
      defaultTimeline: "6-12 months",
      defaultMetric: "Safety profile confirmed with acceptable benefit-risk ratio",
    },
  ],
  "regulatory approval": [
    {
      blockingCondition: "Pending regulatory decision or incomplete submission",
      requiredAction: "Address FDA/EMA review questions and prepare advisory committee materials",
      defaultOwner: "Regulatory Affairs Lead",
      defaultTimeline: "3-9 months",
      defaultMetric: "Regulatory approval or positive CHMP opinion received",
    },
  ],
  "patient identification": [
    {
      blockingCondition: "Difficulty identifying eligible patients in clinical practice",
      requiredAction: "Develop diagnostic pathway and patient identification algorithm",
      defaultOwner: "Medical Affairs Director",
      defaultTimeline: "3-6 months",
      defaultMetric: "Diagnostic pathway adopted by ≥3 major health systems",
    },
  ],
  "infrastructure readiness": [
    {
      blockingCondition: "Healthcare system lacks required infrastructure for administration",
      requiredAction: "Establish administration sites and training programs",
      defaultOwner: "Commercial Operations Lead",
      defaultTimeline: "6-12 months",
      defaultMetric: "≥80% of target sites operationally ready",
    },
  ],
  "guideline inclusion": [
    {
      blockingCondition: "Not yet included in treatment guidelines",
      requiredAction: "Submit evidence package to guideline committees and engage guideline authors",
      defaultOwner: "Medical Affairs Director",
      defaultTimeline: "6-18 months",
      defaultMetric: "Included in ≥1 major society guideline as recommended option",
    },
  ],
  "real-world evidence": [
    {
      blockingCondition: "Insufficient real-world data to support post-launch claims",
      requiredAction: "Initiate registry study or retrospective database analysis",
      defaultOwner: "RWE/HEOR Lead",
      defaultTimeline: "6-12 months",
      defaultMetric: "RWE manuscript submitted with ≥500 patient dataset",
    },
  ],
};

function normalizeLabel(label: string): string {
  return label.toLowerCase().trim();
}

const STOP_WORDS = new Set(["the", "a", "an", "of", "in", "for", "and", "or", "to", "is", "on", "at", "by", "with", "from"]);

function findBestMatch(gateLabel: string): GateActionEntry[] | null {
  const normalized = normalizeLabel(gateLabel);

  if (GATE_ACTION_MAP[normalized]) {
    return GATE_ACTION_MAP[normalized];
  }

  for (const [key, entries] of Object.entries(GATE_ACTION_MAP)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return entries;
    }
  }

  const keywords = normalized.split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
  let bestMatch: { entries: GateActionEntry[]; score: number } | null = null;

  for (const [key, entries] of Object.entries(GATE_ACTION_MAP)) {
    const keyWords = key.split(/\s+/).filter(w => !STOP_WORDS.has(w));
    const overlap = keywords.filter(w => keyWords.some(kw => kw.includes(w) || w.includes(kw)));
    const score = overlap.length / Math.max(keyWords.length, 1);
    if (overlap.length >= 2 && score >= 0.5 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { entries, score };
    }
  }

  return bestMatch?.entries ?? null;
}

export interface ForecastGateInput {
  gate_id: string;
  gate_label: string;
  description: string;
  status: string;
  reasoning: string;
  constrains_probability_to: number;
}

const STATUS_PRIORITY: Record<string, number> = {
  unresolved: 100,
  weak: 80,
  moderate: 50,
  strong: 10,
};

export function generateDecisionActions(
  gates: ForecastGateInput[],
  brandOutlook: number | null,
  constrainedProb: number | null,
): DecisionAction[] {
  const actions: DecisionAction[] = [];

  const unresolvedGates = gates.filter(g => g.status !== "strong");

  for (const gate of unresolvedGates) {
    const libraryMatch = findBestMatch(gate.gate_label);
    const capPct = Math.round(gate.constrains_probability_to * 100);
    const brandPct = brandOutlook != null ? Math.round(brandOutlook * 100) : null;
    const constrainedPct = constrainedProb != null ? Math.round(constrainedProb * 100) : null;
    const uplift = brandPct != null ? brandPct - capPct : null;

    const basePriority = STATUS_PRIORITY[gate.status] || 50;
    const constraintPenalty = Math.max(0, 100 - capPct);
    const gapBonus = (brandPct != null && constrainedPct != null && brandPct > constrainedPct)
      ? Math.min(20, Math.round((brandPct - constrainedPct) * 0.5))
      : 0;
    const priorityScore = Math.min(100, Math.round(basePriority * 0.5 + constraintPenalty * 0.3 + gapBonus + 10));

    if (libraryMatch && libraryMatch.length > 0) {
      const entry = libraryMatch[0];
      actions.push({
        gateName: gate.gate_label,
        blockingCondition: entry.blockingCondition,
        requiredAction: entry.requiredAction,
        owner: entry.defaultOwner,
        timeline: entry.defaultTimeline,
        resolutionMetric: entry.defaultMetric,
        forecastImpact: uplift != null && uplift > 0
          ? `Resolving this gate could lift the forecast by up to ${uplift} percentage points (from ${capPct}% toward ${brandPct}%)`
          : `This gate currently caps the forecast at ${capPct}%`,
        priorityScore,
      });
    } else {
      actions.push({
        gateName: gate.gate_label,
        blockingCondition: gate.reasoning || `${gate.gate_label} is ${gate.status}`,
        requiredAction: gate.status === "unresolved"
          ? `Investigate and resolve: ${gate.gate_label}`
          : `Strengthen: ${gate.gate_label} — move from ${gate.status} to strong`,
        owner: "Cross-functional Lead",
        timeline: gate.status === "unresolved" ? "1-3 months" : "3-6 months",
        resolutionMetric: `Gate status moves from "${gate.status}" to "strong"`,
        forecastImpact: uplift != null && uplift > 0
          ? `Resolving this gate could lift the forecast by up to ${uplift} percentage points (from ${capPct}% toward ${brandPct}%)`
          : `This gate currently caps the forecast at ${capPct}%`,
        priorityScore,
      });
    }
  }

  actions.sort((a, b) => b.priorityScore - a.priorityScore);

  return actions;
}
