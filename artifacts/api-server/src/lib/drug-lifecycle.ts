export type DrugStage =
  | "INVESTIGATIONAL"
  | "RECENTLY_APPROVED"
  | "ESTABLISHED"
  | "MATURE";

export type SignalCategory =
  | "clinical"
  | "regulatory"
  | "payer"
  | "safety"
  | "guidelines"
  | "competitive";

export const SIGNAL_CATEGORY_LABELS: Record<SignalCategory, string> = {
  clinical: "Clinical Evidence",
  regulatory: "Regulatory / Label",
  payer: "Payer / Access",
  safety: "Safety",
  guidelines: "Guidelines",
  competitive: "Competitive / Market",
};

export interface CategorySourceEntry {
  rank: number;
  sourceId: string;
  label: string;
  queryTemplate: string;
  urlPatterns: string[];
  fetchStrategy: "replit_direct" | "colab_pdf" | "colab_pubmed" | "api_direct";
  isProxy: boolean;
  proxyNote: string | null;
  noDataFlag: string | null;
}

export interface CategorySourceMap {
  category: SignalCategory;
  categoryLabel: string;
  sources: CategorySourceEntry[];
  analystNote: string | null;
}

export interface StageSourceMap {
  stage: DrugStage;
  label: string;
  categories: CategorySourceMap[];
}

export interface StageClassification {
  stage: DrugStage;
  label: string;
  rationale: string;
  sourcePriority: SourcePriority[];
  categoryMap: CategorySourceMap[];
}

export interface SourcePriority {
  rank: number;
  sourceType: string;
  description: string;
  urlPatterns: string[];
  fetchStrategy: "replit_direct" | "colab_pdf" | "colab_pubmed" | "api_direct";
}

const SOURCE_MAP: Record<DrugStage, Record<SignalCategory, {
  sources: Omit<CategorySourceEntry, "rank">[];
  analystNote: string | null;
}>> = {
  INVESTIGATIONAL: {
    clinical: {
      sources: [
        {
          sourceId: "ct_gov_trial",
          label: "ClinicalTrials.gov",
          queryTemplate: "site:clinicaltrials.gov {drug} {indication}",
          urlPatterns: ["clinicaltrials.gov"],
          fetchStrategy: "api_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "sponsor_ir_topline",
          label: "Sponsor IR press releases (topline results)",
          queryTemplate: "{sponsor} {drug} topline results press release",
          urlPatterns: ["ir.", "investor.", "newsroom."],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "sec_8k_clinical",
          label: "SEC 8-K material disclosures",
          queryTemplate: "site:sec.gov {sponsor} {drug} 8-K",
          urlPatterns: ["sec.gov", "edgar"],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "conference_abstract",
          label: "Conference abstracts (poster/oral)",
          queryTemplate: "{drug} {indication} abstract presentation {year}",
          urlPatterns: ["asco.org", "ash.org", "aacr.org", "ats.org", "idsa.org"],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "pubmed_if_published",
          label: "PubMed (only if published)",
          queryTemplate: "{drug} {indication} phase clinical trial",
          urlPatterns: ["pubmed.ncbi.nlm.nih.gov"],
          fetchStrategy: "colab_pubmed",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
      ],
      analystNote: null,
    },
    regulatory: {
      sources: [
        {
          sourceId: "ct_gov_status",
          label: "ClinicalTrials.gov trial status",
          queryTemplate: "site:clinicaltrials.gov {drug} {indication}",
          urlPatterns: ["clinicaltrials.gov"],
          fetchStrategy: "api_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "fda_breakthrough",
          label: "FDA breakthrough/fast track designation",
          queryTemplate: "site:fda.gov {drug} breakthrough therapy designation",
          urlPatterns: ["fda.gov"],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "class_analog_fda",
          label: "FDA precedents for same mechanism class",
          queryTemplate: "site:fda.gov {mechanism_class} approval precedent",
          urlPatterns: ["fda.gov"],
          fetchStrategy: "replit_direct",
          isProxy: true,
          proxyNote: "No direct regulatory data for this investigational drug. Searched same-class FDA precedents as proxy.",
          noDataFlag: null,
        },
      ],
      analystNote: "Pre-approval — regulatory data limited to designations and class precedents.",
    },
    payer: {
      sources: [
        {
          sourceId: "class_analog_cms",
          label: "Class analog CMS coverage (proxy)",
          queryTemplate: "site:cms.gov {class_analog} coverage {indication}",
          urlPatterns: ["cms.gov", "medicare.gov"],
          fetchStrategy: "replit_direct",
          isProxy: true,
          proxyNote: "No coverage data for Stage 1 drug. Searched class analog as proxy. Review before approving.",
          noDataFlag: "No payer/coverage data exists for an investigational drug.",
        },
      ],
      analystNote: "No coverage data available for Stage 1 drug. Class analog searched as proxy.",
    },
    safety: {
      sources: [
        {
          sourceId: "trial_safety_profile",
          label: "Phase 2/3 trial safety data",
          queryTemplate: "{drug} phase safety adverse events clinical trial",
          urlPatterns: ["pubmed.ncbi.nlm.nih.gov", "clinicaltrials.gov"],
          fetchStrategy: "colab_pubmed",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "class_analog_safety",
          label: "Same-class FDA safety signals (proxy)",
          queryTemplate: "site:fda.gov {mechanism_class} safety adverse events",
          urlPatterns: ["fda.gov"],
          fetchStrategy: "replit_direct",
          isProxy: true,
          proxyNote: "Pre-approval safety — no post-market data. Class analog safety profile used as proxy.",
          noDataFlag: "No post-market safety data exists for a pre-approval drug.",
        },
      ],
      analystNote: "Pre-approval safety — class analog used. No FAERS or post-market data available.",
    },
    guidelines: {
      sources: [
        {
          sourceId: "society_position",
          label: "Society position statements",
          queryTemplate: "{indication} society position statement {drug_class} emerging therapy",
          urlPatterns: [],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "pipeline_guideline_mention",
          label: "Pipeline mentions in existing guidelines",
          queryTemplate: "site:{society_url} {indication} emerging therapy pipeline",
          urlPatterns: [],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: "Pre-approval — no guideline expected until 12-24 months post-approval.",
        },
      ],
      analystNote: "Pre-approval — no guideline expected until 12-24 months post-approval.",
    },
    competitive: {
      sources: [
        {
          sourceId: "pipeline_competitors",
          label: "Pipeline competitor trials",
          queryTemplate: "site:clinicaltrials.gov {indication} phase 3",
          urlPatterns: ["clinicaltrials.gov"],
          fetchStrategy: "api_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "competitor_ir",
          label: "Competitor IR announcements",
          queryTemplate: "{indication} competitor pipeline announcement {year}",
          urlPatterns: ["ir.", "investor."],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
      ],
      analystNote: null,
    },
  },

  RECENTLY_APPROVED: {
    clinical: {
      sources: [
        {
          sourceId: "fda_medical_review",
          label: "FDA medical review",
          queryTemplate: "site:fda.gov {drug} medical review",
          urlPatterns: ["fda.gov"],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "pubmed_pivotal",
          label: "PubMed pivotal trial publication",
          queryTemplate: "{drug} {indication} pivotal trial randomized",
          urlPatterns: ["pubmed.ncbi.nlm.nih.gov"],
          fetchStrategy: "colab_pubmed",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "sponsor_rwe",
          label: "Sponsor RWE publications",
          queryTemplate: "{sponsor} {drug} real world evidence data",
          urlPatterns: ["ir.", "investor.", "newsroom."],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "conference_updates",
          label: "Conference updates",
          queryTemplate: "{drug} {indication} conference presentation {year}",
          urlPatterns: ["asco.org", "ats.org", "idsa.org"],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
      ],
      analystNote: null,
    },
    regulatory: {
      sources: [
        {
          sourceId: "fda_full_label",
          label: "FDA prescribing information (full label)",
          queryTemplate: "site:accessdata.fda.gov {drug} label",
          urlPatterns: ["accessdata.fda.gov", "dailymed.nlm.nih.gov"],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "fda_approval_letter",
          label: "FDA approval letter",
          queryTemplate: "site:fda.gov {drug} approval letter",
          urlPatterns: ["fda.gov"],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "rems_database",
          label: "REMS database (if applicable)",
          queryTemplate: "site:fda.gov {drug} REMS risk evaluation",
          urlPatterns: ["fda.gov"],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "fda_safety_comm",
          label: "FDA safety communications",
          queryTemplate: "site:fda.gov/safety {drug}",
          urlPatterns: ["fda.gov"],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
      ],
      analystNote: null,
    },
    payer: {
      sources: [
        {
          sourceId: "cms_ncd_lcd",
          label: "CMS NCD/LCD coverage decisions",
          queryTemplate: "site:cms.gov/medicare-coverage-database {drug} {indication}",
          urlPatterns: ["cms.gov"],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "icer_assessment",
          label: "ICER assessment (if published)",
          queryTemplate: "site:icer.org {drug} {indication} assessment",
          urlPatterns: ["icer.org"],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "sponsor_access",
          label: "Sponsor access/payer announcements",
          queryTemplate: "{sponsor} {drug} payer coverage access formulary",
          urlPatterns: ["ir.", "investor."],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "commercial_payer",
          label: "Commercial payer announcements (Tier 2 — verify)",
          queryTemplate: "{drug} formulary coverage {indication} payer",
          urlPatterns: [],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
      ],
      analystNote: "0-12 months post-approval — coverage decisions may be pending.",
    },
    safety: {
      sources: [
        {
          sourceId: "fda_medwatch",
          label: "FDA MedWatch alerts",
          queryTemplate: "site:fda.gov/safety {drug}",
          urlPatterns: ["fda.gov"],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "faers_search",
          label: "FAERS adverse event reports",
          queryTemplate: "{drug} adverse events FAERS",
          urlPatterns: ["fda.gov"],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "dear_hcp",
          label: "Dear HCP letters",
          queryTemplate: "site:fda.gov {drug} dear healthcare provider letter",
          urlPatterns: ["fda.gov"],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "rems_updates",
          label: "REMS updates (if applicable)",
          queryTemplate: "site:fda.gov {drug} REMS update",
          urlPatterns: ["fda.gov"],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
      ],
      analystNote: null,
    },
    guidelines: {
      sources: [
        {
          sourceId: "rapid_guideline",
          label: "Rapid guideline updates",
          queryTemplate: "site:{society_url} {drug} recommendation {year}",
          urlPatterns: [],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "nccn_updates",
          label: "NCCN updates (oncology)",
          queryTemplate: "site:nccn.org {drug} {indication} guideline",
          urlPatterns: ["nccn.org"],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "society_practice_alert",
          label: "Society practice alerts / expert consensus",
          queryTemplate: "{indication} society practice alert {drug} expert consensus",
          urlPatterns: [],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
      ],
      analystNote: "0-18 months post-approval — guidelines may not yet include this drug.",
    },
    competitive: {
      sources: [
        {
          sourceId: "launch_data",
          label: "Launch uptake data (if publicly reported)",
          queryTemplate: "{sponsor} {drug} launch sales revenue quarterly",
          urlPatterns: ["ir.", "investor.", "sec.gov"],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "sponsor_earnings",
          label: "Sponsor earnings disclosures",
          queryTemplate: "{sponsor} earnings {drug} revenue {year}",
          urlPatterns: ["sec.gov", "ir.", "investor."],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "competitor_response",
          label: "Competitor response announcements",
          queryTemplate: "{indication} competitor response {drug_class} market",
          urlPatterns: ["ir.", "investor."],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
      ],
      analystNote: null,
    },
  },

  ESTABLISHED: {
    clinical: {
      sources: [
        {
          sourceId: "pubmed_full",
          label: "PubMed full publications and RWE",
          queryTemplate: "{drug} {indication} real world evidence outcome",
          urlPatterns: ["pubmed.ncbi.nlm.nih.gov"],
          fetchStrategy: "colab_pubmed",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "cochrane_review",
          label: "Cochrane reviews (if available)",
          queryTemplate: "site:cochranelibrary.com {drug} {indication}",
          urlPatterns: ["cochranelibrary.com"],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "meta_analysis",
          label: "Meta-analyses",
          queryTemplate: "{drug} {indication} meta-analysis systematic review",
          urlPatterns: ["pubmed.ncbi.nlm.nih.gov"],
          fetchStrategy: "colab_pubmed",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
      ],
      analystNote: null,
    },
    regulatory: {
      sources: [
        {
          sourceId: "label_updates",
          label: "FDA label updates",
          queryTemplate: "site:fda.gov {drug} label update supplement",
          urlPatterns: ["fda.gov", "accessdata.fda.gov"],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "postmarket_commitments",
          label: "Post-market commitments and studies",
          queryTemplate: "site:fda.gov {drug} post-market commitment study",
          urlPatterns: ["fda.gov"],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "boxed_warning",
          label: "Boxed warning additions",
          queryTemplate: "site:fda.gov {drug} boxed warning black box",
          urlPatterns: ["fda.gov"],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "fda_safety_comm_est",
          label: "FDA safety communications",
          queryTemplate: "site:fda.gov/safety {drug}",
          urlPatterns: ["fda.gov"],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
      ],
      analystNote: null,
    },
    payer: {
      sources: [
        {
          sourceId: "established_formulary",
          label: "Established formulary position",
          queryTemplate: "{drug} formulary tier status {indication}",
          urlPatterns: ["cms.gov"],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "cms_confirmed",
          label: "CMS coverage confirmed",
          queryTemplate: "site:cms.gov {drug} coverage determination {indication}",
          urlPatterns: ["cms.gov"],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "medical_policy",
          label: "Payer medical policy documents",
          queryTemplate: "{drug} medical policy prior authorization criteria",
          urlPatterns: [],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
      ],
      analystNote: null,
    },
    safety: {
      sources: [
        {
          sourceId: "faers_full",
          label: "Full FAERS history",
          queryTemplate: "{drug} FAERS adverse event report history",
          urlPatterns: ["fda.gov"],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "pharmacovigilance",
          label: "Published pharmacovigilance studies",
          queryTemplate: "{drug} pharmacovigilance post-market safety",
          urlPatterns: ["pubmed.ncbi.nlm.nih.gov"],
          fetchStrategy: "colab_pubmed",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "safety_history",
          label: "FDA safety communications history",
          queryTemplate: "site:fda.gov/safety {drug} safety communication",
          urlPatterns: ["fda.gov"],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "postmarket_studies",
          label: "Post-market study results",
          queryTemplate: "{drug} post-market study results long-term safety",
          urlPatterns: ["pubmed.ncbi.nlm.nih.gov"],
          fetchStrategy: "colab_pubmed",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
      ],
      analystNote: null,
    },
    guidelines: {
      sources: [
        {
          sourceId: "full_guideline",
          label: "Full guideline text from professional society",
          queryTemplate: "site:{society_url} {indication} guideline {drug}",
          urlPatterns: [],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "recommendation_strength",
          label: "Recommendation strength review",
          queryTemplate: "{drug} {indication} guideline recommendation level evidence",
          urlPatterns: [],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "international_guidelines",
          label: "International guideline comparison",
          queryTemplate: "{drug} {indication} international guideline EMA NICE",
          urlPatterns: ["nice.org.uk", "ema.europa.eu"],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
      ],
      analystNote: null,
    },
    competitive: {
      sources: [
        {
          sourceId: "sec_market_share",
          label: "SEC filings for market share data",
          queryTemplate: "site:sec.gov {sponsor} {drug} market share revenue",
          urlPatterns: ["sec.gov"],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "market_analysis",
          label: "Published market analyses",
          queryTemplate: "{drug} {indication} market analysis share trend",
          urlPatterns: [],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "biosimilar_tracking",
          label: "Biosimilar/generic entry tracking",
          queryTemplate: "{drug} biosimilar generic entry {indication}",
          urlPatterns: ["fda.gov"],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
      ],
      analystNote: null,
    },
  },

  MATURE: {
    clinical: {
      sources: [
        {
          sourceId: "comparative_effectiveness",
          label: "Comparative effectiveness studies",
          queryTemplate: "{drug} comparative effectiveness {indication}",
          urlPatterns: ["pubmed.ncbi.nlm.nih.gov"],
          fetchStrategy: "colab_pubmed",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "long_term_outcomes",
          label: "Long-term outcome data",
          queryTemplate: "{drug} long-term outcome safety {indication}",
          urlPatterns: ["pubmed.ncbi.nlm.nih.gov"],
          fetchStrategy: "colab_pubmed",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
      ],
      analystNote: null,
    },
    regulatory: {
      sources: [
        {
          sourceId: "biosimilar_approvals",
          label: "Biosimilar/generic approvals",
          queryTemplate: "site:fda.gov {drug} biosimilar generic approval",
          urlPatterns: ["fda.gov"],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "patent_expiry",
          label: "Patent expiry and exclusivity data",
          queryTemplate: "site:fda.gov {drug} patent exclusivity orange book",
          urlPatterns: ["fda.gov"],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
      ],
      analystNote: null,
    },
    payer: {
      sources: [
        {
          sourceId: "formulary_shifts",
          label: "Biosimilar/generic formulary shifts",
          queryTemplate: "{drug} formulary biosimilar preferred generic switch",
          urlPatterns: ["cms.gov"],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "step_therapy",
          label: "Step therapy and prior auth changes",
          queryTemplate: "{drug} step therapy prior authorization biosimilar",
          urlPatterns: [],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
      ],
      analystNote: null,
    },
    safety: {
      sources: [
        {
          sourceId: "cumulative_safety",
          label: "Cumulative safety profile",
          queryTemplate: "{drug} cumulative safety long-term pharmacovigilance",
          urlPatterns: ["pubmed.ncbi.nlm.nih.gov"],
          fetchStrategy: "colab_pubmed",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "biosimilar_safety_comparison",
          label: "Biosimilar safety comparisons",
          queryTemplate: "{drug} biosimilar safety comparison immunogenicity",
          urlPatterns: ["pubmed.ncbi.nlm.nih.gov"],
          fetchStrategy: "colab_pubmed",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
      ],
      analystNote: null,
    },
    guidelines: {
      sources: [
        {
          sourceId: "guideline_revisions",
          label: "Guideline revisions post-generic entry",
          queryTemplate: "site:{society_url} {indication} guideline update biosimilar generic",
          urlPatterns: [],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "switching_guidance",
          label: "Switching/interchange guidance",
          queryTemplate: "{drug} biosimilar switching interchange guideline",
          urlPatterns: [],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
      ],
      analystNote: null,
    },
    competitive: {
      sources: [
        {
          sourceId: "loe_market_dynamics",
          label: "LOE market dynamics",
          queryTemplate: "{drug} loss of exclusivity market share erosion",
          urlPatterns: ["sec.gov"],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "biosimilar_entries",
          label: "Biosimilar/generic entries and pricing",
          queryTemplate: "{drug} biosimilar launch pricing discount market entry",
          urlPatterns: [],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
        {
          sourceId: "loe_strategy",
          label: "Sponsor LOE strategy filings",
          queryTemplate: "site:sec.gov {sponsor} {drug} lifecycle strategy patent",
          urlPatterns: ["sec.gov"],
          fetchStrategy: "replit_direct",
          isProxy: false,
          proxyNote: null,
          noDataFlag: null,
        },
      ],
      analystNote: null,
    },
  },
};

const STAGE_LABELS: Record<DrugStage, string> = {
  INVESTIGATIONAL: "Investigational (Phase 1/2/3, no approval)",
  RECENTLY_APPROVED: "Recently Approved (within last 3 years)",
  ESTABLISHED: "Established (3+ years post-approval)",
  MATURE: "Mature (approaching/past LOE)",
};

export function getStageSourceMap(stage: DrugStage): StageSourceMap {
  const map = SOURCE_MAP[stage];
  const categories: CategorySourceMap[] = (Object.keys(map) as SignalCategory[]).map(cat => ({
    category: cat,
    categoryLabel: SIGNAL_CATEGORY_LABELS[cat],
    sources: map[cat].sources.map((s, i) => ({ ...s, rank: i + 1 })),
    analystNote: map[cat].analystNote,
  }));

  return {
    stage,
    label: STAGE_LABELS[stage],
    categories,
  };
}

export function getCategorySourceMap(stage: DrugStage, category: SignalCategory): CategorySourceMap {
  const map = SOURCE_MAP[stage][category];
  return {
    category,
    categoryLabel: SIGNAL_CATEGORY_LABELS[category],
    sources: map.sources.map((s, i) => ({ ...s, rank: i + 1 })),
    analystNote: map.analystNote,
  };
}

export function resolveQueryTemplate(
  template: string,
  vars: {
    drug: string;
    indication: string;
    sponsor?: string;
    ticker?: string;
    mechanism_class?: string;
    class_analog?: string;
    society_url?: string;
    drug_class?: string;
    year?: string;
  },
): string {
  let q = template;
  q = q.replace(/\{drug\}/g, vars.drug);
  q = q.replace(/\{indication\}/g, vars.indication);
  q = q.replace(/\{sponsor\}/g, vars.sponsor || vars.drug);
  q = q.replace(/\{ticker\}/g, vars.ticker || "");
  q = q.replace(/\{mechanism_class\}/g, vars.mechanism_class || vars.drug);
  q = q.replace(/\{class_analog\}/g, vars.class_analog || vars.drug);
  q = q.replace(/\{society_url\}/g, vars.society_url || "");
  q = q.replace(/\{drug_class\}/g, vars.drug_class || vars.drug);
  q = q.replace(/\{year\}/g, vars.year || new Date().getFullYear().toString());
  return q.replace(/\s+/g, " ").trim();
}

interface StageSignals {
  hasApproval: boolean;
  approvalRecent: boolean;
  hasPhaseInName: boolean;
  phaseNumber: number | null;
  hasGenericCompetition: boolean;
  hasLOEMention: boolean;
  trialStatus: string | null;
}

function detectStageSignals(
  drugName: string,
  indication: string,
  question: string,
  trialName: string | null,
  trialResult: string | null,
): StageSignals {
  const combined = `${drugName} ${indication} ${question} ${trialName || ""} ${trialResult || ""}`.toLowerCase();

  const approvalKeywords = [
    "approved", "fda approval", "fda-approved", "approval letter",
    "prescribing information", "nda approved", "bla approved",
    "market", "launched", "commercial",
  ];
  const hasApproval = approvalKeywords.some(k => combined.includes(k));

  const recentApprovalPatterns = [
    "recently approved", "newly approved", "just approved",
    "launch", "first year", "year 1", "early commercial",
    "initial uptake", "first-line",
  ];
  const approvalRecent = recentApprovalPatterns.some(k => combined.includes(k));

  const phaseMatch = combined.match(/phase\s*([1-4]|i{1,3}v?|iv)/i);
  let phaseNumber: number | null = null;
  if (phaseMatch) {
    const p = phaseMatch[1].toLowerCase();
    if (p === "1" || p === "i") phaseNumber = 1;
    else if (p === "2" || p === "ii") phaseNumber = 2;
    else if (p === "3" || p === "iii") phaseNumber = 3;
    else if (p === "4" || p === "iv") phaseNumber = 4;
  }

  const investigationalKeywords = [
    "investigational", "experimental", "pipeline", "candidate",
    "phase 1", "phase 2", "phase 3", "phase i", "phase ii", "phase iii",
    "pivotal trial", "pivotal study", "topline", "data readout",
    "enrollment", "enrolling", "randomized",
  ];
  const hasPhaseInName = investigationalKeywords.some(k => combined.includes(k));

  const loeKeywords = [
    "loss of exclusivity", "loe", "patent expir", "generic",
    "biosimilar", "interchangeable", "anda", "patent cliff",
  ];
  const hasGenericCompetition = loeKeywords.some(k => combined.includes(k));
  const hasLOEMention = hasGenericCompetition;

  return {
    hasApproval,
    approvalRecent,
    hasPhaseInName,
    phaseNumber,
    hasGenericCompetition,
    hasLOEMention,
    trialStatus: null,
  };
}

export function classifyDrugStage(
  drugName: string,
  indication: string,
  question: string,
  trialName: string | null = null,
  trialResult: string | null = null,
  overrideStage: DrugStage | null = null,
): StageClassification {
  let stage: DrugStage;
  let rationale: string;

  if (overrideStage) {
    stage = overrideStage;
    rationale = "Stage manually set by analyst.";
  } else {
    const signals = detectStageSignals(drugName, indication, question, trialName, trialResult);

    if (signals.hasGenericCompetition || signals.hasLOEMention) {
      stage = "MATURE";
      rationale = "LOE/biosimilar/generic keywords detected.";
    } else if (signals.hasPhaseInName && !signals.hasApproval) {
      stage = "INVESTIGATIONAL";
      rationale = `Clinical trial phase detected (Phase ${signals.phaseNumber || "unknown"}), no approval keywords.`;
    } else if (signals.hasApproval && signals.approvalRecent) {
      stage = "RECENTLY_APPROVED";
      rationale = "Approval confirmed with recent launch indicators.";
    } else if (signals.hasApproval && !signals.approvalRecent) {
      stage = "ESTABLISHED";
      rationale = "Approved product without recent launch signals.";
    } else if (signals.hasPhaseInName) {
      stage = "INVESTIGATIONAL";
      rationale = "Trial/pipeline keywords detected.";
    } else {
      stage = "RECENTLY_APPROVED";
      rationale = "Default: no clear stage signals, assuming recently approved.";
    }
  }

  const stageMap = getStageSourceMap(stage);
  const flatPriority: SourcePriority[] = [];
  let rank = 1;
  for (const cat of stageMap.categories) {
    for (const src of cat.sources) {
      if (!flatPriority.some(p => p.sourceType === src.sourceId)) {
        flatPriority.push({
          rank: rank++,
          sourceType: src.sourceId,
          description: `[${cat.categoryLabel}] ${src.label}`,
          urlPatterns: src.urlPatterns,
          fetchStrategy: src.fetchStrategy,
        });
      }
    }
  }

  return {
    stage,
    label: STAGE_LABELS[stage],
    rationale,
    sourcePriority: flatPriority,
    categoryMap: stageMap.categories,
  };
}

export function getSourcePriority(stage: DrugStage): SourcePriority[] {
  const stageMap = getStageSourceMap(stage);
  const flatPriority: SourcePriority[] = [];
  let rank = 1;
  for (const cat of stageMap.categories) {
    for (const src of cat.sources) {
      flatPriority.push({
        rank: rank++,
        sourceType: src.sourceId,
        description: `[${cat.categoryLabel}] ${src.label}`,
        urlPatterns: src.urlPatterns,
        fetchStrategy: src.fetchStrategy,
      });
    }
  }
  return flatPriority;
}

export function getStageDef(stage: DrugStage) {
  return { label: STAGE_LABELS[stage], sourcePriority: getSourcePriority(stage) };
}

export function buildPrioritizedFetchOrder(
  urls: { url: string; category: string; query: string }[],
  stage: DrugStage,
): { url: string; category: string; query: string; priorityRank: number }[] {
  const priorities = getSourcePriority(stage);

  const ranked = urls.map(u => {
    let bestRank = 99;
    for (const p of priorities) {
      const matches = p.urlPatterns.some(pattern => u.url.toLowerCase().includes(pattern));
      if (matches && p.rank < bestRank) {
        bestRank = p.rank;
      }
    }
    if (bestRank === 99) {
      if (u.category.toLowerCase().includes("clinical")) bestRank = 10;
      else if (u.category.toLowerCase().includes("regulatory")) bestRank = 11;
      else if (u.category.toLowerCase().includes("sponsor")) bestRank = 12;
      else bestRank = 20;
    }
    return { ...u, priorityRank: bestRank };
  });

  ranked.sort((a, b) => a.priorityRank - b.priorityRank);
  return ranked;
}

export function shouldUseColab(url: string): boolean {
  const lower = url.toLowerCase();
  const isPdf = lower.endsWith(".pdf") || lower.includes("/pdf/");
  const isPubmed = lower.includes("pubmed.ncbi.nlm.nih.gov/");
  return isPdf || isPubmed;
}

export const ALL_STAGES: DrugStage[] = ["INVESTIGATIONAL", "RECENTLY_APPROVED", "ESTABLISHED", "MATURE"];
export const ALL_CATEGORIES: SignalCategory[] = ["clinical", "regulatory", "payer", "safety", "guidelines", "competitive"];
