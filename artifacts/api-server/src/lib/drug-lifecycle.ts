export type DrugStage =
  | "INVESTIGATIONAL"
  | "RECENTLY_APPROVED"
  | "ESTABLISHED"
  | "MATURE";

export interface StageClassification {
  stage: DrugStage;
  label: string;
  rationale: string;
  sourcePriority: SourcePriority[];
}

export interface SourcePriority {
  rank: number;
  sourceType: SourceType;
  description: string;
  urlPatterns: string[];
  fetchStrategy: "replit_direct" | "colab_pdf" | "colab_pubmed" | "api_direct";
}

export type SourceType =
  | "clinicaltrials_gov"
  | "sponsor_ir"
  | "sec_8k"
  | "conference_abstract"
  | "pubmed"
  | "fda_label"
  | "fda_approval"
  | "cms_coverage"
  | "society_guideline"
  | "real_world_evidence"
  | "payer_formulary";

const STAGE_DEFINITIONS: Record<DrugStage, {
  label: string;
  sourcePriority: SourcePriority[];
}> = {
  INVESTIGATIONAL: {
    label: "Investigational (Phase 1/2/3, no approval)",
    sourcePriority: [
      {
        rank: 1,
        sourceType: "clinicaltrials_gov",
        description: "Trial design and status",
        urlPatterns: ["clinicaltrials.gov"],
        fetchStrategy: "api_direct",
      },
      {
        rank: 2,
        sourceType: "sponsor_ir",
        description: "Topline results, press releases",
        urlPatterns: ["ir.", "investor.", "newsroom."],
        fetchStrategy: "replit_direct",
      },
      {
        rank: 3,
        sourceType: "sec_8k",
        description: "Material disclosures (8-K filings)",
        urlPatterns: ["sec.gov", "edgar"],
        fetchStrategy: "replit_direct",
      },
      {
        rank: 4,
        sourceType: "conference_abstract",
        description: "Poster/oral presentations",
        urlPatterns: ["asco.org", "ash.org", "aacr.org", "ats.org"],
        fetchStrategy: "replit_direct",
      },
      {
        rank: 5,
        sourceType: "pubmed",
        description: "Published results (if available)",
        urlPatterns: ["pubmed.ncbi.nlm.nih.gov"],
        fetchStrategy: "colab_pubmed",
      },
    ],
  },
  RECENTLY_APPROVED: {
    label: "Recently Approved (within last 3 years)",
    sourcePriority: [
      {
        rank: 1,
        sourceType: "fda_label",
        description: "FDA prescribing information / label",
        urlPatterns: ["accessdata.fda.gov", "dailymed.nlm.nih.gov"],
        fetchStrategy: "replit_direct",
      },
      {
        rank: 2,
        sourceType: "fda_approval",
        description: "FDA approval letter and review documents",
        urlPatterns: ["fda.gov/drugs"],
        fetchStrategy: "replit_direct",
      },
      {
        rank: 3,
        sourceType: "sponsor_ir",
        description: "Launch updates, payer wins, RWE announcements",
        urlPatterns: ["ir.", "investor.", "newsroom."],
        fetchStrategy: "replit_direct",
      },
      {
        rank: 4,
        sourceType: "cms_coverage",
        description: "CMS national/local coverage decisions",
        urlPatterns: ["cms.gov", "medicare.gov"],
        fetchStrategy: "replit_direct",
      },
      {
        rank: 5,
        sourceType: "pubmed",
        description: "Pivotal trial publication",
        urlPatterns: ["pubmed.ncbi.nlm.nih.gov"],
        fetchStrategy: "colab_pubmed",
      },
      {
        rank: 6,
        sourceType: "society_guideline",
        description: "Professional society guideline updates",
        urlPatterns: [],
        fetchStrategy: "replit_direct",
      },
    ],
  },
  ESTABLISHED: {
    label: "Established (3+ years post-approval)",
    sourcePriority: [
      {
        rank: 1,
        sourceType: "society_guideline",
        description: "Guideline position and treatment algorithms",
        urlPatterns: [],
        fetchStrategy: "replit_direct",
      },
      {
        rank: 2,
        sourceType: "real_world_evidence",
        description: "RWE studies, registry data",
        urlPatterns: ["pubmed.ncbi.nlm.nih.gov"],
        fetchStrategy: "colab_pubmed",
      },
      {
        rank: 3,
        sourceType: "payer_formulary",
        description: "Formulary status, utilization management",
        urlPatterns: ["cms.gov"],
        fetchStrategy: "replit_direct",
      },
      {
        rank: 4,
        sourceType: "fda_label",
        description: "Label updates, new indications",
        urlPatterns: ["accessdata.fda.gov"],
        fetchStrategy: "replit_direct",
      },
      {
        rank: 5,
        sourceType: "sponsor_ir",
        description: "Revenue trends, lifecycle updates",
        urlPatterns: ["ir.", "investor."],
        fetchStrategy: "replit_direct",
      },
    ],
  },
  MATURE: {
    label: "Mature (approaching/past LOE)",
    sourcePriority: [
      {
        rank: 1,
        sourceType: "payer_formulary",
        description: "Biosimilar/generic formulary shifts",
        urlPatterns: ["cms.gov"],
        fetchStrategy: "replit_direct",
      },
      {
        rank: 2,
        sourceType: "fda_approval",
        description: "Biosimilar/generic approvals",
        urlPatterns: ["fda.gov"],
        fetchStrategy: "replit_direct",
      },
      {
        rank: 3,
        sourceType: "sponsor_ir",
        description: "LOE strategy, lifecycle management",
        urlPatterns: ["ir.", "investor."],
        fetchStrategy: "replit_direct",
      },
      {
        rank: 4,
        sourceType: "society_guideline",
        description: "Guideline revisions post-generic entry",
        urlPatterns: [],
        fetchStrategy: "replit_direct",
      },
      {
        rank: 5,
        sourceType: "pubmed",
        description: "Comparative effectiveness studies",
        urlPatterns: ["pubmed.ncbi.nlm.nih.gov"],
        fetchStrategy: "colab_pubmed",
      },
    ],
  },
};

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
  if (overrideStage) {
    const def = STAGE_DEFINITIONS[overrideStage];
    return {
      stage: overrideStage,
      label: def.label,
      rationale: "Stage manually set by analyst.",
      sourcePriority: def.sourcePriority,
    };
  }

  const signals = detectStageSignals(drugName, indication, question, trialName, trialResult);

  let stage: DrugStage;
  let rationale: string;

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

  const def = STAGE_DEFINITIONS[stage];
  return {
    stage,
    label: def.label,
    rationale,
    sourcePriority: def.sourcePriority,
  };
}

export function getSourcePriority(stage: DrugStage): SourcePriority[] {
  return STAGE_DEFINITIONS[stage].sourcePriority;
}

export function getStageDef(stage: DrugStage) {
  return STAGE_DEFINITIONS[stage];
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
