/**
 * دوال الرادار النقية — تفكيك مخرجات النماذج ومطابقة قواعد التنبيه.
 * بلا أي استيراد لقاعدة البيانات عمدًا: قابلة للاختبار في tests/unit مباشرة.
 */
import type { RadarAlertRule, RadarItem } from "@shared/schema";

// ---------- مخرجات المحلل ----------

export interface RadarAnalysis {
  id: string;
  newsValue: number;
  isBreaking: boolean;
  translatedTitle: string;
  translatedSummary: string;
  categorySlug: string | null;
  breakdown: {
    breaking?: number;
    saudiRelevance?: number;
    regionalRelevance?: number;
    novelty?: number;
    reason?: string;
  };
}

function stripCodeFences(raw: string): string {
  let jsonStr = raw.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }
  return jsonStr;
}

function numOrUndefined(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : undefined;
}

export function parseAnalysisPayload(raw: string): RadarAnalysis[] {
  const parsed = JSON.parse(stripCodeFences(raw));
  const list = Array.isArray(parsed) ? parsed : parsed?.items;
  if (!Array.isArray(list)) throw new Error("[Radar Analyst] payload is not an items array");
  return list
    .filter((entry: any) => entry && typeof entry.id === "string")
    .map((entry: any) => ({
      id: entry.id,
      newsValue: Math.max(0, Math.min(100, Math.round(Number(entry.newsValue) || 0))),
      isBreaking: entry.isBreaking === true,
      translatedTitle: String(entry.translatedTitle || "").trim(),
      translatedSummary: String(entry.translatedSummary || "").trim(),
      categorySlug: entry.categorySlug ? String(entry.categorySlug) : null,
      breakdown: {
        breaking: numOrUndefined(entry.breakdown?.breaking),
        saudiRelevance: numOrUndefined(entry.breakdown?.saudiRelevance),
        regionalRelevance: numOrUndefined(entry.breakdown?.regionalRelevance),
        novelty: numOrUndefined(entry.breakdown?.novelty),
        reason: entry.breakdown?.reason ? String(entry.breakdown.reason) : undefined,
      },
    }));
}

// ---------- مخرجات المحوّل التحريري ----------

export interface RadarDraft {
  title: string;
  subheadline?: string;
  content: string;
  excerpt?: string;
  summary?: string;
  tags?: string[];
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string[];
  categorySlug?: string;
  provider?: string;
  model?: string;
}

export function parseDraftPayload(raw: string): RadarDraft {
  const parsed = JSON.parse(stripCodeFences(raw));
  if (!parsed?.title || !parsed?.content) {
    throw new Error("[Radar Transformer] draft missing title/content");
  }
  return {
    title: String(parsed.title).trim(),
    subheadline: parsed.subheadline ? String(parsed.subheadline).trim() : undefined,
    content: String(parsed.content),
    excerpt: parsed.excerpt ? String(parsed.excerpt).trim() : undefined,
    summary: parsed.summary ? String(parsed.summary).trim() : undefined,
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(String).slice(0, 10) : [],
    seoTitle: parsed.seoTitle ? String(parsed.seoTitle).trim() : undefined,
    seoDescription: parsed.seoDescription ? String(parsed.seoDescription).trim() : undefined,
    seoKeywords: Array.isArray(parsed.seoKeywords) ? parsed.seoKeywords.map(String).slice(0, 8) : [],
    categorySlug: parsed.categorySlug ? String(parsed.categorySlug) : undefined,
  };
}

// ---------- تفكيك تواريخ الخلاصات ----------

// لواحق المناطق الزمنية التي لا يفهمها V8 — أبرزها BST البريطانية (خلاصات
// Sky Sports) التي كانت تُسقط التاريخ كاملًا فتظهر مادة قديمة «منذ دقائق»
const TZ_ABBREVIATIONS: Record<string, string> = {
  BST: "+0100", // British Summer Time
  CET: "+0100",
  CEST: "+0200",
  EET: "+0200",
  EEST: "+0300",
  MSK: "+0300",
  AST: "+0300", // Arabia Standard Time
};

export function parseFeedDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  const raw = String(value).trim();
  if (!raw) return undefined;

  let date = new Date(raw);
  if (!Number.isNaN(date.getTime())) return date;

  // صيغة GDELT المضغوطة 20260731T073000Z — لا يفهمها V8 مباشرة
  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (compact) {
    date = new Date(
      `${compact[1]}-${compact[2]}-${compact[3]}T${compact[4]}:${compact[5]}:${compact[6]}Z`
    );
    if (!Number.isNaN(date.getTime())) return date;
  }

  const match = raw.match(/\s([A-Z]{3,4})$/);
  const offset = match ? TZ_ABBREVIATIONS[match[1]] : undefined;
  if (offset) {
    date = new Date(raw.replace(/\s[A-Z]{3,4}$/, ` ${offset}`));
    if (!Number.isNaN(date.getTime())) return date;
  }
  return undefined;
}

/**
 * عناوين Google News تأتي بصيغة «العنوان - الناشر» — نقص اللاحقة فقط عند
 * مطابقتها اسم الناشر حرفيًا (لا قصّ أعمى: العناوين قد تحوي شرطات مشروعة).
 */
export function stripPublisherSuffix(title: string, publisher?: string | null): string {
  const trimmed = title.trim();
  if (!publisher?.trim()) return trimmed;
  const suffix = ` - ${publisher.trim()}`;
  if (trimmed.toLowerCase().endsWith(suffix.toLowerCase())) {
    const stripped = trimmed.slice(0, -suffix.length).trim();
    if (stripped) return stripped;
  }
  return trimmed;
}

// ---------- بوابة الحداثة ----------

export interface DatedItem {
  publishedAt?: Date;
}

/**
 * إسقاط المواد القديمة قبل دخولها الرادار:
 * - مادة بتاريخ نشر أقدم من النافذة → تُسقط.
 * - مادة بلا تاريخ: تُسقط في أول جلبة للمصدر (قد تكون أرشيفًا كاملًا)،
 *   وتُقبل لاحقًا — ظهور guid جديد بعد أول جلبة قرينةُ حداثة.
 */
export function filterFreshItems<T extends DatedItem>(
  items: T[],
  options: { isFirstFetch: boolean; maxAgeHours: number; now?: Date }
): T[] {
  const nowMs = (options.now ?? new Date()).getTime();
  const cutoff = nowMs - options.maxAgeHours * 60 * 60 * 1000;
  return items.filter((item) => {
    if (item.publishedAt) return item.publishedAt.getTime() >= cutoff;
    return !options.isFirstFetch;
  });
}

// ---------- مطابقة قواعد التنبيه ----------

export interface AlertMatch {
  rule: RadarAlertRule;
  keywords: string[];
}

/** مطابقة غير حساسة لحالة الأحرف على النصوص الأصلية والمترجمة معًا */
export function matchAlertRules(
  item: Pick<
    RadarItem,
    "originalTitle" | "originalExcerpt" | "translatedTitle" | "translatedSummary" | "newsValue"
  >,
  rules: RadarAlertRule[]
): AlertMatch[] {
  const haystack = [
    item.originalTitle,
    item.originalExcerpt,
    item.translatedTitle,
    item.translatedSummary,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  if (!haystack) return [];

  const matches: AlertMatch[] = [];
  for (const rule of rules) {
    if (!rule.isActive) continue;
    if ((item.newsValue ?? 0) < rule.minNewsValue) continue;
    const hit = (rule.keywords ?? []).filter(
      (keyword) => keyword.trim() && haystack.includes(keyword.trim().toLowerCase())
    );
    if (hit.length) matches.push({ rule, keywords: hit });
  }
  return matches;
}
