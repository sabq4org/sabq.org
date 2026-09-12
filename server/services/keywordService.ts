import { sql } from "drizzle-orm";
import { db, executeWithStatementTimeout } from "../db";

// The case-insensitive JSON fallback is intentionally bounded. It is only
// reached after both the relational tag lookup and the GIN exact-match lookup
// return no rows, but it still has to be cancelled server-side so a cold scan
// cannot occupy a pooler connection for the full client query timeout.
const SEO_FALLBACK_TIMEOUT_MS = 750;

export interface KeywordPayload {
  articles: any[];
  muqtarabTopics: any[];
}

const ARTICLE_COLUMNS = sql`
  SELECT a.id, a.title, a.slug, a.english_slug AS "englishSlug",
         a.excerpt, a.image_url AS "imageUrl", a.thumbnail_url AS "thumbnailUrl",
         a.image_focal_point AS "imageFocalPoint", a.category_id AS "categoryId",
         a.published_at AS "publishedAt", a.views, a.news_type AS "newsType",
         a.article_type AS "articleType",
         c.name_ar AS "categoryName", c.slug AS "categorySlug",
         CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object(
           'id', c.id, 'nameAr', c.name_ar, 'slug', c.slug, 'color', c.color
         ) END AS category
  FROM articles a
  LEFT JOIN categories c ON c.id = a.category_id
`;

function rowsOf(result: unknown): any[] {
  return ((result as any)?.rows ?? result ?? []) as any[];
}

/** Newest first, de-duplicated by id, capped like the original single query. */
function mergeArticles(...lists: any[][]): any[] {
  const byId = new Map<string, any>();
  for (const list of lists) for (const row of list) if (!byId.has(row.id)) byId.set(row.id, row);
  return [...byId.values()]
    .sort((x, y) => new Date(y.publishedAt ?? 0).getTime() - new Date(x.publishedAt ?? 0).getTime())
    .slice(0, 20);
}

/**
 * Resolves the articles + Muqtarab topics that match a keyword/tag.
 *
 * Extracted from the inline GET /api/keyword/:keyword handler (ADR-001:
 * route modules are HTTP-only; Drizzle queries live in services).
 */
export async function getArticlesByKeyword(keyword: string): Promise<KeywordPayload> {
  // Articles reach a keyword by two independent routes: a relational row in
  // `tags`, or a free-text entry in articles.seo->'keywords' (the article page
  // renders those as clickable badges too). Neither route is a superset of the
  // other — a newly published story often has only SEO keywords while an older
  // one has only a tag — so both indexed lookups always run and are merged.
  const [tagResult, seoExact] = await Promise.all([
    db.execute(sql`
      ${ARTICLE_COLUMNS}
      INNER JOIN article_tags at ON at.article_id = a.id
      INNER JOIN tags t ON t.id = at.tag_id
      WHERE a.status = 'published'
        AND t.status = 'active'
        AND (t.slug = ${keyword} OR t.name_ar = ${keyword})
      ORDER BY a.published_at DESC
      LIMIT 20
    `),
    // GIN-indexed exact containment match (idx_articles_seo_keywords_gin).
    db.execute(sql`
      ${ARTICLE_COLUMNS}
      WHERE a.status = 'published'
        AND (a.seo -> 'keywords') @> to_jsonb(${keyword}::text)
      ORDER BY a.published_at DESC
      LIMIT 20
    `),
  ]);

  let filteredArticles = mergeArticles(rowsOf(tagResult), rowsOf(seoExact));

  // Last resort: case-insensitive scan, only when both indexed lookups found
  // nothing (rare — covers keywords stored in a different case).
  if (filteredArticles.length === 0) {
    let seoResult;
    try {
      seoResult = await executeWithStatementTimeout(sql`
        ${ARTICLE_COLUMNS}
        WHERE a.status = 'published'
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(a.seo -> 'keywords') AS kw
            WHERE lower(kw) = lower(${keyword})
          )
        ORDER BY a.published_at DESC
        LIMIT 20
      `, SEO_FALLBACK_TIMEOUT_MS);
    } catch (error: any) {
      const code = error?.code ?? error?.cause?.code;
      if (code !== "57014") throw error;
      // The fallback is best-effort. Do not log the user-provided keyword.
      console.warn(
        `[Keyword] case-insensitive SEO fallback timed out after ${SEO_FALLBACK_TIMEOUT_MS}ms`,
      );
      seoResult = { rows: [] };
    }
    filteredArticles = rowsOf(seoResult);
  }

  const topicsResult = await db.execute(sql`
    SELECT t.id, t.title, t.slug, t.excerpt, t.hero_image_url AS "heroImageUrl",
           t.published_at AS "publishedAt", t.view_count AS "viewCount",
           a.slug AS "angleSlug", a.name_ar AS "angleNameAr", a.color_hex AS "angleColorHex"
    FROM topics t
    INNER JOIN angles a ON a.id = t.angle_id
    WHERE t.status = 'published'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(t.seo_meta -> 'keywords') AS kw
        WHERE lower(kw) = lower(${keyword})
      )
    ORDER BY t.published_at DESC
    LIMIT 20
  `);
  const muqtarabTopics = rowsOf(topicsResult);

  return { articles: filteredArticles, muqtarabTopics };
}
