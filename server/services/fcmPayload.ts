/** Pure FCM v1 payload builder, kept separate so delivery semantics are testable. */
export interface FcmPayloadMessage {
  title: string;
  body: string;
  imageUrl?: string;
  data?: Record<string, string>;
}

export interface FcmDeliveryOptions {
  /**
   * Android data-only delivery always reaches FirebaseMessagingService in the
   * foreground/background, allowing the native app to own channel, intent and
   * deep-link construction. Do not enable this for legacy editorial pushes.
   */
  androidDataOnly?: boolean;
  /** FCM queue lifetime; reminders use a short value so they cannot arrive stale. */
  ttlSeconds?: number;
  /** Deterministic retry key for replacing an older queued copy. */
  collapseKey?: string;
}

export function buildFcmDevicePayload(
  token: string,
  message: FcmPayloadMessage,
  options: FcmDeliveryOptions = {},
): Record<string, unknown> {
  if (options.androidDataOnly) {
    const ttlSeconds = Number.isFinite(options.ttlSeconds)
      ? Math.max(0, Math.min(2_419_200, Math.trunc(options.ttlSeconds!)))
      : 86_400;
    return {
      message: {
        token,
        data: {
          title: message.title,
          body: message.body,
          ...(message.data ?? {}),
        },
        android: {
          priority: "high",
          ttl: `${ttlSeconds}s`,
          ...(options.collapseKey ? { collapse_key: options.collapseKey } : {}),
        },
      },
    };
  }

  const data = message.data ?? {};
  const payload: any = {
    message: {
      token,
      notification: {
        title: message.title,
        body: message.body,
      },
      data,
      android: {
        priority: "high",
        notification: {
          sound: "default",
          click_action: "FLUTTER_NOTIFICATION_CLICK",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
            "mutable-content": 1,
          },
          ...data,
        },
      },
    },
  };

  if (message.imageUrl) {
    payload.message.notification.image = message.imageUrl;
    payload.message.android.notification.image = message.imageUrl;
    payload.message.apns.fcm_options = { image: message.imageUrl };
  }
  return payload;
}
