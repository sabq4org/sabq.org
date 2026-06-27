/**
 * Apple Push Notification Service (APNs) Integration
 * 
 * Uses HTTP/2 token-based authentication for sending push notifications to iOS devices.
 * Supports Rich Notifications with images, action buttons, and deep links.
 */

import { db } from "../db";
import { pushDevices, pushCampaigns, pushCampaignEvents } from "@shared/schema";
import { and, inArray } from "drizzle-orm";
import jwt from "jsonwebtoken";
import https from "https";
import http2 from "http2";

// APNs Configuration
const APNS_HOST_PRODUCTION = "api.push.apple.com";
const APNS_HOST_SANDBOX = "api.sandbox.push.apple.com";
const APNS_PORT = 443;

// Get APNs host based on environment
// IMPORTANT: TestFlight and App Store builds ALWAYS use Production APNs
// Only use Sandbox for Xcode debug builds (which we don't use)
//
// Cached at module level: the host is derived purely from env (which doesn't
// change at runtime), so we resolve + log it once instead of on every single
// push send. Logging it per-token flooded Railway logs and tripped its
// per-deployment log rate limit (dropping messages) during large broadcasts.
let cachedApnsHost: string | null = null;
function getApnsHost(): string {
  if (cachedApnsHost) return cachedApnsHost;
  // Use APNS_ENVIRONMENT to explicitly control, default to production
  const useSandbox = process.env.APNS_ENVIRONMENT === "sandbox";
  cachedApnsHost = useSandbox ? APNS_HOST_SANDBOX : APNS_HOST_PRODUCTION;
  console.log(`[APNs] Using ${useSandbox ? 'SANDBOX' : 'PRODUCTION'} environment: ${cachedApnsHost}`);
  return cachedApnsHost;
}

// APNs credentials from environment
interface ApnsCredentials {
  keyId: string;
  teamId: string;
  privateKey: string;
  bundleId: string;
}

// Cached credentials per profile ("default" | "sports"). Resolved + logged once
// each, then reused for every subsequent send (env vars don't change at
// runtime). `undefined` slot = not computed; `null` = computed-but-missing.
const credentialsCache = new Map<string, ApnsCredentials | null>();

// حزمة تطبيق الرياضة. مفتاح .p8 مرتبط بفريق Apple واحد فقط، فإن كان تطبيق
// الرياضة على فريق مختلف عن الأخبار فلن يصلح مفتاح الأخبار لدفع com.sabq.sports
// (يرجع APNs 403 InvalidProviderToken). نسمح بمفتاح APNs منفصل للرياضة عبر
// APNS_SPORTS_* — وإن لم يُضبط نرجع لمفتاح الأخبار الافتراضي (يعمل فقط لو كان
// التطبيقان على نفس الفريق).
const SPORTS_BUNDLE_ID = process.env.APNS_SPORTS_BUNDLE_ID || "com.sabq.sports";

/**
 * تهيئة مفتاح PEM لـ APNs. يتحمّل ثلاث صيغ لصق شائعة في env:
 *   1) PEM كامل بترويسة BEGIN/END (مع أسطر أو مسافات داخل الجسم).
 *   2) literal "\n" بدل أسطر فعلية.
 *   3) جسم Base64 وحده **بلا ترويسة** — الخطأ الأشيع؛ نلفّه بترويسة PEM صحيحة،
 *      وإلا يفشل jwt.sign في تحليله.
 */
function formatPrivateKey(privateKey: string): string {
  let key = privateKey.trim();
  if (key.includes("\\n")) {
    key = key.replace(/\\n/g, "\n");
  }

  if (key.includes("-----BEGIN")) {
    const match = key.match(/-----BEGIN [^-]+-----\s*([\s\S]+?)\s*-----END [^-]+-----/);
    if (match) {
      const body = match[1].replace(/\s+/g, "");
      return `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`;
    }
    return key;
  }

  // لا ترويسة → جسم Base64 عارٍ. أزل كل فراغ ولفّه بترويسة PEM صحيحة.
  const body = key.replace(/\s+/g, "");
  if (!body) return key;
  return `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`;
}

/**
 * بيانات اعتماد APNs حسب التطبيق (bundle). تطبيق الرياضة قد يكون على فريق Apple
 * مختلف، فيستخدم مفتاح APNS_SPORTS_* إن ضُبط؛ غير ذلك يُستخدم مفتاح الأخبار
 * الافتراضي. bundleId قد يأتي كـ topic لنشاط Live Activity
 * (`<bundle>.push-type.liveactivity`) فنجرّده للأساس قبل المطابقة.
 */
function getApnsCredentials(bundleId?: string | null): ApnsCredentials | null {
  const base = (bundleId || "").replace(/\.push-type\.liveactivity$/, "");
  const sportsKeyId = process.env.APNS_SPORTS_KEY_ID;
  const sportsTeamId = process.env.APNS_SPORTS_TEAM_ID;
  const sportsKey = process.env.APNS_SPORTS_KEY_P8 || process.env.APNS_SPORTS_PRIVATE_KEY;
  const useSports = base === SPORTS_BUNDLE_ID && Boolean(sportsKeyId && sportsTeamId && sportsKey);
  const profile = useSports ? "sports" : "default";

  const cached = credentialsCache.get(profile);
  if (cached !== undefined) return cached;

  // Support both APNS_PRIVATE_KEY and APNS_KEY_P8 (Apple's .p8 file content).
  // keyId/teamId are env-only — hardcoded fallbacks were removed in the
  // 2026-06-10 audit so a leaked .p8 alone is not immediately usable.
  const keyId = useSports ? sportsKeyId! : process.env.APNS_KEY_ID;
  const teamId = useSports ? sportsTeamId! : process.env.APNS_TEAM_ID;
  const privateKey = useSports ? sportsKey! : (process.env.APNS_KEY_P8 || process.env.APNS_PRIVATE_KEY);
  const credBundle = useSports ? SPORTS_BUNDLE_ID : (process.env.APNS_BUNDLE_ID || "com.sabq.sabqorg");

  if (!privateKey || !keyId || !teamId) {
    if (profile === "default") {
      console.warn("[APNs] Missing credentials (APNS_KEY_P8 / APNS_KEY_ID / APNS_TEAM_ID) - push notifications disabled");
    }
    credentialsCache.set(profile, null);
    return null;
  }

  // Log credentials being used (without revealing private key) — logged once per profile.
  console.log(`[APNs] Using ${profile} credentials: keyId=${keyId}, teamId=${teamId}, bundleId=${credBundle}, keyLength=${privateKey.length}`);
  const creds: ApnsCredentials = { keyId, teamId, privateKey: formatPrivateKey(privateKey), bundleId: credBundle };
  credentialsCache.set(profile, creds);
  return creds;
}

// Cache for JWT tokens, keyed by keyId so the news + sports keys don't evict
// each other (a single slot would thrash on every alternating send → repeated
// signing). Each token valid ~1h; we refresh 5min early.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/**
 * Generate a JWT token for APNs authentication.
 * Tokens are cached per keyId and reused until they expire (5-min buffer).
 */
function generateApnsToken(credentials: ApnsCredentials): string {
  const now = Math.floor(Date.now() / 1000);

  const cached = tokenCache.get(credentials.keyId);
  if (cached && cached.expiresAt > now + 300) {
    return cached.token;
  }

  const payload = {
    iss: credentials.teamId,
    iat: now,
  };

  const token = jwt.sign(payload, credentials.privateKey, {
    algorithm: "ES256",
    header: {
      alg: "ES256",
      kid: credentials.keyId,
    },
  });

  // Cache token for 55 minutes (Apple allows up to 1 hour)
  tokenCache.set(credentials.keyId, { token, expiresAt: now + 3300 });
  return token;
}

// APNs Notification Payload
export interface ApnsPayload {
  aps: {
    alert: {
      title: string;
      subtitle?: string;
      body: string;
      "loc-key"?: string;
      "loc-args"?: string[];
    };
    badge?: number;
    sound?: string | { critical: number; name: string; volume: number };
    "thread-id"?: string;
    category?: string;
    "content-available"?: number;
    "mutable-content"?: number;
    "target-content-id"?: string;
    "interruption-level"?: "passive" | "active" | "time-sensitive" | "critical";
    "relevance-score"?: number;
  };
  // Custom data for deep linking and rich content
  articleId?: string;
  articleSlug?: string;
  deeplink?: string;
  imageUrl?: string;
  campaignId?: string;
  type?: string;
}

// APNs Response
interface ApnsResponse {
  success: boolean;
  apnsId?: string;
  statusCode?: number;
  reason?: string;
  timestamp?: number;
}

/**
 * Send a push notification to a single device
 */
export async function sendPushNotification(
  deviceToken: string,
  payload: ApnsPayload,
  options: {
    priority?: "5" | "10"; // 5 = normal, 10 = immediate
    expiration?: number;
    collapseId?: string;
    pushType?: "alert" | "background" | "voip" | "complication" | "fileprovider" | "mdm";
    // تجاوز apns-topic لكل جهاز (تطبيقات APNs متعددة). فارغ = bundle الافتراضي.
    topic?: string;
  } = {}
): Promise<ApnsResponse> {
  // اختر المفتاح حسب تطبيق الجهاز (topic = bundleId)؛ الرياضة قد تستخدم مفتاحًا منفصلًا.
  const credentials = getApnsCredentials(options.topic);
  
  if (!credentials) {
    console.log("[APNs] No credentials configured - skipping push");
    return { success: false, reason: "APNs not configured" };
  }

  const host = getApnsHost();
  const token = generateApnsToken(credentials);
  const path = `/3/device/${deviceToken}`;

  return new Promise((resolve) => {
    try {
      const client = http2.connect(`https://${host}:${APNS_PORT}`);

      client.on("error", (err) => {
        console.error("[APNs] Connection error:", err);
        resolve({ success: false, reason: err.message });
      });

      const headers = {
        ":method": "POST",
        ":path": path,
        "authorization": `bearer ${token}`,
        "apns-topic": options.topic || credentials.bundleId,
        "apns-push-type": options.pushType || "alert",
        "apns-priority": options.priority || "10",
        ...(options.expiration && { "apns-expiration": options.expiration.toString() }),
        ...(options.collapseId && { "apns-collapse-id": options.collapseId }),
      };

      const req = client.request(headers);

      let responseData = "";
      let apnsId: string | undefined;
      let statusCode: number | undefined;

      req.on("response", (headers) => {
        apnsId = headers["apns-id"] as string;
        statusCode = headers[":status"] as number;
      });

      req.on("data", (chunk) => {
        responseData += chunk;
      });

      req.on("end", () => {
        client.close();

        if (statusCode === 200) {
          resolve({ success: true, apnsId, statusCode });
        } else {
          let reason = "Unknown error";
          try {
            const parsed = JSON.parse(responseData);
            reason = parsed.reason || reason;
          } catch {}
          resolve({ success: false, apnsId, statusCode, reason });
        }
      });

      req.on("error", (err) => {
        client.close();
        console.error("[APNs] Request error:", err);
        resolve({ success: false, reason: err.message });
      });

      req.write(JSON.stringify(payload));
      req.end();
    } catch (error: any) {
      console.error("[APNs] Error:", error);
      resolve({ success: false, reason: error.message });
    }
  });
}

// ============================================================================
// Live Activity push-to-update (ActivityKit)
// ============================================================================

/** الحالة المتغيّرة للنشاط — يجب أن تطابق LiveMatchAttributes.ContentState في iOS. */
export interface LiveActivityContentState {
  homeScore: number;
  awayScore: number;
  minute: string;
  statusLabel: string;
  isLive: boolean;
  isFinished: boolean;
  lastEvent: string | null;
  /**
   * مرساة الساعة الذاتية (Unix ثوانٍ): اللحظة التي تمثّل «0:00» للساعة الجارية،
   * أي «الآن − الزمن المنقضي». يستخدمها الويدجت لعرض ساعةٍ تتحرّك ذاتيًّا على
   * الجهاز عبر Text(timerInterval:) بلا اعتماد على وتيرة الدفع — فتُكسر فجوة
   * تأخّر الدقيقة جذريًّا. تُحذف (undefined) وقت توقّف الساعة (استراحة/ترجيح/قبل
   * البدء) فيسقط الويدجت على نصّ `minute` المُجمّد. اسمها يطابق iOS حرفيًّا.
   */
  clockStartEpoch?: number;
}

export interface LiveActivityUpdateOptions {
  event: "update" | "end";
  contentState: LiveActivityContentState;
  /** bundle التطبيق المُصدِر للنشاط — يحدّد apns-topic. فارغ = الـbundle الافتراضي. */
  bundleId?: string | null;
  /** متى تُعتبر بيانات النشاط قديمة (ثوانٍ Unix) — يُعتّمها النظام بعدها. */
  staleDate?: number;
  /** للحدث "end": متى يزيل النظام النشاط تلقائيًا (ثوانٍ Unix). */
  dismissalDate?: number;
  /** تنبيه اختياري يظهر عند التحديث (هدف مثلاً). */
  alert?: { title: string; body: string };
  /**
   * أولوية APNs: "10" = فوري (للأهداف/البطاقات/النهاية)، "5" = موفّر للطاقة
   * وللميزانية (لتغيّرات الدقيقة/الإحصائيات الروتينية). الافتراضي "10".
   * تقسيم الأولوية يمنع استنزاف ميزانية iOS فيصل الهدف فوريًا دائمًا.
   */
  priority?: "5" | "10";
}

/**
 * يدفع تحديث Live Activity لتوكن نشاط (ActivityKit push token) عبر APNs.
 *
 * يختلف عن sendPushNotification في أمرين: الموضوع (apns-topic) يجب أن يكون
 * `<bundleId>.push-type.liveactivity`، ونوع الدفع `liveactivity`. الحمولة
 * تتبع صيغة aps الخاصة بـ ActivityKit (timestamp/event/content-state).
 */
export async function sendLiveActivityUpdate(
  activityPushToken: string,
  options: LiveActivityUpdateOptions,
): Promise<ApnsResponse> {
  // اختر المفتاح حسب bundle التطبيق المُصدِر للنشاط (الرياضة قد تستخدم مفتاحًا منفصلًا).
  const credentials = getApnsCredentials(options.bundleId);
  if (!credentials) {
    return { success: false, reason: "APNs not configured" };
  }

  const host = getApnsHost();
  const token = generateApnsToken(credentials);
  const path = `/3/device/${activityPushToken}`;

  const aps: Record<string, unknown> = {
    timestamp: Math.floor(Date.now() / 1000),
    event: options.event,
    "content-state": options.contentState,
  };
  if (options.staleDate) aps["stale-date"] = options.staleDate;
  if (options.event === "end" && options.dismissalDate) {
    aps["dismissal-date"] = options.dismissalDate;
  }
  if (options.alert) {
    aps.alert = { title: options.alert.title, body: options.alert.body };
  }
  const payload = { aps };

  return new Promise((resolve) => {
    try {
      const client = http2.connect(`https://${host}:${APNS_PORT}`);
      client.on("error", (err) => {
        resolve({ success: false, reason: err.message });
      });

      const headers = {
        ":method": "POST",
        ":path": path,
        authorization: `bearer ${token}`,
        // الموضوع الخاص بأنشطة Live Activity — يتبع bundle التطبيق المُصدِر
        // (الرياضة com.sabq.sports)، وإلا الـbundle الافتراضي للخادم.
        "apns-topic": `${options.bundleId || credentials.bundleId}.push-type.liveactivity`,
        "apns-push-type": "liveactivity",
        "apns-priority": options.priority || "10",
      };

      const req = client.request(headers);
      let responseData = "";
      let apnsId: string | undefined;
      let statusCode: number | undefined;

      req.on("response", (h) => {
        apnsId = h["apns-id"] as string;
        statusCode = h[":status"] as number;
      });
      req.on("data", (chunk) => {
        responseData += chunk;
      });
      req.on("end", () => {
        client.close();
        if (statusCode === 200) {
          resolve({ success: true, apnsId, statusCode });
        } else {
          let reason = "Unknown error";
          try {
            reason = JSON.parse(responseData).reason || reason;
          } catch {}
          resolve({ success: false, apnsId, statusCode, reason });
        }
      });
      req.on("error", (err) => {
        client.close();
        resolve({ success: false, reason: err.message });
      });

      req.write(JSON.stringify(payload));
      req.end();
    } catch (error: any) {
      resolve({ success: false, reason: error.message });
    }
  });
}

/**
 * Send push notification to multiple devices (batch)
 */
export async function sendBatchPushNotifications(
  deviceTokens: string[],
  payload: ApnsPayload,
  campaignId?: string
): Promise<{ success: number; failed: number; errors: string[] }> {
  const results = { success: 0, failed: 0, errors: [] as string[] };
  
  // Log tokens being sent to for debugging
  console.log(`[APNs Batch] Sending to ${deviceTokens.length} devices`);
  if (deviceTokens.length > 0) {
    console.log(`[APNs Batch] First token: ${deviceTokens[0].substring(0, 20)}...`);
  }
  
  // Process in batches of 100 for better performance
  const batchSize = 100;
  const batches = [];
  
  for (let i = 0; i < deviceTokens.length; i += batchSize) {
    batches.push(deviceTokens.slice(i, i + batchSize));
  }

  for (const batch of batches) {
    // Pre-resolve device rows for the whole batch in ONE query instead of one
    // SELECT per token. During a large broadcast the previous per-token SELECT
    // + per-token INSERT + per-token UPDATE (all fired via Promise.all over 100
    // tokens) saturated the 15-connection pool, which surfaced as
    // "[APM] ⚠️ Slow request" on unrelated requests waiting for a connection.
    const deviceByToken = new Map<string, { id: string; userId: string | null }>();
    if (campaignId) {
      try {
        const devices = await db
          .select({ id: pushDevices.id, userId: pushDevices.userId, deviceToken: pushDevices.deviceToken })
          .from(pushDevices)
          .where(inArray(pushDevices.deviceToken, batch));
        for (const d of devices) {
          deviceByToken.set(d.deviceToken, { id: d.id, userId: d.userId });
        }
      } catch (err) {
        console.error("[APNs] Failed to load devices for batch:", err);
      }
    }

    // Network sends still run concurrently across the batch — send throughput
    // is unchanged. Only the DB writes are pulled out of the per-token path and
    // flushed in bulk below.
    const sendResults = await Promise.all(
      batch.map(async (token) => {
        const response = await sendPushNotification(token, payload);
        // Only log failures: per-token success lines were emitted for every
        // device in a broadcast (thousands), flooding Railway logs and hitting
        // its log rate limit. Failures stay logged so error tracking is intact.
        if (!response.success) {
          console.log(`[APNs] Token ${token.substring(0, 16)}... failed: ${response.reason}`);
        }
        return { token, response };
      })
    );

    // Record events for the whole batch in a single INSERT instead of one row
    // per token. Same rows, same eventType, same apnsId/error fields as before.
    if (campaignId && sendResults.length > 0) {
      const eventRows = sendResults.map(({ token, response }) => {
        const device = deviceByToken.get(token);
        return {
          campaignId,
          deviceId: device?.id || null,
          userId: device?.userId || null,
          eventType: response.success ? "sent" : "failed",
          apnsId: response.apnsId,
          errorCode: response.reason,
          errorMessage: response.reason,
        };
      });
      try {
        await db.insert(pushCampaignEvents).values(eventRows);
      } catch (err) {
        console.error("[APNs] Failed to record batch events:", err);
      }
    }

    // Automatically deactivate bad/unregistered device tokens in a single
    // UPDATE ... WHERE token IN (...) instead of one UPDATE per token.
    // `DeviceTokenNotForTopic` is what APNs returns when a token was
    // registered under a different bundle ID than the one we're sending
    // under — exactly the state of every token saved before the
    // `com.sabq.sabqapp` → `com.sabq.sabqorg` migration. Without this those
    // rows would stay `is_active = true` forever and every broadcast would
    // re-attempt them.
    const invalidTokens = sendResults
      .filter(({ response }) => !response.success && (
        response.reason === 'BadDeviceToken' ||
        response.reason === 'Unregistered' ||
        response.reason === 'DeviceTokenNotForTopic'
      ))
      .map(({ token }) => token);
    if (invalidTokens.length > 0) {
      try {
        await db
          .update(pushDevices)
          .set({ isActive: false, updatedAt: new Date() })
          .where(inArray(pushDevices.deviceToken, invalidTokens));
        console.log(`[APNs] Deactivated ${invalidTokens.length} invalid token(s)`);
      } catch (err) {
        console.error("[APNs] Failed to deactivate tokens:", err);
      }
    }

    for (const { response } of sendResults) {
      if (response.success) {
        results.success++;
      } else {
        results.failed++;
        if (response.reason && !results.errors.includes(response.reason)) {
          results.errors.push(response.reason);
        }
      }
    }

    // Small delay between batches to avoid rate limiting
    if (batches.indexOf(batch) < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return results;
}

/**
 * Create a rich notification payload for an article
 */
export function createArticleNotificationPayload(
  article: {
    id: string;
    title: string;
    slug: string;
    imageUrl?: string | null;
    excerpt?: string | null;
  },
  options: {
    type?: "breaking" | "featured" | "personalized" | "update";
    badge?: number;
    campaignId?: string;
  } = {}
): ApnsPayload {
  const body = article.excerpt || "اقرأ المزيد على سبق";
  
  let category = "ARTICLE_NOTIFICATION";
  let interruptionLevel: ApnsPayload["aps"]["interruption-level"] = "active";
  
  if (options.type === "breaking") {
    category = "BREAKING_NEWS";
    interruptionLevel = "time-sensitive";
  }

  return {
    aps: {
      alert: {
        title: options.type === "breaking" ? "🔴 عاجل" : "سبق",
        subtitle: options.type === "breaking" ? article.title : undefined,
        body: options.type === "breaking" ? body : article.title,
      },
      badge: options.badge,
      sound: options.type === "breaking" ? "breaking.caf" : "default",
      category,
      "mutable-content": 1, // Enable rich notifications
      "interruption-level": interruptionLevel,
    },
    articleId: article.id,
    articleSlug: article.slug,
    deeplink: `/news/${article.slug}`,
    imageUrl: article.imageUrl || undefined,
    campaignId: options.campaignId,
    type: options.type || "article",
  };
}

/**
 * Create a custom notification payload
 */
export function createCustomNotificationPayload(
  title: string,
  body: string,
  options: {
    subtitle?: string;
    deeplink?: string;
    imageUrl?: string;
    badge?: number;
    sound?: string;
    campaignId?: string;
    articleId?: string;
    type?: string;
    category?: string;
    priority?: "passive" | "active" | "time-sensitive" | "critical";
  } = {}
): ApnsPayload {
  return {
    aps: {
      alert: {
        title,
        subtitle: options.subtitle,
        body,
      },
      badge: options.badge,
      sound: options.sound || "default",
      category: options.category || "CUSTOM_NOTIFICATION",
      "mutable-content": 1, // Always enable for background data access
      "interruption-level": options.priority || "active",
    },
    deeplink: options.deeplink,
    imageUrl: options.imageUrl,
    campaignId: options.campaignId,
    articleId: options.articleId,
    type: options.type || "custom",
  };
}

/**
 * Mark invalid device tokens as inactive
 */
export async function deactivateInvalidDevices(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  
  try {
    await db
      .update(pushDevices)
      .set({ isActive: false, updatedAt: new Date() })
      .where(inArray(pushDevices.deviceToken, tokens));
    
    console.log(`[APNs] Deactivated ${tokens.length} invalid device tokens`);
  } catch (error) {
    console.error("[APNs] Failed to deactivate devices:", error);
  }
}

/**
 * Check if APNs is configured and ready
 */
export function isApnsConfigured(): boolean {
  return getApnsCredentials() !== null;
}

/**
 * Get APNs configuration status
 */
export function getApnsStatus(): {
  configured: boolean;
  environment: string;
  bundleId: string | null;
} {
  const credentials = getApnsCredentials();
  return {
    configured: credentials !== null,
    environment: process.env.APNS_ENVIRONMENT || (process.env.NODE_ENV === "development" ? "sandbox" : "production"),
    bundleId: credentials?.bundleId || null,
  };
}

// Log initialization status
const apnsStatus = getApnsStatus();
if (apnsStatus.configured) {
  console.log(`✅ APNs service initialized (${apnsStatus.environment}, bundle: ${apnsStatus.bundleId})`);
} else {
  console.log("⚠️ APNs service not configured - set APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY");
}
