export interface CaseTypeProfile {
  caseType: string;
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
}

export interface ActorSegment {
  segmentType: string;
  segmentName: string;
  description: string;
  baseModifier: number;
  signalWeights: Record<string, number>;
  relevanceTiming: string;
}

const REGULATORY_ACTORS: ActorSegment[] = [
  {
    segmentType: "fda_review_division",
    segmentName: "FDA Review Division",
    description: "Primary regulatory review team evaluating benefit-risk balance, clinical evidence package, and label scope.",
    baseModifier: 1.0,
    signalWeights: { clinical: 0.9, safety: 0.9, regulatory: 1.0, evidence: 0.8 },
    relevanceTiming: "pre-decision",
  },
  {
    segmentType: "advisory_committee",
    segmentName: "Advisory Committee Members",
    description: "External expert panel providing recommendations on approvability, risk management, and label conditions.",
    baseModifier: 0.9,
    signalWeights: { clinical: 0.9, safety: 0.95, expert: 0.8, evidence: 0.85 },
    relevanceTiming: "pre-decision",
  },
  {
    segmentType: "regulatory_clinical_team",
    segmentName: "Sponsor Regulatory & Clinical Team",
    description: "Company regulatory affairs and clinical development team managing submission, responses, and risk mitigation.",
    baseModifier: 1.1,
    signalWeights: { regulatory: 0.9, clinical: 0.8, safety: 0.7, evidence: 0.75 },
    relevanceTiming: "pre-decision",
  },
  {
    segmentType: "safety_reviewers",
    segmentName: "Safety Reviewers",
    description: "FDA pharmacovigilance and safety evaluation specialists assessing risk signals, REMS requirements, and post-marketing obligations.",
    baseModifier: 0.7,
    signalWeights: { safety: 1.0, clinical: 0.6, regulatory: 0.7 },
    relevanceTiming: "pre-decision",
  },
  {
    segmentType: "patient_advocacy",
    segmentName: "Patient Advocacy Groups",
    description: "Patient organizations influencing advisory sentiment, public testimony, and benefit-risk framing. Active pre-approval in regulatory cases.",
    baseModifier: 0.8,
    signalWeights: { patient: 0.9, advocacy: 0.9, safety: 0.5, clinical: 0.4 },
    relevanceTiming: "pre-approval",
  },
];

const COMMERCIAL_ACTORS: ActorSegment[] = [
  {
    segmentType: "kol_academic",
    segmentName: "Academic KOLs",
    description: "Academic key opinion leaders who influence treatment guidelines and peer prescribing.",
    baseModifier: 1.15,
    signalWeights: { phase: 0.9, clinical: 0.85, expert: 0.8, guideline: 0.7, mechanism: 0.6, evidence: 0.9 },
    relevanceTiming: "launch",
  },
  {
    segmentType: "community_high",
    segmentName: "Community High Adopters",
    description: "Community practitioners who adopt guideline-endorsed treatments quickly.",
    baseModifier: 1.05,
    signalWeights: { guideline: 0.9, clinical: 0.7, payer: 0.8, "real-world": 0.6 },
    relevanceTiming: "launch",
  },
  {
    segmentType: "community_cautious",
    segmentName: "Community Cautious Adopters",
    description: "Cautious community prescribers who require strong real-world evidence and safety data.",
    baseModifier: 0.75,
    signalWeights: { "real-world": 0.9, safety: 0.85, guideline: 0.7, payer: 0.6, workflow: 0.5 },
    relevanceTiming: "post-launch",
  },
  {
    segmentType: "access_constrained",
    segmentName: "Access-Constrained Accounts",
    description: "Accounts with significant payer/formulary barriers that constrain prescribing decisions.",
    baseModifier: 0.55,
    signalWeights: { payer: 0.95, access: 0.9, reimbursement: 0.85, formulary: 0.8, cost: 0.7 },
    relevanceTiming: "post-launch",
  },
  {
    segmentType: "workflow_sensitive",
    segmentName: "Workflow-Sensitive Clinicians",
    description: "Clinicians whose prescribing is heavily influenced by administration complexity and operational logistics.",
    baseModifier: 0.65,
    signalWeights: { workflow: 0.95, operational: 0.85, administration: 0.8, logistics: 0.6 },
    relevanceTiming: "post-launch",
  },
  {
    segmentType: "guideline_led",
    segmentName: "Guideline-Led Adopters",
    description: "Prescribers who follow guidelines strictly and won't adopt until guideline endorsement.",
    baseModifier: 0.85,
    signalWeights: { guideline: 0.95, consensus: 0.8, evidence: 0.85, clinical: 0.7 },
    relevanceTiming: "post-guideline",
  },
  {
    segmentType: "economics_sensitive",
    segmentName: "Economics-Sensitive Decision-Makers",
    description: "Decision-makers driven primarily by cost-effectiveness and budget impact.",
    baseModifier: 0.70,
    signalWeights: { cost: 0.95, budget: 0.85, economic: 0.9, value: 0.8, payer: 0.7 },
    relevanceTiming: "post-launch",
  },
  {
    segmentType: "competitive_defender",
    segmentName: "Competitive Incumbency Defenders",
    description: "Prescribers loyal to existing treatments with high switching costs.",
    baseModifier: 0.45,
    signalWeights: { competitive: 0.95, "market share": 0.8, switching: 0.85, incumbent: 0.9 },
    relevanceTiming: "post-launch",
  },
];

const PROFILES: Record<string, CaseTypeProfile> = {
  regulatory_approval: {
    caseType: "regulatory_approval",
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
  },
  launch_readiness: {
    caseType: "launch_readiness",
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
};

const CLASSIFIER_TO_ROUTER: Record<string, string> = {
  launch_readiness: "launch_readiness",
  competitive_defense: "competitive_defense",
  access_expansion: "access_expansion",
  clinical_adoption: "clinical_adoption",
  lifecycle_management: "lifecycle_management",
  market_shaping: "market_shaping",
  unclassified: "clinical_adoption",
};

export function isRegulatoryCase(question: string, caseType?: string): boolean {
  if (caseType === "regulatory_approval") return true;
  const q = question.toLowerCase();
  const regulatoryPatterns = [
    "fda approv", "ema approv", "regulatory approv",
    "approval", "approve", "approved",
    "advisory committee", "adcom", "pdufa",
    "complete response", "crl", "nda", "bla", "sNDA",
    "breakthrough therapy", "accelerated approval",
    "priority review", "fast track",
    "regulatory decision", "regulatory outcome",
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
  if (question && isRegulatoryCase(question, classifierType)) {
    return PROFILES.regulatory_approval;
  }
  const routerKey = CLASSIFIER_TO_ROUTER[classifierType] || "clinical_adoption";
  return PROFILES[routerKey] || PROFILES.clinical_adoption;
}

export function getProfileForQuestion(question: string, classifierType?: string): CaseTypeProfile {
  if (isRegulatoryCase(question, classifierType)) {
    return PROFILES.regulatory_approval;
  }
  if (classifierType) {
    const routerKey = CLASSIFIER_TO_ROUTER[classifierType] || "clinical_adoption";
    return PROFILES[routerKey] || PROFILES.clinical_adoption;
  }
  return PROFILES.clinical_adoption;
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

export { PROFILES, REGULATORY_ACTORS, COMMERCIAL_ACTORS };
