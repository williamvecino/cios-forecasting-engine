import type { QuestionType } from "./case-context.js";

export type CaseType =
  | "launch_readiness"
  | "competitive_defense"
  | "access_expansion"
  | "clinical_adoption"
  | "lifecycle_management"
  | "market_shaping"
  | "investment_portfolio"
  | "operational_execution"
  | "strategic_partnership"
  | "policy_environment"
  | "generic_entry_timing"
  | "unclassified";

export interface CaseTypeResult {
  caseType: CaseType;
  confidence: "high" | "medium" | "low";
  matchedSignals: string[];
  driverDomains: string[];
  description: string;
}

interface CaseInput {
  strategicQuestion: string | null;
  therapeuticArea: string | null;
  diseaseState: string | null;
  assetName?: string | null;
  questionType?: QuestionType;
  timeHorizon?: string | null;
  payerEnvironment?: string | null;
  competitorProfile?: string | null;
}

const CASE_TYPE_RULES: {
  type: CaseType;
  keywords: string[];
  questionTypes?: QuestionType[];
  contextPatterns?: RegExp[];
  driverDomains: string[];
  description: string;
}[] = [
  {
    type: "launch_readiness",
    keywords: ["launch", "pre-launch", "new indication", "approval", "filing", "nda", "bla", "regulatory", "fda", "ema", "pdufa"],
    questionTypes: ["adoption_probability", "time_to_adoption"],
    contextPatterns: [/launch/i, /pre.?launch/i, /new\s+indication/i, /approval/i, /first.?in.?class/i],
    driverDomains: ["regulatory_readiness", "field_force_deployment", "channel_access", "medical_education", "kol_engagement", "supply_chain"],
    description: "New product or indication launch — focuses on readiness gates, field force alignment, and initial access",
  },
  {
    type: "generic_entry_timing",
    keywords: ["generic", "biosimilar", "launch", "entry", "anda", "paragraph iv", "settlement", "manufacturing", "vial", "lyophilized", "sterile", "delayed", "delay"],
    questionTypes: ["adoption_probability", "time_to_adoption"],
    contextPatterns: [/generic.*launch/i, /generic.*entry/i, /biosimilar.*launch/i, /launch.*generic/i, /launch.*biosimilar/i, /will.*launch.*by/i, /will.*launch.*in/i, /delayed.*to/i, /timing/i, /anda/i, /paragraph\s+iv/i, /settlement/i],
    driverDomains: ["ip_settlement_terms", "manufacturing_readiness", "anda_regulatory_status", "management_signaling", "analyst_consensus", "supply_chain_capability", "capacity_constraints"],
    description: "Generic/biosimilar entry timing — focuses on IP settlement, manufacturing readiness, ANDA status, management signaling, and supply chain capability",
  },
  {
    type: "competitive_defense",
    keywords: ["competitive", "competitor", "biosimilar", "generic", "loss of exclusivity", "loe", "defend", "differentiat", "switch", "market share loss"],
    questionTypes: ["competitive_comparison", "market_share"],
    contextPatterns: [/compet/i, /biosimilar/i, /generic/i, /vs\.?\s/i, /versus/i, /switch/i, /erosion/i, /defend/i],
    driverDomains: ["competitive_intelligence", "differentiation_messaging", "loyalty_programs", "contracting_strategy", "real_world_evidence"],
    description: "Defending market position against competitive entry — focuses on differentiation, retention, and contracting",
  },
  {
    type: "access_expansion",
    keywords: ["access", "coverage", "reimbursement", "formulary", "payer", "value", "hecon", "prior auth", "step therapy", "restriction"],
    questionTypes: ["threshold_achievement"],
    contextPatterns: [/access/i, /formulary/i, /reimburs/i, /payer/i, /coverage/i, /step.?therapy/i, /prior.?auth/i],
    driverDomains: ["payer_engagement", "value_dossier", "patient_support", "hub_services", "outcomes_evidence", "contracting_strategy"],
    description: "Expanding or securing payer access — focuses on value demonstration, payer engagement, and patient support",
  },
  {
    type: "clinical_adoption",
    keywords: ["clinical", "guideline", "treatment", "prescrib", "physician", "adoption", "practice change", "standard of care", "evidence"],
    questionTypes: ["adoption_probability", "specialty_penetration"],
    contextPatterns: [/clinical\s+adopt/i, /guideline/i, /practice\s+change/i, /prescrib/i, /treatment\s+paradigm/i, /standard\s+of\s+care/i],
    driverDomains: ["clinical_evidence", "guideline_positioning", "medical_affairs", "kol_engagement", "congress_strategy", "peer_influence"],
    description: "Driving clinical adoption through evidence and guidelines — focuses on medical affairs, KOL engagement, and evidence generation",
  },
  {
    type: "lifecycle_management",
    keywords: ["lifecycle", "mature", "established", "optimize", "maximize", "sustain", "growth", "expansion", "line extension"],
    questionTypes: ["market_share", "threshold_achievement"],
    contextPatterns: [/lifecycle/i, /mature\s+brand/i, /established/i, /optimization/i, /line\s+extension/i],
    driverDomains: ["patient_finding", "adherence_programs", "digital_engagement", "label_expansion", "real_world_evidence", "commercial_optimization"],
    description: "Mature product lifecycle management — focuses on patient finding, adherence, and commercial optimization",
  },
  {
    type: "market_shaping",
    keywords: ["market shap", "disease awareness", "unmet need", "education", "early market", "pre-commercial", "pre-market"],
    questionTypes: ["time_to_adoption"],
    contextPatterns: [/market\s+shap/i, /disease\s+aware/i, /unmet\s+need/i, /pre.?commercial/i],
    driverDomains: ["disease_education", "diagnostic_pathway", "referral_network", "patient_advocacy", "epidemiology", "market_research"],
    description: "Pre-commercial market shaping — focuses on disease awareness, diagnosis pathways, and stakeholder education",
  },
  {
    type: "investment_portfolio",
    keywords: ["invest", "portfolio", "continue funding", "terminate", "go/no-go", "capital allocation", "asset valuation", "pipeline priorit", "phase 2", "phase ii", "discontinue", "divest"],
    contextPatterns: [/continue\s+(develop|fund)/i, /go.?no.?go/i, /portfolio\s+decision/i, /capital\s+alloc/i, /terminate\s+/i, /discontinue/i, /pipeline\s+priorit/i, /asset\s+valuation/i, /development\s+decision/i],
    driverDomains: ["technical_success_probability", "market_size", "development_cost", "expected_return", "strategic_fit", "risk_tolerance"],
    description: "Investment / portfolio decision — capital allocation under uncertainty, continue vs terminate development",
  },
  {
    type: "operational_execution",
    keywords: ["supply disruption", "manufacturing outage", "supply shortage", "plant shutdown", "batch failure", "capacity constraint", "supply chain", "operational continuity", "drug shortage", "manufacturing issue"],
    contextPatterns: [/supply\s+(disrupt|shortage)/i, /manufactur.*(outage|issue|failure)/i, /plant\s+shutdown/i, /batch\s+fail/i, /capacity\s+constraint/i, /drug\s+shortage/i, /operational\s+continuity/i],
    driverDomains: ["manufacturing_continuity", "supply_chain_resilience", "inventory_management", "quality_compliance", "capacity_planning"],
    description: "Operational execution / supply disruption — manufacturing and supply chain continuity risk",
  },
  {
    type: "strategic_partnership",
    keywords: ["acqui", "merger", "m&a", "licensing", "partnership", "deal", "joint venture", "collaboration agreement", "strategic alliance", "asset acquisition", "in-licens", "out-licens"],
    contextPatterns: [/acqui(re|sition)/i, /merg(e|er)/i, /m\s*&\s*a/i, /licens(e|ing)\s+(deal|agreement)/i, /strategic\s+(partner|alliance)/i, /joint\s+venture/i, /in.?licens/i, /out.?licens/i],
    driverDomains: ["valuation", "pipeline_fit", "financial_capacity", "negotiation_progress", "competitive_interest", "strategic_rationale"],
    description: "Strategic partnership / M&A — corporate strategy execution, acquisition or licensing decisions",
  },
  {
    type: "policy_environment",
    keywords: ["policy change", "legislation", "regulatory environment", "reimbursement environment", "government policy", "medicare negotiat", "price negotiat", "drug pricing", "ira", "inflation reduction", "regulatory reform", "rulemaking"],
    contextPatterns: [/policy\s+change/i, /legislat(ion|ive)/i, /government\s+policy/i, /medicare\s+negotiat/i, /drug\s+pric/i, /inflation\s+reduction/i, /regulatory\s+reform/i, /reimbursement\s+environment/i, /rulemaking/i, /national\s+policy/i],
    driverDomains: ["legislation", "rulemaking", "government_policy", "budget_constraints", "political_pressure", "regulatory_reform"],
    description: "Policy / environment shift — system-level regulatory or reimbursement environment changes",
  },
];

export function classifyCaseType(input: CaseInput): CaseTypeResult {
  const q = (input.strategicQuestion ?? "").toLowerCase();
  const ta = (input.therapeuticArea ?? "").toLowerCase();
  const ds = (input.diseaseState ?? "").toLowerCase();
  const asset = (input.assetName ?? "").toLowerCase();
  const fullText = `${q} ${ta} ${ds} ${asset}`;

  const scores: { type: CaseType; score: number; matched: string[]; rule: typeof CASE_TYPE_RULES[0] }[] = [];

  for (const rule of CASE_TYPE_RULES) {
    let score = 0;
    const matched: string[] = [];

    for (const kw of rule.keywords) {
      if (fullText.includes(kw)) {
        score += 2;
        matched.push(`keyword:${kw}`);
      }
    }

    if (rule.questionTypes && input.questionType && rule.questionTypes.includes(input.questionType)) {
      score += 3;
      matched.push(`questionType:${input.questionType}`);
    }

    if (rule.contextPatterns) {
      for (const pat of rule.contextPatterns) {
        if (pat.test(fullText)) {
          score += 1;
          matched.push(`pattern:${pat.source}`);
        }
      }
    }

    if (score > 0) {
      scores.push({ type: rule.type, score, matched, rule });
    }
  }

  scores.sort((a, b) => b.score - a.score);

  if (scores.length === 0) {
    return {
      caseType: "unclassified",
      confidence: "low",
      matchedSignals: [],
      driverDomains: ["general_commercial", "evidence_generation", "market_access"],
      description: "Case does not match any specific type pattern — using general driver set",
    };
  }

  const best = scores[0];
  const second = scores[1];
  const confidence: "high" | "medium" | "low" =
    best.score >= 6 ? "high" :
    best.score >= 3 && (!second || best.score > second.score * 1.5) ? "medium" :
    "low";

  return {
    caseType: best.type,
    confidence,
    matchedSignals: [...new Set(best.matched)],
    driverDomains: best.rule.driverDomains,
    description: best.rule.description,
  };
}

export function getCaseTypeDriverDomains(caseType: CaseType): string[] {
  const rule = CASE_TYPE_RULES.find(r => r.type === caseType);
  return rule?.driverDomains ?? ["general_commercial", "evidence_generation", "market_access"];
}

export const ALL_CASE_TYPES = CASE_TYPE_RULES.map(r => ({
  type: r.type,
  description: r.description,
  driverDomains: r.driverDomains,
}));
