export interface SignalInput {
  signalId: string;
  signalType: string;
  direction: string;
  strengthScore: number;
  reliabilityScore: number;
  likelihoodRatio: number;
  scope: string | null;
  timing: string | null;
}

export interface SignalContribution {
  signalId: string;
  signalType: string;
  direction: string;
  sensitivityWeight: number;
  rawShift: number;
  frictionApplied: number;
  netShift: number;
}

export interface ArchetypeResult {
  archetypeId: string;
  archetypeName: string;
  description: string;
  beliefShift: number;
  convictionLevel: number;
  actionThreshold: number;
  actionThresholdCrossed: boolean;
  likelyBehavior: string;
  adoptionImpact: string;
  rationale: string;
  signalContributions: SignalContribution[];
}

interface SensitivityProfile {
  "Phase III clinical": number;
  "Guideline inclusion": number;
  "KOL endorsement": number;
  "Field intelligence": number;
  "Operational friction": number;
  "Competitor counteraction": number;
  "Access / commercial": number;
  "Regulatory / clinical": number;
}

interface HesitationRule {
  triggers: string[];
  frictionMultiplier: number;
  description: string;
}

interface ArchetypeDefinition {
  id: string;
  name: string;
  description: string;
  sensitivityProfile: SensitivityProfile;
  hesitationRule: HesitationRule;
  actionThreshold: number;
  adoptionImplication: string;
}

const ARCHETYPES: ArchetypeDefinition[] = [
  {
    id: "evidence-driven-adopter",
    name: "Evidence-Driven Adopter",
    description: "Academic-minded HCP who moves on strong clinical evidence. Weighs Phase III data and regulatory signals heavily. Low sensitivity to field anecdotes.",
    sensitivityProfile: {
      "Phase III clinical": 0.95,
      "Guideline inclusion": 0.70,
      "KOL endorsement": 0.50,
      "Field intelligence": 0.15,
      "Operational friction": 0.30,
      "Competitor counteraction": 0.20,
      "Access / commercial": 0.35,
      "Regulatory / clinical": 0.85,
    },
    hesitationRule: {
      triggers: ["Operational friction", "Competitor counteraction"],
      frictionMultiplier: 0.4,
      description: "Mildly slowed by operational barriers; largely immune to competitive noise",
    },
    actionThreshold: 0.65,
    adoptionImplication: "Early formulary champion; drives protocol inclusion at academic centers",
  },
  {
    id: "guideline-follower",
    name: "Guideline Follower",
    description: "Waits for guideline endorsement before prescribing. High inertia until authoritative guidance appears, then shifts decisively.",
    sensitivityProfile: {
      "Phase III clinical": 0.40,
      "Guideline inclusion": 0.95,
      "KOL endorsement": 0.60,
      "Field intelligence": 0.20,
      "Operational friction": 0.50,
      "Competitor counteraction": 0.25,
      "Access / commercial": 0.45,
      "Regulatory / clinical": 0.75,
    },
    hesitationRule: {
      triggers: ["Operational friction", "Access / commercial"],
      frictionMultiplier: 0.6,
      description: "Pauses if access is uncertain or workflow disruption is significant",
    },
    actionThreshold: 0.70,
    adoptionImplication: "Mainstream adoption driver; shifts community standard of care once activated",
  },
  {
    id: "peer-influenced-pragmatist",
    name: "Peer-Influenced Pragmatist",
    description: "Community prescriber who relies on peer experience and KOL endorsement. Practical orientation — needs to see real-world evidence from colleagues.",
    sensitivityProfile: {
      "Phase III clinical": 0.35,
      "Guideline inclusion": 0.55,
      "KOL endorsement": 0.90,
      "Field intelligence": 0.80,
      "Operational friction": 0.60,
      "Competitor counteraction": 0.35,
      "Access / commercial": 0.55,
      "Regulatory / clinical": 0.40,
    },
    hesitationRule: {
      triggers: ["Operational friction", "Competitor counteraction"],
      frictionMultiplier: 0.7,
      description: "Sensitive to workflow disruption and alternative options from competitors",
    },
    actionThreshold: 0.55,
    adoptionImplication: "Volume driver in community settings; adoption spreads through local networks",
  },
  {
    id: "risk-averse-conservative",
    name: "Risk-Averse Conservative",
    description: "Slow-moving prescriber who prioritizes patient safety and established treatments. Requires overwhelming evidence and minimal friction before changing practice.",
    sensitivityProfile: {
      "Phase III clinical": 0.50,
      "Guideline inclusion": 0.65,
      "KOL endorsement": 0.30,
      "Field intelligence": 0.25,
      "Operational friction": 0.90,
      "Competitor counteraction": 0.15,
      "Access / commercial": 0.40,
      "Regulatory / clinical": 0.70,
    },
    hesitationRule: {
      triggers: ["Operational friction", "Competitor counteraction", "Access / commercial"],
      frictionMultiplier: 0.9,
      description: "Strongly deterred by any operational or access barriers; amplifies friction signals",
    },
    actionThreshold: 0.80,
    adoptionImplication: "Lagging adopter; activation signals market maturity and broad acceptance",
  },
  {
    id: "access-sensitive-prescriber",
    name: "Access-Sensitive Prescriber",
    description: "Prescriber in payer-constrained environment. Clinical conviction exists but access/reimbursement gates dominate decision-making.",
    sensitivityProfile: {
      "Phase III clinical": 0.45,
      "Guideline inclusion": 0.55,
      "KOL endorsement": 0.35,
      "Field intelligence": 0.40,
      "Operational friction": 0.70,
      "Competitor counteraction": 0.45,
      "Access / commercial": 0.95,
      "Regulatory / clinical": 0.60,
    },
    hesitationRule: {
      triggers: ["Access / commercial", "Operational friction"],
      frictionMultiplier: 0.85,
      description: "Access barriers are primary blockers; even strong clinical evidence cannot overcome poor reimbursement",
    },
    actionThreshold: 0.60,
    adoptionImplication: "Indicates payer access unlocked; activation predicts rapid volume uptake in managed-care settings",
  },
];

function computeSignalShift(
  signal: SignalInput,
  archetype: ArchetypeDefinition
): SignalContribution {
  const sensitivityWeight =
    archetype.sensitivityProfile[signal.signalType as keyof SensitivityProfile] ?? 0.30;

  const lrEffect = signal.likelihoodRatio > 1
    ? (signal.likelihoodRatio - 1)
    : -(1 / signal.likelihoodRatio - 1);

  const credibilityFactor = Math.min(signal.reliabilityScore / 5, 1);
  const rawShift = lrEffect * sensitivityWeight * credibilityFactor;

  let frictionApplied = 0;
  if (
    signal.direction === "Negative" &&
    archetype.hesitationRule.triggers.includes(signal.signalType)
  ) {
    frictionApplied = Math.abs(rawShift) * archetype.hesitationRule.frictionMultiplier;
  }

  const netShift = rawShift - frictionApplied;

  return {
    signalId: signal.signalId,
    signalType: signal.signalType,
    direction: signal.direction,
    sensitivityWeight: round(sensitivityWeight, 3),
    rawShift: round(rawShift, 4),
    frictionApplied: round(frictionApplied, 4),
    netShift: round(netShift, 4),
  };
}

function generateBehavior(
  archetype: ArchetypeDefinition,
  convictionLevel: number,
  thresholdCrossed: boolean,
  positiveShift: number,
  negativeShift: number
): { likelyBehavior: string; adoptionImpact: string; rationale: string } {
  if (thresholdCrossed && convictionLevel > archetype.actionThreshold + 0.15) {
    return {
      likelyBehavior: "Active prescribing — initiating new patients and expanding use",
      adoptionImpact: archetype.adoptionImplication,
      rationale: `Conviction (${round(convictionLevel, 2)}) substantially exceeds action threshold (${archetype.actionThreshold}). ${archetype.name} is fully activated by the current signal mix.`,
    };
  }

  if (thresholdCrossed) {
    return {
      likelyBehavior: "Selective prescribing — trying in appropriate patients",
      adoptionImpact: `Early activation: ${archetype.adoptionImplication.toLowerCase()}`,
      rationale: `Conviction (${round(convictionLevel, 2)}) has crossed the action threshold (${archetype.actionThreshold}). ${archetype.name} is moving but may revert if new negative signals emerge.`,
    };
  }

  if (convictionLevel > archetype.actionThreshold - 0.10) {
    return {
      likelyBehavior: "Monitoring closely — near decision point but waiting for confirmation",
      adoptionImpact: "Potential activation within 1–2 signal cycles",
      rationale: `Conviction (${round(convictionLevel, 2)}) is approaching the threshold (${archetype.actionThreshold}). A single strong confirmatory signal could tip this archetype.`,
    };
  }

  if (convictionLevel > 0.30) {
    return {
      likelyBehavior: "Aware but uncommitted — tracking developments without behavioral change",
      adoptionImpact: "No near-term adoption impact; requires sustained positive evidence",
      rationale: `Conviction (${round(convictionLevel, 2)}) remains well below threshold (${archetype.actionThreshold}). ${Math.abs(negativeShift) > positiveShift * 0.5 ? "Friction signals are dampening positive momentum." : "Insufficient evidence weight to drive action."}`,
    };
  }

  return {
    likelyBehavior: "Not engaged — no meaningful practice change anticipated",
    adoptionImpact: "No adoption impact from this archetype under current conditions",
    rationale: `Conviction (${round(convictionLevel, 2)}) is far below the action threshold (${archetype.actionThreshold}). This archetype requires fundamentally different signal conditions to activate.`,
  };
}

function round(n: number, dp: number): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

export function computeDecisionPaths(signals: SignalInput[]): ArchetypeResult[] {
  return ARCHETYPES.map((archetype) => {
    const contributions = signals.map((s) => computeSignalShift(s, archetype));

    const positiveShift = contributions
      .filter((c) => c.netShift > 0)
      .reduce((sum, c) => sum + c.netShift, 0);
    const negativeShift = contributions
      .filter((c) => c.netShift < 0)
      .reduce((sum, c) => sum + c.netShift, 0);

    const totalShift = positiveShift + negativeShift;
    const basePriorLogOdds = -0.62;
    const scaledShift = totalShift * 0.6;
    const logOdds = basePriorLogOdds + scaledShift;
    const convictionLevel = 1 / (1 + Math.exp(-logOdds));

    const beliefShift = round(totalShift, 4);
    const thresholdCrossed = convictionLevel >= archetype.actionThreshold;

    const { likelyBehavior, adoptionImpact, rationale } = generateBehavior(
      archetype,
      convictionLevel,
      thresholdCrossed,
      positiveShift,
      negativeShift
    );

    return {
      archetypeId: archetype.id,
      archetypeName: archetype.name,
      description: archetype.description,
      beliefShift,
      convictionLevel: round(convictionLevel, 4),
      actionThreshold: archetype.actionThreshold,
      actionThresholdCrossed: thresholdCrossed,
      likelyBehavior,
      adoptionImpact,
      rationale,
      signalContributions: contributions,
    };
  });
}

export function getArchetypeDefinitions() {
  return ARCHETYPES.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    sensitivityProfile: a.sensitivityProfile,
    hesitationRule: a.hesitationRule,
    actionThreshold: a.actionThreshold,
    adoptionImplication: a.adoptionImplication,
  }));
}
