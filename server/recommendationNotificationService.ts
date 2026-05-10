import { db } from './db';
import {
  recommendationLog,
  userRecommendationPrefs,
  userNotificationPrefs,
  notificationQueue,
  notificationsInbox,
  notificationMetrics,
  reactions,
  bookmarks,
} from '@shared/schema';
import { eq, and, desc, sql, gt, inArray } from 'drizzle-orm';
import {
  findSimilarArticles,
  getPersonalizedRecommendations,
  getTrendingArticles,
} from './similarityEngine';

// ============================================
// Smart Notification Rules
// ============================================

interface NotificationRules {
  maxPerDay: number;           // Maximum notifications per day
  cooldownHours: number;       // Minimum hours between notifications
  quietHoursStart: string;     // Start of quiet hours (HH:MM)
  quietHoursEnd: string;       // End of quiet hours (HH:MM)
  enabled: boolean;            // Master switch
}

/**
 * Get user's recommendation notification preferences
 * Returns default rules if user hasn't set custom preferences
 */
async function getUserNotificationRules(userId: string): Promise<NotificationRules> {
  // Check recommendation-specific preferences
  const recPrefs = await db.query.userRecommendationPrefs.findFirst({
    where: eq(userRecommendationPrefs.userId, userId),
  });

  // Check general notification preferences for quiet hours
  const notifPrefs = await db.query.userNotificationPrefs.findFirst({
    where: eq(userNotificationPrefs.userId, userId),
  });

  return {
    maxPerDay: recPrefs?.maxDailyPersonal || 3,
    cooldownHours: recPrefs?.cooldownHours || 6,
    quietHoursStart: notifPrefs?.quietHoursStart || '22:00',
    quietHoursEnd: notifPrefs?.quietHoursEnd || '08:00',
    enabled: true, // Enabled by default
  };
}

/**
 * Check if current time is within quiet hours
 */
function isQuietHours(quietStart: string, quietEnd: string): boolean {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTime = currentHour * 60 + currentMinute;

  const [startHour, startMin] = quietStart.split(':').map(Number);
  const [endHour, endMin] = quietEnd.split(':').map(Number);
  const startTime = startHour * 60 + startMin;
  const endTime = endHour * 60 + endMin;

  // Handle overnight quiet hours (e.g., 22:00 - 08:00)
  if (startTime > endTime) {
    return currentTime >= startTime || currentTime < endTime;
  }

  return currentTime >= startTime && currentTime < endTime;
}

/**
 * Check if user can receive a recommendation notification
 * Implements anti-spam, cooldown, frequency capping
 */
export async function canSendRecommendationNotification(
  userId: string,
  notificationType: string
): Promise<{ allowed: boolean; reason?: string }> {
  // Get user's notification rules
  const rules = await getUserNotificationRules(userId);

  // Check quiet hours
  if (isQuietHours(rules.quietHoursStart, rules.quietHoursEnd)) {
    return { allowed: false, reason: 'Quiet hours active' };
  }

  // Check daily frequency cap
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(recommendationLog)
    .where(
      and(
        eq(recommendationLog.userId, userId),
        gt(recommendationLog.sentAt, todayStart)
      )
    );

  const dailyNotifications = Number(todayCount[0]?.count || 0);
  if (dailyNotifications >= rules.maxPerDay) {
    return {
      allowed: false,
      reason: `Daily limit reached (${rules.maxPerDay} notifications)`,
    };
  }

  // Check cooldown period
  const cooldownDate = new Date();
  cooldownDate.setHours(cooldownDate.getHours() - rules.cooldownHours);

  const recentNotifications = await db
    .select()
    .from(recommendationLog)
    .where(
      and(
        eq(recommendationLog.userId, userId),
        gt(recommendationLog.sentAt, cooldownDate)
      )
    )
    .limit(1);

  if (recentNotifications.length > 0) {
    const hoursLeft = Math.ceil(
      (recentNotifications[0].sentAt.getTime() + rules.cooldownHours * 60 * 60 * 1000 - Date.now()) /
        (60 * 60 * 1000)
    );
    return {
      allowed: false,
      reason: `Cooldown active (${hoursLeft} hours remaining)`,
    };
  }

  // Check for duplicate notification type (same type within cooldown period)
  const duplicates = await db
    .select()
    .from(recommendationLog)
    .where(
      and(
        eq(recommendationLog.userId, userId),
        eq(recommendationLog.reason, notificationType),
        gt(recommendationLog.sentAt, cooldownDate)
      )
    )
    .limit(1);

  if (duplicates.length > 0) {
    return {
      allowed: false,
      reason: `Duplicate notification type within cooldown period`,
    };
  }

  return { allowed: true };
}

// ============================================
// Recommendation Notification Types
// ============================================

export type RecommendationType =
  | 'because_you_liked'    // "Because you liked X" - similar to liked articles
  | 'similar_to_saved'     // "Similar to articles you saved"
  | 'within_your_reads'    // "Based on what you've been reading"
  | 'trending_for_you';    // "Trending in your interests"

/**
 * Generate "Because You Liked" recommendations
 * Finds articles similar to user's recently liked articles
 */
export async function generateBecauseYouLikedRecommendations(
  userId: string,
  limit: number = 3
): Promise<{ articleIds: string[]; referenceArticleId: string; scores: number[] } | null> {
  // Get user's recent liked articles (last 10)
  const likedArticles = await db
    .select()
    .from(reactions)
    .where(
      and(
        eq(reactions.userId, userId),
        eq(reactions.type, 'like')
      )
    )
    .orderBy(desc(reactions.createdAt))
    .limit(10);

  if (likedArticles.length === 0) {
    return null;
  }

  // Pick most recent liked article as reference
  const referenceArticle = likedArticles[0].articleId;

  // Find similar articles
  const similar = await findSimilarArticles(referenceArticle, limit);

  if (similar.length === 0) {
    return null;
  }

  return {
    articleIds: similar.map(s => s.articleId),
    referenceArticleId: referenceArticle,
    scores: similar.map(s => s.score),
  };
}

/**
 * Generate "Similar to Saved" recommendations
 * Finds articles similar to user's bookmarked articles
 */
export async function generateSimilarToSavedRecommendations(
  userId: string,
  limit: number = 3
): Promise<{ articleIds: string[]; referenceArticleId: string; scores: number[] } | null> {
  // Get user's recent bookmarks (last 10)
  const bookmarked = await db
    .select()
    .from(bookmarks)
    .where(eq(bookmarks.userId, userId))
    .orderBy(desc(bookmarks.createdAt))
    .limit(10);

  if (bookmarked.length === 0) {
    return null;
  }

  // Pick most recent bookmark as reference
  const referenceArticle = bookmarked[0].articleId;

  // Find similar articles
  const similar = await findSimilarArticles(referenceArticle, limit);

  if (similar.length === 0) {
    return null;
  }

  return {
    articleIds: similar.map(s => s.articleId),
    referenceArticleId: referenceArticle,
    scores: similar.map(s => s.score),
  };
}

/**
 * Generate "Within Your Reads" recommendations
 * Based on user's overall reading behavior
 */
export async function generateWithinYourReadsRecommendations(
  userId: string,
  limit: number = 3
): Promise<{ articleIds: string[]; scores: number[] } | null> {
  // Get personalized recommendations based on user profile
  const recommendations = await getPersonalizedRecommendations(userId, limit);

  if (recommendations.length === 0) {
    return null;
  }

  return {
    articleIds: recommendations.map(r => r.articleId),
    scores: recommendations.map(r => r.score),
  };
}

/**
 * Generate "Trending For You" recommendations
 * Trending articles within user's interests
 */
export async function generateTrendingForYouRecommendations(
  userId: string,
  limit: number = 3
): Promise<{ articleIds: string[]; scores: number[] } | null> {
  // Get trending articles (fallback to general trending)
  const trending = await getTrendingArticles(limit);

  if (trending.length === 0) {
    return null;
  }

  return {
    articleIds: trending.map(t => t.articleId),
    scores: trending.map(t => t.score),
  };
}

// ============================================
// Notification Delivery
// ============================================

/**
 * Send a recommendation notification to a user
 * Checks rules and logs the recommendation
 * Note: recommendationLog stores ONE article per row, not multiple articleIds
 */
export async function sendRecommendationNotification(
  userId: string,
  recommendationType: RecommendationType,
  articleIds: string[],
  scores: number[],
  metadata?: Record<string, any>
): Promise<{ success: boolean; reason?: string }> {
  // Check if user can receive notification
  const check = await canSendRecommendationNotification(userId, recommendationType);

  if (!check.allowed) {
    console.log(`⏸️ [REC NOTIFICATION] Cannot send to user ${userId}: ${check.reason}`);
    return { success: false, reason: check.reason };
  }

  try {
    // Validate articleIds array
    if (!articleIds || articleIds.length === 0) {
      console.error(`❌ [REC NOTIFICATION] No article IDs provided for recommendation`);
      return { success: false, reason: 'No articles to recommend' };
    }

    // Verify ALL recommended articles are still published (prevent recommending deleted articles)
    const { articles } = await import('@shared/schema');
    const validArticles = await db
      .select({ id: articles.id, title: articles.title, slug: articles.slug, imageUrl: articles.imageUrl })
      .from(articles)
      .where(
        and(
          inArray(articles.id, articleIds),
          eq(articles.status, 'published') // Only published articles
        )
      );

    if (validArticles.length === 0) {
      console.error(`❌ [REC NOTIFICATION] None of the recommended articles are published anymore`);
      return { success: false, reason: 'No valid published articles to recommend' };
    }

    // Use first valid article for notification
    const firstArticle = validArticles[0];
    const validArticleIds = validArticles.map(a => a.id);

    if (validArticles.length < articleIds.length) {
      console.warn(`⚠️ [REC NOTIFICATION] Some articles were filtered out (${articleIds.length - validArticles.length} unpublished)`);
    }

    console.log(`📧 [REC NOTIFICATION] Preparing notification for article: ${firstArticle.slug} (${firstArticle.id})`);

    // Log each VALID recommended article separately (as per schema)
    for (let i = 0; i < validArticleIds.length; i++) {
      const originalIndex = articleIds.indexOf(validArticleIds[i]);
      await db.insert(recommendationLog).values({
        userId,
        articleId: validArticleIds[i],
        reason: recommendationType,
        score: scores[originalIndex] || 0.5,
        channel: 'notification',
        metadata: metadata || {},
      });
    }

    // Create notification in inbox with article details
    let title = '';
    let message = '';

    switch (recommendationType) {
      case 'because_you_liked':
        title = 'قد يعجبك أيضاً';
        message = firstArticle.title;
        break;
      case 'similar_to_saved':
        title = 'مشابه لما حفظت';
        message = firstArticle.title;
        break;
      case 'within_your_reads':
        title = 'مقترح لك';
        message = firstArticle.title;
        break;
      case 'trending_for_you':
        title = 'رائج في اهتماماتك';
        message = firstArticle.title;
        break;
    }

    await db.insert(notificationsInbox).values({
      userId,
      type: 'recommendation',
      title,
      body: message,
      deeplink: `/article/${firstArticle.slug}`,
      metadata: {
        articleId: firstArticle.id,
        articleSlug: firstArticle.slug,
        imageUrl: firstArticle.imageUrl || undefined,
        articleIds: validArticleIds, // Only valid published articles
        recommendationType,
        ...metadata,
      },
      read: false,
    });

    console.log(`✅ [REC NOTIFICATION] Sent ${recommendationType} to user ${userId}: ${validArticleIds.length} valid articles (${articleIds.length} original)`);

    return { success: true };
  } catch (error) {
    console.error(`❌ [REC NOTIFICATION] Error sending notification:`, error);
    return { success: false, reason: 'Error sending notification' };
  }
}

/**
 * Process recommendation notifications for a user
 * Tries different recommendation types in order
 */
export async function processUserRecommendations(userId: string): Promise<void> {
  console.log(`🤖 [REC ENGINE] Processing recommendations for user ${userId}`);

  // Try each recommendation type in priority order
  const types: RecommendationType[] = [
    'because_you_liked',
    'similar_to_saved',
    'within_your_reads',
    'trending_for_you',
  ];

  for (const type of types) {
    try {
      let recommendation = null;

      switch (type) {
        case 'because_you_liked':
          recommendation = await generateBecauseYouLikedRecommendations(userId, 3);
          break;
        case 'similar_to_saved':
          recommendation = await generateSimilarToSavedRecommendations(userId, 3);
          break;
        case 'within_your_reads':
          recommendation = await generateWithinYourReadsRecommendations(userId, 3);
          break;
        case 'trending_for_you':
          recommendation = await generateTrendingForYouRecommendations(userId, 3);
          break;
      }

      if (recommendation && recommendation.articleIds.length > 0) {
        const result = await sendRecommendationNotification(
          userId,
          type,
          recommendation.articleIds,
          recommendation.scores,
          'referenceArticleId' in recommendation
            ? { similarToArticleId: recommendation.referenceArticleId }
            : undefined
        );

        if (result.success) {
          console.log(`✅ [REC ENGINE] Successfully sent ${type} notification to user ${userId}`);
          return; // Stop after first successful notification
        }
      }
    } catch (error) {
      console.error(`❌ [REC ENGINE] Error generating ${type} recommendation:`, error);
      // Continue to next type
    }
  }

  console.log(`⏸️ [REC ENGINE] No recommendations could be generated for user ${userId}`);
}
