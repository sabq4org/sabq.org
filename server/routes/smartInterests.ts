import { Router } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { isAuthenticated } from "../auth";
import { requireAuth } from "../rbac";
import { articles, categories, userInterests, userEvents } from "@shared/schema";

const router: Router = Router();

// Analyze user interests from behavior
router.get("/api/interests/analyze", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const days = req.query.days ? parseInt(req.query.days as string) : 7;

    if (isNaN(days) || days < 1 || days > 365) {
      return res.status(400).json({ message: "معامل الأيام يجب أن يكون بين 1 و 365" });
    }

    const analysis = await storage.analyzeUserInterestsFromBehavior(userId, days);

    const totalCategories = analysis.length;
    const avgWeight = totalCategories > 0
      ? Math.round((analysis.reduce((sum, item) => sum + item.suggestedWeight, 0) / totalCategories) * 10) / 10
      : 0;

    res.json({
      analysis,
      summary: {
        totalCategories,
        avgWeight,
      },
    });
  } catch (error) {
    console.error("Error analyzing user interests:", error);
    res.status(500).json({ message: "فشل في تحليل الاهتمامات" });
  }
});

// Update user interests automatically based on behavior
router.post("/api/interests/update-weights", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { days } = req.body;

    const daysToUse = days !== undefined ? parseInt(days) : 7;
    if (isNaN(daysToUse) || daysToUse < 1 || daysToUse > 365) {
      return res.status(400).json({ message: "معامل الأيام يجب أن يكون بين 1 و 365" });
    }

    const summary = await storage.updateUserInterestsAutomatically(userId, daysToUse);

    res.json({
      success: true,
      summary,
    });
  } catch (error) {
    console.error("Error updating user interests:", error);
    res.status(500).json({ message: "فشل في تحديث الاهتمامات تلقائياً" });
  }
});

// Get personalized feed for user based on interests weights
router.get("/api/personal-feed", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

    if (isNaN(limit) || limit < 1 || limit > 50) {
      return res.status(400).json({ message: "معامل العدد يجب أن يكون بين 1 و 50" });
    }

    const articlesResult = await storage.getPersonalizedFeed(userId, limit);

    res.json({
      articles: articlesResult,
      count: articlesResult.length,
    });
  } catch (error) {
    console.error("Error getting personalized feed:", error);
    res.status(500).json({ message: "فشل في جلب التوصيات المخصصة" });
  }
});

// Get daily brief - personalized news summary for today/yesterday
router.get("/api/daily-brief", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.id;

    const userInterestsList = await db
      .select({
        categoryId: userInterests.categoryId,
        weight: userInterests.weight,
        categoryNameAr: categories.nameAr,
        categoryNameEn: categories.nameEn,
        categorySlug: categories.slug,
      })
      .from(userInterests)
      .innerJoin(categories, eq(userInterests.categoryId, categories.id))
      .where(eq(userInterests.userId, userId));

    if (userInterestsList.length === 0) {
      return res.json({
        hasInterests: false,
        categories: [],
        totalArticles: 0,
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const briefByCategory = await Promise.all(
      userInterestsList.map(async (interest) => {
        const categoryArticles = await db
          .select({
            id: articles.id,
            title: articles.title,
            subtitle: articles.subtitle,
            slug: articles.slug,
            excerpt: articles.excerpt,
            content: articles.content,
            imageUrl: articles.imageUrl,
            imageFocalPoint: articles.imageFocalPoint,
            publishedAt: articles.publishedAt,
            categoryId: articles.categoryId,
          })
          .from(articles)
          .where(
            and(
              eq(articles.categoryId, interest.categoryId),
              eq(articles.status, "published"),
              eq(articles.hideFromHomepage, false),
              sql`${articles.publishedAt} >= ${yesterday}`
            )
          )
          .orderBy(desc(articles.publishedAt))
          .limit(5);

        return {
          categoryId: interest.categoryId,
          categoryNameAr: interest.categoryNameAr,
          categoryNameEn: interest.categoryNameEn,
          categorySlug: interest.categorySlug,
          weight: interest.weight,
          articles: categoryArticles,
          articleCount: categoryArticles.length,
        };
      })
    );

    const totalArticles = briefByCategory.reduce((sum, cat) => sum + cat.articleCount, 0);
    const estimatedReadingTime = Math.ceil(totalArticles * 2);

    res.json({
      hasInterests: true,
      categories: briefByCategory,
      totalArticles,
      estimatedReadingTime,
      dateRange: {
        from: yesterday.toISOString(),
        to: today.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error getting daily brief:", error);
    res.status(500).json({ message: "فشل في جلب الملخص اليومي" });
  }
});

// AI Daily Summary - Comprehensive 24h activity analysis
router.get("/api/ai/daily-summary", requireAuth, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const previous24h = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    const todayEvents = await db
      .select({
        id: userEvents.id,
        articleId: userEvents.articleId,
        eventType: userEvents.eventType,
        eventValue: userEvents.eventValue,
        metadata: userEvents.metadata,
        createdAt: userEvents.createdAt,
        categoryId: articles.categoryId,
        categoryNameAr: categories.nameAr,
        articleTitle: articles.title,
        articleSlug: articles.slug,
      })
      .from(userEvents)
      .leftJoin(articles, eq(userEvents.articleId, articles.id))
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .where(
        and(
          eq(userEvents.userId, userId),
          sql`${userEvents.createdAt} >= ${last24h.toISOString()}`
        )
      )
      .orderBy(desc(userEvents.createdAt));

    if (todayEvents.length === 0) {
      return res.status(404).json({
        message: "لا توجد نشاطات في آخر 24 ساعة",
        hasActivity: false,
      });
    }

    const yesterdayEvents = await db
      .select({
        eventType: userEvents.eventType,
        articleId: userEvents.articleId,
      })
      .from(userEvents)
      .where(
        and(
          eq(userEvents.userId, userId),
          sql`${userEvents.createdAt} >= ${previous24h.toISOString()}`,
          sql`${userEvents.createdAt} < ${last24h.toISOString()}`
        )
      );

    const readEvents = todayEvents.filter(e => e.eventType === 'read');
    const uniqueArticlesRead = new Set(readEvents.map(e => e.articleId)).size;

    const totalReadingTimeSeconds = readEvents.reduce((sum, event) => {
      const duration = (event.metadata as any)?.readDuration || 0;
      return sum + duration;
    }, 0);
    const totalReadingTimeMinutes = Math.round(totalReadingTimeSeconds / 60);

    const categoryCounts = todayEvents.reduce((acc, event) => {
      if (event.categoryNameAr) {
        acc[event.categoryNameAr] = (acc[event.categoryNameAr] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    const topCategories = Object.entries(categoryCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 2)
      .map(([name]) => name);

    const avgScrollDepth = readEvents.reduce((sum, event) => {
      const scrollDepth = (event.metadata as any)?.scrollDepth || 0;
      return sum + scrollDepth;
    }, 0) / (readEvents.length || 1);

    const avgReadDuration = totalReadingTimeSeconds / (readEvents.length || 1);

    let readingMood = "فضولي";
    if (avgScrollDepth > 80 && avgReadDuration > 120) {
      readingMood = "تحليلي";
    } else if (avgScrollDepth < 40 && avgReadDuration < 60) {
      readingMood = "سريع";
    } else if (avgScrollDepth > 60 && todayEvents.filter(e => e.eventType === 'comment').length > 2) {
      readingMood = "نقدي";
    }

    const personalizedGreeting = {
      userName: user.firstName || user.email.split('@')[0],
      articlesReadToday: uniqueArticlesRead,
      readingTimeMinutes: totalReadingTimeMinutes,
      topCategories,
      readingMood,
    };

    const articlesBookmarked = todayEvents.filter(e => e.eventType === 'save').length;
    const articlesLiked = todayEvents.filter(e => e.eventType === 'like').length;
    const commentsPosted = todayEvents.filter(e => e.eventType === 'comment').length;

    const completionRate = Math.round(avgScrollDepth);

    const yesterdayReadCount = new Set(
      yesterdayEvents.filter(e => e.eventType === 'read').map(e => e.articleId)
    ).size;

    const percentChangeFromYesterday = yesterdayReadCount > 0
      ? Math.round(((uniqueArticlesRead - yesterdayReadCount) / yesterdayReadCount) * 100)
      : 100;

    const metrics = {
      articlesRead: uniqueArticlesRead,
      readingTimeMinutes: totalReadingTimeMinutes,
      completionRate,
      articlesBookmarked,
      articlesLiked,
      commentsPosted,
      percentChangeFromYesterday,
    };

    const categoryAnalysis = Object.entries(categoryCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([name, count]) => ({
        name,
        count,
      }));

    const allTitles = todayEvents
      .filter(e => e.articleTitle)
      .map(e => e.articleTitle!);

    const topicWords = allTitles
      .join(' ')
      .split(/\s+/)
      .filter(word => word.length > 4)
      .reduce((acc, word) => {
        acc[word] = (acc[word] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    const topicsThatCatchAttention = Object.entries(topicWords)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([word]) => word);

    const userCategoryIds = Array.from(new Set(
      todayEvents.filter(e => e.categoryId).map(e => e.categoryId!)
    ));

    const suggestedArticlesData = userCategoryIds.length > 0
      ? await db
          .select({
            id: articles.id,
            title: articles.title,
            subtitle: articles.subtitle,
            slug: articles.slug,
            englishSlug: articles.englishSlug,
            categoryNameAr: categories.nameAr,
            imageUrl: articles.imageUrl,
            imageFocalPoint: articles.imageFocalPoint,
          })
          .from(articles)
          .leftJoin(categories, eq(articles.categoryId, categories.id))
          .where(
            and(
              eq(articles.status, 'published'),
              sql`${articles.categoryId} IN (${sql.join(userCategoryIds, sql`, `)})`
            )
          )
          .orderBy(desc(articles.publishedAt))
          .limit(3)
      : [];

    const suggestedArticles = suggestedArticlesData.map((article) => ({
      id: article.id,
      title: article.title,
      slug: article.slug,
      englishSlug: article.englishSlug || undefined,
      category: article.categoryNameAr || '',
      imageUrl: article.imageUrl,
    }));

    const interestAnalysis = {
      topCategories: categoryAnalysis,
      topicsThatCatchAttention,
      suggestedArticles,
    };

    const hourlyActivity = new Array(24).fill(0);
    todayEvents.forEach(event => {
      const hour = new Date(event.createdAt).getHours();
      hourlyActivity[hour]++;
    });

    const hourlyBreakdown = hourlyActivity.map((count, hour) => ({
      hour,
      count,
    }));

    const peakReadingTime = hourlyActivity.indexOf(Math.max(...hourlyActivity));
    const nonZeroHours = hourlyActivity.filter(count => count > 0);
    const lowActivityPeriod = nonZeroHours.length > 0
      ? hourlyActivity.indexOf(Math.min(...nonZeroHours.filter(h => h > 0)))
      : 0;

    let aiSuggestion = "استمر في القراءة المنتظمة!";
    if (peakReadingTime >= 20 || peakReadingTime <= 5) {
      aiSuggestion = "تفضل القراءة ليلاً، جرّب القراءة في الصباح لتنوع أكثر";
    } else if (uniqueArticlesRead < 3) {
      aiSuggestion = "حاول قراءة 3 مقالات يومياً لتحسين معرفتك";
    } else if (topCategories.length < 2) {
      aiSuggestion = "جرّب قراءة مقالات من تصنيفات جديدة لتوسيع اهتماماتك";
    }

    const timeActivity = {
      hourlyBreakdown,
      peakReadingTime,
      lowActivityPeriod,
      aiSuggestion,
    };

    let dailyGoal = "اقرأ 3 مقالات من تصنيف لم تزره منذ أسبوع";

    if (uniqueArticlesRead >= 5) {
      dailyGoal = "أنت قارئ نشط! جرّب التعليق على مقال لمشاركة رأيك";
    } else if (articlesBookmarked > articlesLiked) {
      dailyGoal = "لديك الكثير من المقالات المحفوظة، خصص وقتاً لقراءتها";
    }

    const focusScore = Math.round(
      (completionRate * 0.6) + (Math.min(avgReadDuration / 180, 1) * 40)
    );

    const aiInsights = {
      readingMood,
      dailyGoal,
      focusScore,
    };

    res.json({
      hasActivity: true,
      personalizedGreeting,
      metrics,
      interestAnalysis,
      timeActivity,
      aiInsights,
      generatedAt: now.toISOString(),
    });
  } catch (error) {
    console.error("Error generating daily summary:", error);
    res.status(500).json({ message: "فشل في إنشاء الملخص اليومي" });
  }
});

export default router;
