import * as cheerio from "cheerio";

const FETCH_TIMEOUT_MS = 12000;
const MAX_TEXT_LENGTH = 15000;
const EXTERNAL_SERVICE_TIMEOUT_MS = 30000;

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const BLOCKED_HOSTS = new Set([
  "localhost", "127.0.0.1", "0.0.0.0", "::1",
  "metadata.google.internal", "169.254.169.254",
]);

const ALLOWED_EXTRACTION_HOST_PATTERNS = [
  /\.ngrok-free\.app$/,
  /\.ngrok\.io$/,
  /\.trycloudflare\.com$/,
  /\.loca\.lt$/,
];

export function isExternalServiceUrlSafe(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    if (BLOCKED_HOSTS.has(parsed.hostname)) return false;
    if (parsed.hostname.endsWith(".local") || parsed.hostname.endsWith(".internal")) return false;
    if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(parsed.hostname)) return false;
    if (parsed.hostname.startsWith("169.254.")) return false;
    if (ALLOWED_EXTRACTION_HOST_PATTERNS.some(p => p.test(parsed.hostname))) return true;
    if (parsed.hostname.includes("colab") || parsed.hostname.includes("google")) return true;
    return false;
  } catch {
    return false;
  }
}

export function getExternalServiceUrl(): string | null {
  const url = process.env.CIOS_EXTRACTION_SERVICE_URL || null;
  if (url && !isExternalServiceUrlSafe(url)) {
    console.log(`[DOC-FETCH] External service URL blocked by safety check: ${url}`);
    return null;
  }
  return url;
}

async function fetchViaExternalService(url: string): Promise<FetchedDocument | null> {
  const serviceUrl = getExternalServiceUrl();
  if (!serviceUrl) return null;

  try {
    const endpoint = `${serviceUrl.replace(/\/$/, "")}/extract`;
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(EXTERNAL_SERVICE_TIMEOUT_MS),
    });

    if (!resp.ok) return null;
    const data = await resp.json() as any;

    if (data.status === "error" || !data.text || data.text.length < 50) return null;

    return {
      url: data.url || url,
      text: data.text.slice(0, MAX_TEXT_LENGTH * 3),
      title: data.title || "",
      contentType: `${data.type || "unknown"} (external service)`,
      byteLength: data.length || data.text.length,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    console.log(`[DOC-FETCH] External service failed for ${url}: ${err?.message}`);
    return null;
  }
}

async function fetchPubMedViaExternalService(pmid: string): Promise<{ text: string; title: string } | null> {
  const serviceUrl = getExternalServiceUrl();
  if (!serviceUrl) return null;

  try {
    const endpoint = `${serviceUrl.replace(/\/$/, "")}/pubmed`;
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pmid }),
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) return null;
    const data = await resp.json() as any;

    if (data.status === "error" || !data.text || data.text.length < 50) return null;

    return {
      text: data.text,
      title: data.title || `PMID ${pmid}`,
    };
  } catch {
    return null;
  }
}

export interface FetchedDocument {
  url: string;
  text: string;
  title: string;
  contentType: string;
  byteLength: number;
  fetchedAt: string;
  error?: string;
}

function cleanText(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT_LENGTH);
}

function extractTextFromHtml(html: string): { text: string; title: string } {
  const $ = cheerio.load(html);

  $("script, style, nav, header, footer, iframe, noscript, svg, form, .cookie-banner, .nav, .footer, .sidebar, .advertisement, .ad, #cookie-consent").remove();

  const title = $("title").first().text().trim() ||
    $('meta[property="og:title"]').attr("content") ||
    $("h1").first().text().trim() ||
    "";

  const articleEl = $("article, [role='main'], .content, .article-body, #content, main, .main-content").first();
  let text: string;
  if (articleEl.length > 0) {
    text = articleEl.text();
  } else {
    text = $("body").text();
  }

  return { text: cleanText(text), title: title.slice(0, 300) };
}

async function fetchPdfText(buffer: ArrayBuffer): Promise<string> {
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const buf = Buffer.from(buffer);
    const result = await pdfParse(buf);
    return cleanText(result.text || "");
  } catch (err) {
    console.log("[DOC-FETCH] PDF parse failed:", err);
    return "";
  }
}

function extractRedirectUrl(html: string): string | null {
  const metaRefresh = html.match(/<meta[^>]*http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"'\s>]+)/i);
  if (metaRefresh) return metaRefresh[1];

  const jsRedirect = html.match(/window\.location\s*=\s*["']([^"']+)["']/);
  if (jsRedirect) return jsRedirect[1];

  const jsHref = html.match(/location\.href\s*=\s*["']([^"']+)["']/);
  if (jsHref) return jsHref[1];

  const dataUrl = html.match(/data-url=["']([^"']+)["']/);
  if (dataUrl) return dataUrl[1];

  const anchorUrl = html.match(/<a[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>/i);
  if (anchorUrl && !anchorUrl[1].includes("google.com")) return anchorUrl[1];

  return null;
}

async function resolveGoogleNewsUrl(url: string): Promise<string> {
  if (!url.includes("news.google.com")) return url;

  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
    });

    const finalUrl = resp.url;
    if (finalUrl && !finalUrl.includes("news.google.com")) {
      return finalUrl;
    }

    const html = await resp.text();
    const redirect = extractRedirectUrl(html);
    if (redirect && redirect.startsWith("http")) return redirect;

    return url;
  } catch {
    return url;
  }
}

async function fetchPubMedAbstract(pmid: string): Promise<{ text: string; title: string } | null> {
  try {
    const efetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&rettype=abstract&retmode=text`;
    const resp = await fetch(efetchUrl, {
      signal: AbortSignal.timeout(12000),
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/plain",
      },
    });
    if (!resp.ok) {
      console.log(`[DOC-FETCH] PubMed efetch HTTP ${resp.status} for PMID ${pmid}`);
      return null;
    }
    const text = await resp.text();
    console.log(`[DOC-FETCH] PubMed efetch returned ${text.length} chars for PMID ${pmid}`);
    if (text.length < 50) return null;

    const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${pmid}&retmode=json`;
    const summResp = await fetch(summaryUrl, { signal: AbortSignal.timeout(8000) });
    let title = `PMID ${pmid}`;
    if (summResp.ok) {
      try {
        const data = await summResp.json();
        title = data?.result?.[pmid]?.title || title;
      } catch {}
    }

    return { text: cleanText(text), title };
  } catch (err: any) {
    console.log(`[DOC-FETCH] PubMed efetch error for PMID ${pmid}: ${err?.message}`);
    return null;
  }
}

async function fetchClinicalTrialsStudy(nctId: string): Promise<{ text: string; title: string } | null> {
  try {
    const apiUrl = `https://clinicaltrials.gov/api/v2/studies/${nctId}`;
    const resp = await fetch(apiUrl, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return null;
    const data = await resp.json();

    const proto = data?.protocolSection;
    if (!proto) return null;

    const title = proto.identificationModule?.briefTitle || nctId;
    const parts: string[] = [];
    parts.push(`Title: ${title}`);
    parts.push(`Official Title: ${proto.identificationModule?.officialTitle || ""}`);
    parts.push(`Status: ${proto.statusModule?.overallStatus || ""}`);
    parts.push(`Phase: ${(proto.designModule?.phases || []).join(", ")}`);
    parts.push(`Conditions: ${(proto.conditionsModule?.conditions || []).join(", ")}`);
    parts.push(`Interventions: ${(proto.armsInterventionsModule?.interventions || []).map((i: any) => `${i.name} (${i.type})`).join(", ")}`);
    parts.push(`Enrollment: ${proto.designModule?.enrollmentInfo?.count || ""}`);
    parts.push(`Sponsor: ${proto.sponsorCollaboratorsModule?.leadSponsor?.name || ""}`);

    if (proto.descriptionModule?.briefSummary) {
      parts.push(`Summary: ${proto.descriptionModule.briefSummary}`);
    }
    if (proto.descriptionModule?.detailedDescription) {
      parts.push(`Description: ${proto.descriptionModule.detailedDescription}`);
    }

    const eligibility = proto.eligibilityModule;
    if (eligibility?.eligibilityCriteria) {
      parts.push(`Eligibility: ${eligibility.eligibilityCriteria.slice(0, 2000)}`);
    }

    const outcomes = proto.outcomesModule;
    if (outcomes?.primaryOutcomes) {
      parts.push(`Primary Outcomes: ${outcomes.primaryOutcomes.map((o: any) => o.measure).join("; ")}`);
    }

    const results = data?.resultsSection;
    if (results?.baselineCharacteristicsModule) {
      parts.push(`Baseline: ${JSON.stringify(results.baselineCharacteristicsModule).slice(0, 1000)}`);
    }
    if (results?.outcomeMeasuresModule?.outcomeMeasures) {
      for (const om of results.outcomeMeasuresModule.outcomeMeasures.slice(0, 3)) {
        parts.push(`Outcome: ${om.title} — ${om.description || ""}`);
      }
    }

    return { text: cleanText(parts.join("\n")), title };
  } catch {
    return null;
  }
}

function isUrlSafe(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    if (BLOCKED_HOSTS.has(parsed.hostname)) return false;
    if (parsed.hostname.endsWith(".local") || parsed.hostname.endsWith(".internal")) return false;
    if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(parsed.hostname)) return false;
    if (parsed.hostname.startsWith("169.254.")) return false;
    return true;
  } catch {
    return false;
  }
}

const SEC_USER_AGENT = "CIOS Research Tool cios-research@example.com";

function getUserAgentForUrl(url: string): string {
  if (url.includes("sec.gov") || url.includes("edgar")) return SEC_USER_AGENT;
  return USER_AGENT;
}

async function fetchWithRedirectHandling(url: string): Promise<{ resp: Response; finalUrl: string } | { error: string }> {
  if (!isUrlSafe(url)) {
    return { error: "URL blocked by safety check" };
  }

  const resp = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      "User-Agent": getUserAgentForUrl(url),
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    redirect: "follow",
  });

  if (!resp.ok) {
    return { error: `HTTP ${resp.status}` };
  }

  if (!isUrlSafe(resp.url)) {
    return { error: "Redirect target blocked by safety check" };
  }

  return { resp, finalUrl: resp.url };
}

export async function fetchDocument(rawUrl: string): Promise<FetchedDocument> {
  const url = await resolveGoogleNewsUrl(rawUrl);
  const result: FetchedDocument = {
    url,
    text: "",
    title: "",
    contentType: "",
    byteLength: 0,
    fetchedAt: new Date().toISOString(),
  };

  const isPdf = url.toLowerCase().endsWith(".pdf") || url.includes("/pdf/") || url.includes("application/pdf");
  if (isPdf) {
    const externalResult = await fetchViaExternalService(url);
    if (externalResult) {
      console.log(`[DOC-FETCH] External service (PDF): ${externalResult.text.length} chars for ${url.slice(0, 60)}`);
      return externalResult;
    }
    console.log(`[DOC-FETCH] External service unavailable for PDF, falling through to local fetch`);
  }

  const pubmedMatch = url.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/);
  if (pubmedMatch) {
    const pmid = pubmedMatch[1];
    console.log(`[DOC-FETCH] PubMed path for PMID ${pmid}`);

    const externalPubmed = await fetchPubMedViaExternalService(pmid);
    if (externalPubmed && externalPubmed.text.length > 50) {
      result.text = externalPubmed.text;
      result.title = externalPubmed.title;
      result.contentType = "text/plain (PubMed via external service)";
      result.byteLength = externalPubmed.text.length;
      console.log(`[DOC-FETCH] PubMed external service: ${externalPubmed.text.length} chars for PMID ${pmid}`);
      return result;
    }

    const abstract = await fetchPubMedAbstract(pmid);
    if (abstract && abstract.text.length > 50) {
      result.text = abstract.text;
      result.title = abstract.title;
      result.contentType = "text/plain (PubMed API)";
      result.byteLength = abstract.text.length;
      console.log(`[DOC-FETCH] PubMed API: ${abstract.text.length} chars for PMID ${pmid}`);
      return result;
    }
    console.log(`[DOC-FETCH] PubMed API failed for PMID ${pmid}, falling through to web`);
  }

  const ctMatch = url.match(/clinicaltrials\.gov\/study\/(NCT\d+)/i);
  if (ctMatch) {
    const nctId = ctMatch[1];
    const study = await fetchClinicalTrialsStudy(nctId);
    if (study && study.text.length > 50) {
      result.text = study.text;
      result.title = study.title;
      result.contentType = "application/json (ClinicalTrials.gov API)";
      result.byteLength = study.text.length;
      return result;
    }
  }

  try {
    const fetchResult = await fetchWithRedirectHandling(url);
    if ("error" in fetchResult) {
      result.error = fetchResult.error;
      return result;
    }

    const { resp, finalUrl } = fetchResult;
    const contentType = resp.headers.get("content-type") || "";
    result.contentType = contentType;
    result.url = finalUrl;

    if (contentType.includes("application/pdf")) {
      const buffer = await resp.arrayBuffer();
      result.byteLength = buffer.byteLength;
      result.text = await fetchPdfText(buffer);
      result.title = url.split("/").pop()?.replace(/.pdf$/i, "") || "PDF Document";
    } else {
      const html = await resp.text();
      result.byteLength = html.length;

      const extracted = extractTextFromHtml(html);

      if (extracted.text.length < 200) {
        const redirectUrl = extractRedirectUrl(html);
        if (redirectUrl && redirectUrl.startsWith("http") && redirectUrl !== url) {
          try {
            const redirectResult = await fetchWithRedirectHandling(redirectUrl);
            if (!("error" in redirectResult)) {
              const rContentType = redirectResult.resp.headers.get("content-type") || "";
              if (rContentType.includes("application/pdf")) {
                const buffer = await redirectResult.resp.arrayBuffer();
                result.byteLength = buffer.byteLength;
                result.text = await fetchPdfText(buffer);
                result.title = redirectUrl.split("/").pop()?.replace(/.pdf$/i, "") || "PDF Document";
              } else {
                const rHtml = await redirectResult.resp.text();
                const rExtracted = extractTextFromHtml(rHtml);
                if (rExtracted.text.length > extracted.text.length) {
                  result.text = rExtracted.text;
                  result.title = rExtracted.title;
                  result.byteLength = rHtml.length;
                  result.url = redirectResult.finalUrl;
                }
              }
            }
          } catch {}
        }
      }

      if (!result.text) {
        result.text = extracted.text;
        result.title = extracted.title;
      }
    }
  } catch (err: any) {
    result.error = err?.message || "Fetch failed";
  }

  if (result.text.length < 200 && isPdf && getExternalServiceUrl()) {
    const externalFallback = await fetchViaExternalService(url);
    if (externalFallback && externalFallback.text.length > result.text.length) {
      console.log(`[DOC-FETCH] External PDF fallback: ${externalFallback.text.length} chars for ${url.slice(0, 60)}`);
      return externalFallback;
    }
  }

  return result;
}

export async function fetchDocuments(urls: string[], maxConcurrent: number = 2): Promise<FetchedDocument[]> {
  const results: FetchedDocument[] = [];
  const queue = [...urls];

  async function worker() {
    while (queue.length > 0) {
      const url = queue.shift()!;
      const doc = await fetchDocument(url);
      results.push(doc);
      if (url.includes("ncbi.nlm.nih.gov") || url.includes("pubmed")) {
        await new Promise(r => setTimeout(r, 400));
      }
    }
  }

  const workers = Array.from({ length: Math.min(maxConcurrent, urls.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

export interface SourceDiscoveryResult {
  category: string;
  urls: string[];
  queryUsed: string;
}

const API_TIMEOUT_MS = 10000;

export async function discoverPubMedArticles(drugName: string, indication: string): Promise<{ url: string; title: string }[]> {
  try {
    const query = `${drugName} ${indication}`;
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=5&sort=date&retmode=json`;
    const resp = await fetch(searchUrl, { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
    if (!resp.ok) return [];
    const data = await resp.json();
    const ids: string[] = data?.esearchresult?.idlist || [];
    if (ids.length === 0) return [];

    const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json`;
    const summResp = await fetch(summaryUrl, { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
    if (!summResp.ok) return ids.map(id => ({ url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`, title: `PMID ${id}` }));
    const summData = await summResp.json();

    return ids.map(id => {
      const article = summData?.result?.[id];
      return {
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        title: article?.title || `PMID ${id}`,
      };
    });
  } catch {
    return [];
  }
}

export async function discoverClinicalTrials(drugName: string): Promise<{ url: string; title: string }[]> {
  try {
    const searchUrl = `https://clinicaltrials.gov/api/v2/studies?query.term=${encodeURIComponent(drugName)}&pageSize=5&sort=LastUpdatePostDate`;
    const resp = await fetch(searchUrl, { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
    if (!resp.ok) return [];
    const data = await resp.json();
    const studies = data?.studies || [];

    return studies.map((s: any) => {
      const nctId = s?.protocolSection?.identificationModule?.nctId || "";
      const title = s?.protocolSection?.identificationModule?.briefTitle || nctId;
      return {
        url: `https://clinicaltrials.gov/study/${nctId}`,
        title,
      };
    });
  } catch {
    return [];
  }
}

export async function discoverFdaLabels(drugName: string): Promise<{ url: string; title: string }[]> {
  try {
    const searchUrl = `https://api.fda.gov/drug/label.json?search=openfda.brand_name:"${encodeURIComponent(drugName)}"&limit=3`;
    const resp = await fetch(searchUrl, { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
    if (!resp.ok) return [];
    const data = await resp.json();
    const results = data?.results || [];

    return results.map((r: any, i: number) => {
      const setId = r?.set_id || "";
      const brandName = r?.openfda?.brand_name?.[0] || drugName;
      return {
        url: setId ? `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${setId}` : `https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=${r?.openfda?.application_number?.[0] || ""}`,
        title: `FDA Label: ${brandName}`,
      };
    });
  } catch {
    return [];
  }
}

export async function discoverUrlsViaRSS(query: string): Promise<string[]> {
  try {
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    const resp = await fetch(rssUrl, { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
    if (!resp.ok) return [];
    const xml = await resp.text();

    const urls: string[] = [];
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    for (const item of items.slice(0, 5)) {
      const link = item.match(/<link>(.*?)<\/link>/)?.[1];
      if (link && link.startsWith("http")) {
        urls.push(link);
      }
    }
    return urls;
  } catch {
    return [];
  }
}

export interface AllDiscoveredSources {
  pubmed: { url: string; title: string; category: string }[];
  clinicalTrials: { url: string; title: string; category: string }[];
  fda: { url: string; title: string; category: string }[];
  news: { url: string; title: string; category: string }[];
}

export async function discoverAllSources(
  drugName: string,
  indication: string,
  trialNames?: string[],
): Promise<AllDiscoveredSources> {
  const [pubmedResults, ctResults, fdaResults] = await Promise.allSettled([
    discoverPubMedArticles(drugName, indication),
    discoverClinicalTrials(drugName),
    discoverFdaLabels(drugName),
  ]);

  const pubmed = (pubmedResults.status === "fulfilled" ? pubmedResults.value : [])
    .map(r => ({ ...r, category: "Clinical Evidence" }));

  const clinicalTrials = (ctResults.status === "fulfilled" ? ctResults.value : [])
    .map(r => ({ ...r, category: "ClinicalTrials.gov Registry" }));

  const fda = (fdaResults.status === "fulfilled" ? fdaResults.value : [])
    .map(r => ({ ...r, category: "Regulatory / Label" }));

  const trialSearches: Promise<{ url: string; title: string }[]>[] = [];
  if (trialNames) {
    for (const trial of trialNames) {
      trialSearches.push(discoverPubMedArticles(`${trial} ${drugName}`, ""));
      trialSearches.push(discoverClinicalTrials(`${trial} ${drugName}`));
    }
  }

  const trialResults = await Promise.allSettled(trialSearches);
  for (const r of trialResults) {
    if (r.status === "fulfilled") {
      for (const item of r.value) {
        if (item.url.includes("pubmed")) {
          if (!pubmed.some(p => p.url === item.url)) {
            pubmed.push({ ...item, category: "Clinical Evidence" });
          }
        } else if (item.url.includes("clinicaltrials.gov")) {
          if (!clinicalTrials.some(ct => ct.url === item.url)) {
            clinicalTrials.push({ ...item, category: "ClinicalTrials.gov Registry" });
          }
        }
      }
    }
  }

  return { pubmed, clinicalTrials, fda, news: [] };
}
