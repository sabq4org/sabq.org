/** روابط أخبار سبق ذات الصلة. الـ slug اللاتيني فقط، حتى لا يُبنى رابط عربي مرمّز. */

export type RelatedArticleLink = { title: string; href: string };

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
