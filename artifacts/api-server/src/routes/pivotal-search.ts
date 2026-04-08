import { Router } from "express";
import { db } from "@workspace/db";
import { casesTable, signalsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { openai } from "@workspace/integrations-openai-ai-server";
import { lookupPrecedentLr } from "../lib/precedent-lookup.js";
import { verifyPmid, verifyDoi, verifyNct, detectRedFlags } from "../lib/evidence-verification.js";

const router = Router();

const MAX_APPROVE_BATCH = 20;

const KNOWN_TRIALS: Record<string, string[]> = {
  "veligrotug": ["THRIVE"],
  "vrdn-001": ["THRIVE"],
  "trikafta": ["AURORA"],
  "elexacaftor": ["AURORA"],
  "arikayce": ["ENCORE", "CONVERT", "ARISE"],
  "amikacin liposome": ["ENCORE", "CONVERT", "ARISE"],
  "leqembi": ["CLARITY AD"],
  "lecanemab": ["CLARITY AD"],
  "sublocade": ["NCT02357901"],
  "buprenorphine sq": ["NCT02357901"],
  "beovu": ["HAWK", "HARRIER"],
  "brolucizumab": ["HAWK", "HARRIER"],
};

function lookupKnownTrials(drugName: string): string[] | null {
  const lower = drugName.toLowerCase();
  for (const [key, trials] of Object.entries(KNOWN_TRIALS)) {
    if (lower.includes(key)) return trials;
  }
  return null;
}

const COMMON_ACRONYMS = new Set([
  "FDA", "CMS", "TED", "NDA", "BLA", "EMA", "NICE", "ATS", "IDSA",
  "NCCN", "ASCO", "MAC", "CAS", "IGF", "USA", "REMS", "PDUFA",
  "PMID", "DOI", "URL", "PDF", "CSV", "JSON",
]);

function matchesKnownTrial(trialName: string, knownTrials: string[]): boolean {
  const lower = trialName.toLowerCase().trim();
  return knownTrials.some(
    (kt) => lower === kt.toLowerCase() || lower.startsWith(kt.toLowerCase() + " ")
  );
}

function verifyTrialNamesNoCorpus(findings: any[], drugName: string): any[] {
  const knownTrials = lookupKnownTrials(drugName);

  return findings.map((f) => {
    const result = { ...f, unverifiedTrialName: false, knownTrialHint: null as string | null };

    if (!result.trialName || typeof result.trialName !== "string" || result.trialName.trim().length === 0) {
      result.trialName = null;
      if (knownTrials) {
        result.knownTrialHint = `Known trials for this drug: [${knownTrials.join(", ")}]. Consider searching for these specifically.`;
      }
      return result;
    }

    const trialNameRaw = result.trialName.trim();

    if (COMMON_ACRONYMS.has(trialNameRaw.toUpperCase())) {
      return result;
    }

    result.unverifiedTrialName = true;

    const warning = `\u26A0 TRIAL NAME UNVERIFIED: '${trialNameRaw}' was not found in search sources. Confirm before approving. `;
    result.finding = warning + (result.finding || "");
    console.log(`[PIVOTAL-SEARCH] UNVERIFIED TRIAL: "${trialNameRaw}" — no source corpus available to verify.`);

    if (knownTrials) {
      if (!matchesKnownTrial(trialNameRaw, knownTrials)) {
        const mismatchWarning = `\u26A0 KNOWN TRIAL MISMATCH: Expected [${knownTrials.join(", ")}] for ${drugName}. Got [${trialNameRaw}]. This may be a fabricated trial name. `;
        result.finding = mismatchWarning + result.finding;
        result.knownTrialHint = `Known trials for this drug: [${knownTrials.join(", ")}]. '${trialNameRaw}' does not match — verify independently.`;
        console.log(`[PIVOTAL-SEARCH] TRIAL MISMATCH: "${trialNameRaw}" does not match known trials [${knownTrials.join(", ")}] for ${drugName}.`);
      } else {
        result.knownTrialHint = `'${trialNameRaw}' matches a known trial for this drug, but source verification was unavailable.`;
      }
    }

    return result;
  });
}
const SEARCH_RESULT_TTL_MS = 30 * 60 * 1000;

const HIGH_TRUST_DOMAINS = new Set([
  "gov", "edu", "pubmed.ncbi.nlm.nih.gov", "nejm.org", "thelancet.com",
  "nature.com", "bmj.com", "jamanetwork.com", "fda.gov", "ema.europa.eu",
  "clinicaltrials.gov", "cochranelibrary.com",
]);

function isHighTrustSource(url: string | null): boolean {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    for (const domain of HIGH_TRUST_DOMAINS) {
      if (hostname === domain || hostname.endsWith("." + domain)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function computeSourceConfidence(
  sourceQuote: string | null,
  sourceUrl: string | null,
  unverifiedTrialName: boolean,
): "Strong" | "Moderate" | "Weak" {
  if (unverifiedTrialName) return "Weak";
  if (!sourceQuote || sourceQuote.trim().length === 0) return "Weak";
  if (isHighTrustSource(sourceUrl)) return "Strong";
  return "Moderate";
}

interface StoredCandidate {
  tempId: string;
  category: string;
  trialName: string | null;
  pmid: string | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  finding: string;
  signalType: string;
  direction: string;
  strengthScore: number;
  reliabilityScore: number;
  likelihoodRatio: number;
  precedentMatched: boolean;
  sourceQuote: string | null;
  sourceConfidence: "Strong" | "Moderate" | "Weak";
  unverifiedTrialName: boolean;
  knownTrialHint: string | null;
}

interface StoredSearchResult {
  candidates: Map<string, StoredCandidate>;
  createdAt: number;
}

const searchResultStore = new Map<string, StoredSearchResult>();

function pruneExpiredResults() {
  const now = Date.now();
  for (const [key, entry] of searchResultStore) {
    if (now - entry.createdAt > SEARCH_RESULT_TTL_MS) {
      searchResultStore.delete(key);
    }
  }
}

function isSafeUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return url;
    return null;
  } catch {
    return null;
  }
}

const ALLOWED_SIGNAL_TYPES = new Set([
  "Phase III clinical trial",
  "FDA approval",
  "Guideline inclusion",
  "Safety / tolerability",
  "Payer / coverage",
  "Real-world evidence",
  "Prescribing information",
  "Field intelligence",
]);

const ALLOWED_CATEGORIES = new Set([
  "Pivotal Trials",
  "Label / Approval Data",
  "Guidelines",
  "Safety",
  "Payer / Access",
]);

function buildSearchQueries(drugName: string, indication: string, year: string) {
  return [
    {
      category: "Pivotal Trials",
      queries: [
        `${drugName} phase 3 trial ${indication}`,
        `${drugName} randomized controlled trial`,
        `${drugName} FDA approval ${indication}`,
        `${drugName} clinical trial results`,
      ],
    },
    {
      category: "Label / Approval Data",
      queries: [
        `${drugName} FDA label`,
        `${drugName} prescribing information`,
        `${drugName} package insert`,
      ],
    },
    {
      category: "Guidelines",
      queries: [
        `${indication} treatment guidelines ${year}`,
        `${indication} society recommendations`,
        `${drugName} guideline recommendation`,
      ],
    },
    {
      category: "Safety",
      queries: [
        `${drugName} adverse events`,
        `${drugName} post-marketing safety`,
        `${drugName} FDA safety communication`,
      ],
    },
    {
      category: "Payer / Access",
      queries: [
        `${drugName} coverage criteria`,
        `${drugName} prior authorization`,
        `${drugName} Medicare Medicaid coverage`,
      ],
    },
  ];
}

const PIVOTAL_SEARCH_PROMPT = `You are a medical evidence extractor.
You receive a drug name, indication, and structured search query categories.
Your job is to extract — NOT generate — findings that a real analyst would discover from these queries.

Rules:
- Only report information that is real, published, and verifiable
- If a trial name is not a real, published trial for this drug, return trialName: null
- If a statistic cannot be verified, do not include it
- If you cannot find a specific finding for a field, return null — never invent
- Quote the exact phrase or key data point that supports each finding in a sourceQuote field
- If no relevant finding exists for a category, skip it
- Return 10-15 findings total across all categories

Return ONLY a valid JSON object (no markdown, no preamble) with this structure:
{
  "findings": [
    {
      "category": "the search category (e.g. Pivotal Trials, Label / Approval Data)",
      "trialName": "string | null — only if a real, named trial",
      "pmid": "string (numbers only) | null",
      "sourceUrl": "string | null",
      "sourceTitle": "string | null",
      "finding": "ONE sentence summarizing the key result or conclusion",
      "sourceQuote": "exact phrase or data point supporting this finding, or null",
      "signalType": "one of: Phase III clinical trial, FDA approval, Guideline inclusion, Safety / tolerability, Payer / coverage, Real-world evidence, Prescribing information",
      "direction": "Positive or Negative",
      "strengthScore": "1-5 (1=weak, 5=strong)",
      "reliabilityScore": "1-5 (1=anecdotal, 5=verified/published)"
    }
  ]
}`;

router.post("/cases/:caseId/pivotal-search", async (req, res) => {
  const { caseId } = req.params;

  const [caseRow] = await db.select().from(casesTable).where(eq(casesTable.caseId, caseId)).limit(1);
  if (!caseRow) {
    return res.status(404).json({ error: "Case not found" });
  }

  const drugName = caseRow.assetName || caseRow.primaryBrand || "";
  const indication = caseRow.diseaseState || caseRow.therapeuticArea || "";

  if (!drugName.trim()) {
    return res.status(400).json({ error: "Case has no drug name (assetName). Cannot run structured evidence search." });
  }

  const year = new Date().getFullYear().toString();
  const searchCategories = buildSearchQueries(drugName, indication, year);

  const queryListing = searchCategories
    .map((cat) => `## ${cat.category}\n${cat.queries.map((q) => `- "${q}"`).join("\n")}`)
    .join("\n\n");

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      seed: 42,
      max_completion_tokens: 4096,
      messages: [
        { role: "system", content: PIVOTAL_SEARCH_PROMPT },
        {
          role: "user",
          content: `Drug: ${drugName}\nIndication: ${indication}\n\nSearch queries by category:\n\n${queryListing}\n\nReturn a JSON array of the top findings across all categories.`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let findings: any[] = [];

    try {
      const cleaned = raw.replace(/```json\n?|```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        findings = parsed;
      } else if (typeof parsed === "object" && parsed !== null) {
        const firstArrayKey = Object.keys(parsed).find((k) => Array.isArray(parsed[k]));
        if (firstArrayKey) {
          findings = parsed[firstArrayKey];
        } else if (parsed.finding && typeof parsed.finding === "string") {
          findings = [parsed];
        }
      }
    } catch {
      return res.status(502).json({ error: "Evidence search returned an unexpected format. Please try again." });
    }

    console.log("[PIVOTAL-SEARCH] Raw LLM findings (pre-verification):", JSON.stringify(findings, null, 2));

    const verifiedFindings = verifyTrialNamesNoCorpus(findings, drugName);

    console.log("[PIVOTAL-SEARCH] Verified findings (post-processing):", JSON.stringify(verifiedFindings, null, 2));

    const candidateMap = new Map<string, StoredCandidate>();

    for (const f of verifiedFindings) {
      const signalType = ALLOWED_SIGNAL_TYPES.has(f.signalType) ? f.signalType : "Field intelligence";
      const direction = f.direction === "Negative" ? "Negative" : "Positive";
      const strength = Math.min(5, Math.max(1, Number(f.strengthScore) || 3));
      const reliability = Math.min(5, Math.max(1, Number(f.reliabilityScore) || 3));
      const precedentResult = lookupPrecedentLr(signalType, direction);
      const lr = precedentResult.matched ? precedentResult.assignedLr : 1.0;
      const category = ALLOWED_CATEGORIES.has(f.category) ? f.category : "Unknown";
      const pmid = f.pmid ? String(f.pmid).replace(/\D/g, "") : null;

      const sourceQuote = typeof f.sourceQuote === "string" && f.sourceQuote.trim().length > 0
        ? f.sourceQuote.slice(0, 500) : null;
      const resolvedUrl = isSafeUrl(f.sourceUrl);
      const unverified = !!f.unverifiedTrialName;

      // Verify PMID against PubMed registry
      let pmidVerified = false;
      if (pmid) {
        const check = await verifyPmid(pmid);
        pmidVerified = check.outcome === "valid";
        if (check.outcome === "invalid") {
          console.log(`[PIVOTAL-SEARCH] INVALID PMID: ${pmid} — not found in PubMed registry. Possible hallucination.`);
        }
      }

      // Red flag detection on the finding text
      const findingText = typeof f.finding === "string" ? f.finding : "";
      const redFlags = detectRedFlags(findingText, pmid ? 1 : 0);

      // Source confidence now accounts for PMID verification
      const pmidUnverified = pmid ? !pmidVerified : false;
      const sourceConfidence = computeSourceConfidence(sourceQuote, resolvedUrl, unverified || pmidUnverified);

      const candidate: StoredCandidate = {
        tempId: randomUUID(),
        category,
        trialName: typeof f.trialName === "string" && f.trialName.length > 0 ? f.trialName.slice(0, 200) : null,
        pmid: pmidVerified ? pmid : null, // Only keep PMID if verified
        sourceUrl: resolvedUrl,
        sourceTitle: typeof f.sourceTitle === "string" ? f.sourceTitle.slice(0, 300) : null,
        finding: typeof f.finding === "string" ? f.finding.slice(0, 800) : "",
        sourceQuote,
        sourceConfidence,
        signalType,
        direction,
        strengthScore: strength,
        reliabilityScore: reliability,
        likelihoodRatio: lr,
        precedentMatched: precedentResult.matched,
        unverifiedTrialName: unverified || (pmid != null && !pmidVerified),
        knownTrialHint: typeof f.knownTrialHint === "string" ? f.knownTrialHint : null,
        ...(redFlags.length > 0 ? { redFlags } : {}),
        ...(pmid && !pmidVerified ? { invalidPmid: pmid } : {}),
      };

      candidateMap.set(candidate.tempId, candidate);
    }

    pruneExpiredResults();
    searchResultStore.set(caseId, {
      candidates: candidateMap,
      createdAt: Date.now(),
    });

    res.json({
      caseId,
      drugName,
      indication,
      searchCategories: searchCategories.map((c) => c.category),
      candidates: Array.from(candidateMap.values()),
    });
  } catch (err: any) {
    console.error("Pivotal search error:", err);
    res.status(500).json({ error: "Evidence search failed. Please try again." });
  }
});

router.post("/cases/:caseId/pivotal-search/approve", async (req, res) => {
  const { caseId } = req.params;
  const { tempIds } = req.body as { tempIds: string[] };

  if (!Array.isArray(tempIds) || tempIds.length === 0) {
    return res.status(400).json({ error: "No candidate IDs to approve." });
  }

  if (tempIds.length > MAX_APPROVE_BATCH) {
    return res.status(400).json({ error: `Cannot approve more than ${MAX_APPROVE_BATCH} candidates at once.` });
  }

  const stored = searchResultStore.get(caseId);
  if (!stored || Date.now() - stored.createdAt > SEARCH_RESULT_TTL_MS) {
    searchResultStore.delete(caseId);
    return res.status(410).json({ error: "Search results have expired. Please run the evidence search again." });
  }

  const validCandidates: StoredCandidate[] = [];
  const invalidIds: string[] = [];
  for (const id of tempIds) {
    const c = stored.candidates.get(id);
    if (c) {
      validCandidates.push(c);
    } else {
      invalidIds.push(id);
    }
  }

  if (validCandidates.length === 0) {
    return res.status(400).json({ error: "None of the provided IDs match known search candidates.", invalidIds });
  }

  const [caseRow] = await db.select().from(casesTable).where(eq(casesTable.caseId, caseId)).limit(1);
  if (!caseRow) {
    return res.status(404).json({ error: "Case not found" });
  }

  const drugName = caseRow.assetName || caseRow.primaryBrand || "Unknown";
  const created: any[] = [];

  try {
    await db.transaction(async (tx) => {
      for (const c of validCandidates) {
        const signalId = `SIG-EVID-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const pmid = c.pmid ? String(c.pmid).replace(/\D/g, "") : null;
        const precedentResult = lookupPrecedentLr(c.signalType || "Field intelligence", c.direction || "Positive");
        const lr = precedentResult.matched ? precedentResult.assignedLr : 1.0;

        // Verify PMID against PubMed registry before trusting it
        let registryMatch = false;
        let verificationStatus: "verified" | "invalid" | "unverified" = "unverified";
        if (pmid) {
          const check = await verifyPmid(pmid);
          registryMatch = check.outcome === "valid";
          verificationStatus = check.outcome === "valid" ? "verified" : check.outcome === "invalid" ? "invalid" : "unverified";
        }

        // Only count toward posterior if PMID is verified or no PMID was claimed
        const canCountTowardPosterior = verificationStatus !== "invalid";

        await tx.insert(signalsTable).values({
          id: randomUUID(),
          signalId,
          caseId,
          brand: drugName,
          signalDescription: c.finding || c.trialName || "Evidence finding",
          signalType: c.signalType || "Field intelligence",
          direction: c.direction || "Positive",
          strengthScore: Number(c.strengthScore) || 3,
          reliabilityScore: Number(c.reliabilityScore) || 3,
          likelihoodRatio: lr,
          scope: "national",
          timing: "current",
          status: "candidate",
          createdByType: "human",
          createdById: "analyst",
          sourceLabel: c.trialName || c.category || null,
          sourceUrl: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : (c.sourceUrl || null),
          evidenceSnippet: c.finding || null,
          identifierType: pmid ? "PMID" : null,
          identifierValue: pmid || null,
          verificationStatus,
          registryMatch,
          evidenceClass: "Eligible",
          countTowardPosterior: false,
          signalFamily: c.category === "Pivotal Trials" ? "pivotal-trial" : "structured-evidence",
          noveltyFlag: true,
        });

        stored.candidates.delete(c.tempId);

        created.push({
          signalId,
          trialName: c.trialName,
          category: c.category,
          finding: c.finding,
          countTowardPosterior: false,
          registryMatch,
          verificationStatus,
        });
      }
    });
  } catch (err: any) {
    console.error("Pivotal search approve error:", err);
    return res.status(500).json({ error: "Failed to save approved signals. No changes were made." });
  }

  res.json({
    approved: created.length,
    signals: created,
    ...(invalidIds.length > 0 ? { skippedIds: invalidIds } : {}),
  });
});

export default router;
