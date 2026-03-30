import { classifyCaseType, type CaseType } from "./case-type-classifier.js";
import { getProfileForQuestion, type CaseTypeProfile } from "./case-type-router.js";

export type SignalFamily =
  | "brand_clinical_regulatory"
  | "payer_access"
  | "competitor"
  | "patient_demand"
  | "provider_behavioral"
  | "system_operational";

const ALL_SIGNAL_FAMILIES: SignalFamily[] = [
  "brand_clinical_regulatory",
  "payer_access",
  "competitor",
  "patient_demand",
  "provider_behavioral",
  "system_operational",
];

export interface RelevanceScoringRule {
  family: SignalFamily;
  weight: number;
  rationale: string;
}

export type ArchetypeCategory = "core_clinical_commercial" | "enterprise_system";

export interface CaseFrame {
  caseType: CaseType;
  profileCaseType: string;
  archetypeLabel: string;
  archetypeCategory: ArchetypeCategory;
  primaryDecisionMechanism: string;
  decisionGrammar: string;
  judgmentQuestions: string[];
  allowedSignalFamilies: SignalFamily[];
  forbiddenSignalFamilies: SignalFamily[];
  prioritizedFamilies: SignalFamily[];
  deprioritizedFamilies: SignalFamily[];
  correctSignalTypes: string[];
  incorrectSignalTypes: string[];
  searchTargets: string[];
  relevanceScoringRules: RelevanceScoringRule[];
  acceptanceRules: string[];
  rejectionRules: string[];
  framingNotes: string;
}

interface ArchetypeFrameDefinition {
  archetypeLabel: string;
  archetypeCategory: ArchetypeCategory;
  primaryDecisionMechanism: string;
  decisionGrammar: string;
  judgmentQuestions: string[];
  allowedSignalFamilies: SignalFamily[];
  forbiddenSignalFamilies: SignalFamily[];
  prioritizedFamilies: SignalFamily[];
  deprioritizedFamilies: SignalFamily[];
  correctSignalTypes: string[];
  incorrectSignalTypes: string[];
  searchTargets: string[];
  relevanceScoringRules: RelevanceScoringRule[];
  acceptanceRules: string[];
  rejectionRules: string[];
  framingNotes: string;
}

const ARCHETYPE_FRAMES: Record<string, ArchetypeFrameDefinition> = {
  clinical_outcome: {
    archetypeLabel: "Clinical Outcome",
    archetypeCategory: "core_clinical_commercial",
    primaryDecisionMechanism: "Trial endpoint success determined by clinical data, statistical plan, and safety profile",
    decisionGrammar: "trial design → enrollment quality → endpoint measurement → statistical analysis → clinical relevance determination",
    judgmentQuestions: [
      "Is the trial designed to detect a meaningful clinical effect?",
      "Is enrollment quality sufficient for statistical power?",
      "Is the safety profile acceptable for the benefit-risk assessment?",
    ],
    allowedSignalFamilies: ["brand_clinical_regulatory", "competitor", "patient_demand"],
    forbiddenSignalFamilies: ["system_operational", "payer_access"],
    prioritizedFamilies: ["brand_clinical_regulatory"],
    deprioritizedFamilies: ["competitor", "patient_demand"],
    correctSignalTypes: [
      "trial endpoint design and statistical plan",
      "enrollment quality and protocol amendments",
      "interim analysis results or DSMB communications",
      "safety profile and adverse event monitoring",
      "comparator arm and effect size assumptions",
      "competitor trial readouts in same indication",
    ],
    incorrectSignalTypes: [
      "commercial adoption or market share",
      "payer coverage or formulary positioning",
      "field force readiness or supply chain",
      "physician adoption or prescribing behavior",
    ],
    searchTargets: [
      "trial design and endpoint selection for the specific indication",
      "comparator arm and effect size assumptions",
      "enrollment status and protocol amendments",
      "interim analysis results or DSMB communications",
      "competitor trial readouts in same indication",
      "safety signals from ongoing monitoring",
    ],
    relevanceScoringRules: [
      { family: "brand_clinical_regulatory", weight: 1.0, rationale: "Primary driver — trial data and regulatory context directly determine endpoint success" },
      { family: "competitor", weight: 0.4, rationale: "Competitor trial results provide context but do not causally affect this trial's endpoints" },
      { family: "patient_demand", weight: 0.3, rationale: "Patient factors affect enrollment quality but not endpoint biology" },
      { family: "provider_behavioral", weight: 0.0, rationale: "Prescribing behavior is downstream of trial outcomes, not a driver" },
      { family: "payer_access", weight: 0.0, rationale: "Reimbursement is downstream — irrelevant to endpoint success" },
      { family: "system_operational", weight: 0.0, rationale: "Operational logistics do not affect clinical endpoints" },
    ],
    acceptanceRules: [
      "Signal describes trial design, endpoint measurement, or statistical validity",
      "Signal describes safety profile that could affect benefit-risk assessment",
      "Signal describes competitor data that changes the evidentiary bar",
    ],
    rejectionRules: [
      "Signal describes commercial adoption or market share — these are downstream outcomes",
      "Signal describes payer coverage or formulary positioning — downstream layer",
      "Signal describes field force readiness or supply chain — operational, not clinical",
      "Signal uses 'adoption', 'launch', or 'market readiness' language",
    ],
    framingNotes: "Clinical outcome cases operate in Layer 0. Regulatory, reimbursement, and commercial outcomes are all downstream and must not be mixed as drivers.",
  },

  regulatory_approval: {
    archetypeLabel: "Regulatory Approval",
    archetypeCategory: "core_clinical_commercial",
    primaryDecisionMechanism: "Regulatory agency benefit-risk assessment based on submitted evidence package",
    decisionGrammar: "evidence submission → regulatory review → advisory committee → benefit-risk determination → approval/rejection decision",
    judgmentQuestions: [
      "Is the clinical evidence package complete and of sufficient quality?",
      "Is the safety profile acceptable for the intended indication?",
      "Does the benefit-risk balance favor approval?",
    ],
    allowedSignalFamilies: ["brand_clinical_regulatory", "competitor", "patient_demand"],
    forbiddenSignalFamilies: ["system_operational", "payer_access"],
    prioritizedFamilies: ["brand_clinical_regulatory"],
    deprioritizedFamilies: ["patient_demand"],
    correctSignalTypes: [
      "clinical evidence quality or completeness",
      "safety profile and unresolved adverse event signals",
      "regulatory review milestones or agency communications",
      "advisory committee scheduling and precedent votes",
      "regulatory precedent for similar mechanisms",
    ],
    incorrectSignalTypes: [
      "commercial readiness or launch planning",
      "payer negotiations or formulary status",
      "physician prescribing intent",
      "manufacturing or supply chain readiness",
    ],
    searchTargets: [
      "FDA/EMA review status and timeline milestones (PDUFA date, CHMP opinion)",
      "clinical evidence package completeness and data quality",
      "safety profile and unresolved safety signals",
      "advisory committee scheduling and precedent votes",
      "regulatory precedent for similar mechanisms or indications",
      "complete response letter history or prior rejections",
    ],
    relevanceScoringRules: [
      { family: "brand_clinical_regulatory", weight: 1.0, rationale: "Clinical data and regulatory filings are the primary determinants of approval" },
      { family: "competitor", weight: 0.5, rationale: "Competitor approvals/rejections set regulatory precedent and comparator expectations" },
      { family: "patient_demand", weight: 0.3, rationale: "Unmet need influences regulatory urgency but not the benefit-risk determination itself" },
      { family: "provider_behavioral", weight: 0.0, rationale: "Prescribing behavior is downstream of approval — excluded" },
      { family: "payer_access", weight: 0.0, rationale: "Reimbursement is downstream of approval — excluded" },
      { family: "system_operational", weight: 0.0, rationale: "Operational readiness is irrelevant to regulatory decisions" },
    ],
    acceptanceRules: [
      "Signal describes clinical evidence quality or completeness",
      "Signal describes safety profile or unresolved adverse event signals",
      "Signal describes regulatory review milestones or agency communications",
      "Signal describes advisory committee dynamics or precedent",
    ],
    rejectionRules: [
      "Signal describes commercial readiness or launch planning — downstream",
      "Signal describes payer negotiations or formulary status — downstream",
      "Signal describes physician prescribing intent — premature before approval",
      "Signal describes manufacturing or supply chain — operational",
    ],
    framingNotes: "Regulatory cases operate in Layer 1. Cost-effectiveness, market access, and commercial execution belong to downstream layers.",
  },

  safety_risk: {
    archetypeLabel: "Regulatory Risk",
    archetypeCategory: "core_clinical_commercial",
    primaryDecisionMechanism: "Safety signal severity and regulatory response determining restriction level",
    decisionGrammar: "safety signal detection → causality assessment → regulatory review → guideline revision → restriction/action determination",
    judgmentQuestions: [
      "Is safety risk increasing?",
      "Is regulatory scrutiny increasing?",
      "Is the risk-benefit balance shifting?",
    ],
    allowedSignalFamilies: ["brand_clinical_regulatory", "competitor", "patient_demand", "provider_behavioral", "payer_access"],
    forbiddenSignalFamilies: ["system_operational"],
    prioritizedFamilies: ["brand_clinical_regulatory"],
    deprioritizedFamilies: ["provider_behavioral", "patient_demand"],
    correctSignalTypes: [
      "FAERS adverse event trend",
      "safety study findings",
      "FDA safety communication activity",
      "regulatory inquiry or review",
      "risk evaluation and mitigation strategy review",
      "post-marketing study results",
      "class-level safety precedent",
      "guideline body safety statements",
    ],
    incorrectSignalTypes: [
      "market share or sales trends",
      "physician adoption or prescribing preference",
      "guideline preference for efficacy",
      "manufacturing or supply chain readiness",
    ],
    searchTargets: [
      "adverse event reports and pharmacovigilance data (FAERS trends)",
      "FDA/EMA safety communications or REMS updates",
      "post-marketing study results and safety study findings",
      "class-level safety precedent for similar mechanisms",
      "guideline body statements on the safety signal",
      "litigation or legal developments related to the safety issue",
    ],
    relevanceScoringRules: [
      { family: "brand_clinical_regulatory", weight: 1.0, rationale: "Safety data, regulatory communications, and clinical evidence are the primary drivers of restriction decisions" },
      { family: "competitor", weight: 0.6, rationale: "Competitor safety comparisons and alternative availability affect switching behavior" },
      { family: "patient_demand", weight: 0.4, rationale: "Patient adverse event reports are relevant evidence; advocacy is an influence factor only" },
      { family: "provider_behavioral", weight: 0.4, rationale: "Prescribing behavior changes due to safety concerns are relevant as consequence indicators" },
      { family: "payer_access", weight: 0.3, rationale: "Payer safety reviews imply access conditions, not adoption — lower weight" },
      { family: "system_operational", weight: 0.0, rationale: "Operational factors are irrelevant to safety assessment" },
    ],
    acceptanceRules: [
      "Signal describes adverse event severity, frequency, or causality assessment",
      "Signal describes regulatory agency action or communication about the safety issue",
      "Signal describes clinical evidence that updates the benefit-risk balance",
      "Signal describes guideline body response to the safety signal",
      "Signal describes legal/litigation developments related to the safety issue",
    ],
    rejectionRules: [
      "Signal describes commercial market share impact — this is a consequence, not a driver",
      "Signal describes manufacturing or supply chain — operational, irrelevant",
      "Signal describes adoption rate — use 'continuation rate' or 'switching rate' instead",
      "Signal frames media/advocacy as primary evidence — these are influence factors only",
    ],
    framingNotes: "Safety cases frame the outcome as restriction level, not adoption. Positive access signals reduce restriction probability. Media/advocacy signals are influence factors with reduced weight (0.5x).",
  },

  launch_readiness: {
    archetypeLabel: "Launch Timing",
    archetypeCategory: "core_clinical_commercial",
    primaryDecisionMechanism: "Multi-gate operational readiness determining whether product can legally, regulatorily, and physically launch by target date",
    decisionGrammar: "legal entry readiness → regulatory approval/submission → manufacturing readiness → supply readiness → launch",
    judgmentQuestions: [
      "Can the product legally launch?",
      "Can the product be approved?",
      "Can the product be manufactured?",
      "Can the product be supplied?",
    ],
    allowedSignalFamilies: ["brand_clinical_regulatory", "system_operational", "competitor", "payer_access"],
    forbiddenSignalFamilies: [],
    prioritizedFamilies: ["brand_clinical_regulatory", "system_operational"],
    deprioritizedFamilies: ["patient_demand", "provider_behavioral"],
    correctSignalTypes: [
      "patent settlement entry window",
      "FDA submission or approval milestone",
      "manufacturing slot allocation",
      "batch validation completion",
      "production capacity readiness",
      "packaging and labeling readiness",
      "inventory build progress",
      "supply chain readiness",
      "regulatory clearance status and label scope",
    ],
    incorrectSignalTypes: [
      "clinical superiority or comparative efficacy",
      "guideline inclusion or recommendation",
      "physician adoption or prescribing behavior",
      "market share or commercial performance",
    ],
    searchTargets: [
      "patent settlement and legal entry windows",
      "regulatory approval status, FDA submission milestones, PDUFA dates",
      "manufacturing readiness: slot allocation, batch validation, production capacity",
      "supply chain readiness: packaging, labeling, inventory build",
      "competitor launches in the same window",
      "payer coverage decisions and formulary positioning",
    ],
    relevanceScoringRules: [
      { family: "brand_clinical_regulatory", weight: 1.0, rationale: "Regulatory approval and legal entry windows are primary gating conditions for launch" },
      { family: "system_operational", weight: 0.95, rationale: "Manufacturing and supply readiness are direct launch-timing determinants" },
      { family: "payer_access", weight: 0.7, rationale: "Coverage decisions affect launch positioning but not whether the product can launch" },
      { family: "competitor", weight: 0.6, rationale: "Competitive launches affect timing strategy but not readiness gates" },
      { family: "patient_demand", weight: 0.2, rationale: "Patient demand does not determine operational launch readiness" },
      { family: "provider_behavioral", weight: 0.2, rationale: "Physician adoption is downstream of launch — not a timing driver" },
    ],
    acceptanceRules: [
      "Signal describes a legal, regulatory, or operational gating condition for launch",
      "Signal describes manufacturing capacity, batch validation, or supply chain readiness",
      "Signal describes patent settlement, exclusivity expiry, or legal entry timing",
      "Signal describes FDA/EMA submission or approval milestones",
    ],
    rejectionRules: [
      "Signal describes clinical superiority or comparative efficacy — not a launch-timing driver",
      "Signal describes guideline inclusion — not a launch-timing driver",
      "Signal describes physician adoption or prescribing behavior — downstream of launch",
      "Signal describes market share — downstream of launch",
      "Signal describes long-term lifecycle management — premature for launch timing",
    ],
    framingNotes: "Launch Timing focuses on operational readiness gates. The question is 'will it launch by date X?' not 'how well will it be adopted'. Prioritize legal entry, regulatory clearance, manufacturing, and supply over behavioral or commercial signals.",
  },

  competitive_defense: {
    archetypeLabel: "Competitive Positioning",
    archetypeCategory: "core_clinical_commercial",
    primaryDecisionMechanism: "Incumbent retention driven by differentiation, switching barriers, and competitive response",
    decisionGrammar: "competitor entry → prescriber evaluation → switching cost assessment → differentiation messaging → retention or erosion",
    judgmentQuestions: [
      "Is one therapy clinically better?",
      "Is one therapy safer?",
      "Is one therapy easier to use?",
    ],
    allowedSignalFamilies: ["brand_clinical_regulatory", "payer_access", "competitor", "provider_behavioral", "patient_demand"],
    forbiddenSignalFamilies: ["system_operational"],
    prioritizedFamilies: ["competitor", "provider_behavioral", "payer_access"],
    deprioritizedFamilies: ["patient_demand"],
    correctSignalTypes: [
      "head-to-head clinical outcomes",
      "guideline positioning and recommendation changes",
      "adverse event differences between competitors",
      "physician switching behavior and loyalty patterns",
      "market share trajectory",
      "real-world evidence differentiating therapies",
    ],
    incorrectSignalTypes: [
      "manufacturing slot allocation or capacity",
      "supply readiness or inventory build",
      "packaging or labeling logistics",
      "facility inspection or production validation",
    ],
    searchTargets: [
      "competitor clinical data, approvals, and label comparisons",
      "head-to-head trial results and comparative efficacy",
      "biosimilar/generic entry timelines and pricing",
      "prescriber switching intent and loyalty patterns",
      "payer formulary positioning and cost differentials",
      "real-world evidence differentiating incumbent vs competitor",
      "adverse event profile comparisons",
    ],
    relevanceScoringRules: [
      { family: "competitor", weight: 1.0, rationale: "Competitor actions are the primary driver of defense dynamics" },
      { family: "provider_behavioral", weight: 0.9, rationale: "Prescriber switching behavior directly determines share retention" },
      { family: "payer_access", weight: 0.85, rationale: "Payer decisions on formulary positioning and cost tiers drive switching at scale" },
      { family: "brand_clinical_regulatory", weight: 0.7, rationale: "Clinical differentiation data supports defense but is not the immediate trigger" },
      { family: "patient_demand", weight: 0.5, rationale: "Patient preference and loyalty contribute to retention but are secondary to prescriber and payer dynamics" },
      { family: "system_operational", weight: 0.0, rationale: "Operational factors rarely determine competitive outcomes" },
    ],
    acceptanceRules: [
      "Signal describes competitor entry, pricing, or clinical positioning",
      "Signal describes prescriber switching behavior or loyalty dynamics",
      "Signal describes payer actions that shift formulary positioning",
      "Signal describes clinical differentiation evidence or head-to-head outcomes",
      "Signal describes adverse event differences between therapies",
    ],
    rejectionRules: [
      "Signal describes regulatory approval of the incumbent — already established",
      "Signal describes new indication development — this is lifecycle, not defense",
      "Signal describes operational logistics unrelated to competitive dynamics",
      "Signal describes manufacturing or supply chain — not a competitive differentiator",
    ],
    framingNotes: "Competitive defense cases center on the competitor, not the incumbent brand. The causal chain starts with competitor action and traces to incumbent share impact.",
  },

  access_expansion: {
    archetypeLabel: "Access / Barrier",
    archetypeCategory: "core_clinical_commercial",
    primaryDecisionMechanism: "Payer coverage decision driven by cost pressure, utilization growth, budget impact, and policy dynamics",
    decisionGrammar: "cost pressure → utilization assessment → payer policy review → coverage decision → access outcome",
    judgmentQuestions: [
      "Are costs rising?",
      "Is utilization rising?",
      "Are payers reacting?",
    ],
    allowedSignalFamilies: ["payer_access", "brand_clinical_regulatory", "competitor", "patient_demand", "provider_behavioral"],
    forbiddenSignalFamilies: ["system_operational"],
    prioritizedFamilies: ["payer_access", "brand_clinical_regulatory"],
    deprioritizedFamilies: ["system_operational"],
    correctSignalTypes: [
      "formulary policy change",
      "prior authorization requirement",
      "utilization management rule",
      "coverage restriction or expansion",
      "employer benefit change",
      "cost-effectiveness or budget impact evidence",
      "payer engagement and formulary review timelines",
    ],
    incorrectSignalTypes: [
      "clinical efficacy without connection to value demonstration",
      "manufacturing readiness or capacity",
      "physician preference or prescribing behavior",
      "facility capacity or production logistics",
    ],
    searchTargets: [
      "payer policy changes, formulary review timelines, coverage restrictions",
      "prior authorization and step therapy requirements",
      "utilization management rules and coverage criteria",
      "health economics, cost-effectiveness, and budget impact evidence",
      "competitor pricing and access positioning",
      "employer benefit changes affecting access",
    ],
    relevanceScoringRules: [
      { family: "payer_access", weight: 1.0, rationale: "Payer decisions are the primary outcome in access cases" },
      { family: "brand_clinical_regulatory", weight: 0.8, rationale: "Clinical evidence supports value arguments but doesn't directly determine payer decisions" },
      { family: "competitor", weight: 0.7, rationale: "Competitor pricing and access positioning affect relative value perception" },
      { family: "patient_demand", weight: 0.5, rationale: "Patient burden and advocacy can influence payer decisions" },
      { family: "provider_behavioral", weight: 0.4, rationale: "Physician demand for the product supports access arguments" },
      { family: "system_operational", weight: 0.0, rationale: "Operational factors do not drive payer decisions" },
    ],
    acceptanceRules: [
      "Signal describes payer policy, formulary status, or coverage criteria",
      "Signal describes cost-effectiveness, budget impact, or utilization management",
      "Signal describes competitor pricing or access dynamics that affect relative positioning",
      "Signal describes prior authorization, step therapy, or coverage restriction changes",
    ],
    rejectionRules: [
      "Signal describes clinical endpoint data without connection to value demonstration",
      "Signal describes supply chain or manufacturing — operational, not access",
      "Signal describes physician prescribing preference without payer context",
    ],
    framingNotes: "Access/Barrier cases focus on payer behavior and policy dynamics. The key question is whether access restrictions will tighten or loosen. Clinical signals are relevant only when they support or undermine value arguments.",
  },

  clinical_adoption: {
    archetypeLabel: "Physician Adoption",
    archetypeCategory: "core_clinical_commercial",
    primaryDecisionMechanism: "Physician practice change driven by evidence, guidelines, and peer influence",
    decisionGrammar: "clinical evidence publication → guideline committee review → KOL endorsement → peer influence cascade → practice pattern change",
    judgmentQuestions: [
      "Do physicians believe the therapy works?",
      "Do physicians trust the therapy?",
      "Can physicians prescribe it easily?",
    ],
    allowedSignalFamilies: ["brand_clinical_regulatory", "provider_behavioral", "competitor", "payer_access", "patient_demand"],
    forbiddenSignalFamilies: ["system_operational"],
    prioritizedFamilies: ["brand_clinical_regulatory", "provider_behavioral"],
    deprioritizedFamilies: ["patient_demand"],
    correctSignalTypes: [
      "guideline inclusion or recommendation",
      "trial outcome magnitude and clinical significance",
      "KOL endorsement and peer influence",
      "coverage expansion supporting prescribing",
      "prescribing trend growth",
      "real-world evidence supporting practice change",
    ],
    incorrectSignalTypes: [
      "manufacturing capacity or slot allocation",
      "supply readiness or inventory build",
      "packaging logistics or labeling",
      "facility inspection or production validation",
    ],
    searchTargets: [
      "clinical trial publications and congress presentations",
      "guideline committee reviews and recommendation changes",
      "KOL endorsements and speaking engagements",
      "real-world evidence supporting practice change",
      "medical education programs and peer influence",
      "competitor evidence and positioning in guidelines",
      "payer coverage expansion supporting prescribing",
    ],
    relevanceScoringRules: [
      { family: "brand_clinical_regulatory", weight: 1.0, rationale: "Clinical evidence and guideline positioning are the primary adoption drivers" },
      { family: "provider_behavioral", weight: 0.9, rationale: "Physician behavior change is the direct outcome being measured" },
      { family: "competitor", weight: 0.6, rationale: "Competitor evidence affects relative positioning in guidelines" },
      { family: "payer_access", weight: 0.5, rationale: "Access barriers can constrain adoption even when clinical case is strong" },
      { family: "patient_demand", weight: 0.4, rationale: "Patient demand creates pull but physician practice change is primarily evidence-driven" },
      { family: "system_operational", weight: 0.0, rationale: "Operational factors rarely drive evidence-based practice change" },
    ],
    acceptanceRules: [
      "Signal describes clinical evidence quality or publication impact",
      "Signal describes guideline committee activity or recommendation changes",
      "Signal describes physician prescribing patterns or practice change indicators",
      "Signal describes KOL activity or peer influence dynamics",
      "Signal describes payer coverage expansion enabling prescribing",
    ],
    rejectionRules: [
      "Signal describes manufacturing or supply logistics — not a practice change driver",
      "Signal describes financial performance or revenue — downstream",
      "Signal describes facility capacity or production validation — operational",
    ],
    framingNotes: "Physician Adoption cases focus on the evidence-to-behavior causal chain. The key question is whether clinical evidence is sufficient to change physician practice. Primary barrier is often coverage restrictions rather than clinical doubt.",
  },

  lifecycle_management: {
    archetypeLabel: "Lifecycle Management",
    archetypeCategory: "core_clinical_commercial",
    primaryDecisionMechanism: "Sustained growth through patient finding, adherence optimization, and label expansion",
    decisionGrammar: "patient identification → diagnosis pathway → treatment initiation → adherence maintenance → label expansion opportunity",
    judgmentQuestions: [
      "Is the patient finding pathway effective?",
      "Is adherence sustainable?",
      "Are label expansion opportunities viable?",
    ],
    allowedSignalFamilies: ALL_SIGNAL_FAMILIES.slice(),
    forbiddenSignalFamilies: [],
    prioritizedFamilies: ["provider_behavioral", "patient_demand", "payer_access"],
    deprioritizedFamilies: ["system_operational"],
    correctSignalTypes: [
      "patient identification and diagnosis rate dynamics",
      "adherence, persistence, or discontinuation patterns",
      "label expansion or new indication development",
      "competitive erosion or genericization threats",
      "digital engagement and patient support metrics",
    ],
    incorrectSignalTypes: [
      "initial launch readiness signals",
      "pre-approval regulatory milestones",
    ],
    searchTargets: [
      "patient identification and diagnosis rate trends",
      "adherence and persistence data",
      "label expansion trials and regulatory submissions",
      "competitor erosion and genericization timeline",
      "digital engagement and patient support program metrics",
      "real-world evidence supporting continued use",
    ],
    relevanceScoringRules: [
      { family: "provider_behavioral", weight: 0.9, rationale: "Physician prescribing continuity and new patient identification drive lifecycle value" },
      { family: "patient_demand", weight: 0.85, rationale: "Patient adherence and new patient finding are core lifecycle levers" },
      { family: "payer_access", weight: 0.8, rationale: "Continued coverage and formulary position sustain prescribing volume" },
      { family: "brand_clinical_regulatory", weight: 0.7, rationale: "Label expansion and new data extend lifecycle value" },
      { family: "competitor", weight: 0.65, rationale: "Competitive entry and genericization threats drive erosion" },
      { family: "system_operational", weight: 0.3, rationale: "Operational efficiency can support lifecycle but is rarely the driver" },
    ],
    acceptanceRules: [
      "Signal describes patient finding or diagnosis rate dynamics",
      "Signal describes adherence, persistence, or discontinuation patterns",
      "Signal describes label expansion or new indication development",
      "Signal describes competitive erosion or genericization threats",
    ],
    rejectionRules: [
      "Signal describes initial launch readiness — lifecycle cases are post-launch",
      "Signal describes pre-approval regulatory milestones — already established",
    ],
    framingNotes: "Lifecycle cases manage mature products. All 6 families may be relevant but the focus shifts to patient-level and practice-level dynamics rather than gating conditions.",
  },

  market_shaping: {
    archetypeLabel: "Market Shaping",
    archetypeCategory: "core_clinical_commercial",
    primaryDecisionMechanism: "Pre-commercial stakeholder engagement creating conditions for future market entry",
    decisionGrammar: "disease awareness → diagnostic pathway establishment → referral network creation → patient advocacy alignment → treatment readiness",
    judgmentQuestions: [
      "Is disease awareness increasing among target physicians?",
      "Are diagnostic pathways being established?",
      "Is patient advocacy aligned with the therapeutic area?",
    ],
    allowedSignalFamilies: ["brand_clinical_regulatory", "patient_demand", "provider_behavioral", "competitor"],
    forbiddenSignalFamilies: ["system_operational", "payer_access"],
    prioritizedFamilies: ["patient_demand", "provider_behavioral"],
    deprioritizedFamilies: ["competitor"],
    correctSignalTypes: [
      "disease awareness campaigns and epidemiology updates",
      "diagnostic pathway development",
      "patient advocacy engagement",
      "medical education and KOL development",
      "early clinical data positioning",
    ],
    incorrectSignalTypes: [
      "payer strategy or reimbursement",
      "launch logistics or supply chain",
      "market share or competitive displacement",
    ],
    searchTargets: [
      "disease awareness campaigns and epidemiology updates",
      "diagnostic pathway development and referral network building",
      "patient advocacy engagement and unmet need articulation",
      "medical education programs and KOL development",
      "early clinical data and mechanism of action positioning",
      "competitor pre-commercial activities in the same space",
    ],
    relevanceScoringRules: [
      { family: "patient_demand", weight: 1.0, rationale: "Patient awareness and disease education are the core market-shaping activities" },
      { family: "provider_behavioral", weight: 0.9, rationale: "Physician awareness and referral network readiness are critical for pre-commercial success" },
      { family: "brand_clinical_regulatory", weight: 0.7, rationale: "Early clinical data supports disease education but product positioning is premature" },
      { family: "competitor", weight: 0.4, rationale: "Competitor pre-commercial activity provides context but doesn't directly drive shaping outcomes" },
      { family: "payer_access", weight: 0.0, rationale: "Payer engagement is premature in market-shaping phase" },
      { family: "system_operational", weight: 0.0, rationale: "Operational readiness is premature in market-shaping phase" },
    ],
    acceptanceRules: [
      "Signal describes disease awareness or diagnostic pathway development",
      "Signal describes patient advocacy or unmet need articulation",
      "Signal describes physician education or referral network creation",
    ],
    rejectionRules: [
      "Signal describes payer strategy or reimbursement — premature for market shaping",
      "Signal describes launch logistics or supply chain — premature",
      "Signal describes market share or competitive displacement — no product in market yet",
    ],
    framingNotes: "Market shaping cases are pre-commercial. The product may not yet exist. Focus is on creating the conditions for future market entry, not on commercial execution.",
  },

  investment_portfolio: {
    archetypeLabel: "Investment / Portfolio Decision",
    archetypeCategory: "enterprise_system",
    primaryDecisionMechanism: "Capital allocation under uncertainty — continue, expand, or terminate development investment",
    decisionGrammar: "technical success probability → market size assessment → cost of development → expected return calculation → strategic fit evaluation → investment decision",
    judgmentQuestions: [
      "Is continued investment economically justified?",
      "Does the probability of technical success warrant the development cost?",
      "Does the asset fit the strategic portfolio?",
    ],
    allowedSignalFamilies: ["brand_clinical_regulatory", "competitor", "patient_demand", "payer_access"],
    forbiddenSignalFamilies: ["system_operational"],
    prioritizedFamilies: ["brand_clinical_regulatory", "competitor"],
    deprioritizedFamilies: ["provider_behavioral"],
    correctSignalTypes: [
      "trial efficacy magnitude and clinical significance",
      "safety risk assessment",
      "development cost escalation or reduction",
      "commercial opportunity size",
      "competitor pipeline progress in same indication",
      "internal portfolio priorities and strategic fit",
    ],
    incorrectSignalTypes: [
      "physician adoption or prescribing behavior",
      "formulary positioning or payer coverage",
      "supply chain or manufacturing logistics",
      "market share or sales trends",
    ],
    searchTargets: [
      "clinical trial results and probability of technical success",
      "safety signals that could affect development viability",
      "market size estimates and commercial opportunity assessment",
      "development cost projections and timeline",
      "competitor pipeline assets in same indication",
      "portfolio strategy and therapeutic area priorities",
    ],
    relevanceScoringRules: [
      { family: "brand_clinical_regulatory", weight: 1.0, rationale: "Clinical data and regulatory probability directly determine investment viability" },
      { family: "competitor", weight: 0.8, rationale: "Competitor pipeline progress affects commercial opportunity and strategic urgency" },
      { family: "patient_demand", weight: 0.6, rationale: "Market size and unmet need determine commercial opportunity" },
      { family: "payer_access", weight: 0.4, rationale: "Reimbursement landscape affects expected return but is secondary to technical success" },
      { family: "provider_behavioral", weight: 0.2, rationale: "Adoption forecasts are speculative at investment decision stage" },
      { family: "system_operational", weight: 0.0, rationale: "Operational logistics are irrelevant to investment decisions" },
    ],
    acceptanceRules: [
      "Signal describes probability of technical or clinical success",
      "Signal describes market opportunity size or competitive landscape",
      "Signal describes development cost, timeline, or resource requirements",
      "Signal describes strategic fit or portfolio context",
    ],
    rejectionRules: [
      "Signal describes post-launch commercial execution — premature for investment stage",
      "Signal describes physician prescribing behavior — downstream of development",
      "Signal describes supply chain logistics — operational, not strategic",
    ],
    framingNotes: "Investment/portfolio decisions evaluate whether to continue funding development. The question is 'should we invest?' not 'will it succeed commercially'. Focus on probability of technical success, market size, and expected return.",
  },

  operational_execution: {
    archetypeLabel: "Operational Execution / Supply Risk",
    archetypeCategory: "enterprise_system",
    primaryDecisionMechanism: "Operational continuity risk — can supply be maintained given manufacturing and supply chain conditions",
    decisionGrammar: "disruption event → capacity assessment → inventory evaluation → mitigation action → supply continuity determination",
    judgmentQuestions: [
      "Is there a credible manufacturing disruption?",
      "Is current inventory sufficient to bridge any gap?",
      "Can supply be maintained?",
    ],
    allowedSignalFamilies: ["system_operational", "brand_clinical_regulatory", "competitor"],
    forbiddenSignalFamilies: ["provider_behavioral", "patient_demand"],
    prioritizedFamilies: ["system_operational"],
    deprioritizedFamilies: ["competitor"],
    correctSignalTypes: [
      "FDA inspection observation or finding",
      "production delay or plant shutdown",
      "capacity loss or constraint",
      "inventory depletion trend",
      "supplier disruption",
      "batch failure or quality event",
    ],
    incorrectSignalTypes: [
      "clinical efficacy or trial outcomes",
      "physician adoption or prescribing preference",
      "market share or commercial performance",
      "guideline inclusion or recommendation",
    ],
    searchTargets: [
      "manufacturing facility inspection findings (FDA Form 483, warning letters)",
      "production delays, shutdowns, or capacity reductions",
      "inventory levels and depletion rates",
      "supply chain disruptions and supplier issues",
      "batch failures and quality events",
      "alternative source qualification status",
    ],
    relevanceScoringRules: [
      { family: "system_operational", weight: 1.0, rationale: "Manufacturing and supply chain factors are the primary determinants of supply continuity" },
      { family: "brand_clinical_regulatory", weight: 0.6, rationale: "Regulatory actions (warning letters, consent decrees) directly affect manufacturing ability" },
      { family: "competitor", weight: 0.3, rationale: "Competitor supply status provides context but doesn't affect own supply" },
      { family: "payer_access", weight: 0.0, rationale: "Payer decisions are irrelevant to manufacturing continuity" },
      { family: "patient_demand", weight: 0.0, rationale: "Patient demand is a consequence, not a driver of supply disruption" },
      { family: "provider_behavioral", weight: 0.0, rationale: "Prescribing behavior is irrelevant to manufacturing continuity" },
    ],
    acceptanceRules: [
      "Signal describes manufacturing capacity, quality events, or facility status",
      "Signal describes supply chain disruption or supplier issues",
      "Signal describes inventory levels or depletion rates",
      "Signal describes regulatory action affecting manufacturing (warning letters, consent decrees)",
    ],
    rejectionRules: [
      "Signal describes clinical efficacy — not relevant to supply continuity",
      "Signal describes physician prescribing behavior — downstream",
      "Signal describes market share or commercial performance — downstream",
      "Signal describes guideline recommendations — not relevant to supply",
    ],
    framingNotes: "Operational execution cases focus on 'can supply be maintained?' not 'will physicians prescribe it'. Prioritize manufacturing, quality, and supply chain signals above all others.",
  },

  strategic_partnership: {
    archetypeLabel: "Strategic Partnership / M&A",
    archetypeCategory: "enterprise_system",
    primaryDecisionMechanism: "Corporate strategy execution — will the deal (acquisition, licensing, partnership) happen",
    decisionGrammar: "strategic rationale → valuation assessment → negotiation progress → competitive bidding → deal completion or failure",
    judgmentQuestions: [
      "Is there strategic rationale for the deal?",
      "Is the valuation acceptable to both parties?",
      "Will the deal happen?",
    ],
    allowedSignalFamilies: ["brand_clinical_regulatory", "competitor", "payer_access"],
    forbiddenSignalFamilies: ["system_operational", "provider_behavioral", "patient_demand"],
    prioritizedFamilies: ["competitor", "brand_clinical_regulatory"],
    deprioritizedFamilies: [],
    correctSignalTypes: [
      "partnership discussions or announcements",
      "financing activity or capital raises",
      "strategic announcements or corporate communications",
      "board-level decisions or governance actions",
      "competitor bids or interest",
      "asset valuation and pipeline fit assessment",
    ],
    incorrectSignalTypes: [
      "physician adoption or prescribing behavior",
      "patient demand or disease awareness",
      "manufacturing logistics or supply chain",
      "formulary positioning or payer coverage",
    ],
    searchTargets: [
      "partnership discussions, licensing negotiations, and deal announcements",
      "financing activity, capital raises, and strategic investments",
      "corporate strategy announcements and board decisions",
      "competitor acquisition interest and competitive bidding",
      "asset valuation, pipeline fit, and strategic rationale",
      "SEC filings and investor communications",
    ],
    relevanceScoringRules: [
      { family: "competitor", weight: 1.0, rationale: "Competitive interest and bidding dynamics are primary deal drivers" },
      { family: "brand_clinical_regulatory", weight: 0.9, rationale: "Asset clinical value and regulatory status determine deal attractiveness" },
      { family: "payer_access", weight: 0.4, rationale: "Market access landscape affects asset valuation but not deal execution" },
      { family: "patient_demand", weight: 0.0, rationale: "Patient demand is downstream of deal execution" },
      { family: "provider_behavioral", weight: 0.0, rationale: "Prescribing behavior is irrelevant to corporate strategy decisions" },
      { family: "system_operational", weight: 0.0, rationale: "Operational logistics do not determine deal outcomes" },
    ],
    acceptanceRules: [
      "Signal describes deal progress, negotiations, or strategic announcements",
      "Signal describes asset valuation, pipeline fit, or strategic rationale",
      "Signal describes competitor interest or competitive bidding",
      "Signal describes financing activity or capital availability",
    ],
    rejectionRules: [
      "Signal describes physician prescribing behavior — irrelevant to deal execution",
      "Signal describes patient demand — downstream of deal outcome",
      "Signal describes manufacturing logistics — operational, not strategic",
    ],
    framingNotes: "Strategic partnership/M&A cases focus on 'will the deal happen?' not 'will the product succeed'. Prioritize corporate strategy, valuation, competitive dynamics, and deal progress signals.",
  },

  policy_environment: {
    archetypeLabel: "Policy / Environment Shift",
    archetypeCategory: "enterprise_system",
    primaryDecisionMechanism: "System-level environment change — will policy, legislation, or regulation alter the operating environment",
    decisionGrammar: "legislative/regulatory proposal → political dynamics → rulemaking process → implementation timeline → environment change determination",
    judgmentQuestions: [
      "Is there credible legislative or regulatory momentum?",
      "Is the political environment favorable for change?",
      "Will the environment change?",
    ],
    allowedSignalFamilies: ["brand_clinical_regulatory", "payer_access", "competitor", "patient_demand"],
    forbiddenSignalFamilies: ["system_operational", "provider_behavioral"],
    prioritizedFamilies: ["brand_clinical_regulatory", "payer_access"],
    deprioritizedFamilies: ["patient_demand"],
    correctSignalTypes: [
      "legislative proposal or bill progress",
      "regulatory guidance or rulemaking",
      "government budget action or allocation",
      "policy announcement or executive action",
      "political dynamics and stakeholder positions",
      "industry response and lobbying activity",
    ],
    incorrectSignalTypes: [
      "individual product clinical efficacy",
      "physician prescribing behavior",
      "manufacturing capacity or supply chain",
      "individual product market share",
    ],
    searchTargets: [
      "legislative proposals, bill progress, and committee actions",
      "regulatory guidance documents and rulemaking activity",
      "government budget actions affecting drug pricing or reimbursement",
      "policy announcements and executive actions",
      "industry lobbying and stakeholder positions",
      "political dynamics and electoral implications",
    ],
    relevanceScoringRules: [
      { family: "brand_clinical_regulatory", weight: 1.0, rationale: "Regulatory and legislative actions are the primary drivers of policy change" },
      { family: "payer_access", weight: 0.9, rationale: "Payer/reimbursement policy is often the target or consequence of system-level changes" },
      { family: "competitor", weight: 0.5, rationale: "Industry-wide competitive dynamics influence policy direction" },
      { family: "patient_demand", weight: 0.4, rationale: "Patient advocacy and public pressure influence political dynamics" },
      { family: "provider_behavioral", weight: 0.0, rationale: "Individual prescribing behavior does not drive system-level policy" },
      { family: "system_operational", weight: 0.0, rationale: "Operational logistics are irrelevant to policy change" },
    ],
    acceptanceRules: [
      "Signal describes legislative progress, regulatory guidance, or rulemaking",
      "Signal describes government budget actions or policy announcements",
      "Signal describes political dynamics or stakeholder positions on the policy",
      "Signal describes industry response or lobbying related to the policy",
    ],
    rejectionRules: [
      "Signal describes individual product clinical data — not policy-relevant",
      "Signal describes individual physician prescribing — too granular for policy analysis",
      "Signal describes manufacturing or supply chain — operational, not policy",
    ],
    framingNotes: "Policy/environment cases focus on 'will the system-level rules change?' not 'will a specific product succeed'. These are not product-specific — they affect entire therapeutic areas, drug classes, or the industry. Prioritize legislative, regulatory, and political signals.",
  },
};

const CLASSIFIER_TO_PROFILE_MAP: Record<CaseType, string> = {
  launch_readiness: "launch_readiness",
  competitive_defense: "competitive_defense",
  access_expansion: "access_expansion",
  clinical_adoption: "clinical_adoption",
  lifecycle_management: "lifecycle_management",
  market_shaping: "market_shaping",
  investment_portfolio: "investment_portfolio",
  operational_execution: "operational_execution",
  strategic_partnership: "strategic_partnership",
  policy_environment: "policy_environment",
  unclassified: "launch_readiness",
};

export function buildCaseFrame(
  questionText: string,
  subject: string,
  therapeuticArea?: string | null,
  diseaseState?: string | null,
): CaseFrame {
  const classification = classifyCaseType({
    strategicQuestion: questionText,
    therapeuticArea: therapeuticArea ?? null,
    diseaseState: diseaseState ?? null,
    assetName: subject,
  });

  const profile = getProfileForQuestion(questionText, classification.caseType);

  const classifierKey = CLASSIFIER_TO_PROFILE_MAP[classification.caseType];
  const routerKey = profile.caseType;
  let profileKey: string;

  if (ARCHETYPE_FRAMES[routerKey] && routerKey !== classifierKey && (
    routerKey === "safety_risk" ||
    routerKey === "regulatory_approval" ||
    routerKey === "clinical_outcome"
  )) {
    profileKey = routerKey;
  } else if (ARCHETYPE_FRAMES[classifierKey] && classification.confidence !== "low") {
    profileKey = classifierKey;
  } else if (ARCHETYPE_FRAMES[routerKey]) {
    profileKey = routerKey;
  } else {
    profileKey = classifierKey || "launch_readiness";
  }

  const frameDef = ARCHETYPE_FRAMES[profileKey] || ARCHETYPE_FRAMES["launch_readiness"];

  return {
    caseType: classification.caseType,
    profileCaseType: profileKey,
    archetypeLabel: frameDef.archetypeLabel,
    archetypeCategory: frameDef.archetypeCategory,
    primaryDecisionMechanism: frameDef.primaryDecisionMechanism,
    decisionGrammar: frameDef.decisionGrammar,
    judgmentQuestions: frameDef.judgmentQuestions,
    allowedSignalFamilies: frameDef.allowedSignalFamilies,
    forbiddenSignalFamilies: frameDef.forbiddenSignalFamilies,
    prioritizedFamilies: frameDef.prioritizedFamilies,
    deprioritizedFamilies: frameDef.deprioritizedFamilies,
    correctSignalTypes: frameDef.correctSignalTypes,
    incorrectSignalTypes: frameDef.incorrectSignalTypes,
    searchTargets: frameDef.searchTargets,
    relevanceScoringRules: frameDef.relevanceScoringRules,
    acceptanceRules: frameDef.acceptanceRules,
    rejectionRules: frameDef.rejectionRules,
    framingNotes: frameDef.framingNotes,
  };
}

export function buildFrameConstraintPrompt(frame: CaseFrame): string {
  let prompt = `\n\nCASE FRAMING LAYER (MANDATORY — ${frame.archetypeLabel.toUpperCase()}):
This case has been classified as "${frame.archetypeLabel}" (${frame.archetypeCategory === "enterprise_system" ? "Enterprise / System-Level" : "Core Clinical-Commercial"} archetype).

PRIMARY DECISION MECHANISM: ${frame.primaryDecisionMechanism}

DECISION GRAMMAR (causal chain): ${frame.decisionGrammar}
Every signal must be causally linked to a step in this chain. If a signal does not influence any step, EXCLUDE it.

JUDGMENT QUESTIONS (the system must answer):`;
  for (const q of frame.judgmentQuestions) {
    prompt += `\n- ${q}`;
  }

  if (frame.correctSignalTypes.length > 0) {
    prompt += `\n\nCORRECT SIGNAL TYPES (generate these):`;
    for (const t of frame.correctSignalTypes) {
      prompt += `\n- ${t}`;
    }
  }

  if (frame.incorrectSignalTypes.length > 0) {
    prompt += `\n\nINCORRECT SIGNAL TYPES (do NOT generate these):`;
    for (const t of frame.incorrectSignalTypes) {
      prompt += `\n- ${t}`;
    }
  }

  prompt += `\n\nSIGNAL FAMILY CONSTRAINTS:`;

  if (frame.allowedSignalFamilies.length < ALL_SIGNAL_FAMILIES.length) {
    prompt += `\n- ALLOWED families: ${frame.allowedSignalFamilies.join(", ")}`;
  }

  if (frame.forbiddenSignalFamilies.length > 0) {
    prompt += `\n- FORBIDDEN families (do NOT generate these): ${frame.forbiddenSignalFamilies.join(", ")}`;
  }

  if (frame.prioritizedFamilies.length > 0) {
    prompt += `\n- PRIORITIZED families (generate more signals from these): ${frame.prioritizedFamilies.join(", ")}`;
  }

  if (frame.deprioritizedFamilies.length > 0) {
    prompt += `\n- DE-PRIORITIZED families (include only if strongly causal): ${frame.deprioritizedFamilies.join(", ")}`;
  }

  prompt += `\n\nSEARCH TARGETS (focus your analysis on these):`;
  for (const target of frame.searchTargets) {
    prompt += `\n- ${target}`;
  }

  prompt += `\n\nRELEVANCE SCORING:`;
  for (const rule of frame.relevanceScoringRules) {
    if (rule.weight > 0) {
      prompt += `\n- ${rule.family} (weight: ${rule.weight}): ${rule.rationale}`;
    }
  }

  prompt += `\n\nSIGNAL ACCEPTANCE RULES:`;
  for (const rule of frame.acceptanceRules) {
    prompt += `\n- ACCEPT: ${rule}`;
  }

  prompt += `\n\nSIGNAL REJECTION RULES:`;
  for (const rule of frame.rejectionRules) {
    prompt += `\n- REJECT: ${rule}`;
  }

  if (frame.framingNotes) {
    prompt += `\n\nFRAMING NOTES: ${frame.framingNotes}`;
  }

  return prompt;
}

export function filterSignalsByFrame(
  signals: any[],
  frame: CaseFrame,
): { accepted: any[]; rejected: { signal: any; reason: string }[] } {
  const accepted: any[] = [];
  const rejected: { signal: any; reason: string }[] = [];

  for (const signal of signals) {
    const family = signal.signal_family as SignalFamily;

    if (frame.forbiddenSignalFamilies.includes(family)) {
      rejected.push({
        signal,
        reason: `Signal family "${family}" is forbidden for ${frame.profileCaseType} cases`,
      });
      continue;
    }

    if (frame.allowedSignalFamilies.length > 0 && !frame.allowedSignalFamilies.includes(family)) {
      rejected.push({
        signal,
        reason: `Signal family "${family}" is not in the allowed list for ${frame.profileCaseType} cases`,
      });
      continue;
    }

    accepted.push(signal);
  }

  return { accepted, rejected };
}

export function scoreSignalRelevance(
  signal: any,
  frame: CaseFrame,
): number {
  const family = signal.signal_family as SignalFamily;
  const rule = frame.relevanceScoringRules.find(r => r.family === family);
  const familyWeight = rule?.weight ?? 0.5;

  let strengthMultiplier = 1.0;
  if (signal.strength === "High") strengthMultiplier = 1.0;
  else if (signal.strength === "Medium") strengthMultiplier = 0.7;
  else if (signal.strength === "Low") strengthMultiplier = 0.4;

  let translationMultiplier = 1.0;
  if (signal.translation_confidence === "high") translationMultiplier = 1.0;
  else if (signal.translation_confidence === "moderate") translationMultiplier = 0.7;
  else if (signal.translation_confidence === "low") translationMultiplier = 0.4;

  return Math.round(familyWeight * strengthMultiplier * translationMultiplier * 100) / 100;
}
