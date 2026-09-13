import { registerShutdownHook } from "../shutdown";
import { isLeader } from "../leaderElection";
/**
 * Push Notification Worker
 * 
 * Background job that processes scheduled push campaigns
 * and sends notifications via Firebase Cloud Messaging (FCM)
 * to iOS and Android devices.
 */
import { log } from "../utils/logger";

import { db } from "../db";
import { 
  pushCampaigns, 
  pushDevices, 
  pushSegments,
  pushCampaignEvents,
  users,
  userInterests,
  readingHistory 
} from "@shared/schema";
import { eq, and, lte, inArray, sql, isNull, or, gte } from "drizzle-orm";
import { 
  sendToMultipleDevices,
  sendToTopic,
  isFcmConfigured,
  FCMMessage
} from "../services/fcmService";
import {
  isApnsConfigured,
  sendBatchPushNotifications as sendApnsBatch,
  createCustomNotificationPayload,
} from "../services/apnsService";
// NOTE: Now using APNs for iOS and FCM for Android (hybrid mode)

// Topic prefix - types starting with "topic_" are sent to Firebase Topics
const TOPIC_PREFIX = "topic_";

const PUSH_CHECK_INTERVAL = 15_000; // Bound send-now queue delay.
let processing = false;
let pushWorkerInterval: NodeJS.Timeout | null = null;

/**
 * Start the push worker background job
 * Uses APNs for iOS and FCM for Android (hybrid mode)
 */
export function startPushWorker(): void {
  if (pushWorkerInterval) return;
  const fcmEnabled = isFcmConfigured();
  const apnsEnabled = isApnsConfigured();
  
  if (!fcmEnabled && !apnsEnabled) {
    log.info("[PushWorker] Neither FCM nor APNs configured - push notifications disabled");
    log.info("[PushWorker] Please configure FCM or APNs credentials to enable push notifications");
    return;
  }

  const services = [];
  if (apnsEnabled) services.push("APNs (iOS)");
  if (fcmEnabled) services.push("FCM (Android)");
  
  log.info(`[PushWorker] Push notification worker started (${services.join(" + ")})`);
  
  // Initial check
  processPendingCampaigns();
  
  // Set up interval
  pushWorkerInterval = setInterval(processPendingCampaigns, PUSH_CHECK_INTERVAL);
}

/**
 * Stop the push worker
 */
export function stopPushWorker(): void {
  if (pushWorkerInterval) {
    clearInterval(pushWorkerInterval);
    pushWorkerInterval = null;
    log.info("[PushWorker] Push notification worker stopped");
  }
}

/**
 * Process all pending scheduled campaigns
 */
async function processPendingCampaigns(): Promise<void> {
  if (!isLeader() || processing) return;
  processing = true;
  try {
    // A crashed sender may already have delivered notifications. Quarantine,
    // never blindly retry; confirmed batch counts/events remain for review.
    await db.update(pushCampaigns).set({ status: "delivery_unknown", updatedAt: new Date() })
      .where(and(eq(pushCampaigns.status, "sending"),
        sql`${pushCampaigns.updatedAt} < (clock_timestamp() at time zone 'UTC') - interval '30 minutes'`));
    const now = new Date();
    
    // Find campaigns that are scheduled and ready to send
    const pendingCampaigns = await db
      .select()
      .from(pushCampaigns)
      .where(
        and(
          eq(pushCampaigns.status, "scheduled"),
          lte(pushCampaigns.scheduledAt, now)
        )
      );

    if (pendingCampaigns.length === 0) {
      return;
    }

    log.info(`[PushWorker] Found ${pendingCampaigns.length} campaigns ready to send`);

    for (const campaign of pendingCampaigns) {
      if (!isLeader()) break;
      await processCampaign(campaign);
    }
  } catch (error) {
    console.error("[PushWorker] Error processing campaigns:", error);
  } finally { processing = false; }
}

/**
 * يستخرج slug المقال من deeplink بأي صيغة (`/article/x`، رابط كامل،
 * `sabq://article/x`). المفتاح الصريح `article_slug`/`articleSlug` هو ما
 * تقرؤه التطبيقات مباشرة — الاعتماد على تحليل العميل للرابط وحده كان
 * يُسقط فتح الخبر من نقرة الإشعار على المنصتين (إصلاح 2026-08-02).
 */
function articleSlugFromDeeplink(deeplink?: string | null): string | undefined {
  if (!deeplink) return undefined;
  const match = deeplink.match(/(?:^|\/)article\/([^/?#]+)/);
  return match ? match[1] : undefined;
}

/**
 * Process a single campaign
 */
async function processCampaign(campaign: typeof pushCampaigns.$inferSelect): Promise<void> {
  log.info(`[PushWorker] Processing campaign: ${campaign.id} - ${campaign.name}`);

  try {
    if (!isLeader()) return;
    const [claimed] = await db.update(pushCampaigns)
      .set({ status: "sending", updatedAt: new Date() })
      .where(and(eq(pushCampaigns.id, campaign.id), eq(pushCampaigns.status, "scheduled"),
        lte(pushCampaigns.scheduledAt, new Date())))
      .returning({ id: pushCampaigns.id });
    if (!claimed) return;

    const campaignArticleSlug = articleSlugFromDeeplink(campaign.deeplink);

    // Create FCM message - Arabic only
    const message: FCMMessage = {
      title: campaign.title,
      body: campaign.body,
      imageUrl: campaign.imageUrl || campaign.richMediaUrl || undefined,
      data: {
        campaignId: campaign.id,
        type: campaign.type || "general",
        deeplink: campaign.deeplink || "",
        ...(campaignArticleSlug ? { article_slug: campaignArticleSlug } : {}),
      },
    };

    // Check if this is a topic-based campaign (type starts with "topic_")
    if (campaign.type.startsWith(TOPIC_PREFIX)) {
      const topicName = campaign.type.substring(TOPIC_PREFIX.length);
      
      // For "all_users" topic, send directly to all registered devices
      // Uses APNs for iOS and FCM for Android (hybrid mode)
      if (topicName === "all_users") {
        log.info(`[PushWorker] Sending to ALL registered devices (${topicName})`);
        
        // Get all active devices with platform info
        const allDevices = await db
          .select({ 
            deviceToken: pushDevices.deviceToken,
            platform: pushDevices.platform,
            tokenProvider: pushDevices.tokenProvider
          })
          .from(pushDevices)
          .where(eq(pushDevices.isActive, true));
        
        if (allDevices.length === 0) {
          log.info(`[PushWorker] No active devices found`);
          await db
            .update(pushCampaigns)
            .set({ 
              status: "sent", 
              sentAt: new Date(),
              totalDevices: 0,
              updatedAt: new Date() 
            })
            .where(and(eq(pushCampaigns.id, campaign.id), eq(pushCampaigns.status, "sending")));
          return;
        }
        
        // Split devices by platform
        const iosDevices = allDevices.filter(d => d.platform === 'ios');
        const androidDevices = allDevices.filter(d => d.platform === 'android');
        
        log.info(`[PushWorker] Found ${iosDevices.length} iOS + ${androidDevices.length} Android devices`);
        
        let totalSuccess = 0;
        let totalFailure = 0;
        
        // Send to iOS via APNs
        if (iosDevices.length > 0 && isApnsConfigured()) {
          const apnsPayload = createCustomNotificationPayload(
            campaign.title,
            campaign.body,
            {
              imageUrl: campaign.imageUrl || campaign.richMediaUrl || undefined,
              deeplink: campaign.deeplink || undefined,
              articleSlug: campaignArticleSlug,
              campaignId: campaign.id,
              type: campaign.type || "general",
            }
          );
          
          const iosTokens = iosDevices.map(d => d.deviceToken);
          const apnsResults = await recordDelivery(campaign.id, "sendApnsBatch", () => sendApnsBatch(iosTokens, apnsPayload, campaign.id));
          log.info(`[PushWorker] APNs (iOS): ${apnsResults.success}/${iosDevices.length}`);
          totalSuccess += apnsResults.success;
          totalFailure += apnsResults.failed;
        } else if (iosDevices.length > 0) {
          log.info(`[PushWorker] APNs not configured - skipping ${iosDevices.length} iOS devices`);
        }
        
        // Send to Android via FCM
        if (androidDevices.length > 0 && isFcmConfigured()) {
          const androidTokens = androidDevices.map(d => d.deviceToken);
          const fcmResults = await recordDelivery(campaign.id, "sendToMultipleDevices", () => sendToMultipleDevices(androidTokens, message));
          log.info(`[PushWorker] FCM (Android): ${fcmResults.successCount}/${androidDevices.length}`);
          totalSuccess += fcmResults.successCount;
          totalFailure += fcmResults.failureCount;
        } else if (androidDevices.length > 0) {
          log.info(`[PushWorker] FCM not configured - skipping ${androidDevices.length} Android devices`);
        }
        
        await db
          .update(pushCampaigns)
          .set({
            status: "sent",
            sentAt: new Date(),
            totalDevices: allDevices.length,
            sentCount: totalSuccess,
            failedCount: totalFailure,
            updatedAt: new Date(),
          })
          .where(and(eq(pushCampaigns.id, campaign.id), eq(pushCampaigns.status, "sending")));

        log.info(`[PushWorker] Campaign ${campaign.id} sent to ${totalSuccess}/${allDevices.length} devices`);
        return;
      }
      
      // For other topics, use hybrid approach:
      // - FCM topic messaging for Android devices
      // - Direct APNs for iOS devices subscribed to this topic
      log.info(`[PushWorker] Sending to topic: ${topicName} (hybrid mode)`);
      
      let iosSuccess = 0;
      let iosFailure = 0;
      let iosDeviceCount = 0;
      let androidSuccess = false;
      let androidDeviceCount = 0;
      
      // Get iOS devices subscribed to this topic and send via APNs
      // Topics are stored in users.fcmTopics (JSONB), handle null safely with COALESCE
      const iosTopicDevices = await db
        .select({ 
          deviceToken: pushDevices.deviceToken 
        })
        .from(pushDevices)
        .innerJoin(users, eq(pushDevices.userId, users.id))
        .where(and(
          eq(pushDevices.isActive, true),
          eq(pushDevices.platform, 'ios'),
          sql`COALESCE(${users.fcmTopics}, '[]'::jsonb) @> ${JSON.stringify([topicName])}::jsonb`
        ));
      
      iosDeviceCount = iosTopicDevices.length;
      
      if (iosDeviceCount > 0) {
        if (isApnsConfigured()) {
          const apnsPayload = createCustomNotificationPayload(
            campaign.title,
            campaign.body,
            {
              imageUrl: campaign.imageUrl || campaign.richMediaUrl || undefined,
              deeplink: campaign.deeplink || undefined,
              articleSlug: campaignArticleSlug,
              campaignId: campaign.id,
              type: campaign.type || "general",
            }
          );
          
          const iosTokens = iosTopicDevices.map(d => d.deviceToken);
          const apnsResults = await recordDelivery(campaign.id, "sendApnsBatch", () => sendApnsBatch(iosTokens, apnsPayload, campaign.id));
          log.info(`[PushWorker] APNs topic "${topicName}": ${apnsResults.success}/${iosDeviceCount}`);
          iosSuccess = apnsResults.success;
          iosFailure = apnsResults.failed;
        } else {
          // APNs not configured - count all iOS devices as failures
          log.info(`[PushWorker] APNs not configured - ${iosDeviceCount} iOS devices skipped (counted as failure)`);
          iosFailure = iosDeviceCount;
        }
      }
      
      // Get Android device count for this topic
      const androidTopicDevices = await db
        .select({ 
          deviceToken: pushDevices.deviceToken 
        })
        .from(pushDevices)
        .innerJoin(users, eq(pushDevices.userId, users.id))
        .where(and(
          eq(pushDevices.isActive, true),
          eq(pushDevices.platform, 'android'),
          sql`COALESCE(${users.fcmTopics}, '[]'::jsonb) @> ${JSON.stringify([topicName])}::jsonb`
        ));
      
      androidDeviceCount = androidTopicDevices.length;
      
      // Send to Android via FCM topic (only if FCM is configured)
      if (androidDeviceCount > 0 && isFcmConfigured()) {
        const fcmResult = await recordDelivery(campaign.id, "sendToTopic", () => sendToTopic(topicName, message));
        if (fcmResult.success) {
          log.info(`[PushWorker] FCM topic "${topicName}": sent to ~${androidDeviceCount} Android devices`);
          androidSuccess = true;
        } else {
          log.info(`[PushWorker] FCM topic "${topicName}": ${fcmResult.error}`);
        }
      } else if (androidDeviceCount > 0) {
        log.info(`[PushWorker] FCM not configured - ${androidDeviceCount} Android devices skipped`);
      }
      
      // Calculate totals
      const totalDevices = iosDeviceCount + androidDeviceCount;
      const totalSuccess = iosSuccess + (androidSuccess ? androidDeviceCount : 0);
      const totalFailure = iosFailure + (androidSuccess ? 0 : androidDeviceCount);
      
      await db
        .update(pushCampaigns)
        .set({
          status: "sent",
          sentAt: new Date(),
          totalDevices: totalDevices > 0 ? totalDevices : null,
          sentCount: totalSuccess,
          failedCount: totalFailure,
          updatedAt: new Date(),
        })
        .where(and(eq(pushCampaigns.id, campaign.id), eq(pushCampaigns.status, "sending")));

      log.info(`[PushWorker] Topic campaign ${campaign.id} sent to "${topicName}" - iOS: ${iosSuccess}/${iosDeviceCount}, Android: ${androidSuccess ? androidDeviceCount : 0}/${androidDeviceCount}`);
      return;
    }

    // Get target devices for non-topic campaigns
    const targetDevices = await getTargetDevices(campaign);

    if (targetDevices.length === 0) {
      log.info(`[PushWorker] No devices to send for campaign ${campaign.id}`);
      await db
        .update(pushCampaigns)
        .set({ 
          status: "sent", 
          sentAt: new Date(),
          totalDevices: 0,
          updatedAt: new Date() 
        })
        .where(and(eq(pushCampaigns.id, campaign.id), eq(pushCampaigns.status, "sending")));
      return;
    }

    // Split devices by platform for hybrid APNs/FCM sending
    const iosDevices = targetDevices.filter(d => d.platform === 'ios');
    const androidDevices = targetDevices.filter(d => d.platform === 'android');
    
    log.info(`[PushWorker] Found ${iosDevices.length} iOS + ${androidDevices.length} Android devices`);
    
    let totalSuccess = 0;
    let totalFailure = 0;
    
    // Send to iOS via APNs
    if (iosDevices.length > 0 && isApnsConfigured()) {
      const apnsPayload = createCustomNotificationPayload(
        campaign.title,
        campaign.body,
        {
          imageUrl: campaign.imageUrl || campaign.richMediaUrl || undefined,
          deeplink: campaign.deeplink || undefined,
          articleSlug: campaignArticleSlug,
          campaignId: campaign.id,
          type: campaign.type || "general",
        }
      );
      
      const iosTokens = iosDevices.map(d => d.deviceToken);
      const apnsResults = await recordDelivery(campaign.id, "sendApnsBatch", () => sendApnsBatch(iosTokens, apnsPayload, campaign.id));
      log.info(`[PushWorker] APNs (iOS): ${apnsResults.success}/${iosDevices.length}`);
      totalSuccess += apnsResults.success;
      totalFailure += apnsResults.failed;
    } else if (iosDevices.length > 0) {
      log.info(`[PushWorker] APNs not configured - skipping ${iosDevices.length} iOS devices`);
    }
    
    // Send to Android via FCM
    if (androidDevices.length > 0 && isFcmConfigured()) {
      const androidTokens = androidDevices.map(d => d.deviceToken);
      const fcmResults = await recordDelivery(campaign.id, "sendToMultipleDevices", () => sendToMultipleDevices(androidTokens, message));
      log.info(`[PushWorker] FCM (Android): ${fcmResults.successCount}/${androidDevices.length}`);
      totalSuccess += fcmResults.successCount;
      totalFailure += fcmResults.failureCount;
    } else if (androidDevices.length > 0) {
      log.info(`[PushWorker] FCM not configured - skipping ${androidDevices.length} Android devices`);
    }

    // Update campaign stats
    await db
      .update(pushCampaigns)
      .set({
        status: "sent",
        sentAt: new Date(),
        totalDevices: targetDevices.length,
        sentCount: totalSuccess,
        failedCount: totalFailure,
        updatedAt: new Date(),
      })
      .where(and(eq(pushCampaigns.id, campaign.id), eq(pushCampaigns.status, "sending")));

    log.info(`[PushWorker] Campaign ${campaign.id} sent: ${totalSuccess} success, ${totalFailure} failed`);
  } catch (error) {
    console.error(`[PushWorker] Error processing campaign ${campaign.id}:`, error);
    
    // Mark as failed
    await db
      .update(pushCampaigns)
      .set({ 
        status: "delivery_unknown", // Delivery may have happened; manual reconciliation required
        updatedAt: new Date() 
      })
      .where(and(eq(pushCampaigns.id, campaign.id), eq(pushCampaigns.status, "sending")));
  }
}

/**
 * Get target devices for a campaign based on segmentation
 */
async function getTargetDevices(
  campaign: typeof pushCampaigns.$inferSelect
): Promise<Array<{ deviceToken: string; userId: string | null; tokenProvider: string; platform: string }>> {
  // If targeting all users
  if (campaign.targetAll) {
    return await db
      .select({ 
        deviceToken: pushDevices.deviceToken,
        userId: pushDevices.userId,
        tokenProvider: pushDevices.tokenProvider,
        platform: pushDevices.platform
      })
      .from(pushDevices)
      .where(eq(pushDevices.isActive, true));
  }

  // If targeting a specific segment
  if (campaign.segmentId) {
    const [segment] = await db
      .select()
      .from(pushSegments)
      .where(eq(pushSegments.id, campaign.segmentId))
      .limit(1);

    if (!segment) {
      log.info(`[PushWorker] Segment ${campaign.segmentId} not found`);
      return [];
    }

    return await getDevicesBySegmentCriteria(segment.criteria as any);
  }

  // Default: all active devices
  return await db
    .select({ 
      deviceToken: pushDevices.deviceToken,
      userId: pushDevices.userId,
      tokenProvider: pushDevices.tokenProvider,
      platform: pushDevices.platform
    })
    .from(pushDevices)
    .where(eq(pushDevices.isActive, true));
}

/**
 * Get devices matching segment criteria
 */
async function getDevicesBySegmentCriteria(
  criteria: {
    locations?: string[];
    ageMin?: number;
    ageMax?: number;
    interests?: string[];
    behaviors?: string[];
    registeredAfter?: string;
    registeredBefore?: string;
    lastActiveAfter?: string;
    lastActiveBefore?: string;
  }
): Promise<Array<{ deviceToken: string; userId: string | null; tokenProvider: string; platform: string }>> {
  // Build conditions array
  const conditions: any[] = [eq(pushDevices.isActive, true)];

  // Filter by registration date
  if (criteria.registeredAfter) {
    conditions.push(gte(users.createdAt, new Date(criteria.registeredAfter)));
  }
  if (criteria.registeredBefore) {
    conditions.push(lte(users.createdAt, new Date(criteria.registeredBefore)));
  }

  // Filter by last active date
  if (criteria.lastActiveAfter) {
    conditions.push(gte(pushDevices.lastActiveAt, new Date(criteria.lastActiveAfter)));
  }
  if (criteria.lastActiveBefore) {
    conditions.push(lte(pushDevices.lastActiveAt, new Date(criteria.lastActiveBefore)));
  }

  // Execute query with all conditions
  const devices = await db
    .select({ 
      deviceToken: pushDevices.deviceToken,
      userId: pushDevices.userId,
      tokenProvider: pushDevices.tokenProvider,
      platform: pushDevices.platform
    })
    .from(pushDevices)
    .innerJoin(users, eq(pushDevices.userId, users.id))
    .where(and(...conditions));

  // Filter by interests (category IDs) if specified
  if (criteria.interests && criteria.interests.length > 0) {
    const userIdsWithInterests = await db
      .select({ userId: userInterests.userId })
      .from(userInterests)
      .where(inArray(userInterests.categoryId, criteria.interests));
    
    const matchingUserIds = new Set(userIdsWithInterests.map(u => u.userId));
    return devices.filter(d => d.userId && matchingUserIds.has(d.userId));
  }

  return devices;
}

/**
 * Send an immediate push notification to specific devices
 */
export async function sendImmediatePush(
  title: string,
  body: string,
  options: {
    deviceTokens?: string[];
    userIds?: string[];
    segmentId?: string;
    deeplink?: string;
    imageUrl?: string;
    type?: string;
    priority?: "low" | "normal" | "high" | "critical";
  } = {}
): Promise<{ success: number; failed: number; errors: string[] }> {
  let targetDevices: Array<{ deviceToken: string; tokenProvider: string }> = [];

  // Get devices by tokens (need to look up their provider)
  if (options.deviceTokens && options.deviceTokens.length > 0) {
    const devices = await db
      .select({ deviceToken: pushDevices.deviceToken, tokenProvider: pushDevices.tokenProvider })
      .from(pushDevices)
      .where(inArray(pushDevices.deviceToken, options.deviceTokens));
    targetDevices = devices;
  }
  // Get devices by user IDs
  else if (options.userIds && options.userIds.length > 0) {
    const devices = await db
      .select({ deviceToken: pushDevices.deviceToken, tokenProvider: pushDevices.tokenProvider })
      .from(pushDevices)
      .where(
        and(
          inArray(pushDevices.userId, options.userIds),
          eq(pushDevices.isActive, true)
        )
      );
    targetDevices = devices;
  }
  // Get devices by segment
  else if (options.segmentId) {
    const [segment] = await db
      .select()
      .from(pushSegments)
      .where(eq(pushSegments.id, options.segmentId))
      .limit(1);

    if (segment) {
      const devices = await getDevicesBySegmentCriteria(segment.criteria as any);
      targetDevices = devices.map(d => ({ deviceToken: d.deviceToken, tokenProvider: d.tokenProvider }));
    }
  }

  if (targetDevices.length === 0) {
    return { success: 0, failed: 0, errors: ["No target devices found"] };
  }

  const immediateArticleSlug = articleSlugFromDeeplink(options.deeplink);
  const message: FCMMessage = {
    title,
    body,
    imageUrl: options.imageUrl,
    data: {
      type: options.type || "general",
      deeplink: options.deeplink || "",
      ...(immediateArticleSlug ? { article_slug: immediateArticleSlug } : {}),
    },
  };

  // Filter FCM devices only (Expo tokens no longer supported)
  const fcmDevices = targetDevices.filter(d => d.tokenProvider === 'fcm');
  
  if (fcmDevices.length === 0) {
    return { success: 0, failed: 0, errors: ["No FCM devices found"] };
  }
  
  // Send to FCM devices only
  const fcmTokens = fcmDevices.map(d => d.deviceToken);
  const fcmResults = await sendToMultipleDevices(fcmTokens, message);
  
  return { 
    success: fcmResults.successCount, 
    failed: fcmResults.failureCount, 
    errors: []
  };
}

/**
 * Send breaking news push to all FCM devices
 */
export async function sendBreakingNewsPush(
  article: {
    id: string;
    title: string;
    slug: string;
    excerpt?: string | null;
    imageUrl?: string | null;
  }
): Promise<{ success: number; failed: number }> {
  log.info(`[PushWorker] Sending breaking news push for article: ${article.id}`);

  const allDevices = await db
    .select({
      deviceToken: pushDevices.deviceToken,
      platform: pushDevices.platform,
      tokenProvider: pushDevices.tokenProvider,
    })
    .from(pushDevices)
    .where(eq(pushDevices.isActive, true));

  if (allDevices.length === 0) {
    log.info("[PushWorker] No active devices for breaking news");
    return { success: 0, failed: 0 };
  }

  const iosDevices = allDevices.filter((d) => d.platform === "ios" || d.tokenProvider === "apns");
  const androidDevices = allDevices.filter((d) => d.platform === "android" || d.tokenProvider === "fcm");

  const deeplink = `/article/${article.slug}`;
  let totalSuccess = 0;
  let totalFailed = 0;

  // Send to iOS via APNs
  if (iosDevices.length > 0 && isApnsConfigured()) {
    const apnsPayload = createCustomNotificationPayload(
      "🔴 خبر عاجل",
      article.title,
      {
        imageUrl: article.imageUrl || undefined,
        deeplink,
        articleId: String(article.id),
        articleSlug: article.slug,
        type: "breaking_news",
        priority: "time-sensitive",
      }
    );
    const iosTokens = iosDevices.map((d) => d.deviceToken);
    const apnsResults = await sendApnsBatch(iosTokens, apnsPayload);
    log.info(`[PushWorker] Breaking news APNs (iOS): ${apnsResults.success}/${iosDevices.length}`);
    totalSuccess += apnsResults.success;
    totalFailed += apnsResults.failed;
  } else if (iosDevices.length > 0) {
    log.info(`[PushWorker] APNs not configured - skipping ${iosDevices.length} iOS devices`);
  }

  // Send to Android via FCM
  if (androidDevices.length > 0 && isFcmConfigured()) {
    const message: FCMMessage = {
      title: "🔴 خبر عاجل",
      body: article.title,
      imageUrl: article.imageUrl || undefined,
      data: {
        type: "breaking_news",
        articleId: String(article.id),
        article_slug: article.slug,
        deeplink,
      },
    };
    const androidTokens = androidDevices.map((d) => d.deviceToken);
    const fcmResults = await sendToMultipleDevices(androidTokens, message);
    log.info(`[PushWorker] Breaking news FCM (Android): ${fcmResults.successCount}/${androidDevices.length}`);
    totalSuccess += fcmResults.successCount;
    totalFailed += fcmResults.failureCount;
  } else if (androidDevices.length > 0) {
    log.info(`[PushWorker] FCM not configured - skipping ${androidDevices.length} Android devices`);
  }

  log.info(`[PushWorker] Breaking news sent: ${totalSuccess} success, ${totalFailed} failed`);
  return { success: totalSuccess, failed: totalFailed };
}

export { processPendingCampaigns };

/** Durable provider-attempt journal, without device tokens or message bodies. */
async function recordDelivery<T>(campaignId: string, provider: string, send: () => Promise<T>): Promise<T> {
  if (!isLeader()) throw new Error("Campaign leadership lost before dispatch");
  const [active] = await db.update(pushCampaigns).set({ updatedAt: new Date() })
    .where(and(eq(pushCampaigns.id, campaignId), eq(pushCampaigns.status, "sending")))
    .returning({ id: pushCampaigns.id });
  if (!active) throw new Error("Campaign is no longer owned by sender");
  const [attempt] = await db.insert(pushCampaignEvents).values({ campaignId,
    eventType: "dispatching", metadata: { action: provider } }).returning({ id: pushCampaignEvents.id });
  const result = await send();
  const counts = result as { success?: number | boolean; failed?: number; successCount?: number; failureCount?: number };
  const sent = typeof counts.success === "number" ? counts.success : counts.successCount ?? 0;
  const failed = counts.failed ?? counts.failureCount ?? 0;
  await db.transaction(async tx => {
    await tx.update(pushCampaignEvents).set({ eventType: "dispatch_complete" })
      .where(eq(pushCampaignEvents.id, attempt.id));
    await tx.update(pushCampaigns).set({ sentCount: sql`coalesce(${pushCampaigns.sentCount}, 0) + ${sent}`,
      failedCount: sql`coalesce(${pushCampaigns.failedCount}, 0) + ${failed}`, updatedAt: new Date() })
      .where(and(eq(pushCampaigns.id, campaignId), eq(pushCampaigns.status, "sending")));
  });
  return result;
}

registerShutdownHook("push-worker", async () => {
  stopPushWorker();
  while (processing) await new Promise(resolve => setTimeout(resolve, 25));
}, "drain");
