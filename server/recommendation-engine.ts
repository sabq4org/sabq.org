import { db } from "./db";
import {
  articles,
  categories,
  userInterests,
  userActivitySummary,
  readingHistory,
  reactions,
  comments,
} from "@shared/schema";
import { eq, desc, and, sql, inArray, gte, notInArray, ne, count } from "drizzle-orm";

export interface RecommendedArticle {
  articleId: string;
  score: number;
  reasons: string[];
  article?: {
    id: string;
    title: string;
    excerpt: string | null;
    imageUrl: string | null;
    thumbnailUrl: string | null;
    infographicBannerUrl: string | null;
    imageFocalPoint: { x: number; y: number } | null;
    publishedAt: Date | null;
    slug: string;
    articleType?: string | null;
    category?: {
      id: string;
      nameAr: string | null;
      slug: string | null;
    };
  };
}

interface RuleBasedScore {
  articleId: string;
  score: number;
  reasons: string[];
}

interface CollaborativeScore {
  articleId: string;
  score: number;
  similarUserCount: number;
}

interface TrendingScore {
  articleId: string;
  score: number;
  engagementMetrics: {
    views: number;
    reactions: number;
    comments: number;
  };
}

export class HybridRecommendationEngine {
  private readonly RULE_BASED_WEIGHT = 0.4;
  private readonly COLLABORATIVE_WEIGHT = 0.3;
  private readonly TRENDING_WEIGHT = 0.3;

  async getRecommendations(
    userId: string,
    limit: number = 10
  ): Promise<RecommendedArticle[]> {
    const [readArticleIds, ruleBasedScores, collaborativeScores, trendingScores] =
      await Promise.all([
        this.getReadArticleIds(userId),
        this.getRuleBasedScores(userId),
        this.getCollaborativeScores(userId),
        this.getTrendingScores(),
      ]);

    const readSet = new Set(readArticleIds);

    const scoreMap = new Map<
      string,
      {
        ruleScore: number;
        collabScore: number;
        trendingScore: number;
        reasons: string[];
      }
    >();

    ruleBasedScores.forEach((item) => {
      if (readSet.has(item.articleId)) return;
      scoreMap.set(item.articleId, {
        ruleScore: item.score,
        collabScore: 0,
        trendingScore: 0,
        reasons: item.reasons,
      });
    });

    collaborativeScores.forEach((item) => {
      if (readSet.has(item.articleId)) return;
      const existing = scoreMap.get(item.articleId);
      if (existing) {
        existing.collabScore = item.score;
        existing.reasons.push(
          `يقرأه ${item.similarUserCount} مستخدمين مشابهين لك`
        );
      } else {
        scoreMap.set(item.articleId, {
          ruleScore: 0,
          collabScore: item.score,
          trendingScore: 0,
          reasons: [`يقرأه ${item.similarUserCount} مستخدمين مشابهين لك`],
        });
      }
    });

    trendingScores.forEach((item) => {
      if (readSet.has(item.articleId)) return;
      const existing = scoreMap.get(item.articleId);
      if (existing) {
        existing.trendingScore = item.score;
        if (item.score > 0.5) {
          existing.reasons.push("رائج الآن");
        }
      } else {
        scoreMap.set(item.articleId, {
          ruleScore: 0,
          collabScore: 0,
          trendingScore: item.score,
          reasons: item.score > 0.5 ? ["رائج الآن"] : [],
        });
      }
    });

    const scoredArticles: RecommendedArticle[] = [];

    scoreMap.forEach((scores, articleId) => {
      const finalScore =
        scores.ruleScore * this.RULE_BASED_WEIGHT +
        scores.collabScore * this.COLLABORATIVE_WEIGHT +
        scores.trendingScore * this.TRENDING_WEIGHT;

      if (scores.reasons.length === 0) {
        scores.reasons.push("مقترح لك");
      }

      scoredArticles.push({
        articleId,
        score: finalScore,
        reasons: scores.reasons,
      });
    });

    scoredArticles.sort((a, b) => b.score - a.score);

    const topArticles = scoredArticles.slice(0, limit);

    if (topArticles.length === 0) {
      return [];
    }

    const articleIds = topArticles.map((a) => a.articleId);
    const articlesData = await db
      .select({
        id: articles.id,
        title: articles.title,
        excerpt: articles.excerpt,
        imageUrl: articles.imageUrl,
        thumbnailUrl: articles.thumbnailUrl,
        infographicBannerUrl: articles.infographicBannerUrl,
        imageFocalPoint: articles.imageFocalPoint,
        articleType: articles.articleType,
        publishedAt: articles.publishedAt,
        slug: articles.slug,
        categoryId: categories.id,
        categoryName: categories.nameAr,
        categorySlug: categories.slug,
      })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .where(
        and(inArray(articles.id, articleIds), eq(articles.status, "published"))
      );

    const articleMap = new Map(articlesData.map((a) => [a.id, a]));

    return topArticles
      .map((rec) => {
        const article = articleMap.get(rec.articleId);
        if (!article) return null;

        // Parse and normalize imageFocalPoint - handle null, string, or object
        let normalizedFocalPoint: { x: number; y: number } | null = null;
        if (article.imageFocalPoint) {
          try {
            const fp = typeof article.imageFocalPoint === 'string'
              ? JSON.parse(article.imageFocalPoint)
              : article.imageFocalPoint;
            if (fp && typeof fp.x === 'number' && typeof fp.y === 'number') {
              normalizedFocalPoint = { x: fp.x, y: fp.y };
            }
          } catch {
            // Invalid JSON, use null
          }
        }

        return {
          ...rec,
          article: {
            id: article.id,
            title: article.title,
            excerpt: article.excerpt,
            imageUrl: article.imageUrl,
            thumbnailUrl: article.thumbnailUrl,
            infographicBannerUrl: article.infographicBannerUrl,
            imageFocalPoint: normalizedFocalPoint,
            articleType: article.articleType,
            publishedAt: article.publishedAt,
            slug: article.slug,
            category: article.categoryId
              ? {
                  id: article.categoryId,
                  nameAr: article.categoryName,
                  slug: article.categorySlug,
                }
              : undefined,
          },
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null) as RecommendedArticle[];
  }

  private async getReadArticleIds(userId: string): Promise<string[]> {
    const history = await db
      .select({ articleId: readingHistory.articleId })
      .from(readingHistory)
      .where(eq(readingHistory.userId, userId))
      .limit(500);

    return history.map((h) => h.articleId);
  }

  private async getRuleBasedScores(userId: string): Promise<RuleBasedScore[]> {
    const [explicitInterests, activitySummary] = await Promise.all([
      db
        .select({
          categoryId: userInterests.categoryId,
          weight: userInterests.weight,
        })
        .from(userInterests)
        .where(eq(userInterests.userId, userId)),
      db.query.userActivitySummary.findFirst({
        where: eq(userActivitySummary.userId, userId),
      }),
    ]);

    const categoryWeights = new Map<string, { weight: number; isExplicit: boolean }>();

    explicitInterests.forEach((interest) => {
      categoryWeights.set(interest.categoryId, {
        weight: interest.weight,
        isExplicit: true,
      });
    });

    if (activitySummary?.topCategories) {
      const topCats = activitySummary.topCategories as Array<{
        categoryId: string;
        count: number;
        weight: number;
      }>;
      topCats.forEach((cat) => {
        const existing = categoryWeights.get(cat.categoryId);
        if (existing) {
          existing.weight = Math.max(existing.weight, cat.weight * 0.8);
        } else {
          categoryWeights.set(cat.categoryId, {
            weight: cat.weight * 0.8,
            isExplicit: false,
          });
        }
      });
    }

    if (categoryWeights.size === 0) {
      return [];
    }

    const categoryIds = Array.from(categoryWeights.keys());
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const candidateArticles = await db
      .select({
        id: articles.id,
        categoryId: articles.categoryId,
        publishedAt: articles.publishedAt,
        categoryName: categories.nameAr,
      })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .where(
        and(
          eq(articles.status, "published"),
          inArray(articles.categoryId, categoryIds),
          gte(articles.publishedAt, sevenDaysAgo)
        )
      )
      .orderBy(desc(articles.publishedAt))
      .limit(100);

    return candidateArticles.map((article) => {
      const catInfo = categoryWeights.get(article.categoryId || "");
      let score = catInfo?.weight || 0.5;

      const reasons: string[] = [];

      if (catInfo?.isExplicit) {
        reasons.push(`من اهتماماتك: ${article.categoryName || "قسم"}`);
      } else if (catInfo) {
        reasons.push(`يتناسب مع أنماط قراءتك`);
      }

      if (article.publishedAt) {
        const publishedDate = new Date(article.publishedAt);
        if (publishedDate >= twentyFourHoursAgo) {
          score *= 1.5;
          reasons.push("جديد اليوم");
        } else if (publishedDate >= sevenDaysAgo) {
          score *= 1.2;
        }
      }

      return {
        articleId: article.id,
        score: Math.min(score, 1),
        reasons,
      };
    });
  }

  private async getCollaborativeScores(
    userId: string
  ): Promise<CollaborativeScore[]> {
    const userHistory = await db
      .select({ articleId: readingHistory.articleId })
      .from(readingHistory)
      .where(eq(readingHistory.userId, userId))
      .limit(100);

    if (userHistory.length < 3) {
      return [];
    }

    const userArticleIds = new Set(userHistory.map((h) => h.articleId));

    const similarUsers = await db
      .select({
        otherUserId: readingHistory.userId,
        sharedCount: count(readingHistory.articleId),
      })
      .from(readingHistory)
      .where(
        and(
          ne(readingHistory.userId, userId),
          inArray(
            readingHistory.articleId,
            Array.from(userArticleIds)
          )
        )
      )
      .groupBy(readingHistory.userId)
      .having(sql`count(${readingHistory.articleId}) >= 3`)
      .orderBy(desc(count(readingHistory.articleId)))
      .limit(20);

    if (similarUsers.length === 0) {
      return [];
    }

    const similarUserIds = similarUsers.map((u) => u.otherUserId);

    const similarUsersArticles = await db
      .select({
        articleId: readingHistory.articleId,
        userCount: count(readingHistory.userId),
      })
      .from(readingHistory)
      .where(
        and(
          inArray(readingHistory.userId, similarUserIds),
          notInArray(readingHistory.articleId, Array.from(userArticleIds))
        )
      )
      .groupBy(readingHistory.articleId)
      .orderBy(desc(count(readingHistory.userId)))
      .limit(50);

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const recentArticleIds = similarUsersArticles.map((a) => a.articleId);
    if (recentArticleIds.length === 0) return [];

    const recentArticles = await db
      .select({ id: articles.id })
      .from(articles)
      .where(
        and(
          inArray(articles.id, recentArticleIds),
          eq(articles.status, "published"),
          gte(articles.publishedAt, sevenDaysAgo)
        )
      );

    const recentSet = new Set(recentArticles.map((a) => a.id));
    const maxUserCount = Math.max(
      ...similarUsersArticles.map((a) => Number(a.userCount)),
      1
    );

    return similarUsersArticles
      .filter((a) => recentSet.has(a.articleId))
      .map((article) => {
        const jaccardApprox =
          Number(article.userCount) / (userHistory.length + Number(article.userCount));

        return {
          articleId: article.articleId,
          score: jaccardApprox,
          similarUserCount: Number(article.userCount),
        };
      });
  }

  private async getTrendingScores(): Promise<TrendingScore[]> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const trendingArticles = await db
      .select({
        id: articles.id,
        views: articles.views,
        publishedAt: articles.publishedAt,
      })
      .from(articles)
      .where(
        and(
          eq(articles.status, "published"),
          gte(articles.publishedAt, sevenDaysAgo)
        )
      )
      .orderBy(desc(articles.views))
      .limit(100);

    if (trendingArticles.length === 0) {
      return [];
    }

    const articleIds = trendingArticles.map((a) => a.id);

    const [reactionCounts, commentCounts] = await Promise.all([
      db
        .select({
          articleId: reactions.articleId,
          count: count(reactions.id),
        })
        .from(reactions)
        .where(inArray(reactions.articleId, articleIds))
        .groupBy(reactions.articleId),
      db
        .select({
          articleId: comments.articleId,
          count: count(comments.id),
        })
        .from(comments)
        .where(inArray(comments.articleId, articleIds))
        .groupBy(comments.articleId),
    ]);

    const reactionMap = new Map(
      reactionCounts.map((r) => [r.articleId, Number(r.count)])
    );
    const commentMap = new Map(
      commentCounts.map((c) => [c.articleId, Number(c.count)])
    );

    const maxViews = Math.max(...trendingArticles.map((a) => a.views || 0), 1);
    const maxReactions = Math.max(...Array.from(reactionMap.values()), 1);
    const maxComments = Math.max(...Array.from(commentMap.values()), 1);

    return trendingArticles.map((article) => {
      const views = article.views || 0;
      const reactionCount = reactionMap.get(article.id) || 0;
      const commentCount = commentMap.get(article.id) || 0;

      let engagementScore =
        0.5 * (views / maxViews) +
        0.3 * (reactionCount / maxReactions) +
        0.2 * (commentCount / maxComments);

      if (article.publishedAt) {
        const publishedDate = new Date(article.publishedAt);
        if (publishedDate >= oneHourAgo) {
          engagementScore *= 1.5;
        } else {
          const hoursAgo =
            (now.getTime() - publishedDate.getTime()) / (1000 * 60 * 60);
          const decay = 1 / Math.log2(hoursAgo + 2);
          engagementScore *= decay;
        }
      }

      return {
        articleId: article.id,
        score: Math.min(engagementScore, 1),
        engagementMetrics: {
          views,
          reactions: reactionCount,
          comments: commentCount,
        },
      };
    });
  }
}

export const hybridRecommendationEngine = new HybridRecommendationEngine();
