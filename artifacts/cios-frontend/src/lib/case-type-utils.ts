const API = import.meta.env.VITE_API_URL || "";

export interface CaseTypeInfo {
  caseType: string;
  isRegulatory: boolean;
  stepNames: {
    judge: string;
    decide: string;
    respond: string;
    simulate: string;
  };
  hiddenModules: string[];
}

const REGULATORY_PATTERNS = [
  "fda approv", "ema approv", "regulatory approv",
  "approval", "approve", "approved",
  "advisory committee", "adcom", "pdufa",
  "complete response", "crl", "nda", "bla",
  "breakthrough therapy", "accelerated approval",
  "priority review", "fast track",
  "regulatory decision", "regulatory outcome",
  "regulators", "regulator ",
  "european regulat", "health authority", "health authorities",
  "mhra", "pmda", "tga", "anvisa", "nmpa",
  "marketing authoriz", "market authoris",
  "chmp", "chmp opinion",
];

const COMMERCIAL_PATTERNS = [
  "adoption", "market share", "prescriber", "formulary",
  "launch", "commercial", "sales",
];

export function detectCaseType(question: string): CaseTypeInfo {
  const q = question.toLowerCase();
  const regScore = REGULATORY_PATTERNS.filter(p => q.includes(p)).length;
  const comScore = COMMERCIAL_PATTERNS.filter(p => q.includes(p)).length;
  const isRegulatory = regScore >= 2 && regScore > comScore;

  if (isRegulatory) {
    return {
      caseType: "regulatory_approval",
      isRegulatory: true,
      stepNames: {
        judge: "Judge Approval Probability",
        decide: "Decide Approval Leverage",
        respond: "Respond with Regulatory Strategy",
        simulate: "Simulate Regulatory Response",
      },
      hiddenModules: ["growth-feasibility"],
    };
  }

  return {
    caseType: "commercial",
    isRegulatory: false,
    stepNames: {
      judge: "Judge Adoption Probability",
      decide: "Decide Priority Actions",
      respond: "Respond with Launch Strategy",
      simulate: "Simulate Adoption Reaction",
    },
    hiddenModules: [],
  };
}

export const REGULATORY_SEGMENTS = [
  { key: "FDA Review Division", color: "blue" },
  { key: "Advisory Committee Members", color: "violet" },
  { key: "Sponsor Regulatory Team", color: "emerald" },
  { key: "Safety Reviewers", color: "rose" },
  { key: "Patient Advocacy Groups", color: "amber" },
];

export const COMMERCIAL_SEGMENTS = [
  { key: "Early Adopters", color: "emerald" },
  { key: "Persuadables", color: "blue" },
  { key: "Late Movers", color: "amber" },
  { key: "Resistant", color: "rose" },
];
