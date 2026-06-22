// خدمة أخبار واس (SPA News API) — غلاف لواجهة Cloudflare Worker التي تجلب أخبار
// وكالة الأنباء السعودية مصنّفة لأقسام وخلاصات (عربي/إنجليزي) بمحتوى منظَّف.
//
// الاستخدام: لوحة التحكم فقط — المحرّر يتصفّح المواد حسب القسم/الخلاصة ثم يستورد
// المختار كمسودّات في سبق (مثل مستورد RSS لكن مخصّص لهذه الواجهة المنظَّمة).
//
// الإعداد: SPA_NEWS_BASE_URL و SPA_NEWS_API_KEY (لهما قيمتان افتراضيتان موثّقتان
// كي تعمل الخدمة فورًا؛ يُفضّل ضبطهما في البيئة للإنتاج وتدوير المفتاح عند الحاجة).

import { withSWR } from "../memoryCache";
import { storage } from "../storage";

// قيم افتراضية من توثيق الواجهة (worker للقراءة فقط) — قابلة للتجاوز بالبيئة.
const DEFAULT_BASE = "https://spa-news-lan.plain-water-0957.workers.dev";
const DEFAULT_KEY = "fwq4625epxmb80salam";

// حساب «صحيفة سبق» المعتمد للمواد المستوردة من مصادر خارجية (نفس افتراضي الرادار).
const SPA_REPORTER_ID =
  process.env.SPA_REPORTER_ID || process.env.RADAR_REPORTER_ID || "RnP7eDOAl5T5rGpib9_8d";

// إيقاع الكاش: نطابق حافة الـworker (5 دقائق) مع نافذة SWR قصيرة.
const READ_TTL = 5 * 60 * 1000;
const READ_SWR = 2 * 60 * 1000;

export type SpaLang = "ar" | "en";

export interface SpaArticle {
  id: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  content: string | null;
  image: string | null;
  publishedAt: string | null;
  publishedTimestamp: number | null;
  dateHijri: string | null;
  views: number;
  shares: number;
  isUpdated: boolean;
  url: string | null;
  source: string;
  lang: string;
}

export interface SpaSection {
  slug: string;
  name: string;
  nameEn?: string | null;
  kind: "category" | "feed";
}

function baseUrl(): string {
  return (process.env.SPA_NEWS_BASE_URL || DEFAULT_BASE).replace(/\/+$/, "");
}

function apiKey(): string {
  return (process.env.SPA_NEWS_API_KEY || DEFAULT_KEY).trim();
}

export function isSpaNewsConfigured(): boolean {
  return Boolean(baseUrl() && apiKey());
}

function normalizeLang(lang: unknown): SpaLang {
  return lang === "en" ? "en" : "ar";
}

async function spaGet(path: string, params: Record<string, string> = {}): Promise<any> {
  if (!isSpaNewsConfigured()) {
    throw new Error("SPA News غير مهيأة (SPA_NEWS_BASE_URL / SPA_NEWS_API_KEY)");
  }
  const url = new URL(`${baseUrl()}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const response = await fetch(url, {
    headers: { "X-API-Key": apiKey() },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    let detail = "";
    try {
      detail = JSON.stringify(await response.json());
    } catch {
      /* تجاهل */
    }
    throw new Error(`[SPA News] HTTP ${response.status} ${detail}`);
  }
  return response.json();
}

// الأقسام + الخلاصات مدموجة في قائمة واحدة لمُحدِّد الواجهة (يُكاش طويلًا).
export async function getSpaSections(langRaw: unknown): Promise<SpaSection[]> {
  const lang = normalizeLang(langRaw);
  return withSWR(`spa:sections:${lang}`, READ_TTL, READ_SWR, async () => {
    const [cats, feeds] = await Promise.all([
      spaGet(`/api/${lang}/categories`),
      spaGet(`/api/${lang}/feeds`),
    ]);
    const sections: SpaSection[] = [];
    for (const c of Array.isArray(cats?.categories) ? cats.categories : []) {
      sections.push({ slug: c.slug, name: c.name, nameEn: c.name_en ?? null, kind: "category" });
    }
    for (const f of Array.isArray(feeds?.feeds) ? feeds.feeds : []) {
      sections.push({ slug: f.slug, name: f.name, nameEn: f.name_en ?? null, kind: "feed" });
    }
    return sections;
  });
}

export interface SpaNewsResult {
  section: { slug: string; name: string } | null;
  articles: SpaArticle[];
  pagination: { page: number; perPage: number; hasMore: boolean };
}

export async function getSpaNews(
  langRaw: unknown,
  slug: string,
  page = 1,
  perPage = 30
): Promise<SpaNewsResult> {
  const lang = normalizeLang(langRaw);
  const safePage = Math.max(1, Math.floor(page) || 1);
  const safePerPage = Math.min(100, Math.max(1, Math.floor(perPage) || 30));
  const data = await withSWR(
    `spa:news:${lang}:${slug}:${safePage}:${safePerPage}`,
    READ_TTL,
    READ_SWR,
    () =>
      spaGet(`/api/${lang}/news/${encodeURIComponent(slug)}`, {
        page: String(safePage),
        per_page: String(safePerPage),
      })
  );
  return {
    section: data?.section
      ? { slug: data.section.slug, name: data.section.name }
      : { slug, name: slug },
    articles: Array.isArray(data?.articles) ? (data.articles as SpaArticle[]) : [],
    pagination: {
      page: data?.pagination?.page ?? safePage,
      perPage: data?.pagination?.perPage ?? safePerPage,
      hasMore: Boolean(data?.pagination?.hasMore),
    },
  };
}

export async function getSpaStatus(): Promise<{
  configured: boolean;
  connected: boolean;
  baseUrl: string;
  sectionsCount: number;
  error?: string;
}> {
  const configured = isSpaNewsConfigured();
  const result = { configured, connected: false, baseUrl: baseUrl(), sectionsCount: 0 } as {
    configured: boolean;
    connected: boolean;
    baseUrl: string;
    sectionsCount: number;
    error?: string;
  };
  if (!configured) return result;
  try {
    const sections = await getSpaSections("ar");
    result.connected = true;
    result.sectionsCount = sections.length;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }
  return result;
}

// ===== الاستيراد كمسودّات =====

function spaSlug(title: string): string {
  return (
    title
      .toLowerCase()
      // نُبقي العربية والـlatin والأرقام والمسافات والشرطة فقط
      .replace(/[^؀-ۿa-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .substring(0, 140) || "spa-news"
  );
}

export interface SpaImportInput {
  lang: SpaLang;
  sourceSlug?: string;
  categoryId: string;
  userId: string;
  articleIds: string[];
}

export interface SpaImportResult {
  imported: number;
  skipped: number;
  titles: string[];
}

// نستورد المواد المختارة من قسم/خلاصة معيّنة كمسودّات. المطابقة بالمعرّف من
// قائمة القسم الحالية (نعيد جلبها لضمان المحتوى الكامل)، والتكرار يُتخطّى بالـslug.
export async function importSpaArticles(input: SpaImportInput): Promise<SpaImportResult> {
  const { lang, sourceSlug, categoryId, userId, articleIds } = input;
  if (!categoryId) throw new Error("SPA_IMPORT_NO_CATEGORY");
  if (!Array.isArray(articleIds) || articleIds.length === 0) {
    throw new Error("SPA_IMPORT_NO_ITEMS");
  }
  if (!sourceSlug) throw new Error("SPA_IMPORT_NO_SOURCE");

  // نجلب صفحة كبيرة من القسم لإيجاد المواد بمعرّفاتها (المحتوى الكامل).
  const { articles } = await getSpaNews(lang, sourceSlug, 1, 100);
  const wanted = new Set(articleIds);
  const selected = articles.filter((a) => wanted.has(a.id));

  let imported = 0;
  let skipped = 0;
  const titles: string[] = [];

  for (const item of selected) {
    const title = (item.title || "").trim();
    if (!title) {
      skipped++;
      continue;
    }
    const slug = spaSlug(title);
    const existing = await storage.getArticleBySlug(slug);
    if (existing) {
      skipped++;
      continue;
    }

    const content = item.content || item.summary || "";
    const excerpt = (item.summary || "").substring(0, 200) || undefined;

    await storage.createArticle({
      title,
      slug,
      content,
      excerpt,
      locale: lang,
      categoryId,
      authorId: userId,
      reporterId: SPA_REPORTER_ID,
      articleType: "news",
      newsType: "regular",
      publishType: "instant",
      status: "draft",
      aiGenerated: false,
      imageUrl: item.image || undefined,
      sourceUrl: item.url || undefined,
      publishedAt: item.publishedAt ? new Date(item.publishedAt) : undefined,
      sourceMetadata: {
        type: "spa-news",
        spaId: item.id,
        source: item.source,
        originalUrl: item.url,
        lang: item.lang,
      },
    } as any); // authorId/aiGenerated خارج insertArticleSchema — نفس نمط الرادار وWC News

    imported++;
    titles.push(title);
  }

  return { imported, skipped, titles };
}
