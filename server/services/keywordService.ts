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

/**
 * Resolves the articles + Muqtarab topics that match a keyword/tag.
 *
 * Extracted from the inline GET /api/keyword/:keyword handler (ADR-001:
 * route modules are HTTP-only; Drizzle queries live in services).
 */
export async function getArticlesByKeyword(keyword: string): Promise<KeywordPayload> {
  const result = await db.execute(sql`
    SELECT a.id, a.title, a.slug, a.english_slug AS "englishSlug",
           a.excerpt, a.image_url AS "imageUrl", a.thumbnail_url AS "thumbnailUrl",
           a.image_focal_point AS "imageFocalPoint", a.category_id AS "categoryId",
           a.published_at AS "publishedAt", a.views, a.news_type AS "newsType",
           a.article_type AS "articleType"
    FROM articles a
    INNER JOIN article_tags at ON at.article_id = a.id
    INNER JOIN tags t ON t.id = at.tag_id
    WHERE a.status = 'published'
      AND t.status = 'active'
      AND (t.slug = ${keyword} OR t.name_ar = ${keyword})
    ORDER BY a.published_at DESC
    LIMIT 20
  `);

  let filteredArticles = (result as any).rows || result;

  // Fallback: many articles carry only free-text SEO keywords
  // (articles.seo->'keywords') with no matching row in the `tags` table.
  // The article page still renders those as clickable badges, so without
  // this lookup the keyword page comes back empty. Only runs when the
  // indexed tag join found nothing, keeping the common path fast.
  if (!filteredArticles || filteredArticles.length === 0) {
    // Fast path: GIN-indexed exact containment match (idx_articles_seo_keywords_gin).
    // Covers the common case where the SEO keyword is stored verbatim.
    const seoExact = await db.execute(sql`
      SELECT a.id, a.title, a.slug, a.english_slug AS "englishSlug",
             a.excerpt, a.image_url AS "imageUrl", a.thumbnail_url AS "thumbnailUrl",
             a.image_focal_point AS "imageFocalPoint", a.category_id AS "categoryId",
             a.published_at AS "publishedAt", a.views, a.news_type AS "newsType",
             a.article_type AS "articleType"
      FROM articles a
      WHERE a.status = 'published'
        AND (a.seo -> 'keywords') @> to_jsonb(${keyword}::text)
      ORDER BY a.published_at DESC
      LIMIT 20
    `);
    filteredArticles = (seoExact as any).rows || seoExact;

    // Last resort: case-insensitive scan, only when the indexed exact match
    // found nothing (rare — covers keywords stored in a different case).
    if (!filteredArticles || filteredArticles.length === 0) {
      let seoResult;
      try {
        seoResult = await executeWithStatementTimeout(sql`
          SELECT a.id, a.title, a.slug, a.english_slug AS "englishSlug",
                 a.excerpt, a.image_url AS "imageUrl", a.thumbnail_url AS "thumbnailUrl",
                 a.image_focal_point AS "imageFocalPoint", a.category_id AS "categoryId",
                 a.published_at AS "publishedAt", a.views, a.news_type AS "newsType",
                 a.article_type AS "articleType"
          FROM articles a
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
      filteredArticles = (seoResult as any).rows || seoResult;
    }
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
  const muqtarabTopics = (topicsResult as any).rows || topicsResult;

  return { articles: filteredArticles || [], muqtarabTopics: muqtarabTopics || [] };
}
