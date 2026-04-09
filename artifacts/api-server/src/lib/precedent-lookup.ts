import { db } from "@workspace/db";
import { signalPrecedentLibraryTable } from "@workspace/db";
import { randomUUID } from "crypto";

export const ENGINE_VERSION = "CIOS_v18";
export const PRECEDENT_LIBRARY_VERSION = "PREC_v1";
export const SIGNAL_SET_VERSION = "SIGSET_v1";
export const CALCULATION_RULE_VERSION = "DEP_v1";

interface PrecedentEntry {
  signalType: string;
  context: string;
  historicalImpact: string;
  reliabilityTier: string;
  baseLr: number;
  tierMultiplier: number;
  assignedLr: number;
  sourceCount: number;
  governanceNote: string;
}

const PRECEDENT_LIBRARY: PrecedentEntry[] = [
  {
    signalType: "Early launch underperformance",
    context: "Specialty / high-friction launch",
    historicalImpact: "High negative",
    reliabilityTier: "A",
    baseLr: 0.55,
    tierMultiplier: 1.0,
    assignedLr: 0.55,
    sourceCount: 9,
    governanceNote: "Use when real-world uptake materially misses consensus or stated access expectations. Multiple specialty rare disease launches as anchors.",
  },
  {
    signalType: "Diagnostic bottleneck",
    context: "Complex diagnostic pathway",
    historicalImpact: "Very high negative",
    reliabilityTier: "A",
    baseLr: 0.45,
    tierMultiplier: 1.0,
    assignedLr: 0.45,
    sourceCount: 12,
    governanceNote: "Use when treatment eligibility depends on constrained testing or referral infrastructure. Arikayce NTM culture confirmation is primary anchor. Verified: diagnostic/pathway burden dominated year-1 adoption more than reimbursement.",
  },
  {
    signalType: "Safety signal requiring monitoring",
    context: "Chronic specialty therapy",
    historicalImpact: "High negative",
    reliabilityTier: "A",
    baseLr: 0.60,
    tierMultiplier: 1.0,
    assignedLr: 0.60,
    sourceCount: 10,
    governanceNote: "Use for ARIA-like or monitoring-dependent safety friction. Distinct from black box warning — use this when monitoring burden suppresses initiation but prescribing continues.",
  },
  {
    signalType: "FDA advisory committee — negative vote or major concern",
    context: "Pre-approval / label negotiation",
    historicalImpact: "Very high negative",
    reliabilityTier: "A",
    baseLr: 0.35,
    tierMultiplier: 1.0,
    assignedLr: 0.35,
    sourceCount: 11,
    governanceNote: "Use when adcom votes against approval or raises major unresolved safety concerns before PDUFA. Source anchors: multiple oncology and neurology adcoms.",
  },
  {
    signalType: "REMS program imposition",
    context: "Post-approval safety restriction",
    historicalImpact: "High negative",
    reliabilityTier: "A",
    baseLr: 0.52,
    tierMultiplier: 1.0,
    assignedLr: 0.52,
    sourceCount: 9,
    governanceNote: "Use when FDA imposes REMS restricting prescriber certification, dispenser authorization, or patient enrollment. Materially suppresses addressable prescriber base.",
  },
  {
    signalType: "Black box warning added post-launch",
    context: "Post-approval safety — severe",
    historicalImpact: "Very high negative",
    reliabilityTier: "A",
    baseLr: 0.35,
    tierMultiplier: 1.0,
    assignedLr: 0.35,
    sourceCount: 14,
    governanceNote: "VERIFIED. Beovu retinal vasculitis anchor: new-start collapse within WEEKS of Feb 23 2020 ASRS alert. Q1 2020 same-quarter commercial impact. Q1 2021 sales -43% YoY. LR revised from 0.40 to 0.35. Use for severe organ-threatening specialty safety signals.",
  },
  {
    signalType: "Companion diagnostic required — constrained lab infrastructure",
    context: "Diagnostic access — CDx-gated",
    historicalImpact: "High negative",
    reliabilityTier: "A",
    baseLr: 0.48,
    tierMultiplier: 1.0,
    assignedLr: 0.48,
    sourceCount: 8,
    governanceNote: "Distinct from general diagnostic burden. Use when CDx is required AND performing labs are geographically concentrated or require credentialing. Keytruda PD-L1 rollout is anchor.",
  },
  {
    signalType: "Clinical hold or partial clinical hold during launch window",
    context: "Regulatory — development risk",
    historicalImpact: "High negative",
    reliabilityTier: "A",
    baseLr: 0.45,
    tierMultiplier: 1.0,
    assignedLr: 0.45,
    sourceCount: 7,
    governanceNote: "Use when FDA places active clinical hold on ongoing studies during the 24-month forecast window. Signals unresolved safety concern to prescribers even if launch proceeds.",
  },
  {
    signalType: "Post-marketing safety communication — no label change yet",
    context: "Pharmacovigilance — pre-label formal communication",
    historicalImpact: "High negative",
    reliabilityTier: "A",
    baseLr: 0.58,
    tierMultiplier: 1.0,
    assignedLr: 0.58,
    sourceCount: 7,
    governanceNote: "OPEN — awaiting verification. Middle tier in three-stage safety progression: early signal (0.72) → formal communication (0.58) → black box (0.35). Use when Dear HCP letter or ASRS-type alert issued without label change. LR 0.58 is placeholder; range 0.55-0.65 plausible.",
  },
  {
    signalType: "Infusion / administration burden",
    context: "Facility-administered therapy",
    historicalImpact: "Moderate negative",
    reliabilityTier: "B",
    baseLr: 0.75,
    tierMultiplier: 0.85,
    assignedLr: 0.6375,
    sourceCount: 7,
    governanceNote: "Use when recurring site visits materially suppress initiation or persistence. Attenuate toward 0.88 when centers already have infusion infrastructure — no incremental burden but also no competitive differentiation.",
  },
  {
    signalType: "Payer / reimbursement friction",
    context: "Medicare or payer-gated market",
    historicalImpact: "Moderate negative",
    reliabilityTier: "B",
    baseLr: 0.80,
    tierMultiplier: 0.85,
    assignedLr: 0.68,
    sourceCount: 6,
    governanceNote: "Use for conditional reimbursement, prior auth burden, or coverage inconsistency. Distinct from step-edit signal which implies a direct competitor is preferred.",
  },
  {
    signalType: "Biosimilar entry — same indication within forecast window",
    context: "Commercial / competitive",
    historicalImpact: "Moderate negative",
    reliabilityTier: "B",
    baseLr: 0.72,
    tierMultiplier: 0.85,
    assignedLr: 0.612,
    sourceCount: 7,
    governanceNote: "Use when biosimilar launches into the same indication within the 24-month forecast window. Impact varies by payer formulary preference and price differential.",
  },
  {
    signalType: "Stigma or access friction — CNS / OUD / psychiatric indication",
    context: "Field intelligence — prescriber / patient barrier",
    historicalImpact: "Moderate negative",
    reliabilityTier: "B",
    baseLr: 0.65,
    tierMultiplier: 0.85,
    assignedLr: 0.5525,
    sourceCount: 6,
    governanceNote: "VERIFIED. Revised from 0.78 to 0.65. OUD barriers are compound stack: stigma + regulation + training + workflow + reimbursement. Sublocade anchor: prescriber reluctance/stigma/regulatory-workflow friction was primary suppressor. Use 0.65 for broad community prescriber willingness; 0.72 for specialized addiction centers.",
  },
  {
    signalType: "Spontaneous reporting signal — disproportionality alert pre-formal communication",
    context: "Pharmacovigilance — early signal FAERS / EudraVigilance",
    historicalImpact: "Moderate negative",
    reliabilityTier: "B",
    baseLr: 0.72,
    tierMultiplier: 0.85,
    assignedLr: 0.612,
    sourceCount: 5,
    governanceNote: "OPEN — awaiting verification. Earliest stage in three-stage safety progression. Use ONLY when documented evidence confirms prescriber awareness through KOL networks or conference channels. Do not apply based on database signal alone without field intelligence confirming reach.",
  },
  {
    signalType: "Non-preferred formulary tier — step-edit required to preferred agent",
    context: "Commercial / payer access — formulary structure",
    historicalImpact: "Moderate negative",
    reliabilityTier: "B",
    baseLr: 0.76,
    tierMultiplier: 0.85,
    assignedLr: 0.646,
    sourceCount: 6,
    governanceNote: "OPEN — awaiting verification. Use when therapy is placed on non-preferred tier with mandatory step-edit through a preferred same-class agent. More suppressive than general payer friction because a direct competitor is preferred.",
  },
  {
    signalType: "H2H superiority vs SOC — dramatic effect size practice-changing delta",
    context: "Clinical evidence — comparative RCT large effect",
    historicalImpact: "Very high positive",
    reliabilityTier: "A",
    baseLr: 1.60,
    tierMultiplier: 1.0,
    assignedLr: 1.60,
    sourceCount: 10,
    governanceNote: "VERIFIED. Tier A2 = dramatic superiority only. DESTINY-Breast03 anchor: HR 0.28 vs T-DM1; 12-mo PFS 75.8% vs 34.1%; ORR 79.7% vs 34.2%. CRITICAL: reserve for similarly dramatic effect sizes. Do NOT use as universal H2H anchor. For modest superiority use Tier A1 (LR 1.35).",
  },
  {
    signalType: "H2H superiority vs SOC — modest but statistically significant",
    context: "Clinical evidence — comparative RCT moderate effect",
    historicalImpact: "High positive",
    reliabilityTier: "A",
    baseLr: 1.35,
    tierMultiplier: 1.0,
    assignedLr: 1.35,
    sourceCount: 6,
    governanceNote: "Tier A1 = modest H2H superiority. Use when RCT shows statistically significant superiority but effect size is incremental rather than practice-changing. HR 0.60-0.80 range or meaningful but non-dramatic PFS/OS delta. Source count conservative at 6 — build to 10+ before treating as fully stable.",
  },
  {
    signalType: "Real-world persistence support",
    context: "Post-launch specialty use",
    historicalImpact: "Moderate positive",
    reliabilityTier: "B",
    baseLr: 1.35,
    tierMultiplier: 0.85,
    assignedLr: 1.1475,
    sourceCount: 5,
    governanceNote: "Use when routine-practice continuation data meaningfully support durability. Requires publication in indexed journal or registry data with sufficient follow-up.",
  },
  {
    signalType: "Workflow standardization / site learning",
    context: "Operational maturity signal",
    historicalImpact: "Moderate positive",
    reliabilityTier: "B",
    baseLr: 1.25,
    tierMultiplier: 0.85,
    assignedLr: 1.0625,
    sourceCount: 4,
    governanceNote: "Use when sites show improved execution, patient selection, or monitoring cadence over time. Effect appears in year 2+ of launch, not year 1.",
  },
  {
    signalType: "Subcutaneous / simplified administration",
    context: "Administration simplification",
    historicalImpact: "Moderate positive",
    reliabilityTier: "B",
    baseLr: 1.30,
    tierMultiplier: 0.85,
    assignedLr: 1.105,
    sourceCount: 6,
    governanceNote: "Use for less burdensome formulation or maintenance schedule improvements. Attenuate toward neutral when centers already manage the existing route without friction.",
  },
  {
    signalType: "Subcutaneous formulation replacing IV — same indication",
    context: "Administration simplification — route change",
    historicalImpact: "Strong positive",
    reliabilityTier: "B",
    baseLr: 1.45,
    tierMultiplier: 0.85,
    assignedLr: 1.2325,
    sourceCount: 8,
    governanceNote: "Hemlibra SC vs IV factor is anchor. Use when SQ replaces IV in same indication with comparable efficacy. Effect stronger when incumbent has high infusion burden. Distinct from general simplified administration signal.",
  },
  {
    signalType: "Dosing interval advantage vs incumbent",
    context: "Administration simplification — frequency",
    historicalImpact: "Moderate positive",
    reliabilityTier: "B",
    baseLr: 1.30,
    tierMultiplier: 0.85,
    assignedLr: 1.105,
    sourceCount: 7,
    governanceNote: "VERIFIED. Eylea q8w vs Lucentis q4w: ~40% branded share within 9-12 months (faster than estimated). Mavyret 8-week vs Epclusa 12-week secondary anchor. LR 1.30 confirmed conservative-to-fair; range 1.30-1.40 defensible. Do not exceed 1.40 without internal center-level data.",
  },
  {
    signalType: "KOL network concentration — rare disease center effect",
    context: "Field intelligence — rare disease",
    historicalImpact: "Moderate positive",
    reliabilityTier: "B",
    baseLr: 1.22,
    tierMultiplier: 0.85,
    assignedLr: 1.037,
    sourceCount: 5,
    governanceNote: "Use when 10-20 high-volume academic centers account for >60% of eligible patients AND early KOL conversion at those centers has been confirmed. Arikayce NTM center concentration is anchor.",
  },
  {
    signalType: "CMS National Coverage Determination — favorable",
    context: "Commercial / access — Medicare",
    historicalImpact: "Moderate positive",
    reliabilityTier: "B",
    baseLr: 1.28,
    tierMultiplier: 0.85,
    assignedLr: 1.088,
    sourceCount: 6,
    governanceNote: "Use when CMS issues NCD or favorable LCD supporting reimbursement. Particularly relevant for rare disease and specialty therapies with high Medicare mix.",
  },
  {
    signalType: "Real-world comparative effectiveness — favorable RWE published",
    context: "Clinical evidence — post-launch",
    historicalImpact: "Moderate positive",
    reliabilityTier: "B",
    baseLr: 1.18,
    tierMultiplier: 0.85,
    assignedLr: 1.003,
    sourceCount: 5,
    governanceNote: "Use when peer-reviewed RWE shows favorable comparative outcomes vs incumbent in routine practice. Requires publication in indexed journal. Effect weaker than RCT superiority.",
  },
  {
    signalType: "Label expansion into broader eligible population",
    context: "Commercial — label broadening",
    historicalImpact: "Moderate positive",
    reliabilityTier: "B",
    baseLr: 1.25,
    tierMultiplier: 0.85,
    assignedLr: 1.0625,
    sourceCount: 6,
    governanceNote: "Hemlibra non-inhibitor expansion is anchor. Use when label broadens from restricted subgroup to general eligible population within forecast window.",
  },
  {
    signalType: "Value-based contract or outcomes-based agreement — accelerated access",
    context: "Commercial / payer access — outcomes contract",
    historicalImpact: "Moderate positive",
    reliabilityTier: "B",
    baseLr: 1.20,
    tierMultiplier: 0.85,
    assignedLr: 1.02,
    sourceCount: 4,
    governanceNote: "OPEN — awaiting verification. Use when manufacturer and payer have executed a VBC providing preferential access. Requires executed agreement — do not apply based on announced intent alone. Kymriah and Sarepta gene therapy contracts are proposed anchors.",
  },
  {
    signalType: "Guideline / expert support",
    context: "Practice-shaping endorsement",
    historicalImpact: "Light positive",
    reliabilityTier: "C",
    baseLr: 1.15,
    tierMultiplier: 0.70,
    assignedLr: 0.805,
    sourceCount: 3,
    governanceNote: "Use when guidelines or society statements are supportive but not yet broadly operationalized. Light effect — guideline publication precedes practice change by months to years. Direction safety correction applies: positive signal with assignedLr <1.0 gets flipped to 1/0.805 = 1.242.",
  },
  {
    signalType: "Emerging biomarker / diagnostic innovation",
    context: "Early adoption enabler",
    historicalImpact: "Moderate positive",
    reliabilityTier: "C",
    baseLr: 1.25,
    tierMultiplier: 0.70,
    assignedLr: 0.875,
    sourceCount: 2,
    governanceNote: "Use when new diagnostics may expand access but scaling is still uncertain. Source count very low — treat as provisional. Direction safety correction applies: positive signal with assignedLr <1.0 gets flipped to 1/0.875 = 1.143.",
  },
];

const SIGNAL_TYPE_MAP: Record<string, string> = {
  "phase iii clinical": "H2H superiority vs SOC — modest but statistically significant",
  "real-world evidence": "Real-world persistence support",
  "field intelligence": "Early launch underperformance",
  "payer / coverage": "Payer / reimbursement friction",
  "regulatory / clinical": "Clinical hold or partial clinical hold during launch window",
  "safety signal": "Safety signal requiring monitoring",
  "market adoption / utilization": "Early launch underperformance",
  "access / commercial": "Payer / reimbursement friction",
  "guideline / expert": "Guideline / expert support",
  "capacity / infrastructure": "Infusion / administration burden",
  "experience infrastructure": "Infusion / administration burden",
  "competitor countermove": "Early launch underperformance",
  "diagnostic pathway": "Diagnostic bottleneck",
  "administration simplification": "Subcutaneous / simplified administration",
  "biomarker innovation": "Emerging biomarker / diagnostic innovation",
  "safety / pharmacovigilance": "Safety signal requiring monitoring",
  "operational friction": "Infusion / administration burden",
  "operational constraint": "Diagnostic bottleneck",
  "operational / manufacturing": "Infusion / administration burden",
  "access friction": "Payer / reimbursement friction",
  "prescriber behavior": "Early launch underperformance",
  "competitor counteraction": "Early launch underperformance",
  "competitive intelligence": "Early launch underperformance",
  "market sizing": "Early launch underperformance",
  "phase ii clinical": "Emerging biomarker / diagnostic innovation",
  "guideline inclusion": "Guideline / expert support",
  "guideline / soc": "Guideline / expert support",
  "kol endorsement": "Guideline / expert support",
  "advocacy / patient": "Guideline / expert support",
  "policy / regulatory": "Guideline / expert support",
  "clinical workflow": "Workflow standardization / site learning",
  "operational milestone": "Workflow standardization / site learning",
  "development timeline": "Emerging biomarker / diagnostic innovation",
};

const POSITIVE_TYPE_MAP: Record<string, string> = {
  "phase iii clinical": "H2H superiority vs SOC — modest but statistically significant",
  "phase iii clinical — dramatic superiority": "H2H superiority vs SOC — dramatic effect size practice-changing delta",
  "h2h superiority dramatic": "H2H superiority vs SOC — dramatic effect size practice-changing delta",
  "h2h superiority modest": "H2H superiority vs SOC — modest but statistically significant",
  "real-world evidence": "Real-world persistence support",
  "real-world comparative effectiveness": "Real-world comparative effectiveness — favorable RWE published",
  "post-launch rwe": "Real-world persistence support",
  "administration simplification": "Subcutaneous / simplified administration",
  "sq replacing iv": "Subcutaneous formulation replacing IV — same indication",
  "subcutaneous formulation": "Subcutaneous formulation replacing IV — same indication",
  "dosing interval": "Dosing interval advantage vs incumbent",
  "dosing frequency advantage": "Dosing interval advantage vs incumbent",
  "workflow / site learning": "Workflow standardization / site learning",
  "operational maturity": "Workflow standardization / site learning",
  "guideline inclusion": "Guideline / expert support",
  "guideline / expert": "Guideline / expert support",
  "society endorsement": "Guideline / expert support",
  "cms coverage": "CMS National Coverage Determination — favorable",
  "ncd favorable": "CMS National Coverage Determination — favorable",
  "label expansion": "Label expansion into broader eligible population",
  "population expansion": "Label expansion into broader eligible population",
  "value-based contract": "Value-based contract or outcomes-based agreement — accelerated access",
  "outcomes-based agreement": "Value-based contract or outcomes-based agreement — accelerated access",
  "kol concentration": "KOL network concentration — rare disease center effect",
  "kol network": "KOL network concentration — rare disease center effect",
  "center concentration": "KOL network concentration — rare disease center effect",
  "biomarker innovation": "Emerging biomarker / diagnostic innovation",
  "diagnostic innovation": "Emerging biomarker / diagnostic innovation",
  "emerging diagnostic": "Emerging biomarker / diagnostic innovation",
  "persistence data": "Real-world persistence support",
  "durability data": "Real-world persistence support",
  "access / commercial": "CMS National Coverage Determination — favorable",
  "payer / coverage": "CMS National Coverage Determination — favorable",
  "access friction": "Workflow standardization / site learning",
  "guideline / soc": "Guideline / expert support",
  "kol endorsement": "Guideline / expert support",
  "advocacy / patient": "Guideline / expert support",
  "policy / regulatory": "Guideline / expert support",
  "clinical workflow": "Workflow standardization / site learning",
  "operational milestone": "Workflow standardization / site learning",
  "phase ii clinical": "Emerging biomarker / diagnostic innovation",
  "development timeline": "Emerging biomarker / diagnostic innovation",
  "competitor counteraction": "Early launch underperformance",
  "operational friction": "Workflow standardization / site learning",
  "regulatory / clinical": "Guideline / expert support",
  "capacity / infrastructure": "Workflow standardization / site learning",
  "experience infrastructure": "Workflow standardization / site learning",
  "market adoption / utilization": "Real-world persistence support",
  "field intelligence": "Real-world persistence support",
};

const NEGATIVE_TYPE_MAP: Record<string, string> = {
  "field intelligence": "Early launch underperformance",
  "market adoption / utilization": "Early launch underperformance",
  "launch underperformance": "Early launch underperformance",
  "competitive intelligence": "Early launch underperformance",
  "diagnostic pathway": "Diagnostic bottleneck",
  "diagnostic bottleneck": "Diagnostic bottleneck",
  "cdx constrained": "Companion diagnostic required — constrained lab infrastructure",
  "companion diagnostic": "Companion diagnostic required — constrained lab infrastructure",
  "safety signal": "Safety signal requiring monitoring",
  "post-marketing safety": "Post-marketing safety communication — no label change yet",
  "faers signal": "Spontaneous reporting signal — disproportionality alert pre-formal communication",
  "pharmacovigilance": "Spontaneous reporting signal — disproportionality alert pre-formal communication",
  "black box warning": "Black box warning added post-launch",
  "rems": "REMS program imposition",
  "clinical hold": "Clinical hold or partial clinical hold during launch window",
  "regulatory / clinical": "Clinical hold or partial clinical hold during launch window",
  "fda adcom negative": "FDA advisory committee — negative vote or major concern",
  "advisory committee": "FDA advisory committee — negative vote or major concern",
  "payer / coverage": "Payer / reimbursement friction",
  "reimbursement friction": "Payer / reimbursement friction",
  "access friction": "Payer / reimbursement friction",
  "formulary step-edit": "Non-preferred formulary tier — step-edit required to preferred agent",
  "non-preferred formulary": "Non-preferred formulary tier — step-edit required to preferred agent",
  "infusion burden": "Infusion / administration burden",
  "administration burden": "Infusion / administration burden",
  "capacity / infrastructure": "Infusion / administration burden",
  "experience infrastructure": "Infusion / administration burden",
  "biosimilar entry": "Biosimilar entry — same indication within forecast window",
  "competitor countermove": "Early launch underperformance",
  "stigma / access friction": "Stigma or access friction — CNS / OUD / psychiatric indication",
  "oud access barrier": "Stigma or access friction — CNS / OUD / psychiatric indication",
  "cns stigma": "Stigma or access friction — CNS / OUD / psychiatric indication",
  "safety / pharmacovigilance": "Safety signal requiring monitoring",
  "operational friction": "Infusion / administration burden",
  "operational constraint": "Diagnostic bottleneck",
  "operational / manufacturing": "Infusion / administration burden",
  "access / commercial": "Payer / reimbursement friction",
  "prescriber behavior": "Early launch underperformance",
  "competitor counteraction": "Early launch underperformance",
  "market sizing": "Early launch underperformance",
  "guideline inclusion": "Guideline / expert support",
  "guideline / soc": "Guideline / expert support",
  "kol endorsement": "Guideline / expert support",
};

let _cachedLibrary: Map<string, PrecedentEntry> | null = null;

function getPrecedentMap(): Map<string, PrecedentEntry> {
  if (!_cachedLibrary) {
    _cachedLibrary = new Map();
    for (const entry of PRECEDENT_LIBRARY) {
      _cachedLibrary.set(entry.signalType, entry);
    }
  }
  return _cachedLibrary;
}

function enforceDirectionSafety(assignedLr: number, isPositive: boolean): number {
  if (isPositive && assignedLr < 1.0) {
    return 1.0 / assignedLr;
  }
  if (!isPositive && assignedLr > 1.0) {
    return 1.0 / assignedLr;
  }
  return assignedLr;
}

export function lookupPrecedentLr(signalType: string, direction: string): {
  assignedLr: number;
  precedentType: string;
  reliabilityTier: string;
  matched: boolean;
  directionCorrected: boolean;
} {
  const normalizedType = signalType.toLowerCase().trim();
  const isPositive = direction.toLowerCase() === "positive";

  const library = getPrecedentMap();

  let precedentType: string | undefined;

  for (const [key] of library) {
    if (key.toLowerCase() === normalizedType) {
      precedentType = key;
      break;
    }
  }

  if (!precedentType) {
    const typeMap = isPositive ? POSITIVE_TYPE_MAP : NEGATIVE_TYPE_MAP;
    precedentType = typeMap[normalizedType];
  }

  if (!precedentType) {
    precedentType = SIGNAL_TYPE_MAP[normalizedType];
  }

  if (!precedentType) {
    return {
      assignedLr: 1.0,
      precedentType: "unmapped",
      reliabilityTier: "X",
      matched: false,
      directionCorrected: false,
    };
  }

  const entry = library.get(precedentType);
  if (!entry) {
    return {
      assignedLr: 1.0,
      precedentType,
      reliabilityTier: "X",
      matched: false,
      directionCorrected: false,
    };
  }

  const rawLr = entry.assignedLr;
  const safeLr = enforceDirectionSafety(rawLr, isPositive);
  const directionCorrected = safeLr !== rawLr;

  return {
    assignedLr: Number(safeLr.toFixed(4)),
    precedentType: entry.signalType,
    reliabilityTier: entry.reliabilityTier,
    matched: true,
    directionCorrected,
  };
}

export async function seedPrecedentLibrary(): Promise<void> {
  for (const entry of PRECEDENT_LIBRARY) {
    await db.insert(signalPrecedentLibraryTable).values({
      id: randomUUID(),
      signalType: entry.signalType,
      context: entry.context,
      historicalImpact: entry.historicalImpact,
      reliabilityTier: entry.reliabilityTier,
      baseLr: entry.baseLr,
      tierMultiplier: entry.tierMultiplier,
      assignedLr: entry.assignedLr,
      sourceCount: entry.sourceCount,
      governanceNote: entry.governanceNote,
      libraryVersion: PRECEDENT_LIBRARY_VERSION,
    }).onConflictDoNothing();
  }
}

export function getPrecedentLibrary(): PrecedentEntry[] {
  return [...PRECEDENT_LIBRARY];
}
