/**
 * جالب الرادار — يحوّل أي مصدر (RSS أو JSON API) إلى قائمة مواد موحّدة الشكل.
 * لا ذكاء هنا: جلب وتطبيع فقط؛ التحليل والترجمة في analyst.ts.
 */
import Parser from "rss-parser";
import type { RadarSource } from "@shared/schema";
import type { NormalizedRadarItem } from "./repo";
import {
  filterFreshItems,
  parseFeedDate,
  resolveEnvPlaceholders,
  stripPublisherSuffix,
} from "./parsing";
import { filterItemsBySabqInterest, shouldApplyTopicFilter } from "./topicFilter";
import { fetchXSource } from "./xFetcher";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_ITEMS_PER_FETCH = 30;
const MAX_ITEM_AGE_HOURS = Number(process.env.RADAR_MAX_ITEM_AGE_HOURS || 48);

// عنصر <source> في خلاصات بحث Google News يحمل اسم الناشر الحقيقي (RNZ، Le Monde…)
const rssParser = new Parser({
  timeout: FETCH_TIMEOUT_MS,
  headers: { "User-Agent": "SabqSmartRadar/1.0 (+https://sabq.org)" },
  customFields: { item: [["source", "feedSource"]] },
});

/** ممر اصطياد Google News — مصدر «بحث» لا «اشتراك»، وعناوينه تحمل لاحقة الناشر */
function isGoogleNewsLane(source: RadarSource): boolean {
  return source.url.includes("news.google.com/rss");
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ") // بعض المصادر تضع HTML في الملخص
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, maxLength);
}

async function fetchRss(source: RadarSource): Promise<NormalizedRadarItem[]> {
  const feed = await rssParser.parseURL(resolveEnvPlaceholders(source.url, process.env));
  const gnewsLane = isGoogleNewsLane(source);
  const items: NormalizedRadarItem[] = [];
  for (const item of feed.items ?? []) {
    // feedSource إما نص مباشر أو {_: "الاسم", $: {url}} حسب المُفكِّك
    const rawSource = (item as any).feedSource;
    const publisher = cleanText(
      typeof rawSource === "string" ? rawSource : rawSource?._,
      120
    ) || undefined;
    const title = gnewsLane
      ? cleanText(stripPublisherSuffix(String(item.title ?? ""), publisher), 300)
      : cleanText(item.title, 300);
    const link = String(item.link ?? "").trim();
    if (!title || !link) continue;
    const enclosureUrl = (item as any).enclosure?.url as string | undefined;
    // ملخص Google News قائمة روابط HTML تكرر العنوان — لا قيمة له بعد التنظيف
    const excerpt = gnewsLane
      ? undefined
      : cleanText(item.contentSnippet ?? (item as any).summary ?? item.content, 1200) || undefined;
    items.push({
      guid: String(item.guid ?? (item as any).id ?? link),
      link,
      title,
      excerpt,
      publisher: gnewsLane ? publisher : undefined,
      imageUrl: enclosureUrl && /^https?:\/\//.test(enclosureUrl) ? enclosureUrl : undefined,
      // pubDate الخام قبل isoDate: مكتبة rss-parser تحسب isoDate بـ new Date
      // فتُسقط لواحق مثل BST التي تعالجها parseFeedDate
      publishedAt: parseFeedDate(item.pubDate ?? item.isoDate),
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
    const response = await fetch(resolveEnvPlaceholders(source.url, process.env), {
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
      // Event Registry يعلّم النسخ المكررة من نفس المادة عبر المصادر — لا نهدر تحليلًا عليها
      if (raw.isDuplicate === true) continue;
      const title = cleanText(firstString(raw, ["title", "headline", "name"]), 300);
      const link = firstString(raw, ["link", "url", "web_url", "webUrl", "href"]);
      if (!title || !link) continue;
      // Event Registry: الناشر كائن source بحقل title؛ GDELT: نطاق نصي في domain
      const sourceObj = raw.source as { title?: unknown; uri?: unknown } | undefined;
      const nestedPublisher =
        sourceObj && typeof sourceObj === "object"
          ? String(sourceObj.title ?? sourceObj.uri ?? "")
          : "";
      items.push({
        guid: firstString(raw, ["guid", "id", "uuid", "uri"]) || link,
        link,
        title,
        // body (النص الكامل لدى Event Registry) يعطي المحلل سياقًا أدق — يُقص لـ1200 حرف
        excerpt:
          cleanText(
            firstString(raw, ["description", "summary", "abstract", "excerpt", "snippet", "lead", "body"]),
            1200
          ) || undefined,
        publisher:
          cleanText(
            firstString(raw, ["domain", "publisher", "source_name", "sourceName"]) || nestedPublisher,
            120
          ) || undefined,
        language: cleanText(firstString(raw, ["language", "sourcelanguage", "lang"]), 30).toLowerCase() || undefined,
        imageUrl:
          firstString(raw, ["image", "imageUrl", "image_url", "thumbnail", "urlToImage", "socialimage"]) || undefined,
        publishedAt: parseFeedDate(
          firstString(raw, [
            "publishedAt",
            "published_at",
            "pubDate",
            "dateTime", // Event Registry — قبل date لأن date لديه بدقة اليوم فقط
            "date",
            "published",
            "created_at",
            "seendate",
          ])
        ),
      });
    }
    return items;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchSource(source: RadarSource): Promise<NormalizedRadarItem[]> {
  let items =
    source.type === "x"
      ? await fetchXSource(source)
      : source.type === "json"
        ? await fetchJson(source)
        : await fetchRss(source);
  // مصادر أجنبية: اهتمام سبق فقط (سعودية / إيران-أمريكا / مونديال / نجوم / حدث كبير)
  if (shouldApplyTopicFilter(source) && source.type !== "x") {
    items = filterItemsBySabqInterest(items);
  }
  // بوابة الحداثة: خلاصة تاريخها طويل (مثل Sky Sports) لا تُغرق الرادار بالقديم
  const fresh = filterFreshItems(items, {
    isFirstFetch: !source.lastFetchedAt,
    maxAgeHours: MAX_ITEM_AGE_HOURS,
  });
  // الأحدث أولًا ثم قصّ الدفعة — مصدر مهمل طويلًا لا يُغرق الرادار دفعة واحدة
  fresh.sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
  return fresh.slice(0, MAX_ITEMS_PER_FETCH);
}
