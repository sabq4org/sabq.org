import { db } from './db';
import { userAffinities, userEvents, articles } from '@shared/schema';
import { eq, desc, and, sql } from 'drizzle-orm';

// ============================================
// Affinity Calculation
// ============================================

/**
 * Calculate and update user affinities based on recent events
 * Affinities represent learned user preferences (categories, tags, entities)
 */
export async function calculateUserAffinities(userId: string): Promise<void> {
  console.log(`🔍 [AFFINITY] Calculating affinities for user: ${userId}`);

  // Get user's events from last 90 days
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const events = await db
    .select({
      articleId: userEvents.articleId,
      eventType: userEvents.eventType,
      eventValue: userEvents.eventValue,
      createdAt: userEvents.createdAt,
    })
    .from(userEvents)
    .where(
      and(
        eq(userEvents.userId, userId),
        sql`${userEvents.createdAt} > ${ninetyDaysAgo}`
      )
    )
    .orderBy(desc(userEvents.createdAt));

  if (events.length === 0) {
    console.log(`📊 [AFFINITY] No events found for user ${userId}`);
    return;
  }

  // Get article details (category, tags) for these events
  const articleIds = Array.from(new Set(events.map(e => e.articleId)));
  const articleDetails = await db.query.articles.findMany({
    where: sql`${articles.id} = ANY(${articleIds})`,
    with: {
      articleTags: {
        with: {
          tag: true,
        },
      },
    },
  });

  // Build affinity maps
  const categoryAffinities = new Map<string, number>();
  const tagAffinities = new Map<string, number>();

  // Aggregate event values by category and tag
  events.forEach(event => {
    const article = articleDetails.find(a => a.id === event.articleId);
    if (!article) return;

    // Category affinity
    if (article.categoryId) {
      const current = categoryAffinities.get(article.categoryId) || 0;
      categoryAffinities.set(article.categoryId, current + event.eventValue);
    }

    // Tag affinity
    if (article.articleTags) {
      article.articleTags.forEach((at: any) => {
        const tagSlug = at.tag.slug;
        const current = tagAffinities.get(tagSlug) || 0;
        tagAffinities.set(tagSlug, current + event.eventValue);
      });
    }
  });

  // Normalize scores (0-1 range)
  const maxCategoryScore = Math.max(...Array.from(categoryAffinities.values()), 1);
  const maxTagScore = Math.max(...Array.from(tagAffinities.values()), 1);

  // Store top category affinities
  const topCategories = Array.from(categoryAffinities.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  for (const [categoryId, score] of topCategories) {
    const normalizedScore = score / maxCategoryScore;

    // Check if affinity already exists
    const existing = await db.query.userAffinities.findFirst({
      where: and(
        eq(userAffinities.userId, userId),
        eq(userAffinities.tagType, 'category'),
        eq(userAffinities.tag, categoryId)
      ),
    });

    if (existing) {
      // Update existing
      await db.update(userAffinities)
        .set({
          score: normalizedScore,
          updatedAt: new Date(),
        })
        .where(and(
          eq(userAffinities.userId, userId),
          eq(userAffinities.tag, categoryId)
        ));
    } else {
      // Insert new
      await db.insert(userAffinities).values({
        userId,
        tagType: 'category',
        tag: categoryId,
        score: normalizedScore,
      });
    }
  }

  // Store top tag affinities
  const topTags = Array.from(tagAffinities.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  for (const [tagSlug, score] of topTags) {
    const normalizedScore = score / maxTagScore;

    const existing = await db.query.userAffinities.findFirst({
      where: and(
        eq(userAffinities.userId, userId),
        eq(userAffinities.tagType, 'tag'),
        eq(userAffinities.tag, tagSlug)
      ),
    });

    if (existing) {
      await db.update(userAffinities)
        .set({
          score: normalizedScore,
          updatedAt: new Date(),
        })
        .where(and(
          eq(userAffinities.userId, userId),
          eq(userAffinities.tag, tagSlug)
        ));
    } else {
      await db.insert(userAffinities).values({
        userId,
        tagType: 'tag',
        tag: tagSlug,
        score: normalizedScore,
      });
    }
  }

  console.log(`✅ [AFFINITY] Updated affinities for user ${userId}: ${topCategories.length} categories, ${topTags.length} tags`);
}

/**
 * Get user's top affinities by type
 */
export async function getUserAffinities(
  userId: string,
  affinityType: 'category' | 'tag' | 'entity',
  limit: number = 10
): Promise<Array<{
  tag: string;
  score: number;
}>> {
  const affinities = await db
    .select()
    .from(userAffinities)
    .where(
      and(
        eq(userAffinities.userId, userId),
        eq(userAffinities.tagType, affinityType)
      )
    )
    .orderBy(desc(userAffinities.score))
    .limit(limit);

  return affinities.map(a => ({
    tag: a.tag,
    score: a.score,
  }));
}

/**
 * Batch calculate affinities for multiple users
 * Should be run as a cron job (e.g., daily)
 */
export async function batchCalculateAffinities(userIds: string[]): Promise<void> {
  console.log(`📊 [AFFINITY] Batch calculating affinities for ${userIds.length} users`);

  for (const userId of userIds) {
    try {
      await calculateUserAffinities(userId);
      // Small delay to avoid overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`❌ [AFFINITY] Error calculating affinities for user ${userId}:`, error);
      // Continue with next user
    }
  }

  console.log(`✅ [AFFINITY] Batch affinity calculation completed`);
}

/**
 * Decay old affinities over time
 * Should be run periodically to reduce scores of inactive preferences
 */
export async function decayAffinities(decayFactor: number = 0.9): Promise<void> {
  console.log(`🔄 [AFFINITY] Decaying old affinities (factor: ${decayFactor})`);

  // Decay affinities that haven't been updated in 30+ days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  await db
    .update(userAffinities)
    .set({
      score: sql`${userAffinities.score} * ${decayFactor}`,
      updatedAt: new Date(),
    })
    .where(sql`${userAffinities.updatedAt} < ${thirtyDaysAgo}`);

  console.log(`✅ [AFFINITY] Affinity decay completed`);
}

/**
 * Delete affinities below threshold
 * Clean up weak signals
 */
export async function pruneWeakAffinities(threshold: number = 0.1): Promise<void> {
  console.log(`🧹 [AFFINITY] Pruning affinities below ${threshold}`);

  await db
    .delete(userAffinities)
    .where(sql`${userAffinities.score} < ${threshold}`);

  console.log(`✅ [AFFINITY] Weak affinities pruned`);
}
