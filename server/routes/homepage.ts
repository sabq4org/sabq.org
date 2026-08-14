import { Router } from "express";
import { eq, and, or, desc, inArray, isNull, isNotNull, ne, aliasedTable, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { articles, categories, users, articlePolls } from "@shared/schema";
import { cacheControl, AUTOSCALE_CACHE } from "../cacheMiddleware";
import { CACHE_TTL, withSWR } from "../memoryCache";

const router: Router = Router();

/**
 * Detects an explicit "give me fresh data, skip the server cache" request.
 * The native iOS app's pull-to-refresh issues the request through an ephemeral
 * URLSession with cache-buster query params (`_t`/`_nc`) plus
 * `Cache-Control: no-cache, no-store`. Normal browser + CDN traffic never sets
 * these, so honoring them lets a deliberate refresh bypass the 10-min SWR
 * cache (and any stale autoscale pod) without weakening the cache that shields
 * the origin from the 2200-concurrent firehose.
 */
function wantsFreshFeed(req: any): boolean {
  if (req?.query?._nc !== undefined || req?.query?._t !== undefined) return true;
  const cc = String(req?.headers?.["cache-control"] ?? "").toLowerCase();
  return cc.includes("no-cache") || cc.includes("no-store");
}

router.get("/api/homepage", cacheControl(AUTOSCALE_CACHE.HOMEPAGE), async (req: any, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 50);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const cacheKey = `homepage:${limit}:${offset}`;
    const response = await withSWR(
      cacheKey,
      CACHE_TTL.HOMEPAGE,
      CACHE_TTL.HOMEPAGE * 2,
      async () => {
        const [
          heroArticles,
          personalizedArticles,
          breakingNews,
          editorPicks,
          deepDiveArticles,
          trendingTopics,
        ] = await Promise.all([
          storage.getHeroArticles(),
          storage.getAllPublishedArticles(limit, offset),
          storage.getBreakingNews(5),
          storage.getEditorPicks(6),
          storage.getDeepDiveArticles(6),
          storage.getTrendingTopics(),
        ]);

        const allArticles = [
          ...heroArticles,
          ...personalizedArticles,
          ...breakingNews,
          ...editorPicks,
          ...deepDiveArticles,
        ];
        const articleIds = allArticles.map((a) => a.id).filter(Boolean);

        let pollArticleIds = new Set<string>();
        if (articleIds.length > 0) {
          const activePolls = await db
            .select({ articleId: articlePolls.articleId })
            .from(articlePolls)
            .where(
              and(
                inArray(articlePolls.articleId, articleIds),
                eq(articlePolls.isActive, true)
              )
            );
          pollArticleIds = new Set(activePolls.map(p => p.articleId));
        }

        const addHasPollFlag = <T extends { id: string }>(items: T[]): (T & { hasPoll: boolean })[] => {
          return items.map(article => ({
            ...article,
            hasPoll: pollArticleIds.has(article.id),
          }));
        };

        return {
          hero: addHasPollFlag(heroArticles),
          forYou: addHasPollFlag(personalizedArticles),
          breaking: addHasPollFlag(breakingNews),
          editorPicks: addHasPollFlag(editorPicks),
          deepDive: addHasPollFlag(deepDiveArticles),
          trending: trendingTopics,
        };
      },
      wantsFreshFeed(req)
    );

    res.json(response);
  } catch (error) {
    console.error("Error fetching homepage data:", error);
    res.status(500).json({ message: "Failed to fetch homepage data" });
  }
});

// Homepage Lite - Optimized for 2200+ concurrent visitors
// Uses SWR (Stale-While-Revalidate) to prevent thundering herd
router.get("/api/homepage-lite", cacheControl(AUTOSCALE_CACHE.HOMEPAGE), async (req, res) => {
  try {
    const response = await withSWR(
      'homepage-lite',
      CACHE_TTL.HOMEPAGE,
      CACHE_TTL.HOMEPAGE * 2,
      async () => {
        const authorAlias = aliasedTable(users, 'author');
        const reporterAlias = aliasedTable(users, 'reporter');

        const minimalArticleSelect = {
          id: articles.id,
          title: articles.title,
          subtitle: articles.subtitle,
          slug: articles.slug,
          englishSlug: articles.englishSlug,
          excerpt: articles.excerpt,
          imageUrl: articles.imageUrl,
          imageFocalPoint: articles.imageFocalPoint,
          thumbnailUrl: articles.thumbnailUrl,
          categoryId: articles.categoryId,
          categoryName: categories.nameAr,
          publishedAt: articles.publishedAt,
          views: articles.views,
          newsType: articles.newsType,
          articleType: articles.articleType,
          isAiGeneratedThumbnail: articles.isAiGeneratedThumbnail,
          isAiGeneratedImage: articles.isAiGeneratedImage,
          infographicBannerUrl: articles.infographicBannerUrl,
          categoryColor: categories.color,
          isFeatured: articles.isFeatured,
          isReading: articles.isReading,
          authorName: authorAlias.firstName,
          authorAvatar: authorAlias.profileImageUrl,
          reporterName: reporterAlias.firstName,
          reporterAvatar: reporterAlias.profileImageUrl,
          seo: articles.seo,
        };

        const [heroResults, forYouResults, breakingResults, editorPicksResults, deepDiveResults, trendingTopics] = await Promise.all([
          db
            .select(minimalArticleSelect)
            .from(articles)
            .leftJoin(categories, eq(articles.categoryId, categories.id))
            .leftJoin(authorAlias, eq(articles.authorId, authorAlias.id))
            .leftJoin(reporterAlias, eq(articles.reporterId, reporterAlias.id))
            .where(
              and(
                eq(articles.status, 'published'),
                eq(articles.hideFromHomepage, false),
                or(
                  eq(articles.newsType, 'breaking'),
                  eq(articles.isFeatured, true)
                ),
                // استبعاد المحتوى المولّد آليًا من الكروسيل إلا إذا ميّزه
                // محرر صراحة — القرار البشري يتجاوز الفلتر الآلي
                or(
                  isNull(articles.aiGenerated),
                  eq(articles.aiGenerated, false),
                  eq(articles.isFeatured, true)
                )
              )
            )
            // ختم displayOrder = ثوانٍ يونكس لحظة التمييز/الترتيب من اللوحة،
            // لكن بعض مسارات التمييز (تطبيق iOS الإداري) لا تختم فيبقى صفرًا
            // ويغرق المقال تحت كل المختومين القدامى. GREATEST يجعل غير
            // المختوم يرتب بحداثة نشره/إنعاشه — نفس المقياس فلا يكسر ترتيب المحررين
            .orderBy(
              desc(sql`GREATEST(COALESCE(${articles.displayOrder}, 0), EXTRACT(EPOCH FROM COALESCE(${articles.resurfacedAt}, ${articles.publishedAt})))`),
              desc(sql`COALESCE(${articles.resurfacedAt}, ${articles.publishedAt})`)
            )
            .limit(5),

          db
            .select(minimalArticleSelect)
            .from(articles)
            .leftJoin(categories, eq(articles.categoryId, categories.id))
            .leftJoin(authorAlias, eq(articles.authorId, authorAlias.id))
            .leftJoin(reporterAlias, eq(articles.reporterId, reporterAlias.id))
            .where(
              and(
                eq(articles.status, 'published'),
                eq(articles.hideFromHomepage, false)
              )
            )
            // «إنعاش»: صدارة الموجز بوقت الإنعاش دون تغيير تاريخ النشر الظاهر
            .orderBy(desc(sql`COALESCE(${articles.resurfacedAt}, ${articles.publishedAt})`))
            .limit(28),

          db
            .select(minimalArticleSelect)
            .from(articles)
            .leftJoin(categories, eq(articles.categoryId, categories.id))
            .leftJoin(authorAlias, eq(articles.authorId, authorAlias.id))
            .leftJoin(reporterAlias, eq(articles.reporterId, reporterAlias.id))
            .where(
              and(
                eq(articles.status, 'published'),
                eq(articles.hideFromHomepage, false),
                eq(articles.newsType, 'breaking')
              )
            )
            .orderBy(desc(sql`COALESCE(${articles.resurfacedAt}, ${articles.publishedAt})`))
            .limit(5),

          db
            .select(minimalArticleSelect)
            .from(articles)
            .leftJoin(categories, eq(articles.categoryId, categories.id))
            .leftJoin(authorAlias, eq(articles.authorId, authorAlias.id))
            .leftJoin(reporterAlias, eq(articles.reporterId, reporterAlias.id))
            .where(
              and(
                eq(articles.status, 'published'),
                eq(articles.hideFromHomepage, false),
                or(
                  isNull(articles.articleType),
                  ne(articles.articleType, 'opinion')
                ),
                or(
                  isNull(articles.aiGenerated),
                  eq(articles.aiGenerated, false)
                )
              )
            )
            .orderBy(
              desc(articles.displayOrder),
              desc(sql`COALESCE(${articles.resurfacedAt}, ${articles.publishedAt})`),
              desc(articles.views),
            )
            .limit(6),

          db
            .select(minimalArticleSelect)
            .from(articles)
            .leftJoin(categories, eq(articles.categoryId, categories.id))
            .leftJoin(authorAlias, eq(articles.authorId, authorAlias.id))
            .leftJoin(reporterAlias, eq(articles.reporterId, reporterAlias.id))
            .where(
              and(
                eq(articles.status, 'published'),
                eq(articles.hideFromHomepage, false),
                isNotNull(articles.aiSummary),
                or(
                  isNull(articles.articleType),
                  ne(articles.articleType, 'opinion')
                ),
                or(
                  isNull(articles.aiGenerated),
                  eq(articles.aiGenerated, false)
                )
              )
            )
            .orderBy(
              desc(sql`COALESCE(${articles.resurfacedAt}, ${articles.publishedAt})`),
              desc(articles.views),
            )
            .limit(6),

          storage.getTrendingTopics(),
        ]);

        type ArticleRow = typeof heroResults[number];
        const formatArticle = (row: ArticleRow) => ({
          id: row.id,
          title: row.title,
          subtitle: row.subtitle,
          slug: row.slug,
          englishSlug: row.englishSlug,
          excerpt: row.excerpt,
          imageUrl: row.imageUrl,
          thumbnailUrl: row.thumbnailUrl,
          imageFocalPoint: row.imageFocalPoint,
          categoryId: row.categoryId,
          categoryName: row.categoryName,
          publishedAt: row.publishedAt,
          views: row.views,
          newsType: row.newsType,
          articleType: row.articleType,
          isAiGeneratedThumbnail: row.isAiGeneratedThumbnail,
          isAiGeneratedImage: row.isAiGeneratedImage,
          infographicBannerUrl: row.infographicBannerUrl,
          category: row.categoryName ? { nameAr: row.categoryName, color: row.categoryColor } : null,
          isFeatured: row.isFeatured,
          isReading: row.isReading || false,
          authorName: row.reporterName || row.authorName,
          authorAvatar: row.reporterAvatar || row.authorAvatar,
          keywords: (row.seo as { keywords?: string[] } | null)?.keywords || [],
        });

        return {
          hero: heroResults.map(formatArticle),
          forYou: forYouResults.map(formatArticle),
          breaking: breakingResults.map(formatArticle),
          editorPicks: editorPicksResults.map(formatArticle),
          deepDive: deepDiveResults.map(formatArticle),
          trending: trendingTopics,
        };
      },
      wantsFreshFeed(req)
    );

    res.json(response);
  } catch (error) {
    console.error('[Homepage Lite] Error:', error);
    res.status(500).json({ error: 'Failed to fetch homepage lite data' });
  }
});

export default router;
