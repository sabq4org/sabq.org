import { db } from './db';
import { userEvents, articles } from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import type { InsertUserEvent } from '@shared/schema';

// ============================================
// Event Weight Configuration
// ============================================

/**
 * Event importance weights for recommendation scoring
 * Higher values = stronger signal of user interest
 */
export const EVENT_WEIGHTS = {
  view: 1,           // Basic page view
  like: 3,           // Liked article
  bookmark: 2,       // Saved for later
  share: 4,          // Shared with others (strongest signal)
  comment: 3,        // Engaged with content
  read: 1,           // Read progress tracked
  search_click: 2,   // Clicked from search results
} as const;

export type EventType = keyof typeof EVENT_WEIGHTS;

// ============================================
// Event Tracking
// ============================================

/**
 * Track a user event
 * Automatically calculates event value based on type and metadata
 */
export async function trackUserEvent(params: {
  userId: string;
  articleId: string;
  eventType: EventType;
  metadata?: Record<string, any>;
}): Promise<void> {
  const { userId, articleId, eventType, metadata = {} } = params;

  // Calculate event value
  const baseValue = EVENT_WEIGHTS[eventType] || 1;
  let eventValue = baseValue;

  // Boost value based on reading progress
  if (eventType === 'read' && metadata.progress) {
    const progress = Math.min(metadata.progress, 100);
    eventValue = baseValue * (progress / 100);
  }

  // Boost value for deep reads (>50% of article)
  if (eventType === 'view' && metadata.scrollDepth && metadata.scrollDepth > 50) {
    eventValue = baseValue * 1.5;
  }

  // Check for duplicate events (within last 5 minutes)
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const existing = await db.query.userEvents.findFirst({
    where: and(
      eq(userEvents.userId, userId),
      eq(userEvents.articleId, articleId),
      eq(userEvents.eventType, eventType),
      sql`${userEvents.createdAt} > ${fiveMinutesAgo}`
    ),
  });

  if (existing) {
    // Update existing event instead of creating duplicate
    await db.update(userEvents)
      .set({
        eventValue,
        metadata,
        createdAt: new Date(), // Update timestamp
      })
      .where(eq(userEvents.id, existing.id));

    console.log(`🔄 [EVENT TRACKING] Updated event: ${eventType} for article ${articleId}`);
    return;
  }

  // Insert new event
  await db.insert(userEvents).values({
    userId,
    articleId,
    eventType,
    eventValue,
    metadata,
  });

  console.log(`✅ [EVENT TRACKING] Tracked event: ${eventType} for article ${articleId} (value: ${eventValue})`);

  // Update article view count if event is 'view'
  if (eventType === 'view') {
    await db
      .update(articles)
      .set({ views: sql`${articles.views} + 1` })
      .where(eq(articles.id, articleId));
  }

  // Trigger recommendation processing for high-value events (non-blocking)
  if (['like', 'bookmark', 'share'].includes(eventType)) {
    // Run in background without blocking
    (async () => {
      try {
        const { processUserRecommendations } = await import('./recommendationNotificationService');
        await processUserRecommendations(userId);
      } catch (error) {
        console.error(`❌ [RECOMMENDATION TRIGGER] Error processing recommendations for user ${userId}:`, error);
      }
    })();
  }
}

/**
 * Track multiple events in batch
 * Useful for offline sync or bulk operations
 */
export async function trackUserEventsBatch(
  events: Array<{
    userId: string;
    articleId: string;
    eventType: EventType;
    metadata?: Record<string, any>;
  }>
): Promise<void> {
  console.log(`📊 [EVENT TRACKING] Batch tracking ${events.length} events`);

  for (const event of events) {
    try {
      await trackUserEvent(event);
    } catch (error) {
      console.error(`❌ [EVENT TRACKING] Error tracking event:`, error);
      // Continue with next event
    }
  }

  console.log(`✅ [EVENT TRACKING] Batch tracking completed`);
}

// ============================================
// Reading Progress Tracking
// ============================================

/**
 * Track reading progress for an article
 * Called periodically from frontend as user scrolls
 */
export async function trackReadingProgress(params: {
  userId: string;
  articleId: string;
  progress: number; // 0-100
  timeSpent: number; // seconds
  scrollDepth: number; // 0-100
}): Promise<void> {
  const { userId, articleId, progress, timeSpent, scrollDepth } = params;

  await trackUserEvent({
    userId,
    articleId,
    eventType: 'read',
    metadata: {
      progress,
      timeSpent,
      scrollDepth,
      timestamp: new Date().toISOString(),
    },
  });
}

// ============================================
// Event Analytics
// ============================================

/**
 * Get user's recent events (for debugging and analysis)
 */
export async function getUserRecentEvents(
  userId: string,
  limit: number = 50
): Promise<Array<{
  id: string;
  articleId: string;
  eventType: string;
  eventValue: number;
  createdAt: Date;
  metadata: any;
}>> {
  const events = await db
    .select()
    .from(userEvents)
    .where(eq(userEvents.userId, userId))
    .orderBy(desc(userEvents.createdAt))
    .limit(limit);

  return events;
}

/**
 * Get article's engagement events (for analytics)
 */
export async function getArticleEvents(
  articleId: string,
  limit: number = 100
): Promise<Array<{
  id: string;
  userId: string;
  eventType: string;
  eventValue: number;
  createdAt: Date;
}>> {
  const events = await db
    .select()
    .from(userEvents)
    .where(eq(userEvents.articleId, articleId))
    .orderBy(desc(userEvents.createdAt))
    .limit(limit);

  return events;
}

/**
 * Get event statistics for a user
 * Useful for dashboard and analytics
 */
export async function getUserEventStats(userId: string): Promise<{
  totalEvents: number;
  eventsByType: Record<string, number>;
  last7Days: number;
  last30Days: number;
}> {
  const allEvents = await db
    .select()
    .from(userEvents)
    .where(eq(userEvents.userId, userId));

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  const eventsByType: Record<string, number> = {};
  let last7Days = 0;
  let last30Days = 0;

  allEvents.forEach(event => {
    // Count by type
    eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1;

    // Count by time range
    const eventTime = new Date(event.createdAt).getTime();
    if (eventTime > sevenDaysAgo) last7Days++;
    if (eventTime > thirtyDaysAgo) last30Days++;
  });

  return {
    totalEvents: allEvents.length,
    eventsByType,
    last7Days,
    last30Days,
  };
}
