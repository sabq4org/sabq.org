/**
 * عقد JSON لصفحة الخدمة داخل web-next.
 * الصورة تطابق shared/servicePages/present.ts، والفرز يطابق shared/servicePages/related.ts.
 * النسخة هنا لأن صورة Docker تُبنى من مجلد web-next وحده ولا ترى shared/.
 */

export type RelatedArticleLink = { title: string; href: string };

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
    if (links.length >= 4) break;
    const record = row && typeof row === "object" ? (row as { title?: string; englishSlug?: string; slug?: string }) : null;
    const slug = asciiSlug(record);
    const title = String(record?.title || "").trim();
    if (!title || !slug) continue;
    const key = title.replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ title, href: `/article/${slug}` });
  }
  return links;
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
