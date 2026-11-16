// English reader search (/en/search, GET /api/en/search) — pure helpers shared
// by the server route/service and the client page. No I/O here.

export const EN_SEARCH_MIN_QUERY = 2;
export const EN_SEARCH_MAX_QUERY = 100;
export const EN_SEARCH_PAGE_SIZE = 20;
/** Deep pagination is capped: past this page the API answers with an empty list. */
export const EN_SEARCH_MAX_PAGE = 25;
/** At most this many words reach SQL (each word is one AND-ed ILIKE pair). */
export const EN_SEARCH_MAX_WORDS = 8;

export interface EnSearchArticle {
  id: string;
  title: string;
  slug: string;
  englishSlug: string | null;
  excerpt: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
  categoryId: string | null;
  category: { id: string; name: string; slug: string } | null;
}

export interface EnSearchResponse {
  articles: EnSearchArticle[];
  total: number;
  page: number;
  pageSize: number;
  query: string;
}

/**
 * Collapses whitespace, strips control characters and trims. Returns null when
 * the query is shorter than the minimum; longer queries are cut to the maximum.
 */
export function normalizeEnSearchQuery(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, EN_SEARCH_MAX_QUERY)
    .trim();
  return cleaned.length >= EN_SEARCH_MIN_QUERY ? cleaned : null;
}

/** 1-based page, clamped to [1, EN_SEARCH_MAX_PAGE]; anything invalid is page 1. */
export function parseEnSearchPage(raw: unknown): number {
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : typeof raw === "number" ? Math.trunc(raw) : NaN;
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, EN_SEARCH_MAX_PAGE);
}

/** Lower-cased distinct words (≥ 2 chars) used as AND-ed ILIKE terms. */
export function enSearchTerms(query: string): string[] {
  const words = query.toLowerCase().split(" ").filter((w) => w.length >= 2);
  return Array.from(new Set(words)).slice(0, EN_SEARCH_MAX_WORDS);
}

/** Escapes LIKE wildcards so user input matches literally (default `\` escape). */
export function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function enSearchTotalPages(total: number): number {
  return Math.min(EN_SEARCH_MAX_PAGE, Math.max(1, Math.ceil(total / EN_SEARCH_PAGE_SIZE)));
}
