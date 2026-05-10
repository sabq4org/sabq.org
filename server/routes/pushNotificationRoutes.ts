/**
 * Push Notification Admin API Routes
 * 
 * Endpoints for managing push notification campaigns, segments, and analytics.
 */

import { Router, Request, Response } from "express";
import { db } from "../db";
import { 
  pushCampaigns, 
  pushSegments, 
  pushDevices,
  pushCampaignEvents,
  pushNotificationLogs,
  articles,
} from "@shared/schema";
import { eq, desc, sql, count, gte, and, or, ilike } from "drizzle-orm";
import { sendImmediatePush } from "../jobs/pushWorker";
import { isFcmConfigured, sendToTopic, getPushStats, subscribeToTopic, sendToMultipleDevices } from "../services/fcmService";
import { isApnsConfigured, sendBatchPushNotifications as sendApnsBatch, createCustomNotificationPayload } from "../services/apnsService";

const router = Router();

// ==========================================
// Get FCM Status
// GET /api/admin/push/status
// ==========================================
router.get("/status", async (req: Request, res: Response) => {
  try {
    const configured = isFcmConfigured();
    
    const [deviceStats] = await db
      .select({
        total: count(),
        active: sql<number>`count(*) filter (where ${pushDevices.isActive} = true)`,
        ios: sql<number>`count(*) filter (where ${pushDevices.platform} = 'ios')`,
        android: sql<number>`count(*) filter (where ${pushDevices.platform} = 'android')`,
      })
      .from(pushDevices);

    res.json({
      configured,
      provider: "firebase",
      environment: process.env.NODE_ENV === "development" ? "development" : "production",
      devices: deviceStats,
    });
  } catch (error) {
    console.error("[Push API] status error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ==========================================
// Quick Send Notification for Article
// POST /api/admin/push/quick-send
// إرسال سريع للإشعار من صفحة المقالات - يرسل مباشرة لجميع الأجهزة
// Hybrid: APNs for iOS + FCM for Android
// ==========================================
router.post("/quick-send", async (req: Request, res: Response) => {
  try {
    const { articleId } = req.body;

    if (!articleId) {
      return res.status(400).json({ error: "معرف المقال مطلوب" });
    }

    const fcmEnabled = isFcmConfigured();
    const apnsEnabled = isApnsConfigured();

    if (!fcmEnabled && !apnsEnabled) {
      return res.status(400).json({ error: "خدمة الإشعارات غير مفعلة (لا FCM ولا APNs)" });
    }

    // Get article info
    const [article] = await db
      .select({
        id: articles.id,
        title: articles.title,
        excerpt: articles.excerpt,
        slug: articles.slug,
        imageUrl: articles.imageUrl,
      })
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1);

    if (!article) {
      return res.status(404).json({ error: "المقال غير موجود" });
    }

    // Get all active devices split by platform
    const allDevices = await db
      .select({ 
        deviceToken: pushDevices.deviceToken,
        platform: pushDevices.platform
      })
      .from(pushDevices)
      .where(eq(pushDevices.isActive, true));

    if (allDevices.length === 0) {
      return res.status(400).json({ error: "لا توجد أجهزة مسجلة" });
    }

    const iosDevices = allDevices.filter(d => d.platform === 'ios');
    const androidDevices = allDevices.filter(d => d.platform === 'android');

    console.log(`[Push API] Quick-send: ${iosDevices.length} iOS + ${androidDevices.length} Android devices`);

    let totalSuccess = 0;
    let totalFailed = 0;
    const deeplink = `/article/${article.slug}`;

    // Send to iOS via APNs
    if (iosDevices.length > 0 && apnsEnabled) {
      const apnsPayload = createCustomNotificationPayload(
        "خبر جديد من سبق",
        article.title,
        {
          imageUrl: article.imageUrl || undefined,
          deeplink,
          articleId: String(article.id),
          type: "article",
        }
      );
      
      const iosTokens = iosDevices.map(d => d.deviceToken);
      const apnsResults = await sendApnsBatch(iosTokens, apnsPayload);
      console.log(`[Push API] APNs (iOS): ${apnsResults.success}/${iosDevices.length}`);
      totalSuccess += apnsResults.success;
      totalFailed += apnsResults.failed;
    } else if (iosDevices.length > 0) {
      console.log(`[Push API] APNs not configured - skipping ${iosDevices.length} iOS devices`);
      totalFailed += iosDevices.length;
    }

    // Send to Android via FCM
    if (androidDevices.length > 0 && fcmEnabled) {
      const androidTokens = androidDevices.map(d => d.deviceToken);
      const fcmResults = await sendToMultipleDevices(androidTokens, {
        title: "خبر جديد من سبق",
        body: article.title,
        imageUrl: article.imageUrl || undefined,
        data: {
          type: "article",
          articleId: String(article.id),
          deeplink,
        },
      });
      console.log(`[Push API] FCM (Android): ${fcmResults.successCount}/${androidDevices.length}`);
      totalSuccess += fcmResults.successCount;
      totalFailed += fcmResults.failureCount;
    } else if (androidDevices.length > 0) {
      console.log(`[Push API] FCM not configured - skipping ${androidDevices.length} Android devices`);
      totalFailed += androidDevices.length;
    }

    console.log(`[Push API] Quick notification sent for article: ${article.id} (${totalSuccess}/${allDevices.length} devices)`);
    
    // Create a campaign record for tracking
    const now = new Date();
    const [campaign] = await db
      .insert(pushCampaigns)
      .values({
        name: article.title.substring(0, 100),
        type: "topic_all_users",
        title: "خبر جديد من سبق",
        titleAr: "خبر جديد من سبق",
        body: article.title,
        bodyAr: article.title,
        imageUrl: article.imageUrl || null,
        deeplink,
        articleId: article.id,
        targetAll: true,
        status: "sent",
        scheduledAt: now,
        sentAt: now,
        totalDevices: allDevices.length,
        sentCount: totalSuccess,
        failedCount: totalFailed,
        createdBy: (req as any).user?.id || null,
      })
      .returning();
    
    console.log(`[Push API] Campaign record created: ${campaign.id}`);
    
    res.json({ 
      success: true, 
      message: `تم إرسال الإشعار إلى ${totalSuccess} جهاز`,
      campaignId: campaign.id,
      stats: {
        total: allDevices.length,
        success: totalSuccess,
        failed: totalFailed,
        ios: iosDevices.length,
        android: androidDevices.length,
      }
    });
  } catch (error) {
    console.error("[Push API] quick-send error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ==========================================
// List Campaigns
// GET /api/admin/push/campaigns
// ==========================================
router.get("/campaigns", async (req: Request, res: Response) => {
  try {
    const { limit = "20", offset = "0" } = req.query;
    
    const campaigns = await db
      .select()
      .from(pushCampaigns)
      .orderBy(desc(pushCampaigns.createdAt))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    const [{ total }] = await db
      .select({ total: count() })
      .from(pushCampaigns);

    res.json({ campaigns, total });
  } catch (error) {
    console.error("[Push API] campaigns list error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ==========================================
// Get Single Campaign
// GET /api/admin/push/campaigns/:id
// ==========================================
router.get("/campaigns/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const [campaign] = await db
      .select()
      .from(pushCampaigns)
      .where(eq(pushCampaigns.id, id))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    res.json(campaign);
  } catch (error) {
    console.error("[Push API] campaign get error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ==========================================
// Create Campaign
// POST /api/admin/push/campaigns
// ==========================================
router.post("/campaigns", async (req: Request, res: Response) => {
  try {
    const {
      name,
      type,
      title,
      titleAr,
      body,
      bodyAr,
      imageUrl,
      deeplink,
      articleId,
      segmentId,
      targetAll = false,
      scheduledAt,
      priority = "normal",
      badge,
      sound = "default",
      richMediaUrl,
      actionButtons,
    } = req.body;

    // Require Arabic title and body (or fallback to English)
    const finalTitle = titleAr || title;
    const finalBody = bodyAr || body;

    if (!name || !type || !finalTitle || !finalBody) {
      return res.status(400).json({ 
        error: "الاسم ونوع الحملة والعنوان والمحتوى مطلوبة" 
      });
    }

    const userId = (req as any).user?.id;

    const [campaign] = await db
      .insert(pushCampaigns)
      .values({
        name,
        type,
        title: title || titleAr, // Fallback to Arabic if English not provided
        titleAr: titleAr || title, // Fallback to English if Arabic not provided
        body: body || bodyAr,
        bodyAr: bodyAr || body,
        imageUrl,
        deeplink,
        articleId,
        segmentId,
        targetAll,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        status: scheduledAt ? "scheduled" : "draft",
        priority,
        badge,
        sound,
        richMediaUrl,
        actionButtons,
        createdBy: userId,
      })
      .returning();

    res.status(201).json(campaign);
  } catch (error) {
    console.error("[Push API] campaign create error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ==========================================
// Update Campaign
// PATCH /api/admin/push/campaigns/:id
// ==========================================
router.patch("/campaigns/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const [existing] = await db
      .select({ status: pushCampaigns.status })
      .from(pushCampaigns)
      .where(eq(pushCampaigns.id, id))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    if (existing.status === "sent" || existing.status === "sending") {
      return res.status(400).json({ error: "Cannot update sent campaigns" });
    }

    if (updates.scheduledAt) {
      updates.scheduledAt = new Date(updates.scheduledAt);
      if (!updates.status) {
        updates.status = "scheduled";
      }
    }

    updates.updatedAt = new Date();

    const [campaign] = await db
      .update(pushCampaigns)
      .set(updates)
      .where(eq(pushCampaigns.id, id))
      .returning();

    res.json(campaign);
  } catch (error) {
    console.error("[Push API] campaign update error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ==========================================
// Send Campaign Now
// POST /api/admin/push/campaigns/:id/send
// ==========================================
router.post("/campaigns/:id/send", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [campaign] = await db
      .select()
      .from(pushCampaigns)
      .where(eq(pushCampaigns.id, id))
      .limit(1);

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    if (campaign.status === "sent") {
      return res.status(400).json({ error: "Campaign already sent" });
    }

    await db
      .update(pushCampaigns)
      .set({ 
        status: "scheduled", 
        scheduledAt: new Date(),
        updatedAt: new Date() 
      })
      .where(eq(pushCampaigns.id, id));

    res.json({ success: true, message: "Campaign queued for immediate sending" });
  } catch (error) {
    console.error("[Push API] campaign send error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ==========================================
// Delete Campaign
// DELETE /api/admin/push/campaigns/:id
// ==========================================
router.delete("/campaigns/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await db
      .delete(pushCampaigns)
      .where(eq(pushCampaigns.id, id));

    res.json({ success: true });
  } catch (error) {
    console.error("[Push API] campaign delete error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ==========================================
// List Segments
// GET /api/admin/push/segments
// ==========================================
router.get("/segments", async (req: Request, res: Response) => {
  try {
    const segments = await db
      .select()
      .from(pushSegments)
      .orderBy(desc(pushSegments.createdAt));

    res.json(segments);
  } catch (error) {
    console.error("[Push API] segments list error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ==========================================
// Create Segment
// POST /api/admin/push/segments
// ==========================================
router.post("/segments", async (req: Request, res: Response) => {
  try {
    const { name, nameAr, description, criteria } = req.body;

    if (!name || !criteria) {
      return res.status(400).json({ error: "name and criteria are required" });
    }

    const userId = (req as any).user?.id;

    const [segment] = await db
      .insert(pushSegments)
      .values({
        name,
        nameAr,
        description,
        criteria,
        createdBy: userId,
      })
      .returning();

    res.status(201).json(segment);
  } catch (error) {
    console.error("[Push API] segment create error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ==========================================
// Update Segment
// PATCH /api/admin/push/segments/:id
// ==========================================
router.patch("/segments/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    updates.updatedAt = new Date();

    const [segment] = await db
      .update(pushSegments)
      .set(updates)
      .where(eq(pushSegments.id, id))
      .returning();

    if (!segment) {
      return res.status(404).json({ error: "Segment not found" });
    }

    res.json(segment);
  } catch (error) {
    console.error("[Push API] segment update error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ==========================================
// Delete Segment
// DELETE /api/admin/push/segments/:id
// ==========================================
router.delete("/segments/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await db
      .delete(pushSegments)
      .where(eq(pushSegments.id, id));

    res.json({ success: true });
  } catch (error) {
    console.error("[Push API] segment delete error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ==========================================
// Get Analytics Overview
// GET /api/admin/push/analytics
// ==========================================
router.get("/analytics", async (req: Request, res: Response) => {
  try {
    const { days = "30" } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days as string));

    const campaignStats = await db
      .select({
        totalCampaigns: count(),
        totalSent: sql<number>`sum(${pushCampaigns.sentCount})`,
        totalDelivered: sql<number>`sum(${pushCampaigns.deliveredCount})`,
        totalOpened: sql<number>`sum(${pushCampaigns.openedCount})`,
        totalClicked: sql<number>`sum(${pushCampaigns.clickedCount})`,
        totalFailed: sql<number>`sum(${pushCampaigns.failedCount})`,
      })
      .from(pushCampaigns)
      .where(gte(pushCampaigns.createdAt, startDate));

    const [deviceStats] = await db
      .select({
        total: count(),
        active: sql<number>`count(*) filter (where ${pushDevices.isActive} = true)`,
      })
      .from(pushDevices);

    const recentCampaigns = await db
      .select({
        id: pushCampaigns.id,
        name: pushCampaigns.name,
        type: pushCampaigns.type,
        status: pushCampaigns.status,
        sentCount: pushCampaigns.sentCount,
        openedCount: pushCampaigns.openedCount,
        sentAt: pushCampaigns.sentAt,
      })
      .from(pushCampaigns)
      .where(eq(pushCampaigns.status, "sent"))
      .orderBy(desc(pushCampaigns.sentAt))
      .limit(10);

    res.json({
      campaigns: campaignStats[0],
      devices: deviceStats,
      recentCampaigns,
    });
  } catch (error) {
    console.error("[Push API] analytics error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ==========================================
// Get Campaign Events
// GET /api/admin/push/campaigns/:id/events
// ==========================================
router.get("/campaigns/:id/events", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { limit = "100", offset = "0" } = req.query;

    const events = await db
      .select()
      .from(pushCampaignEvents)
      .where(eq(pushCampaignEvents.campaignId, id))
      .orderBy(desc(pushCampaignEvents.createdAt))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    res.json(events);
  } catch (error) {
    console.error("[Push API] campaign events error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ==========================================
// Send Test Push
// POST /api/admin/push/test
// ==========================================
router.post("/test", async (req: Request, res: Response) => {
  try {
    const { deviceToken, title, titleAr, body, bodyAr, deeplink, imageUrl } = req.body;

    // Accept Arabic or English
    const finalTitle = titleAr || title;
    const finalBody = bodyAr || body;

    if (!deviceToken || !finalTitle || !finalBody) {
      return res.status(400).json({ 
        error: "deviceToken والعنوان والمحتوى مطلوبة" 
      });
    }

    const result = await sendImmediatePush(finalTitle, finalBody, {
      deviceTokens: [deviceToken],
      deeplink,
      imageUrl,
      type: "test",
    });

    res.json(result);
  } catch (error) {
    console.error("[Push API] test push error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ==========================================
// سجلات الإشعارات التفصيلية
// GET /api/admin/push/logs
// ==========================================
router.get("/logs", async (req: Request, res: Response) => {
  try {
    const { 
      limit = "50", 
      offset = "0",
      status,
      errorCategory,
      operationType,
      days = "7"
    } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days as string));
    
    let conditions = [gte(pushNotificationLogs.createdAt, startDate)];
    
    if (status) {
      conditions.push(eq(pushNotificationLogs.status, status as string));
    }
    if (errorCategory) {
      conditions.push(eq(pushNotificationLogs.errorCategory, errorCategory as string));
    }
    if (operationType) {
      conditions.push(eq(pushNotificationLogs.operationType, operationType as string));
    }
    
    const logs = await db
      .select()
      .from(pushNotificationLogs)
      .where(and(...conditions))
      .orderBy(desc(pushNotificationLogs.createdAt))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));
    
    const [{ total }] = await db
      .select({ total: count() })
      .from(pushNotificationLogs)
      .where(and(...conditions));
    
    res.json({ logs, total, limit: parseInt(limit as string), offset: parseInt(offset as string) });
  } catch (error) {
    console.error("[Push API] logs error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ==========================================
// إحصائيات الإشعارات المفصلة
// GET /api/admin/push/logs/stats
// ==========================================
router.get("/logs/stats", async (req: Request, res: Response) => {
  try {
    const { days = "7" } = req.query;
    const stats = await getPushStats(parseInt(days as string));
    res.json(stats);
  } catch (error) {
    console.error("[Push API] logs stats error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ==========================================
// الأخطاء الأخيرة
// GET /api/admin/push/logs/errors
// ==========================================
router.get("/logs/errors", async (req: Request, res: Response) => {
  try {
    const { limit = "50", days = "7" } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days as string));
    
    const errors = await db
      .select()
      .from(pushNotificationLogs)
      .where(
        and(
          eq(pushNotificationLogs.status, 'failed'),
          gte(pushNotificationLogs.createdAt, startDate)
        )
      )
      .orderBy(desc(pushNotificationLogs.createdAt))
      .limit(parseInt(limit as string));
    
    // تصنيف الأخطاء
    const errorSummary = await db
      .select({
        category: pushNotificationLogs.errorCategory,
        count: count(),
      })
      .from(pushNotificationLogs)
      .where(
        and(
          eq(pushNotificationLogs.status, 'failed'),
          gte(pushNotificationLogs.createdAt, startDate)
        )
      )
      .groupBy(pushNotificationLogs.errorCategory);
    
    res.json({ 
      errors, 
      summary: errorSummary.reduce((acc, item) => {
        if (item.category) {
          acc[item.category] = item.count;
        }
        return acc;
      }, {} as Record<string, number>)
    });
  } catch (error) {
    console.error("[Push API] logs errors error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ==========================================
// سجل إشعار محدد
// GET /api/admin/push/logs/:id
// ==========================================
router.get("/logs/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const [log] = await db
      .select()
      .from(pushNotificationLogs)
      .where(eq(pushNotificationLogs.id, id))
      .limit(1);
    
    if (!log) {
      return res.status(404).json({ error: "السجل غير موجود" });
    }
    
    res.json(log);
  } catch (error) {
    console.error("[Push API] log detail error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ==========================================
// Subscribe all devices to a topic
// POST /api/admin/push/subscribe-all
// ==========================================
router.post("/subscribe-all", async (req: Request, res: Response) => {
  try {
    const { topic = "all_users" } = req.body;
    
    // Get all active devices
    const devices = await db
      .select({ id: pushDevices.id, token: pushDevices.deviceToken })
      .from(pushDevices)
      .where(eq(pushDevices.isActive, true));
    
    if (devices.length === 0) {
      return res.json({
        success: true,
        message: "No active devices found",
        subscribed: 0,
        failed: 0,
      });
    }
    
    let subscribed = 0;
    let failed = 0;
    const errors: string[] = [];
    
    // Subscribe each device
    for (const device of devices) {
      try {
        const result = await subscribeToTopic(device.token, topic);
        if (result.success) {
          subscribed++;
          console.log(`[Push API] Device ${device.id} subscribed to ${topic}`);
        } else {
          failed++;
          errors.push(`Device ${device.id}: ${result.error}`);
        }
      } catch (error: any) {
        failed++;
        errors.push(`Device ${device.id}: ${error.message}`);
      }
    }
    
    console.log(`[Push API] Subscribe all to ${topic}: ${subscribed} success, ${failed} failed`);
    
    res.json({
      success: true,
      topic,
      total: devices.length,
      subscribed,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("[Push API] subscribe-all error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
