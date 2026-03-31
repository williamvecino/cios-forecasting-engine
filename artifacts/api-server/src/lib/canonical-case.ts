export interface CanonicalCase {
  caseId: string;
  decisionPattern: string;
  outcomeVariable: string;
  operator: string | null;
  threshold: string | null;
  unit: string | null;
  timeHorizon: string;
  comparisonGroup: string | null;
  diseaseArea: string | null;
  asset: string;
  setting: string | null;
  lineOfTherapy: string | null;
  primaryDecisionQuestion: string;
  secondaryQuestions: string[];
  lockedDriverFamilies: string[];
}

const OPERATOR_PATTERNS: [RegExp, string][] = [
  [/≥|>=|at least|exceed|surpass/, ">="],
  [/≤|<=|at most|no more than/, "<="],
  [/>(?!=)/, ">"],
  [/<(?!=)/, "<"],
  [/reach|achieve|hit/, ">="],
  [/fall below|drop below|decline below/, "<"],
];

const LINE_PATTERNS: [RegExp, string][] = [
  [/first[- ]?line/i, "1L"],
  [/second[- ]?line/i, "2L"],
  [/third[- ]?line/i, "3L"],
  [/adjuvant/i, "adjuvant"],
  [/neoadjuvant/i, "neoadjuvant"],
  [/maintenance/i, "maintenance"],
  [/salvage/i, "salvage"],
  [/monotherapy/i, "monotherapy"],
];

const SETTING_PATTERNS: [RegExp, string][] = [
  [/community/i, "community"],
  [/academic/i, "academic"],
  [/hospital/i, "hospital"],
  [/outpatient/i, "outpatient"],
  [/inpatient/i, "inpatient"],
  [/specialty pharmacy/i, "specialty_pharmacy"],
];

const OUTCOME_MAP: [RegExp, string][] = [
  [/adopt|uptake|prescri/i, "adoption"],
  [/market share|share/i, "market_share"],
  [/approv/i, "regulatory_approval"],
  [/restrict|limit/i, "access_restriction"],
  [/coverage|formulary|reimburse/i, "payer_coverage"],
  [/switch|displace|erosion/i, "competitive_displacement"],
  [/launch|entry|enter/i, "market_entry"],
  [/safety|adverse|toxicity/i, "safety_profile"],
  [/efficacy|response|outcome/i, "clinical_efficacy"],
  [/revenue|sales|commercial/i, "commercial_performance"],
  [/delay/i, "adoption_delay"],
  [/decline|decrease|reduce/i, "decline"],
  [/increase|grow|growth/i, "growth"],
];

const DECISION_PATTERN_MAP: Record<string, string> = {
  adoption: "pt-01",
  market_share: "pt-01",
  regulatory_approval: "pt-02",
  access_restriction: "pt-03",
  payer_coverage: "pt-03",
  competitive_displacement: "pt-04",
  market_entry: "pt-04",
  safety_profile: "pt-05",
  clinical_efficacy: "pt-05",
  commercial_performance: "pt-01",
  adoption_delay: "pt-01",
  decline: "pt-04",
  growth: "pt-01",
};

const DRIVER_FAMILY_MAP: Record<string, string[]> = {
  "pt-01": ["brand_clinical_regulatory", "payer_access", "competitor", "patient_demand", "provider_behavioral", "system_operational"],
  "pt-02": ["brand_clinical_regulatory", "competitor", "system_operational"],
  "pt-03": ["payer_access", "brand_clinical_regulatory", "competitor", "system_operational"],
  "pt-04": ["competitor", "brand_clinical_regulatory", "patient_demand", "provider_behavioral"],
  "pt-05": ["brand_clinical_regulatory", "system_operational", "patient_demand"],
};

export function buildCanonicalCase(
  caseId: string,
  strategicQuestion: string,
  assetName: string,
  opts: {
    outcomeThreshold?: string | null;
    timeHorizon?: string | null;
    therapeuticArea?: string | null;
    diseaseState?: string | null;
    geography?: string | null;
    outcomeDefinition?: string | null;
    priorArchetype?: string | null;
    comparisonGroups?: string | null;
    secondaryQuestions?: string[];
  } = {},
): CanonicalCase {
  const q = strategicQuestion.toLowerCase();

  let operator: string | null = null;
  for (const [pat, op] of OPERATOR_PATTERNS) {
    if (pat.test(q)) { operator = op; break; }
  }

  let threshold = opts.outcomeThreshold || null;
  if (!threshold) {
    const m = q.match(/(\d+(?:\.\d+)?)\s*%/);
    if (m) threshold = `${m[1]}%`;
  }

  let unit: string | null = null;
  if (threshold) {
    if (threshold.includes("%")) unit = "percent";
    else if (/\$/.test(threshold)) unit = "currency";
    else unit = "count";
  }

  let outcomeVariable = opts.outcomeDefinition || "unspecified";
  for (const [pat, outcome] of OUTCOME_MAP) {
    if (pat.test(q)) { outcomeVariable = outcome; break; }
  }

  const rawArchetype = opts.priorArchetype || null;
  const archetypeToPattern: Record<string, string> = {
    "launch_timing": "pt-01",
    "regulatory_outcome": "pt-02",
    "early_adoption": "pt-01",
    "broad_adoption": "pt-01",
    "market_access_constraint": "pt-03",
    "clinical_outcome": "pt-05",
    "clinical_adoption": "pt-01",
    "competitive_displacement": "pt-04",
    "safety_risk": "pt-05",
    "regulatory_approval": "pt-02",
  };
  let decisionPattern: string;
  if (rawArchetype && rawArchetype.startsWith("pt-")) {
    decisionPattern = rawArchetype;
  } else if (rawArchetype && archetypeToPattern[rawArchetype]) {
    decisionPattern = archetypeToPattern[rawArchetype];
  } else {
    decisionPattern = DECISION_PATTERN_MAP[outcomeVariable] || "pt-01";
  }
  const lockedDriverFamilies = DRIVER_FAMILY_MAP[decisionPattern] || DRIVER_FAMILY_MAP["pt-01"];

  let lineOfTherapy: string | null = null;
  for (const [pat, line] of LINE_PATTERNS) {
    if (pat.test(q)) { lineOfTherapy = line; break; }
  }

  let setting: string | null = null;
  for (const [pat, s] of SETTING_PATTERNS) {
    if (pat.test(q)) { setting = s; break; }
  }

  const comparisonGroup = opts.comparisonGroups || null;
  const timeHorizon = opts.timeHorizon || "12 months";

  return {
    caseId,
    decisionPattern,
    outcomeVariable,
    operator,
    threshold,
    unit,
    timeHorizon,
    comparisonGroup,
    diseaseArea: opts.therapeuticArea || opts.diseaseState || null,
    asset: assetName,
    setting,
    lineOfTherapy,
    primaryDecisionQuestion: strategicQuestion,
    secondaryQuestions: opts.secondaryQuestions || [],
    lockedDriverFamilies,
  };
}

export interface DriftField {
  field: string;
  previous: string | number | null;
  current: string | number | null;
}

export function detectCanonicalDrift(
  previous: CanonicalCase,
  current: CanonicalCase,
): DriftField[] {
  const drifts: DriftField[] = [];
  const fieldsToCheck: (keyof CanonicalCase)[] = [
    "decisionPattern",
    "outcomeVariable",
    "operator",
    "threshold",
    "timeHorizon",
    "lineOfTherapy",
    "setting",
  ];

  for (const field of fieldsToCheck) {
    const prev = previous[field];
    const curr = current[field];
    if (String(prev ?? "") !== String(curr ?? "")) {
      drifts.push({
        field,
        previous: prev as string | null,
        current: curr as string | null,
      });
    }
  }

  return drifts;
}
