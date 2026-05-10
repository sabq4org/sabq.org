import { db } from './db';
import {
  users,
  articles,
  userInterests,
  interests,
  categories,
  userRecommendationPrefs,
  notificationsInbox,
  readingHistory,
  recommendationLog,
} from '@shared/schema';
import { eq, and, desc, gte, inArray, sql, not } from 'drizzle-orm';
import { getPersonalizedRecommendations } from './similarityEngine';

// ============================================
// Daily Digest Engine
// ============================================

interface DigestArticle {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  categorySlug: string | null;
  categoryName: string | null;
  publishedAt: Date;
  estimatedReadTime: number;
  imageUrl: string | null;
}

interface DigestCategory {
  categoryName: string;
  categorySlug: string | null;
  articles: DigestArticle[];
}

interface DailyDigest {
  userId: string;
  userName: string;
  categories: DigestCategory[];
  totalArticles: number;
  totalReadTime: number; // in minutes
  generatedAt: Date;
}

/**
 * Calculate estimated read time based on content length
 * Average reading speed: 200 words per minute in Arabic
 */
function estimateReadTime(content: string | null): number {
  if (!content) return 1;
  
  // Count words (split by whitespace)
  const wordCount = content.trim().split(/\s+/).length;
  
  // Average reading speed: 200 words per minute
  const minutes = Math.ceil(wordCount / 200);
  
  // Minimum 1 minute
  return Math.max(1, minutes);
}

/**
 * Get articles for a user's daily digest
 * Returns articles from the last 24 hours matching user's interests
 */
export async function generateDailyDigest(userId: string): Promise<DailyDigest | null> {
  try {
    // Get user info
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      console.log(`⚠️ [DIGEST] User ${userId} not found`);
      return null;
    }

    // Check if user has daily digest enabled
    const prefs = await db.query.userRecommendationPrefs.findFirst({
      where: eq(userRecommendationPrefs.userId, userId),
    });

    if (prefs && !prefs.dailyDigest) {
      console.log(`⏸️ [DIGEST] User ${userId} has disabled daily digest`);
      return null;
    }

    // Get user's interests (categories)
    const userInterestsList = await db
      .select({
        categoryId: userInterests.categoryId,
      })
      .from(userInterests)
      .where(eq(userInterests.userId, userId));

    if (userInterestsList.length === 0) {
      console.log(`⚠️ [DIGEST] User ${userId} has no interests set`);
      return null;
    }

    const categoryIds = userInterestsList.map(ui => ui.categoryId);

    if (categoryIds.length === 0) {
      console.log(`⚠️ [DIGEST] User ${userId} has no category interests`);
      return null;
    }

    // Get articles from last 24 hours in user's interests
    const yesterday = new Date();
    yesterday.setHours(yesterday.getHours() - 24);

    const recentArticles = await db
      .select()
      .from(articles)
      .where(and(
        eq(articles.status, 'published'),
        gte(articles.publishedAt, yesterday),
        inArray(articles.categoryId, categoryIds)
      ))
      .orderBy(desc(articles.publishedAt))
      .limit(20);

    if (recentArticles.length === 0) {
      console.log(`⚠️ [DIGEST] No recent articles found for user ${userId}`);
      return null;
    }

    // Get category details
    const categoryList = await db
      .select()
      .from(categories)
      .where(inArray(categories.id, categoryIds));

    const categoryMap = new Map(categoryList.map(c => [c.id, c]));

    // Get articles user has already read
    const readArticles = await db
      .select()
      .from(readingHistory)
      .where(and(
        eq(readingHistory.userId, userId),
        gte(readingHistory.readAt, yesterday)
      ));

    const readArticleIds = new Set(readArticles.map(r => r.articleId));

    // Filter out already-read articles
    const unreadArticles = recentArticles.filter(a => !readArticleIds.has(a.id));

    if (unreadArticles.length === 0) {
      console.log(`⚠️ [DIGEST] All recent articles already read by user ${userId}`);
      return null;
    }

    // Group articles by category
    const categoryGroupMap = new Map<string, DigestCategory>();

    for (const article of unreadArticles) {
      const category = article.categoryId ? categoryMap.get(article.categoryId) : null;
      const categorySlug = category?.slug || 'other';
      const categoryName = category?.nameAr || 'أخرى';

      if (!categoryGroupMap.has(categorySlug)) {
        categoryGroupMap.set(categorySlug, {
          categoryName,
          categorySlug: category?.slug || null,
          articles: [],
        });
      }

      const categoryGroup = categoryGroupMap.get(categorySlug)!;
      categoryGroup.articles.push({
        id: article.id,
        title: article.title,
        slug: article.slug,
        excerpt: article.excerpt || '',
        categorySlug: category?.slug || null,
        categoryName: category?.nameAr || null,
        publishedAt: article.publishedAt!,
        estimatedReadTime: estimateReadTime(article.content),
        imageUrl: article.imageUrl,
      });
    }

    // Convert map to array and sort categories by article count
    const digestCategories = Array.from(categoryGroupMap.values()).sort(
      (a, b) => b.articles.length - a.articles.length
    );

    // Calculate total read time
    const totalReadTime = digestCategories.reduce(
      (total, cat) => total + cat.articles.reduce((sum, art) => sum + art.estimatedReadTime, 0),
      0
    );

    const userName = user.firstName 
      ? `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`
      : user.email;

    const digest: DailyDigest = {
      userId,
      userName,
      categories: digestCategories,
      totalArticles: unreadArticles.length,
      totalReadTime,
      generatedAt: new Date(),
    };

    console.log(`✅ [DIGEST] Generated digest for user ${userId}: ${digest.totalArticles} articles, ${digest.totalReadTime} min`);

    return digest;
  } catch (error) {
    console.error(`❌ [DIGEST] Error generating digest for user ${userId}:`, error);
    return null;
  }
}

/**
 * Send daily digest notification to user
 */
export async function sendDailyDigest(userId: string): Promise<boolean> {
  try {
    const digest = await generateDailyDigest(userId);

    if (!digest) {
      return false;
    }

    // Create rich notification with digest summary
    const categorySummary = digest.categories
      .slice(0, 3) // Top 3 categories
      .map(cat => `${cat.categoryName} (${cat.articles.length})`)
      .join(' • ');

    // Prepare metadata with only allowed fields
    const digestData: any = {
      totalArticles: digest.totalArticles,
      totalReadTime: digest.totalReadTime,
      categorySummary,
      generatedAt: digest.generatedAt.toISOString(),
    };

    await db.insert(notificationsInbox).values({
      userId,
      type: 'daily_digest',
      title: '📰 الملخص اليومي',
      body: `${digest.totalArticles} مقالة جديدة في اهتماماتك - وقت القراءة: ${digest.totalReadTime} دقيقة`,
      metadata: digestData,
      read: false,
    });

    console.log(`✅ [DIGEST] Sent daily digest to user ${userId}`);
    return true;
  } catch (error) {
    console.error(`❌ [DIGEST] Error sending digest to user ${userId}:`, error);
    return false;
  }
}

/**
 * Process daily digests for all users who have it enabled
 * Should be run once per day at configured time
 */
export async function processDailyDigests(): Promise<void> {
  console.log('📰 [DIGEST] Starting daily digest processing...');

  try {
    // Get all users with daily digest enabled
    const enabledUsers = await db.query.userRecommendationPrefs.findMany({
      where: eq(userRecommendationPrefs.dailyDigest, true),
    });

    console.log(`📰 [DIGEST] Found ${enabledUsers.length} users with daily digest enabled`);

    let successCount = 0;
    let failCount = 0;

    for (const userPrefs of enabledUsers) {
      try {
        // Check if it's the right time for this user
        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        
        const digestTime = userPrefs.digestTime || '20:30';
        
        // Allow 30-minute window for digest delivery
        const [targetHour, targetMin] = digestTime.split(':').map(Number);
        const targetTimeMinutes = targetHour * 60 + targetMin;
        const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();
        
        const timeDiff = Math.abs(currentTimeMinutes - targetTimeMinutes);
        
        if (timeDiff > 30) {
          console.log(`⏸️ [DIGEST] Skipping user ${userPrefs.userId} - not their digest time yet (${digestTime})`);
          continue;
        }

        // Check if digest was already sent today
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const existingDigest = await db.query.notificationsInbox.findFirst({
          where: and(
            eq(notificationsInbox.userId, userPrefs.userId),
            eq(notificationsInbox.type, 'daily_digest'),
            gte(notificationsInbox.createdAt, todayStart)
          ),
        });

        if (existingDigest) {
          console.log(`⏸️ [DIGEST] User ${userPrefs.userId} already received digest today`);
          continue;
        }

        // Send digest
        const sent = await sendDailyDigest(userPrefs.userId);
        
        if (sent) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (error) {
        console.error(`❌ [DIGEST] Error processing digest for user ${userPrefs.userId}:`, error);
        failCount++;
      }
    }

    console.log(`✅ [DIGEST] Daily digest processing completed: ${successCount} sent, ${failCount} failed`);
  } catch (error) {
    console.error('❌ [DIGEST] Error in daily digest processing:', error);
  }
}

/**
 * Get user's digest preview (for UI display)
 */
export async function getDigestPreview(userId: string): Promise<DailyDigest | null> {
  return generateDailyDigest(userId);
}
