import type { EvidenceClass } from "@workspace/db";

const STRUCTURAL_KEYWORDS = [
  "market structure", "therapeutic landscape", "standard of care",
  "treatment paradigm", "prescribing pattern", "patient population",
  "disease prevalence", "incidence rate", "epidemiology",
  "healthcare system", "reimbursement framework", "formulary structure",
  "competitive landscape", "market size", "patient journey",
  "referral pathway", "treatment algorithm", "clinical pathway",
  "demographic", "comorbidity profile", "baseline", "historical rate",
  "established practice", "current standard", "market dynamics",
  "is concentrated among", "specialists at", "community pulmonologist",
  "have never prescribed", "prescribing is", "prevalence at",
  "subset eligible", "addressable market",
];

const INTERPRETATION_KEYWORDS = [
  "suggests that", "may indicate", "could mean", "implies",
  "interpretation", "our view", "we believe", "in our opinion",
  "analyst perspective", "narrative", "sentiment", "outlook",
  "expectation", "consensus view", "market perception",
  "likely reflects", "appears to", "seems to indicate",
  "taken together", "overall assessment", "summary judgment",
  "reading of the evidence", "framing", "contextualizes",
];

interface ClassificationInput {
  signalDescription: string;
  sourceUrl?: string | null;
  observedAt?: string | Date | null;
  noveltyFlag?: boolean | null;
  echoVsTranslation?: string | null;
  dependencyRole?: string | null;
  lineageType?: string | null;
  signalType?: string | null;
  evidenceStatus?: string | null;
  direction?: string | null;
}

export interface ClassificationResult {
  evidenceClass: EvidenceClass;
  countTowardPosterior: boolean;
  classificationReasons: string[];
}

function isValidUrl(str: string): boolean {
  try {
    const u = new URL(str);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function hasEventSpecificity(description: string): boolean {
  const eventIndicators = [
    /\b(approved|rejected|submitted|filed|granted|launched|announced|reported|reports|published|released|completed|initiated|enrolled|achieved|failed|withdrew|suspended|terminated|received|issued|demonstrated|shows|showed)\b/i,
    /\b(Q[1-4]\s*20\d{2}|January|February|March|April|May|June|July|August|September|October|November|December)\b/i,
    /\b(Phase\s*[I]{1,3}[ab]?|Phase\s*[1-4][ab]?|PDUFA|NDA|BLA|sNDA|sBLA|MAA|EMA|FDA)\b/i,
    /\b(trial|study|data|results|endpoint|p-value|hazard ratio|response rate|efficacy|safety)\b/i,
    /\b(contract|agreement|partnership|acquisition|licensing|deal|investment)\b/i,
    /\b(coverage|formulary|access|restriction|step therapy|prior authorization)\b/i,
    /\b(discontinuation|adverse events?|tolerability|open-label|extension|conversion rate|sputum culture|monitoring|REMS)\b/i,
    /\b(label change|label update|guideline update|guideline revision|practice guideline)\b/i,
    /\b(real-world|registry|post-marketing|pharmacovigilance|observational)\b/i,
    /\b(market entry|market withdrawal|approval|launch|filing|designation|breakthrough therapy)\b/i,
  ];
  return eventIndicators.some((re) => re.test(description));
}

function matchesKeywordList(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  let matches = 0;
  for (const kw of keywords) {
    if (lower.includes(kw)) matches++;
  }
  return matches;
}

export function classifyEvidence(input: ClassificationInput): ClassificationResult {
  const reasons: string[] = [];
  const desc = (input.signalDescription || "").trim();

  const hasSource = !!(input.sourceUrl && isValidUrl(input.sourceUrl));
  const hasDate = !!(input.observedAt);
  const isNovel = input.noveltyFlag !== false;
  const isEcho = input.echoVsTranslation === "Echo";
  const isDerivative =
    input.dependencyRole === "Direct derivative" ||
    input.dependencyRole === "Second-order derivative";
  const evidenceRejected = input.evidenceStatus === "Rejected";

  if (evidenceRejected) {
    reasons.push("Evidence status is Rejected");
    return { evidenceClass: "RejectedArtifact", countTowardPosterior: false, classificationReasons: reasons };
  }

  if (!hasSource && !hasDate) {
    reasons.push("Missing both source URL and observation date");
    return { evidenceClass: "RejectedArtifact", countTowardPosterior: false, classificationReasons: reasons };
  }

  if (isEcho) {
    reasons.push("Classified as Echo (duplicate of existing evidence)");
    return { evidenceClass: "RejectedArtifact", countTowardPosterior: false, classificationReasons: reasons };
  }

  const interpretationScore = matchesKeywordList(desc, INTERPRETATION_KEYWORDS);
  if (interpretationScore >= 2) {
    reasons.push(`Description matches ${interpretationScore} interpretation markers`);
    return { evidenceClass: "InterpretationNote", countTowardPosterior: false, classificationReasons: reasons };
  }

  const structuralScore = matchesKeywordList(desc, STRUCTURAL_KEYWORDS);
  const hasEvent = hasEventSpecificity(desc);

  if (structuralScore >= 2 && !hasEvent) {
    reasons.push(`Description matches ${structuralScore} structural context markers with no event specificity`);
    return { evidenceClass: "StructuralContext", countTowardPosterior: false, classificationReasons: reasons };
  }

  if (!hasSource) {
    reasons.push("Missing verifiable source URL — cannot confirm as dynamic signal");
    if (structuralScore >= 1) {
      reasons.push("Partial structural context match — classified as context");
      return { evidenceClass: "StructuralContext", countTowardPosterior: false, classificationReasons: reasons };
    }
    return { evidenceClass: "RejectedArtifact", countTowardPosterior: false, classificationReasons: reasons };
  }

  if (!hasDate) {
    reasons.push("Missing observation date — cannot anchor in time");
    return { evidenceClass: "StructuralContext", countTowardPosterior: false, classificationReasons: reasons };
  }

  if (!isNovel) {
    reasons.push("Novelty flag is false — derivative information");
    return { evidenceClass: "InterpretationNote", countTowardPosterior: false, classificationReasons: reasons };
  }

  if (isDerivative) {
    reasons.push(`Dependency role "${input.dependencyRole}" — derivative of root evidence`);
    return { evidenceClass: "InterpretationNote", countTowardPosterior: false, classificationReasons: reasons };
  }

  if (!hasEvent) {
    reasons.push("No event-specific language detected — classified as structural context");
    return { evidenceClass: "StructuralContext", countTowardPosterior: false, classificationReasons: reasons };
  }

  reasons.push("Has source URL, observation date, event specificity, and novel non-derivative content");
  return { evidenceClass: "DynamicSignal", countTowardPosterior: true, classificationReasons: reasons };
}
