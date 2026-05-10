import { db } from "./db";
import { 
  users, 
  articles,
  categories,
  userNotificationPrefs,
  userInterests,
  interests,
  reactions,
  bookmarks,
  notificationQueue,
  notificationsInbox,
  notificationMetrics,
} from "@shared/schema";
import { eq, and, or, desc, sql, inArray, gt, lt } from "drizzle-orm";
import { sendReporterScheduleEmail, sendOpinionAuthorScheduleEmail } from "./services/editorAlerts";

interface NotificationPayload {
  articleId?: string;
  articleTitle?: string;
  articleSlug?: string;
  matchedTopic?: string;
  deeplink?: string;
  imageUrl?: string;
}

// Notification type definitions
export const NotificationTypes = {
  BREAKING_NEWS: "BreakingNews",
  INTEREST_MATCH: "InterestMatch",
  LIKED_STORY_UPDATE: "LikedStoryUpdate",
  MOST_READ_TODAY: "MostReadTodayForYou",
  REPORTER_ARTICLE_PUBLISHED: "ReporterArticlePublished",
  REPORTER_ARTICLE_SCHEDULED: "ReporterArticleScheduled",
  OPINION_AUTHOR_ARTICLE_SCHEDULED: "OpinionAuthorArticleScheduled",
} as const;

// Throttle settings: REMOVED - User controls via notification preferences
// If user wants notifications, they get them all
// If user doesn't want them, they turn them off in settings

/**
 * Check if user is in quiet hours
 */
async function isInQuietHours(userId: string): Promise<boolean> {
  const [prefs] = await db
    .select()
    .from(userNotificationPrefs)
    .where(eq(userNotificationPrefs.userId, userId))
    .limit(1);

  if (!prefs || !prefs.quietHoursStart || !prefs.quietHoursEnd) {
    return false;
  }

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTime = currentHour * 60 + currentMinute;

  const [startHour, startMin] = prefs.quietHoursStart.split(":").map(Number);
  const [endHour, endMin] = prefs.quietHoursEnd.split(":").map(Number);
  const startTime = startHour * 60 + startMin;
  const endTime = endHour * 60 + endMin;

  // Handle overnight quiet hours
  if (startTime > endTime) {
    return currentTime >= startTime || currentTime < endTime;
  }

  return currentTime >= startTime && currentTime < endTime;
}

/**
 * Check for duplicate notification
 */
async function isDuplicate(userId: string, articleId: string, type: string): Promise<boolean> {
  const dedupeKey = `${userId}:${articleId}:${type}`;
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Check inbox
  const [existingInbox] = await db
    .select()
    .from(notificationsInbox)
    .where(
      and(
        eq(notificationsInbox.userId, userId),
        eq(sql`${notificationsInbox.metadata}->>'articleId'`, articleId),
        eq(notificationsInbox.type, type),
        gt(notificationsInbox.createdAt, last24h)
      )
    )
    .limit(1);

  if (existingInbox) return true;

  // Check queue
  const [existingQueue] = await db
    .select()
    .from(notificationQueue)
    .where(
      and(
        eq(notificationQueue.userId, userId),
        eq(sql`${notificationQueue.payload}->>'articleId'`, articleId),
        eq(notificationQueue.type, type),
        gt(notificationQueue.createdAt, last24h)
      )
    )
    .limit(1);

  return !!existingQueue;
}

/**
 * Send notification to queue (respecting policies)
 */
async function sendToInbox(
  userId: string,
  type: string,
  title: string,
  body: string,
  payload: NotificationPayload
): Promise<boolean> {
  try {
    // Check duplicate only
    if (payload.articleId) {
      const isDupe = await isDuplicate(userId, payload.articleId, type);
      if (isDupe) {
        console.log(`🔁 Duplicate notification prevented for user ${userId}`);
        return false;
      }
    }

    // Check quiet hours - schedule for later if in quiet hours
    const inQuietHours = await isInQuietHours(userId);
    const scheduledAt = inQuietHours ? new Date(Date.now() + 2 * 60 * 60 * 1000) : null; // Schedule 2 hours later if in quiet hours

    // Add to notification queue (with deduplication via unique constraint)
    const dedupeKey = `${userId}:${payload.articleId || 'general'}:${type}`;
    try {
      await db.insert(notificationQueue).values({
        userId,
        type,
        payload,
        priority: type === "BreakingNews" ? 100 : 50,
        scheduledAt,
        dedupeKey,
        status: "queued",
      });

      if (inQuietHours) {
        console.log(`🌙 User ${userId} in quiet hours - scheduled for later`);
      } else {
        console.log(`✅ Notification queued for user ${userId}: ${type}`);
      }
      return true;
    } catch (insertError: any) {
      // If unique constraint violation, it's already queued (race condition)
      if (insertError.code === '23505') {
        console.log(`🔁 Notification already queued for user ${userId}: ${type}`);
        return false;
      }
      throw insertError;
    }
  } catch (error) {
    console.error(`❌ Failed to queue notification for user ${userId}:`, error);
    return false;
  }
}

/**
 * Handle Breaking News notification
 */
export async function notifyBreakingNews(articleId: string): Promise<void> {
  try {
    const [article] = await db
      .select()
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1);

    if (!article || article.newsType !== "breaking") {
      return;
    }

    // Get all users with breaking news enabled
    const enabledUsers = await db
      .select({ userId: userNotificationPrefs.userId })
      .from(userNotificationPrefs)
      .where(eq(userNotificationPrefs.breaking, true));

    console.log(`📢 Sending breaking news to ${enabledUsers.length} users`);

    for (const { userId } of enabledUsers) {
      await sendToInbox(
        userId,
        NotificationTypes.BREAKING_NEWS,
        "عاجل الآن",
        `خبر عاجل: ${article.title}. تابع التفاصيل حالًا.`,
        {
          articleId: article.id,
          articleTitle: article.title,
          articleSlug: article.slug,
          deeplink: `/news/${article.slug}`,
          imageUrl: article.imageUrl || undefined,
        }
      );
    }
  } catch (error) {
    console.error("Error in notifyBreakingNews:", error);
  }
}

/**
 * Handle Interest Match notification
 */
export async function notifyInterestMatch(articleId: string): Promise<void> {
  try {
    const [article] = await db
      .select()
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1);

    if (!article) {
      return;
    }

    // Get article keywords from SEO
    const articleKeywords = article.seo?.keywords || [];
    if (articleKeywords.length === 0) {
      return;
    }

    // Find users with matching interests (via categories)
    const matchingUsers = await db
      .select({
        userId: userInterests.userId,
        categoryName: categories.nameAr,
      })
      .from(userInterests)
      .innerJoin(categories, eq(userInterests.categoryId, categories.id))
      .innerJoin(userNotificationPrefs, eq(userInterests.userId, userNotificationPrefs.userId))
      .where(
        and(
          eq(userInterests.categoryId, article.categoryId || ''),
          eq(userNotificationPrefs.interest, true)
        )
      );

    console.log(`🎯 Sending interest match to ${matchingUsers.length} users`);

    // Group by user to avoid duplicates
    const userMap = new Map<string, string>();
    for (const { userId, categoryName } of matchingUsers) {
      if (!userMap.has(userId)) {
        userMap.set(userId, categoryName);
      }
    }

    for (const [userId, matchedTopic] of Array.from(userMap.entries())) {
      await sendToInbox(
        userId,
        NotificationTypes.INTEREST_MATCH,
        "قد يهمّك الآن",
        `نشرنا موضوعًا جديدًا عن «${matchedTopic}»: ${article.title}.`,
        {
          articleId: article.id,
          articleTitle: article.title,
          articleSlug: article.slug,
          matchedTopic,
          deeplink: `/news/${article.slug}`,
          imageUrl: article.imageUrl || undefined,
        }
      );
    }
  } catch (error) {
    console.error("Error in notifyInterestMatch:", error);
  }
}

/**
 * Handle Liked Story Update notification
 */
export async function notifyLikedStoryUpdate(articleId: string): Promise<void> {
  try {
    const [article] = await db
      .select()
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1);

    if (!article) {
      return;
    }

    // Find users who liked or bookmarked related articles (same keywords)
    const articleKeywords = article.seo?.keywords || [];
    if (articleKeywords.length === 0) {
      return;
    }

    // Get users who have liked articles with same keywords
    const interestedUsers = await db
      .selectDistinct({ userId: reactions.userId })
      .from(reactions)
      .innerJoin(articles, eq(reactions.articleId, articles.id))
      .innerJoin(userNotificationPrefs, eq(reactions.userId, userNotificationPrefs.userId))
      .where(
        and(
          sql`${articles.seo}->>'keywords' ?| ${articleKeywords}`,
          eq(userNotificationPrefs.likedUpdates, true)
        )
      );

    console.log(`💝 Sending liked story update to ${interestedUsers.length} users`);

    for (const { userId } of interestedUsers) {
      await sendToInbox(
        userId,
        NotificationTypes.LIKED_STORY_UPDATE,
        "تحديث على مادة أعجبتك",
        `تم نشر متابعة/تحديث لـ: ${article.title}. اطّلع على الجديد.`,
        {
          articleId: article.id,
          articleTitle: article.title,
          articleSlug: article.slug,
          deeplink: `/news/${article.slug}`,
          imageUrl: article.imageUrl || undefined,
        }
      );
    }
  } catch (error) {
    console.error("Error in notifyLikedStoryUpdate:", error);
  }
}

/**
 * Daily job: Send "Most Read Today" notifications
 */
export async function notifyMostReadToday(): Promise<void> {
  try {
    // Get users with mostRead enabled
    const enabledUsers = await db
      .select({
        userId: userNotificationPrefs.userId,
      })
      .from(userNotificationPrefs)
      .where(eq(userNotificationPrefs.mostRead, true));

    for (const { userId } of enabledUsers) {
      // Get user interests (via categories)
      const userInterestsList = await db
        .select({ slug: categories.slug })
        .from(userInterests)
        .innerJoin(categories, eq(userInterests.categoryId, categories.id))
        .where(eq(userInterests.userId, userId));

      const userInterestSlugs = userInterestsList.map((i) => i.slug);
      if (userInterestSlugs.length === 0) {
        continue;
      }

      // Find most viewed article today matching user interests
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [topArticle] = await db
        .select()
        .from(articles)
        .where(
          and(
            eq(articles.status, "published"),
            gt(articles.publishedAt, today),
            sql`${articles.seo}->>'keywords' ?| ${userInterestSlugs}`
          )
        )
        .orderBy(desc(articles.views))
        .limit(1);

      if (!topArticle) {
        continue;
      }

      await sendToInbox(
        userId,
        NotificationTypes.MOST_READ_TODAY,
        "الأكثر قراءة اليوم",
        `اليوم أكثر مادة قراءة بين اهتماماتك: ${topArticle.title}. يمكن يهمّك.`,
        {
          articleId: topArticle.id,
          articleTitle: topArticle.title,
          articleSlug: topArticle.slug,
          deeplink: `/news/${topArticle.slug}`,
          imageUrl: topArticle.imageUrl || undefined,
        }
      );
    }

    console.log(`📊 Most Read Today notifications sent to ${enabledUsers.length} users`);
  } catch (error) {
    console.error("Error in notifyMostReadToday:", error);
  }
}

/**
 * Notify reporter when their article is published
 * Sends an in-app notification to the reporter assigned to the article
 */
export async function notifyReporterArticlePublished(articleId: string): Promise<void> {
  // ⏸️ IN-APP NOTIFICATIONS DISABLED - Only emails are enabled
  console.log(`⏸️ [IN-APP] Reporter in-app notifications disabled - using emails only`);
  return;

  console.log(`📰 [REPORTER NOTIFY] Function called with articleId: ${articleId}`);
  try {
    const [article] = await db
      .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        imageUrl: articles.imageUrl,
        reporterId: articles.reporterId,
        authorId: articles.authorId,
      })
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1);

    console.log(`📰 [REPORTER NOTIFY] Article query result:`, article ? { id: article.id, title: article.title, reporterId: article.reporterId, authorId: article.authorId } : 'null');

    if (!article) {
      console.log(`📰 [REPORTER NOTIFY] Article not found: ${articleId}`);
      return;
    }

    // Check if article has a reporter assigned
    const reporterId = article.reporterId || article.authorId;
    if (!reporterId) {
      console.log(`📰 [REPORTER NOTIFY] No reporter/author assigned to article: ${article.title}`);
      return;
    }

    // Get reporter info including notification preference
    const [reporter] = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        notifyOnPublish: users.notifyOnPublish,
      })
      .from(users)
      .where(eq(users.id, reporterId))
      .limit(1);

    if (!reporter) {
      console.log(`📰 [REPORTER NOTIFY] Reporter not found: ${reporterId}`);
      return;
    }

    // Check if reporter has disabled publish notifications
    if (reporter.notifyOnPublish === false) {
      console.log(`📰 [REPORTER NOTIFY] Reporter ${reporter.firstName} ${reporter.lastName} has disabled publish notifications`);
      return;
    }

    console.log(`📰 [REPORTER NOTIFY] Sending notification to reporter: ${reporter.firstName} ${reporter.lastName}`);

    // Send in-app notification
    await sendToInbox(
      reporterId,
      NotificationTypes.REPORTER_ARTICLE_PUBLISHED,
      "تم نشر خبرك",
      `تم نشر خبرك بعنوان: "${article.title}" - يمكنك مشاهدته الآن`,
      {
        articleId: article.id,
        articleTitle: article.title,
        articleSlug: article.slug,
        deeplink: `/news/${article.slug}`,
        imageUrl: article.imageUrl || undefined,
      }
    );

    console.log(`✅ [REPORTER NOTIFY] Notification sent successfully to ${reporter.email}`);
  } catch (error) {
    console.error("❌ Error in notifyReporterArticlePublished:", error);
  }
}

/**
 * Notify reporter when their article is scheduled for publishing
 */
export async function notifyReporterArticleScheduled(articleId: string, scheduledAt: Date): Promise<void> {
  console.log(`📅 [REPORTER SCHEDULE NOTIFY] Function called with articleId: ${articleId}`);
  try {
    const [article] = await db
      .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        imageUrl: articles.imageUrl,
        reporterId: articles.reporterId,
        authorId: articles.authorId,
        articleType: articles.articleType,
      })
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1);

    if (!article) {
      console.log(`📅 [REPORTER SCHEDULE NOTIFY] Article not found: ${articleId}`);
      return;
    }

    // Skip if this is an opinion article (handled by separate function)
    if (article.articleType === 'opinion') {
      console.log(`📅 [REPORTER SCHEDULE NOTIFY] Skipping opinion article: ${articleId}`);
      return;
    }

    // Check if article has a reporter assigned
    const reporterId = article.reporterId || article.authorId;
    if (!reporterId) {
      console.log(`📅 [REPORTER SCHEDULE NOTIFY] No reporter/author assigned to article: ${article.title}`);
      return;
    }

    // Get reporter info
    const [reporter] = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        notifyOnPublish: users.notifyOnPublish,
      })
      .from(users)
      .where(eq(users.id, reporterId))
      .limit(1);

    if (!reporter) {
      console.log(`📅 [REPORTER SCHEDULE NOTIFY] Reporter not found: ${reporterId}`);
      return;
    }

    // Check if reporter has disabled publish notifications
    if (reporter.notifyOnPublish === false) {
      console.log(`📅 [REPORTER SCHEDULE NOTIFY] Reporter ${reporter.firstName} ${reporter.lastName} has disabled publish notifications`);
      return;
    }

    // Format scheduled date/time for Arabic display
    const scheduledDateStr = scheduledAt.toLocaleDateString('ar-SA-u-ca-gregory', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const scheduledTimeStr = scheduledAt.toLocaleTimeString('ar-SA', {
      hour: '2-digit',
      minute: '2-digit',
    });

    console.log(`📅 [REPORTER SCHEDULE NOTIFY] Sending schedule notification to reporter: ${reporter.firstName} ${reporter.lastName}`);

    // Send in-app notification
    await sendToInbox(
      reporterId,
      NotificationTypes.REPORTER_ARTICLE_SCHEDULED,
      "تمت جدولة خبرك",
      `تمت جدولة خبرك "${article.title}" للنشر في ${scheduledDateStr} الساعة ${scheduledTimeStr}`,
      {
        articleId: article.id,
        articleTitle: article.title,
        articleSlug: article.slug,
        deeplink: `/dashboard/articles/${article.id}/edit`,
        imageUrl: article.imageUrl || undefined,
      }
    );

    console.log(`✅ [REPORTER SCHEDULE NOTIFY] Schedule notification sent successfully to ${reporter.email}`);

    // Send email notification (fire-and-forget - don't block on email sending)
    setImmediate(async () => {
      try {
        await sendReporterScheduleEmail(articleId, scheduledAt);
        console.log(`📧 [REPORTER SCHEDULE NOTIFY] Email sent to ${reporter.email}`);
      } catch (emailError) {
        console.error(`📧 [REPORTER SCHEDULE NOTIFY] Email failed:`, emailError);
      }
    });
  } catch (error) {
    console.error("❌ Error in notifyReporterArticleScheduled:", error);
  }
}

/**
 * Notify opinion author when their article is scheduled for publishing
 */
export async function notifyOpinionAuthorArticleScheduled(articleId: string, scheduledAt: Date): Promise<void> {
  console.log(`📅 [OPINION AUTHOR SCHEDULE NOTIFY] Function called with articleId: ${articleId}`);
  try {
    const [article] = await db
      .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        imageUrl: articles.imageUrl,
        authorId: articles.authorId,
        articleType: articles.articleType,
      })
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1);

    if (!article) {
      console.log(`📅 [OPINION AUTHOR SCHEDULE NOTIFY] Article not found: ${articleId}`);
      return;
    }

    // Only process opinion articles
    if (article.articleType !== 'opinion') {
      console.log(`📅 [OPINION AUTHOR SCHEDULE NOTIFY] Not an opinion article: ${articleId}`);
      return;
    }

    // Check if article has an author assigned
    if (!article.authorId) {
      console.log(`📅 [OPINION AUTHOR SCHEDULE NOTIFY] No author assigned to article: ${article.title}`);
      return;
    }

    // Get author info
    const [author] = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        notifyOnPublish: users.notifyOnPublish,
      })
      .from(users)
      .where(eq(users.id, article.authorId))
      .limit(1);

    if (!author) {
      console.log(`📅 [OPINION AUTHOR SCHEDULE NOTIFY] Author not found: ${article.authorId}`);
      return;
    }

    // Check if author has disabled publish notifications
    if (author.notifyOnPublish === false) {
      console.log(`📅 [OPINION AUTHOR SCHEDULE NOTIFY] Author ${author.firstName} ${author.lastName} has disabled publish notifications`);
      return;
    }

    // Format scheduled date/time for Arabic display
    const scheduledDateStr = scheduledAt.toLocaleDateString('ar-SA-u-ca-gregory', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const scheduledTimeStr = scheduledAt.toLocaleTimeString('ar-SA', {
      hour: '2-digit',
      minute: '2-digit',
    });

    console.log(`📅 [OPINION AUTHOR SCHEDULE NOTIFY] Sending schedule notification to author: ${author.firstName} ${author.lastName}`);

    // Send in-app notification
    await sendToInbox(
      article.authorId,
      NotificationTypes.OPINION_AUTHOR_ARTICLE_SCHEDULED,
      "تمت جدولة مقالك",
      `تمت جدولة مقال الرأي "${article.title}" للنشر في ${scheduledDateStr} الساعة ${scheduledTimeStr}`,
      {
        articleId: article.id,
        articleTitle: article.title,
        articleSlug: article.slug,
        deeplink: `/dashboard/articles/${article.id}/edit`,
        imageUrl: article.imageUrl || undefined,
      }
    );

    console.log(`✅ [OPINION AUTHOR SCHEDULE NOTIFY] Schedule notification sent successfully to ${author.email}`);

    // Send email notification (fire-and-forget - don't block on email sending)
    setImmediate(async () => {
      try {
        await sendOpinionAuthorScheduleEmail(articleId, scheduledAt);
        console.log(`📧 [OPINION AUTHOR SCHEDULE NOTIFY] Email sent to ${author.email}`);
      } catch (emailError) {
        console.error(`📧 [OPINION AUTHOR SCHEDULE NOTIFY] Email failed:`, emailError);
      }
    });
  } catch (error) {
    console.error("❌ Error in notifyOpinionAuthorArticleScheduled:", error);
  }
}

/**
 * Generic function to create a notification based on article publication
 */
export async function createNotification(params: {
  type: "BREAKING_NEWS" | "NEW_ARTICLE" | "TRENDING_TOPIC" | "PERSONALIZED_RECOMMENDATION";
  data: {
    articleId: string;
    articleTitle: string;
    articleSlug: string;
    categoryId?: string | null;
    newsType?: string;
  };
}): Promise<void> {
  // ⏸️ PUSH NOTIFICATIONS DISABLED - Only emails are enabled
  console.log(`⏸️ [PUSH] Push notifications disabled - using emails only`);
  return;
}
