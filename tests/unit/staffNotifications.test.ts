import { describe, expect, it } from "vitest";
import {
  botDraftsPublisherDisplayName,
  buildStaffDeskEventDetail,
  buildStaffDeskEventSource,
  buildStaffDeskEventTrail,
  formatStaffDeskStageTime,
  staffDeskActorRole,
  resolveStaffDeskActorKind,
  staffDeskEventIsDecisionKind,
  STAFF_DESK_EVENT_KINDS,
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

  it("splits kinds into «تحتاج قرارك» and «للعلم»", () => {
    const decision = STAFF_DESK_EVENT_KINDS.filter(staffDeskEventIsDecisionKind);
    expect(decision).toEqual([
      "tweet_draft",
      "opinion_draft",
      "news_bot_draft",
      "news_draft",
      "news_edit_request",
      "ticket_message",
    ]);
  });

  it("tells a bot from a person and from the scheduler", () => {
    const base = { actorName: "سالم", actorUserId: "u1" };
    expect(resolveStaffDeskActorKind({ kind: "news_bot_draft", ...base })).toBe("bot");
    expect(resolveStaffDeskActorKind({ kind: "news_draft", ...base })).toBe("person");
    // خبر منشور بلا صاحب توكن = بوت بتوكن البيئة.
    expect(resolveStaffDeskActorKind({ kind: "news_published", actorName: "قروك بوت", actorUserId: null })).toBe("bot");
    expect(resolveStaffDeskActorKind({ kind: "news_published", ...base })).toBe("person");
    // تغريدة البوت تُكتب باسم حساب خدمة، فيُعرف البوت من مفتاحه.
    expect(resolveStaffDeskActorKind({ kind: "tweet_published", ...base, tweetBotName: "نشر سبق" })).toBe("bot");
    expect(resolveStaffDeskActorKind({ kind: "tweet_published", actorName: null, actorUserId: null })).toBe("system");
    expect(resolveStaffDeskActorKind({ kind: "tweet_draft", actorName: null, actorUserId: null })).toBe("person");
    // اسم يطابق وكالة مسجّلة = وكالة، حتى لو نشر عضو منها بتوكنه.
    expect(resolveStaffDeskActorKind({ kind: "news_published", ...base, isAgency: true })).toBe("agency");
    expect(resolveStaffDeskActorKind({ kind: "tweet_draft", ...base, isAgency: true })).toBe("agency");
    // البوت يتقدم على الوكالة.
    expect(resolveStaffDeskActorKind({ kind: "news_bot_draft", ...base, isAgency: true })).toBe("bot");
    // اسم بوت لا يحوّل رسالة كاتب إلى بوت.
    expect(resolveStaffDeskActorKind({ kind: "ticket_message", ...base, tweetBotName: "نشر سبق" })).toBe("person");
  });

  it("writes the source line beside the type tag", () => {
    const line = (kind: Parameters<typeof buildStaffDeskEventSource>[0]["kind"], actorName: string | null,
      actorKind: "person" | "bot" | "system", scheduledAt: Date | null = null) =>
      buildStaffDeskEventSource({ kind, actorName, actorKind, scheduledAt }, NOW);
    expect(line("news_bot_draft", "قروك بوت", "bot")).toBe("مسودة من بوت · قروك بوت");
    expect(line("news_bot_draft", null, "bot")).toBe("مسودة من بوت");
    expect(line("news_draft", "سالم العتيبي", "person")).toBe("من مراسل · سالم العتيبي");
    expect(line("news_published", "قروك بوت", "bot")).toBe("نشره بوت · قروك بوت");
    expect(line("news_published", "خالد", "person")).toBe("نُشر عبر «نشر سبق» · خالد");
    expect(line("tweet_published", null, "system")).toBe("نُشرت تلقائيًا في موعدها");
    expect(line("tweet_published", "نشر سبق", "bot")).toBe("نشرها بوت · نشر سبق");
    expect(line("tweet_scheduled", "خالد", "person", new Date("2026-10-29T09:30:00Z"))).toBe(
      "تُنشر اليوم 12:30 م · جدولها خالد",
    );
    expect(line("opinion_scheduled", "خالد الحربي", "person", new Date("2026-10-30T06:00:00Z"))).toBe(
      "يُنشر غدًا 9:00 ص · خالد الحربي",
    );
    expect(line("ticket_message", "نورة", "person")).toBe("من كاتب · نورة");
    expect(line("news_edit_request", null, "person")).toBe("طلب تعديل");
  });

  it("maps every «نشر سبق» bot token to its display name", () => {
    expect(botDraftsPublisherDisplayName("nashr-x")).toBe("نشر سبق");
    expect(botDraftsPublisherDisplayName("nashr-sabq")).toBe("نشر سبق");
    expect(botDraftsPublisherDisplayName("grok-bot")).toBe("قروك بوت");
    expect(botDraftsPublisherDisplayName("other-bot")).toBe("other-bot");
  });

  it("names the sender's role under their name", () => {
    expect(staffDeskActorRole("news_draft", "person")).toBe("مراسل");
    expect(staffDeskActorRole("opinion_draft", "person")).toBe("كاتب رأي");
    expect(staffDeskActorRole("ticket_message", "person")).toBe("كاتب");
    expect(staffDeskActorRole("tweet_draft", "person")).toBeNull();
    expect(staffDeskActorRole("tweet_draft", "agency")).toBe("وكالة");
    expect(staffDeskActorRole("news_bot_draft", "bot")).toBe("بوت");
    expect(staffDeskActorRole("tweet_published", "system")).toBeNull();
  });

  it("writes a stage time without ص/م, with the day when it differs", () => {
    const ref = new Date("2026-11-12T14:03:00Z"); // 5:03 م الرياض
    expect(formatStaffDeskStageTime(new Date("2026-11-12T14:02:00Z"), ref)).toBe("5:02");
    expect(formatStaffDeskStageTime(new Date("2026-11-11T20:45:00Z"), ref)).toBe("أمس 11:45");
    expect(formatStaffDeskStageTime(new Date("2026-11-09T06:00:00Z"), ref)).toBe("الاثنين 9:00");
  });

  it("joins an item's events into one trail", () => {
    const at = (iso: string) => new Date(iso);
    // مقترح وكالة نشره المكتب.
    expect(
      buildStaffDeskEventTrail(
        [
          { kind: "tweet_draft", actorName: "شركة عنوان", createdAt: at("2026-11-12T10:44:00Z"), scheduledAt: null },
          { kind: "tweet_published", actorName: "مكتب سبق", createdAt: at("2026-11-12T10:46:00Z"), scheduledAt: null },
        ],
        "شركة عنوان",
        NOW,
      ),
    ).toBe("مقترحة 1:44 ← نشرها مكتب سبق 1:46");
    // صاحب المقترح نشره بنفسه: لا يتكرر اسمه.
    expect(
      buildStaffDeskEventTrail(
        [
          { kind: "tweet_draft", actorName: "ياسر", createdAt: at("2026-11-12T00:52:00Z"), scheduledAt: null },
          { kind: "tweet_published", actorName: "ياسر", createdAt: at("2026-11-12T00:52:30Z"), scheduledAt: null },
        ],
        "ياسر",
        NOW,
      ),
    ).toBe("مقترحة 3:52 ← نُشرت 3:52");
    // مسودة بوت نُشرت.
    expect(
      buildStaffDeskEventTrail(
        [
          { kind: "news_bot_draft", actorName: "قروك بوت", createdAt: at("2026-11-12T14:02:00Z"), scheduledAt: null },
          { kind: "news_published", actorName: "قروك بوت", createdAt: at("2026-11-12T14:03:00Z"), scheduledAt: null },
        ],
        "قروك بوت",
        NOW,
      ),
    ).toBe("مسودة 5:02 ← نُشر 5:03");
    // نشر آلي في الموعد.
    expect(
      buildStaffDeskEventTrail(
        [{ kind: "tweet_published", actorName: null, createdAt: at("2026-11-11T20:45:00Z"), scheduledAt: null }],
        null,
        NOW,
      ),
    ).toBe("نُشرت تلقائيًا 11:45");
    // رسائل التذكرة الواحدة تُعدّ ولا تتكرر.
    const msg = (iso: string) => ({ kind: "ticket_message" as const, actorName: "نورة", createdAt: at(iso), scheduledAt: null });
    expect(
      buildStaffDeskEventTrail([msg("2026-11-12T07:00:00Z"), msg("2026-11-12T08:00:00Z"), msg("2026-11-12T09:10:00Z")], "نورة", NOW),
    ).toBe("3 رسائل · آخرها 12:10");
    // أكثر من ثلاث مراحل: تُعرض الثلاث الأخيرة.
    const d = (k: "tweet_draft" | "tweet_scheduled" | "tweet_published", iso: string, sch: string | null = null) => ({
      kind: k, actorName: "سارة", createdAt: at(iso), scheduledAt: sch ? at(sch) : null,
    });
    expect(
      buildStaffDeskEventTrail(
        [
          d("tweet_draft", "2026-10-29T05:00:00Z"),
          d("tweet_scheduled", "2026-10-29T05:10:00Z", "2026-10-29T09:00:00Z"),
          d("tweet_scheduled", "2026-10-29T05:20:00Z", "2026-10-29T10:00:00Z"),
          d("tweet_published", "2026-10-29T10:00:00Z"),
        ],
        "سارة",
        NOW,
      ),
    ).toBe("… ← موعدها اليوم 12:00 م ← موعدها اليوم 1:00 م ← نُشرت 1:00");
  });
});
