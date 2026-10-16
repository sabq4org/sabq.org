/**
 * عقد JSON لصفحة الخدمة داخل web-next.
 * الصورة تطابق shared/servicePages/present.ts، والفرز يطابق shared/servicePages/related.ts.
 * النسخة هنا لأن صورة Docker تُبنى من مجلد web-next وحده ولا ترى shared/.
 */

export type RelatedArticleLink = { title: string; href: string; publishedAt: string | null };

export const RELATED_ARCHIVE_DAYS = 45;
const RELATED_LIMIT = 4;

function publishedMs(value: string | null): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
}

/** مثل formatRiyadhDayLabel في shared/mawaeed/dates.ts. */
function riyadhDayLabel(ms: number): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(ms));
  const parts = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    timeZone: "Asia/Riyadh",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(new Date(`${day}T12:00:00+03:00`));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")} ${get("year")}`;
}

/** مثل relatedArticleMeta في shared/servicePages/related.ts. */
export function relatedArticleMeta(link: RelatedArticleLink, now: Date): { dateLabel: string | null; archived: boolean } {
  const ms = publishedMs(link.publishedAt);
  if (!Number.isFinite(ms)) return { dateLabel: null, archived: false };
  return { dateLabel: riyadhDayLabel(ms), archived: now.getTime() - ms > RELATED_ARCHIVE_DAYS * 86_400_000 };
}

export type ServicePageModel = {
  title: string;
  description: string;
  canonical: string;
  ogImage: string;
  h1: string;
  leadPrefix: string;
  shiftRule: string | null;
  explanation: string[];
  dateModified: string;
  dateModifiedLabel: string;
  calendarHref: string | null;
  relatedQuery: string | null;
  relatedSource: "keyword" | "search";
  tone?: "citizen" | "salary" | "school" | "social" | "pension";
  jsonLd: Record<string, unknown>;
  next: {
    title?: string;
    certainty?: "confirmed" | "expected";
    certaintyLabel: string;
    startsOn: string;
    gregorianLabel: string;
    hijriLabel: string;
    expectedHint: string | null;
    countdownText: string;
    sourceUrl: string;
    sourceTitle: string;
  } | null;
  rows: Array<{
    startsOn: string;
    isNext: boolean;
    title: string;
    gregorianLabel: string;
    hijriLabel: string;
    countdownText?: string;
    isPast: boolean;
    pastLabel: string | null;
    certaintyLabel: string;
  }>;
  faq: Array<{ question: string; answer: string }>;
  links: Array<{ href: string; label: string }>;
};

function asciiSlug(row: { englishSlug?: string | null; slug?: string | null } | null | undefined): string {
  const english = String(row?.englishSlug || "");
  if (/^[A-Za-z0-9_-]+$/.test(english)) return english;
  const slug = String(row?.slug || "");
  return /^[A-Za-z0-9_-]+$/.test(slug) ? slug : "";
}

function collectArticles(rows: unknown[]): RelatedArticleLink[] {
  const links: RelatedArticleLink[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const record = row && typeof row === "object"
      ? (row as { title?: string; englishSlug?: string; slug?: string; publishedAt?: string | null })
      : null;
    const slug = asciiSlug(record);
    const title = String(record?.title || "").trim();
    if (!title || !slug) continue;
    const key = title.replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    const publishedAt = typeof record?.publishedAt === "string" && record.publishedAt ? record.publishedAt : null;
    links.push({ title, href: `/article/${slug}`, publishedAt });
  }
  return links
    .map((link, index) => ({ link, index }))
    .sort((a, b) => publishedMs(b.link.publishedAt) - publishedMs(a.link.publishedAt) || a.index - b.index)
    .slice(0, RELATED_LIMIT)
    .map(({ link }) => link);
}

export function relatedArticlesFromSearch(payload: unknown): RelatedArticleLink[] {
  const rows = payload && typeof payload === "object" && Array.isArray((payload as { results?: unknown }).results)
    ? (payload as { results: unknown[] }).results
    : [];
  return collectArticles(rows);
}

export function relatedArticlesFromKeyword(payload: unknown): RelatedArticleLink[] {
  const rows = payload && typeof payload === "object" && Array.isArray((payload as { articles?: unknown }).articles)
    ? (payload as { articles: unknown[] }).articles
    : [];
  return collectArticles(rows);
}
