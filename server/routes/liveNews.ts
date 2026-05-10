import { Router } from "express";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "../db";
import { cacheControl } from "../cacheMiddleware";
import { articles, categories, comments } from "@shared/schema";

const router: Router = Router();

// GET /api/live/updates - Get live news updates (published & updated articles)
router.get("/api/live/updates", cacheControl({ maxAge: 30, staleWhileRevalidate: 60 }), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 20);
    const cursor = req.query.cursor as string | undefined;
    const filter = req.query.filter as string | undefined;

    const whereConditions = [
      sql`${articles.status} = 'published'`,
      sql`${articles.publishedAt} IS NOT NULL`,
    ];

    if (filter === "breaking") {
      whereConditions.push(sql`${articles.newsType} = 'breaking'`);
    }

    if (cursor) {
      whereConditions.push(sql`${articles.publishedAt} < ${cursor}::timestamp`);
    }

    const results = await db
      .select({
        id: articles.id,
        title: articles.title,
        subtitle: articles.subtitle,
        slug: articles.slug,
        imageUrl: articles.imageUrl,
        imageFocalPoint: articles.imageFocalPoint,
        publishedAt: articles.publishedAt,
        updatedAt: articles.updatedAt,
        newsType: articles.newsType,
        categoryId: articles.categoryId,
        categoryNameAr: categories.nameAr,
        viewsCount: articles.views,
        content: articles.content,
      })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .where(and(...whereConditions))
      .orderBy(desc(articles.publishedAt))
      .limit(limit + 1);

    const articleIds = results.slice(0, limit).map(r => r.id);
    let commentsCountMap: Record<string, number> = {};

    if (articleIds.length > 0) {
      const commentsCounts = await db
        .select({
          articleId: comments.articleId,
          count: sql<number>`count(*)::int`,
        })
        .from(comments)
        .where(
          and(
            inArray(comments.articleId, articleIds),
            eq(comments.status, "approved")
          )
        )
        .groupBy(comments.articleId);

      commentsCountMap = Object.fromEntries(
        commentsCounts.map(c => [c.articleId, c.count])
      );
    }

    const hasMore = results.length > limit;
    const items = results.slice(0, limit);

    const formattedItems = items.map((item) => ({
      id: item.id,
      title: item.title,
      slug: item.slug,
      imageUrl: item.imageUrl || null,
      imageFocalPoint: item.imageFocalPoint || null,
      publishedAt: item.publishedAt?.toISOString() || "",
      updatedAt: item.updatedAt?.toISOString() || "",
      isBreaking: item.newsType === "breaking",
      categoryId: item.categoryId || "",
      categoryNameAr: item.categoryNameAr || "غير مصنف",
      viewsCount: item.viewsCount || 0,
      commentsCount: commentsCountMap[item.id] || 0,
      summary: item.content
        ? item.content.replace(/<[^>]*>/g, "").substring(0, 150) + "..."
        : "",
    }));

    const nextCursor =
      hasMore && items.length > 0 && items[items.length - 1].publishedAt
        ? items[items.length - 1].publishedAt?.toISOString()
        : null;

    res.json({
      items: formattedItems,
      nextCursor,
    });
  } catch (error) {
    console.error("Error fetching live updates:", error);
    res.status(500).json({ message: "Failed to fetch live updates" });
  }
});

// GET /api/live/breaking - Get latest 5 breaking news
router.get("/api/live/breaking", async (req, res) => {
  try {
    const results = await db
      .select({
        id: articles.id,
        title: articles.title,
        subtitle: articles.subtitle,
        slug: articles.slug,
        imageUrl: articles.imageUrl,
        imageFocalPoint: articles.imageFocalPoint,
        publishedAt: articles.publishedAt,
        updatedAt: articles.updatedAt,
        newsType: articles.newsType,
        categoryId: articles.categoryId,
        categoryNameAr: categories.nameAr,
        viewsCount: articles.views,
        content: articles.content,
      })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .where(
        and(
          eq(articles.newsType, "breaking"),
          eq(articles.status, "published"),
          eq(articles.hideFromHomepage, false),
          isNotNull(articles.publishedAt)
        )
      )
      .orderBy(desc(articles.publishedAt))
      .limit(5);

    const articleIds = results.map(r => r.id);
    let commentsCountMap: Record<string, number> = {};

    if (articleIds.length > 0) {
      const commentsCounts = await db
        .select({
          articleId: comments.articleId,
          count: sql<number>`count(*)::int`,
        })
        .from(comments)
        .where(
          and(
            inArray(comments.articleId, articleIds),
            eq(comments.status, "approved")
          )
        )
        .groupBy(comments.articleId);

      commentsCountMap = Object.fromEntries(
        commentsCounts.map(c => [c.articleId, c.count])
      );
    }

    const formattedItems = results.map((item) => ({
      id: item.id,
      title: item.title,
      slug: item.slug,
      imageUrl: item.imageUrl || null,
      imageFocalPoint: item.imageFocalPoint || null,
      publishedAt: item.publishedAt?.toISOString() || "",
      updatedAt: item.updatedAt?.toISOString() || "",
      isBreaking: true,
      categoryId: item.categoryId || "",
      categoryNameAr: item.categoryNameAr || "غير مصنف",
      viewsCount: item.viewsCount || 0,
      commentsCount: commentsCountMap[item.id] || 0,
      summary: item.content
        ? item.content.replace(/<[^>]*>/g, "").substring(0, 150) + "..."
        : "",
    }));

    res.json({
      items: formattedItems,
    });
  } catch (error) {
    console.error("Error fetching breaking news:", error);
    res.status(500).json({ message: "Failed to fetch breaking news" });
  }
});

export default router;
