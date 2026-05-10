import { db } from './db';
import { notificationMemory, userBehaviorSignals, userDynamicInterests, notificationAnalytics, notificationsInbox, articles, categories } from '@shared/schema';
import { eq, and, lt, sql, gte, desc, inArray } from 'drizzle-orm';
import crypto from 'crypto';

const LOG_PREFIX = '[NotificationMemory]';

// ============================================
// Signal Weights & Decay Configuration
// ============================================
export const SIGNAL_WEIGHTS: Record<string, number> = {
  'article_read': 1.0,
  'article_like': 5.0,
  'article_bookmark': 4.0,
  'article_share': 6.0,
  'article_comment': 3.0,
  'category_read': 0.5,
  'tag_read': 0.3,
  'notification_click': 8.0,
  'notification_dismiss': -2.0,
  'time_spent': 0.1, // Per 10 seconds
  'search_query': 0.2,
};

export const SIGNAL_DECAY_RATES: Record<string, number> = {
  'article_read': 0.02, // 2% per day
  'article_like': 0.01, // 1% per day
  'article_bookmark': 0.01,
  'article_share': 0.01,
  'article_comment': 0.015,
  'category_read': 0.03,
  'tag_read': 0.04,
  'notification_click': 0.005, // Very slow decay
  'notification_dismiss': 0.03,
  'time_spent': 0.03,
  'search_query': 0.05,
};

// Notification type thresholds
export const NOTIFICATION_THRESHOLDS = {
  breaking: 0.0, // Always send breaking news
  interest: 0.4, // Min interest score to send
  behavior: 0.5, // Min behavior match score to send
};

// ============================================
// Hash Generation for Deduplication
// ============================================
function generateNotificationHash(userId: string, articleId: string | null | undefined, notificationType: string, payloadHash?: string): string {
  // For notifications without articleId, use payload hash if available, otherwise type-only hash
  const articleKey = articleId || (payloadHash ? `payload:${payloadHash}` : 'no-article');
  const input = `${userId}:${articleKey}:${notificationType}`;
  return crypto.createHash('sha256').update(input).digest('hex');
}

// Generate hash from notification payload for non-article notifications
function generatePayloadHash(payload: any): string {
  const payloadStr = JSON.stringify(payload || {});
  return crypto.createHash('md5').update(payloadStr).digest('hex').slice(0, 16);
}

// ============================================
// Memory Layer - Deduplication Service
// ============================================
export class NotificationMemoryService {
  
  /**
   * Check if a notification was already sent (within 30-day window)
   * @param userId - User ID
   * @param articleId - Article ID (can be null for non-article notifications)
   * @param notificationType - Type of notification
   * @param payload - Optional payload for non-article notifications (used for hash)
   */
  async wasNotificationSent(
    userId: string, 
    articleId: string | null | undefined, 
    notificationType: string,
    payload?: any
  ): Promise<boolean> {
    try {
      const payloadHash = !articleId && payload ? generatePayloadHash(payload) : undefined;
      const hash = generateNotificationHash(userId, articleId, notificationType, payloadHash);
      
      const existing = await db
        .select({ id: notificationMemory.id })
        .from(notificationMemory)
        .where(
          and(
            eq(notificationMemory.hash, hash),
            gte(notificationMemory.expiresAt, new Date())
          )
        )
        .limit(1);
      
      return existing.length > 0;
    } catch (error) {
      console.error(`${LOG_PREFIX} Error checking notification memory:`, error);
      return false; // Allow sending on error
    }
  }

  /**
   * Record that a notification was sent
   * @param userId - User ID
   * @param articleId - Article ID (can be null for non-article notifications)
   * @param notificationType - Type of notification
   * @param payload - Optional payload for non-article notifications (used for hash)
   */
  async recordNotificationSent(
    userId: string, 
    articleId: string | null | undefined, 
    notificationType: string,
    payload?: any
  ): Promise<void> {
    try {
      const payloadHash = !articleId && payload ? generatePayloadHash(payload) : undefined;
      const hash = generateNotificationHash(userId, articleId, notificationType, payloadHash);
      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + 30); // 30-day expiry

      // For non-article notifications, we need a placeholder articleId
      // The schema requires articleId, so we'll use a special marker
      const effectiveArticleId = articleId || 'system-notification';

      await db
        .insert(notificationMemory)
        .values({
          userId,
          articleId: effectiveArticleId,
          notificationType,
          hash,
          sentAt: now,
          expiresAt,
        })
        .onConflictDoNothing();
      
      console.log(`${LOG_PREFIX} Recorded notification: ${notificationType} for user ${userId.slice(0, 8)}...`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error recording notification:`, error);
    }
  }

  /**
   * Clean up expired notification memories
   */
  async cleanupExpiredMemories(): Promise<number> {
    try {
      const result = await db
        .delete(notificationMemory)
        .where(lt(notificationMemory.expiresAt, new Date()))
        .returning({ id: notificationMemory.id });
      
      if (result.length > 0) {
        console.log(`${LOG_PREFIX} Cleaned up ${result.length} expired notification memories`);
      }
      return result.length;
    } catch (error) {
      console.error(`${LOG_PREFIX} Error cleaning up expired memories:`, error);
      return 0;
    }
  }

  /**
   * Get notification history for a user (for debugging/analytics)
   */
  async getUserNotificationHistory(userId: string, limit = 50): Promise<any[]> {
    try {
      return await db
        .select()
        .from(notificationMemory)
        .where(eq(notificationMemory.userId, userId))
        .orderBy(desc(notificationMemory.sentAt))
        .limit(limit);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error getting notification history:`, error);
      return [];
    }
  }
}

// ============================================
// Behavior Signal Service
// ============================================
export class BehaviorSignalService {
  
  /**
   * Record a user behavior signal
   */
  async recordSignal(
    userId: string,
    signalType: string,
    options: {
      articleId?: string;
      categoryId?: string;
      tagId?: string;
      weight?: number;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<void> {
    try {
      const baseWeight = SIGNAL_WEIGHTS[signalType] || 1.0;
      const weight = options.weight !== undefined ? options.weight : baseWeight;

      await db.insert(userBehaviorSignals).values({
        userId,
        signalType,
        articleId: options.articleId || null,
        categoryId: options.categoryId || null,
        tagId: options.tagId || null,
        weight,
        metadata: options.metadata || null,
      });

      // Update dynamic interests if categoryId is provided
      if (options.categoryId) {
        await this.updateDynamicInterest(userId, 'category', options.categoryId, weight);
      }

      console.log(`${LOG_PREFIX} Recorded signal: ${signalType} for user ${userId.slice(0, 8)}... (weight: ${weight})`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error recording signal:`, error);
    }
  }

  /**
   * Update dynamic interest score for a user
   */
  async updateDynamicInterest(
    userId: string,
    interestType: string,
    interestId: string,
    scoreIncrement: number,
    interestName?: string
  ): Promise<void> {
    try {
      // Check if interest exists
      const existing = await db
        .select()
        .from(userDynamicInterests)
        .where(
          and(
            eq(userDynamicInterests.userId, userId),
            eq(userDynamicInterests.interestType, interestType),
            eq(userDynamicInterests.interestId, interestId)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        // Update existing interest
        const currentScore = existing[0].score || 0;
        const newScore = Math.min(1.0, Math.max(0.0, currentScore + (scoreIncrement * 0.1)));
        
        await db
          .update(userDynamicInterests)
          .set({
            score: newScore,
            interactionCount: sql`${userDynamicInterests.interactionCount} + 1`,
            lastInteraction: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(userDynamicInterests.id, existing[0].id));
      } else {
        // Create new interest
        const categoryInfo = interestType === 'category' 
          ? await db.select({ nameAr: categories.nameAr }).from(categories).where(eq(categories.id, interestId)).limit(1)
          : null;
        
        const displayName = interestName || (categoryInfo && categoryInfo[0]?.nameAr) || interestId;
        
        await db.insert(userDynamicInterests).values({
          userId,
          interestType,
          interestId,
          interestName: displayName,
          score: Math.min(1.0, scoreIncrement * 0.1),
          interactionCount: 1,
        });
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} Error updating dynamic interest:`, error);
    }
  }

  /**
   * Get user's top interests with time-decayed scores
   */
  async getTopInterests(userId: string, limit = 10): Promise<any[]> {
    try {
      return await db
        .select()
        .from(userDynamicInterests)
        .where(
          and(
            eq(userDynamicInterests.userId, userId),
            gte(userDynamicInterests.score, 0.1) // Only significant interests
          )
        )
        .orderBy(desc(userDynamicInterests.score))
        .limit(limit);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error getting top interests:`, error);
      return [];
    }
  }

  /**
   * Calculate decayed signal weight based on age
   */
  calculateDecayedWeight(signalType: string, weight: number, ageInDays: number): number {
    const decayRate = SIGNAL_DECAY_RATES[signalType] || 0.02;
    const decayFactor = Math.pow(1 - decayRate, ageInDays);
    return weight * decayFactor;
  }

  /**
   * Apply time decay to all signals (run periodically)
   */
  async applyTimeDecay(): Promise<number> {
    try {
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);

      // Get signals older than 1 day that haven't been decayed recently
      const signalsToDecay = await db
        .select()
        .from(userBehaviorSignals)
        .where(lt(userBehaviorSignals.createdAt, oneDayAgo))
        .limit(1000);

      let decayedCount = 0;
      for (const signal of signalsToDecay) {
        const ageInDays = Math.floor(
          (Date.now() - new Date(signal.createdAt).getTime()) / (1000 * 60 * 60 * 24)
        );
        
        if (ageInDays > 0) {
          const decayRate = SIGNAL_DECAY_RATES[signal.signalType] || 0.02;
          const newDecayFactor = Math.pow(1 - decayRate, ageInDays);
          
          await db
            .update(userBehaviorSignals)
            .set({ decayFactor: newDecayFactor })
            .where(eq(userBehaviorSignals.id, signal.id));
          
          decayedCount++;
        }
      }

      if (decayedCount > 0) {
        console.log(`${LOG_PREFIX} Applied time decay to ${decayedCount} signals`);
      }
      return decayedCount;
    } catch (error) {
      console.error(`${LOG_PREFIX} Error applying time decay:`, error);
      return 0;
    }
  }

  /**
   * Get user's behavioral profile for scoring
   */
  async getUserBehavioralProfile(userId: string): Promise<{
    categoryScores: Map<string, number>;
    tagScores: Map<string, number>;
    totalEngagement: number;
    lastActivity: Date | null;
  }> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const signals = await db
        .select()
        .from(userBehaviorSignals)
        .where(
          and(
            eq(userBehaviorSignals.userId, userId),
            gte(userBehaviorSignals.createdAt, thirtyDaysAgo)
          )
        );

      const categoryScores = new Map<string, number>();
      const tagScores = new Map<string, number>();
      let totalEngagement = 0;
      let lastActivity: Date | null = null;

      for (const signal of signals) {
        const weight = (signal.weight || 1) * (signal.decayFactor || 1);
        totalEngagement += weight;

        if (signal.categoryId) {
          const current = categoryScores.get(signal.categoryId) || 0;
          categoryScores.set(signal.categoryId, current + weight);
        }

        if (signal.tagId) {
          const current = tagScores.get(signal.tagId) || 0;
          tagScores.set(signal.tagId, current + weight);
        }

        if (!lastActivity || new Date(signal.createdAt) > lastActivity) {
          lastActivity = new Date(signal.createdAt);
        }
      }

      return { categoryScores, tagScores, totalEngagement, lastActivity };
    } catch (error) {
      console.error(`${LOG_PREFIX} Error getting behavioral profile:`, error);
      return {
        categoryScores: new Map(),
        tagScores: new Map(),
        totalEngagement: 0,
        lastActivity: null,
      };
    }
  }
}

// ============================================
// Notification Analytics Service
// ============================================
export class NotificationAnalyticsService {
  
  /**
   * Record notification send for analytics
   */
  async recordNotificationSend(
    userId: string,
    notificationId: string,
    notificationType: string,
    articleId: string | null,
    scoreAtSend: number | null,
    recommendationReason: string | null
  ): Promise<void> {
    try {
      await db.insert(notificationAnalytics).values({
        userId,
        notificationId,
        notificationType,
        articleId,
        scoreAtSend,
        recommendationReason,
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} Error recording notification send:`, error);
    }
  }

  /**
   * Record notification open
   */
  async recordOpen(notificationId: string): Promise<void> {
    try {
      const analytics = await db
        .select({ id: notificationAnalytics.id, createdAt: notificationAnalytics.createdAt })
        .from(notificationAnalytics)
        .where(eq(notificationAnalytics.notificationId, notificationId))
        .limit(1);

      if (analytics.length > 0) {
        const timeToOpen = Math.floor(
          (Date.now() - new Date(analytics[0].createdAt).getTime()) / 1000
        );

        await db
          .update(notificationAnalytics)
          .set({
            opened: true,
            openedAt: new Date(),
            timeToOpen,
          })
          .where(eq(notificationAnalytics.id, analytics[0].id));
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} Error recording open:`, error);
    }
  }

  /**
   * Record notification click
   */
  async recordClick(notificationId: string): Promise<void> {
    try {
      const analytics = await db
        .select({ id: notificationAnalytics.id, createdAt: notificationAnalytics.createdAt })
        .from(notificationAnalytics)
        .where(eq(notificationAnalytics.notificationId, notificationId))
        .limit(1);

      if (analytics.length > 0) {
        const timeToClick = Math.floor(
          (Date.now() - new Date(analytics[0].createdAt).getTime()) / 1000
        );

        await db
          .update(notificationAnalytics)
          .set({
            clicked: true,
            clickedAt: new Date(),
            timeToClick,
          })
          .where(eq(notificationAnalytics.id, analytics[0].id));
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} Error recording click:`, error);
    }
  }

  /**
   * Record notification dismiss
   */
  async recordDismiss(notificationId: string): Promise<void> {
    try {
      await db
        .update(notificationAnalytics)
        .set({
          dismissed: true,
          dismissedAt: new Date(),
        })
        .where(eq(notificationAnalytics.notificationId, notificationId));
    } catch (error) {
      console.error(`${LOG_PREFIX} Error recording dismiss:`, error);
    }
  }

  /**
   * Get analytics metrics for a time period
   */
  async getMetrics(fromDate: Date, toDate: Date): Promise<{
    totalSent: number;
    totalOpened: number;
    totalClicked: number;
    totalDismissed: number;
    openRate: number;
    clickRate: number;
    dismissRate: number;
    avgTimeToOpen: number;
    avgTimeToClick: number;
    byType: Record<string, {
      sent: number;
      opened: number;
      clicked: number;
      dismissed: number;
    }>;
  }> {
    try {
      const analytics = await db
        .select()
        .from(notificationAnalytics)
        .where(
          and(
            gte(notificationAnalytics.createdAt, fromDate),
            lt(notificationAnalytics.createdAt, toDate)
          )
        );

      const byType: Record<string, { sent: number; opened: number; clicked: number; dismissed: number }> = {};
      let totalOpened = 0;
      let totalClicked = 0;
      let totalDismissed = 0;
      let totalTimeToOpen = 0;
      let openedWithTime = 0;
      let totalTimeToClick = 0;
      let clickedWithTime = 0;

      for (const a of analytics) {
        if (!byType[a.notificationType]) {
          byType[a.notificationType] = { sent: 0, opened: 0, clicked: 0, dismissed: 0 };
        }
        byType[a.notificationType].sent++;

        if (a.opened) {
          totalOpened++;
          byType[a.notificationType].opened++;
          if (a.timeToOpen) {
            totalTimeToOpen += a.timeToOpen;
            openedWithTime++;
          }
        }
        if (a.clicked) {
          totalClicked++;
          byType[a.notificationType].clicked++;
          if (a.timeToClick) {
            totalTimeToClick += a.timeToClick;
            clickedWithTime++;
          }
        }
        if (a.dismissed) {
          totalDismissed++;
          byType[a.notificationType].dismissed++;
        }
      }

      const totalSent = analytics.length;

      return {
        totalSent,
        totalOpened,
        totalClicked,
        totalDismissed,
        openRate: totalSent > 0 ? (totalOpened / totalSent) * 100 : 0,
        clickRate: totalSent > 0 ? (totalClicked / totalSent) * 100 : 0,
        dismissRate: totalSent > 0 ? (totalDismissed / totalSent) * 100 : 0,
        avgTimeToOpen: openedWithTime > 0 ? totalTimeToOpen / openedWithTime : 0,
        avgTimeToClick: clickedWithTime > 0 ? totalTimeToClick / clickedWithTime : 0,
        byType,
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} Error getting metrics:`, error);
      return {
        totalSent: 0,
        totalOpened: 0,
        totalClicked: 0,
        totalDismissed: 0,
        openRate: 0,
        clickRate: 0,
        dismissRate: 0,
        avgTimeToOpen: 0,
        avgTimeToClick: 0,
        byType: {},
      };
    }
  }
}

// ============================================
// Singleton Instances
// ============================================
export const notificationMemoryService = new NotificationMemoryService();
export const behaviorSignalService = new BehaviorSignalService();
export const notificationAnalyticsService = new NotificationAnalyticsService();

// ============================================
// Cleanup Job (run periodically)
// ============================================
export async function runNotificationSystemCleanup(): Promise<void> {
  console.log(`${LOG_PREFIX} Running notification system cleanup...`);
  
  try {
    const expiredCount = await notificationMemoryService.cleanupExpiredMemories();
    const decayedCount = await behaviorSignalService.applyTimeDecay();
    
    console.log(`${LOG_PREFIX} Cleanup complete: ${expiredCount} memories expired, ${decayedCount} signals decayed`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Cleanup error:`, error);
  }
}
