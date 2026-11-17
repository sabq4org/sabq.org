import { and, eq, or, inArray } from "drizzle-orm";
import { articles, enArticles, pushDevices, userNotificationPrefs, botEditorOperations } from "@shared/schema";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { acquirePushBroadcast, PushBroadcastCapacityError } from "./pushBroadcastCoordinator";
import { createCustomNotificationPayload, getApnsStatus, sendPushNotification } from "./apnsService";
import { isFcmConfigured, sendToFcmTargets } from "./fcmService";
import { createPushBroadcastPacer } from "./pushBroadcastPacer";
import { recordBotEditorOperation } from "./botEditorOperationsAudit";
import { recordBotEditorAudit } from "./botEditorAudit";
import { SABQ_READER_BUNDLE_ID } from "./deviceRegistrationPolicy";
import { SABQ_ANDROID_BUNDLE_IDS } from "./fcmRouting";

export class BotEditorPushError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: { pushId: string }) { super(message); }
}

export function validateBotPushRequest(language: string, articleId: string, body: unknown): asserts language is "ar" | "en" {
  if (language !== "ar" && language !== "en") throw new BotEditorPushError(400, "invalid_language", "لغة غير مدعومة");
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(articleId)) throw new BotEditorPushError(400, "invalid_article_id", "معرف الخبر غير صالح");
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length) throw new BotEditorPushError(400, "invalid_body", "يجب أن يكون الطلب كائنًا فارغًا");
}

export function isEligibleBotPushDevice(device: { platform: string; bundleId: string | null; locale: string | null; tokenProvider: string; breaking: boolean | null }, language: "ar" | "en") {
  const locale = device.locale?.toLowerCase().split(/[-_]/)[0];
  if (locale !== language || device.breaking === false) return false;
  return (device.platform === "ios" && device.tokenProvider === "apns" && device.bundleId === SABQ_READER_BUNDLE_ID) ||
    (device.platform === "android" && device.tokenProvider === "fcm" && device.bundleId !== null && SABQ_ANDROID_BUNDLE_IDS.has(device.bundleId));
}

/** At most one attempt per article and language. A crash or uncertain transport never retries automatically. */
export async function pushBotArticle(language: string, articleId: string, body: unknown, actorId: string | null) {
  validateBotPushRequest(language, articleId, body);
  let lease;
  try { lease = acquirePushBroadcast("news"); } catch (error) {
    if (error instanceof PushBroadcastCapacityError) throw new BotEditorPushError(429, "push_broadcast_capacity", "يوجد بث قيد التنفيذ، حاول لاحقًا");
    throw error;
  }
  try {
    const { article, pushId, devices } = await db.transaction(async tx => {
      const table = language === "ar" ? articles : enArticles;
      const [article]: any[] = await tx.select().from(table).where(eq(table.id, articleId)).limit(1).for("update");
      if (!article) throw new BotEditorPushError(404, "article_not_found", "الخبر غير موجود");
      if (article.status !== "published" || article.newsType !== "breaking") throw new BotEditorPushError(409, "article_not_published_breaking", "يلزم أن يكون الخبر منشورًا وعاجلًا");
      if (article.articleType !== "news" && !(article.articleType === "infographic" && (language === "ar" ? article.source === "bot" : article.seoMetadata?.source === "bot"))) throw new BotEditorPushError(403, "unsupported_article_type", "نوع المادة غير مدعوم");
      if (language === "ar" && (!article.slug || !/^[\p{Script=Arabic}A-Za-z0-9_\u064B-\u065F\u0670-]{1,200}$/u.test(article.slug))) throw new BotEditorPushError(422, "invalid_article_slug", "رابط الخبر غير مدعوم في التطبيق");
      const devices = await tx.select({
        deviceToken: pushDevices.deviceToken, platform: pushDevices.platform, bundleId: pushDevices.bundleId,
      }).from(pushDevices).leftJoin(userNotificationPrefs, eq(pushDevices.userId, userNotificationPrefs.userId))
        .where(and(eq(pushDevices.isActive, true), sql`${userNotificationPrefs.breaking} IS NOT FALSE`,
          sql`split_part(replace(lower(${pushDevices.locale}), '_', '-'), '-', 1) = ${language}`,
          or(and(eq(pushDevices.platform, "ios"), eq(pushDevices.tokenProvider, "apns"), eq(pushDevices.bundleId, SABQ_READER_BUNDLE_ID)),
            and(eq(pushDevices.platform, "android"), eq(pushDevices.tokenProvider, "fcm"), inArray(pushDevices.bundleId, [...SABQ_ANDROID_BUNDLE_IDS])))));
      if (!devices.length) throw new BotEditorPushError(409, "no_eligible_devices", "لا توجد أجهزة مؤهلة للإشعار");
      if (devices.some(d => d.platform === "ios") && !getApnsStatus().configured) throw new BotEditorPushError(503, "apns_unavailable", "خدمة إشعارات iOS غير مفعلة");
      if (devices.some(d => d.platform === "android" && !isFcmConfigured(d.bundleId))) throw new BotEditorPushError(503, "fcm_unavailable", "خدمة إشعارات Android غير مفعلة");
      const source = language === "ar" ? article.source : (article.seoMetadata?.source || "manual");
      const inserted = await tx.execute(sql`INSERT INTO bot_editor_push_deliveries (language, article_id, actor_id, original_source, status, total_devices) VALUES (${language}, ${articleId}, ${actorId}, ${source}, 'sending', ${devices.length}) ON CONFLICT (language, article_id) DO NOTHING RETURNING id`);
      const pushId = (inserted.rows[0] as { id: string } | undefined)?.id;
      if (!pushId) {
        const prior = await tx.execute(sql`SELECT id FROM bot_editor_push_deliveries WHERE language = ${language} AND article_id = ${articleId}`);
        const receipt = prior.rows[0] as { id: string } | undefined;
        throw new BotEditorPushError(409, "duplicate_push", "سبق حجز إشعار لهذا الخبر", receipt ? { pushId: receipt.id } : undefined);
      }
      await recordBotEditorAudit(tx, { language, articleId, actorId, operation: "push", originalSource: source, before: article, after: article, pushId });
      await tx.insert(botEditorOperations).values({ actorId, operation: "push", outcome: "started", metadata: { actorName: "نشر سبق", originalSource: source, language, articleId, pushId } });
      return { article, pushId, devices };
    });
    lease.start();
    const activeLease = lease;
    const deeplink = `/article/${article.slug}`;
    const title = language === "ar" ? "🔴 خبر عاجل" : "🔴 Breaking news";
    const message = (language === "ar" ? article.title : [article.title, article.excerpt].filter(Boolean).join(" — ")).slice(0, 300);
    void (async () => {
      let sent = 0, failed = 0, uncertain = false;
      try {
        const ios = devices.filter(d => d.platform === "ios");
        const android = devices.filter(d => d.platform === "android");
        if (ios.length) {
          const payload = createCustomNotificationPayload(title, message, { ...(language === "ar" ? { deeplink, articleId, articleSlug: article.slug } : {}), type: "breaking_news", priority: "time-sensitive", imageUrl: article.imageUrl || undefined });
          const pacer = createPushBroadcastPacer<string, Awaited<ReturnType<typeof sendPushNotification>>>();
          for (let i = 0; i < ios.length; i += 100) {
            const results = await pacer.run(ios.slice(i, i + 100).map(d => d.deviceToken), token => sendPushNotification(token, payload, { topic: SABQ_READER_BUNDLE_ID }));
            if (results.some(r => r.error || (r.value && !r.value.success && r.value.statusCode == null))) uncertain = true;
            sent += results.filter(r => r.value?.success).length;
            failed += results.filter(r => !r.value?.success).length;
          }
        }
        if (android.length) {
          const result = await sendToFcmTargets(android.map(d => ({ token: d.deviceToken, bundleId: d.bundleId })), { title, body: message, imageUrl: article.imageUrl || undefined, data: { type: "breaking_news", ...(language === "ar" ? { articleId, article_slug: article.slug, deeplink } : {}) } });
          sent += result.successCount; failed += result.failureCount;
          if (result.results.some(r => !r.success && (r.errorCategory === "network_error" || r.errorCategory === "unknown"))) uncertain = true;
        }
        const status = classifyBotPushOutcome(sent, failed, uncertain);
        await db.execute(sql`UPDATE bot_editor_push_deliveries SET status = ${status}, sent_count = ${sent}, failed_count = ${failed}, updated_at = now() WHERE id = ${pushId} AND status = 'sending'`);
        await recordBotEditorOperation({ actorId, operation: "push", outcome: status === "sent" ? "succeeded" : "failed", metadata: { language, articleId, pushId, sent, failed, status } });
      } catch {
        await recordBotEditorOperation({ actorId, operation: "push", outcome: "failed", metadata: { language, articleId, pushId, deliveryUnknown: true } }).catch(() => {});
        await db.execute(sql`UPDATE bot_editor_push_deliveries SET status = 'delivery_unknown', sent_count = ${sent}, failed_count = ${failed}, updated_at = now() WHERE id = ${pushId} AND status = 'sending'`).catch(() => {});
      } finally { activeLease.release(); }
    })();
    return { status: "sending" as const, pushId, totalDevices: devices.length };
  } catch (error) { lease.release(); throw error; }
}

/** Provider acceptance is not proof of arrival on the device. */
export function classifyBotPushOutcome(sent: number, failed: number, uncertain: boolean): "sent" | "partial" | "failed" | "delivery_unknown" {
  if (uncertain) return "delivery_unknown";
  if (sent === 0) return "failed";
  return failed > 0 ? "partial" : "sent";
}

/** A stale in-process broadcast cannot safely be resumed or retried automatically. */
export async function getBotPushReceipt(language: string, articleId: string, pushId: string) {
  validateBotPushRequest(language, articleId, {});
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pushId)) throw new BotEditorPushError(400, "invalid_push_id", "معرف الإشعار غير صالح");
  const result = await db.execute(sql`SELECT id, language, article_id,
    CASE WHEN status = 'sending' AND created_at < now() - interval '30 minutes' THEN 'delivery_unknown' ELSE status END AS status, total_devices, sent_count, failed_count, created_at, updated_at FROM bot_editor_push_deliveries WHERE id = ${pushId}::uuid AND language = ${language} AND article_id = ${articleId}`);
  if (!result.rows[0]) throw new BotEditorPushError(404, "push_not_found", "الإشعار غير موجود");
  return result.rows[0];
}
