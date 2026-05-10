/**
 * Apple Push Notification Service (APNs) Integration
 * 
 * Uses HTTP/2 token-based authentication for sending push notifications to iOS devices.
 * Supports Rich Notifications with images, action buttons, and deep links.
 */

import { db } from "../db";
import { pushDevices, pushCampaigns, pushCampaignEvents } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
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
function getApnsHost(): string {
  // Use APNS_ENVIRONMENT to explicitly control, default to production
  const useSandbox = process.env.APNS_ENVIRONMENT === "sandbox";
  const host = useSandbox ? APNS_HOST_SANDBOX : APNS_HOST_PRODUCTION;
  console.log(`[APNs] Using ${useSandbox ? 'SANDBOX' : 'PRODUCTION'} environment: ${host}`);
  return host;
}

// APNs credentials from environment
interface ApnsCredentials {
  keyId: string;
  teamId: string;
  privateKey: string;
  bundleId: string;
}

function getApnsCredentials(): ApnsCredentials | null {
  // Support both APNS_PRIVATE_KEY and APNS_KEY_P8 (Apple's .p8 file content)
  const keyId = process.env.APNS_KEY_ID || "STM6UV9C8H";
  const teamId = process.env.APNS_TEAM_ID || "CBU7MJEC5R";
  const privateKey = process.env.APNS_KEY_P8 || process.env.APNS_PRIVATE_KEY;
  const bundleId = process.env.APNS_BUNDLE_ID || "com.sabq.sabqorg";

  if (!privateKey) {
    console.warn("[APNs] Missing credentials (APNS_KEY_P8) - push notifications disabled");
    return null;
  }

  // Log credentials being used (without revealing private key)
  console.log(`[APNs] Using credentials: keyId=${keyId}, teamId=${teamId}, bundleId=${bundleId}, keyLength=${privateKey.length}`);

  // Format private key properly for APNs
  let formattedKey = privateKey;
  
  // Replace literal \n with actual newlines
  if (formattedKey.includes("\\n")) {
    formattedKey = formattedKey.replace(/\\n/g, "\n");
  }
  
  // If key has spaces instead of newlines (common when pasted into env vars)
  if (formattedKey.includes("-----BEGIN PRIVATE KEY-----")) {
    // Extract the Base64 body, removing spaces from it
    const match = formattedKey.match(/-----BEGIN PRIVATE KEY-----\s*([\s\S]+?)\s*-----END PRIVATE KEY-----/);
    if (match) {
      // Remove all whitespace from the Base64 body
      const body = match[1].replace(/\s+/g, '');
      formattedKey = `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`;
      console.log("[APNs] Reformatted key to proper PEM format");
    }
  }

  return { keyId, teamId, privateKey: formattedKey, bundleId };
}

// Cache for JWT token (valid for 1 hour)
// Clear cache on startup to ensure new keys are used
let cachedToken: { token: string; expiresAt: number; keyId: string } | null = null;

/**
 * Generate a JWT token for APNs authentication
 * Tokens are cached and reused until they expire
 * Cache is invalidated if keyId changes (new key uploaded)
 */
function generateApnsToken(credentials: ApnsCredentials): string {
  const now = Math.floor(Date.now() / 1000);
  
  // Return cached token if still valid (with 5 minute buffer) AND keyId matches
  if (cachedToken && cachedToken.expiresAt > now + 300 && cachedToken.keyId === credentials.keyId) {
    return cachedToken.token;
  }

  // Clear cache if keyId changed
  if (cachedToken && cachedToken.keyId !== credentials.keyId) {
    console.log(`[APNs] Key changed from ${cachedToken.keyId} to ${credentials.keyId} - clearing token cache`);
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
  cachedToken = {
    token,
    expiresAt: now + 3300,
    keyId: credentials.keyId,
  };

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
  } = {}
): Promise<ApnsResponse> {
  const credentials = getApnsCredentials();
  
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
        "apns-topic": credentials.bundleId,
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
    const promises = batch.map(async (token) => {
      const response = await sendPushNotification(token, payload);
      console.log(`[APNs] Token ${token.substring(0, 16)}... result: ${response.success ? 'OK' : response.reason}`);
      
      // Record event if campaignId provided
      if (campaignId) {
        try {
          const [device] = await db
            .select({ id: pushDevices.id, userId: pushDevices.userId })
            .from(pushDevices)
            .where(eq(pushDevices.deviceToken, token))
            .limit(1);

          await db.insert(pushCampaignEvents).values({
            campaignId,
            deviceId: device?.id || null,
            userId: device?.userId || null,
            eventType: response.success ? "sent" : "failed",
            apnsId: response.apnsId,
            errorCode: response.reason,
            errorMessage: response.reason,
          });
        } catch (err) {
          console.error("[APNs] Failed to record event:", err);
        }
      }

      // Automatically deactivate bad/unregistered device tokens
      if (!response.success && (response.reason === 'BadDeviceToken' || response.reason === 'Unregistered')) {
        try {
          await db
            .update(pushDevices)
            .set({ isActive: false, updatedAt: new Date() })
            .where(eq(pushDevices.deviceToken, token));
          console.log(`[APNs] Deactivated invalid token: ${token.substring(0, 16)}... (${response.reason})`);
        } catch (err) {
          console.error("[APNs] Failed to deactivate token:", err);
        }
      }

      return response;
    });

    const responses = await Promise.all(promises);
    
    for (const response of responses) {
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
