// Story Notifier Service - Send notifications to story followers
import { storage } from "./storage";
import { db } from "./db";
import { notificationsInbox } from "@shared/schema";
import type { Article, StoryFollow } from "@shared/schema";

/**
 * إرسال إشعارات لمتابعي القصة عند إضافة خبر جديد
 */
export async function notifyStoryFollowers(storyId: string, articleId: string): Promise<void> {
  try {
    // جلب معلومات المقال
    const article = await storage.getArticleById(articleId);
    if (!article) {
      console.error("Article not found:", articleId);
      return;
    }

    // جلب معلومات القصة
    const storyData = await storage.getStoryById(storyId);
    if (!storyData) {
      console.error("Story not found:", storyId);
      return;
    }

    // جلب جميع متابعي القصة النشطين
    const allFollowers = await storage.getStoryFollowersByStoryId(storyId);
    
    // لكل متابع، نحدد إذا كان يجب إرساله حسب مستوى المتابعة
    const deliveredTo: string[] = [];

    for (const follow of allFollowers) {
      if (!follow.isActive) continue;

      // تحديد إذا كان يجب الإرسال حسب level
      let shouldNotify = false;
      
      if (follow.level === 'all') {
        shouldNotify = true;
      } else if (follow.level === 'breaking' && article.newsType === 'breaking') {
        shouldNotify = true;
      } else if (follow.level === 'analysis' && article.articleType === 'analysis') {
        shouldNotify = true;
      } else if (follow.level === 'official' && article.newsType === 'breaking') {
        // يمكن تحسين هذا بإضافة حقل "source type" للمقالات
        shouldNotify = true;
      }

      if (!shouldNotify) continue;

      // إرسال إشعار لكل قناة مفعّلة
      const channels = follow.channels || ['inapp'];
      
      for (const channel of channels) {
        if (channel === 'inapp') {
          // إنشاء إشعار في النظام مباشرة
          await db.insert(notificationsInbox).values({
            userId: follow.userId,
            type: 'ArticlePublished',
            title: `تحديث في القصة: ${storyData.title}`,
            body: article.title,
            deeplink: `/article/${article.slug}`,
            read: false,
            metadata: {
              storyId: storyId,
              articleId: article.id,
              articleSlug: article.slug,
              imageUrl: article.imageUrl || undefined,
            },
          });
        }
        
        // يمكن إضافة قنوات أخرى لاحقاً (email, push)
        // else if (channel === 'email') {
        //   await sendEmail(...)
        // }
      }

      deliveredTo.push(follow.userId);
    }

    // تسجيل الإشعار في سجل story_notifications
    if (deliveredTo.length > 0) {
      await storage.createStoryNotification({
        storyId,
        articleId,
        deliveredTo: deliveredTo,
        channel: 'inapp',
        metadata: {
          articleTitle: article.title,
          deliveryTime: new Date().toISOString(),
        }
      });

      console.log(`Story notification sent to ${deliveredTo.length} followers`);
    }
  } catch (error) {
    console.error("Error notifying story followers:", error);
  }
}

/**
 * إشعار متابعي قصة معينة برسالة مخصصة
 */
export async function sendCustomStoryNotification(
  storyId: string,
  title: string,
  message: string,
  filters?: {
    level?: string;
    channels?: string[];
  }
): Promise<number> {
  try {
    const allFollowers = await storage.getStoryFollowersByStoryId(storyId);
    let notifiedCount = 0;

    for (const follow of allFollowers) {
      if (!follow.isActive) continue;

      // تطبيق الفلاتر
      if (filters?.level && follow.level !== filters.level) {
        continue;
      }

      const channels = filters?.channels || follow.channels || ['inapp'];
      
      for (const channel of channels) {
        if (channel === 'inapp') {
          await db.insert(notificationsInbox).values({
            userId: follow.userId,
            type: 'ArticlePublished',
            title,
            body: message,
            read: false,
            metadata: {
              storyId: storyId,
              customNotification: true,
            },
          });
          notifiedCount++;
        }
      }
    }

    return notifiedCount;
  } catch (error) {
    console.error("Error sending custom story notification:", error);
    return 0;
  }
}

/**
 * الحصول على إحصائيات الإشعارات لقصة معينة
 */
export async function getStoryNotificationStats(storyId: string): Promise<{
  totalNotifications: number;
  totalRecipients: number;
  lastNotificationDate?: Date;
}> {
  try {
    const notifications = await storage.getStoryNotifications(storyId);
    
    const totalRecipients = new Set(
      notifications.flatMap(n => n.deliveredTo || [])
    ).size;

    const lastNotification = notifications.length > 0 
      ? notifications[notifications.length - 1]
      : null;

    return {
      totalNotifications: notifications.length,
      totalRecipients,
      lastNotificationDate: lastNotification?.createdAt,
    };
  } catch (error) {
    console.error("Error getting story notification stats:", error);
    return {
      totalNotifications: 0,
      totalRecipients: 0,
    };
  }
}
