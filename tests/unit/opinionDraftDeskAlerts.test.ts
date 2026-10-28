import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const rowsQueue: unknown[][] = [];
  const chain = (): any => {
    const obj: any = {};
    for (const m of ["from", "where", "innerJoin", "leftJoin", "limit", "orderBy", "groupBy"]) {
      obj[m] = () => obj;
    }
    obj.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(rowsQueue.length ? rowsQueue.shift() : []).then(resolve, reject);
    return obj;
  };
  return {
    rowsQueue,
    mockDb: {
      select: vi.fn(() => chain()),
      insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
    },
    sendDraftSubmittedNotification: vi.fn(async () => undefined),
    notifyStaffDeskOfOpinionDraft: vi.fn(async () => 1),
    getDeskBotAlertRecipients: vi.fn(async () => ["desk-bot@example.com"]),
    sendDeskAlertEmails: vi.fn(async () => undefined),
    emit: vi.fn(),
  };
});

vi.mock("../../server/db", () => ({ db: h.mockDb }));
vi.mock("../../server/notificationBus", () => ({ notificationBus: { emit: h.emit } }));
vi.mock("../../server/notificationService", () => ({
  sendDraftSubmittedNotification: h.sendDraftSubmittedNotification,
}));
vi.mock("../../server/services/staffAppPushService", () => ({
  notifyStaffDeskOfOpinionDraft: h.notifyStaffDeskOfOpinionDraft,
}));
vi.mock("../../server/services/deskBotAlerts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../server/services/deskBotAlerts")>();
  return {
    ...actual,
    getDeskBotAlertRecipients: h.getDeskBotAlertRecipients,
    sendDeskAlertEmails: h.sendDeskAlertEmails,
  };
});
vi.mock("../../server/services/email", () => ({ sendEmailNotification: vi.fn() }));

import {
  buildOpinionDraftNotice,
  buildOpinionDraftSlotLine,
  formatOpinionSlotRiyadh,
  OPINION_DRAFT_NO_SLOT_LINE,
} from "../../server/services/opinionDraftDeskNotice";
import { buildDeskOpinionDraftAlertEmail } from "../../server/services/deskBotAlerts";
import {
  notifyOpinionArticleSubmittedForReview,
  notifyOpinionDraftDeskChannels,
  resendOpinionDraftDeskAlert,
} from "../../server/services/opinionWritersService";
import {
  renotifyOpinionDraftFromDesk,
  StaffOpinionDeskError,
} from "../../server/services/staffOpinionDeskService";
import { DEFAULT_STAFF_ALERT_PREFS, staffAlertPrefsUpdateSchema } from "@shared/staffApp";
import { normalizeStaffAlertPrefs } from "../../server/services/staffAlertPrefsService";

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("opinion draft notice text", () => {
  it("formats the fixed slot in Riyadh time (day, date, time)", () => {
    // 06:00Z → 09:00 Riyadh, Thursday 29 Oct 2026.
    expect(formatOpinionSlotRiyadh(new Date("2026-10-29T06:00:00Z"))).toBe("الخميس 29 أكتوبر 09:00 (الرياض)");
    // 22:30Z on Friday → 01:30 Saturday in Riyadh.
    expect(formatOpinionSlotRiyadh(new Date("2026-10-30T22:30:00Z"))).toBe("السبت 31 أكتوبر 01:30 (الرياض)");
  });

  it("falls back to «بلا موعد ثابت» when there is no slot", () => {
    expect(buildOpinionDraftSlotLine(null)).toBe(OPINION_DRAFT_NO_SLOT_LINE);
    expect(buildOpinionDraftSlotLine("not-a-date")).toBe(OPINION_DRAFT_NO_SLOT_LINE);
    expect(buildOpinionDraftSlotLine("2026-10-29T06:00:00.000Z")).toBe(
      "موعده الثابت: الخميس 29 أكتوبر 09:00 (الرياض)",
    );
  });

  it("titles the notice with the writer name and puts the article title + slot in the body", () => {
    const n = buildOpinionDraftNotice({
      authorName: "سعد الكاتب",
      articleTitle: "  الاقتصاد\nوالرؤية ",
      nextSlot: "2026-10-29T06:00:00.000Z",
    });
    expect(n.title).toBe("مقال رأي جديد: سعد الكاتب");
    expect(n.body).toBe("«الاقتصاد والرؤية» — موعده الثابت: الخميس 29 أكتوبر 09:00 (الرياض)");
    expect(n.title).not.toContain("مراسل");
    expect(buildOpinionDraftNotice({ authorName: "", articleTitle: "x", nextSlot: null })).toEqual({
      title: "مقال رأي جديد: كاتب رأي",
      body: "«x» — بلا موعد ثابت",
      slotLine: "بلا موعد ثابت",
    });
  });
});

describe("desk bot email type=opinion_draft", () => {
  it("carries the [sabq-desk] header with the article id", () => {
    const mail = buildDeskOpinionDraftAlertEmail({
      articleId: "art-123",
      articleTitle: "عنوان <المقال>",
      authorName: "سعد",
      slotLine: "بلا موعد ثابت",
      nextSlotIso: null,
    });
    expect(mail.header).toBe("[sabq-desk] type=opinion_draft id=art-123");
    expect(mail.subject).toContain("[sabq-desk] type=opinion_draft id=art-123");
    expect(mail.subject).toContain("مقال رأي جديد: سعد");
    expect(mail.text.split("\n")[0]).toBe("[sabq-desk] type=opinion_draft id=art-123");
    expect(mail.text).toContain("next_slot: none");
    expect(mail.text).toContain("بلا موعد ثابت");
    expect(mail.html).toContain("عنوان &lt;المقال&gt;");
    expect(mail.html).not.toContain("<المقال>");
    expect(mail.text).toContain("article_id: art-123");
    expect(mail.text).toContain("author_id: none");
    expect(mail.text).toContain("next_slot_riyadh: none");
  });

  it("gives «مكتب سبق» the ids, the bot API URL and the next slot in ISO + Riyadh", () => {
    vi.stubEnv("PUBLIC_API_URL", "https://api.example.test/");
    try {
      const mail = buildDeskOpinionDraftAlertEmail({
        articleId: "art-9",
        articleTitle: "مقال",
        authorName: "سعد",
        authorId: "writer-1",
        slotLine: "موعده الثابت: الخميس 29 أكتوبر 09:00 (الرياض)",
        nextSlotIso: "2026-10-29T06:00:00.000Z",
      });
      const lines = mail.text.split("\n");
      expect(lines).toContain("article_id: art-9");
      expect(lines).toContain("author_id: writer-1");
      expect(lines).toContain("next_slot: 2026-10-29T06:00:00.000Z");
      expect(lines).toContain("next_slot_riyadh: 2026-10-29 09:00:00 Asia/Riyadh");
      expect(lines).toContain("bot_api: https://api.example.test/api/internal/bot-desk/opinion/drafts/art-9");
      expect(mail.html).toContain("https://api.example.test/api/internal/bot-desk/opinion/drafts/art-9");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("opinionDrafts alert preference (JSON prefs, no migration)", () => {
  it("defaults on and can be switched off", () => {
    expect(DEFAULT_STAFF_ALERT_PREFS.opinionDrafts).toBe(true);
    expect(normalizeStaffAlertPrefs({})).toMatchObject({ opinionDrafts: true });
    expect(normalizeStaffAlertPrefs({ opinionDrafts: false }).opinionDrafts).toBe(false);
    expect(staffAlertPrefsUpdateSchema.safeParse({ opinionDrafts: false }).success).toBe(true);
    expect(staffAlertPrefsUpdateSchema.safeParse({ opinionDrafts: "no" }).success).toBe(false);
  });
});

describe("notifyOpinionArticleSubmittedForReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.rowsQueue.length = 0;
  });

  const article = { id: "art-1", title: "مقال تجريبي", slug: "maqal", authorId: "writer-1" };

  it("sends the corrected web notice, the desk push and the desk bot email", async () => {
    // 1) author lookup, 2) writer schedules (none → بلا موعد ثابت)
    h.rowsQueue.push([{ firstName: "سعد", lastName: "الكاتب" }], []);
    await notifyOpinionArticleSubmittedForReview(article);
    await flush();

    expect(h.sendDraftSubmittedNotification).toHaveBeenCalledTimes(1);
    const [, authorName, authorId, override] = h.sendDraftSubmittedNotification.mock.calls[0] as any[];
    expect(authorName).toBe("سعد الكاتب");
    expect(authorId).toBe("writer-1");
    expect(override.title).toBe("مقال رأي جديد: سعد الكاتب");
    expect(override.body).toBe("«مقال تجريبي» — بلا موعد ثابت");

    expect(h.notifyStaffDeskOfOpinionDraft).toHaveBeenCalledWith({
      articleId: "art-1",
      title: "مقال رأي جديد: سعد الكاتب",
      body: "«مقال تجريبي» — بلا موعد ثابت",
      authorId: "writer-1",
      nextSlot: null,
    });

    expect(h.sendDeskAlertEmails).toHaveBeenCalledTimes(1);
    const [recipients, payload] = h.sendDeskAlertEmails.mock.calls[0] as any[];
    expect(recipients).toEqual(["desk-bot@example.com"]);
    expect(payload.subject).toContain("[sabq-desk] type=opinion_draft id=art-1");
  });

  it("never throws when the push or the email fail", async () => {
    h.rowsQueue.push([{ firstName: "سعد", lastName: "" }], []);
    h.notifyStaffDeskOfOpinionDraft.mockRejectedValueOnce(new Error("apns down"));
    h.getDeskBotAlertRecipients.mockRejectedValueOnce(new Error("db down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(notifyOpinionArticleSubmittedForReview(article)).resolves.toBeUndefined();
    await flush();
    expect(h.sendDraftSubmittedNotification).toHaveBeenCalledTimes(1);
    errSpy.mockRestore();
  });

  it("never throws when the web notice itself fails", async () => {
    h.rowsQueue.push([{ firstName: "سعد", lastName: "" }], []);
    h.sendDraftSubmittedNotification.mockRejectedValueOnce(new Error("insert failed"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(notifyOpinionArticleSubmittedForReview(article)).resolves.toBeUndefined();
    errSpy.mockRestore();
  });

  it("skips the desk bot email when no recipient is configured", async () => {
    h.getDeskBotAlertRecipients.mockResolvedValueOnce([]);
    await notifyOpinionDraftDeskChannels({
      articleId: "art-2",
      articleTitle: "t",
      authorId: "w",
      authorName: "n",
      nextSlot: null,
      notice: { title: "a", body: "b", slotLine: "بلا موعد ثابت" },
    });
    expect(h.sendDeskAlertEmails).not.toHaveBeenCalled();
    expect(h.notifyStaffDeskOfOpinionDraft).toHaveBeenCalledTimes(1);
  });
});

describe("desk renotify (POST /api/v1/staff/opinion/:id/renotify)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.rowsQueue.length = 0;
  });

  const pendingRow = {
    id: "art-9",
    title: "مقال بانتظار المكتب",
    authorId: "writer-9",
    status: "draft",
    reviewStatus: "pending_review",
    source: "web",
    scheduledAt: null,
    publishedAt: null,
    updatedAt: new Date("2026-10-28T06:00:00Z"),
    slug: "maqal-9",
  };

  it("resends only the desk push + bot email (no writer/editor notices, no DB writes)", async () => {
    // 1) author lookup, 2) writer schedules (none)
    h.rowsQueue.push([{ firstName: "سعد", lastName: "الكاتب" }], []);
    h.notifyStaffDeskOfOpinionDraft.mockResolvedValueOnce(3);
    h.sendDeskAlertEmails.mockResolvedValueOnce(1 as never);
    const result = await resendOpinionDraftDeskAlert({ id: "art-9", title: "مقال بانتظار المكتب", authorId: "writer-9" });

    expect(result).toEqual({ pushSent: 3, emailRecipients: 1, emailSent: true });
    expect(h.notifyStaffDeskOfOpinionDraft).toHaveBeenCalledWith({
      articleId: "art-9",
      title: "مقال رأي جديد: سعد الكاتب",
      body: "«مقال بانتظار المكتب» — بلا موعد ثابت",
      authorId: "writer-9",
      nextSlot: null,
    });
    const [, payload] = h.sendDeskAlertEmails.mock.calls[0] as any[];
    expect(payload.subject).toContain("[sabq-desk] type=opinion_draft id=art-9");
    expect(h.sendDraftSubmittedNotification).not.toHaveBeenCalled();
    expect(h.mockDb.insert).not.toHaveBeenCalled();
    expect(h.emit).not.toHaveBeenCalled();
  });

  it("reports emailSent=false when no recipient is configured or the provider refuses", async () => {
    h.rowsQueue.push([{ firstName: "سعد", lastName: "" }], []);
    h.getDeskBotAlertRecipients.mockResolvedValueOnce([]);
    expect(await resendOpinionDraftDeskAlert({ id: "a", title: "t", authorId: "w" })).toEqual({
      pushSent: 1, emailRecipients: 0, emailSent: false,
    });
    h.rowsQueue.push([{ firstName: "سعد", lastName: "" }], []);
    h.sendDeskAlertEmails.mockResolvedValueOnce(0 as never);
    expect(await resendOpinionDraftDeskAlert({ id: "a", title: "t", authorId: "w" })).toEqual({
      pushSent: 1, emailRecipients: 1, emailSent: false,
    });
  });

  it("409 when the draft is not pending_review; nothing is sent", async () => {
    h.rowsQueue.push([{ ...pendingRow, reviewStatus: "approved" }]);
    const err = await renotifyOpinionDraftFromDesk({ articleId: "art-9" }).catch((e) => e);
    expect(err).toBeInstanceOf(StaffOpinionDeskError);
    expect(err.status).toBe(409);
    expect(h.notifyStaffDeskOfOpinionDraft).not.toHaveBeenCalled();
    expect(h.sendDeskAlertEmails).not.toHaveBeenCalled();
  });

  it("404 when the article is missing or not an opinion", async () => {
    h.rowsQueue.push([]);
    const err = await renotifyOpinionDraftFromDesk({ articleId: "nope" }).catch((e) => e);
    expect(err).toBeInstanceOf(StaffOpinionDeskError);
    expect(err.status).toBe(404);
    expect(h.notifyStaffDeskOfOpinionDraft).not.toHaveBeenCalled();
  });

  it("pending draft: returns the channel counts with the article id", async () => {
    h.rowsQueue.push([pendingRow], [{ firstName: "سعد", lastName: "الكاتب" }], []);
    h.sendDeskAlertEmails.mockResolvedValueOnce(1 as never);
    expect(await renotifyOpinionDraftFromDesk({ articleId: "art-9" })).toEqual({
      articleId: "art-9", pushSent: 1, emailRecipients: 1, emailSent: true,
    });
    expect(h.sendDraftSubmittedNotification).not.toHaveBeenCalled();
    expect(h.mockDb.insert).not.toHaveBeenCalled();
  });
});

