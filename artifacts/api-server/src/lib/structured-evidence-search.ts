import { openai } from "@workspace/integrations-openai-ai-server";
import { lookupPrecedentLr } from "./precedent-lookup.js";
import { randomUUID } from "crypto";

export interface EvidenceCandidate {
  tempId: string;
  category: string;
  trialName: string | null;
  pmid: string | null;
  sourceUrl: string | null;
  finding: string;
  signalType: string;
  direction: "Positive" | "Negative";
  strengthScore: number;
  reliabilityScore: number;
  likelihoodRatio: number;
  precedentMatched: boolean;
  sourceTitle: string | null;
  sourceQuote: string | null;
  sourceConfidence: "Strong" | "Moderate" | "Weak";
  unverifiedTrialName: boolean;
  knownTrialHint: string | null;
}

export interface StructuredSearchResult {
  drugName: string;
  indication: string;
  candidates: EvidenceCandidate[];
  categoriesSearched: string[];
}

const ALLOWED_SIGNAL_TYPES = new Set([
  "Phase III clinical trial",
  "FDA approval",
  "Guideline inclusion",
  "Safety / tolerability",
  "Payer / coverage",
  "Real-world evidence",
  "Prescribing information",
  "KOL endorsement",
  "Field intelligence",
  "Competitor counteraction",
  "Access / commercial",
]);

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

interface SearchCategory {
  id: string;
  label: string;
  queries: string[];
}

export function buildFullSearchQueries(drugName: string, indication: string): SearchCategory[] {
  return [
    {
      id: "clinical",
      label: "Clinical Evidence",
      queries: [
        `${drugName} phase 3 trial ${indication} results`,
        `${drugName} pivotal trial ${indication}`,
      ],
    },
    {
      id: "label_regulatory",
      label: "Label / Regulatory",
      queries: [
        `${drugName} FDA approval ${indication}`,
        `${drugName} prescribing information label`,
      ],
    },
    {
      id: "guidelines",
      label: "Guidelines",
      queries: [
        `${indication} treatment guidelines ${drugName}`,
        `${drugName} guideline recommendation`,
      ],
    },
    {
      id: "safety",
      label: "Safety",
      queries: [
        `${drugName} safety ${indication}`,
        `${drugName} FDA safety warning`,
      ],
    },
    {
      id: "payer",
      label: "Payer / Access",
      queries: [
        `${drugName} coverage ${indication}`,
        `${drugName} prior authorization formulary`,
      ],
    },
  ];
}

export function buildGapSearchQueries(drugName: string, indication: string, missingFamilies: string[]): SearchCategory[] {
  const categories: SearchCategory[] = [];

  for (const family of missingFamilies) {
    const lower = family.toLowerCase();
    if (lower.includes("guideline") || lower.includes("standard")) {
      categories.push({
        id: "guideline_gap",
        label: "Guideline / Standard-of-Care",
        queries: [
          `${indication} ${drugName} guideline recommendation`,
          `${drugName} treatment recommendation ${indication}`,
        ],
      });
    } else if (lower.includes("launch") || lower.includes("market")) {
      categories.push({
        id: "launch_gap",
        label: "Launch / Market Signals",
        queries: [
          `${drugName} launch adoption ${indication}`,
          `${drugName} KOL support ${indication}`,
        ],
      });
    } else if (lower.includes("clinical") || lower.includes("evidence")) {
      categories.push({
        id: "clinical_gap",
        label: "Clinical Evidence",
        queries: [
          `${drugName} phase 3 pivotal trial ${indication}`,
          `${drugName} clinical efficacy data ${indication}`,
        ],
      });
    } else if (lower.includes("access") || lower.includes("reimbursement") || lower.includes("payer")) {
      categories.push({
        id: "access_gap",
        label: "Access / Reimbursement",
        queries: [
          `${drugName} formulary coverage ${indication}`,
          `${drugName} prior authorization requirements`,
        ],
      });
    } else if (lower.includes("prescriber") || lower.includes("behavior")) {
      categories.push({
        id: "prescriber_gap",
        label: "Prescriber Behavior",
        queries: [
          `${drugName} physician adoption ${indication}`,
          `${drugName} prescribing patterns ${indication}`,
        ],
      });
    } else if (lower.includes("operational") || lower.includes("friction") || lower.includes("delivery")) {
      categories.push({
        id: "operational_gap",
        label: "Operational / Delivery",
        queries: [
          `${drugName} administration workflow ${indication}`,
          `${drugName} operational barriers ${indication}`,
        ],
      });
    } else if (lower.includes("competitive") || lower.includes("competitor")) {
      categories.push({
        id: "competitive_gap",
        label: "Competitive Pressure",
        queries: [
          `${drugName} competitors ${indication}`,
          `${indication} competing treatments`,
        ],
      });
    } else if (lower.includes("safety")) {
      categories.push({
        id: "safety_gap",
        label: "Safety",
        queries: [
          `${drugName} safety profile ${indication}`,
          `${drugName} adverse events post-marketing`,
        ],
      });
    }
  }

  return categories;
}

const SEARCH_TIMEOUT_MS = 8000;

interface NewsItem {
  title: string;
  description: string;
  link: string;
  pubDate: string;
}

async function searchGoogleNewsRSS(query: string): Promise<NewsItem[]> {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
    if (!resp.ok) return [];
    const xml = await resp.text();

    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    return items.slice(0, 5).map((item) => {
      const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
        item.match(/<title>(.*?)<\/title>/))?.[1] || "";
      const description = (item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) ||
        item.match(/<description>(.*?)<\/description>/))?.[1]?.replace(/<[^>]+>/g, "") || "";
      const link = item.match(/<link>(.*?)<\/link>/)?.[1] || "";
      const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || "";
      return { title, description, link, pubDate };
    }).filter((n) => n.title.length > 0);
  } catch {
    return [];
  }
}

async function runCategorySearches(categories: SearchCategory[]): Promise<{ category: string; results: NewsItem[] }[]> {
  const allPromises = categories.flatMap((cat) =>
    cat.queries.map(async (q) => {
      const results = await searchGoogleNewsRSS(q);
      return { category: cat.label, results };
    })
  );

  const settled = await Promise.allSettled(allPromises);
  const out: { category: string; results: NewsItem[] }[] = [];

  for (const result of settled) {
    if (result.status === "fulfilled" && result.value.results.length > 0) {
      out.push(result.value);
    }
  }

  return out;
}

function buildSearchContext(searchResults: { category: string; results: NewsItem[] }[]): string {
  const seenTitles = new Set<string>();
  let context = "";

  for (const group of searchResults) {
    context += `\n[${group.category}]\n`;
    for (const item of group.results) {
      const key = item.title.toLowerCase().slice(0, 60);
      if (seenTitles.has(key)) continue;
      seenTitles.add(key);
      const date = item.pubDate ? `[${item.pubDate}]` : "";
      context += `- ${date} ${item.title}`;
      if (item.description) context += ` — ${item.description.slice(0, 200)}`;
      if (item.link) context += ` (${item.link})`;
      context += "\n";
    }
  }

  if (context.length > 6000) {
    context = context.slice(0, 6000) + "\n[truncated]";
  }

  return context;
}

const EXTRACTION_PROMPT = `You are a medical evidence extractor.
You receive search result titles, descriptions, and URLs.
Your job is to extract — NOT generate — findings from the text provided.

Rules:
- Only report information that appears verbatim or near-verbatim in the source text above
- If a trial name is not mentioned in the source text, return trialName: null
- If a statistic is not in the source text, do not include it
- If you cannot find a specific finding for a field, return null — never invent
- Quote the exact phrase from the source that supports each finding in a sourceQuote field
- If no relevant finding exists in the sources, return an empty findings array
- Maximum 12 findings total, prioritizing the most impactful
- Deduplicate — do not return the same finding twice

Return JSON with this structure:
{
  "findings": [
    {
      "category": "the evidence category (e.g. Clinical Evidence, Label / Regulatory, Guidelines, Safety, Payer / Access)",
      "trialName": "string | null — only if explicitly named in source text",
      "pmid": "string (numbers only) | null",
      "sourceUrl": "string — from the search results provided",
      "sourceTitle": "string — from the search results provided",
      "finding": "ONE sentence extracted from or closely paraphrasing the source text",
      "sourceQuote": "exact phrase from the source text that supports this finding, or null if none",
      "signalType": "one of: Phase III clinical trial, FDA approval, Guideline inclusion, Safety / tolerability, Payer / coverage, Real-world evidence, Prescribing information, KOL endorsement, Field intelligence, Competitor counteraction, Access / commercial",
      "direction": "Positive or Negative",
      "strengthScore": "1-5 (1=weak, 5=strong)",
      "reliabilityScore": "1-5 (1=anecdotal, 5=verified/published)"
    }
  ]
}`;

const KNOWN_TRIALS: Record<string, string[]> = {
  "veligrotug": ["THRIVE"],
  "vrdn-001": ["THRIVE"],
  "trikafta": ["AURORA"],
  "elexacaftor": ["AURORA"],
  "arikayce": ["ENCORE", "CONVERT"],
  "amikacin liposome": ["ENCORE", "CONVERT"],
  "leqembi": ["CLARITY AD"],
  "lecanemab": ["CLARITY AD"],
  "sublocade": ["NCT02357901"],
  "buprenorphine sq": ["NCT02357901"],
  "beovu": ["HAWK", "HARRIER"],
  "brolucizumab": ["HAWK", "HARRIER"],
};

function buildSourceCorpus(searchResults: { category: string; results: NewsItem[] }[]): string {
  const parts: string[] = [];
  for (const group of searchResults) {
    for (const item of group.results) {
      if (item.title) parts.push(item.title);
      if (item.description) parts.push(item.description);
      if (item.link) parts.push(item.link);
    }
  }
  return parts.join(" ").toLowerCase();
}

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

function verifyTrialNames(findings: any[], sourceCorpus: string, drugName: string): any[] {
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
    const trialNameLower = trialNameRaw.toLowerCase();
    const trialNameClean = trialNameLower.replace(/[^a-z0-9]/g, "");

    if (COMMON_ACRONYMS.has(trialNameRaw.toUpperCase())) {
      return result;
    }

    const foundInSources = sourceCorpus.includes(trialNameLower) ||
      sourceCorpus.includes(trialNameClean) ||
      sourceCorpus.replace(/[^a-z0-9\s]/g, "").includes(trialNameClean);

    if (!foundInSources) {
      result.unverifiedTrialName = true;
      const warning = `\u26A0 TRIAL NAME UNVERIFIED: '${trialNameRaw}' was not found in search sources. Confirm before approving. `;
      result.finding = warning + (result.finding || "");
      console.log(`[EVIDENCE-SEARCH] FABRICATION BLOCKED: Trial name "${trialNameRaw}" not found in any source material.`);
    }

    if (knownTrials) {
      const matchesKnown = knownTrials.some(
        (kt) => trialNameLower === kt.toLowerCase() || trialNameLower.startsWith(kt.toLowerCase() + " ")
      );
      if (!matchesKnown) {
        result.unverifiedTrialName = true;
        const mismatchWarning = `\u26A0 KNOWN TRIAL MISMATCH: Expected [${knownTrials.join(", ")}] for ${drugName}. Got [${trialNameRaw}]. This may be a fabricated trial name. `;
        result.finding = mismatchWarning + (result.finding || "");
        result.knownTrialHint = `Known trials for this drug: [${knownTrials.join(", ")}]. '${trialNameRaw}' does not match — verify independently.`;
        console.log(`[EVIDENCE-SEARCH] TRIAL MISMATCH: "${trialNameRaw}" does not match known trials [${knownTrials.join(", ")}] for ${drugName}.`);
      }
    }

    return result;
  });
}

export async function runStructuredEvidenceSearch(
  drugName: string,
  indication: string,
  categories: SearchCategory[],
): Promise<StructuredSearchResult> {
  const searchResults = await runCategorySearches(categories);
  const searchContext = buildSearchContext(searchResults);

  if (searchContext.trim().length < 20) {
    return {
      drugName,
      indication,
      candidates: [],
      categoriesSearched: categories.map((c) => c.label),
    };
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0,
    seed: 42,
    max_completion_tokens: 4000,
    messages: [
      { role: "system", content: EXTRACTION_PROMPT },
      {
        role: "user",
        content: `Drug: ${drugName}\nIndication: ${indication}\n\nSearch results by category:\n${searchContext}\n\nExtract structured evidence findings as a JSON array.`,
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
      if (firstArrayKey) {
        findings = parsed[firstArrayKey];
      } else if (parsed.finding && typeof parsed.finding === "string") {
        findings = [parsed];
      }
    }
  } catch {
    findings = [];
  }

  console.log("[EVIDENCE-SEARCH] Raw LLM findings (pre-verification):", JSON.stringify(findings, null, 2));

  const sourceCorpus = buildSourceCorpus(searchResults);
  const verifiedFindings = verifyTrialNames(findings, sourceCorpus, drugName);

  console.log("[EVIDENCE-SEARCH] Verified findings (post-processing):", JSON.stringify(verifiedFindings, null, 2));

  const candidates: EvidenceCandidate[] = verifiedFindings.map((f: any) => {
    const signalType = ALLOWED_SIGNAL_TYPES.has(f.signalType) ? f.signalType : "Field intelligence";
    const direction = f.direction === "Negative" ? "Negative" : "Positive";
    const strength = Math.min(5, Math.max(1, Number(f.strengthScore) || 3));
    const reliability = Math.min(5, Math.max(1, Number(f.reliabilityScore) || 3));
    const precedentResult = lookupPrecedentLr(signalType, direction);
    const lr = precedentResult.matched ? precedentResult.assignedLr : 1.0;
    const pmid = f.pmid ? String(f.pmid).replace(/\D/g, "") : null;

    const sourceQuote = typeof f.sourceQuote === "string" && f.sourceQuote.trim().length > 0
      ? f.sourceQuote.slice(0, 500) : null;
    const resolvedUrl = isSafeUrl(f.sourceUrl);
    const unverified = !!f.unverifiedTrialName;
    const sourceConfidence = computeSourceConfidence(sourceQuote, resolvedUrl, unverified);

    return {
      tempId: randomUUID(),
      category: typeof f.category === "string" ? f.category.slice(0, 100) : "Unknown",
      trialName: typeof f.trialName === "string" && f.trialName.length > 0 ? f.trialName.slice(0, 200) : null,
      pmid: pmid || null,
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
      unverifiedTrialName: unverified,
      knownTrialHint: typeof f.knownTrialHint === "string" ? f.knownTrialHint : null,
    };
  });

  return {
    drugName,
    indication,
    candidates,
    categoriesSearched: categories.map((c) => c.label),
  };
}
