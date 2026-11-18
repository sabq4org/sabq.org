import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ article: {} as any, devices: [] as any[], duplicate: false, outcomes: [] as any[], audit: vi.fn(), send: vi.fn(), execute: vi.fn(), txExecute: vi.fn(), op: vi.fn() }));
vi.mock("../../server/db", () => ({ db: {
  select: () => ({ from: () => ({ leftJoin: () => ({ where: async () => f.devices }) }) }),
  transaction: async (run: any) => run({
    select: () => ({ from: () => ({ leftJoin: () => ({ where: async () => f.devices }), where: () => ({ limit: () => ({ for: async () => [f.article] }) }) }) }),
    execute: f.txExecute,
    insert: () => ({ values: f.op }),
  }),
  execute: f.execute,
} }));
vi.mock("../../server/services/botEditorAudit", () => ({ recordBotEditorAudit: f.audit }));
vi.mock("../../server/services/botEditorOperationsAudit", () => ({ recordBotEditorOperation: f.op }));
vi.mock("../../server/services/apnsService", () => ({ getApnsStatus: () => ({ configured: true }), createCustomNotificationPayload: vi.fn(), sendPushNotification: vi.fn() }));
vi.mock("../../server/services/fcmService", () => ({ isFcmConfigured: () => true, sendToFcmTargets: f.send }));
vi.mock("../../server/services/pushBroadcastCoordinator", () => ({ acquirePushBroadcast: () => ({ start() {}, release() {} }), PushBroadcastCapacityError: class extends Error {} }));
import { classifyBotPushOutcome, pushBotArticle } from "../../server/services/botEditorPush";

describe("bot push reservations and delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.article = { id: "123", title: "English headline", excerpt: "Details", slug: "article-slug", status: "published", newsType: "breaking", articleType: "news", seoMetadata: { source: "bot" } };
    f.devices = [{ deviceToken: "test", platform: "android", tokenProvider: "fcm", bundleId: "com.sabqorg.sabq", locale: "en", breaking: true }];
    f.txExecute.mockResolvedValue({ rows: [{ id: "00000000-0000-0000-0000-000000000001" }] });
    f.execute.mockResolvedValue({ rows: [] });
    f.send.mockResolvedValue({ successCount: 1, failureCount: 0, results: [{ success: true }] });
    f.audit.mockResolvedValue(undefined); f.op.mockResolvedValue(undefined);
  });
  it("reserves and audits before sending an English alert with no invalid deep link", async () => {
    const receipt = await pushBotArticle("en", "123", {}, null);
    await vi.waitFor(() => expect(f.send).toHaveBeenCalled());
    const message = f.send.mock.calls[0][1];
    expect(receipt.status).toBe("sending");
    expect(f.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ pushId: receipt.pushId, originalSource: "bot" }));
    expect(message.body).toContain("English headline");
    expect(message.data).toEqual({ type: "breaking_news" });
  });
  it("rejects duplicates and non-breaking articles before sending", async () => {
    f.txExecute.mockResolvedValueOnce({ rows: [] });
    await expect(pushBotArticle("en", "123", {}, null)).rejects.toMatchObject({ code: "duplicate_push" });
    expect(f.send).not.toHaveBeenCalled();
    f.article.newsType = "regular";
    await expect(pushBotArticle("en", "123", {}, null)).rejects.toMatchObject({ code: "article_not_published_breaking" });
    expect(f.send).not.toHaveBeenCalled();
  });
  it("distinguishes all failures, partial success and ambiguous transport", () => {
    expect(classifyBotPushOutcome(0, 3, false)).toBe("failed");
    expect(classifyBotPushOutcome(1, 2, false)).toBe("partial");
    expect(classifyBotPushOutcome(1, 0, false)).toBe("sent");
    expect(classifyBotPushOutcome(0, 1, true)).toBe("delivery_unknown");
  });
});
