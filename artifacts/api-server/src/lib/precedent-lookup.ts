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
    governanceNote: "Use when real-world uptake materially misses consensus or stated access expectations",
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
    governanceNote: "Use when treatment eligibility depends on constrained testing or referral infrastructure",
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
    governanceNote: "Use for ARIA-like or monitoring-dependent safety friction",
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
    governanceNote: "Use when recurring site visits materially suppress initiation or persistence",
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
    governanceNote: "Use for conditional reimbursement, prior auth burden, or coverage inconsistency",
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
    governanceNote: "Use when routine-practice continuation data meaningfully support durability",
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
    governanceNote: "Use when sites show improved execution, patient selection, or monitoring cadence",
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
    governanceNote: "Use for less burdensome formulation or maintenance schedule improvements",
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
    governanceNote: "Use when guidelines or society statements are supportive but not yet broadly operationalized",
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
    governanceNote: "Use when new diagnostics may expand access but scaling is still uncertain",
  },
];

const SIGNAL_TYPE_MAP: Record<string, string> = {
  "safety / pharmacovigilance": "Safety signal requiring monitoring",
  "operational friction": "Infusion / administration burden",
  "operational constraint": "Diagnostic bottleneck",
  "operational / manufacturing": "Infusion / administration burden",
  "access / commercial": "Payer / reimbursement friction",
  "prescriber behavior": "Early launch underperformance",
  "competitor counteraction": "Early launch underperformance",
  "competitive intelligence": "Early launch underperformance",
  "field intelligence": "Early launch underperformance",
  "market sizing": "Early launch underperformance",
  "phase iii clinical": "Real-world persistence support",
  "phase ii clinical": "Emerging biomarker / diagnostic innovation",
  "real-world evidence": "Real-world persistence support",
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
  "access / commercial": "Workflow standardization / site learning",
  "guideline inclusion": "Guideline / expert support",
  "guideline / soc": "Guideline / expert support",
  "kol endorsement": "Guideline / expert support",
  "advocacy / patient": "Guideline / expert support",
  "policy / regulatory": "Guideline / expert support",
  "clinical workflow": "Workflow standardization / site learning",
  "operational milestone": "Workflow standardization / site learning",
  "phase iii clinical": "Real-world persistence support",
  "phase ii clinical": "Emerging biomarker / diagnostic innovation",
  "real-world evidence": "Real-world persistence support",
  "development timeline": "Emerging biomarker / diagnostic innovation",
};

const NEGATIVE_TYPE_MAP: Record<string, string> = {
  "safety / pharmacovigilance": "Safety signal requiring monitoring",
  "operational friction": "Infusion / administration burden",
  "operational constraint": "Diagnostic bottleneck",
  "operational / manufacturing": "Infusion / administration burden",
  "access / commercial": "Payer / reimbursement friction",
  "prescriber behavior": "Early launch underperformance",
  "competitor counteraction": "Early launch underperformance",
  "competitive intelligence": "Early launch underperformance",
  "field intelligence": "Early launch underperformance",
  "market sizing": "Early launch underperformance",
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

  const typeMap = isPositive ? POSITIVE_TYPE_MAP : NEGATIVE_TYPE_MAP;
  let precedentType = typeMap[normalizedType];

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

  const library = getPrecedentMap();
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
