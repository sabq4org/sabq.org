/**
 * دفع موجّه لتطبيق بعينه عند وجود أكثر من تطبيق على حساب العضو نفسه.
 *
 * لا نستعمل sportsAlertsService هنا لأنه يحصر التوصيل في حزمة VARA. هذه
 * الطبقة لا تستهدف إلا الصفوف التي تحمل bundleId مطابقًا صراحةً، حتى لا يصل
 * إشعار مجلس خليجي إلى تطبيق سبق الإخباري أو تطبيق رياضي آخر على الجهاز.
 */
import { and, eq } from "drizzle-orm";
import { pushDevices } from "@shared/schema";
import { db } from "../db";
import {
  createCustomNotificationPayload,
  deactivateInvalidDevices,
  sendPushNotification,
} from "./apnsService";
import {
  isFcmConfigured,
  sendDataOnlyToMultipleDevices,
} from "./fcmService";
import { GULF_CUP_BUNDLE_ID } from "./deviceRegistrationPolicy";

export { GULF_CUP_BUNDLE_ID };

export interface UserAppPushMessage {
  title: string;
  body: string;
  type: string;
  deeplink: string;
  data?: Record<string, string>;
  collapseId?: string;
  interruptionLevel?: "active" | "time-sensitive";
}

export interface UserAppPushResult {
  attempted: number;
  sent: number;
  failed: number;
  errors: string[];
}

/** يرسل إشعارًا إلى أجهزة المستخدم المسجّلة للحزمة المطلوبة فقط. */
export async function sendPushToUserApp(
  userId: string,
  bundleId: string,
  message: UserAppPushMessage,
): Promise<UserAppPushResult> {
  const rows = await db
    .select({
      token: pushDevices.deviceToken,
      provider: pushDevices.tokenProvider,
    })
    .from(pushDevices)
    .where(
      and(
        eq(pushDevices.userId, userId),
        eq(pushDevices.bundleId, bundleId),
        eq(pushDevices.isActive, true),
      ),
    );

  // قد يبقى أكثر من صف قديم بالتوكن نفسه؛ منع التكرار هنا خط دفاع أخير.
  const devices = Array.from(
    new Map(rows.map((row) => [`${row.provider}:${row.token}`, row])).values(),
  );
  if (devices.length === 0) return { attempted: 0, sent: 0, failed: 0, errors: [] };

  const result: UserAppPushResult = {
    attempted: devices.length,
    sent: 0,
    failed: 0,
    errors: [],
  };

  const apns = devices.filter((row) => row.provider === "apns");
  if (apns.length > 0) {
    const payload = createCustomNotificationPayload(message.title, message.body, {
      deeplink: message.deeplink,
      type: message.type,
      priority: message.interruptionLevel ?? "active",
    });
    Object.assign(payload, message.data ?? {});

    const responses = await Promise.all(
      apns.map((row) =>
        sendPushNotification(row.token, payload, {
          topic: bundleId,
          pushType: "alert",
          // APNs alert pushes use immediate transport priority; the user-facing
          // interruption level (active/time-sensitive) remains in aps separately.
          priority: "10",
          collapseId: message.collapseId,
        }),
      ),
    );
    const invalidTokens: string[] = [];
    for (const [index, response] of responses.entries()) {
      if (response.success) result.sent++;
      else {
        result.failed++;
        if (response.reason) result.errors.push(response.reason);
        if (response.reason === "Unregistered" || response.reason === "BadDeviceToken") {
          invalidTokens.push(apns[index].token);
        }
      }
    }
    if (invalidTokens.length > 0) await deactivateInvalidDevices(invalidTokens);
  }

  const fcm = devices.filter((row) => row.provider === "fcm");
  if (fcm.length > 0) {
    if (!isFcmConfigured()) {
      result.failed += fcm.length;
      result.errors.push("FCM not configured");
    } else {
      const response = await sendDataOnlyToMultipleDevices(
        fcm.map((row) => row.token),
        {
          title: message.title,
          body: message.body,
          data: {
            type: message.type,
            deeplink: message.deeplink,
            ...message.data,
          },
        },
        undefined,
        {
          // A kickoff reminder that was offline for hours is misinformation;
          // the inbox copy remains available without a stale tray banner.
          ttlSeconds: message.type === "gc.majlis.reminder" ? 15 * 60 : 24 * 60 * 60,
          collapseKey: message.collapseId,
        },
      );
      result.sent += response.successCount;
      result.failed += response.failureCount;
      result.errors.push(
        ...response.results.flatMap((item) => (item.error ? [item.error] : [])),
      );
      const invalidTokens = response.results
        .filter((item) => item.errorCategory === "invalid_token" || item.errorCategory === "unregistered")
        .map((item) => item.token);
      if (invalidTokens.length > 0) await deactivateInvalidDevices(invalidTokens);
    }
  }

  return result;
}

export function sendGulfCupPush(
  userId: string,
  message: UserAppPushMessage,
): Promise<UserAppPushResult> {
  return sendPushToUserApp(userId, GULF_CUP_BUNDLE_ID, message);
}
