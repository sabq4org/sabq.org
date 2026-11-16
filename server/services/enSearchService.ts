// English reader search over en_articles (GET /api/en/search).
// Plain ILIKE on title + excerpt: every query word must appear in the title or
// the excerpt; articles whose title holds every word come first, newest first.
// No extension or index is required (en_articles is small next to articles).
import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { enArticles, enCategories } from "@shared/schema";
import {
  EN_SEARCH_MAX_PAGE,
  EN_SEARCH_PAGE_SIZE,
  enSearchTerms,
  escapeLikePattern,
  type EnSearchArticle,
  type EnSearchResponse,
} from "@shared/enSearch";

export async function searchEnglishArticles(query: string, page: number): Promise<EnSearchResponse> {
  const terms = enSearchTerms(query);
  const empty: EnSearchResponse = { articles: [], total: 0, page, pageSize: EN_SEARCH_PAGE_SIZE, query };
  if (terms.length === 0 || page < 1 || page > EN_SEARCH_MAX_PAGE) return empty;

  const patterns = terms.map((t) => `%${escapeLikePattern(t)}%`);
  const where = and(
    eq(enArticles.status, "published"),
    ...patterns.map((p) => or(ilike(enArticles.title, p), ilike(enArticles.excerpt, p))),
  ) as SQL;
  const titleHasAll = and(...patterns.map((p) => ilike(enArticles.title, p))) as SQL;

  const [rows, totals] = await Promise.all([
    db
      .select({
        id: enArticles.id,
        title: enArticles.title,
        slug: enArticles.slug,
        englishSlug: enArticles.englishSlug,
        excerpt: enArticles.excerpt,
        imageUrl: enArticles.imageUrl,
        publishedAt: enArticles.publishedAt,
        categoryId: enArticles.categoryId,
        categoryName: enCategories.name,
        categorySlug: enCategories.slug,
      })
      .from(enArticles)
      .leftJoin(enCategories, eq(enCategories.id, enArticles.categoryId))
      .where(where)
      .orderBy(
        asc(sql`CASE WHEN ${titleHasAll} THEN 0 ELSE 1 END`),
        desc(enArticles.publishedAt),
        desc(enArticles.id),
      )
      .limit(EN_SEARCH_PAGE_SIZE)
      .offset((page - 1) * EN_SEARCH_PAGE_SIZE),
    db.select({ total: count() }).from(enArticles).where(where),
  ]);

  const articles: EnSearchArticle[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    englishSlug: r.englishSlug,
    excerpt: r.excerpt,
    imageUrl: r.imageUrl,
    publishedAt: r.publishedAt ? new Date(r.publishedAt).toISOString() : null,
    categoryId: r.categoryId,
    category: r.categoryId && r.categoryName && r.categorySlug
      ? { id: r.categoryId, name: r.categoryName, slug: r.categorySlug }
      : null,
  }));

  return { ...empty, articles, total: Number(totals[0]?.total ?? 0) };
}
