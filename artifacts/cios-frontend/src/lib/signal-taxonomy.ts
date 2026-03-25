export type CoreSignalType =
  | "GUIDELINE_INCLUSION"
  | "COMPETITOR_COUNTERMOVE"
  | "REGULATORY_CLINICAL"
  | "PHASE_III_CLINICAL"
  | "KOL_ENDORSEMENT"
  | "OPERATIONAL_FRICTION"
  | "ACCESS_COMMERCIAL"
  | "PAYER_ACCESS"
  | "MARKET_ADOPTION"
  | "CAPACITY_INFRASTRUCTURE";

export type PayerAccessSubtype =
  | "coverage_decision"
  | "formulary_tier"
  | "step_therapy"
  | "prior_authorization"
  | "contracting_rebate"
  | "reimbursement_rate"
  | "network_inclusion";

export type MarketAdoptionSubtype =
  | "prescribing_velocity"
  | "referral_behavior"
  | "site_activation_rate"
  | "procedure_volume"
  | "early_utilization_trend"
  | "persistency_dropoff"
  | "specialty_ownership";

export type CapacityInfrastructureSubtype =
  | "site_readiness"
  | "staffing_capacity"
  | "training_completion"
  | "equipment_availability"
  | "workflow_complexity"
  | "scheduling_backlog"
  | "distribution_readiness";

export type ExistingSubtype =
  | "guideline_update"
  | "competitor_launch"
  | "competitor_data_release"
  | "regulatory_sentiment"
  | "clinical_readout"
  | "phase3_endpoint_strength"
  | "phase3_safety_profile"
  | "kol_quote"
  | "kol_event_activity"
  | "ops_delay"
  | "ops_execution"
  | "access_restriction"
  | "commercial_push";

export type SignalSubtype =
  | ExistingSubtype
  | PayerAccessSubtype
  | MarketAdoptionSubtype
  | CapacityInfrastructureSubtype;

export interface SignalTypeMeta {
  type: CoreSignalType;
  label: string;
  shortLabel: string;
  group: "evidence" | "market" | "execution";
  description: string;
  subtypes: Array<{
    value: SignalSubtype;
    label: string;
    description: string;
  }>;
}

export const SIGNAL_TYPE_META: Record<CoreSignalType, SignalTypeMeta> = {
  GUIDELINE_INCLUSION: {
    type: "GUIDELINE_INCLUSION",
    label: "Guideline inclusion",
    shortLabel: "Guideline",
    group: "evidence",
    description: "Signals related to guideline inclusion likelihood or guideline support strength.",
    subtypes: [
      {
        value: "guideline_update",
        label: "Guideline update",
        description: "Society or consensus guideline movement relevant to the forecast.",
      },
    ],
  },

  COMPETITOR_COUNTERMOVE: {
    type: "COMPETITOR_COUNTERMOVE",
    label: "Competitor countermove",
    shortLabel: "Competitor",
    group: "market",
    description: "Signals indicating likely or actual competitor responses that could alter market dynamics.",
    subtypes: [
      {
        value: "competitor_launch",
        label: "Competitor launch",
        description: "A competitor entering or expanding in the same market window.",
      },
      {
        value: "competitor_data_release",
        label: "Competitor data release",
        description: "A competitor readout, publication, or evidence release affecting adoption.",
      },
    ],
  },

  REGULATORY_CLINICAL: {
    type: "REGULATORY_CLINICAL",
    label: "Regulatory / clinical",
    shortLabel: "Reg / Clinical",
    group: "evidence",
    description: "Regulatory and clinical interpretation signals outside explicit Phase III outcome structure.",
    subtypes: [
      {
        value: "regulatory_sentiment",
        label: "Regulatory sentiment",
        description: "Signals related to agency posture, reviewer caution, or clinical interpretability.",
      },
      {
        value: "clinical_readout",
        label: "Clinical readout",
        description: "Signals from relevant readouts, subgroup findings, or interpreted clinical implications.",
      },
    ],
  },

  PHASE_III_CLINICAL: {
    type: "PHASE_III_CLINICAL",
    label: "Phase III clinical",
    shortLabel: "Phase III",
    group: "evidence",
    description: "Phase III efficacy and safety signals with direct relevance to the forecast.",
    subtypes: [
      {
        value: "phase3_endpoint_strength",
        label: "Phase III endpoint strength",
        description: "Primary/secondary endpoint signal strength and effect quality.",
      },
      {
        value: "phase3_safety_profile",
        label: "Phase III safety profile",
        description: "Safety/tolerability profile implications from the pivotal dataset.",
      },
    ],
  },

  KOL_ENDORSEMENT: {
    type: "KOL_ENDORSEMENT",
    label: "KOL endorsement",
    shortLabel: "KOL",
    group: "market",
    description: "Signals from influential physicians, congress activity, and peer-shaping clinical voices.",
    subtypes: [
      {
        value: "kol_quote",
        label: "KOL quote",
        description: "Explicit KOL support, skepticism, or public commentary.",
      },
      {
        value: "kol_event_activity",
        label: "KOL event activity",
        description: "Congress, webinar, advisory, or educational activity shaping perception.",
      },
    ],
  },

  OPERATIONAL_FRICTION: {
    type: "OPERATIONAL_FRICTION",
    label: "Operational friction",
    shortLabel: "Operational",
    group: "execution",
    description: "Execution barriers that impair launch readiness or scaling.",
    subtypes: [
      {
        value: "ops_delay",
        label: "Operational delay",
        description: "Delays in training, deployment, process execution, or launch readiness.",
      },
      {
        value: "ops_execution",
        label: "Operational execution",
        description: "Signal that field, launch, or implementation operations are strong or weak.",
      },
    ],
  },

  ACCESS_COMMERCIAL: {
    type: "ACCESS_COMMERCIAL",
    label: "Access / commercial",
    shortLabel: "Access",
    group: "market",
    description: "Commercial traction or access-related signals not explicitly attributable to payer policy.",
    subtypes: [
      {
        value: "access_restriction",
        label: "Access restriction",
        description: "Broad access friction not specifically categorized as payer policy.",
      },
      {
        value: "commercial_push",
        label: "Commercial push",
        description: "Commercial investment, field intensity, or launch support effort.",
      },
    ],
  },

  PAYER_ACCESS: {
    type: "PAYER_ACCESS",
    label: "Payer / coverage",
    shortLabel: "Payer",
    group: "market",
    description:
      "Signals that determine practical reimbursement access, coverage timing, and treatment affordability at scale.",
    subtypes: [
      {
        value: "coverage_decision",
        label: "Coverage decision",
        description: "Whether the product is covered and how fast that coverage is granted.",
      },
      {
        value: "formulary_tier",
        label: "Formulary tier",
        description: "Tier placement and relative reimbursement favorability.",
      },
      {
        value: "step_therapy",
        label: "Step therapy",
        description: "Required prior treatment progression before access is granted.",
      },
      {
        value: "prior_authorization",
        label: "Prior authorization",
        description: "Administrative burden and approval constraints before treatment access.",
      },
      {
        value: "contracting_rebate",
        label: "Contracting / rebate",
        description: "Payer contracting dynamics, rebate positioning, and access leverage.",
      },
      {
        value: "reimbursement_rate",
        label: "Reimbursement rate",
        description: "Financial attractiveness or viability after reimbursement rules are applied.",
      },
      {
        value: "network_inclusion",
        label: "Network inclusion",
        description: "Whether provider or patient networks are included in reimbursable pathways.",
      },
    ],
  },

  MARKET_ADOPTION: {
    type: "MARKET_ADOPTION",
    label: "Market adoption / utilization",
    shortLabel: "Adoption",
    group: "market",
    description:
      "Signals that indicate whether clinicians and systems are actually converting awareness and access into use.",
    subtypes: [
      {
        value: "prescribing_velocity",
        label: "Prescribing velocity",
        description: "Speed and consistency of prescription uptake over time.",
      },
      {
        value: "referral_behavior",
        label: "Referral behavior",
        description: "Changes in referral willingness or referral-pathway activation.",
      },
      {
        value: "site_activation_rate",
        label: "Site activation rate",
        description: "Speed at which accounts, centers, or practices become active.",
      },
      {
        value: "procedure_volume",
        label: "Procedure volume",
        description: "Observed procedure throughput relevant to adoption.",
      },
      {
        value: "early_utilization_trend",
        label: "Early utilization trend",
        description: "Initial market use pattern after launch or enabling event.",
      },
      {
        value: "persistency_dropoff",
        label: "Persistency / drop-off",
        description: "Sustainability of initial use versus early abandonment or plateau.",
      },
      {
        value: "specialty_ownership",
        label: "Specialty ownership",
        description: "Which specialty controls, champions, or resists product adoption.",
      },
    ],
  },

  CAPACITY_INFRASTRUCTURE: {
    type: "CAPACITY_INFRASTRUCTURE",
    label: "Capacity / infrastructure",
    shortLabel: "Capacity",
    group: "execution",
    description:
      "Signals that determine whether the system can operationally deliver therapy even if interest and access exist.",
    subtypes: [
      {
        value: "site_readiness",
        label: "Site readiness",
        description: "Whether sites/accounts are operationally ready to offer the therapy.",
      },
      {
        value: "staffing_capacity",
        label: "Staffing capacity",
        description: "Whether staff availability limits throughput or scale.",
      },
      {
        value: "training_completion",
        label: "Training completion",
        description: "Completion and quality of training required to deploy or use therapy correctly.",
      },
      {
        value: "equipment_availability",
        label: "Equipment availability",
        description: "Whether required tools, devices, or support assets are physically available.",
      },
      {
        value: "workflow_complexity",
        label: "Workflow complexity",
        description: "Process burden, time burden, or coordination difficulty impeding execution.",
      },
      {
        value: "scheduling_backlog",
        label: "Scheduling backlog",
        description: "Queue, backlog, or appointment constraints limiting real throughput.",
      },
      {
        value: "distribution_readiness",
        label: "Distribution readiness",
        description: "Distribution or logistical readiness to support use at the point of care.",
      },
    ],
  },
};

export const SIGNAL_TYPE_ORDER: CoreSignalType[] = [
  "GUIDELINE_INCLUSION",
  "COMPETITOR_COUNTERMOVE",
  "REGULATORY_CLINICAL",
  "PHASE_III_CLINICAL",
  "KOL_ENDORSEMENT",
  "OPERATIONAL_FRICTION",
  "ACCESS_COMMERCIAL",
  "PAYER_ACCESS",
  "MARKET_ADOPTION",
  "CAPACITY_INFRASTRUCTURE",
];

export const NEW_LAYER_TYPES: CoreSignalType[] = [
  "PAYER_ACCESS",
  "MARKET_ADOPTION",
  "CAPACITY_INFRASTRUCTURE",
];

export function getSignalTypeLabel(type: CoreSignalType): string {
  return SIGNAL_TYPE_META[type]?.label ?? type;
}

export function getSignalShortLabel(type: CoreSignalType): string {
  return SIGNAL_TYPE_META[type]?.shortLabel ?? type;
}

export function getSubtypesForType(type: CoreSignalType) {
  return SIGNAL_TYPE_META[type]?.subtypes ?? [];
}

export function isNewLayerType(type: CoreSignalType): boolean {
  return NEW_LAYER_TYPES.includes(type);
}

const LEGACY_TO_CORE: Record<string, CoreSignalType> = {
  "Guideline inclusion": "GUIDELINE_INCLUSION",
  "Competitor counteraction": "COMPETITOR_COUNTERMOVE",
  "Competitor countermove": "COMPETITOR_COUNTERMOVE",
  "Regulatory / clinical": "REGULATORY_CLINICAL",
  "Phase III clinical": "PHASE_III_CLINICAL",
  "KOL endorsement": "KOL_ENDORSEMENT",
  "Operational friction": "OPERATIONAL_FRICTION",
  "Access / commercial": "ACCESS_COMMERCIAL",
  "Payer / coverage": "PAYER_ACCESS",
  "Market adoption / utilization": "MARKET_ADOPTION",
  "Capacity / infrastructure": "CAPACITY_INFRASTRUCTURE",
  "Field intelligence": "MARKET_ADOPTION",
};

export function resolveLegacyType(raw: string): CoreSignalType | null {
  if (SIGNAL_TYPE_META[raw as CoreSignalType]) return raw as CoreSignalType;
  return LEGACY_TO_CORE[raw] ?? null;
}

export function resolveSignalLabel(raw: string): string {
  const core = resolveLegacyType(raw);
  if (core) return SIGNAL_TYPE_META[core].label;
  return raw;
}
