const SEARCH_TIMEOUT_MS = 8000;
const FETCH_TIMEOUT_MS = 6000;
const MAX_CONTEXT_CHARS = 4000;

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

interface NewsItem {
  title: string;
  description: string;
  pubDate: string;
  link: string;
  dateMs: number;
}

interface ResearchResult {
  newsHeadlines: NewsItem[];
  fetchedContent: string[];
  combinedContext: string;
}

function parsePubDate(dateStr: string): number {
  if (!dateStr) return 0;
  const ms = Date.parse(dateStr);
  return isNaN(ms) ? 0 : ms;
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
      return { title, description, pubDate, link, dateMs: parsePubDate(pubDate) };
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
    const text = stripHtml(html);
    return text.slice(0, maxChars);
  } catch {
    return "";
  }
}

export async function researchBrand(
  subject: string,
  questionText: string,
): Promise<ResearchResult> {
  const empty: ResearchResult = { newsHeadlines: [], fetchedContent: [], combinedContext: "" };

  if (!subject || subject.length < 2) return empty;

  const searchQueries = [
    `${subject} latest news 2026`,
    `${subject} FDA approval clinical trial results`,
    `${subject} press release investor`,
  ];

  const searchPromises = searchQueries.map((q) => searchGoogleNewsRSS(q));
  const searchResults = await Promise.allSettled(searchPromises);

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

  allNews.sort((a, b) => b.dateMs - a.dateMs);

  const topNews = allNews.slice(0, 8);

  const pageUrls = topNews
    .map((n) => n.link)
    .filter((link) => link.startsWith("http") && isAllowedUrl(link))
    .slice(0, 3);

  const fetchPromises = pageUrls.map((url) => fetchPageText(url, 1500));
  const fetchResults = await Promise.allSettled(fetchPromises);
  const fetchedContent: string[] = [];
  for (const result of fetchResults) {
    if (result.status === "fulfilled" && result.value.length > 100) {
      fetchedContent.push(result.value);
    }
  }

  let context = "";
  if (topNews.length > 0) {
    context += "RECENT NEWS HEADLINES (sorted newest first):\n";
    for (const item of topNews) {
      const date = item.pubDate ? `[${item.pubDate}] ` : "";
      context += `- ${date}${item.title}`;
      if (item.description) context += ` — ${item.description.slice(0, 200)}`;
      context += "\n";
    }
  }

  if (fetchedContent.length > 0) {
    context += "\nFETCHED PAGE CONTENT:\n";
    for (const content of fetchedContent) {
      context += content.slice(0, 1200) + "\n---\n";
    }
  }

  if (context.length > MAX_CONTEXT_CHARS) {
    context = context.slice(0, MAX_CONTEXT_CHARS) + "\n[truncated]";
  }

  return {
    newsHeadlines: topNews,
    fetchedContent,
    combinedContext: context,
  };
}

export async function fetchUrl(url: string): Promise<string> {
  return fetchPageText(url, 3000);
}
