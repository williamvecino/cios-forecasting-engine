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

export interface CaseFrame {
  caseType: CaseType;
  profileCaseType: string;
  primaryDecisionMechanism: string;
  decisionGrammar: string;
  allowedSignalFamilies: SignalFamily[];
  forbiddenSignalFamilies: SignalFamily[];
  prioritizedFamilies: SignalFamily[];
  deprioritizedFamilies: SignalFamily[];
  searchTargets: string[];
  relevanceScoringRules: RelevanceScoringRule[];
  acceptanceRules: string[];
  rejectionRules: string[];
  framingNotes: string;
}

interface ArchetypeFrameDefinition {
  primaryDecisionMechanism: string;
  decisionGrammar: string;
  allowedSignalFamilies: SignalFamily[];
  forbiddenSignalFamilies: SignalFamily[];
  prioritizedFamilies: SignalFamily[];
  deprioritizedFamilies: SignalFamily[];
  searchTargets: string[];
  relevanceScoringRules: RelevanceScoringRule[];
  acceptanceRules: string[];
  rejectionRules: string[];
  framingNotes: string;
}

const ARCHETYPE_FRAMES: Record<string, ArchetypeFrameDefinition> = {
  clinical_outcome: {
    primaryDecisionMechanism: "Trial endpoint success determined by clinical data, statistical plan, and safety profile",
    decisionGrammar: "trial design → enrollment quality → endpoint measurement → statistical analysis → clinical relevance determination",
    allowedSignalFamilies: ["brand_clinical_regulatory", "competitor", "patient_demand"],
    forbiddenSignalFamilies: ["system_operational", "payer_access"],
    prioritizedFamilies: ["brand_clinical_regulatory"],
    deprioritizedFamilies: ["competitor", "patient_demand"],
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
    primaryDecisionMechanism: "Regulatory agency benefit-risk assessment based on submitted evidence package",
    decisionGrammar: "evidence submission → regulatory review → advisory committee → benefit-risk determination → approval/rejection decision",
    allowedSignalFamilies: ["brand_clinical_regulatory", "competitor", "patient_demand"],
    forbiddenSignalFamilies: ["system_operational", "payer_access"],
    prioritizedFamilies: ["brand_clinical_regulatory"],
    deprioritizedFamilies: ["patient_demand"],
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
    primaryDecisionMechanism: "Safety signal severity and regulatory response determining restriction level",
    decisionGrammar: "safety signal detection → causality assessment → regulatory review → guideline revision → restriction/action determination",
    allowedSignalFamilies: ["brand_clinical_regulatory", "competitor", "patient_demand", "provider_behavioral", "payer_access"],
    forbiddenSignalFamilies: ["system_operational"],
    prioritizedFamilies: ["brand_clinical_regulatory"],
    deprioritizedFamilies: ["provider_behavioral", "patient_demand"],
    searchTargets: [
      "adverse event reports and pharmacovigilance data",
      "FDA/EMA safety communications or REMS updates",
      "post-marketing study results",
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
    primaryDecisionMechanism: "Multi-gate commercial readiness enabling market uptake post-approval",
    decisionGrammar: "regulatory clearance → payer access negotiation → field force deployment → KOL engagement → prescriber awareness → initial adoption",
    allowedSignalFamilies: ALL_SIGNAL_FAMILIES.slice(),
    forbiddenSignalFamilies: [],
    prioritizedFamilies: ["brand_clinical_regulatory", "payer_access", "provider_behavioral"],
    deprioritizedFamilies: ["system_operational"],
    searchTargets: [
      "regulatory approval status and label scope",
      "payer coverage decisions and formulary positioning",
      "field force readiness and deployment timeline",
      "KOL engagement and medical education programs",
      "competitor launches in the same window",
      "patient awareness and disease education campaigns",
      "site readiness and administration logistics",
    ],
    relevanceScoringRules: [
      { family: "brand_clinical_regulatory", weight: 1.0, rationale: "Approval status and label scope are gating conditions for launch" },
      { family: "payer_access", weight: 0.9, rationale: "Coverage and formulary access directly constrain prescribing volume" },
      { family: "provider_behavioral", weight: 0.85, rationale: "Physician awareness and prescribing readiness directly drive initial uptake" },
      { family: "competitor", weight: 0.7, rationale: "Competitive launches affect prescriber attention and formulary positioning" },
      { family: "patient_demand", weight: 0.6, rationale: "Patient demand creates pull but is secondary to access and physician behavior" },
      { family: "system_operational", weight: 0.5, rationale: "Operational readiness (administration, supply) can bottleneck launch but is rarely the deciding factor" },
    ],
    acceptanceRules: [
      "Signal describes a gating condition for market entry (approval, access, readiness)",
      "Signal describes a driver of initial prescribing behavior",
      "Signal describes competitive dynamics that affect launch window or positioning",
    ],
    rejectionRules: [
      "Signal describes mature market dynamics — launch cases focus on initial entry",
      "Signal describes long-term lifecycle management — premature for launch",
    ],
    framingNotes: "Launch cases are the broadest archetype — all 6 signal families may be relevant. Prioritize gating conditions (approval, access) over behavioral signals.",
  },

  competitive_defense: {
    primaryDecisionMechanism: "Incumbent retention driven by differentiation, switching barriers, and competitive response",
    decisionGrammar: "competitor entry → prescriber evaluation → switching cost assessment → differentiation messaging → retention or erosion",
    allowedSignalFamilies: ["brand_clinical_regulatory", "payer_access", "competitor", "provider_behavioral", "patient_demand"],
    forbiddenSignalFamilies: ["system_operational"],
    prioritizedFamilies: ["competitor", "provider_behavioral", "payer_access"],
    deprioritizedFamilies: ["patient_demand"],
    searchTargets: [
      "competitor clinical data, approvals, and label comparisons",
      "biosimilar/generic entry timelines and pricing",
      "prescriber switching intent and loyalty patterns",
      "payer formulary positioning and cost differentials",
      "real-world evidence differentiating incumbent vs competitor",
      "contracting and rebate strategies",
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
      "Signal describes clinical differentiation evidence",
    ],
    rejectionRules: [
      "Signal describes regulatory approval of the incumbent — already established",
      "Signal describes new indication development — this is lifecycle, not defense",
      "Signal describes operational logistics unrelated to competitive dynamics",
    ],
    framingNotes: "Competitive defense cases center on the competitor, not the incumbent brand. The causal chain starts with competitor action and traces to incumbent share impact.",
  },

  access_expansion: {
    primaryDecisionMechanism: "Payer coverage decision driven by value evidence, budget impact, and policy dynamics",
    decisionGrammar: "value evidence generation → payer engagement → formulary review → coverage decision → prescribing volume impact",
    allowedSignalFamilies: ["payer_access", "brand_clinical_regulatory", "competitor", "patient_demand", "provider_behavioral"],
    forbiddenSignalFamilies: ["system_operational"],
    prioritizedFamilies: ["payer_access", "brand_clinical_regulatory"],
    deprioritizedFamilies: ["system_operational"],
    searchTargets: [
      "payer policy changes and formulary review timelines",
      "prior authorization and step therapy requirements",
      "health economics and cost-effectiveness evidence",
      "competitor pricing and access positioning",
      "patient support program effectiveness",
      "real-world evidence supporting value demonstration",
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
      "Signal describes cost-effectiveness or budget impact evidence",
      "Signal describes competitor pricing or access dynamics that affect relative positioning",
    ],
    rejectionRules: [
      "Signal describes clinical endpoint data without connection to value demonstration",
      "Signal describes supply chain or manufacturing — operational, not access",
    ],
    framingNotes: "Access cases prioritize payer-facing evidence and policy dynamics. Clinical signals are relevant only when they support or undermine value arguments.",
  },

  clinical_adoption: {
    primaryDecisionMechanism: "Physician practice change driven by evidence, guidelines, and peer influence",
    decisionGrammar: "clinical evidence publication → guideline committee review → KOL endorsement → peer influence cascade → practice pattern change",
    allowedSignalFamilies: ["brand_clinical_regulatory", "provider_behavioral", "competitor", "payer_access", "patient_demand"],
    forbiddenSignalFamilies: ["system_operational"],
    prioritizedFamilies: ["brand_clinical_regulatory", "provider_behavioral"],
    deprioritizedFamilies: ["patient_demand"],
    searchTargets: [
      "clinical trial publications and congress presentations",
      "guideline committee reviews and recommendation changes",
      "KOL endorsements and speaking engagements",
      "real-world evidence supporting practice change",
      "medical education programs and peer influence",
      "competitor evidence and positioning in guidelines",
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
    ],
    rejectionRules: [
      "Signal describes manufacturing or supply logistics — not a practice change driver",
      "Signal describes financial performance or revenue — downstream",
    ],
    framingNotes: "Clinical adoption cases focus on the evidence-to-behavior causal chain. The key question is whether clinical evidence is sufficient to change physician practice.",
  },

  lifecycle_management: {
    primaryDecisionMechanism: "Sustained growth through patient finding, adherence optimization, and label expansion",
    decisionGrammar: "patient identification → diagnosis pathway → treatment initiation → adherence maintenance → label expansion opportunity",
    allowedSignalFamilies: ALL_SIGNAL_FAMILIES.slice(),
    forbiddenSignalFamilies: [],
    prioritizedFamilies: ["provider_behavioral", "patient_demand", "payer_access"],
    deprioritizedFamilies: ["system_operational"],
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
    primaryDecisionMechanism: "Pre-commercial stakeholder engagement creating conditions for future market entry",
    decisionGrammar: "disease awareness → diagnostic pathway establishment → referral network creation → patient advocacy alignment → treatment readiness",
    allowedSignalFamilies: ["brand_clinical_regulatory", "patient_demand", "provider_behavioral", "competitor"],
    forbiddenSignalFamilies: ["system_operational", "payer_access"],
    prioritizedFamilies: ["patient_demand", "provider_behavioral"],
    deprioritizedFamilies: ["competitor"],
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
};

const CLASSIFIER_TO_PROFILE_MAP: Record<CaseType, string> = {
  launch_readiness: "launch_readiness",
  competitive_defense: "competitive_defense",
  access_expansion: "access_expansion",
  clinical_adoption: "clinical_adoption",
  lifecycle_management: "lifecycle_management",
  market_shaping: "market_shaping",
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
    primaryDecisionMechanism: frameDef.primaryDecisionMechanism,
    decisionGrammar: frameDef.decisionGrammar,
    allowedSignalFamilies: frameDef.allowedSignalFamilies,
    forbiddenSignalFamilies: frameDef.forbiddenSignalFamilies,
    prioritizedFamilies: frameDef.prioritizedFamilies,
    deprioritizedFamilies: frameDef.deprioritizedFamilies,
    searchTargets: frameDef.searchTargets,
    relevanceScoringRules: frameDef.relevanceScoringRules,
    acceptanceRules: frameDef.acceptanceRules,
    rejectionRules: frameDef.rejectionRules,
    framingNotes: frameDef.framingNotes,
  };
}

export function buildFrameConstraintPrompt(frame: CaseFrame): string {
  let prompt = `\n\nCASE FRAMING LAYER (MANDATORY — ${frame.profileCaseType.replace(/_/g, " ").toUpperCase()}):
This case has been classified as "${frame.profileCaseType.replace(/_/g, " ")}".

PRIMARY DECISION MECHANISM: ${frame.primaryDecisionMechanism}

DECISION GRAMMAR (causal chain): ${frame.decisionGrammar}
Every signal must be causally linked to a step in this chain. If a signal does not influence any step, EXCLUDE it.

SIGNAL FAMILY CONSTRAINTS:`;

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
