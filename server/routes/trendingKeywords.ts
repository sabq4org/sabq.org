import { Router } from "express";
import { and, eq, gte, inArray } from "drizzle-orm";
import { db } from "../db";
import { cacheControl, CACHE_DURATIONS } from "../cacheMiddleware";
import { memoryCache } from "../memoryCache";
import { articles, categories } from "@shared/schema";

const router: Router = Router();

router.get("/api/trending-keywords", cacheControl({ maxAge: CACHE_DURATIONS.MEDIUM, staleWhileRevalidate: CACHE_DURATIONS.MEDIUM }), async (req, res) => {
  try {
    const cacheKey = 'trending:keywords';
    const cached = memoryCache.get<any>(cacheKey);
    if (cached !== null) {
      return res.json(cached);
    }

    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const recentArticles = await db
      .select({
        seo: articles.seo,
        categoryId: articles.categoryId,
      })
      .from(articles)
      .where(
        and(
          eq(articles.status, "published"),
          eq(articles.hideFromHomepage, false),
          gte(articles.publishedAt, oneDayAgo)
        )
      );

    const keywordMap = new Map<string, { count: number; categoryIds: string[] }>();

    for (const article of recentArticles) {
      const keywords = article.seo?.keywords;
      if (!keywords || !Array.isArray(keywords)) continue;

      for (const keyword of keywords) {
        if (!keyword || typeof keyword !== 'string') continue;

        const trimmedKeyword = keyword.trim();
        if (!trimmedKeyword) continue;

        const existing = keywordMap.get(trimmedKeyword);
        if (existing) {
          existing.count++;
          if (article.categoryId) {
            existing.categoryIds.push(article.categoryId);
          }
        } else {
          keywordMap.set(trimmedKeyword, {
            count: 1,
            categoryIds: article.categoryId ? [article.categoryId] : [],
          });
        }
      }
    }

    const keywordStats = Array.from(keywordMap.entries()).map(([keyword, data]) => {
      let mostCommonCategoryId: string | null = null;

      if (data.categoryIds.length > 0) {
        const categoryCounts = new Map<string, number>();
        for (const catId of data.categoryIds) {
          categoryCounts.set(catId, (categoryCounts.get(catId) || 0) + 1);
        }

        let maxCount = 0;
        for (const [catId, count] of Array.from(categoryCounts.entries())) {
          if (count > maxCount) {
            maxCount = count;
            mostCommonCategoryId = catId;
          }
        }
      }

      return {
        keyword,
        count: data.count,
        categoryId: mostCommonCategoryId,
      };
    });

    keywordStats.sort((a, b) => b.count - a.count);
    const top15 = keywordStats.slice(0, 15);

    const categoryIds = top15
      .map(k => k.categoryId)
      .filter((id): id is string => id !== null);

    const uniqueCategoryIds = Array.from(new Set(categoryIds));

    const categoriesData = uniqueCategoryIds.length > 0
      ? await db
          .select({
            id: categories.id,
            nameAr: categories.nameAr,
          })
          .from(categories)
          .where(inArray(categories.id, uniqueCategoryIds))
      : [];

    const categoryMap = new Map(categoriesData.map(c => [c.id, c.nameAr]));

    const trendingKeywords = top15.map(item => ({
      keyword: item.keyword,
      count: item.count,
      category: item.categoryId ? categoryMap.get(item.categoryId) : undefined,
    }));

    memoryCache.set(cacheKey, trendingKeywords, 60000);
    res.json(trendingKeywords);
  } catch (error) {
    console.error("Error fetching trending keywords:", error);
    res.status(500).json({ message: "Failed to fetch trending keywords" });
  }
});

export default router;
