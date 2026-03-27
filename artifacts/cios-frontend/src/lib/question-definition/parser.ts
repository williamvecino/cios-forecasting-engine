import type { DecisionQuestion, QuestionType } from "./types";
import { classifyQuestion } from "./classifier";

const TIME_HORIZON_RE = /\b(\d+)\s*(month|year|week|quarter)s?\b/i;

const OUTCOME_KEYWORDS: Record<string, string> = {
  adopt: "adoption",
  adoption: "adoption",
  approve: "approval",
  approval: "approval",
  restrict: "restriction",
  restriction: "restriction",
  uptake: "uptake",
  prescrib: "prescribing behavior",
  prescribing: "prescribing behavior",
  access: "access",
  coverage: "coverage",
  reimburse: "reimbursement",
  launch: "launch",
  share: "market share",
  switch: "switching behavior",
  penetrat: "market penetration",
  endorse: "endorsement",
};

const SUBJECT_KEYWORDS = [
  "arikayce",
  "brensocatib",
  "dupixent",
  "keytruda",
  "opdivo",
  "humira",
  "enhertu",
  "ozempic",
  "wegovy",
  "mounjaro",
];

const ENTITY_PATTERNS: [RegExp, string][] = [
  [/\bacademic\s+(center|specialist|institution)s?\b/i, "Academic centers"],
  [/\bcommunity\s+(center|practitioner|provider|practice)s?\b/i, "Community practitioners"],
  [/\bhigh[\s-]volume\s+(specialist|center|practice)s?\b/i, "High-volume specialists"],
  [/\bnortheast(ern)?\b/i, "Northeast"],
  [/\bsouth(ern)?\b/i, "South"],
  [/\bmidwest(ern)?\b/i, "Midwest"],
  [/\bwest(ern)?\b/i, "West"],
  [/\bpayer\b/i, "Payers"],
  [/\bphysician\b/i, "Physicians"],
  [/\bspecialist\b/i, "Specialists"],
  [/\bpulmonolog/i, "Pulmonologists"],
  [/\boncolog/i, "Oncologists"],
  [/\bdermatolog/i, "Dermatologists"],
  [/\bcardiolog/i, "Cardiologists"],
  [/\brheumatolog/i, "Rheumatologists"],
  [/\bcommercial\s+payer/i, "Commercial payers"],
  [/\bmedicare\b/i, "Medicare"],
  [/\bmedicaid\b/i, "Medicaid"],
];

const GENERIC_ENTITY_PATTERNS: [RegExp, string][] = [
  [/\bregion\b/i, "regions"],
  [/\barea\b/i, "geographic areas"],
  [/\bsegment\b/i, "segments"],
  [/\bmarket\b/i, "markets"],
  [/\bcenter\b/i, "centers"],
  [/\bgroup\b/i, "groups"],
  [/\bstakeholder\b/i, "stakeholders"],
  [/\bpopulation\b/i, "populations"],
];

const COMPARATOR_PATTERNS: [RegExp, string][] = [
  [/\bfaster\s+than\b/i, "faster than"],
  [/\bmore\s+likely\s+than\b/i, "more likely than"],
  [/\bbetter\s+than\b/i, "better than"],
  [/\bhigher\s+than\b/i, "higher than"],
  [/\blower\s+than\b/i, "lower than"],
  [/\bvs\.?\b/i, "versus"],
  [/\bversus\b/i, "versus"],
  [/\bcompared\s+(with|to)\b/i, "compared with"],
];

const THRESHOLD_RE = /(\d+(?:\.\d+)?)\s*%/;

function extractSubject(input: string): string {
  const lower = input.toLowerCase();

  for (const keyword of SUBJECT_KEYWORDS) {
    if (lower.includes(keyword)) {
      const contextRe = new RegExp(`(first[\\s-]line\\s+)?${keyword}(\\s+first[\\s-]line)?`, "i");
      const m = input.match(contextRe);
      if (m) {
        const hasFirstLine = /first[\s-]line/i.test(m[0]);
        const brand = keyword.charAt(0).toUpperCase() + keyword.slice(1).toUpperCase();
        return hasFirstLine ? `${brand} first-line use` : brand;
      }
      return keyword.charAt(0).toUpperCase() + keyword.slice(1).toUpperCase();
    }
  }

  return "";
}

function extractOutcome(input: string): string {
  const lower = input.toLowerCase();
  for (const [key, label] of Object.entries(OUTCOME_KEYWORDS)) {
    if (lower.includes(key)) return label;
  }
  return "";
}

function extractEntities(input: string): string[] {
  const found: string[] = [];

  for (const [re, label] of ENTITY_PATTERNS) {
    if (re.test(input) && !found.includes(label)) {
      found.push(label);
    }
  }

  if (found.length === 0) {
    for (const [re, label] of GENERIC_ENTITY_PATTERNS) {
      if (re.test(input) && !found.includes(label)) {
        found.push(label);
      }
    }
  }

  return found;
}

function extractTimeHorizon(input: string): string {
  const m = input.match(TIME_HORIZON_RE);
  if (m) {
    const num = parseInt(m[1], 10);
    const unit = m[2].toLowerCase();
    if (unit.startsWith("year")) return `${num * 12} months`;
    if (unit.startsWith("quarter")) return `${num * 3} months`;
    if (unit.startsWith("week")) return `${Math.ceil(num / 4)} months`;
    return `${num} ${unit}s`;
  }
  return "";
}

function extractComparator(input: string): string | undefined {
  for (const [re, label] of COMPARATOR_PATTERNS) {
    if (re.test(input)) return label;
  }
  return undefined;
}

function extractSuccessMetric(input: string): string | undefined {
  const m = input.match(THRESHOLD_RE);
  if (m) return `≥${m[1]}%`;

  if (/\bexceed\b/i.test(input)) {
    const numMatch = input.match(/exceed\s+(\d+(?:\.\d+)?)\s*%?/i);
    if (numMatch) return `>${numMatch[1]}%`;
  }
  return undefined;
}

export function parseQuestion(rawInput: string): Partial<DecisionQuestion> {
  const input = rawInput.trim();
  if (!input) {
    return { rawInput: input, questionType: "binary" as QuestionType };
  }

  const questionType = classifyQuestion(input);

  return {
    rawInput: input,
    questionType,
    subject: extractSubject(input),
    outcome: extractOutcome(input),
    populationOrEntities: extractEntities(input),
    comparator: extractComparator(input),
    timeHorizon: extractTimeHorizon(input),
    successMetric: extractSuccessMetric(input),
  };
}
