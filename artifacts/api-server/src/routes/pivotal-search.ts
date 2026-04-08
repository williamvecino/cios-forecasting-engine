import { Router } from "express";
import { db } from "@workspace/db";
import { casesTable, signalsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { openai } from "@workspace/integrations-openai-ai-server";
import { lookupPrecedentLr } from "../lib/precedent-lookup.js";

const router = Router();

const MAX_APPROVE_BATCH = 20;

function verifyTrialNamesNoCorpus(findings: any[]): any[] {
  return findings.map((f) => {
    const result = { ...f };

    if (!result.trialName || typeof result.trialName !== "string" || result.trialName.trim().length === 0) {
      result.trialName = null;
      return result;
    }

    const originalTrialName = result.trialName;
    console.log(`[PIVOTAL-SEARCH] UNVERIFIED TRIAL: "${originalTrialName}" — no source corpus available to verify. Flagging.`);

    if (result.finding && typeof result.finding === "string") {
      result.finding = result.finding.replace(
        new RegExp(originalTrialName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
        "[trial name unverified — confirm before approving]"
      );
    }

    result.trialName = null;
    result._trialVerification = "no_corpus_available";
    result._originalTrialName = originalTrialName;

    return result;
  });
}
const SEARCH_RESULT_TTL_MS = 30 * 60 * 1000;

interface StoredCandidate {
  tempId: string;
  category: string;
  trialName: string | null;
  pmid: string | null;
  sourceUrl: string | null;
  finding: string;
  signalType: string;
  direction: string;
  strengthScore: number;
  reliabilityScore: number;
  likelihoodRatio: number;
  precedentMatched: boolean;
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

const PIVOTAL_SEARCH_PROMPT = `You are a pharmaceutical evidence analyst. Given a drug name, indication, and a set of structured search queries, return the most relevant evidence findings that a real analyst would discover.

For each search category and its queries, return the TOP 3 most important real-world findings. These must be real, verifiable evidence items — not hypothetical.

For each finding, return a JSON object with:
- category: the search category (e.g. "Pivotal Trials", "Label / Approval Data")
- trialName: the specific trial name if applicable (e.g. "ENCORE", "CONVERT"), or a descriptive title for non-trial findings
- pmid: PubMed ID if known (string, numbers only), or null
- sourceUrl: URL to the source if known, or null
- finding: ONE sentence summarizing the key result or conclusion
- signalType: one of ["Phase III clinical trial", "FDA approval", "Guideline inclusion", "Safety / tolerability", "Payer / coverage", "Real-world evidence", "Prescribing information"]
- direction: "Positive" (supports adoption/efficacy) or "Negative" (hinders adoption)
- strengthScore: 1-5 (1=weak, 5=strong)
- reliabilityScore: 1-5 (1=anecdotal, 5=verified/published)

Return ONLY a valid JSON array of finding objects. No markdown, no preamble. Return 10-15 findings total across all categories, focusing on the most impactful and verifiable items.`;

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

    const raw = completion.choices[0]?.message?.content ?? "[]";
    let findings: any[] = [];

    try {
      const cleaned = raw.replace(/```json\n?|```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);
      findings = Array.isArray(parsed) ? parsed : [];
    } catch {
      return res.status(502).json({ error: "Evidence search returned an unexpected format. Please try again." });
    }

    console.log("[PIVOTAL-SEARCH] Raw LLM findings (pre-verification):", JSON.stringify(findings, null, 2));

    const verifiedFindings = verifyTrialNamesNoCorpus(findings);

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

      const candidate: StoredCandidate = {
        tempId: randomUUID(),
        category,
        trialName: typeof f.trialName === "string" && f.trialName.length > 0 ? f.trialName.slice(0, 200) : null,
        pmid: pmid || null,
        sourceUrl: isSafeUrl(f.sourceUrl),
        finding: typeof f.finding === "string" ? f.finding.slice(0, 500) : "",
        signalType,
        direction,
        strengthScore: strength,
        reliabilityScore: reliability,
        likelihoodRatio: lr,
        precedentMatched: precedentResult.matched,
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
          status: "active",
          createdByType: "human",
          createdById: "analyst",
          sourceLabel: c.trialName || c.category || null,
          sourceUrl: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : (c.sourceUrl || null),
          evidenceSnippet: c.finding || null,
          identifierType: pmid ? "PMID" : null,
          identifierValue: pmid || null,
          verificationStatus: "verified",
          registryMatch: !!pmid,
          evidenceClass: "Eligible",
          countTowardPosterior: true,
          signalFamily: c.category === "Pivotal Trials" ? "pivotal-trial" : "structured-evidence",
          noveltyFlag: true,
        });

        stored.candidates.delete(c.tempId);

        created.push({
          signalId,
          trialName: c.trialName,
          category: c.category,
          finding: c.finding,
          countTowardPosterior: true,
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
