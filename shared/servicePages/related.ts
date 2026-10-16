/** روابط أخبار سبق ذات الصلة. الـ slug اللاتيني فقط، حتى لا يُبنى رابط عربي مرمّز. */

import { formatRiyadhDayLabel } from "@shared/mawaeed/dates";

export type RelatedArticleLink = { title: string; href: string; publishedAt: string | null };

/** الخبر الأقدم من هذا يأخذ وسم «من الأرشيف» حتى لا يُفهم أنه يخص الموعد الحالي. */
export const RELATED_ARCHIVE_DAYS = 45;
const RELATED_LIMIT = 4;

function publishedMs(value: string | null): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
}

/** تاريخ النشر بتوقيت الرياض، ووسم الأرشيف. بلا تاريخ صالح: لا تاريخ ولا وسم. */
export function relatedArticleMeta(link: RelatedArticleLink, now: Date): { dateLabel: string | null; archived: boolean } {
  const ms = publishedMs(link.publishedAt);
  if (!Number.isFinite(ms)) return { dateLabel: null, archived: false };
  return {
    dateLabel: formatRiyadhDayLabel(new Date(ms).toISOString()),
    archived: now.getTime() - ms > RELATED_ARCHIVE_DAYS * 86_400_000,
  };
}

function asciiSlug(row: { englishSlug?: string | null; slug?: string | null } | null | undefined): string {
  const english = String(row?.englishSlug || "");
  if (/^[A-Za-z0-9_-]+$/.test(english)) return english;
  const slug = String(row?.slug || "");
  return /^[A-Za-z0-9_-]+$/.test(slug) ? slug : "";
}

/** الأحدث أولًا، بحد أقصى أربعة. */
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
