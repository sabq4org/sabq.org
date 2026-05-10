import { db } from "../db";
import { 
  articles, 
  reactions, 
  bookmarks, 
  readingHistory,
  articleImpressions,
  feedRecommendations,
  categories,
} from "@shared/schema";
import { eq, desc, and, inArray, sql, gte, notInArray } from "drizzle-orm";

interface RecommendationReason {
  type: 'liked_similar' | 'saved_similar' | 'category_interest' | 'reading_pattern' | 'trending_match';
  basedOnArticleId?: string;
  basedOnCategory?: string;
  basedOnTag?: string;
  matchScore?: number;
}

interface PersonalizedArticle {
  article: {
    id: string;
    title: string;
    excerpt: string | null;
    imageUrl: string | null;
    publishedAt: Date | null;
    slug: string;
    category?: {
      nameAr: string | null;
      slug: string | null;
    };
  };
  reason: RecommendationReason;
  score: number;
  reasonText: string;
}

export class RecommendationService {
  
  async recordImpression(
    userId: string, 
    articleId: string, 
    impressionType: string = 'feed',
    position?: number,
    deviceType?: string
  ) {
    try {
      const [existing] = await db.select()
        .from(articleImpressions)
        .where(and(
          eq(articleImpressions.userId, userId),
          eq(articleImpressions.articleId, articleId),
          gte(articleImpressions.createdAt, sql`NOW() - INTERVAL '1 hour'`)
        ))
        .limit(1);

      if (existing) {
        return existing;
      }

      const [impression] = await db.insert(articleImpressions)
        .values({
          userId,
          articleId,
          impressionType,
          position,
          deviceType,
          isClicked: false,
        })
        .returning();

      return impression;
    } catch (error) {
      console.error('[RecommendationService] Error recording impression:', error);
      throw error;
    }
  }

  async recordClick(userId: string, articleId: string) {
    try {
      await db.update(articleImpressions)
        .set({ isClicked: true })
        .where(and(
          eq(articleImpressions.userId, userId),
          eq(articleImpressions.articleId, articleId),
          eq(articleImpressions.isClicked, false)
        ));
    } catch (error) {
      console.error('[RecommendationService] Error recording click:', error);
    }
  }

  async batchRecordImpressions(
    userId: string,
    articleIds: string[],
    impressionType: string = 'feed',
    deviceType?: string
  ) {
    try {
      const existingImpressions = await db.select({ articleId: articleImpressions.articleId })
        .from(articleImpressions)
        .where(and(
          eq(articleImpressions.userId, userId),
          inArray(articleImpressions.articleId, articleIds),
          gte(articleImpressions.createdAt, sql`NOW() - INTERVAL '1 hour'`)
        ));

      const existingIds = new Set(existingImpressions.map((i: { articleId: string }) => i.articleId));
      const newArticleIds = articleIds.filter(id => !existingIds.has(id));

      if (newArticleIds.length === 0) {
        return { recorded: 0 };
      }

      const impressionsToInsert = newArticleIds.map((articleId, index) => ({
        userId,
        articleId,
        impressionType,
        position: index,
        deviceType,
        isClicked: false,
      }));

      await db.insert(articleImpressions).values(impressionsToInsert);

      return { recorded: newArticleIds.length };
    } catch (error) {
      console.error('[RecommendationService] Error batch recording impressions:', error);
      throw error;
    }
  }

  async getUserInterests(userId: string) {
    const likedArticles = await db.select({
      articleId: reactions.articleId,
      categoryId: articles.categoryId,
    })
      .from(reactions)
      .innerJoin(articles, eq(reactions.articleId, articles.id))
      .where(and(
        eq(reactions.userId, userId),
        eq(reactions.type, 'like')
      ))
      .orderBy(desc(reactions.createdAt))
      .limit(50);

    const savedArticles = await db.select({
      articleId: bookmarks.articleId,
      categoryId: articles.categoryId,
    })
      .from(bookmarks)
      .innerJoin(articles, eq(bookmarks.articleId, articles.id))
      .where(eq(bookmarks.userId, userId))
      .orderBy(desc(bookmarks.createdAt))
      .limit(50);

    const recentReads = await db.select({
      articleId: readingHistory.articleId,
      categoryId: articles.categoryId,
      readDuration: readingHistory.readDuration,
      engagementScore: readingHistory.engagementScore,
    })
      .from(readingHistory)
      .innerJoin(articles, eq(readingHistory.articleId, articles.id))
      .where(and(
        eq(readingHistory.userId, userId),
        gte(readingHistory.readAt, sql`NOW() - INTERVAL '7 days'`)
      ))
      .orderBy(desc(readingHistory.readAt))
      .limit(100);

    const categoryScores: Record<string, number> = {};

    likedArticles.forEach((a: { articleId: string; categoryId: string | null }) => {
      if (a.categoryId) {
        categoryScores[a.categoryId] = (categoryScores[a.categoryId] || 0) + 3;
      }
    });

    savedArticles.forEach((a: { articleId: string; categoryId: string | null }) => {
      if (a.categoryId) {
        categoryScores[a.categoryId] = (categoryScores[a.categoryId] || 0) + 2;
      }
    });

    recentReads.forEach((a: { articleId: string; categoryId: string | null; engagementScore: number | null }) => {
      const weight = a.engagementScore ? Math.min(a.engagementScore, 1) : 0.5;
      if (a.categoryId) {
        categoryScores[a.categoryId] = (categoryScores[a.categoryId] || 0) + weight;
      }
    });

    const topCategories = Object.entries(categoryScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, score]) => ({ id, score }));

    const likedArticleIds = likedArticles.map((a: { articleId: string }) => a.articleId);
    const savedArticleIds = savedArticles.map((a: { articleId: string }) => a.articleId);
    const readArticleIds = recentReads.map((a: { articleId: string }) => a.articleId);

    return {
      topCategories,
      likedArticleIds,
      savedArticleIds,
      readArticleIds,
      hasInteractions: likedArticleIds.length > 0 || savedArticleIds.length > 0 || readArticleIds.length > 0,
    };
  }

  async getPersonalizedRecommendations(userId: string, limit: number = 5): Promise<PersonalizedArticle[]> {
    try {
      const interests = await this.getUserInterests(userId);
      
      if (!interests.hasInteractions) {
        return [];
      }

      const excludeIds = [
        ...interests.likedArticleIds,
        ...interests.savedArticleIds,
        ...interests.readArticleIds.slice(0, 20),
      ];

      const recommendations: PersonalizedArticle[] = [];

      if (interests.topCategories.length > 0) {
        const categoryIds = interests.topCategories.map(c => c.id);
        
        const categoryArticles = await db.select({
          id: articles.id,
          title: articles.title,
          excerpt: articles.excerpt,
          imageUrl: articles.imageUrl,
          publishedAt: articles.publishedAt,
          categoryId: articles.categoryId,
          authorId: articles.authorId,
          slug: articles.slug,
          categoryName: categories.nameAr,
          categorySlug: categories.slug,
        })
          .from(articles)
          .leftJoin(categories, eq(articles.categoryId, categories.id))
          .where(and(
            eq(articles.status, 'published'),
            inArray(articles.categoryId, categoryIds),
            excludeIds.length > 0 ? notInArray(articles.id, excludeIds) : sql`true`,
            gte(articles.publishedAt, sql`NOW() - INTERVAL '7 days'`)
          ))
          .orderBy(desc(articles.publishedAt))
          .limit(limit * 2);

        for (const article of categoryArticles.slice(0, limit)) {
          const categoryInterest = interests.topCategories.find(c => c.id === article.categoryId);
          const score = categoryInterest ? categoryInterest.score / 10 : 0.5;
          
          recommendations.push({
            article: {
              id: article.id,
              title: article.title,
              excerpt: article.excerpt,
              imageUrl: article.imageUrl,
              publishedAt: article.publishedAt,
              slug: article.slug,
              category: {
                nameAr: article.categoryName,
                slug: article.categorySlug,
              }
            },
            reason: {
              type: 'category_interest',
              basedOnCategory: article.categoryName || undefined,
              matchScore: score,
            },
            score,
            reasonText: `لأنك تتابع ${article.categoryName || 'هذا القسم'}`,
          });
        }
      }

      recommendations.sort((a, b) => b.score - a.score);

      return recommendations.slice(0, limit);
    } catch (error) {
      console.error('[RecommendationService] Error getting recommendations:', error);
      return [];
    }
  }

  async saveRecommendationsToFeed(userId: string, recommendations: PersonalizedArticle[]) {
    try {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const feedItems = recommendations.map((rec, index) => ({
        userId,
        articleId: rec.article.id,
        score: rec.score,
        reason: rec.reason.type,
        reasonDetails: rec.reason,
        displayPosition: index,
        expiresAt,
        isDisplayed: false,
        isClicked: false,
      }));

      await db.delete(feedRecommendations)
        .where(eq(feedRecommendations.userId, userId));

      if (feedItems.length > 0) {
        await db.insert(feedRecommendations).values(feedItems);
      }

      return feedItems.length;
    } catch (error) {
      console.error('[RecommendationService] Error saving to feed:', error);
      return 0;
    }
  }

  async getFeedRecommendations(userId: string, limit: number = 5) {
    try {
      const cached = await db.select({
        id: feedRecommendations.id,
        articleId: feedRecommendations.articleId,
        score: feedRecommendations.score,
        reason: feedRecommendations.reason,
        reasonDetails: feedRecommendations.reasonDetails,
      })
        .from(feedRecommendations)
        .where(and(
          eq(feedRecommendations.userId, userId),
          gte(feedRecommendations.expiresAt, sql`NOW()`)
        ))
        .orderBy(desc(feedRecommendations.score))
        .limit(limit);

      if (cached.length > 0) {
        const articleIds = cached.map((c: { articleId: string }) => c.articleId);
        const articleData = await db.select({
          id: articles.id,
          title: articles.title,
          excerpt: articles.excerpt,
          imageUrl: articles.imageUrl,
          publishedAt: articles.publishedAt,
          slug: articles.slug,
          categoryName: categories.nameAr,
          categorySlug: categories.slug,
        })
          .from(articles)
          .leftJoin(categories, eq(articles.categoryId, categories.id))
          .where(and(
            inArray(articles.id, articleIds),
            eq(articles.status, 'published')
          ));

        const articleMap = new Map(articleData.map((a: { id: string }) => [a.id, a]));

        return cached
          .map((rec: { id: string; articleId: string; score: number; reason: string; reasonDetails: unknown }) => {
            const article = articleMap.get(rec.articleId) as typeof articleData[0] | undefined;
            if (!article) return null;
            
            const details = rec.reasonDetails as RecommendationReason | null;
            let reasonText = 'مخصص لك';
            
            if (details?.basedOnCategory) {
              reasonText = `لأنك تتابع ${details.basedOnCategory}`;
            } else if (details?.basedOnTag) {
              reasonText = `مشابه لاهتماماتك`;
            }
            
            return {
              id: rec.id,
              article: {
                id: article.id,
                title: article.title,
                excerpt: article.excerpt,
                imageUrl: article.imageUrl,
                publishedAt: article.publishedAt,
                slug: article.slug,
                category: {
                  nameAr: article.categoryName,
                  slug: article.categorySlug,
                }
              },
              score: rec.score,
              reason: rec.reason,
              reasonText,
            };
          })
          .filter(Boolean);
      }

      const freshRecommendations = await this.getPersonalizedRecommendations(userId, limit);
      
      if (freshRecommendations.length > 0) {
        await this.saveRecommendationsToFeed(userId, freshRecommendations);
      }

      return freshRecommendations.map(rec => ({
        id: null,
        article: rec.article,
        score: rec.score,
        reason: rec.reason.type,
        reasonText: rec.reasonText,
      }));
    } catch (error) {
      console.error('[RecommendationService] Error getting feed recommendations:', error);
      return [];
    }
  }

  async markRecommendationDisplayed(recommendationId: string) {
    try {
      await db.update(feedRecommendations)
        .set({ isDisplayed: true })
        .where(eq(feedRecommendations.id, recommendationId));
    } catch (error) {
      console.error('[RecommendationService] Error marking displayed:', error);
    }
  }

  async markRecommendationClicked(recommendationId: string) {
    try {
      await db.update(feedRecommendations)
        .set({ isClicked: true })
        .where(eq(feedRecommendations.id, recommendationId));
    } catch (error) {
      console.error('[RecommendationService] Error marking clicked:', error);
    }
  }
}

export const recommendationService = new RecommendationService();
