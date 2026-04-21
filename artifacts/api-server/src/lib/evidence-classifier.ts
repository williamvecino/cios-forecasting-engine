import type { EvidenceClass } from "@workspace/db";

interface ClassificationInput {
  signalDescription: string;
  sourceUrl?: string | null;
  sourceLabel?: string | null;
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

function hasNamedEntity(description: string): boolean {
  const entityPatterns = [
    /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/,
    /\b(?:FDA|EMA|CDC|NIH|WHO|CMS|NICE)\b/,
    /\b(?:Phase\s*[I]{1,3}[ab]?|Phase\s*[1-4][ab]?)\b/i,
    /\b[A-Z]{2,}(?:AYCE|VERT|YPTO|ZOLE|UMAB|INIB|TIDE|PRIL|OLOL|OXIN|ATIN|ACIN)\b/,
    /\b[A-Za-z]{3,}(?:umab|inib|tide|pril|olol|oxin|atin|acin|ximab|asvir|buvir|previr|parib|caftor|cept|kinra|ciclib)\b/i,
    /\b(?:Pfizer|Novartis|Roche|Merck|AstraZeneca|Sanofi|GSK|Amgen|Gilead|AbbVie|Insmed|Lilly|BMS|J&J|Bayer|Vertex|Janssen|Legend|Bluebird|Bristol[- ]Myers[- ]Squibb|Genentech|Horizon|Amryt|Novo\s*Nordisk|Regeneron|Biogen|Genzyme|Abbott)\b/i,
    /\b(?:Cigna|Aetna|UnitedHealth|Humana|Anthem|Kaiser|BlueCross|Medicare|Medicaid)\b/i,
    /\b(?:CONVERT|KEYNOTE|CHECKMATE|IMPOWER|PACIFIC|HIMALAYA|TOPAZ|ORIENT|NEUTRINO|FISSION|POSITRON|VALENCE|ION|ASTRAL|SAPPHIRE|OPERA|ORATORIO|ORION|SOLO|CARTITUDE|KarMMa|ARMADA|PREMIER|IMMhance|IMMvent|ULTIMMA|SUSTAIN|LEADER|PIONEER|ARISE|ENCORE|THRIVE|SELECT)\b/,
    /\b(?:ARIKAYCE|KEYTRUDA|OPDIVO|TECENTRIQ|IMFINZI|TAGRISSO|LYNPARZA|Lamira|Trikafta|Orkambi|Symdeko|Kalydeco|Tepezza|Ocrevus|Copaxone|Glatopa|Repatha|Praluent|Leqvio|Dupixent|Zejula|Skyrizi|Stelara|Humira|Remicade|Enbrel|Abecma|Carvykti|FoundationOne|Sovaldi|Harvoni|Ozempic|Victoza|Wegovy|Rybelsus)\b/i,
    /\b(?:amikacin|pembrolizumab|nivolumab|atezolizumab|durvalumab|osimertinib)\b/i,
    /\b(?:PCSK9|CD20|IL-?23|TNF-?[\u03b1a]?|PARP|TMB-?high|GLP-?1|CFTR|HCV|MAC|RRMS|RRMM|TED|CVOT|ASCVD|MACE|SVR12|PASI\s*\d+|ACR\s*\d+|ORR|PFS|HbA1c|LDL-?C)\b/i,
    /\bn\s*=\s*\d+\b/i,
  ];
  return entityPatterns.some((re) => re.test(description));
}

function hasSpecificEvent(description: string): boolean {
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
    /\b(survey|prescrib\w+|discontinu\w+|enroll\w+|convert\w+)\b/i,
    /\b(?:dosing|injection|infusion|mechanism|monoclonal|biologic|manufacturing|switching|adherence|generic\s+entry|reduction|improvement|superiority)\b/i,
    /\b(?:complete response|relapse rate|culture conversion|weight loss)\b/i,
    /\binterferon[-.\s]?free\b/i,
    /\b12[-.\s]?week\s+(?:treatment|course|regimen)\b/i,
    /\bonce[-.\s]?weekly\b/i,
    /\bsubcutaneous\s+injection\b/i,
  ];
  return eventIndicators.some((re) => re.test(description));
}

function isVagueDescription(description: string, signalType: string): boolean {
  const words = description.split(/\s+/).filter(Boolean);
  if (words.length <= 5) {
    if (!hasNamedEntity(description) && !hasSpecificEvent(description)) {
      return true;
    }
  }

  if (signalType) {
    const normalizedDesc = description.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    const normalizedType = signalType.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    if (normalizedDesc === normalizedType ||
        normalizedDesc === `${normalizedType} signal` ||
        normalizedDesc === `${normalizedType} signals` ||
        normalizedDesc === `${normalizedType} indicator` ||
        normalizedDesc === `${normalizedType} flag`) {
      return true;
    }
  }

  const vaguePatterns = [
    /^(?:general|generic|misc|various|other|unspecified)\s/i,
    /^(?:signal|indicator|flag|marker|data\s*point)\s*$/i,
  ];
  if (vaguePatterns.some(re => re.test(description.trim()))) {
    return true;
  }

  return false;
}

export function classifyEvidence(input: ClassificationInput): ClassificationResult {
  const reasons: string[] = [];
  const desc = (input.signalDescription || "").trim();

  const hasSource = !!(input.sourceUrl && isValidUrl(input.sourceUrl));
  const hasDate = !!(input.observedAt);
  const isEcho = input.echoVsTranslation === "Echo";
  const evidenceRejected = input.evidenceStatus === "Rejected";
  const sourceIsAnalysis = (input.sourceLabel || "").trim().toLowerCase() === "analysis";

  if (evidenceRejected) {
    reasons.push("Evidence status is Rejected");
    return { evidenceClass: "Rejected", countTowardPosterior: false, classificationReasons: reasons };
  }

  if (isEcho) {
    reasons.push("Classified as Echo (duplicate of existing evidence)");
    return { evidenceClass: "Rejected", countTowardPosterior: false, classificationReasons: reasons };
  }

  if (!hasSource && !hasDate) {
    reasons.push("Missing both verifiable source and event date");
    return { evidenceClass: "Rejected", countTowardPosterior: false, classificationReasons: reasons };
  }

  if (sourceIsAnalysis) {
    reasons.push("Source is 'Analysis' — analytical content excluded from probability calculation");
    return { evidenceClass: "ContextOnly", countTowardPosterior: false, classificationReasons: reasons };
  }

  const isVague = isVagueDescription(desc, input.signalType ?? "");
  if (isVague) {
    reasons.push("Description is too vague — restates signal type without specific claim, entity, or event");
    return { evidenceClass: "Rejected", countTowardPosterior: false, classificationReasons: reasons };
  }

  const entity = hasNamedEntity(desc);
  const event = hasSpecificEvent(desc);

  const missing: string[] = [];
  if (!entity) missing.push("named entity");
  if (!event) missing.push("specific event");
  if (!hasSource) missing.push("verifiable source");
  if (!hasDate) missing.push("event date");

  if (missing.length === 0) {
    reasons.push("Has named entity, specific event, verifiable source, and event date");
    return { evidenceClass: "Eligible", countTowardPosterior: true, classificationReasons: reasons };
  }

  if (missing.length <= 1 && hasSource && hasDate) {
    reasons.push(`Missing ${missing.join(", ")} — context only, excluded from posterior`);
    return { evidenceClass: "ContextOnly", countTowardPosterior: false, classificationReasons: reasons };
  }

  if (!hasSource || !hasDate) {
    reasons.push(`Missing ${missing.join(", ")} — insufficient for eligibility or context`);
    return { evidenceClass: "Rejected", countTowardPosterior: false, classificationReasons: reasons };
  }

  reasons.push(`Missing ${missing.join(", ")} — classified as context`);
  return { evidenceClass: "ContextOnly", countTowardPosterior: false, classificationReasons: reasons };
}
