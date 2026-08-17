/**
 * خدمة البحث في الويب — سياق التحقق لمهام التحرير الموحد.
 *
 * مزوّدان عبر env (يُختار أولهما المتوفر):
 *   TAVILY_API_KEY  — Tavily (مصمم لسياق النماذج، النتيجة تتضمن مقتطفات وافية)
 *   SERPER_API_KEY  — Serper.dev (نتائج Google العضوية)
 *
 * غياب المفتاحين لا يكسر شيئاً: isWebSearchConfigured() تعيد false وتعمل
 * مهام «طوّر» بوضع متحفظ بلا سياق تحقق (verificationRecommended).
 *
 * المرجع: docs/editorial-ai-unified-system-plan-2026-08-03.md (القسم 3.4)
 */

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

const SEARCH_TIMEOUT_MS = 10_000;

type Provider = "tavily" | "serper";

function activeProvider(): Provider | null {
  if (process.env.TAVILY_API_KEY) return "tavily";
  if (process.env.SERPER_API_KEY) return "serper";
  return null;
}

export function isWebSearchConfigured(): boolean {
  return activeProvider() !== null;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function searchTavily(query: string, maxResults: number): Promise<WebSearchResult[]> {
  const res = await fetchWithTimeout("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify({ query, max_results: maxResults, search_depth: "basic" }),
  });
  if (!res.ok) throw new Error(`Tavily search failed: HTTP ${res.status}`);
  const data: any = await res.json();
  return (Array.isArray(data?.results) ? data.results : [])
    .filter((r: any) => r?.url && r?.title)
    .map((r: any) => ({
      title: String(r.title),
      url: String(r.url),
      snippet: String(r.content || "").slice(0, 500),
    }));
}

async function searchSerper(query: string, maxResults: number): Promise<WebSearchResult[]> {
  const res = await fetchWithTimeout("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": process.env.SERPER_API_KEY as string,
    },
    body: JSON.stringify({ q: query, num: maxResults }),
  });
  if (!res.ok) throw new Error(`Serper search failed: HTTP ${res.status}`);
  const data: any = await res.json();
  return (Array.isArray(data?.organic) ? data.organic : [])
    .filter((r: any) => r?.link && r?.title)
    .map((r: any) => ({
      title: String(r.title),
      url: String(r.link),
      snippet: String(r.snippet || "").slice(0, 500),
    }));
}

/** بحث واحد. يرمي عند فشل المزوّد — المستدعي يقرر التسامح. */
export async function searchWeb(
  query: string,
  maxResults = 5,
): Promise<WebSearchResult[]> {
  const provider = activeProvider();
  if (!provider) throw new Error("WEB_SEARCH_NOT_CONFIGURED");
  return provider === "tavily"
    ? searchTavily(query, maxResults)
    : searchSerper(query, maxResults);
}

/**
 * يبني «سياق التحقق» لمهام التحرير: حتى 3 استعلامات، بلا تكرار روابط،
 * بصيغة نصية جاهزة للحقن في البرومبت مع إلزام العزو.
 * فشل استعلام واحد لا يُسقط البقية؛ فشل الجميع يعيد null.
 */
export async function buildVerificationContext(
  queries: string[],
  maxResultsPerQuery = 5,
): Promise<{ context: string; results: WebSearchResult[] } | null> {
  if (!isWebSearchConfigured()) return null;

  const seen = new Set<string>();
  const collected: WebSearchResult[] = [];

  for (const query of queries.filter((q) => q.trim()).slice(0, 3)) {
    try {
      const results = await searchWeb(query.trim(), maxResultsPerQuery);
      for (const result of results) {
        if (seen.has(result.url)) continue;
        seen.add(result.url);
        collected.push(result);
      }
    } catch (error) {
      console.warn(
        `[web-search] query failed (${query.slice(0, 60)}...):`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  if (collected.length === 0) return null;

  const lines = collected
    .slice(0, 12)
    .map(
      (r, i) =>
        `${i + 1}. ${r.title}\n   الرابط: ${r.url}\n   المقتطف: ${r.snippet || "(بلا مقتطف)"}`,
    );

  return {
    context: [
      "نتائج بحث ويب حديثة (استخدمها للتحقق والإثراء مع العزو الصريح لمصدرها،",
      "ولا تعتمد أي معلومة من خارجها ومن خارج المادة الأصلية):",
      "",
      ...lines,
    ].join("\n"),
    results: collected.slice(0, 12),
  };
}
