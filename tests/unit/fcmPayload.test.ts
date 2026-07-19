import { describe, expect, it } from "vitest";
import { buildFcmDevicePayload } from "../../server/services/fcmPayload";

describe("FCM device payload", () => {
  const message = {
    title: "اقترب إقفال التوقع",
    body: "4 من مجلسك توقّعوا ولم تتوقّع بعد",
    data: {
      type: "gc.majlis.reminder",
      deeplink: "https://sabq.org/gulf-cup/majlis?id=m-1&fixture=321",
      majlisId: "m-1",
      fixtureId: "321",
    },
  };

  it("builds Majlis as high-priority Android data-only", () => {
    const payload: any = buildFcmDevicePayload("fcm-token", message, {
      androidDataOnly: true,
      ttlSeconds: 900,
      collapseKey: "delivery-1",
    });

    expect(payload.message.notification).toBeUndefined();
    expect(payload.message.android.notification).toBeUndefined();
    expect(payload.message.android.priority).toBe("high");
    expect(payload.message.android.ttl).toBe("900s");
    expect(payload.message.android.collapse_key).toBe("delivery-1");
    expect(payload.message.data).toMatchObject({
      title: message.title,
      body: message.body,
      type: "gc.majlis.reminder",
      majlisId: "m-1",
      fixtureId: "321",
    });
  });

  it("keeps the legacy editorial notification envelope unchanged", () => {
    const payload: any = buildFcmDevicePayload("fcm-token", message);

    expect(payload.message.notification).toEqual({ title: message.title, body: message.body });
    expect(payload.message.android.notification.click_action).toBe("FLUTTER_NOTIFICATION_CLICK");
  });
});
