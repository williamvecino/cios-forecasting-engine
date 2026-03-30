export type IdentifierType = "pmid" | "doi" | "nct" | "unknown";
export type VerificationStatus = "verified" | "invalid" | "unverified" | "flagged";

export interface VerificationResult {
  identifierType: IdentifierType;
  identifierValue: string;
  identifierSource: string;
  verificationStatus: VerificationStatus;
  registryMatch: boolean;
  redFlags: string[];
}

export interface ExtractionResult {
  identifiers: { type: IdentifierType; value: string; source: string }[];
  redFlags: string[];
}

const PMID_REGEX = /\bPMID[:\s]*(\d{6,9})\b/gi;
const DOI_REGEX = /\b(10\.\d{4,9}\/[^\s,;]+)/g;
const NCT_REGEX = /\b(NCT\d{8})\b/gi;
const NARRATIVE_CITATION_REGEX = /\b([A-Z][a-z]+(?:\s+(?:et\s+al\.?|and\s+[A-Z][a-z]+))?,?\s*(?:19|20)\d{2})\b/g;

export function extractIdentifiers(text: string): ExtractionResult {
  const identifiers: ExtractionResult["identifiers"] = [];
  const redFlags: string[] = [];

  let match: RegExpExecArray | null;

  const pmidRegex = new RegExp(PMID_REGEX.source, "gi");
  while ((match = pmidRegex.exec(text)) !== null) {
    identifiers.push({ type: "pmid", value: match[1], source: "extracted_from_text" });
  }

  const doiRegex = new RegExp(DOI_REGEX.source, "g");
  while ((match = doiRegex.exec(text)) !== null) {
    identifiers.push({ type: "doi", value: match[1], source: "extracted_from_text" });
  }

  const nctRegex = new RegExp(NCT_REGEX.source, "gi");
  while ((match = nctRegex.exec(text)) !== null) {
    identifiers.push({ type: "nct", value: match[1].toUpperCase(), source: "extracted_from_text" });
  }

  redFlags.push(...detectRedFlags(text, identifiers.length));

  return { identifiers, redFlags };
}

export function detectRedFlags(text: string, identifierCount: number): string[] {
  const flags: string[] = [];

  if (identifierCount === 0 && text.length > 50) {
    const narrativeMatches = text.match(NARRATIVE_CITATION_REGEX);
    if (narrativeMatches && narrativeMatches.length > 0) {
      flags.push("Narrative citation detected without verifiable identifier (PMID/DOI/NCT)");
    }
  }

  const percentPattern = /\b(\d{2,3})%\b/g;
  const percentages: number[] = [];
  let pMatch: RegExpExecArray | null;
  const pRegex = new RegExp(percentPattern.source, "g");
  while ((pMatch = pRegex.exec(text)) !== null) {
    percentages.push(parseInt(pMatch[1]));
  }
  if (percentages.length > 0 && percentages.every(p => p % 5 === 0)) {
    flags.push("All percentages are perfectly rounded — possible fabricated data");
  }

  if (text.length > 100 && !text.match(/\bn\s*=\s*\d+/i) && text.match(/\b(study|trial|patients|subjects)\b/i)) {
    flags.push("Study reference without sample size");
  }

  if (text.match(/\b(journal\s+of\s+\w+\s+\w+\s+\w+\s+\w+|international\s+journal\s+of\s+\w+\s+and\s+\w+\s+research)/i)) {
    flags.push("Nonstandard journal name detected — possible hallucinated source");
  }

  return flags;
}

export type VerifyOutcome = "valid" | "invalid" | "error";

export async function verifyPmid(pmid: string): Promise<{ outcome: VerifyOutcome; title?: string }> {
  try {
    const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${pmid}&retmode=json`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return { outcome: "error" };

    const data = await response.json() as any;
    const result = data?.result?.[pmid];
    if (result && !result.error) {
      return { outcome: "valid", title: result.title };
    }
    return { outcome: "invalid" };
  } catch {
    return { outcome: "error" };
  }
}

export async function verifyDoi(doi: string): Promise<{ outcome: VerifyOutcome; title?: string }> {
  try {
    const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "CIOS/1.0 (mailto:support@cios.dev)" },
    });
    if (!response.ok) {
      return response.status === 404 ? { outcome: "invalid" } : { outcome: "error" };
    }

    const data = await response.json() as any;
    const title = data?.message?.title?.[0];
    return { outcome: "valid", title };
  } catch {
    return { outcome: "error" };
  }
}

export async function verifyNct(nctId: string): Promise<{ outcome: VerifyOutcome; title?: string }> {
  try {
    const url = `https://clinicaltrials.gov/api/v2/studies/${nctId}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      return response.status === 404 ? { outcome: "invalid" } : { outcome: "error" };
    }

    const data = await response.json() as any;
    const title = data?.protocolSection?.identificationModule?.officialTitle;
    return { outcome: "valid", title };
  } catch {
    return { outcome: "error" };
  }
}

export async function verifyIdentifier(
  type: IdentifierType,
  value: string,
): Promise<{ outcome: VerifyOutcome; title?: string }> {
  switch (type) {
    case "pmid": return verifyPmid(value);
    case "doi": return verifyDoi(value);
    case "nct": return verifyNct(value);
    default: return { outcome: "invalid" };
  }
}

export async function verifySignalEvidence(
  evidenceText: string,
  sourceLabel?: string,
): Promise<VerificationResult[]> {
  const combinedText = `${evidenceText || ""} ${sourceLabel || ""}`;
  const { identifiers, redFlags } = extractIdentifiers(combinedText);

  if (identifiers.length === 0) {
    return [{
      identifierType: "unknown",
      identifierValue: "",
      identifierSource: "none_found",
      verificationStatus: redFlags.length > 0 ? "flagged" : "unverified",
      registryMatch: false,
      redFlags,
    }];
  }

  const results: VerificationResult[] = [];
  for (const id of identifiers) {
    const check = await verifyIdentifier(id.type, id.value);
    const status: VerificationStatus =
      check.outcome === "valid" ? "verified" :
      check.outcome === "invalid" ? "invalid" :
      "unverified";
    const idRedFlags: string[] =
      check.outcome === "invalid" ? [`${id.type.toUpperCase()} ${id.value} not found in registry`] :
      check.outcome === "error" ? [`Registry lookup failed for ${id.type.toUpperCase()} ${id.value} (network error)`] :
      [];
    results.push({
      identifierType: id.type,
      identifierValue: id.value,
      identifierSource: id.source,
      verificationStatus: status,
      registryMatch: check.outcome === "valid",
      redFlags: idRedFlags,
    });
  }

  if (redFlags.length > 0 && results.length > 0) {
    results[0].redFlags = [...results[0].redFlags, ...redFlags];
  }

  return results;
}
