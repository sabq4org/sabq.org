/**
 * جالب الرادار — يحوّل أي مصدر (RSS أو JSON API) إلى قائمة مواد موحّدة الشكل.
 * لا ذكاء هنا: جلب وتطبيع فقط؛ التحليل والترجمة في analyst.ts.
 */
import Parser from "rss-parser";
import type { RadarSource } from "@shared/schema";
import type { NormalizedRadarItem } from "./repo";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_ITEMS_PER_FETCH = 30;

const rssParser = new Parser({
  timeout: FETCH_TIMEOUT_MS,
  headers: { "User-Agent": "SabqSmartRadar/1.0 (+https://sabq.org)" },
});

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ") // بعض المصادر تضع HTML في الملخص
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, maxLength);
}

function parseDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

async function fetchRss(source: RadarSource): Promise<NormalizedRadarItem[]> {
  const feed = await rssParser.parseURL(source.url);
  const items: NormalizedRadarItem[] = [];
  for (const item of feed.items ?? []) {
    const title = cleanText(item.title, 300);
    const link = String(item.link ?? "").trim();
    if (!title || !link) continue;
    const enclosureUrl = (item as any).enclosure?.url as string | undefined;
    items.push({
      guid: String(item.guid ?? item.id ?? link),
      link,
      title,
      excerpt: cleanText(item.contentSnippet ?? (item as any).summary ?? item.content, 1200) || undefined,
      imageUrl: enclosureUrl && /^https?:\/\//.test(enclosureUrl) ? enclosureUrl : undefined,
      publishedAt: parseDate(item.isoDate ?? item.pubDate),
    });
  }
  return items;
}

/** يلتقط مصفوفة المواد من استجابات JSON الشائعة مهما اختلفت التسمية */
function extractJsonArray(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (payload && typeof payload === "object") {
    for (const key of ["items", "articles", "results", "data", "news", "response", "posts"]) {
      const nested = (payload as Record<string, unknown>)[key];
      if (Array.isArray(nested)) return nested as Record<string, unknown>[];
      if (nested && typeof nested === "object") {
        const deep = extractJsonArray(nested);
        if (deep.length) return deep;
      }
    }
  }
  return [];
}

function firstString(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object" && typeof (value as any).url === "string") {
      return (value as any).url;
    }
  }
  return "";
}

async function fetchJson(source: RadarSource): Promise<NormalizedRadarItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(source.url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "SabqSmartRadar/1.0 (+https://sabq.org)",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const rawItems = extractJsonArray(payload);

    const items: NormalizedRadarItem[] = [];
    for (const raw of rawItems) {
      const title = cleanText(firstString(raw, ["title", "headline", "name"]), 300);
      const link = firstString(raw, ["link", "url", "web_url", "webUrl", "href"]);
      if (!title || !link) continue;
      items.push({
        guid: firstString(raw, ["guid", "id", "uuid", "uri"]) || link,
        link,
        title,
        excerpt:
          cleanText(
            firstString(raw, ["description", "summary", "abstract", "excerpt", "snippet", "lead"]),
            1200
          ) || undefined,
        imageUrl: firstString(raw, ["image", "imageUrl", "image_url", "thumbnail", "urlToImage"]) || undefined,
        publishedAt: parseDate(
          firstString(raw, ["publishedAt", "published_at", "pubDate", "date", "published", "created_at"])
        ),
      });
    }
    return items;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchSource(source: RadarSource): Promise<NormalizedRadarItem[]> {
  const items = source.type === "json" ? await fetchJson(source) : await fetchRss(source);
  // الأحدث أولًا ثم قصّ الدفعة — مصدر مهمل طويلًا لا يُغرق الرادار دفعة واحدة
  items.sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
  return items.slice(0, MAX_ITEMS_PER_FETCH);
}
