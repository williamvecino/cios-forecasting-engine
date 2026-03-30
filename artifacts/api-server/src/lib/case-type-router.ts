export type DecisionType =
  | "ClinicalOutcome"
  | "RegulatoryApproval"
  | "Reimbursement"
  | "Adoption"
  | "CompetitiveDefense"
  | "LifecycleManagement"
  | "MarketShaping"
  | "SafetyRisk";

export type ResponseMode =
  | "TrialStrategy"
  | "RegulatoryStrategy"
  | "AccessStrategy"
  | "LaunchStrategy"
  | "DefenseStrategy"
  | "LifecycleStrategy"
  | "ShapingStrategy"
  | "SafetyStrategy";

export interface CaseTypeProfile {
  caseType: string;
  decisionType: DecisionType;
  responseMode: ResponseMode;
  label: string;
  stepNames: {
    judge: string;
    decide: string;
    respond: string;
    simulate: string;
  };
  allowedVocabulary: string[];
  disallowedVocabulary: string[];
  vocabularyReplacements: Record<string, string>;
  actorSegments: ActorSegment[];
  visibleModules: string[];
  hiddenModules: string[];
  driverCategories: string[];
  riskFraming: string;
  successMeasureTypes: string[];
  actionConstraints: string[];
  evidenceGateOrder?: string[];
  outcomeStates?: string[];
  simulationEligibility?: string;
  signalWeightModifiers?: Record<string, number>;
  directionValidation?: {
    restrictionOutcome: boolean;
    invertedCategories?: Record<string, string>;
  };
  feasibilityInterpretation?: string;
}

export interface ActorSegment {
  segmentType: string;
  segmentName: string;
  description: string;
  baseModifier: number;
  signalWeights: Record<string, number>;
  relevanceTiming: string;
  activationCondition?: string;
  reactionTrigger?: string;
}

type RegulatoryAuthority = "fda" | "ema" | "mhra" | "pmda" | "generic";

const FDA_REGULATORY_ACTORS: ActorSegment[] = [
  {
    segmentType: "fda_review_division",
    segmentName: "FDA Review Division",
    description: "Primary regulatory review team evaluating benefit-risk balance, clinical evidence package, and label scope.",
    baseModifier: 1.0,
    signalWeights: { clinical: 0.9, safety: 0.9, regulatory: 1.0, evidence: 0.8 },
    relevanceTiming: "pre-decision",
    activationCondition: "Activated when clinical data package is submitted or under active review.",
  },
  {
    segmentType: "advisory_committee",
    segmentName: "Advisory Committee Members",
    description: "External expert panel providing recommendations on approvability, risk management, and label conditions.",
    baseModifier: 0.9,
    signalWeights: { clinical: 0.9, safety: 0.95, expert: 0.8, evidence: 0.85 },
    relevanceTiming: "pre-decision",
    activationCondition: "Activated only when advisory committee meeting is scheduled or convened.",
  },
  {
    segmentType: "regulatory_clinical_team",
    segmentName: "Sponsor Regulatory & Clinical Team",
    description: "Company regulatory affairs and clinical development team managing submission, responses, and risk mitigation.",
    baseModifier: 1.1,
    signalWeights: { regulatory: 0.9, clinical: 0.8, safety: 0.7, evidence: 0.75 },
    relevanceTiming: "pre-decision",
    activationCondition: "Always active when a regulatory case is open.",
  },
  {
    segmentType: "safety_reviewers",
    segmentName: "Safety Reviewers",
    description: "FDA pharmacovigilance and safety evaluation specialists assessing risk signals, REMS requirements, and post-marketing obligations.",
    baseModifier: 0.7,
    signalWeights: { safety: 1.0, clinical: 0.6, regulatory: 0.7 },
    relevanceTiming: "pre-decision",
    activationCondition: "Activated when safety signal is flagged or REMS evaluation is triggered.",
  },
  {
    segmentType: "patient_advocacy",
    segmentName: "Patient Advocacy Groups",
    description: "Patient organizations influencing advisory sentiment, public testimony, and benefit-risk framing. Classified as influence factor, not primary driver.",
    baseModifier: 0.8,
    signalWeights: { patient: 0.9, advocacy: 0.9, safety: 0.5, clinical: 0.4 },
    relevanceTiming: "pre-approval",
    activationCondition: "Activated when public hearing or advisory committee testimony is scheduled.",
  },
];

const EMA_REGULATORY_ACTORS: ActorSegment[] = [
  {
    segmentType: "ema_rapporteur",
    segmentName: "EMA Rapporteur / CHMP",
    description: "Primary assessment team within the Committee for Medicinal Products for Human Use evaluating benefit-risk, clinical evidence, and marketing authorization scope.",
    baseModifier: 1.0,
    signalWeights: { clinical: 0.9, safety: 0.9, regulatory: 1.0, evidence: 0.8 },
    relevanceTiming: "pre-decision",
    activationCondition: "Activated when marketing authorization application is submitted or under assessment.",
  },
  {
    segmentType: "chmp_members",
    segmentName: "CHMP Members",
    description: "Committee members voting on marketing authorization recommendation based on scientific assessment and benefit-risk evaluation.",
    baseModifier: 0.9,
    signalWeights: { clinical: 0.9, safety: 0.95, expert: 0.8, evidence: 0.85 },
    relevanceTiming: "pre-decision",
    activationCondition: "Activated when CHMP opinion phase is reached.",
  },
  {
    segmentType: "prac",
    segmentName: "PRAC (Pharmacovigilance)",
    description: "Pharmacovigilance Risk Assessment Committee evaluating safety signals, risk management plans, and post-authorization safety requirements.",
    baseModifier: 0.7,
    signalWeights: { safety: 1.0, clinical: 0.6, regulatory: 0.7 },
    relevanceTiming: "pre-decision",
    activationCondition: "Activated when safety signal is flagged or risk management plan review is triggered.",
  },
  {
    segmentType: "marketing_auth_holder",
    segmentName: "Marketing Authorization Holder",
    description: "Sponsor organization managing the marketing authorization application, responding to CHMP questions, and preparing risk management plans.",
    baseModifier: 1.1,
    signalWeights: { regulatory: 0.9, clinical: 0.8, safety: 0.7, evidence: 0.75 },
    relevanceTiming: "pre-decision",
    activationCondition: "Always active when a regulatory case is open.",
  },
  {
    segmentType: "patient_advocacy",
    segmentName: "Patient Advocacy Groups",
    description: "Patient organizations influencing EMA scientific advice, public hearings, and benefit-risk framing. Classified as influence factor, not primary driver.",
    baseModifier: 0.8,
    signalWeights: { patient: 0.9, advocacy: 0.9, safety: 0.5, clinical: 0.4 },
    relevanceTiming: "pre-approval",
    activationCondition: "Activated when public hearing or stakeholder consultation is scheduled.",
  },
];

const REGULATORY_ACTORS = FDA_REGULATORY_ACTORS;

export function detectRegulatoryAuthority(question: string): RegulatoryAuthority {
  const q = question.toLowerCase();
  if (q.includes("ema") || q.includes("european") || q.includes("chmp") || q.includes("prac") || q.includes("marketing authoriz") || q.includes("eu ")) return "ema";
  if (q.includes("mhra") || q.includes("uk regulator")) return "mhra";
  if (q.includes("pmda") || q.includes("japan")) return "pmda";
  if (q.includes("fda") || q.includes("pdufa") || q.includes("advisory committee")) return "fda";
  return "generic";
}

export function getRegulatoryActors(question: string): ActorSegment[] {
  const authority = detectRegulatoryAuthority(question);
  if (authority === "ema" || authority === "mhra") return EMA_REGULATORY_ACTORS;
  return FDA_REGULATORY_ACTORS;
}

const COMMERCIAL_ACTORS: ActorSegment[] = [
  {
    segmentType: "kol_academic",
    segmentName: "Academic KOLs",
    description: "Academic key opinion leaders who influence treatment guidelines and peer prescribing.",
    baseModifier: 1.15,
    signalWeights: { phase: 0.9, clinical: 0.85, expert: 0.8, guideline: 0.7, mechanism: 0.6, evidence: 0.9 },
    relevanceTiming: "launch",
    activationCondition: "Activated when Phase III data is published or guideline review is initiated.",
  },
  {
    segmentType: "community_high",
    segmentName: "Community High Adopters",
    description: "Community practitioners who adopt guideline-endorsed treatments quickly.",
    baseModifier: 1.05,
    signalWeights: { guideline: 0.9, clinical: 0.7, payer: 0.8, "real-world": 0.6 },
    relevanceTiming: "launch",
    activationCondition: "Activated after guideline endorsement or broad payer coverage is achieved.",
  },
  {
    segmentType: "community_cautious",
    segmentName: "Community Cautious Adopters",
    description: "Cautious community prescribers who require strong real-world evidence and safety data.",
    baseModifier: 0.75,
    signalWeights: { "real-world": 0.9, safety: 0.85, guideline: 0.7, payer: 0.6, workflow: 0.5 },
    relevanceTiming: "post-launch",
    activationCondition: "Activated after real-world evidence accumulates and safety profile is confirmed.",
  },
  {
    segmentType: "access_constrained",
    segmentName: "Access-Constrained Accounts",
    description: "Accounts with significant payer/formulary barriers that constrain prescribing decisions.",
    baseModifier: 0.55,
    signalWeights: { payer: 0.95, access: 0.9, reimbursement: 0.85, formulary: 0.8, cost: 0.7 },
    relevanceTiming: "post-launch",
    activationCondition: "Activated when formulary decisions are pending or prior authorization is required.",
  },
  {
    segmentType: "workflow_sensitive",
    segmentName: "Workflow-Sensitive Clinicians",
    description: "Clinicians whose prescribing is heavily influenced by administration complexity and operational logistics.",
    baseModifier: 0.65,
    signalWeights: { workflow: 0.95, operational: 0.85, administration: 0.8, logistics: 0.6 },
    relevanceTiming: "post-launch",
    activationCondition: "Activated when operational workflow integration is assessed or site readiness is evaluated.",
  },
  {
    segmentType: "guideline_led",
    segmentName: "Guideline-Led Adopters",
    description: "Prescribers who follow guidelines strictly and won't adopt until guideline endorsement.",
    baseModifier: 0.85,
    signalWeights: { guideline: 0.95, consensus: 0.8, evidence: 0.85, clinical: 0.7 },
    relevanceTiming: "post-guideline",
    activationCondition: "Activated after guideline committee review or consensus recommendation is issued.",
  },
  {
    segmentType: "economics_sensitive",
    segmentName: "Economics-Sensitive Decision-Makers",
    description: "Decision-makers driven primarily by cost-effectiveness and budget impact.",
    baseModifier: 0.70,
    signalWeights: { cost: 0.95, budget: 0.85, economic: 0.9, value: 0.8, payer: 0.7 },
    relevanceTiming: "post-launch",
    activationCondition: "Activated when health economics data or budget impact analysis is available.",
  },
  {
    segmentType: "competitive_defender",
    segmentName: "Competitive Incumbency Defenders",
    description: "Prescribers loyal to existing treatments with high switching costs.",
    baseModifier: 0.45,
    signalWeights: { competitive: 0.95, "market share": 0.8, switching: 0.85, incumbent: 0.9 },
    relevanceTiming: "post-launch",
    activationCondition: "Activated when head-to-head data is available or competitive displacement is attempted.",
  },
  {
    segmentType: "risk_gatekeeper",
    segmentName: "Risk Gatekeepers",
    description: "Institutional risk officers, P&T committee members, and compliance stakeholders who evaluate safety, liability, and institutional risk before granting formulary or protocol access. Their approval is a prerequisite for broader adoption.",
    baseModifier: 0.50,
    signalWeights: { safety: 0.95, regulatory: 0.8, compliance: 0.9, liability: 0.85, evidence: 0.7, "risk-management": 0.9 },
    relevanceTiming: "pre-launch",
    activationCondition: "Activated when institutional review, P&T committee evaluation, or risk assessment is triggered.",
  },
];

const CLINICAL_OUTCOME_ACTORS: ActorSegment[] = [
  {
    segmentType: "trial_investigators",
    segmentName: "Trial Investigators",
    description: "Principal investigators and clinical site teams running the trial, responsible for enrollment, protocol adherence, and endpoint measurement.",
    baseModifier: 1.0,
    signalWeights: { clinical: 1.0, safety: 0.8, evidence: 0.9, regulatory: 0.5 },
    relevanceTiming: "pre-readout",
    activationCondition: "Always active when a clinical outcome case is open.",
  },
  {
    segmentType: "data_safety_board",
    segmentName: "Data Safety Monitoring Board",
    description: "Independent committee monitoring safety and efficacy data, with authority to recommend trial modification or termination.",
    baseModifier: 0.85,
    signalWeights: { safety: 1.0, clinical: 0.9, evidence: 0.8 },
    relevanceTiming: "pre-readout",
    activationCondition: "Activated when interim analysis is scheduled or safety signal is flagged.",
  },
  {
    segmentType: "biostatistics_team",
    segmentName: "Biostatistics & Data Management",
    description: "Statistical analysis team responsible for primary endpoint analysis, multiplicity adjustments, and data integrity.",
    baseModifier: 0.95,
    signalWeights: { evidence: 1.0, clinical: 0.7, safety: 0.5 },
    relevanceTiming: "pre-readout",
    activationCondition: "Activated when data lock or primary analysis is imminent.",
  },
  {
    segmentType: "clinical_development_lead",
    segmentName: "Clinical Development Leadership",
    description: "Sponsor's clinical development team making strategic decisions about trial design, endpoint selection, and program continuation.",
    baseModifier: 1.1,
    signalWeights: { clinical: 0.9, safety: 0.7, regulatory: 0.6, evidence: 0.8 },
    relevanceTiming: "pre-readout",
    activationCondition: "Always active when a clinical outcome case is open.",
  },
  {
    segmentType: "risk_gatekeeper",
    segmentName: "Risk Gatekeepers",
    description: "Internal governance and risk committees evaluating program continuation decisions based on benefit-risk, investment, and portfolio impact.",
    baseModifier: 0.50,
    signalWeights: { safety: 0.95, regulatory: 0.8, compliance: 0.9, evidence: 0.7, "risk-management": 0.9 },
    relevanceTiming: "pre-readout",
    activationCondition: "Activated when program-level risk assessment or portfolio review is triggered.",
  },
];

const SAFETY_RISK_ACTORS: ActorSegment[] = [
  {
    segmentType: "continue_prescribing",
    segmentName: "Continue Prescribing (Risk-Benefit)",
    description: "Clinicians who continue prescribing based on established risk-benefit assessment. Require strong safety signal to change behavior. Behavior: maintain current prescribing patterns with enhanced monitoring.",
    baseModifier: 1.1,
    signalWeights: { clinical: 0.9, safety: 0.7, "real-world": 0.8, guideline: 0.6, evidence: 0.85 },
    relevanceTiming: "ongoing",
    activationCondition: "Always active in safety/risk cases — represents baseline prescribing behavior.",
    reactionTrigger: "Major guideline revision or class-level safety reclassification",
  },
  {
    segmentType: "pause_pending_clarification",
    segmentName: "Pause Pending Clarification",
    description: "Clinicians who pause new starts or reduce prescribing volume while awaiting regulatory clarification, updated guidelines, or additional safety data. Behavior: hold new prescriptions, continue existing patients with monitoring.",
    baseModifier: 0.75,
    signalWeights: { safety: 0.9, regulatory: 0.85, guideline: 0.8, clinical: 0.6, media: 0.5 },
    relevanceTiming: "signal-onset",
    activationCondition: "Activated when safety signal is flagged but regulatory/guideline position is not yet updated.",
    reactionTrigger: "Regulatory safety communication or REMS update",
  },
  {
    segmentType: "wait_for_guideline",
    segmentName: "Wait for Guideline Direction",
    description: "Clinicians who defer prescribing decisions to guideline body recommendations. Will not change behavior until authoritative guidance is issued. Behavior: follow existing guidelines until formally revised.",
    baseModifier: 0.85,
    signalWeights: { guideline: 0.95, consensus: 0.85, evidence: 0.8, clinical: 0.7, safety: 0.6 },
    relevanceTiming: "post-signal",
    activationCondition: "Activated when guideline review is pending or professional society statement is anticipated.",
    reactionTrigger: "Guideline committee convenes or professional society issues position statement",
  },
  {
    segmentType: "switch_immediately",
    segmentName: "Switch Immediately",
    description: "Clinicians who switch to alternative therapies at the first credible safety signal. High risk aversion, often in institutional settings with liability concerns. Behavior: switch to alternative anticoagulants or competitor therapies.",
    baseModifier: 0.45,
    signalWeights: { safety: 1.0, regulatory: 0.9, liability: 0.95, media: 0.7, competitive: 0.8 },
    relevanceTiming: "immediate",
    activationCondition: "Activated when any credible safety signal emerges, regardless of regulatory confirmation.",
    reactionTrigger: "Any credible safety signal, media report, or institutional risk alert",
  },
  {
    segmentType: "risk_gatekeeper",
    segmentName: "Risk Gatekeepers",
    description: "Institutional risk officers, P&T committee members, and compliance stakeholders who evaluate safety, liability, and institutional risk. Their formulary decisions and protocol changes affect all prescribers within the institution. Primary institutional actor in safety cases.",
    baseModifier: 0.50,
    signalWeights: { safety: 1.0, regulatory: 0.9, compliance: 0.95, liability: 0.9, evidence: 0.75, "risk-management": 1.0 },
    relevanceTiming: "pre-decision",
    activationCondition: "Always active in safety/risk cases — primary institutional actor.",
    reactionTrigger: "P&T committee review cycle or institutional risk assessment trigger",
  },
  {
    segmentType: "payer_reviewer",
    segmentName: "Payer Safety Reviewers",
    description: "Payer organizations reviewing coverage and formulary positioning based on safety signal severity. Behavior: impose access conditions, step therapy requirements, or prior authorization — not adoption decline.",
    baseModifier: 0.65,
    signalWeights: { safety: 0.9, regulatory: 0.85, "cost-effectiveness": 0.7, access: 0.8, evidence: 0.7 },
    relevanceTiming: "post-signal",
    activationCondition: "Activated when safety signal triggers payer policy review.",
    reactionTrigger: "Payer policy review cycle — typically 3-6 months after regulatory communication",
  },
];

const PROFILES: Record<string, CaseTypeProfile> = {
  clinical_outcome: {
    caseType: "clinical_outcome",
    decisionType: "ClinicalOutcome",
    responseMode: "TrialStrategy",
    label: "Clinical Outcome",
    stepNames: {
      judge: "Judge Endpoint Success Probability",
      decide: "Decide Trial Strategy Leverage",
      respond: "Respond with Trial Strategy",
      simulate: "Simulate Clinical Outcome Impact",
    },
    allowedVocabulary: [
      "primary endpoint", "secondary endpoint", "statistical significance",
      "clinical relevance", "p-value threshold", "hazard ratio", "effect size",
      "overall survival", "progression-free survival", "objective response rate",
      "interim analysis", "futility boundary", "multiplicity adjustment",
      "subgroup analysis", "biomarker stratification", "comparator arm",
      "active control", "placebo control", "non-inferiority margin",
      "superiority testing", "clinical benefit", "safety profile",
      "adverse events", "treatment discontinuation", "dose-response",
    ],
    disallowedVocabulary: [
      "market readiness", "adoption ceiling", "launch strategy",
      "commercial execution", "field force", "detailing", "share of voice",
      "formulary pull-through", "physician education materials",
      "prescriber engagement", "market shaping", "brand awareness",
      "competitive displacement", "payer strategy", "reimbursement",
    ],
    vocabularyReplacements: {
      "market readiness": "trial readiness",
      "adoption": "clinical outcome",
      "prescriber": "investigator",
      "market share": "endpoint achievement",
      "launch": "data readout",
      "growth feasibility": "endpoint feasibility",
    },
    actorSegments: CLINICAL_OUTCOME_ACTORS,
    visibleModules: [
      "question", "signals", "forecast", "judge", "decide", "respond", "simulate",
      "barrier-diagnosis", "competitive-risk",
    ],
    hiddenModules: [
      "growth-feasibility", "adoption-segments-commercial", "market-readiness",
    ],
    driverCategories: [
      "endpoint_design", "statistical_power", "enrollment_quality",
      "comparator_selection", "safety_profile", "protocol_adherence",
      "data_integrity", "interim_analysis", "biomarker_selection",
    ],
    riskFraming: "clinical_precedent",
    successMeasureTypes: [
      "primary endpoint met", "statistical significance achieved",
      "clinically meaningful effect size", "safety profile acceptable",
      "subgroup consistency", "regulatory-grade evidence",
    ],
    actionConstraints: [
      "trial design optimization", "enrollment strategy", "site selection",
      "protocol amendment", "interim analysis planning", "safety monitoring",
      "comparator strategy", "endpoint measurement standardization",
      "data quality assurance", "biomarker validation",
    ],
    evidenceGateOrder: [
      "statistical_validity",
      "clinical_relevance",
      "safety_acceptability",
    ],
    outcomeStates: [
      "definitive_success",
      "borderline_significance",
      "subgroup_only_success",
      "clinically_meaningful_not_significant",
      "safety_limited_success",
      "inconclusive",
      "definitive_failure",
    ],
    simulationEligibility: "Run only when external clinical interpretation or competitive data affects trajectory. Do not simulate internal/technical trial operations.",
  },
  regulatory_approval: {
    caseType: "regulatory_approval",
    decisionType: "RegulatoryApproval",
    responseMode: "RegulatoryStrategy",
    label: "Regulatory Approval",
    stepNames: {
      judge: "Judge Approval Probability",
      decide: "Decide Approval Leverage",
      respond: "Respond with Regulatory Strategy",
      simulate: "Simulate Regulatory Response",
    },
    allowedVocabulary: [
      "benefit-risk balance", "regulatory tolerance", "safety acceptability",
      "advisory uncertainty", "label constraints", "review dynamics",
      "approval path", "approval risk", "review milestones",
      "regulatory contingency", "label scope", "risk management",
      "advisory preparation", "FDA briefing", "safety protocol",
      "subgroup clarification", "submission readiness", "REMS",
      "post-marketing", "accelerated approval", "priority review",
      "breakthrough therapy", "complete response", "approvability",
    ],
    disallowedVocabulary: [
      "market readiness", "operational readiness", "adoption ceiling",
      "execution gap", "market positioning", "slow adoption",
      "future rollout", "launch strategy", "commercial execution",
      "field force", "detailing", "share of voice",
      "formulary pull-through", "patient starter kits",
      "physician education materials", "prescriber engagement",
      "market shaping", "brand awareness", "competitive displacement",
    ],
    vocabularyReplacements: {
      "market readiness": "regulatory readiness",
      "operational readiness": "submission readiness",
      "adoption ceiling": "approval constraint",
      "execution gap": "regulatory gap",
      "competitive risk": "regulatory precedent risk",
      "adoption": "approval",
      "prescriber": "reviewer",
      "market share": "approval precedent",
      "launch": "approval",
      "growth feasibility": "approval feasibility",
      "adoption reaction": "regulatory response",
    },
    actorSegments: REGULATORY_ACTORS,
    visibleModules: [
      "question", "signals", "forecast", "judge", "decide", "respond", "simulate",
      "barrier-diagnosis", "competitive-risk",
    ],
    hiddenModules: [
      "growth-feasibility", "adoption-segments-commercial", "market-readiness",
    ],
    driverCategories: [
      "clinical_evidence", "safety_profile", "regulatory_precedent",
      "advisory_committee", "benefit_risk", "label_scope",
      "review_pathway", "risk_management", "manufacturing_compliance",
    ],
    riskFraming: "regulatory_precedent",
    successMeasureTypes: [
      "advisory committee outcome", "FDA action date", "safety acceptance",
      "label scope achieved", "risk management plan acceptance",
      "post-marketing commitment scope", "review timeline adherence",
    ],
    actionConstraints: [
      "advisory preparation", "FDA briefing response", "safety protocol refinement",
      "subgroup statistical clarification", "risk mitigation submission readiness",
      "REMS development", "post-marketing study design", "label negotiation",
    ],
    evidenceGateOrder: [
      "safety_acceptability",
      "clinical_evidence_sufficiency",
      "regulatory_compliance",
    ],
  },
  launch_readiness: {
    caseType: "launch_readiness",
    decisionType: "Adoption",
    responseMode: "LaunchStrategy",
    label: "Launch Readiness",
    stepNames: {
      judge: "Judge Adoption Probability",
      decide: "Decide Priority Actions",
      respond: "Respond with Launch Strategy",
      simulate: "Simulate Adoption Reaction",
    },
    allowedVocabulary: [
      "market readiness", "operational readiness", "adoption ceiling",
      "field force", "detailing", "share of voice", "launch sequence",
      "formulary access", "channel strategy", "KOL engagement",
      "medical education", "patient support", "hub services",
    ],
    disallowedVocabulary: [],
    vocabularyReplacements: {},
    actorSegments: COMMERCIAL_ACTORS,
    visibleModules: [
      "question", "signals", "forecast", "judge", "decide", "respond", "simulate",
      "adoption-segments", "barrier-diagnosis", "readiness-timeline",
      "competitive-risk", "growth-feasibility",
    ],
    hiddenModules: [],
    driverCategories: [
      "regulatory_readiness", "field_force_deployment", "channel_access",
      "medical_education", "kol_engagement", "supply_chain",
    ],
    riskFraming: "competitive",
    successMeasureTypes: [
      "adoption rate", "market share", "prescriber reach",
      "formulary wins", "patient starts", "revenue trajectory",
    ],
    actionConstraints: [],
  },
  competitive_defense: {
    caseType: "competitive_defense",
    decisionType: "CompetitiveDefense",
    responseMode: "DefenseStrategy",
    label: "Competitive Defense",
    stepNames: {
      judge: "Judge Competitive Position",
      decide: "Decide Defense Strategy",
      respond: "Respond with Competitive Plan",
      simulate: "Simulate Competitive Response",
    },
    allowedVocabulary: [
      "competitive intelligence", "differentiation", "market share defense",
      "switching barriers", "loyalty", "contracting", "real-world evidence",
    ],
    disallowedVocabulary: [],
    vocabularyReplacements: {},
    actorSegments: COMMERCIAL_ACTORS,
    visibleModules: [
      "question", "signals", "forecast", "judge", "decide", "respond", "simulate",
      "adoption-segments", "barrier-diagnosis", "readiness-timeline",
      "competitive-risk", "growth-feasibility",
    ],
    hiddenModules: [],
    driverCategories: [
      "competitive_intelligence", "differentiation_messaging",
      "loyalty_programs", "contracting_strategy", "real_world_evidence",
    ],
    riskFraming: "competitive",
    successMeasureTypes: [
      "market share retained", "switching rate", "competitive win rate",
      "formulary position maintained", "prescriber loyalty",
    ],
    actionConstraints: [],
  },
  access_expansion: {
    caseType: "access_expansion",
    decisionType: "Reimbursement",
    responseMode: "AccessStrategy",
    label: "Access Expansion",
    stepNames: {
      judge: "Judge Access Probability",
      decide: "Decide Access Strategy",
      respond: "Respond with Access Plan",
      simulate: "Simulate Payer Response",
    },
    allowedVocabulary: [
      "payer engagement", "value dossier", "formulary",
      "coverage", "reimbursement", "contracting", "outcomes evidence",
    ],
    disallowedVocabulary: [],
    vocabularyReplacements: {},
    actorSegments: COMMERCIAL_ACTORS,
    visibleModules: [
      "question", "signals", "forecast", "judge", "decide", "respond", "simulate",
      "adoption-segments", "barrier-diagnosis", "readiness-timeline",
      "competitive-risk", "growth-feasibility",
    ],
    hiddenModules: [],
    driverCategories: [
      "payer_engagement", "value_dossier", "patient_support",
      "hub_services", "outcomes_evidence", "contracting_strategy",
    ],
    riskFraming: "access",
    successMeasureTypes: [
      "formulary wins", "coverage rate", "prior auth removal",
      "tier improvement", "patient access rate",
    ],
    actionConstraints: [],
  },
  clinical_adoption: {
    caseType: "clinical_adoption",
    decisionType: "Adoption",
    responseMode: "LaunchStrategy",
    label: "Clinical Adoption",
    stepNames: {
      judge: "Judge Adoption Probability",
      decide: "Decide Adoption Strategy",
      respond: "Respond with Adoption Plan",
      simulate: "Simulate Adoption Reaction",
    },
    allowedVocabulary: [
      "clinical evidence", "guideline positioning", "medical affairs",
      "KOL engagement", "congress strategy", "peer influence",
    ],
    disallowedVocabulary: [],
    vocabularyReplacements: {},
    actorSegments: COMMERCIAL_ACTORS,
    visibleModules: [
      "question", "signals", "forecast", "judge", "decide", "respond", "simulate",
      "adoption-segments", "barrier-diagnosis", "readiness-timeline",
      "competitive-risk", "growth-feasibility",
    ],
    hiddenModules: [],
    driverCategories: [
      "clinical_evidence", "guideline_positioning", "medical_affairs",
      "kol_engagement", "congress_strategy", "peer_influence",
    ],
    riskFraming: "competitive",
    successMeasureTypes: [
      "adoption rate", "prescriber uptake", "guideline inclusion",
      "market share growth", "patient starts",
    ],
    actionConstraints: [],
  },
  lifecycle_management: {
    caseType: "lifecycle_management",
    decisionType: "LifecycleManagement",
    responseMode: "LifecycleStrategy",
    label: "Lifecycle Management",
    stepNames: {
      judge: "Judge Outcome Probability",
      decide: "Decide Lifecycle Strategy",
      respond: "Respond with Lifecycle Plan",
      simulate: "Simulate Market Response",
    },
    allowedVocabulary: [
      "patient finding", "adherence", "digital engagement",
      "label expansion", "real-world evidence", "commercial optimization",
    ],
    disallowedVocabulary: [],
    vocabularyReplacements: {},
    actorSegments: COMMERCIAL_ACTORS,
    visibleModules: [
      "question", "signals", "forecast", "judge", "decide", "respond", "simulate",
      "adoption-segments", "barrier-diagnosis", "readiness-timeline",
      "competitive-risk", "growth-feasibility",
    ],
    hiddenModules: [],
    driverCategories: [
      "patient_finding", "adherence_programs", "digital_engagement",
      "label_expansion", "real_world_evidence", "commercial_optimization",
    ],
    riskFraming: "competitive",
    successMeasureTypes: [
      "patient retention", "adherence rate", "label expansion achieved",
      "market share sustained", "revenue maintained",
    ],
    actionConstraints: [],
  },
  market_shaping: {
    caseType: "market_shaping",
    decisionType: "MarketShaping",
    responseMode: "ShapingStrategy",
    label: "Market Shaping",
    stepNames: {
      judge: "Judge Shaping Success Probability",
      decide: "Decide Market Shaping Strategy",
      respond: "Respond with Shaping Plan",
      simulate: "Simulate Market Shaping Response",
    },
    allowedVocabulary: [
      "disease education", "diagnostic pathway", "referral network",
      "patient advocacy", "epidemiology", "market research",
    ],
    disallowedVocabulary: [],
    vocabularyReplacements: {},
    actorSegments: COMMERCIAL_ACTORS,
    visibleModules: [
      "question", "signals", "forecast", "judge", "decide", "respond", "simulate",
      "adoption-segments", "barrier-diagnosis", "readiness-timeline",
      "competitive-risk", "growth-feasibility",
    ],
    hiddenModules: [],
    driverCategories: [
      "disease_education", "diagnostic_pathway", "referral_network",
      "patient_advocacy", "epidemiology", "market_research",
    ],
    riskFraming: "competitive",
    successMeasureTypes: [
      "disease awareness", "diagnostic rate", "referral volume",
      "patient identification", "market preparation",
    ],
    actionConstraints: [],
  },
  investment_portfolio: {
    caseType: "investment_portfolio",
    decisionType: "Adoption" as DecisionType,
    responseMode: "LaunchStrategy" as ResponseMode,
    label: "Investment / Portfolio Decision",
    stepNames: {
      judge: "Judge Investment Viability",
      decide: "Decide Portfolio Action",
      respond: "Respond with Investment Recommendation",
      simulate: "Simulate Portfolio Impact",
    },
    allowedVocabulary: [
      "probability of technical success", "market opportunity", "development cost",
      "expected return", "strategic fit", "portfolio priority", "risk tolerance",
      "capital allocation", "go/no-go", "stage gate", "asset valuation",
    ],
    disallowedVocabulary: [
      "adoption rate", "prescriber engagement", "market share", "formulary",
      "field force", "detailing", "launch strategy",
    ],
    vocabularyReplacements: {
      "adoption": "investment viability",
      "market share": "commercial opportunity",
      "prescriber": "development stakeholder",
      "launch": "development milestone",
    },
    actorSegments: COMMERCIAL_ACTORS,
    visibleModules: [
      "question", "signals", "forecast", "judge", "decide", "respond", "simulate",
      "barrier-diagnosis",
    ],
    hiddenModules: [
      "adoption-segments", "readiness-timeline", "growth-feasibility",
    ],
    driverCategories: [
      "technical_success_probability", "market_size", "development_cost",
      "expected_return", "strategic_fit", "risk_tolerance",
    ],
    riskFraming: "competitive",
    successMeasureTypes: [
      "development milestone achieved", "go/no-go decision made",
      "portfolio alignment confirmed", "risk assessment completed",
    ],
    actionConstraints: [],
  },
  operational_execution: {
    caseType: "operational_execution",
    decisionType: "Adoption" as DecisionType,
    responseMode: "LaunchStrategy" as ResponseMode,
    label: "Operational Execution / Supply Risk",
    stepNames: {
      judge: "Judge Supply Continuity Risk",
      decide: "Decide Mitigation Strategy",
      respond: "Respond with Operational Plan",
      simulate: "Simulate Supply Disruption Impact",
    },
    allowedVocabulary: [
      "manufacturing continuity", "supply chain", "batch failure", "capacity",
      "inventory", "quality event", "plant shutdown", "inspection finding",
      "supplier disruption", "alternative source", "remediation",
    ],
    disallowedVocabulary: [
      "adoption rate", "prescriber engagement", "market share", "guideline",
      "field force", "clinical superiority", "KOL",
    ],
    vocabularyReplacements: {
      "adoption": "supply availability",
      "market share": "supply coverage",
      "launch": "production resumption",
    },
    actorSegments: COMMERCIAL_ACTORS,
    visibleModules: [
      "question", "signals", "forecast", "judge", "decide", "respond", "simulate",
      "barrier-diagnosis",
    ],
    hiddenModules: [
      "adoption-segments", "growth-feasibility", "competitive-risk",
    ],
    driverCategories: [
      "manufacturing_continuity", "supply_chain_resilience", "inventory_management",
      "quality_compliance", "capacity_planning",
    ],
    riskFraming: "competitive",
    successMeasureTypes: [
      "supply continuity maintained", "inventory levels adequate",
      "manufacturing capacity restored", "quality issue resolved",
    ],
    actionConstraints: [],
  },
  strategic_partnership: {
    caseType: "strategic_partnership",
    decisionType: "Adoption" as DecisionType,
    responseMode: "LaunchStrategy" as ResponseMode,
    label: "Strategic Partnership / M&A",
    stepNames: {
      judge: "Judge Deal Probability",
      decide: "Decide Strategic Position",
      respond: "Respond with Deal Assessment",
      simulate: "Simulate Deal Outcome Impact",
    },
    allowedVocabulary: [
      "acquisition", "merger", "licensing", "partnership", "valuation",
      "pipeline fit", "strategic rationale", "negotiation", "competitive bid",
      "deal structure", "due diligence", "synergy",
    ],
    disallowedVocabulary: [
      "adoption rate", "prescriber engagement", "field force", "detailing",
      "formulary", "guideline inclusion", "KOL engagement",
    ],
    vocabularyReplacements: {
      "adoption": "deal completion",
      "market share": "asset value",
      "prescriber": "deal stakeholder",
      "launch": "deal close",
    },
    actorSegments: COMMERCIAL_ACTORS,
    visibleModules: [
      "question", "signals", "forecast", "judge", "decide", "respond", "simulate",
      "barrier-diagnosis", "competitive-risk",
    ],
    hiddenModules: [
      "adoption-segments", "readiness-timeline", "growth-feasibility",
    ],
    driverCategories: [
      "valuation", "pipeline_fit", "financial_capacity",
      "negotiation_progress", "competitive_interest", "strategic_rationale",
    ],
    riskFraming: "competitive",
    successMeasureTypes: [
      "deal completed", "partnership signed", "licensing agreement executed",
      "strategic objective achieved",
    ],
    actionConstraints: [],
  },
  policy_environment: {
    caseType: "policy_environment",
    decisionType: "Adoption" as DecisionType,
    responseMode: "LaunchStrategy" as ResponseMode,
    label: "Policy / Environment Shift",
    stepNames: {
      judge: "Judge Policy Change Probability",
      decide: "Decide Response Strategy",
      respond: "Respond with Policy Assessment",
      simulate: "Simulate Policy Impact",
    },
    allowedVocabulary: [
      "legislation", "rulemaking", "government policy", "budget action",
      "regulatory reform", "price negotiation", "reimbursement change",
      "political dynamics", "stakeholder position", "industry response",
    ],
    disallowedVocabulary: [
      "adoption rate", "prescriber engagement", "field force", "detailing",
      "manufacturing capacity", "supply chain", "KOL engagement",
    ],
    vocabularyReplacements: {
      "adoption": "policy implementation",
      "market share": "policy impact scope",
      "prescriber": "policy stakeholder",
      "launch": "policy effective date",
    },
    actorSegments: COMMERCIAL_ACTORS,
    visibleModules: [
      "question", "signals", "forecast", "judge", "decide", "respond", "simulate",
      "barrier-diagnosis",
    ],
    hiddenModules: [
      "adoption-segments", "readiness-timeline", "growth-feasibility",
    ],
    driverCategories: [
      "legislation", "rulemaking", "government_policy",
      "budget_constraints", "political_pressure", "regulatory_reform",
    ],
    riskFraming: "competitive",
    successMeasureTypes: [
      "policy enacted", "regulation finalized", "budget allocation confirmed",
      "environment shift confirmed",
    ],
    actionConstraints: [],
  },
  safety_risk: {
    caseType: "safety_risk",
    decisionType: "SafetyRisk",
    responseMode: "SafetyStrategy",
    label: "Safety / Risk Response",
    stepNames: {
      judge: "Judge Restriction Probability",
      decide: "Decide Risk Mitigation Strategy",
      respond: "Respond with Safety Action Plan",
      simulate: "Simulate Stakeholder Risk Response",
    },
    allowedVocabulary: [
      "safety signal", "adverse event", "benefit-risk", "risk management",
      "REMS", "black box warning", "label update", "safety communication",
      "pharmacovigilance", "post-marketing", "restriction", "regulatory action",
      "risk mitigation", "safety review", "signal detection", "causality assessment",
      "use", "continuation", "discontinuation", "switching",
      "risk-benefit assessment", "safety monitoring", "clinical practice change",
      "guideline revision", "access conditions", "prescribing restrictions",
    ],
    disallowedVocabulary: [
      "adoption ceiling", "adoption rate", "growth feasibility",
      "market readiness", "launch strategy", "commercial execution",
      "field force", "detailing", "share of voice",
      "formulary pull-through", "patient starter kits",
      "physician education materials", "prescriber engagement",
      "market shaping", "brand awareness", "competitive displacement",
    ],
    vocabularyReplacements: {
      "adoption": "use",
      "adoption rate": "continuation rate",
      "adoption ceiling": "use constraint",
      "growth": "continuation",
      "growth feasibility": "continuation feasibility",
      "prescriber": "clinician",
      "market share": "prescribing share",
      "launch": "response",
      "adoption reaction": "risk response",
      "market readiness": "risk readiness",
      "decreases probability of regulatory restriction": "reduces likelihood of restrictions",
      "increases probability of regulatory restriction": "increases likelihood of restrictions",
    },
    actorSegments: SAFETY_RISK_ACTORS,
    visibleModules: [
      "question", "signals", "forecast", "judge", "decide", "respond", "simulate",
      "barrier-diagnosis", "competitive-risk", "adoption-segments",
    ],
    hiddenModules: [
      "growth-feasibility", "adoption-segments-commercial", "market-readiness",
      "readiness-timeline",
    ],
    driverCategories: [
      "safety_signal_severity", "regulatory_response", "clinical_evidence",
      "guideline_impact", "liability_exposure", "competitive_alternative",
      "payer_policy_change", "media_sentiment", "real_world_evidence",
    ],
    riskFraming: "safety_precedent",
    successMeasureTypes: [
      "switch rate monitoring", "adverse event reporting trends",
      "media sentiment trajectory", "prescribing pattern change",
      "guideline revision status", "regulatory action timeline",
      "risk mitigation plan acceptance", "continuation rate",
    ],
    actionConstraints: [
      "safety communication strategy", "risk mitigation plan development",
      "REMS preparation", "guideline engagement", "pharmacovigilance enhancement",
      "clinician education on risk-benefit", "payer safety dossier",
      "label update preparation", "post-marketing study design",
      "institutional risk protocol update",
    ],
    evidenceGateOrder: [
      "safety_signal_confirmation",
      "regulatory_review_status",
      "clinical_evidence_assessment",
    ],
    outcomeStates: [
      "no_action_required",
      "enhanced_monitoring",
      "label_update_only",
      "prescribing_restriction",
      "rems_imposed",
      "market_withdrawal",
      "inconclusive_pending",
    ],
    simulationEligibility: "Run when external safety data, regulatory communication, or guideline revision affects the restriction trajectory. Do not simulate internal pharmacovigilance operations.",
    signalWeightModifiers: {
      "clinical_efficacy": 1.0,
      "safety_tolerability": 1.2,
      "regulatory_procedural": 1.1,
      "guideline_consensus": 1.0,
      "competitive_landscape": 0.8,
      "payer_access": 0.9,
      "operational_workflow": 0.6,
      "epidemiological": 0.9,
      "patient_reported": 0.8,
      "biomarker": 0.7,
      "real_world_evidence": 1.1,
      "media_advocacy": 0.5,
    },
    directionValidation: {
      restrictionOutcome: true,
      invertedCategories: {
        "Payer / coverage": "Positive payer signal implies access conditions, not restriction support",
        "Access / commercial": "Positive access signal reduces restriction likelihood",
        "Access friction": "Positive access signal reduces restriction likelihood",
        "PAYER_ACCESS": "Positive payer signal implies access conditions, not restriction support",
        "ACCESS_COMMERCIAL": "Positive access signal reduces restriction likelihood",
      },
    },
    feasibilityInterpretation: "Time constraints modify resolution speed (how quickly the safety question will be answered), NOT outcome probability. A 6-month timeline means the restriction decision will be made within 6 months, not that restriction becomes more likely over time.",
  },
};

const CLASSIFIER_TO_ROUTER: Record<string, string> = {
  clinical_outcome: "clinical_outcome",
  launch_readiness: "launch_readiness",
  competitive_defense: "competitive_defense",
  access_expansion: "access_expansion",
  clinical_adoption: "clinical_adoption",
  lifecycle_management: "lifecycle_management",
  market_shaping: "market_shaping",
  safety_risk: "safety_risk",
  investment_portfolio: "investment_portfolio",
  operational_execution: "operational_execution",
  strategic_partnership: "strategic_partnership",
  policy_environment: "policy_environment",
  unclassified: "clinical_adoption",
};

const CLINICAL_OUTCOME_PATTERNS = [
  "primary endpoint", "secondary endpoint", "phase iii",
  "phase 3", "clinical trial", "trial outcome",
  "endpoint success", "endpoint failure", "endpoint met",
  "overall survival", "progression-free survival",
  "hazard ratio", "p-value", "statistical significance",
  "interim analysis", "futility", "data readout",
  "topline results", "topline data", "clinical endpoint",
  "superiority", "non-inferiority", "efficacy endpoint",
  "trial results", "pivotal trial", "pivotal study",
  "objective response rate", "complete response rate",
  "durable response", "event-free survival",
];

const SAFETY_RISK_PATTERNS = [
  "safety concern", "safety signal", "safety issue", "safety risk",
  "adverse event", "adverse reaction", "adverse effect",
  "black box warning", "boxed warning", "safety warning",
  "regulatory restriction", "prescribing restriction", "use restriction",
  "rems", "risk evaluation", "risk management strategy",
  "gi bleeding", "bleeding risk", "mortality signal", "mortality risk",
  "hepatotoxicity", "cardiotoxicity", "nephrotoxicity",
  "drug safety", "pharmacovigilance", "post-marketing safety",
  "safety review", "safety evaluation", "safety assessment",
  "label change", "label update", "labeling change",
  "market withdrawal", "product recall", "product withdrawal",
  "class effect", "class-wide safety", "class warning",
  "risk-benefit", "benefit-risk reassessment",
  "safety restriction", "will safety", "safety lead to",
  "safety-driven", "safety-related restriction",
];

export function isSafetyRiskCase(question: string, caseType?: string): boolean {
  if (caseType === "safety_risk") return true;
  const q = question.toLowerCase();
  const safetyScore = SAFETY_RISK_PATTERNS.filter(p => q.includes(p)).length;
  const clinScore = CLINICAL_OUTCOME_PATTERNS.filter(p => q.includes(p)).length;
  const approvalPatterns = [
    "fda approv", "ema approv", "regulatory approv", "approval", "pdufa",
    "advisory committee", "nda", "bla",
  ];
  const regScore = approvalPatterns.filter(p => q.includes(p)).length;
  const restrictionSignal = q.includes("restriction") || q.includes("restrict") ||
    q.includes("withdrawal") || q.includes("rems") || q.includes("warning") ||
    q.includes("contraindication") || q.includes("black box") || q.includes("boxed warning");
  const impliedSafety = q.includes("black box") || q.includes("boxed warning") || q.includes("rems");
  const safetyContext = q.includes("safety") || q.includes("adverse") || q.includes("risk") ||
    q.includes("bleeding") || q.includes("toxicity") || q.includes("mortality") ||
    q.includes("pharmacovigilance") || q.includes("harm") || impliedSafety;
  if (safetyScore >= 2 && safetyScore > clinScore && safetyScore > regScore) return true;
  if (restrictionSignal && safetyContext) return true;
  if (safetyScore >= 1 && safetyContext && regScore === 0 && clinScore === 0) return true;
  return false;
}

export function isClinicalOutcomeCase(question: string, caseType?: string): boolean {
  if (caseType === "clinical_outcome") return true;
  const q = question.toLowerCase();
  const clinScore = CLINICAL_OUTCOME_PATTERNS.filter(p => q.includes(p)).length;
  const regScore = [
    "fda approv", "ema approv", "regulatory approv", "approval", "pdufa",
    "advisory committee", "nda", "bla",
  ].filter(p => q.includes(p)).length;
  const comScore = [
    "adoption", "market share", "prescriber", "formulary", "launch", "commercial",
  ].filter(p => q.includes(p)).length;
  return clinScore >= 2 && clinScore > regScore && clinScore > comScore;
}

export function isRegulatoryCase(question: string, caseType?: string): boolean {
  if (caseType === "regulatory_approval") return true;
  if (isClinicalOutcomeCase(question, caseType)) return false;
  const q = question.toLowerCase();
  const regulatoryPatterns = [
    "fda approv", "ema approv", "regulatory approv",
    "approval", "approve", "approved",
    "advisory committee", "adcom", "pdufa",
    "complete response", "crl", "nda", "bla", "sNDA",
    "breakthrough therapy", "accelerated approval",
    "priority review", "fast track",
    "regulatory decision", "regulatory outcome",
    "regulators", "regulator ",
    "european regulat", "health authority", "health authorities",
    "mhra", "pmda", "tga", "anvisa", "nmpa",
    "marketing authoriz", "market authoris",
    "chmp", "chmp opinion",
  ];
  const negativePatterns = [
    "adoption", "market share", "prescriber", "formulary",
    "launch", "commercial", "sales",
  ];
  const regScore = regulatoryPatterns.filter(p => q.includes(p)).length;
  const negScore = negativePatterns.filter(p => q.includes(p)).length;
  return regScore >= 2 && regScore > negScore;
}

export function getCaseTypeProfile(classifierType: string, question?: string): CaseTypeProfile {
  if (question && isClinicalOutcomeCase(question, classifierType)) {
    return { ...PROFILES.clinical_outcome };
  }
  if (question && isSafetyRiskCase(question, classifierType)) {
    return { ...PROFILES.safety_risk };
  }
  if (question && isRegulatoryCase(question, classifierType)) {
    const profile = { ...PROFILES.regulatory_approval };
    profile.actorSegments = getRegulatoryActors(question);
    return profile;
  }
  const routerKey = CLASSIFIER_TO_ROUTER[classifierType] || "clinical_adoption";
  return PROFILES[routerKey] || PROFILES.clinical_adoption;
}

export function getProfileForQuestion(question: string, classifierType?: string): CaseTypeProfile {
  if (isClinicalOutcomeCase(question, classifierType)) {
    return { ...PROFILES.clinical_outcome };
  }
  if (isSafetyRiskCase(question, classifierType)) {
    return { ...PROFILES.safety_risk };
  }
  if (isRegulatoryCase(question, classifierType)) {
    const profile = { ...PROFILES.regulatory_approval };
    profile.actorSegments = getRegulatoryActors(question);
    return profile;
  }
  if (classifierType) {
    const routerKey = CLASSIFIER_TO_ROUTER[classifierType] || "clinical_adoption";
    return PROFILES[routerKey] || PROFILES.clinical_adoption;
  }
  return PROFILES.clinical_adoption;
}

export function getDecisionType(profile: CaseTypeProfile): DecisionType {
  return profile.decisionType;
}

export function getResponseMode(profile: CaseTypeProfile): ResponseMode {
  return profile.responseMode;
}

export function getResponseModeLabel(mode: ResponseMode): string {
  const labels: Record<ResponseMode, string> = {
    TrialStrategy: "Trial Strategy",
    RegulatoryStrategy: "Regulatory Strategy",
    AccessStrategy: "Access Strategy",
    LaunchStrategy: "Launch Strategy",
    DefenseStrategy: "Defense Strategy",
    LifecycleStrategy: "Lifecycle Strategy",
    ShapingStrategy: "Shaping Strategy",
    SafetyStrategy: "Safety Strategy",
  };
  return labels[mode] || mode;
}

export function buildVocabularyConstraintPrompt(profile: CaseTypeProfile): string {
  let prompt = "";
  if (profile.disallowedVocabulary.length > 0) {
    prompt += `\n\nVOCABULARY CONSTRAINTS (${profile.label} case):\n`;
    prompt += `DO NOT USE these terms or concepts: ${profile.disallowedVocabulary.join(", ")}.\n`;
    prompt += `INSTEAD USE these terms: ${profile.allowedVocabulary.slice(0, 15).join(", ")}.\n`;
  }
  if (Object.keys(profile.vocabularyReplacements).length > 0) {
    prompt += `\nREPLACEMENT RULES:\n`;
    for (const [from, to] of Object.entries(profile.vocabularyReplacements)) {
      prompt += `- Replace "${from}" with "${to}"\n`;
    }
  }
  if (profile.actionConstraints.length > 0) {
    prompt += `\nALLOWED ACTION TYPES: ${profile.actionConstraints.join(", ")}.\n`;
    prompt += `Do not recommend actions outside this scope.\n`;
  }
  if (profile.successMeasureTypes.length > 0) {
    prompt += `\nSUCCESS MEASURES must be limited to: ${profile.successMeasureTypes.join(", ")}.\n`;
  }
  return prompt;
}

export function buildSegmentationConstraintPrompt(profile: CaseTypeProfile): string {
  if (profile.actorSegments.length === 0) return "";
  const actorNames = profile.actorSegments.map(a => a.segmentName);
  let prompt = `\nACTOR SEGMENTATION (${profile.label} case):\n`;
  prompt += `Use ONLY these actor segments: ${actorNames.join(", ")}.\n`;
  prompt += `Do NOT use commercial prescriber segments like "Community Neurologists", "Primary Care Physicians", "Early Adopters", "Late Movers", etc.\n`;
  for (const actor of profile.actorSegments) {
    prompt += `- ${actor.segmentName}: ${actor.description}\n`;
  }
  return prompt;
}

export function buildRiskFramingPrompt(profile: CaseTypeProfile): string {
  if (profile.riskFraming === "regulatory_precedent") {
    return `\nRISK FRAMING: Frame competitive risks as regulatory precedent risks. Use "prior class approval/rejection pattern", "mechanism-specific safety spillover", "comparative review tolerance", "precedent from similar therapies". Do NOT use "fast follower risk", "incumbent defense", "access response", or other commercial risk language.\n`;
  }
  if (profile.riskFraming === "safety_precedent") {
    return `\nRISK FRAMING (SAFETY/RISK CASE): Frame risks as safety precedent risks. Use "prior class safety action pattern", "mechanism-specific safety signal history", "regulatory response precedent for similar safety signals", "class-wide restriction pattern". Do NOT use "fast follower risk", "incumbent defense", "adoption response", "market share impact", or other commercial risk language. A payer review implies access conditions (step therapy, prior authorization), NOT adoption decline.\n`;
  }
  return "";
}

export function getStepName(profile: CaseTypeProfile, step: string): string {
  return profile.stepNames[step as keyof typeof profile.stepNames] || step;
}

export function isModuleVisible(profile: CaseTypeProfile, moduleName: string): boolean {
  if (profile.hiddenModules.includes(moduleName)) return false;
  if (profile.visibleModules.length > 0) return profile.visibleModules.includes(moduleName);
  return true;
}

export function getActorSegments(profile: CaseTypeProfile): ActorSegment[] {
  return profile.actorSegments;
}

export function buildDecisionLayerPrompt(profile: CaseTypeProfile): string {
  if (profile.caseType === "clinical_outcome") {
    return `
DECISION LAYER SEPARATION (MANDATORY):
This case operates in the CLINICAL OUTCOME layer only.

Layer 0 — Clinical Outcome (THIS CASE):
  Determined ONLY by: endpoint design, statistical power, enrollment quality, comparator selection, safety profile, protocol adherence.
  Decision authority: Trial data and pre-specified analysis plan.

Layer 1 — Regulatory Approval (DOWNSTREAM — do not mix):
  Determined by: benefit-risk assessment, regulatory compliance, label scope.
  Decision authority: Regulatory agency (FDA, EMA, etc.)

Layer 2 — HTA / Reimbursement (DOWNSTREAM — do not mix):
  Determined by: cost-effectiveness, budget impact, pricing.
  Decision authority: Payers, HTA bodies.

RULES:
- Regulatory approval, FDA decisions, and label scope must NEVER appear as clinical endpoint drivers.
- Payer strategy, reimbursement, and market access are NOT clinical trial constructs.
- Commercial strategy, adoption, and market share are NOT relevant to endpoint success.
- If downstream concepts are relevant, classify them as "downstream impact" only.
`;
  }
  if (profile.caseType === "safety_risk") {
    return `
DECISION LAYER SEPARATION (MANDATORY):
This case operates in the SAFETY / RISK RESPONSE layer.

Safety / Risk Response Layer (THIS CASE):
  Determined ONLY by: safety signal severity, regulatory response, clinical evidence reassessment, guideline impact, liability exposure.
  Decision authority: Regulatory agencies, guideline bodies, institutional risk committees.
  Outcome: Restriction level (no action, enhanced monitoring, label update, prescribing restriction, REMS, withdrawal).

DOWNSTREAM — do not mix:
  - Commercial impact (prescribing share change) is a CONSEQUENCE of safety action, not a driver.
  - Adoption rate is irrelevant — use "continuation rate" or "switching rate" instead.
  - Market share defense is not a valid safety case objective.

RULES:
- Time constraints modify resolution speed (when the answer arrives), NOT outcome probability.
- A payer reviewing safety data implies access conditions, NOT adoption decline.
- Media/advocacy signals are influence factors with reduced weight, NOT primary drivers.
- Competitive alternatives affect switching behavior, NOT the safety assessment itself.
`;
  }
  if (profile.caseType !== "regulatory_approval") return "";
  return `
DECISION LAYER SEPARATION (MANDATORY):
This case operates in the REGULATORY APPROVAL layer only.

Layer 1 — Regulatory Approval (THIS CASE):
  Determined ONLY by: clinical efficacy, safety profile, regulatory compliance, data integrity, risk mitigation.
  Decision authority: Regulatory agency (FDA, EMA, etc.)

Layer 2 — HTA / Reimbursement (DOWNSTREAM — do not mix):
  Determined by: cost-effectiveness, budget impact, pricing.
  Decision authority: Payers, HTA bodies.

Layer 3 — Adoption / Utilization (DOWNSTREAM — do not mix):
  Determined by: physician behavior, infrastructure readiness, patient acceptance.
  Decision authority: Prescribers, health systems.

RULES:
- Cost-effectiveness, budget impact, and pricing must NEVER appear as regulatory bottlenecks or drivers.
- Payers, health systems, and reimbursement authorities must NEVER appear as regulatory decision-makers.
- Market readiness, operational readiness, and adoption ceiling are NOT regulatory constructs.
- If these concepts are relevant, classify them as "downstream impact" only.
`;
}

export function buildDriverConstraintPrompt(profile: CaseTypeProfile): string {
  if (profile.caseType === "clinical_outcome") {
    return `
DRIVER CONSTRAINTS (MANDATORY — CLINICAL OUTCOME):
Primary drivers of endpoint success must be limited to:
  - Trial design quality (endpoint selection, sample size, statistical plan)
  - Enrollment quality and protocol adherence
  - Comparator selection and effect size assumptions
  - Safety profile and tolerability
  - Biomarker stratification and patient selection

DISALLOWED as drivers (these are outcomes or downstream):
  - "Trial success" or "endpoint met" — these are the OUTCOME, not drivers
  - Regulatory approval — downstream of trial results
  - Market share, adoption — commercial layer, not clinical
  - Cost-effectiveness — reimbursement layer

INFLUENCE FACTORS (not primary drivers):
  - Competitive trial results — contextual, not causal
  - KOL opinion on trial design — influence, not authority
  - Patient recruitment challenges — operational, affects timeline not biology
`;
  }
  if (profile.caseType === "safety_risk") {
    return `
DRIVER CONSTRAINTS (MANDATORY — SAFETY/RISK):
Primary drivers of restriction/safety action must be limited to:
  - Safety signal severity and causality strength
  - Regulatory agency response and communication
  - Clinical evidence reassessment (benefit-risk update)
  - Guideline body position and revision
  - Liability exposure and institutional risk
  - Competitive alternative availability (affects switching, not safety assessment)

DISALLOWED as drivers (these are outcomes or downstream):
  - "Regulatory restriction" or "market withdrawal" — these are the OUTCOME, not drivers
  - "Adoption decline" or "market share loss" — commercial consequences, not safety drivers
  - "Revenue impact" — downstream financial effect

INFLUENCE FACTORS (reduced weight, not primary drivers):
  - Media coverage — influence factor, downweighted (0.5x)
  - Patient advocacy — influence factor, not clinical evidence
  - Social media sentiment — noise factor, not evidence
  - Litigation risk — contextual, affects behavior not safety assessment
`;
  }
  if (profile.caseType !== "regulatory_approval") return "";
  return `
DRIVER CONSTRAINTS (MANDATORY):
Primary drivers of regulatory approval must be limited to:
  - Clinical efficacy evidence
  - Safety profile and risk management
  - Trial integrity and data quality
  - Regulatory compliance and submission completeness
  - Evidence sufficiency

DISALLOWED as drivers (these are outcomes or downstream):
  - "Regulatory approval by [agency]" — this is the OUTCOME, not a driver
  - "FDA approval", "EMA approval" — outcomes, not causes
  - Cost-effectiveness — belongs to reimbursement layer
  - Market share, adoption — belongs to adoption layer
  - Health economics — downstream impact only

INFLUENCE FACTORS (not primary drivers):
  - Patient advocacy — influence factor, not driver
  - Media attention — influence factor
  - Political pressure — influence factor
  - KOL endorsement — modifies committee confidence and evidence interpretation, NOT decision authority

If a circular driver is detected (outcome listed as driver), replace with:
  - "Regulatory readiness" instead of "regulatory approval"
  - "Submission completeness" instead of "FDA decision"
  - "Evidence sufficiency" instead of "approval likelihood"
`;
}

export function buildSafetySignalPrompt(profile: CaseTypeProfile): string {
  if (profile.caseType === "clinical_outcome") {
    return `
SAFETY SIGNAL RULES (CLINICAL OUTCOME):
- Safety signals that cross pre-specified stopping boundaries must ALWAYS lower endpoint success probability.
- Safety vs efficacy tradeoffs must be classified as "Constraining" or "Mixed" — NEVER "Neutral".
- If DSMB has flagged a safety concern, the forecast ceiling must be constrained regardless of efficacy trends.
- Treatment discontinuation rates above protocol assumptions are a NEGATIVE signal.

EVIDENCE GATE HIERARCHY (CLINICAL OUTCOME):
1. Statistical Validity → HIGHEST weight (primary endpoint must meet pre-specified alpha)
2. Clinical Relevance → HIGH weight (effect size must be clinically meaningful, not just statistically significant)
3. Safety Acceptability → HIGH weight (adverse event profile must be manageable for the indication)
`;
  }
  if (profile.caseType === "safety_risk") {
    return `
SAFETY SIGNAL RULES (SAFETY/RISK CASE):
- Safety signals are the PRIMARY drivers in this case type — they have the highest weight.
- Clinical evidence supporting continued use reduces restriction probability; clinical evidence confirming harm increases it.
- Media/advocacy signals are INFLUENCE FACTORS with reduced weight (0.5x) — they do not constitute clinical evidence.
- A payer reviewing safety data implies access conditions (step therapy, prior authorization), NOT adoption decline.
- Direction validation: a "Positive" access/payer signal REDUCES restriction probability (direction should be "Negative" for the restriction outcome).
- Feasibility timelines modify resolution speed, NOT outcome probability.

EVIDENCE GATE HIERARCHY (SAFETY/RISK):
1. Safety Signal Confirmation → HIGHEST weight (is the signal causally confirmed?)
2. Regulatory Review Status → HIGH weight (has the agency acted or communicated?)
3. Clinical Evidence Assessment → HIGH weight (does updated evidence change the benefit-risk?)
`;
  }
  if (profile.caseType !== "regulatory_approval") return "";
  return `
SAFETY SIGNAL RULES:
- A high-importance safety signal that is unresolved must ALWAYS exert downward pressure on probability.
- Safety vs efficacy tradeoffs must be classified as "Constraining" or "Mixed" — NEVER "Neutral".
- If safety is unresolved, the forecast ceiling must be constrained regardless of other progress.

GATE HIERARCHY:
- Safety resolution → HIGH weight (blocks approval regardless of other gates)
- Data sufficiency → HIGH weight
- Advisory recommendation → MEDIUM weight
- Communication readiness → LOW weight
`;
}

export function buildEvidenceGatePrompt(profile: CaseTypeProfile): string {
  if (!profile.evidenceGateOrder || profile.evidenceGateOrder.length === 0) return "";
  const gateLabels: Record<string, string> = {
    statistical_validity: "Statistical Validity (primary endpoint meets pre-specified alpha threshold)",
    clinical_relevance: "Clinical Relevance (effect size is clinically meaningful for the indication)",
    safety_acceptability: "Safety Acceptability (adverse event profile is manageable and within tolerance)",
    safety_acceptability_reg: "Safety Acceptability (benefit-risk balance is acceptable to regulators)",
    clinical_evidence_sufficiency: "Clinical Evidence Sufficiency (data package supports the indication)",
    regulatory_compliance: "Regulatory Compliance (submission is complete and meets requirements)",
    safety_signal_confirmation: "Safety Signal Confirmation (causal relationship between drug and adverse event is established or refuted)",
    regulatory_review_status: "Regulatory Review Status (agency has acted, communicated, or initiated formal review)",
    clinical_evidence_assessment: "Clinical Evidence Assessment (updated clinical data changes the benefit-risk balance)",
  };

  let prompt = `\nEVIDENCE GATE HIERARCHY (MANDATORY — ${profile.label}):
Gates must be evaluated in this strict order. A later gate CANNOT override a failed earlier gate.\n`;
  profile.evidenceGateOrder.forEach((gate, idx) => {
    const label = gateLabels[gate] || gate;
    prompt += `${idx + 1}. ${label}\n`;
  });
  prompt += `\nIf Gate 1 fails, Gates 2+ are moot. If Gate 2 fails despite Gate 1 passing, the outcome is "borderline" at best.\n`;
  return prompt;
}

export function buildActionFilterPrompt(profile: CaseTypeProfile): string {
  if (profile.caseType === "clinical_outcome") {
    return `
ACTION FILTER (MANDATORY — CLINICAL OUTCOME):
ALLOWED action types for clinical endpoint decisions:
${profile.actionConstraints.map(a => `  - ${a}`).join("\n")}

DISALLOWED action types (these belong to downstream decision layers):
  - Physician education or detailing
  - Market shaping or brand awareness
  - Patient advocacy engagement
  - Payer strategy or formulary negotiations
  - Commercial launch planning
  - Field force deployment

SUCCESS METRICS must be limited to:
${profile.successMeasureTypes.map(m => `  - ${m}`).join("\n")}

Do NOT use commercial, adoption, or regulatory metrics as success measures for clinical endpoint decisions.
`;
  }
  if (profile.actionConstraints.length === 0) return "";
  let prompt = `\nACTION FILTER (${profile.label}):
ALLOWED action types: ${profile.actionConstraints.join(", ")}.\n`;
  prompt += `Do not recommend actions outside this scope.\n`;
  return prompt;
}

export function buildOutcomeStatePrompt(profile: CaseTypeProfile): string {
  if (!profile.outcomeStates || profile.outcomeStates.length === 0) return "";
  const stateDescriptions: Record<string, string> = {
    definitive_success: "Primary endpoint met with statistical significance AND clinical relevance — clear positive outcome",
    borderline_significance: "p-value near threshold (e.g., 0.04-0.06) — technically significant but fragile; sensitivity analyses may shift conclusion",
    subgroup_only_success: "Primary endpoint missed in ITT population but met in pre-specified subgroup — partial success with narrower label implications",
    clinically_meaningful_not_significant: "Clinically meaningful effect size observed but p-value did not reach significance — underpowered or high variability",
    safety_limited_success: "Primary endpoint met but safety profile raises concerns — benefit-risk balance is uncertain",
    inconclusive: "Results do not clearly support success or failure — additional data or analysis needed",
    definitive_failure: "Primary endpoint clearly missed with no meaningful clinical signal — negative outcome",
    no_action_required: "Safety signal investigated and determined to be non-causal or within acceptable risk — no regulatory or clinical action needed",
    enhanced_monitoring: "Safety signal warrants increased surveillance but does not require prescribing changes — enhanced pharmacovigilance imposed",
    label_update_only: "Safety information added to label (warnings, precautions) but no prescribing restrictions imposed",
    prescribing_restriction: "Formal prescribing restrictions imposed — limited to specific populations, settings, or conditions",
    rems_imposed: "Risk Evaluation and Mitigation Strategy required — structured risk management program mandated",
    market_withdrawal: "Product withdrawn from market due to unacceptable safety profile — most severe outcome",
    inconclusive_pending: "Safety assessment is ongoing — insufficient data to determine outcome; resolution depends on pending studies or reviews",
  };

  let prompt = `\nOUTCOME STATE CLASSIFICATION (MANDATORY — ${profile.label}):
Do NOT use binary success/failure. Classify the projected outcome into one of these states:\n`;
  for (const state of profile.outcomeStates) {
    const desc = stateDescriptions[state] || state;
    prompt += `- ${state.replace(/_/g, " ").toUpperCase()}: ${desc}\n`;
  }
  prompt += `\nAlways state which outcome state applies and WHY. If the probability is between 35-65%, "borderline" or "inconclusive" states are more appropriate than "definitive" states.\n`;
  return prompt;
}

export function buildPropagationPathwayPrompt(profile: CaseTypeProfile): string {
  if (profile.caseType === "safety_risk") {
    return `
PROPAGATION PATHWAY (MANDATORY — SAFETY/RISK):
For each significant signal or scenario, describe the impact pathway using this format:
  Event → Immediate Effect → Secondary Effect → System Outcome

Examples:
  - "GI bleeding signal confirmed → FDA safety communication → guideline committee review → prescribing restriction in high-risk populations"
  - "Post-marketing study shows mortality signal → REMS evaluation triggered → institutional formulary review → switch to alternative therapies"
  - "Media amplification of adverse events → clinician concern increases → pause in new starts → continuation rate drops 20%"
  - "Payer safety review → prior authorization imposed → access conditions tightened → prescribing share shifts to alternatives"

Each pathway must trace from a specific, observable event to its system-level consequence. Do not skip intermediate steps.
`;
  }
  if (profile.caseType !== "clinical_outcome" && profile.caseType !== "regulatory_approval") return "";
  return `
PROPAGATION PATHWAY (MANDATORY):
For each significant signal or scenario, describe the impact pathway using this format:
  Event → Immediate Effect → Secondary Effect → System Outcome

Examples:
  - "DSMB safety flag → enrollment pause → timeline delay → probability ceiling drops 15%"
  - "Subgroup efficacy signal → pre-specified analysis triggered → potential label narrowing → reduced commercial value"
  - "Competitor readout positive → comparator bar raised → relative effect size questioned → statistical plan review needed"

Each pathway must trace from a specific, observable event to its system-level consequence. Do not skip intermediate steps.
`;
}

export function buildDecisionSensitivityPrompt(profile: CaseTypeProfile): string {
  return `
DECISION SENSITIVITY INDICATOR (MANDATORY):
For each key driver or barrier, classify its sensitivity:
- HIGH SENSITIVITY: A small change in this factor would shift the probability by >10 percentage points
- MODERATE SENSITIVITY: A change in this factor would shift the probability by 5-10 percentage points
- LOW SENSITIVITY: This factor contributes to the overall picture but would not shift the outcome by >5 points alone

Include a "decision_sensitivity" field in your response that lists the top 3 most sensitive factors and their classification.
`;
}

export function buildSimulationEligibilityPrompt(profile: CaseTypeProfile): string {
  if (!profile.simulationEligibility) return "";
  return `\nSIMULATION ELIGIBILITY RULE: ${profile.simulationEligibility}\n`;
}

export const SIGNAL_CLASSIFICATION_TYPES = [
  "clinical_efficacy",
  "safety_tolerability",
  "regulatory_procedural",
  "guideline_consensus",
  "competitive_landscape",
  "payer_access",
  "operational_workflow",
  "epidemiological",
  "patient_reported",
  "biomarker",
  "real_world_evidence",
] as const;

export type SignalClassificationType = typeof SIGNAL_CLASSIFICATION_TYPES[number];

export { PROFILES, REGULATORY_ACTORS, COMMERCIAL_ACTORS, FDA_REGULATORY_ACTORS, EMA_REGULATORY_ACTORS, CLINICAL_OUTCOME_ACTORS, SAFETY_RISK_ACTORS };
