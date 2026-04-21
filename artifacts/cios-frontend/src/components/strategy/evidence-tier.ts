export type EvidenceTier = "green" | "amber" | "blocked";

export interface SourceInfo {
  trialName?: string;
  journal?: string;
  year?: string | number;
  pmid?: string;
  nct?: string;
  cmsUrl?: string;
  payerSourceType?: string;
  policyName?: string;
}

export interface ClaimWithTier {
  evidenceTier: EvidenceTier;
  sourceQuote: string | null;
}

export interface SignalSource {
  signalId: string;
  description: string;
  signalType: string;
  direction: string;
  sourceLabel?: string | null;
  sourceUrl?: string | null;
  identifierType?: string | null;
  identifierValue?: string | null;
}

interface VerificationResult {
  pmidValid: boolean | null;
  nctValid: boolean | null;
  cmsValid: boolean | null;
  pmidError: boolean;
  nctError: boolean;
  cmsError: boolean;
  isPeerReviewed: boolean;
  isPayerAuthoritative: boolean;
  sourceType: "peer-reviewed" | "conference" | "press-release" | "registry-only" | "cms-coverage" | "formulary-policy" | "payer-policy" | "unknown";
}

async function verifySourcesBatch(sources: SourceInfo[]): Promise<VerificationResult[]> {
  try {
    const res = await fetch("/api/strategy/verify-sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sources: sources.map((s) => ({
          pmid: s.pmid || "",
          nct: s.nct || "",
          cmsUrl: s.cmsUrl || "",
          payerSourceType: s.payerSourceType || "",
        })),
      }),
    });
    if (!res.ok) throw new Error("verify failed");
    const data = await res.json();
    return data.results || [];
  } catch {
    return sources.map(() => ({
      pmidValid: null,
      nctValid: null,
      cmsValid: null,
      pmidError: true,
      nctError: true,
      cmsError: true,
      isPeerReviewed: false,
      isPayerAuthoritative: false,
      sourceType: "unknown" as const,
    }));
  }
}

function classifyWithoutSignalStack(
  source: SourceInfo | undefined,
  sourceQuote: string | null | undefined,
  verification: VerificationResult
): EvidenceTier {
  const quote = sourceQuote?.trim() || null;

  if (!quote) return "blocked";

  const hasPmid = !!(source?.pmid && source.pmid.trim());
  const hasNct = !!(source?.nct && source.nct.trim());
  const hasCmsUrl = !!(source?.cmsUrl && source.cmsUrl.trim());
  const hasPayerType = !!(source?.payerSourceType && source.payerSourceType.trim());
  const hasPolicyName = !!(source?.policyName && source.policyName.trim());

  const hasAnyIdentifier = hasPmid || hasNct || hasCmsUrl || hasPayerType || hasPolicyName;
  if (!hasAnyIdentifier) return "blocked";

  if (verification.isPayerAuthoritative) {
    const payerType = verification.sourceType;
    if (payerType === "cms-coverage") {
      if (hasCmsUrl && verification.cmsValid === true) return "green";
      if (hasCmsUrl && verification.cmsValid === false && !verification.cmsError) return "blocked";
      if (hasCmsUrl && verification.cmsError) return "amber";
      return "amber";
    }
    if (payerType === "formulary-policy" || payerType === "payer-policy") {
      return hasPolicyName ? "amber" : "amber";
    }
  }

  const pmidConfirmedInvalid = hasPmid && verification.pmidValid === false && !verification.pmidError;
  const nctConfirmedInvalid = hasNct && verification.nctValid === false && !verification.nctError;

  if (hasPmid && pmidConfirmedInvalid && (!hasNct || nctConfirmedInvalid)) {
    return "blocked";
  }
  if (!hasPmid && hasNct && nctConfirmedInvalid) {
    return "blocked";
  }

  const anyApiError = verification.pmidError || verification.nctError;
  if (anyApiError) {
    const pmidOk = hasPmid && verification.pmidValid === true;
    const nctOk = hasNct && verification.nctValid === true;
    if (!pmidOk && !nctOk) {
      return "amber";
    }
  }

  if (verification.sourceType === "conference" || verification.sourceType === "press-release") {
    return "amber";
  }

  if (verification.sourceType === "registry-only") {
    return "amber";
  }

  if (verification.isPeerReviewed && verification.sourceType === "peer-reviewed") {
    return "green";
  }

  if (verification.sourceType === "unknown") {
    const pmidVerified = hasPmid && verification.pmidValid === true;
    const nctVerified = hasNct && verification.nctValid === true;
    if (pmidVerified || nctVerified) {
      return "amber";
    }
    return "amber";
  }

  return "green";
}

export async function processClaimsWithTiers<T extends { source?: SourceInfo; sourceQuote?: string | null }>(
  claims: T[],
  signalSources?: SignalSource[]
): Promise<(T & ClaimWithTier)[]> {
  if (claims.length === 0) return [];

  const hasSignalStack = signalSources && signalSources.length > 0;

  if (hasSignalStack) {
    return claims.map((claim) => {
      const quote = claim.sourceQuote?.trim() || null;
      const hasSource = !!(claim.source?.trialName?.trim());
      return {
        ...claim,
        evidenceTier: (quote || hasSource) ? "green" as EvidenceTier : "blocked" as EvidenceTier,
        sourceQuote: quote,
      };
    });
  }

  const sources = claims.map((c) => c.source || {});
  const verifications = await verifySourcesBatch(sources);

  return claims.map((claim, i) => {
    const verification = verifications[i] || {
      pmidValid: null,
      nctValid: null,
      cmsValid: null,
      pmidError: true,
      nctError: true,
      cmsError: true,
      isPeerReviewed: false,
      isPayerAuthoritative: false,
      sourceType: "unknown" as const,
    };
    const tier = classifyWithoutSignalStack(claim.source, claim.sourceQuote, verification);
    return {
      ...claim,
      evidenceTier: tier,
      sourceQuote: claim.sourceQuote?.trim() || null,
    };
  });
}

export function filterAndSortByTier<T extends ClaimWithTier>(claims: T[]): T[] {
  return claims.filter((c) => c.evidenceTier !== "blocked");
}

export function buildSignalListForPrompt(signalSources: SignalSource[]): string {
  if (!signalSources.length) return "";
  return signalSources.map((s, i) => {
    const label = s.sourceLabel || s.signalId;
    return `Signal ${i + 1}: [Source: ${label}] (${s.direction}) ${s.signalType}\n  Evidence: ${s.description}`;
  }).join("\n\n");
}

export function buildSourceInstructions(signalSources: SignalSource[], fallback: string): string {
  if (!signalSources.length) return fallback;

  const uniqueSources = [...new Set(signalSources.map(s => s.sourceLabel).filter(Boolean))];
  const exampleSourceName = uniqueSources[0] || signalSources[0]?.signalId || "Trial Name";

  return `SOURCE RULES (MANDATORY):
- You must ONLY reference signals from the AVAILABLE SIGNALS list below
- Use the Source name (e.g. "${exampleSourceName}") as the trialName — do NOT use raw signal IDs like "ARIK-006"
- Copy the signal Evidence text as the sourceQuote — do NOT paraphrase or invent quotes
- Leave pmid, nct, journal, and year as empty strings — do NOT fabricate identifiers
- Do NOT introduce any clinical claims, trial names, or data not in the signal list
- SOURCE DIVERSITY RULE: Each row MUST cite the single most relevant source for THAT specific claim. Do NOT default to the same source for every row. Match the source to the topic — guideline claims cite guideline sources, safety claims cite safety sources, payer claims cite payer sources, etc.
- Available distinct sources: ${uniqueSources.join(", ")}

AVAILABLE SIGNALS:
${buildSignalListForPrompt(signalSources)}`;
}

export function injectSourceUrls<T extends { source?: { trialName?: string; sourceUrl?: string; [k: string]: any } }>(
  claims: T[],
  signalSources: SignalSource[],
): T[] {
  if (!signalSources.length) return claims;
  return claims.map(claim => {
    if (!claim.source?.trialName) return claim;
    const tn = claim.source.trialName.toLowerCase();
    const match = signalSources.find(s => {
      const label = (s.sourceLabel || "").toLowerCase();
      if (!label) return false;
      return label === tn || tn.includes(label) || label.includes(tn);
    });
    if (match?.sourceUrl) {
      return { ...claim, source: { ...claim.source, sourceUrl: match.sourceUrl } };
    }
    return claim;
  });
}
