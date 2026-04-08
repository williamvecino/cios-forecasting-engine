import { Router } from "express";
import { db } from "@workspace/db";
import { casesTable, signalsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { openai } from "@workspace/integrations-openai-ai-server";
import { lookupPrecedentLr } from "../lib/precedent-lookup.js";
import { verifyPmid, verifyDoi, verifyNct, detectRedFlags } from "../lib/evidence-verification.js";
import { classifyUrlTier, buildAuthoritativeQueries, lookupSponsor, lookupKnownTrials as lookupKnownTrialsShared, type SponsorProfile } from "../lib/authoritative-sources.js";

const router = Router();

const MAX_APPROVE_BATCH = 20;

function lookupKnownTrials(drugName: string): string[] | null {
  return lookupKnownTrialsShared(drugName);
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

function extractNctNumber(text: string): string | null {
  const match = text.match(/NCT\d{6,11}/i);
  return match ? match[0].toUpperCase() : null;
}

function verifyTrialNamesNoCorpus(findings: any[], drugName: string, sponsorProfile?: SponsorProfile | null): any[] {
  const knownTrials = lookupKnownTrials(drugName);

  return findings.map((f) => {
    const result = {
      ...f,
      unverifiedTrialName: false,
      knownTrialHint: null as string | null,
      registryVerified: false,
      verificationTier: 3 as 0 | 1 | "1S" | 2 | 3,
      nctNumber: null as string | null,
      sponsorSource: false,
      sponsorCompany: null as string | null,
    };

    const nctFromFinding = extractNctNumber(
      `${result.finding || ""} ${result.sourceUrl || ""} ${result.sourceTitle || ""} ${result.trialName || ""}`
    );
    if (nctFromFinding) {
      result.nctNumber = nctFromFinding;
    }

    const urlTier = classifyUrlTier(result.sourceUrl, sponsorProfile);

    if (urlTier === 0) {
      result.registryVerified = true;
      result.verificationTier = 0;
      result.unverifiedTrialName = false;
      console.log(`[PIVOTAL-SEARCH] TIER 0 REGISTRY VERIFIED: "${result.trialName || "unnamed"}" from ${result.sourceUrl}`);
      return result;
    }

    if (urlTier === "1S") {
      result.verificationTier = "1S";
      result.sponsorSource = true;
      result.sponsorCompany = sponsorProfile?.company || null;
      result.unverifiedTrialName = false;
      console.log(`[PIVOTAL-SEARCH] TIER 1S SPONSOR VERIFIED: "${result.trialName || "unnamed"}" from ${result.sourceUrl} (${sponsorProfile?.company})`);
      return result;
    }

    if (!result.trialName || typeof result.trialName !== "string" || result.trialName.trim().length === 0) {
      result.trialName = null;
      result.verificationTier = 2;
      if (knownTrials) {
        result.knownTrialHint = `Known trials for this drug: [${knownTrials.join(", ")}]. Consider searching for these specifically.`;
      }
      return result;
    }

    const trialNameRaw = result.trialName.trim();

    if (COMMON_ACRONYMS.has(trialNameRaw.toUpperCase())) {
      result.verificationTier = 2;
      return result;
    }

    if (knownTrials) {
      if (matchesKnownTrial(trialNameRaw, knownTrials)) {
        result.verificationTier = 1;
        result.unverifiedTrialName = false;
        result.knownTrialHint = `'${trialNameRaw}' matches a known trial for this drug.`;
        console.log(`[PIVOTAL-SEARCH] TIER 1 KNOWN TRIAL: "${trialNameRaw}" matches known trials for ${drugName}.`);
        return result;
      }
    }

    result.verificationTier = 3;
    result.unverifiedTrialName = true;
    const warning = `\u26A0 TRIAL NAME UNVERIFIED: '${trialNameRaw}' was not found in search sources or registries. Confirm before approving. `;
    result.finding = warning + (result.finding || "");
    if (knownTrials) {
      result.knownTrialHint = `Known trials: [${knownTrials.join(", ")}]. '${trialNameRaw}' does not match — verify independently.`;
    }
    console.log(`[PIVOTAL-SEARCH] TIER 3 BLOCKED: Trial name "${trialNameRaw}" not found in any source or registry.`);
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
  registryVerified?: boolean,
): "Strong" | "Moderate" | "Weak" {
  if (registryVerified) return "Strong";
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
  registryVerified?: boolean;
  verificationTier?: 0 | 1 | "1S" | 2 | 3;
  nctNumber?: string | null;
  sponsorSource?: boolean;
  sponsorCompany?: string | null;
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
  "Clinical Evidence",
  "Regulatory / Label",
  "Guidelines",
  "Safety",
  "Payer / Access",
  "Competitive / Market",
  "ClinicalTrials.gov Registry",
  "Pivotal Trials",
  "Label / Approval Data",
]);

function buildSearchQueries(drugName: string, indication: string, _year: string, sponsor?: SponsorProfile | null) {
  const authCategories = buildAuthoritativeQueries(drugName, indication, sponsor);
  return authCategories.map((ac) => ({
    category: ac.label,
    queries: [...ac.authoritativeQueries, ...(ac.sponsorQueries || []), ...ac.generalQueries],
  }));
}

const PIVOTAL_SEARCH_PROMPT = `You are a medical evidence extractor.
You receive a drug name, indication, and structured search query categories.
Your ONLY job is to extract findings that a real analyst would discover from these queries. You do NOT generate, infer, or complete missing information.

STRICT RULES:
- Only report information that is real, published, and verifiable
- If a trial name is not a real, published trial for this drug, return trialName: null
- If a statistic cannot be verified, do not include it
- If you cannot find a specific finding for a field, return null — NEVER invent
- Quote the exact phrase or key data point supporting each finding in sourceQuote
- If no relevant finding exists for a category, skip it — do NOT fill gaps with your knowledge
- Null is correct. Invention is not.
- Return 10-15 findings total across all categories
- Prioritize findings from authoritative sources: .gov, journals, professional society sites
- For sourceUrl, use only real, verifiable URLs — never fabricate

Return ONLY a valid JSON object (no markdown, no preamble) with this structure:
{
  "findings": [
    {
      "category": "the search category (e.g. Clinical Evidence, Regulatory / Label, Guidelines, Safety, Payer / Access, Competitive / Market)",
      "trialName": "string | null — only if a real, named trial",
      "pmid": "string (numbers only) | null",
      "sourceUrl": "string | null — must be a real URL, never invented",
      "sourceTitle": "string | null",
      "finding": "ONE sentence summarizing the key result or conclusion",
      "sourceQuote": "exact phrase or data point supporting this finding, or null",
      "signalType": "one of: Phase III clinical trial, FDA approval, Guideline inclusion, Safety / tolerability, Payer / coverage, Real-world evidence, Prescribing information, Competitor counteraction",
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

  const sponsorProfile = lookupSponsor(drugName) || (caseRow.sponsorCompany ? {
    company: caseRow.sponsorCompany,
    irUrl: caseRow.sponsorIRUrl || "",
    ticker: caseRow.sponsorTicker || "",
  } : null);

  const year = new Date().getFullYear().toString();
  const searchCategories = buildSearchQueries(drugName, indication, year, sponsorProfile);

  const queryListing = searchCategories
    .map((cat) => `## ${cat.category}\n${cat.queries.map((q) => `- "${q}"`).join("\n")}`)
    .join("\n\n");

  const knownTrialsList = lookupKnownTrials(drugName);
  const knownTrialsContext = knownTrialsList
    ? `\n\nKNOWN PIVOTAL TRIALS for ${drugName}: ${knownTrialsList.join(", ")}. You MUST include a finding for EACH of these trials if you have real, verifiable data about them. Each trial should have its own separate finding entry with the trial name in the trialName field.`
    : "";

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
          content: `Drug: ${drugName}\nIndication: ${indication}${knownTrialsContext}\n\nSearch queries by category:\n\n${queryListing}\n\nReturn a JSON array of the top findings across all categories.`,
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

    const verifiedFindings = verifyTrialNamesNoCorpus(findings, drugName, sponsorProfile);

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

      const pmidUnverified = pmid ? !pmidVerified : false;
      const regVerified = !!f.registryVerified;
      const sourceConfidence = computeSourceConfidence(sourceQuote, resolvedUrl, unverified || pmidUnverified, regVerified);

      const candidate: StoredCandidate = {
        tempId: randomUUID(),
        category,
        trialName: typeof f.trialName === "string" && f.trialName.length > 0 ? f.trialName.slice(0, 200) : null,
        pmid: pmidVerified ? pmid : null,
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
        registryVerified: regVerified,
        verificationTier: (f.verificationTier === "1S" ? "1S" : typeof f.verificationTier === "number" ? f.verificationTier : 3) as 0 | 1 | "1S" | 2 | 3,
        nctNumber: typeof f.nctNumber === "string" ? f.nctNumber : null,
        sponsorSource: !!f.sponsorSource,
        sponsorCompany: typeof f.sponsorCompany === "string" ? f.sponsorCompany : null,
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

    const tierOrder = (t: 0 | 1 | "1S" | 2 | 3 | undefined): number =>
      t === 0 ? 0 : t === 1 ? 1 : t === "1S" ? 1.5 : t === 2 ? 2 : 3;
    const sortedCandidates = Array.from(candidateMap.values())
      .sort((a, b) => tierOrder(a.verificationTier) - tierOrder(b.verificationTier));

    res.json({
      caseId,
      drugName,
      indication,
      sponsorProfile: sponsorProfile ? { company: sponsorProfile.company, irUrl: sponsorProfile.irUrl, ticker: sponsorProfile.ticker } : null,
      searchCategories: searchCategories.map((c) => c.category),
      candidates: sortedCandidates,
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

router.get("/cases/:caseId/drug-stage", async (req, res) => {
  const { caseId } = req.params;
  const [caseRow] = await db.select().from(casesTable).where(eq(casesTable.caseId, caseId)).limit(1);
  if (!caseRow) return res.status(404).json({ error: "Case not found" });

  const { classifyDrugStage } = await import("../lib/drug-lifecycle.js");
  const drugName = caseRow.assetName || caseRow.primaryBrand || "";
  const indication = caseRow.diseaseState || caseRow.therapeuticArea || "";

  const existingStage = (caseRow as any).drugStage;
  const classification = classifyDrugStage(
    drugName,
    indication,
    caseRow.strategicQuestion || "",
    caseRow.primaryTrialName || null,
    caseRow.primaryTrialResult || null,
    existingStage || null,
  );

  return res.json({
    caseId,
    drugName,
    ...classification,
  });
});

router.post("/cases/:caseId/drug-stage", async (req, res) => {
  const { caseId } = req.params;
  const { stage } = req.body as { stage?: string };

  const validStages = ["INVESTIGATIONAL", "RECENTLY_APPROVED", "ESTABLISHED", "MATURE"];
  if (!stage || !validStages.includes(stage)) {
    return res.status(400).json({ error: `Invalid stage. Must be one of: ${validStages.join(", ")}` });
  }

  const [caseRow] = await db.select().from(casesTable).where(eq(casesTable.caseId, caseId)).limit(1);
  if (!caseRow) return res.status(404).json({ error: "Case not found" });

  const { classifyDrugStage } = await import("../lib/drug-lifecycle.js");
  const drugName = caseRow.assetName || caseRow.primaryBrand || "";
  const indication = caseRow.diseaseState || caseRow.therapeuticArea || "";

  const classification = classifyDrugStage(drugName, indication, "", null, null, stage as any);

  await db.update(casesTable).set({
    drugStage: stage,
    drugStageRationale: "Manually set by analyst.",
  }).where(eq(casesTable.caseId, caseId));

  return res.json({
    caseId,
    drugName,
    ...classification,
    message: `Stage set to ${stage}.`,
  });
});

router.post("/test-fetch", async (req, res) => {
  const { fetchDocument } = await import("../lib/document-fetcher.js");
  const { url } = req.body as { url: string };
  if (!url) return res.status(400).json({ error: "Missing url" });
  try {
    const doc = await fetchDocument(url);
    return res.json({
      url: doc.url,
      title: doc.title,
      contentType: doc.contentType,
      textLength: doc.text.length,
      byteLength: doc.byteLength,
      first300: doc.text.slice(0, 300),
      error: doc.error,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

router.get("/extraction-service/status", async (_req, res) => {
  const { getExternalServiceUrl } = await import("../lib/document-fetcher.js");
  const serviceUrl = getExternalServiceUrl();

  if (!serviceUrl) {
    return res.json({
      configured: false,
      url: null,
      status: "not_configured",
    });
  }

  try {
    const healthUrl = `${serviceUrl.replace(/\/$/, "")}/health`;
    const resp = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
    if (resp.ok) {
      const data = await resp.json() as any;
      return res.json({
        configured: true,
        url: serviceUrl,
        status: "connected",
        service: data.service || "unknown",
      });
    }
    return res.json({ configured: true, url: serviceUrl, status: "unreachable" });
  } catch {
    return res.json({ configured: true, url: serviceUrl, status: "unreachable" });
  }
});

router.post("/extraction-service/configure", async (req, res) => {
  const { url } = req.body as { url?: string };
  const { isExternalServiceUrlSafe } = await import("../lib/document-fetcher.js");

  if (!url || !url.trim()) {
    delete process.env.CIOS_EXTRACTION_SERVICE_URL;
    return res.json({ configured: false, url: null, message: "Extraction service URL cleared." });
  }

  const cleaned = url.trim().replace(/\/$/, "");
  if (!cleaned.startsWith("http://") && !cleaned.startsWith("https://")) {
    return res.status(400).json({ error: "URL must start with http:// or https://" });
  }

  if (!isExternalServiceUrlSafe(cleaned)) {
    return res.status(400).json({
      error: "URL not allowed. Only localtunnel (.loca.lt), ngrok, Cloudflare Tunnel, and Google Colab URLs are permitted.",
    });
  }

  process.env.CIOS_EXTRACTION_SERVICE_URL = cleaned;

  try {
    const healthResp = await fetch(`${cleaned}/health`, { signal: AbortSignal.timeout(5000) });
    if (healthResp.ok) {
      return res.json({
        configured: true,
        url: cleaned,
        status: "connected",
        message: "Extraction service connected successfully.",
      });
    }
    return res.json({
      configured: true,
      url: cleaned,
      status: "unreachable",
      message: "URL saved but service is not responding. Check that the Colab notebook is running.",
    });
  } catch {
    return res.json({
      configured: true,
      url: cleaned,
      status: "unreachable",
      message: "URL saved but service is not responding. Start the Colab notebook and try again.",
    });
  }
});

router.post("/cases/:caseId/evidence-pipeline", async (req, res) => {
  const { caseId } = req.params;
  const { timeFilterMonths, overrideStage } = req.body as { timeFilterMonths?: number; overrideStage?: string };

  const [caseRow] = await db.select().from(casesTable).where(eq(casesTable.caseId, caseId)).limit(1);
  if (!caseRow) {
    return res.status(404).json({ error: "Case not found" });
  }

  const drugName = caseRow.assetName || caseRow.primaryBrand || "";
  const indication = caseRow.diseaseState || caseRow.therapeuticArea || "";

  if (!drugName.trim()) {
    return res.status(400).json({ error: "Case has no drug name. Cannot run evidence pipeline." });
  }

  const { lookupSponsor: ls } = await import("../lib/authoritative-sources.js");
  const sponsorProfile = ls(drugName) || (caseRow.sponsorCompany ? {
    company: caseRow.sponsorCompany,
    irUrl: caseRow.sponsorIRUrl || "",
    ticker: caseRow.sponsorTicker || "",
  } : null);

  const validStages = ["INVESTIGATIONAL", "RECENTLY_APPROVED", "ESTABLISHED", "MATURE"];
  const stageOverride = overrideStage && validStages.includes(overrideStage) ? overrideStage as any : (caseRow as any).drugStage || null;

  try {
    const { runEvidencePipeline } = await import("../lib/evidence-pipeline.js");
    const result = await runEvidencePipeline(
      drugName,
      indication,
      sponsorProfile,
      timeFilterMonths || 12,
      stageOverride,
      caseRow.strategicQuestion || "",
      caseRow.primaryTrialName || null,
      caseRow.primaryTrialResult || null,
    );

    if (result.stageClassification) {
      await db.update(casesTable).set({
        drugStage: result.stageClassification.stage,
        drugStageRationale: result.stageClassification.rationale,
      }).where(eq(casesTable.caseId, caseId));
    }

    pruneExpiredResults();
    const candidateMap = new Map<string, any>();
    for (const c of result.candidates) {
      candidateMap.set(c.tempId, c);
    }
    searchResultStore.set(caseId, {
      candidates: candidateMap,
      createdAt: Date.now(),
    });

    res.json(result);
  } catch (err: any) {
    console.error("Evidence pipeline error:", err);
    res.status(500).json({ error: "Evidence pipeline failed. Please try again." });
  }
});

export default router;
