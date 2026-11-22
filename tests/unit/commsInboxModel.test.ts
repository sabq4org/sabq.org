import { describe, expect, it, vi } from "vitest";
import {
  emailStatusFor,
  flowCounts,
  fromEmailLog,
  fromWhatsappLog,
  inboxTime,
  mergeInbox,
  stepsOf,
  trackOf,
  whatsappStatusFor,
} from "../../client/src/components/communications/inboxModel";

// هذه الاختبارات تفترض مستخدمًا في الرياض؛ العرض يتبع منطقة الجهاز (displayTimeZone).
vi.mock("../../client/src/lib/displayTimeZone", () => ({
  RIYADH_TIME_ZONE: "Asia/Riyadh",
  displayTimeZone: () => "Asia/Riyadh",
}));

const email = (overrides: Record<string, unknown> = {}) =>
  fromEmailLog({
    id: "e1",
    fromEmail: "desk@example.com",
    fromName: "مكتب جدة",
    subject: "خبر تجريبي",
    status: "published",
    senderVerified: true,
    tokenVerified: true,
    trustedSenderId: "s1",
    articleId: "a1",
    attachmentsCount: 2,
    receivedAt: "2026-11-16T07:42:00Z",
    aiAnalysis: { contentQuality: 92 },
    ...overrides,
  });

describe("fromEmailLog", () => {
  it("maps a published message to a full track", () => {
    const item = email();
    expect(item.state).toBe("published");
    expect(trackOf(item)).toEqual(["done", "done", "done", "done"]);
    expect(item.sender).toBe("مكتب جدة");
    expect(item.canReprocess).toBe(false);
  });

  it("treats `processed` as a saved draft", () => {
    const item = email({ status: "processed" });
    expect(item.state).toBe("draft");
    expect(trackOf(item)).toEqual(["done", "done", "done", "draft"]);
    expect(stepsOf(item, true)[3].note).toContain("النشر التلقائي متوقف");
  });

  it("stops an untrusted sender at verification", () => {
    const item = email({ status: "rejected", rejectionReason: "sender_not_trusted", tokenVerified: false, trustedSenderId: null, articleId: null });
    expect(item.stoppedAt).toBe(2);
    expect(trackOf(item)).toEqual(["done", "fail", "idle", "idle"]);
    expect(stepsOf(item)[1].note).toBe("العنوان ليس في قائمة المرسلين الموثوقين");
  });

  it("stops a low-quality rejection at editing even though the token was valid", () => {
    const item = email({ status: "rejected", rejectionReason: "quality_too_low", articleId: null });
    expect(trackOf(item)).toEqual(["done", "done", "fail", "idle"]);
  });

  it("marks a verified failure without an article as reprocessable", () => {
    const item = email({ status: "failed", rejectionReason: "processing_interrupted", articleId: null });
    expect(item.canReprocess).toBe(true);
    expect(trackOf(item)).toEqual(["done", "done", "fail", "idle"]);
    expect(stepsOf(item)[2].note).toContain("والمرفقات محفوظة");
    expect(stepsOf(item)[3].note).toBe("ينتظر إعادة المعالجة");
  });

  it("never offers reprocess when an article already exists or the token was not verified", () => {
    expect(email({ status: "failed", rejectionReason: "processing_error" }).canReprocess).toBe(false);
    expect(email({ status: "failed", rejectionReason: "processing_error", articleId: null, tokenVerified: false }).canReprocess).toBe(false);
  });

  it("shows an in-flight message as active at editing", () => {
    const item = email({ status: "received", articleId: null });
    expect(item.state).toBe("processing");
    expect(trackOf(item)).toEqual(["done", "done", "active", "idle"]);
  });

  it("falls back to the address and a placeholder title", () => {
    const item = email({ fromName: " ", subject: "" });
    expect(item.sender).toBe("desk@example.com");
    expect(item.title).toBe("رسالة بلا عنوان");
  });
});

describe("fromWhatsappLog", () => {
  const base = { id: "w1", from: "whatsapp:+966500000000", message: "سطر أول\nسطر ثانٍ", status: "processed", createdAt: "2026-11-16T06:58:00Z" };

  it("splits processed rows into published and draft by publishStatus", () => {
    expect(fromWhatsappLog({ ...base, publishStatus: "published", tokenId: "t" }).state).toBe("published");
    expect(fromWhatsappLog({ ...base, publishStatus: "draft", tokenId: "t" }).state).toBe("draft");
  });

  it("strips the channel prefix and uses the first line as title", () => {
    const item = fromWhatsappLog({ ...base, publishStatus: "draft" });
    expect(item.sender).toBe("+966500000000");
    expect(item.title).toBe("سطر أول");
  });

  it("maps `error` to failed and stops at verification without a token", () => {
    const item = fromWhatsappLog({ ...base, status: "error", reason: "boom" });
    expect(item.state).toBe("failed");
    expect(trackOf(item)).toEqual(["done", "fail", "idle", "idle"]);
    expect(item.canReprocess).toBe(false);
  });
});

describe("inbox helpers", () => {
  it("sorts both channels newest first", () => {
    const merged = mergeInbox([email()], [fromWhatsappLog({ id: "w", from: "x", status: "received", createdAt: "2026-11-16T09:00:00Z" })]);
    expect(merged.map((item) => item.channel)).toEqual(["whatsapp", "email"]);
  });

  it("translates filters to each channel's status values", () => {
    expect(emailStatusFor("draft")).toBe("processed");
    expect(emailStatusFor("processing")).toBe("received");
    expect(whatsappStatusFor("published")).toBe("processed");
    expect(whatsappStatusFor("failed")).toBe("error");
  });

  it("shows the Riyadh clock for today and the date for older messages", () => {
    const now = new Date("2026-11-16T12:00:00Z");
    expect(inboxTime(new Date("2026-11-16T07:42:00Z"), now)).toEqual({ primary: "10:42", secondary: null });
    const older = inboxTime(new Date("2026-11-12T07:42:00Z"), now);
    expect(older.secondary).toBe("10:42");
    expect(older.primary).toContain("12");
    expect(inboxTime(null, now).primary).toBe("—");
  });

  it("adds both channels into today's flow and never undercounts the total", () => {
    const flow = flowCounts(
      { emailsReceived: 40, emailsPublished: 30, emailsDrafted: 5, emailsRejected: 3, emailsFailed: 2 },
      { newMessages: 0, publishedToday: 1, draftedToday: 1, rejectedToday: 0 },
    );
    expect(flow).toEqual({ published: 31, draft: 6, rejected: 3, failed: 2, total: 42 });
    expect(flowCounts(null, null).total).toBe(0);
  });
});
