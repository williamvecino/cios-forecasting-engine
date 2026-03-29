const API = import.meta.env.VITE_API_URL || "";

export type RegulatoryAuthority = "fda" | "ema" | "mhra" | "other";

export interface CaseTypeInfo {
  caseType: string;
  isRegulatory: boolean;
  authority: RegulatoryAuthority | null;
  stepNames: {
    judge: string;
    decide: string;
    respond: string;
    simulate: string;
  };
  hiddenModules: string[];
}

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

const EMA_PATTERNS = [
  "ema", "european medicines agency", "chmp", "prac",
  "european regulat", "eu approv", "eu market",
  "marketing authoriz", "market authoris",
  "centralised procedure", "centralized procedure",
  "european commission",
];

const MHRA_PATTERNS = ["mhra", "uk regulat", "united kingdom"];

const FDA_PATTERNS = [
  "fda", "food and drug admin", "pdufa", "adcom",
  "advisory committee", "nda", "bla",
  "accelerated approval", "priority review",
  "breakthrough therapy", "fast track",
  "complete response", "crl",
];

export function detectAuthority(question: string): RegulatoryAuthority | null {
  const q = question.toLowerCase();
  const emaScore = EMA_PATTERNS.filter(p => q.includes(p)).length;
  const mhraScore = MHRA_PATTERNS.filter(p => q.includes(p)).length;
  const fdaScore = FDA_PATTERNS.filter(p => q.includes(p)).length;

  if (mhraScore > 0 && mhraScore >= emaScore && mhraScore >= fdaScore) return "mhra";
  if (emaScore > fdaScore) return "ema";
  if (fdaScore > 0) return "fda";
  return null;
}

export function detectCaseType(question: string): CaseTypeInfo {
  const q = question.toLowerCase();
  const clinScore = CLINICAL_OUTCOME_PATTERNS.filter(p => q.includes(p)).length;
  const regScore = REGULATORY_PATTERNS.filter(p => q.includes(p)).length;
  const comScore = COMMERCIAL_PATTERNS.filter(p => q.includes(p)).length;

  if (clinScore >= 2 && clinScore > regScore && clinScore > comScore) {
    return {
      caseType: "clinical_outcome",
      isRegulatory: false,
      authority: null,
      stepNames: {
        judge: "Judge Endpoint Success Probability",
        decide: "Decide Trial Strategy Leverage",
        respond: "Respond with Trial Strategy",
        simulate: "Simulate Clinical Outcome Impact",
      },
      hiddenModules: ["growth-feasibility"],
    };
  }

  const isRegulatory = regScore >= 2 && regScore > comScore;

  if (isRegulatory) {
    const authority = detectAuthority(question);
    return {
      caseType: "regulatory_approval",
      isRegulatory: true,
      authority,
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
    authority: null,
    stepNames: {
      judge: "Judge Adoption Probability",
      decide: "Decide Priority Actions",
      respond: "Respond with Launch Strategy",
      simulate: "Simulate Adoption Reaction",
    },
    hiddenModules: [],
  };
}

export const FDA_REGULATORY_SEGMENTS = [
  { key: "FDA Review Division", color: "blue" },
  { key: "Advisory Committee Members", color: "violet" },
  { key: "Sponsor Regulatory Team", color: "emerald" },
  { key: "Safety Reviewers", color: "rose" },
  { key: "Patient Advocacy Groups", color: "amber" },
];

export const EMA_REGULATORY_SEGMENTS = [
  { key: "CHMP / Rapporteur Team", color: "blue" },
  { key: "PRAC Safety Reviewers", color: "rose" },
  { key: "Marketing Authorization Holder (MAH)", color: "emerald" },
  { key: "Scientific Advisory Group", color: "violet" },
  { key: "Patient Advocacy Groups", color: "amber" },
];

export const REGULATORY_SEGMENTS = FDA_REGULATORY_SEGMENTS;

export function getRegulatorySegments(question: string) {
  const authority = detectAuthority(question);
  if (authority === "ema" || authority === "mhra") return EMA_REGULATORY_SEGMENTS;
  return FDA_REGULATORY_SEGMENTS;
}

export const COMMERCIAL_SEGMENTS = [
  { key: "Early Adopters", color: "emerald" },
  { key: "Persuadables", color: "blue" },
  { key: "Late Movers", color: "amber" },
  { key: "Resistant", color: "rose" },
  { key: "Risk Gatekeepers", color: "slate" },
];
