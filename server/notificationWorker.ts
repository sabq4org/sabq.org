import cron from "node-cron";
import { db } from "./db";
import { eq, and, lte, isNull, sql } from "drizzle-orm";
import { notificationQueue, notificationsInbox, notificationMetrics, articles } from "@shared/schema";
import { storage } from "./storage";
import { invalidatePublishedContent } from "./services/contentInvalidation";
import { broadcastArticlePublished } from "./routes/editorPresence";
import { 
  notificationMemoryService, 
  behaviorSignalService, 
  notificationAnalyticsService,
  runNotificationSystemCleanup 
} from "./notificationMemoryService";

import { retryWithBackoff } from "./utils/retryWithBackoff";

function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries: number = 3
): Promise<T> {
  return retryWithBackoff(fn, label, { maxRetries });
}

async function withTimeout<T>(
  fn: () => Promise<T>,
  label: string,
  timeoutMs: number
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`[${label}] Exceeded max runtime of ${timeoutMs}ms`));
    }, timeoutMs);
    
    fn().then(
      (result) => { clearTimeout(timer); resolve(result); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

function alertCriticalFailure(jobName: string, error: Error): void {
  console.error(`[CRITICAL] Job "${jobName}" failed after all retries: ${error.message}`);
  console.error(`[CRITICAL] Stack: ${error.stack}`);
}

async function runWithConcurrency<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency: number
): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    await Promise.allSettled(batch.map(fn));
  }
}

let isProcessingQueue = false;
let isPublishing = false;
let isProcessingAnnouncements = false;
let isProcessingDigests = false;
let isProcessingRecommendations = false;

async function processNotificationQueue() {
  if (isProcessingQueue) {
    console.log("[NotificationWorker] Skipping - already processing");
    return;
  }
  
  isProcessingQueue = true;
  try {
    console.log("[NotificationWorker] Starting queue processing...");

    const pendingNotifications = await withRetry(
      () => db
        .select()
        .from(notificationQueue)
        .where(
          and(
            eq(notificationQueue.status, "queued"),
            isNull(notificationQueue.sentAt),
            lte(
              sql`COALESCE(${notificationQueue.scheduledAt}, ${notificationQueue.createdAt})`,
              new Date()
            )
          )
        )
        .orderBy(notificationQueue.priority, notificationQueue.createdAt)
        .limit(100),
      "NotificationQueue:FetchPending"
    );

    console.log(`[NotificationWorker] Found ${pendingNotifications.length} notifications to process`);

    await runWithConcurrency(pendingNotifications, async (queueItem) => {
      try {
        const payload = queueItem.payload as any;
        const articleId = payload.articleId;
        
        const memoryType = queueItem.type === 'BreakingNews' ? 'breaking' :
                          queueItem.type === 'InterestMatch' ? 'interest' :
                          queueItem.type === 'BehaviorMatch' ? 'behavior' : 'general';
        
        if (articleId) {
          const wasSent = await notificationMemoryService.wasNotificationSent(
            queueItem.userId,
            articleId,
            memoryType
          );
          
          if (wasSent) {
            console.log(`[NotificationWorker] Skipping duplicate: ${queueItem.type} for user ${queueItem.userId.slice(0, 8)}...`);
            
            await db
              .update(notificationQueue)
              .set({
                sentAt: new Date(),
                status: "skipped",
                errorMessage: "Duplicate notification (memory layer)",
              })
              .where(eq(notificationQueue.id, queueItem.id));
            
            return;
          }
        }
        
        let title = "";
        let body = "";
        let deeplink = payload.deeplink || null;
        let recommendationReason: string | null = null;
        
        if (queueItem.type === "BreakingNews") {
          title = "عاجل";
          body = payload.articleTitle || "خبر عاجل جديد";
          deeplink = `/article/${payload.articleSlug || payload.articleId}`;
          recommendationReason = "breaking_news";
        } else if (queueItem.type === "InterestMatch") {
          title = "مقال جديد";
          body = payload.articleTitle || "مقال جديد في اهتماماتك";
          deeplink = `/article/${payload.articleSlug || payload.articleId}`;
          recommendationReason = payload.matchReason || "interest_match";
        } else if (queueItem.type === "BehaviorMatch") {
          title = "قد يعجبك";
          body = payload.articleTitle || "مقال مقترح بناءً على تفضيلاتك";
          deeplink = `/article/${payload.articleSlug || payload.articleId}`;
          recommendationReason = payload.matchReason || "behavior_match";
        } else if (queueItem.type === "LikedStoryUpdate") {
          title = "تحديث";
          body = payload.articleTitle || "تحديث على مقال أعجبك";
          deeplink = `/article/${payload.articleSlug || payload.articleId}`;
          recommendationReason = "story_update";
        } else if (queueItem.type === "MostReadTodayForYou") {
          title = "الأكثر قراءة";
          body = payload.articleTitle || "الأكثر قراءة اليوم في اهتماماتك";
          deeplink = `/article/${payload.articleSlug || payload.articleId}`;
          recommendationReason = "most_read";
        } else {
          title = "إشعار جديد";
          body = payload.articleTitle || "لديك إشعار جديد";
          deeplink = payload.deeplink || "/";
          console.warn(`[NotificationWorker] Unknown notification type: ${queueItem.type}`);
        }

        const [inboxNotification] = await db
          .insert(notificationsInbox)
          .values({
            userId: queueItem.userId,
            type: queueItem.type,
            title,
            body,
            deeplink,
            read: false,
            metadata: {
              articleId: payload.articleId,
              imageUrl: payload.imageUrl,
              categorySlug: payload.categorySlug,
              recommendationReason,
              scoreAtSend: payload.score,
            },
          })
          .returning();

        await db
          .update(notificationQueue)
          .set({
            sentAt: new Date(),
            status: "sent",
          })
          .where(eq(notificationQueue.id, queueItem.id));

        await db.insert(notificationMetrics).values({
          notificationId: inboxNotification.id,
          userId: queueItem.userId,
          type: queueItem.type,
          opened: false,
          clicked: false,
          dismissed: false,
        });
        
        if (articleId) {
          await notificationMemoryService.recordNotificationSent(
            queueItem.userId,
            articleId,
            memoryType
          );
        }
        
        await notificationAnalyticsService.recordNotificationSend(
          queueItem.userId,
          inboxNotification.id,
          queueItem.type,
          articleId || null,
          payload.score || null,
          recommendationReason
        );

        console.log(`[NotificationWorker] Delivered ${queueItem.type} to user ${queueItem.userId.slice(0, 8)}...`);
      } catch (error) {
        console.error(`[NotificationWorker] Error processing notification ${queueItem.id}:`, error);

        await db
          .update(notificationQueue)
          .set({
            sentAt: new Date(),
            status: "error",
            errorMessage: error instanceof Error ? error.message : "Unknown error",
          })
          .where(eq(notificationQueue.id, queueItem.id));
      }
    }, 5);

    console.log("[NotificationWorker] Queue processing completed");
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    alertCriticalFailure("processNotificationQueue", err);
  } finally {
    isProcessingQueue = false;
  }
}

async function cleanupOldNotifications() {
  try {
    console.log("[NotificationWorker] Starting cleanup of old notifications...");

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const deletedQueue = await withRetry(
      () => db
        .delete(notificationQueue)
        .where(
          and(
            lte(notificationQueue.createdAt, thirtyDaysAgo),
            eq(notificationQueue.status, "sent")
          )
        ),
      "Cleanup:DeleteQueue"
    );

    const deletedInbox = await withRetry(
      () => db
        .delete(notificationsInbox)
        .where(
          and(
            lte(notificationsInbox.createdAt, thirtyDaysAgo),
            eq(notificationsInbox.read, true)
          )
        ),
      "Cleanup:DeleteInbox"
    );

    console.log(`[NotificationWorker] Cleanup completed. Deleted ${deletedQueue.rowCount || 0} queue items and ${deletedInbox.rowCount || 0} inbox items`);
    
    await runNotificationSystemCleanup();
    
  } catch (error) {
    console.error("[NotificationWorker] Error in cleanup:", error);
  }
}

async function publishScheduledArticles() {
  if (isPublishing) {
    console.log("[ScheduledPublisher] Skipping - already publishing");
    return;
  }
  
  isPublishing = true;
  try {
    console.log("[ScheduledPublisher] Checking for scheduled articles...");

    const now = new Date();

    const scheduledArticles = await withRetry(
      () => db
        .select()
        .from(articles)
        .where(
          and(
            eq(articles.status, "scheduled"),
            lte(articles.scheduledAt, now)
          )
        )
        .limit(5),
      "ScheduledPublisher:FetchScheduled"
    );

    console.log(`[ScheduledPublisher] Found ${scheduledArticles.length} articles ready to publish`);

    for (const article of scheduledArticles) {
      await new Promise(resolve => setImmediate(resolve));
      try {
        const publishTime = new Date();
        
        await db
          .update(articles)
          .set({
            status: "published",
            publishedAt: publishTime,
            updatedAt: publishTime,
          })
          .where(eq(articles.id, article.id));

        console.log(`[ScheduledPublisher] Published article: ${article.id} - ${article.title}`);

        // Make the freshly-published article visible immediately on every pod + edge.
        try {
          invalidatePublishedContent({
            articleSlug: article.slug,
            isBreaking: article.newsType === 'breaking',
            reason: `scheduled-publish:${article.id}`,
          });
        } catch (err) {
          console.error(`[ScheduledPublisher] cache invalidation failed for ${article.id}:`, err);
        }

        // Live-toast for editors who happen to be online.
        try {
          broadcastArticlePublished({
            articleId: article.id,
            articleTitle: article.title,
            articleSlug: article.slug || null,
            publisherName: 'جدولة تلقائية',
            publishedAt: publishTime.toISOString(),
          });
        } catch (err) {
          console.error(`[ScheduledPublisher] broadcast failed for ${article.id}:`, err);
        }

        if (article.imageUrl && !article.thumbnailUrl) {
          (async () => {
            try {
              const { generateArticleThumbnail } = await import("./services/thumbnailService");
              const thumbnailUrl = await generateArticleThumbnail(article.id, article.imageUrl!);
              console.log(`[ScheduledPublisher] Thumbnail generated for article: ${article.id} - ${thumbnailUrl}`);
            } catch (err) {
              console.error(`[ScheduledPublisher] Failed to generate thumbnail for article ${article.id}:`, err);
            }
          })();
        }

        (async () => {
          const { matchAndLinkArticle } = await import("./storyMatcher");
          await matchAndLinkArticle(article.id);
          console.log(`[ScheduledPublisher] Linked article to story: ${article.id}`);
        })().catch(error => console.error(`[ScheduledPublisher] Error linking article to story ${article.id}:`, error));

        (async () => {
          const { sendArticleNotification } = await import("./notificationService");
          const notificationType = article.newsType === 'breaking' ? 'breaking' : 
                                   article.isFeatured ? 'featured' : 'published';
          await sendArticleNotification(article, notificationType);
          console.log(`[ScheduledPublisher] Sent ${notificationType} notifications for article: ${article.id}`);
        })().catch(error => console.error(`[ScheduledPublisher] Error sending notifications for article ${article.id}:`, error));

        (async () => {
          const { notifyReporterArticlePublished } = await import("./notificationEngine");
          await notifyReporterArticlePublished(article.id);
          console.log(`[ScheduledPublisher] Reporter in-app notification sent for article: ${article.id}`);
        })().catch(error => console.error(`[ScheduledPublisher] Error sending reporter notification for article ${article.id}:`, error));

        (async () => {
          const { sendReporterPublishEmail } = await import("./services/editorAlerts");
          await sendReporterPublishEmail(article.id);
          console.log(`[ScheduledPublisher] Reporter email sent for article: ${article.id}`);
        })().catch(error => console.error(`[ScheduledPublisher] Error sending reporter email for article ${article.id}:`, error));

        (async () => {
          const { sendEditorPublishAlert, getPublisherName } = await import("./services/editorAlerts");
          const publisherName = article.authorId 
            ? await getPublisherName(article.authorId) 
            : null;
          await sendEditorPublishAlert({
            id: article.id,
            title: article.title,
            slug: article.slug,
            englishSlug: article.englishSlug || undefined,
            authorName: publisherName || "جدولة تلقائية",
            publishedAt: new Date(),
          });
          console.log(`[ScheduledPublisher] Admin WhatsApp notification sent for article: ${article.id}`);
        })().catch(error => console.error(`[ScheduledPublisher] Error sending WhatsApp notification for article ${article.id}:`, error));

        try {
          const { logActivity } = await import("./rbac");
          await logActivity({
            userId: article.authorId,
            action: 'ArticlePublished',
            entityType: 'Article',
            entityId: article.id,
          });
        } catch (error) {
          console.error(`[ScheduledPublisher] Error logging activity for article ${article.id}:`, error);
        }

      } catch (error) {
        console.error(`[ScheduledPublisher] Error publishing article ${article.id}:`, error);
      }
    }

    if (scheduledArticles.length > 0) {
      console.log(`[ScheduledPublisher] Successfully published ${scheduledArticles.length} scheduled articles`);
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    alertCriticalFailure("publishScheduledArticles", err);
  } finally {
    isPublishing = false;
  }
}

async function processDailyDigestsWorker() {
  if (isProcessingDigests) {
    console.log("[DigestWorker] Skipping - already processing");
    return;
  }
  
  isProcessingDigests = true;
  try {
    const { processDailyDigests } = await import('./digestService');
    await processDailyDigests();
  } catch (error) {
    console.error("[DigestWorker] Error processing daily digests:", error);
  } finally {
    isProcessingDigests = false;
  }
}

async function processRecommendationsWorker() {
  if (isProcessingRecommendations) {
    console.log("[REC WORKER] Skipping - already processing");
    return;
  }
  
  isProcessingRecommendations = true;
  try {
    console.log("[REC WORKER] Starting recommendation processing...");
    
    const { userEvents } = await import('@shared/schema');
    const { processUserRecommendations } = await import('./recommendationNotificationService');
    
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const activeUsers = await db
      .selectDistinct({ userId: userEvents.userId })
      .from(userEvents)
      .where(sql`${userEvents.createdAt} > ${oneDayAgo}`)
      .limit(50);
    
    console.log(`[REC WORKER] Found ${activeUsers.length} active users`);
    
    let processed = 0;
    let successful = 0;
    
    await runWithConcurrency(activeUsers, async ({ userId }) => {
      try {
        await processUserRecommendations(userId);
        successful++;
      } catch (error) {
        console.error(`[REC WORKER] Error for user ${userId}:`, error);
      }
      processed++;
    }, 5);
    
    console.log(`[REC WORKER] Processed ${processed} users, ${successful} successful`);
  } catch (error) {
    console.error("[REC WORKER] Error in recommendation processing:", error);
  } finally {
    isProcessingRecommendations = false;
  }
}

async function processScheduledAnnouncements() {
  if (isProcessingAnnouncements) {
    console.log("[AnnouncementScheduler] Skipping - already processing");
    return;
  }
  
  isProcessingAnnouncements = true;
  try {
    await storage.processScheduledAnnouncements();
  } catch (error) {
    console.error("[AnnouncementScheduler] Error processing scheduled announcements:", error);
  } finally {
    isProcessingAnnouncements = false;
  }
}

export function startNotificationWorker() {
  try {
    console.log("[NotificationWorker] Starting notification worker...");

    const scheduledTasks: cron.ScheduledTask[] = [];

    scheduledTasks.push(
      cron.schedule("0,5,10,15,20,25,30,35,40,45,50,55 * * * *", () => {
        withTimeout(() => processNotificationQueue(), "NotificationQueue", 120000).catch(error => {
          console.error("[NotificationWorker] Cron job error:", error);
        });
      })
    );

    scheduledTasks.push(
      cron.schedule("0,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,34,36,38,40,42,44,46,48,50,52,54,56,58 * * * *", () => {
        withTimeout(() => publishScheduledArticles(), "ScheduledPublisher", 180000).catch(error => {
          console.error("[ScheduledPublisher] Cron job error:", error);
        });
      })
    );

    scheduledTasks.push(
      cron.schedule("0 3 * * *", () => {
        withTimeout(() => cleanupOldNotifications(), "Cleanup", 300000).catch(error => {
          console.error("[NotificationWorker] Cleanup cron job error:", error);
        });
      })
    );

    scheduledTasks.push(
      cron.schedule("5 * * * *", () => {
        withTimeout(() => processDailyDigestsWorker(), "DailyDigests", 300000).catch(error => {
          console.error("[DigestWorker] Cron job error:", error);
        });
      })
    );

    scheduledTasks.push(
      cron.schedule("30 */2 * * *", () => {
        withTimeout(() => processRecommendationsWorker(), "Recommendations", 300000).catch(error => {
          console.error("[REC WORKER] Cron job error:", error);
        });
      })
    );

    scheduledTasks.push(
      cron.schedule("2,5,8,11,14,17,20,23,26,29,32,35,38,41,44,47,50,53,56,59 * * * *", () => {
        withTimeout(() => processScheduledAnnouncements(), "AnnouncementScheduler", 120000).catch(error => {
          console.error("[AnnouncementScheduler] Cron job error:", error);
        });
      })
    );

    console.log("[NotificationWorker] Notification worker started successfully");
    console.log("[ScheduledPublisher] Scheduled article publisher started successfully");
    console.log("[DigestWorker] Daily digest worker started successfully");
    console.log("[REC WORKER] Smart recommendation worker started successfully");
    console.log("[AnnouncementScheduler] Announcement scheduler started successfully");
    
    processNotificationQueue().catch(error => {
      console.error("[NotificationWorker] Initial processing error:", error);
    });

    publishScheduledArticles().catch(error => {
      console.error("[ScheduledPublisher] Initial publishing check error:", error);
    });

    processScheduledAnnouncements().catch(error => {
      console.error("[AnnouncementScheduler] Initial scheduling check error:", error);
    });

    function shutdownWorkers() {
      console.log("[NotificationWorker] Graceful shutdown initiated...");
      for (const task of scheduledTasks) {
        task.stop();
      }
      console.log("[NotificationWorker] All scheduled tasks stopped");
    }

    process.on("SIGTERM", shutdownWorkers);
    process.on("SIGINT", shutdownWorkers);
  } catch (error) {
    console.error("[NotificationWorker] Failed to start notification worker:", error);
    throw error;
  }
}
