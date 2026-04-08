import { openai } from "@workspace/integrations-openai-ai-server";
import { randomUUID } from "crypto";
import { lookupPrecedentLr } from "./precedent-lookup.js";
import {
  classifyUrlTier,
  buildAuthoritativeQueries,
  lookupSponsor,
  lookupKnownTrials,
  type SponsorProfile,
} from "./authoritative-sources.js";
import {
  fetchDocuments,
  discoverAllSources,
  type FetchedDocument,
} from "./document-fetcher.js";
import {
  classifyDrugStage,
  buildPrioritizedFetchOrder,
  type DrugStage,
  type StageClassification,
} from "./drug-lifecycle.js";

export interface PipelineCandidate {
  tempId: string;
  category: string;
  trialName: string | null;
  pmid: string | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  finding: string;
  sourceQuote: string | null;
  sourceConfidence: "Strong" | "Moderate" | "Weak";
  signalType: string;
  direction: "Positive" | "Negative";
  strengthScore: number;
  reliabilityScore: number;
  likelihoodRatio: number;
  precedentMatched: boolean;
  unverifiedTrialName: boolean;
  knownTrialHint: string | null;
  registryVerified: boolean;
  verificationTier: 0 | 1 | "1S" | 2 | 3;
  nctNumber: string | null;
  sponsorSource: boolean;
  sponsorCompany: string | null;
}

export interface PipelineProgress {
  phase: string;
  detail: string;
  timestamp: string;
}

export interface PipelineResult {
  drugName: string;
  indication: string;
  sponsorProfile: SponsorProfile | null;
  stageClassification: StageClassification;
  sourcesFound: { url: string; category: string; query: string }[];
  documentsFetched: { url: string; title: string; textLength: number; contentType: string; error?: string }[];
  candidates: PipelineCandidate[];
  categoriesSearched: string[];
  phases: PipelineProgress[];
  totalTimeMs: number;
}

const ALLOWED_SIGNAL_TYPES = new Set([
  "Phase III clinical",
  "Regulatory / clinical",
  "Guideline inclusion",
  "Safety / tolerability",
  "Payer / coverage",
  "Real-world evidence",
  "Prescriber behavior",
  "KOL endorsement",
  "Field intelligence",
  "Competitor counteraction",
  "Access / commercial",
  "Clinical workflow",
  "Operational friction",
]);

const SIGNAL_TYPE_NORMALIZE: Record<string, string> = {
  "Phase III clinical trial": "Phase III clinical",
  "FDA approval": "Regulatory / clinical",
  "Prescribing information": "Regulatory / clinical",
};

function extractNctNumber(text: string): string | null {
  const match = text.match(/NCT\d{6,11}/i);
  return match ? match[0].toUpperCase() : null;
}

const EXTRACTION_PROMPT = `You are a medical evidence extractor.
You receive FULL DOCUMENT TEXT from authoritative sources (.gov, journals, society sites, SEC filings, company IR pages).
Your ONLY job is to extract factual findings from the text provided.

STRICT RULES:
- ONLY report information that appears in the source text provided
- Extract the EXACT QUOTE from the source text that supports each finding in sourceQuote — this must be a verbatim substring of the source document
- If a trial name is explicitly mentioned in the source text, include it. If not mentioned, return trialName: null
- If a PMID is in the text, extract it. Otherwise null
- If you cannot find a specific finding, return null — NEVER INVENT
- Null is correct. Invention is not.
- Each finding must have a sourceQuote that is a VERBATIM SUBSTRING of the source text
- Do NOT paraphrase the sourceQuote — copy it exactly from the source
- Maximum 5 findings per source document
- Deduplicate — do not return the same finding twice

Return JSON:
{
  "findings": [
    {
      "category": "Clinical Evidence | Regulatory / Label | Guidelines | Safety | Payer / Access | Competitive / Market",
      "trialName": "string | null",
      "pmid": "string | null",
      "sourceUrl": "the URL of this source document",
      "sourceTitle": "title of the source document",
      "finding": "ONE sentence summarizing the key finding",
      "sourceQuote": "EXACT verbatim quote from the source text (50-200 chars)",
      "signalType": "Phase III clinical | Regulatory / clinical | Guideline inclusion | Safety / tolerability | Payer / coverage | Real-world evidence | Competitor counteraction | Field intelligence",
      "direction": "Positive | Negative",
      "strengthScore": "1-5",
      "reliabilityScore": "1-5"
    }
  ]
}`;

export async function runEvidencePipeline(
  drugName: string,
  indication: string,
  sponsorProfile: SponsorProfile | null,
  timeFilterMonths: number = 12,
  overrideStage: DrugStage | null = null,
  question: string = "",
  trialName: string | null = null,
  trialResult: string | null = null,
): Promise<PipelineResult> {
  const startTime = Date.now();
  const phases: PipelineProgress[] = [];
  const log = (phase: string, detail: string) => {
    phases.push({ phase, detail, timestamp: new Date().toISOString() });
    console.log(`[EVIDENCE-PIPELINE] ${phase}: ${detail}`);
  };

  const stageClassification = classifyDrugStage(
    drugName, indication, question, trialName, trialResult, overrideStage,
  );
  log("PHASE 0", `Drug stage: ${stageClassification.stage} — ${stageClassification.label}`);
  log("PHASE 0", `Rationale: ${stageClassification.rationale}`);
  log("PHASE 0", `Source priority: ${stageClassification.sourcePriority.map(s => `${s.rank}. ${s.sourceType}`).join(", ")}`);

  log("PHASE 1", `Sponsor: ${sponsorProfile ? `${sponsorProfile.company} (${sponsorProfile.ticker}) — ${sponsorProfile.irUrl}` : "Not identified"}`);

  const knownTrials = lookupKnownTrials(drugName);
  if (knownTrials) {
    log("PHASE 1", `Known trials: ${knownTrials.join(", ")}`);
  }

  log("PHASE 2", "Starting source discovery via PubMed, ClinicalTrials.gov, FDA APIs...");

  const authCategories = buildAuthoritativeQueries(drugName, indication, sponsorProfile, timeFilterMonths);

  const discovered = await discoverAllSources(drugName, indication, knownTrials || undefined);

  const sourcesFound: { url: string; category: string; query: string }[] = [];
  const seenUrls = new Set<string>();

  const addSource = (url: string, category: string, query: string) => {
    const cleanUrl = url.split("?")[0];
    if (!seenUrls.has(cleanUrl)) {
      seenUrls.add(cleanUrl);
      sourcesFound.push({ url, category, query });
    }
  };

  for (const s of discovered.pubmed) addSource(s.url, s.category, `PubMed: ${s.title.slice(0, 80)}`);
  for (const s of discovered.clinicalTrials) addSource(s.url, s.category, `ClinicalTrials.gov: ${s.title.slice(0, 80)}`);
  for (const s of discovered.fda) addSource(s.url, s.category, `FDA: ${s.title.slice(0, 80)}`);

  if (sponsorProfile?.irUrl) {
    const irHost = sponsorProfile.irUrl.replace(/^https?:\/\//, "");
    if (irHost && !irHost.includes("localhost") && !irHost.startsWith("127.") && !irHost.startsWith("10.") && !irHost.startsWith("192.168.")) {
      addSource(`https://${irHost}`, "Sponsor IR", `Sponsor: ${sponsorProfile.company}`);
    }
  }

  if (sponsorProfile?.ticker && stageClassification.sourcePriority.some(s => s.sourceType === "sec_8k")) {
    addSource(
      `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(drugName)}%22&forms=8-K&dateRange=custom&startdt=${new Date(Date.now() - timeFilterMonths * 30 * 86400000).toISOString().slice(0, 10)}&enddt=${new Date().toISOString().slice(0, 10)}`,
      "SEC 8-K",
      `SEC EDGAR: ${sponsorProfile.company} 8-K filings for ${drugName}`,
    );
  }

  log("PHASE 2", `Found ${sourcesFound.length} unique source URLs across ${new Set(sourcesFound.map(s => s.category)).size} categories`);

  const prioritized = buildPrioritizedFetchOrder(sourcesFound, stageClassification.stage);
  log("PHASE 2", `Reordered by ${stageClassification.stage} priority: ${prioritized.slice(0, 5).map(s => `[${s.priorityRank}] ${s.category}`).join(", ")}...`);

  const maxDocs = 12;
  const urlsToFetch = prioritized.slice(0, maxDocs).map((s) => s.url);

  log("PHASE 3", `Fetching full text from ${urlsToFetch.length} documents...`);

  const fetchedDocs = await fetchDocuments(urlsToFetch, 2);

  const successfulDocs = fetchedDocs.filter((d) => d.text.length > 100);
  const failedDocs = fetchedDocs.filter((d) => d.text.length <= 100);

  log("PHASE 3", `Fetched ${successfulDocs.length} documents successfully, ${failedDocs.length} failed or empty`);

  const documentsFetched = fetchedDocs.map((d) => ({
    url: d.url,
    title: d.title,
    textLength: d.text.length,
    contentType: d.contentType,
    error: d.error,
  }));

  log("PHASE 4", `Extracting signals from ${successfulDocs.length} documents...`);

  const allCandidates: PipelineCandidate[] = [];

  const extractionBatches: { docs: FetchedDocument[]; batchIndex: number }[] = [];
  const batchSize = 3;
  for (let i = 0; i < successfulDocs.length; i += batchSize) {
    extractionBatches.push({
      docs: successfulDocs.slice(i, i + batchSize),
      batchIndex: Math.floor(i / batchSize),
    });
  }

  const knownTrialsContext = knownTrials
    ? `\nKNOWN PIVOTAL TRIALS for ${drugName}: ${knownTrials.join(", ")}. Include a finding for each trial if the source text mentions it.`
    : "";

  for (const batch of extractionBatches) {
    const docTexts = batch.docs.map((doc, idx) => {
      const sourceCategory = sourcesFound.find((s) => s.url === doc.url)?.category || "Unknown";
      return `--- SOURCE ${idx + 1} ---
URL: ${doc.url}
Title: ${doc.title}
Category: ${sourceCategory}
Content (${doc.text.length} chars):
${doc.text.slice(0, 5000)}
--- END SOURCE ${idx + 1} ---`;
    }).join("\n\n");

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        temperature: 0,
        seed: 42,
        max_completion_tokens: 4000,
        messages: [
          { role: "system", content: EXTRACTION_PROMPT },
          {
            role: "user",
            content: `Drug: ${drugName}\nIndication: ${indication}${knownTrialsContext}\n\n${docTexts}\n\nExtract all evidence findings from these source documents. Each finding MUST include a verbatim sourceQuote from the document text.`,
          },
        ],
        response_format: { type: "json_object" },
      });

      const raw = response.choices[0]?.message?.content ?? "{}";
      let findings: any[] = [];

      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          findings = parsed;
        } else if (typeof parsed === "object" && parsed !== null) {
          const firstArrayKey = Object.keys(parsed).find((k) => Array.isArray(parsed[k]));
          if (firstArrayKey) findings = parsed[firstArrayKey];
        }
      } catch {
        findings = [];
      }

      for (const f of findings) {
        const normalizedType = SIGNAL_TYPE_NORMALIZE[f.signalType] || f.signalType;
        const signalType = ALLOWED_SIGNAL_TYPES.has(normalizedType) ? normalizedType : "Field intelligence";
        const direction = f.direction === "Negative" ? "Negative" : "Positive";
        const strength = Math.min(5, Math.max(1, Number(f.strengthScore) || 3));
        const reliability = Math.min(5, Math.max(1, Number(f.reliabilityScore) || 3));
        const precedentResult = lookupPrecedentLr(signalType, direction);
        const lr = precedentResult.matched ? precedentResult.assignedLr : 1.0;
        const sourceUrl = typeof f.sourceUrl === "string" ? f.sourceUrl : null;
        const sourceQuote = typeof f.sourceQuote === "string" && f.sourceQuote.trim().length > 5 ? f.sourceQuote.slice(0, 500) : null;

        const urlTier = classifyUrlTier(sourceUrl, sponsorProfile);

        const nctNumber = extractNctNumber(
          `${f.finding || ""} ${sourceUrl || ""} ${f.trialName || ""}`
        );

        let verificationTier: 0 | 1 | "1S" | 2 | 3;
        let registryVerified = false;
        let sponsorSource = false;
        let unverifiedTrialName = false;

        if (urlTier === 0) {
          verificationTier = 0;
          registryVerified = true;
        } else if (urlTier === "1S") {
          verificationTier = "1S";
          sponsorSource = true;
        } else if (sourceQuote && sourceQuote.length > 10) {
          verificationTier = 2;
        } else {
          verificationTier = 3;
          unverifiedTrialName = true;
        }

        if (knownTrials && f.trialName) {
          const matchesKnown = knownTrials.some(
            (kt) => f.trialName.toLowerCase().includes(kt.toLowerCase())
          );
          if (matchesKnown && verificationTier !== 0) {
            verificationTier = 1;
            unverifiedTrialName = false;
          }
        }

        let sourceConfidence: "Strong" | "Moderate" | "Weak" = "Weak";
        if (registryVerified || verificationTier === 0) sourceConfidence = "Strong";
        else if (sourceQuote && sourceQuote.length > 20) sourceConfidence = "Moderate";
        else if (verificationTier === "1S") sourceConfidence = "Moderate";

        allCandidates.push({
          tempId: randomUUID(),
          category: typeof f.category === "string" ? f.category.slice(0, 100) : "Unknown",
          trialName: typeof f.trialName === "string" && f.trialName.length > 0 ? f.trialName.slice(0, 200) : null,
          pmid: f.pmid ? String(f.pmid).replace(/\D/g, "") || null : null,
          sourceUrl,
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
          unverifiedTrialName,
          knownTrialHint: knownTrials ? `Known trials: ${knownTrials.join(", ")}` : null,
          registryVerified,
          verificationTier,
          nctNumber,
          sponsorSource,
          sponsorCompany: sponsorSource ? (sponsorProfile?.company || null) : null,
        });
      }
    } catch (err) {
      log("PHASE 4", `Extraction batch ${batch.batchIndex} failed: ${err}`);
    }
  }

  const seenFindings = new Set<string>();
  const deduped = allCandidates.filter((c) => {
    const key = `${c.finding.slice(0, 80).toLowerCase()}|${c.sourceUrl || ""}`;
    if (seenFindings.has(key)) return false;
    seenFindings.add(key);
    return true;
  });

  const tierOrder = (t: 0 | 1 | "1S" | 2 | 3): number =>
    t === 0 ? 0 : t === 1 ? 1 : t === "1S" ? 1.5 : t === 2 ? 2 : 3;
  deduped.sort((a, b) => tierOrder(a.verificationTier) - tierOrder(b.verificationTier));

  const totalTimeMs = Date.now() - startTime;

  log("PHASE 5", `Pipeline complete. ${deduped.length} candidates from ${successfulDocs.length} documents in ${(totalTimeMs / 1000).toFixed(1)}s`);

  return {
    drugName,
    indication,
    sponsorProfile,
    stageClassification,
    sourcesFound,
    documentsFetched,
    candidates: deduped,
    categoriesSearched: authCategories.map((c) => c.label),
    phases,
    totalTimeMs,
  };
}
