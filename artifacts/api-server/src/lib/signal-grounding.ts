import { db, signalsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface VerifiedSource {
  signalId: string;
  description: string;
  signalType: string;
  direction: string;
  strengthScore: number | null;
  sourceUrl: string | null;
  sourceLabel: string | null;
  evidenceSnippet: string | null;
  identifierType: string | null;
  identifierValue: string | null;
}

export interface ClinicalDimension {
  dimension: string;
  present: boolean;
  signals: { signalId: string; description: string; direction: string; signalType: string }[];
  gap: string | null;
}

export interface SignalStackContext {
  verifiedSources: VerifiedSource[];
  knownIdentifiers: Set<string>;
  clinicalDimensions: ClinicalDimension[];
  dimensionGaps: string[];
  hasSignalStack: boolean;
  sourceCatalog: string;
  dimensionPromptBlock: string;
  zeroFabricationBlock: string;
}

const ENDPOINT_KEYWORDS = [
  "primary endpoint", "endpoint", "met its", "met primary", "pivotal",
  "culture conversion", "symptom score", "rss", "efficacy", "phase 3",
  "phase iii", "readout", "topline", "results", "outcome measure",
  "superiority", "non-inferiority", "responder rate",
];

const SAFETY_KEYWORDS = [
  "safety", "tolerability", "adverse", "side effect", "toxicity",
  "black box", "boxed warning", "rems", "risk evaluation", "death",
  "serious adverse", "hepatotoxicity", "nephrotoxicity", "ototoxicity",
  "cardiotoxicity", "hypersensitivity", "bronchospasm", "dysphonia",
  "warning", "contraindication",
];

const DOSING_KEYWORDS = [
  "dosing", "administration", "infusion", "nebuliz", "inhal", "injection",
  "oral", "subcutaneous", "intravenous", "regimen", "cycle", "device",
  "lamira", "delivery", "preparation", "reconstitution", "treatment duration",
  "frequency", "once daily", "twice daily", "weekly", "monthly",
  "operational", "burden", "workflow", "logistics",
];

const PRO_KEYWORDS = [
  "patient reported", "pro ", "pros ", "patient experience", "quality of life",
  "qol", "symptom score", "rss", "fatigue", "symptom burden",
  "functional status", "patient satisfaction", "treatment satisfaction",
  "adherence", "compliance", "patient preference", "hrqol",
  "patient-meaningful", "patient-centered",
];

export function classifySignalDimension(description: string, signalType: string): string[] {
  const lower = `${description} ${signalType}`.toLowerCase();
  const dims: string[] = [];

  if (ENDPOINT_KEYWORDS.some(k => lower.includes(k))) dims.push("primary_endpoint");
  if (SAFETY_KEYWORDS.some(k => lower.includes(k))) dims.push("safety");
  if (DOSING_KEYWORDS.some(k => lower.includes(k))) dims.push("dosing_administration");
  if (PRO_KEYWORDS.some(k => lower.includes(k))) dims.push("patient_experience_pro");

  if (dims.length === 0) {
    const typeLower = signalType.toLowerCase();
    if (typeLower.includes("phase") && (typeLower.includes("clinical") || typeLower.includes("iii") || typeLower.includes("3"))) dims.push("primary_endpoint");
    else if (typeLower.includes("safety") || typeLower.includes("tolerability")) dims.push("safety");
    else if (typeLower.includes("operational") || typeLower.includes("friction") || typeLower.includes("constraint") || typeLower.includes("manufacturing")) dims.push("dosing_administration");
    else dims.push("other");
  }

  return dims;
}

export function buildClinicalDimensions(sources: VerifiedSource[]): ClinicalDimension[] {
  const dims: Record<string, ClinicalDimension> = {
    primary_endpoint: {
      dimension: "Primary Endpoint & Efficacy",
      present: false,
      signals: [],
      gap: null,
    },
    safety: {
      dimension: "Safety & Tolerability",
      present: false,
      signals: [],
      gap: null,
    },
    dosing_administration: {
      dimension: "Dosing & Administration",
      present: false,
      signals: [],
      gap: null,
    },
    patient_experience_pro: {
      dimension: "Patient Experience / PRO",
      present: false,
      signals: [],
      gap: null,
    },
  };

  for (const s of sources) {
    const classifications = classifySignalDimension(s.description, s.signalType);
    for (const dimKey of classifications) {
      if (dimKey === "other") continue;
      if (dims[dimKey]) {
        dims[dimKey].signals.push({
          signalId: s.signalId,
          description: s.description,
          direction: s.direction,
          signalType: s.signalType,
        });
        dims[dimKey].present = true;
      }
    }
  }

  for (const dim of Object.values(dims)) {
    if (!dim.present) {
      dim.gap = `No ${dim.dimension.toLowerCase()} data in signal stack — content cannot be generated for this dimension. Add signals before re-running.`;
    }
  }

  return Object.values(dims);
}

export function buildDimensionPromptBlock(dimensions: ClinicalDimension[]): string {
  const lines: string[] = [];
  lines.push("═══ CLINICAL DIMENSIONS FROM SIGNAL STACK (READ BEFORE GENERATING) ═══");
  lines.push("You must use ONLY these facts when generating content.");
  lines.push("Do NOT supplement, override, or reframe any dimension with knowledge from your training data.");
  lines.push("");

  for (const dim of dimensions) {
    lines.push(`── ${dim.dimension.toUpperCase()} ──`);
    if (!dim.present) {
      lines.push(`  ⚠ GAP: ${dim.gap}`);
      lines.push(`  → Do NOT generate content for this dimension. Note the gap in the output.`);
    } else {
      for (const sig of dim.signals) {
        lines.push(`  [${sig.signalId}] (${sig.direction}) ${sig.signalType}: ${sig.description.slice(0, 250)}`);
      }
    }
    lines.push("");
  }

  lines.push("CRITICAL: If the signal stack shows a specific primary endpoint (e.g., RSS, PRO-based),");
  lines.push("you MUST use that endpoint in all content. Do NOT default to a different");
  lines.push("endpoint from your training data.");
  lines.push("═══ END CLINICAL DIMENSIONS ═══");

  return lines.join("\n");
}

export function buildVerifiedSourceCatalog(sources: VerifiedSource[]): string {
  if (sources.length === 0) return "";
  const lines = sources.map((s, i) => {
    const parts = [`[S${i + 1}] signalId=${s.signalId}`];
    parts.push(`type="${s.signalType}"`);
    parts.push(`direction="${s.direction}"`);
    parts.push(`description="${s.description}"`);
    const displayLabel = s.sourceLabel || s.evidenceSnippet?.slice(0, 80) || "";
    if (displayLabel) parts.push(`sourceName="${displayLabel}"`);
    if (s.sourceUrl && !s.sourceUrl.startsWith("sonar-summary://")) parts.push(`url="${s.sourceUrl}"`);
    if (s.evidenceSnippet) parts.push(`snippet="${s.evidenceSnippet.slice(0, 200)}"`);
    if (s.identifierType && s.identifierValue) parts.push(`${s.identifierType}=${s.identifierValue}`);
    return parts.join(" | ");
  });
  return lines.join("\n");
}

export function buildZeroFabricationBlock(sourceCatalog: string, hasSignalStack: boolean): string {
  if (!hasSignalStack) return "";
  return `
═══ ZERO-FABRICATION RULE (MANDATORY — OVERRIDES ALL OTHER INSTRUCTIONS) ═══
You are provided with a VERIFIED SOURCE CATALOG and CLINICAL DIMENSIONS.
These are the ONLY facts and sources you may use.

RULES:
1. You must ONLY cite sources that appear in the verified source catalog. Reference them by their sourceName (e.g. "Insmed ENCORE Topline Presentation", "CONVERT trial — NEJM") — do NOT use raw signal IDs like "ARIK-006" as source attribution.
2. You must NOT generate, invent, or recall ANY new PMIDs, DOIs, NCT numbers, journal citations, or specific author/year references from your training data.
3. You must NOT use clinical facts from your training data that contradict or extend beyond what the signal stack contains.
4. If a claim cannot be grounded to a source in the catalog — omit it or flag it as "unverified — not in signal stack".
5. Any PMID, DOI, or NCT number not in the catalog is FABRICATED and must not appear anywhere in your output.

VERIFIED SOURCE CATALOG:
${sourceCatalog}
═══ END ZERO-FABRICATION RULE ═══
`;
}

const PMID_PATTERN = /PMID[:\s]*(\d{6,})/gi;
const DOI_PATTERN = /10\.\d{4,}\/[^\s,;)]+/gi;
const NCT_PATTERN = /NCT\d{8,}/gi;

export function containsFabricatedIdentifier(text: string, knownIdentifiers: Set<string>): boolean {
  const allIds: string[] = [];
  let m: RegExpExecArray | null;

  PMID_PATTERN.lastIndex = 0;
  while ((m = PMID_PATTERN.exec(text)) !== null) allIds.push(`PMID:${m[1]}`);

  DOI_PATTERN.lastIndex = 0;
  while ((m = DOI_PATTERN.exec(text)) !== null) allIds.push(`DOI:${m[0]}`);

  NCT_PATTERN.lastIndex = 0;
  while ((m = NCT_PATTERN.exec(text)) !== null) allIds.push(`NCT:${m[0]}`);

  for (const id of allIds) {
    if (!knownIdentifiers.has(id.toUpperCase())) return true;
  }
  return false;
}

export function stripFabricatedIdentifiers(text: string, knownIdentifiers: Set<string>): string {
  let result = text;

  result = result.replace(PMID_PATTERN, (match, pmid) => {
    return knownIdentifiers.has(`PMID:${pmid}`) ? match : "";
  });

  result = result.replace(DOI_PATTERN, (match) => {
    return knownIdentifiers.has(`DOI:${match}`.toUpperCase()) ? match : "";
  });

  result = result.replace(NCT_PATTERN, (match) => {
    return knownIdentifiers.has(`NCT:${match}`.toUpperCase()) ? match : "";
  });

  result = result.replace(/[,;]\s*[,;]/g, ",").replace(/\(\s*\)/g, "").replace(/\s{2,}/g, " ").trim();
  return result;
}

export function matchesToSignalStack(text: string, sources: VerifiedSource[]): VerifiedSource | null {
  const lower = text.toLowerCase();
  for (const s of sources) {
    if (s.identifierValue && lower.includes(s.identifierValue.toLowerCase())) return s;
    if (s.sourceLabel && s.sourceLabel.length > 5 && lower.includes(s.sourceLabel.toLowerCase())) return s;

    const trialNameMatch = s.description.match(/\b([A-Z][A-Z0-9\-]{2,})\b/g);
    if (trialNameMatch) {
      for (const trial of trialNameMatch) {
        if (lower.includes(trial.toLowerCase())) return s;
      }
    }

    const descWords = s.description.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    let wordMatches = 0;
    for (const w of descWords) {
      if (lower.includes(w)) wordMatches++;
    }
    if (descWords.length > 0 && wordMatches / descWords.length > 0.6) return s;
  }
  return null;
}

export async function loadSignalStack(caseId: string, toolName: string): Promise<SignalStackContext> {
  let verifiedSources: VerifiedSource[] = [];
  const knownIdentifiers = new Set<string>();

  try {
    const rows = await db
      .select({
        signalId: signalsTable.signalId,
        description: signalsTable.signalDescription,
        signalType: signalsTable.signalType,
        direction: signalsTable.direction,
        strengthScore: signalsTable.strengthScore,
        sourceUrl: signalsTable.sourceUrl,
        sourceLabel: signalsTable.sourceLabel,
        evidenceSnippet: signalsTable.evidenceSnippet,
        identifierType: signalsTable.identifierType,
        identifierValue: signalsTable.identifierValue,
      })
      .from(signalsTable)
      .where(eq(signalsTable.caseId, caseId));

    verifiedSources = rows.map(r => ({
      signalId: r.signalId,
      description: r.description || "",
      signalType: r.signalType || "",
      direction: r.direction || "Positive",
      strengthScore: r.strengthScore,
      sourceUrl: r.sourceUrl,
      sourceLabel: r.sourceLabel,
      evidenceSnippet: r.evidenceSnippet,
      identifierType: r.identifierType,
      identifierValue: r.identifierValue,
    }));

    for (const s of verifiedSources) {
      if (s.identifierType && s.identifierValue) {
        knownIdentifiers.add(`${s.identifierType.toUpperCase()}:${s.identifierValue.toUpperCase()}`);
      }
    }
    console.log(`[${toolName}] Loaded ${verifiedSources.length} verified sources for case ${caseId} (${knownIdentifiers.size} known identifiers)`);
  } catch (e) {
    console.log(`[${toolName}] Failed to load signal stack for case ${caseId}:`, (e as Error).message);
  }

  const hasSignalStack = verifiedSources.length > 0;
  const clinicalDimensions = buildClinicalDimensions(verifiedSources);
  const dimensionGaps = clinicalDimensions.filter(d => !d.present).map(d => d.gap!);
  const sourceCatalog = buildVerifiedSourceCatalog(verifiedSources);
  const dimensionPromptBlock = hasSignalStack ? buildDimensionPromptBlock(clinicalDimensions) : "";
  const zeroFabricationBlock = buildZeroFabricationBlock(sourceCatalog, hasSignalStack);

  if (hasSignalStack) {
    const dimSummary = clinicalDimensions.map(d => `${d.dimension}: ${d.present ? d.signals.length + " signals" : "GAP"}`).join(", ");
    console.log(`[${toolName}] Clinical dimensions: ${dimSummary}`);
  }

  return {
    verifiedSources,
    knownIdentifiers,
    clinicalDimensions,
    dimensionGaps,
    hasSignalStack,
    sourceCatalog,
    dimensionPromptBlock,
    zeroFabricationBlock,
  };
}

