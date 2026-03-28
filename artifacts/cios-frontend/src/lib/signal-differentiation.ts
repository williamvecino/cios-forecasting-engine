export type SignalTier = "dominant" | "supporting" | "neutral" | "contradictory";

export interface DifferentiatedSignal {
  name: string;
  tier: SignalTier;
  tierLabel: string;
  direction: "Upward" | "Downward";
  strength: string;
  contributionPoints: number;
  rationale: string;
}

export interface SignalHierarchy {
  dominant: DifferentiatedSignal[];
  supporting: DifferentiatedSignal[];
  neutral: DifferentiatedSignal[];
  contradictory: DifferentiatedSignal[];
  strategicImplication: string;
}

export interface SignalImbalance {
  detected: boolean;
  strongDomain: string | null;
  weakDomain: string | null;
  confidenceImpact: "High" | "Moderate" | "Low" | "None";
  strategicRisk: string | null;
}

interface DriverInput {
  id: string;
  name: string;
  direction: "Upward" | "Downward";
  strength: "Low" | "Medium" | "High";
  contributionPoints: number;
}

interface GateInput {
  gate_label: string;
  status: string;
}

const TIER_LABELS: Record<SignalTier, string> = {
  dominant: "Dominant Evidence",
  supporting: "Supporting Evidence",
  neutral: "Neutral",
  contradictory: "Weak or Non-Confirmatory",
};

function classifyTier(driver: DriverInput, allDrivers: DriverInput[]): { tier: SignalTier; rationale: string } {
  const absContribution = Math.abs(driver.contributionPoints);
  const maxContribution = Math.max(...allDrivers.map(d => Math.abs(d.contributionPoints)), 1);
  const relativeStrength = absContribution / maxContribution;

  if (driver.strength === "High" && relativeStrength >= 0.6) {
    if (driver.direction === "Upward") {
      return {
        tier: "dominant",
        rationale: `High-strength signal with strong contribution (${driver.contributionPoints > 0 ? "+" : ""}${driver.contributionPoints} pts). This is a primary driver of the forecast.`,
      };
    }
    return {
      tier: "dominant",
      rationale: `High-strength downward signal with significant impact (${driver.contributionPoints} pts). This is a primary constraint on the forecast.`,
    };
  }

  if (driver.strength === "High" && relativeStrength >= 0.3) {
    return {
      tier: "supporting",
      rationale: `High-strength signal but not the dominant driver. Contributes ${driver.contributionPoints > 0 ? "+" : ""}${driver.contributionPoints} pts to the outlook.`,
    };
  }

  if (driver.strength === "Medium") {
    if (relativeStrength >= 0.4) {
      return {
        tier: "supporting",
        rationale: `Medium-strength signal with moderate contribution (${driver.contributionPoints > 0 ? "+" : ""}${driver.contributionPoints} pts). Supports the broader evidence pattern.`,
      };
    }
    return {
      tier: "neutral",
      rationale: `Medium-strength signal with limited contribution (${driver.contributionPoints > 0 ? "+" : ""}${driver.contributionPoints} pts). Not a decisive factor in the current forecast.`,
    };
  }

  if (driver.strength === "Low") {
    if (driver.direction === "Downward" && absContribution > 0) {
      return {
        tier: "contradictory",
        rationale: `Low-strength signal acting against the primary evidence direction (${driver.contributionPoints} pts). Insufficient to support specific claims.`,
      };
    }
    if (absContribution < 1) {
      return {
        tier: "neutral",
        rationale: `Low-strength signal with minimal contribution. Does not materially affect the forecast.`,
      };
    }
    return {
      tier: "neutral",
      rationale: `Low-strength signal (${driver.contributionPoints > 0 ? "+" : ""}${driver.contributionPoints} pts). Present but not decisive.`,
    };
  }

  return {
    tier: "neutral",
    rationale: `Signal contribution: ${driver.contributionPoints > 0 ? "+" : ""}${driver.contributionPoints} pts.`,
  };
}

function buildStrategicImplication(hierarchy: Omit<SignalHierarchy, "strategicImplication">): string {
  const domUpward = hierarchy.dominant.filter(s => s.direction === "Upward");
  const domDownward = hierarchy.dominant.filter(s => s.direction === "Downward");
  const contraCount = hierarchy.contradictory.length;

  if (domUpward.length > 0 && contraCount > 0) {
    const strongDomains = domUpward.map(s => s.name).join(", ");
    const weakDomains = hierarchy.contradictory.map(s => s.name).join(", ");
    return `Messaging and adoption strategy should emphasize ${strongDomains}. Avoid relying on ${weakDomains} — these signals are not confirmatory.`;
  }

  if (domUpward.length > 0 && domDownward.length === 0) {
    const strongDomains = domUpward.map(s => s.name).join(", ");
    return `Evidence is concentrated around ${strongDomains}. Supporting signals reinforce the outlook but are not independently decisive.`;
  }

  if (domDownward.length > 0 && domUpward.length === 0) {
    const barriers = domDownward.map(s => s.name).join(", ");
    return `Primary evidence signals are barriers: ${barriers}. Resolution of these is required before positive outlook claims.`;
  }

  if (domUpward.length > 0 && domDownward.length > 0) {
    return `Evidence is mixed with both strong positive and strong negative signals. Strategic decisions should weight the dominant signals in each direction explicitly.`;
  }

  if (hierarchy.supporting.length > 0 && hierarchy.dominant.length === 0) {
    return `No single endpoint dominates the evidence. Multiple supporting signals together form the basis for the outlook.`;
  }

  return `Evidence signals are distributed across categories with no clear dominant endpoint.`;
}

export function differentiateSignals(drivers: DriverInput[], gates: GateInput[]): SignalHierarchy {
  if (drivers.length === 0) {
    return {
      dominant: [],
      supporting: [],
      neutral: [],
      contradictory: [],
      strategicImplication: "No signals have been identified. The forecast relies on prior probability and gate constraints alone.",
    };
  }

  const sorted = [...drivers].sort((a, b) => Math.abs(b.contributionPoints) - Math.abs(a.contributionPoints));

  const classified: DifferentiatedSignal[] = sorted.map(d => {
    const { tier, rationale } = classifyTier(d, drivers);
    return {
      name: d.name,
      tier,
      tierLabel: TIER_LABELS[tier],
      direction: d.direction,
      strength: d.strength,
      contributionPoints: d.contributionPoints,
      rationale,
    };
  });

  const hierarchy: Omit<SignalHierarchy, "strategicImplication"> = {
    dominant: classified.filter(s => s.tier === "dominant"),
    supporting: classified.filter(s => s.tier === "supporting"),
    neutral: classified.filter(s => s.tier === "neutral"),
    contradictory: classified.filter(s => s.tier === "contradictory"),
  };

  return {
    ...hierarchy,
    strategicImplication: buildStrategicImplication(hierarchy),
  };
}

export function detectSignalImbalance(hierarchy: SignalHierarchy): SignalImbalance {
  const domUpward = hierarchy.dominant.filter(s => s.direction === "Upward");
  const domDownward = hierarchy.dominant.filter(s => s.direction === "Downward");
  const contraCount = hierarchy.contradictory.length;

  if (hierarchy.dominant.length === 0 && hierarchy.supporting.length === 0) {
    return {
      detected: false,
      strongDomain: null,
      weakDomain: null,
      confidenceImpact: "None",
      strategicRisk: null,
    };
  }

  if (domUpward.length > 0 && contraCount > 0) {
    const strongNames = domUpward.map(s => s.name).join(", ");
    const weakNames = hierarchy.contradictory.map(s => s.name).join(", ");
    return {
      detected: true,
      strongDomain: strongNames,
      weakDomain: weakNames,
      confidenceImpact: "Moderate",
      strategicRisk: `Potential objection on ${weakNames}. Adoption messaging should avoid claims not supported by confirmatory evidence.`,
    };
  }

  if (domUpward.length > 0 && domDownward.length > 0) {
    return {
      detected: true,
      strongDomain: domUpward.map(s => s.name).join(", "),
      weakDomain: domDownward.map(s => s.name).join(", "),
      confidenceImpact: "High",
      strategicRisk: `Evidence is divided — strong signals exist in both directions. Decision-makers should evaluate dominant positive vs. dominant negative evidence explicitly.`,
    };
  }

  if (domUpward.length > 0 && hierarchy.supporting.length === 0 && hierarchy.neutral.length > 2) {
    return {
      detected: true,
      strongDomain: domUpward.map(s => s.name).join(", "),
      weakDomain: "Breadth of supporting evidence",
      confidenceImpact: "Moderate",
      strategicRisk: `Evidence is narrow — strong in ${domUpward.map(s => s.name).join(", ")} but lacks breadth across other endpoints.`,
    };
  }

  return {
    detected: false,
    strongDomain: hierarchy.dominant.length > 0 ? hierarchy.dominant.map(s => s.name).join(", ") : null,
    weakDomain: null,
    confidenceImpact: "None",
    strategicRisk: null,
  };
}
