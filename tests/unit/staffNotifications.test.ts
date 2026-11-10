import { describe, expect, it } from "vitest";
import {
  botDraftsPublisherDisplayName,
  buildStaffDeskEventDetail,
  clipStaffDeskTitle,
  decodeStaffDeskEventCursor,
  encodeStaffDeskEventCursor,
  formatStaffDeskWhen,
  staffDeskEventCategory,
  staffDeskEventDedupeKey,
  staffDeskEventDeeplink,
  staffDeskIncludesMessages,
  staffDeskNotificationsQuerySchema,
  visibleStaffDeskCategories,
} from "@shared/staffNotifications";

// 2026-10-29 10:00 بتوقيت الرياض (الخميس).
const NOW = new Date("2026-10-29T07:00:00Z");

describe("staff desk notifications (shared)", () => {
  it("maps every kind to its tab", () => {
    expect(staffDeskEventCategory("tweet_draft")).toBe("tweet");
    expect(staffDeskEventCategory("tweet_published")).toBe("tweet");
    expect(staffDeskEventCategory("opinion_scheduled")).toBe("opinion");
    expect(staffDeskEventCategory("news_published")).toBe("news");
  });

  it("shows a member only the tabs their permissions open", () => {
    expect(
      visibleStaffDeskCategories({ canSocial: { view: true }, canOpinion: { view: false }, canPublisherNews: false }),
    ).toEqual(["tweet"]);
    expect(
      visibleStaffDeskCategories({ canSocial: { view: true }, canOpinion: { view: true }, canPublisherNews: true }),
    ).toEqual(["tweet", "opinion", "news"]);
    // خادم أقدم بلا canOpinion/canPublisherNews.
    expect(visibleStaffDeskCategories({ canSocial: { view: false } })).toEqual([]);
  });

  it("opens the tweet, the opinion article, or the notifications center", () => {
    expect(staffDeskEventDeeplink("tweet_scheduled", "p1")).toBe("sabqdesk://social/p1");
    expect(staffDeskEventDeeplink("opinion_draft", "a1")).toBe("sabqdesk://opinion/a1");
    expect(staffDeskEventDeeplink("news_published", "a2")).toBe("sabqdesk://notifications");
  });

  it("records each event once, but a new schedule time or a resubmission is a new event", () => {
    const at = new Date("2026-10-29T07:00:10Z");
    expect(staffDeskEventDedupeKey({ kind: "tweet_published", targetId: "p1" })).toBe(
      staffDeskEventDedupeKey({ kind: "tweet_published", targetId: "p1" }),
    );
    const s1 = staffDeskEventDedupeKey({ kind: "tweet_scheduled", targetId: "p1", scheduledAt: new Date("2026-10-30T09:00:00Z") });
    const s2 = staffDeskEventDedupeKey({ kind: "tweet_scheduled", targetId: "p1", scheduledAt: new Date("2026-10-30T10:00:00Z") });
    expect(s1).not.toBe(s2);
    const d1 = staffDeskEventDedupeKey({ kind: "opinion_draft", targetId: "a1", at });
    const d1Again = staffDeskEventDedupeKey({ kind: "opinion_draft", targetId: "a1", at: new Date(at.getTime() + 20_000) });
    const d2 = staffDeskEventDedupeKey({ kind: "opinion_draft", targetId: "a1", at: new Date(at.getTime() + 2 * 86_400_000) });
    expect(d1).toBe(d1Again);
    expect(d1).not.toBe(d2);
  });

  it("writes the second line in Riyadh time with Latin digits", () => {
    expect(formatStaffDeskWhen(new Date("2026-10-29T09:30:00Z"), NOW)).toMatch(/^اليوم 12:30/);
    expect(formatStaffDeskWhen(new Date("2026-10-30T06:00:00Z"), NOW)).toMatch(/^غدًا 9:00/);
    expect(
      buildStaffDeskEventDetail({ kind: "news_published", actorName: "وكالة الأفق", scheduledAt: null }, NOW),
    ).toBe("الناشر: وكالة الأفق");
    expect(buildStaffDeskEventDetail({ kind: "tweet_published", actorName: null, scheduledAt: null }, NOW)).toBe(
      "نُشرت تلقائيًا في موعدها",
    );
    expect(
      buildStaffDeskEventDetail(
        { kind: "opinion_scheduled", actorName: "كاتب", scheduledAt: new Date("2026-10-29T09:30:00Z") },
        NOW,
      ),
    ).toMatch(/^كاتب · يُنشر اليوم 12:30/);
  });

  it("round-trips the cursor and rejects junk", () => {
    const raw = encodeStaffDeskEventCursor({ createdAt: NOW.toISOString(), id: "e1" });
    expect(decodeStaffDeskEventCursor(raw)).toEqual({ createdAt: NOW.toISOString(), id: "e1" });
    expect(decodeStaffDeskEventCursor("not-a-cursor")).toBeNull();
  });

  it("validates the list query", () => {
    expect(staffDeskNotificationsQuerySchema.parse({})).toEqual({ category: "all", limit: 30, v: 1 });
    expect(staffDeskNotificationsQuerySchema.parse({ category: "message", v: "2" })).toMatchObject({ category: "message", v: 2 });
    expect(staffDeskNotificationsQuerySchema.safeParse({ category: "sports" }).success).toBe(false);
    expect(staffDeskNotificationsQuerySchema.safeParse({ limit: "80" }).success).toBe(false);
  });

  it("clips long tweet text to one line", () => {
    expect(clipStaffDeskTitle("سطر\nثانٍ   هنا")).toBe("سطر ثانٍ هنا");
    expect(clipStaffDeskTitle("أ".repeat(300)).length).toBe(160);
  });

  it("names the bot that published instead of always saying «نشر سبق»", () => {
    expect(botDraftsPublisherDisplayName("grok-bot")).toBe("قروك بوت");
    expect(botDraftsPublisherDisplayName("nashr-sabq")).toBe("نشر سبق");
    expect(botDraftsPublisherDisplayName("other-agent")).toBe("other-agent");
    expect(buildStaffDeskEventDetail({ kind: "news_published", actorName: null, scheduledAt: null }, NOW)).toBe(
      "نُشر عبر بوت",
    );
  });

  // ── 2026-11-10: مسودات البوت، أخبار المراسلين، ورسائل الكتّاب في الجرس ──
  it("files the new kinds under news and messages", () => {
    expect(staffDeskEventCategory("news_bot_draft")).toBe("news");
    expect(staffDeskEventCategory("news_draft")).toBe("news");
    expect(staffDeskEventCategory("news_edit_request")).toBe("news");
    expect(staffDeskEventCategory("ticket_message")).toBe("message");
  });

  it("opens the draft, the edit request, or the ticket", () => {
    expect(staffDeskEventDeeplink("news_bot_draft", "a1")).toBe("sabqdesk://news/a1");
    expect(staffDeskEventDeeplink("news_draft", "a1")).toBe("sabqdesk://news/a1");
    expect(staffDeskEventDeeplink("news_edit_request", "r1")).toBe("sabqdesk://news/edit-request/r1");
    expect(staffDeskEventDeeplink("ticket_message", "t1")).toBe("sabqdesk://ticket/t1");
    // الخبر المنشور يبقى على مركز التنبيهات (يُفتح برابط linkUrl).
    expect(staffDeskEventDeeplink("news_published", "a1")).toBe("sabqdesk://notifications");
  });

  it("shows «رسائل» only to an app that asks for it and holds tickets", () => {
    const caps = { canSocial: { view: true }, canOpinion: { view: false }, canPublisherNews: true, canTickets: true };
    // نسخة أقدم (v=1): لا فئة لا تعرفها، فلا رقم جرس بلا صفوف.
    expect(visibleStaffDeskCategories(caps)).toEqual(["tweet", "news"]);
    expect(visibleStaffDeskCategories(caps, { includeMessages: true })).toEqual(["tweet", "news", "message"]);
    expect(visibleStaffDeskCategories({ ...caps, canTickets: false }, { includeMessages: true })).toEqual(["tweet", "news"]);
    expect(staffDeskIncludesMessages(undefined)).toBe(false);
    expect(staffDeskIncludesMessages(1)).toBe(false);
    expect(staffDeskIncludesMessages(2)).toBe(true);
  });

  it("records a bot draft once, but each resubmission or ticket message anew", () => {
    const t0 = new Date("2026-11-10T09:00:10Z");
    const sameMinute = new Date("2026-11-10T09:00:50Z");
    const later = new Date("2026-11-10T09:05:00Z");
    // إنشاء ثم «جاهزة للنشر»: حدث واحد.
    expect(staffDeskEventDedupeKey({ kind: "news_bot_draft", targetId: "a1", at: t0 })).toBe(
      staffDeskEventDedupeKey({ kind: "news_bot_draft", targetId: "a1", at: later }),
    );
    for (const kind of ["news_draft", "ticket_message"] as const) {
      expect(staffDeskEventDedupeKey({ kind, targetId: "x", at: t0 })).toBe(
        staffDeskEventDedupeKey({ kind, targetId: "x", at: sameMinute }),
      );
      expect(staffDeskEventDedupeKey({ kind, targetId: "x", at: t0 })).not.toBe(
        staffDeskEventDedupeKey({ kind, targetId: "x", at: later }),
      );
    }
  });

  it("writes the second line for the new kinds", () => {
    expect(buildStaffDeskEventDetail({ kind: "news_bot_draft", actorName: "قروك بوت", scheduledAt: null }, NOW)).toBe(
      "من: قروك بوت · بانتظار قرارك",
    );
    expect(buildStaffDeskEventDetail({ kind: "news_bot_draft", actorName: null, scheduledAt: null }, NOW)).toBe(
      "مسودة بانتظار قرارك",
    );
    expect(buildStaffDeskEventDetail({ kind: "news_edit_request", actorName: "سالم", scheduledAt: null }, NOW)).toBe("طلبه: سالم");
    expect(buildStaffDeskEventDetail({ kind: "ticket_message", actorName: null, scheduledAt: null }, NOW)).toBe("رسالة بانتظار الرد");
  });
});
