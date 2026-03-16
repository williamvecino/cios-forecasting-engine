export type AgentId =
  | "academic_specialist"
  | "community_specialist"
  | "inpatient_prescriber"
  | "payer"
  | "guideline_body"
  | "competitor"
  | "commercial_msl";

export type SignalTypeKey =
  | "Phase III clinical"
  | "Guideline inclusion"
  | "KOL endorsement"
  | "Field intelligence"
  | "Operational friction"
  | "Competitor counteraction"
  | "Access / commercial"
  | "Regulatory / clinical";

export interface AgentArchetype {
  id: AgentId;
  label: string;
  role: string;
  motivations: string[];
  decisionDrivers: string[];
  inertia: number;
  responseSpeed: "fast" | "medium" | "slow";
  influenceScore: number;
  isAdversarial: boolean;
  stanceLabels: {
    strongPositive: string;
    positive: string;
    neutral: string;
    negative: string;
    strongNegative: string;
  };
}

export const AGENT_ARCHETYPES: AgentArchetype[] = [
  {
    id: "academic_specialist",
    label: "Academic / KOL Specialist",
    role: "Leading academic prescriber and key opinion leader",
    motivations: [
      "Advancing clinical practice",
      "Scientific rigor and evidence quality",
      "Patient outcomes and survival",
    ],
    decisionDrivers: [
      "Phase III trial design and endpoints",
      "Head-to-head comparisons vs. standard of care",
      "Peer-reviewed publication and guideline status",
    ],
    inertia: 0.20,
    responseSpeed: "fast",
    influenceScore: 0.90,
    isAdversarial: false,
    stanceLabels: {
      strongPositive: "Early Supporter",
      positive: "Supportive",
      neutral: "Neutral",
      negative: "Cautious",
      strongNegative: "Resistant",
    },
  },
  {
    id: "community_specialist",
    label: "Community Specialist",
    role: "Practising specialist outside academic centre",
    motivations: [
      "Peer validation and KOL guidance",
      "Practical treatment convenience",
      "Access and formulary availability",
    ],
    decisionDrivers: [
      "KOL endorsement at major congresses",
      "Real-world evidence post-launch",
      "Formulary listing and prior-auth burden",
    ],
    inertia: 0.50,
    responseSpeed: "medium",
    influenceScore: 0.65,
    isAdversarial: false,
    stanceLabels: {
      strongPositive: "Early Supporter",
      positive: "Supportive",
      neutral: "Neutral",
      negative: "Cautious",
      strongNegative: "Resistant",
    },
  },
  {
    id: "inpatient_prescriber",
    label: "Inpatient / Hospital Prescriber",
    role: "Hospital-based clinician or P&T committee member",
    motivations: [
      "Formulary efficiency and cost containment",
      "Clinical protocol alignment",
      "Patient safety in acute settings",
    ],
    decisionDrivers: [
      "P&T committee and formulary listing",
      "Hospital procurement costs",
      "Operational ease and IV/oral formulation",
    ],
    inertia: 0.60,
    responseSpeed: "slow",
    influenceScore: 0.55,
    isAdversarial: false,
    stanceLabels: {
      strongPositive: "Early Supporter",
      positive: "Supportive",
      neutral: "Neutral",
      negative: "Cautious",
      strongNegative: "Resistant",
    },
  },
  {
    id: "payer",
    label: "Payer / Access Decision-Maker",
    role: "Commercial or government payer with formulary control",
    motivations: [
      "Cost-effectiveness and budget impact",
      "Evidence-based coverage criteria",
      "Managing utilization and prior auth",
    ],
    decisionDrivers: [
      "ICER / health economic modelling",
      "FDA label breadth and REMS requirements",
      "Competitor pricing and rebate leverage",
    ],
    inertia: 0.70,
    responseSpeed: "slow",
    influenceScore: 0.80,
    isAdversarial: false,
    stanceLabels: {
      strongPositive: "Open Access",
      positive: "Favorable",
      neutral: "Neutral",
      negative: "Restrictive",
      strongNegative: "Blocking",
    },
  },
  {
    id: "guideline_body",
    label: "Guideline / Society Body",
    role: "Professional society or clinical guideline committee",
    motivations: [
      "Standardising evidence-based care",
      "Long-term safety and durability data",
      "Consensus among clinical experts",
    ],
    decisionDrivers: [
      "Phase III trial strength and replication",
      "Regulatory approval milestones",
      "Expert society consensus",
    ],
    inertia: 0.80,
    responseSpeed: "slow",
    influenceScore: 0.85,
    isAdversarial: false,
    stanceLabels: {
      strongPositive: "Guideline Inclusion",
      positive: "Positive Mention",
      neutral: "Under Review",
      negative: "Insufficient Evidence",
      strongNegative: "Not Recommended",
    },
  },
  {
    id: "competitor",
    label: "Competitor",
    role: "Incumbent or rival product / company",
    motivations: [
      "Defending market share",
      "Undermining new entrant differentiation",
      "Accelerating their own label expansions",
    ],
    decisionDrivers: [
      "Comparative efficacy and safety narrative",
      "Price and contracting leverage",
      "Speed to access and payer deals",
    ],
    inertia: 0.15,
    responseSpeed: "fast",
    influenceScore: 0.70,
    isAdversarial: true,
    stanceLabels: {
      strongPositive: "Active Opposition",
      positive: "Increased Pressure",
      neutral: "Monitoring",
      negative: "Complacent",
      strongNegative: "Disengaged",
    },
  },
  {
    id: "commercial_msl",
    label: "Commercial Field Force / MSL",
    role: "Sales and medical field team engaging HCPs directly",
    motivations: [
      "Building prescriber relationships and access",
      "Translating clinical data into practice",
      "Formulary wins and pull-through",
    ],
    decisionDrivers: [
      "Field intelligence and HCP feedback",
      "KOL speaker engagement opportunities",
      "Access and reimbursement support tools",
    ],
    inertia: 0.20,
    responseSpeed: "fast",
    influenceScore: 0.55,
    isAdversarial: false,
    stanceLabels: {
      strongPositive: "High Engagement",
      positive: "Engaged",
      neutral: "Moderate Engagement",
      negative: "Low Engagement",
      strongNegative: "Challenged",
    },
  },
];

export const AGENT_MAP: Record<AgentId, AgentArchetype> = Object.fromEntries(
  AGENT_ARCHETYPES.map((a) => [a.id, a])
) as Record<AgentId, AgentArchetype>;

// Cross-agent influence rules — how one stakeholder's stance shifts another's
// "condition" is the triggering polarity of the influencer's stance
// "direction" is whether the influence amplifies or dampens the influenced agent's score
export interface AgentInfluenceRule {
  from: AgentId;
  to: AgentId;
  strength: number;       // 0–1 multiplier applied to influencer's |reactionScore|
  condition: "positive" | "negative" | "any";
  direction: "amplify" | "dampen";
  label: string;          // human-readable description shown in UI
}

export const CROSS_AGENT_INFLUENCE: AgentInfluenceRule[] = [
  {
    from: "academic_specialist",
    to: "community_specialist",
    strength: 0.35,
    condition: "positive",
    direction: "amplify",
    label: "Academic KOL advocacy accelerates community specialist adoption",
  },
  {
    from: "academic_specialist",
    to: "guideline_body",
    strength: 0.25,
    condition: "positive",
    direction: "amplify",
    label: "Strong academic endorsement strengthens guideline committee review",
  },
  {
    from: "guideline_body",
    to: "community_specialist",
    strength: 0.45,
    condition: "positive",
    direction: "amplify",
    label: "Guideline inclusion is the primary trigger for community specialist adoption",
  },
  {
    from: "guideline_body",
    to: "inpatient_prescriber",
    strength: 0.50,
    condition: "positive",
    direction: "amplify",
    label: "Guideline endorsement drives P&T committee formulary acceptance",
  },
  {
    from: "payer",
    to: "community_specialist",
    strength: 0.40,
    condition: "negative",
    direction: "dampen",
    label: "Payer access restrictions slow community specialist prescribing",
  },
  {
    from: "payer",
    to: "inpatient_prescriber",
    strength: 0.55,
    condition: "negative",
    direction: "dampen",
    label: "Formulary barriers create significant obstacles for hospital prescribers",
  },
  {
    from: "competitor",
    to: "commercial_msl",
    strength: 0.30,
    condition: "positive",
    direction: "dampen",
    label: "Active competitor counter-messaging reduces field force HCP reach",
  },
  {
    from: "commercial_msl",
    to: "community_specialist",
    strength: 0.25,
    condition: "positive",
    direction: "amplify",
    label: "Strong field engagement accelerates community specialist awareness and trial",
  },
];

// Signal-agent weight matrix
// How much each signal type moves each agent (0 = no effect, 1 = full effect)
export const SIGNAL_AGENT_WEIGHTS: Record<SignalTypeKey, Record<AgentId, number>> = {
  "Phase III clinical": {
    academic_specialist: 1.00,
    community_specialist: 0.60,
    inpatient_prescriber: 0.65,
    payer: 0.55,
    guideline_body: 0.95,
    competitor: 0.80,
    commercial_msl: 0.55,
  },
  "Guideline inclusion": {
    academic_specialist: 0.75,
    community_specialist: 0.85,
    inpatient_prescriber: 0.90,
    payer: 0.60,
    guideline_body: 1.00,
    competitor: 0.50,
    commercial_msl: 0.65,
  },
  "KOL endorsement": {
    academic_specialist: 0.50,
    community_specialist: 0.90,
    inpatient_prescriber: 0.55,
    payer: 0.20,
    guideline_body: 0.45,
    competitor: 0.35,
    commercial_msl: 0.80,
  },
  "Field intelligence": {
    academic_specialist: 0.25,
    community_specialist: 0.65,
    inpatient_prescriber: 0.50,
    payer: 0.30,
    guideline_body: 0.20,
    competitor: 0.45,
    commercial_msl: 0.90,
  },
  "Operational friction": {
    academic_specialist: 0.20,
    community_specialist: 0.55,
    inpatient_prescriber: 0.85,
    payer: 0.45,
    guideline_body: 0.35,
    competitor: 0.30,
    commercial_msl: 0.75,
  },
  "Competitor counteraction": {
    academic_specialist: 0.40,
    community_specialist: 0.50,
    inpatient_prescriber: 0.45,
    payer: 0.35,
    guideline_body: 0.30,
    competitor: 1.00,
    commercial_msl: 0.65,
  },
  "Access / commercial": {
    academic_specialist: 0.25,
    community_specialist: 0.75,
    inpatient_prescriber: 0.80,
    payer: 1.00,
    guideline_body: 0.40,
    competitor: 0.20,
    commercial_msl: 0.70,
  },
  "Regulatory / clinical": {
    academic_specialist: 0.60,
    community_specialist: 0.45,
    inpatient_prescriber: 0.65,
    payer: 0.80,
    guideline_body: 0.90,
    competitor: 0.25,
    commercial_msl: 0.40,
  },
};
