import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rows: [] as Array<{ token: string; provider: string; bundleId: string | null }>,
  whereArg: undefined as unknown,
  sendPushNotification: vi.fn(),
  sendToFcmTargets: vi.fn(),
  deactivateInvalidDevices: vi.fn(),
}));

vi.mock("../../server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (arg: unknown) => {
          mocks.whereArg = arg;
          return Promise.resolve(mocks.rows);
        },
      }),
    }),
  },
}));

vi.mock("../../server/services/apnsService", () => ({
  createCustomNotificationPayload: (title: string, body: string, options: Record<string, unknown>) => ({
    aps: { alert: { title, body }, category: options.category },
    articleId: options.articleId,
    type: options.type,
  }),
  sendPushNotification: (...args: unknown[]) => mocks.sendPushNotification(...args),
  deactivateInvalidDevices: (...args: unknown[]) => mocks.deactivateInvalidDevices(...args),
}));

vi.mock("../../server/services/fcmService", () => ({
  sendToFcmTargets: (...args: unknown[]) => mocks.sendToFcmTargets(...args),
}));

import { sendPushToSabqReaderApps } from "../../server/services/userAppPushService";

describe("sendPushToSabqReaderApps", () => {
  beforeEach(() => {
    mocks.sendPushNotification.mockReset().mockResolvedValue({ success: true });
    mocks.sendToFcmTargets.mockReset().mockResolvedValue({ successCount: 1, failureCount: 0, results: [] });
    mocks.deactivateInvalidDevices.mockReset();
  });

  it("sends iOS reader rows to APNs and Android rows to FCM, even legacy Android rows stored as apns", async () => {
    mocks.rows = [
      { token: "a".repeat(64), provider: "apns", bundleId: "com.sabq.sabqorg" },
      { token: "fcm-legacy:token", provider: "apns", bundleId: "com.sabqorg.sabq" },
    ];

    const result = await sendPushToSabqReaderApps("user-1", {
      title: "اعتُمد طلب تعديلك",
      body: "حُدّث الخبر",
      type: "editorial.edit_request_approved",
      deeplink: "sabq://article/x?editRequest=1",
      category: "EDITORIAL_EDIT_REQUEST",
      articleId: "art-1",
      data: { article_slug: "x" },
    });

    expect(mocks.sendPushNotification).toHaveBeenCalledTimes(1);
    const [token, payload, options] = mocks.sendPushNotification.mock.calls[0];
    expect(token).toBe("a".repeat(64));
    expect(payload).toMatchObject({ aps: { category: "EDITORIAL_EDIT_REQUEST" }, articleId: "art-1" });
    expect(options).toMatchObject({ topic: "com.sabq.sabqorg" });

    expect(mocks.sendToFcmTargets).toHaveBeenCalledTimes(1);
    const [targets, message, , delivery] = mocks.sendToFcmTargets.mock.calls[0];
    expect(targets).toEqual([{ token: "fcm-legacy:token", bundleId: "com.sabqorg.sabq" }]);
    expect(message.data).toMatchObject({
      type: "editorial.edit_request_approved",
      deeplink: "sabq://article/x?editRequest=1",
      article_slug: "x",
    });
    expect(delivery).toMatchObject({ androidDataOnly: true });
    expect(result).toMatchObject({ attempted: 2, sent: 2, failed: 0 });
  });

  it("reports zero attempts when the user has no reader device", async () => {
    mocks.rows = [];
    const result = await sendPushToSabqReaderApps("user-2", {
      title: "t", body: "b", type: "editorial.published", deeplink: "sabq://article/y",
    });
    expect(result.attempted).toBe(0);
    expect(mocks.sendPushNotification).not.toHaveBeenCalled();
    expect(mocks.sendToFcmTargets).not.toHaveBeenCalled();
  });
});
