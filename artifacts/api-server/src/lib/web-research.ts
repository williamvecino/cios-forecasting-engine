const SEARCH_TIMEOUT_MS = 8000;
const FETCH_TIMEOUT_MS = 6000;
const MAX_CONTEXT_CHARS = 5000;

const ALLOWED_FETCH_DOMAINS = new Set([
  "news.google.com",
  "reuters.com",
  "www.reuters.com",
  "biospace.com",
  "www.biospace.com",
  "fiercepharma.com",
  "www.fiercepharma.com",
  "prnewswire.com",
  "www.prnewswire.com",
  "businesswire.com",
  "www.businesswire.com",
  "globenewswire.com",
  "www.globenewswire.com",
  "sec.gov",
  "www.sec.gov",
  "fda.gov",
  "www.fda.gov",
  "clinicaltrials.gov",
  "www.clinicaltrials.gov",
  "classic.clinicaltrials.gov",
  "accessdata.fda.gov",
  "statnews.com",
  "www.statnews.com",
  "medscape.com",
  "www.medscape.com",
  "evaluate.com",
  "www.evaluate.com",
  "pharmavoice.com",
  "www.pharmavoice.com",
  "endpoints.news",
  "www.endpoints.news",
  "biopharmajournal.com",
]);

function isAllowedUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const host = parsed.hostname.toLowerCase();
    if (ALLOWED_FETCH_DOMAINS.has(host)) return true;
    if (host.endsWith(".gov")) return true;
    if (host.includes("investor.") || host.includes("investors.") || host.includes("ir.")) return true;
    if (host.includes("newsroom.") || host.includes("news.") || host.includes("press.")) return true;
    return false;
  } catch {
    return false;
  }
}

export interface NewsItem {
  title: string;
  description: string;
  pubDate: string;
  link: string;
  dateMs: number;
  sourceType: string;
  sourcePriority: number;
}

export interface FetchedPage {
  url: string;
  content: string;
  sourceType: string;
}

export interface ResearchResult {
  newsHeadlines: NewsItem[];
  fetchedPages: FetchedPage[];
  combinedContext: string;
  brandCheckPerformed: boolean;
  sourcesSearched: string[];
}

function parsePubDate(dateStr: string): number {
  if (!dateStr) return 0;
  const ms = Date.parse(dateStr);
  return isNaN(ms) ? 0 : ms;
}

function classifySource(url: string, title: string): { sourceType: string; priority: number } {
  const lower = url.toLowerCase();
  const titleLower = title.toLowerCase();
  if (lower.includes("investor.") || lower.includes("investors.") || lower.includes("ir.") || titleLower.includes("investor")) {
    return { sourceType: "investor_relations", priority: 1 };
  }
  if (lower.includes("clinicaltrials.gov")) {
    return { sourceType: "clinical_trials_gov", priority: 3 };
  }
  if (lower.includes(".fda.gov")) {
    return { sourceType: "fda", priority: 2 };
  }
  if (lower.includes("prnewswire") || lower.includes("businesswire") || lower.includes("globenewswire")) {
    return { sourceType: "press_release", priority: 1 };
  }
  if (lower.includes("congress") || lower.includes("asco") || lower.includes("aacr") || lower.includes("esmo")) {
    return { sourceType: "congress", priority: 4 };
  }
  return { sourceType: "news", priority: 5 };
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
      const { sourceType, priority } = classifySource(link, title);
      return { title, description, pubDate, link, dateMs: parsePubDate(pubDate), sourceType, sourcePriority: priority };
    }).filter((n) => n.title.length > 0);
  } catch {
    return [];
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchPageText(url: string, maxChars = 2000): Promise<string> {
  if (!isAllowedUrl(url)) return "";
  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CIOS-Research/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "manual",
    });
    if (resp.status >= 300 && resp.status < 400) {
      const location = resp.headers.get("location");
      if (location && isAllowedUrl(location)) {
        const redirectResp = await fetch(location, {
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; CIOS-Research/1.0)",
            Accept: "text/html,application/xhtml+xml",
          },
          redirect: "manual",
        });
        if (!redirectResp.ok) return "";
        const ct = redirectResp.headers.get("content-type") || "";
        if (!ct.includes("html") && !ct.includes("xml") && !ct.includes("text")) return "";
        const html = await redirectResp.text();
        return stripHtml(html).slice(0, maxChars);
      }
      return "";
    }
    if (!resp.ok) return "";
    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("html") && !contentType.includes("xml") && !contentType.includes("text")) return "";
    const html = await resp.text();
    return stripHtml(html).slice(0, maxChars);
  } catch {
    return "";
  }
}

export async function researchBrand(
  subject: string,
  questionText: string,
  keywords?: string[],
): Promise<ResearchResult> {
  const empty: ResearchResult = {
    newsHeadlines: [],
    fetchedPages: [],
    combinedContext: "",
    brandCheckPerformed: true,
    sourcesSearched: [],
  };

  if (!subject || subject.length < 2) {
    return { ...empty, brandCheckPerformed: false };
  }

  const sourcesSearched: string[] = [];

  const searchQueries = [
    { query: `"${subject}" investor press release site:prnewswire.com OR site:businesswire.com OR site:globenewswire.com`, label: "Company investor/press releases" },
    { query: `"${subject}" official site`, label: "Official brand website" },
    { query: `"${subject}" clinical trial results`, label: "ClinicalTrials.gov / clinical data" },
    { query: `"${subject}" congress presentation ASCO ESMO ATS`, label: "Congress/company presentations" },
    { query: `${subject} latest news 2026`, label: "Recent news" },
    { query: `${subject} FDA approval regulatory`, label: "FDA/regulatory" },
  ];

  if (keywords && keywords.length > 0) {
    for (const kw of keywords.slice(0, 3)) {
      searchQueries.push({
        query: `${subject} ${kw.trim()}`,
        label: `Keyword search: ${kw.trim()}`,
      });
    }
  }

  const searchPromises = searchQueries.map((q) => searchGoogleNewsRSS(q.query));
  const searchResults = await Promise.allSettled(searchPromises);

  searchQueries.forEach((q, i) => {
    const result = searchResults[i];
    if (result.status === "fulfilled" && result.value.length > 0) {
      sourcesSearched.push(`${q.label} (${result.value.length} results)`);
    } else {
      sourcesSearched.push(`${q.label} (no results)`);
    }
  });

  const allNews: NewsItem[] = [];
  const seenTitles = new Set<string>();
  for (const result of searchResults) {
    if (result.status === "fulfilled") {
      for (const item of result.value) {
        const key = item.title.toLowerCase().slice(0, 60);
        if (!seenTitles.has(key)) {
          seenTitles.add(key);
          allNews.push(item);
        }
      }
    }
  }

  allNews.sort((a, b) => {
    if (a.sourcePriority !== b.sourcePriority) return a.sourcePriority - b.sourcePriority;
    return b.dateMs - a.dateMs;
  });

  const topNews = allNews.slice(0, 10);

  const pageUrls = topNews
    .map((n) => ({ url: n.link, sourceType: n.sourceType }))
    .filter((p) => p.url.startsWith("http") && isAllowedUrl(p.url))
    .slice(0, 4);

  const fetchPromises = pageUrls.map(async (p): Promise<FetchedPage | null> => {
    const content = await fetchPageText(p.url, 1500);
    if (content.length > 100) {
      return { url: p.url, content, sourceType: p.sourceType };
    }
    return null;
  });

  const fetchResults = await Promise.allSettled(fetchPromises);
  const fetchedPages: FetchedPage[] = [];
  for (const result of fetchResults) {
    if (result.status === "fulfilled" && result.value) {
      fetchedPages.push(result.value);
    }
  }

  let context = "";

  context += `BRAND DEVELOPMENT CHECK for "${subject}"\n`;
  context += `Sources searched: ${sourcesSearched.join("; ")}\n\n`;

  if (topNews.length > 0) {
    context += "VERIFIED BRAND DEVELOPMENTS (sorted by source priority, then date):\n";
    for (const item of topNews) {
      const date = item.pubDate ? `[${item.pubDate}]` : "[date unknown]";
      context += `- ${date} [${item.sourceType}] ${item.title}`;
      if (item.description) context += ` — ${item.description.slice(0, 200)}`;
      if (item.link) context += ` (source: ${item.link})`;
      context += "\n";
    }
  } else {
    context += "No recent verified brand developments found.\n";
  }

  if (fetchedPages.length > 0) {
    context += "\nFETCHED PAGE CONTENT (from priority sources):\n";
    for (const page of fetchedPages) {
      context += `[Source: ${page.sourceType}] ${page.url}\n`;
      context += page.content.slice(0, 1200) + "\n---\n";
    }
  }

  if (context.length > MAX_CONTEXT_CHARS) {
    context = context.slice(0, MAX_CONTEXT_CHARS) + "\n[truncated]";
  }

  return {
    newsHeadlines: topNews,
    fetchedPages,
    combinedContext: context,
    brandCheckPerformed: true,
    sourcesSearched,
  };
}

export async function fetchUrl(url: string): Promise<string> {
  return fetchPageText(url, 3000);
}
