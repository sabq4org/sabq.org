import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeStaffOpinionCapabilities,
  resolveStaffOpinionArticleStatus,
  type StaffOpinionWriter,
} from "../../shared/staffApp";

const mocks = vi.hoisted(() => ({
  verifyMemberBearer: vi.fn(),
  userHasPermission: vi.fn(),
  logActivity: vi.fn(),
  getStaffOpinionBoard: vi.fn(),
  getStaffOpinionItem: vi.fn(),
  checkOpinionSlotClashes: vi.fn(),
  scheduleOpinionFromDesk: vi.fn(),
  publishOpinionFromDesk: vi.fn(),
  returnOpinionToWriterFromDesk: vi.fn(),
  renotifyOpinionDraftFromDesk: vi.fn(),
}));

const staffUser = {
  id: "staff-1",
  email: "desk@sabq.org",
  firstName: "محرر",
  lastName: "المكتب",
  role: "editor",
  status: "active",
  profileImageUrl: null,
  twoFactorEnabled: true,
  twoFactorMethod: "authenticator",
  bannedUntil: null,
  suspendedUntil: null,
  accountLocked: false,
  lockedUntil: null,
  deletedAt: null,
  emailVerified: true,
};

vi.mock("../../server/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([staffUser]) }) }) }),
  },
}));
vi.mock("../../server/services/memberSessionService", () => ({
  verifyMemberBearer: (...a: unknown[]) => mocks.verifyMemberBearer(...a),
}));
vi.mock("../../server/rbac", () => ({
  userHasPermission: (...a: unknown[]) => mocks.userHasPermission(...a),
  getUserRoleNames: async () => ["editor"],
  invalidateUserPermissionCache: () => undefined,
  logActivity: (...a: unknown[]) => mocks.logActivity(...a),
}));
vi.mock("../../server/services/opinionTicketsService", async () => {
  const actual = await vi.importActual<typeof import("../../server/services/opinionTicketsService")>(
    "../../server/services/opinionTicketsService",
  );
  return { ...actual, canUserViewOpinionDesk: async () => true };
});
vi.mock("../../server/services/staffOpinionDeskService", async () => {
  const actual = await vi.importActual<typeof import("../../server/services/staffOpinionDeskService")>(
    "../../server/services/staffOpinionDeskService",
  );
  return {
    ...actual,
    getStaffOpinionBoard: (...a: unknown[]) => mocks.getStaffOpinionBoard(...a),
    getStaffOpinionItem: (...a: unknown[]) => mocks.getStaffOpinionItem(...a),
    checkOpinionSlotClashes: (...a: unknown[]) => mocks.checkOpinionSlotClashes(...a),
    scheduleOpinionFromDesk: (...a: unknown[]) => mocks.scheduleOpinionFromDesk(...a),
    publishOpinionFromDesk: (...a: unknown[]) => mocks.publishOpinionFromDesk(...a),
    returnOpinionToWriterFromDesk: (...a: unknown[]) => mocks.returnOpinionToWriterFromDesk(...a),
    renotifyOpinionDraftFromDesk: (...a: unknown[]) => mocks.renotifyOpinionDraftFromDesk(...a),
  };
});

import staffAppMobileRouter from "../../server/routes/staffAppMobile";
import { StaffOpinionDeskError } from "../../server/services/staffOpinionDeskService";
import {
  buildOpinionSlotClashWarnings,
  findOpinionSlotClashes,
  isSameScheduleMinute,
} from "../../server/services/opinionSlotClash";
import { buildStaffOpinionBoard, parseWeekStart } from "../../server/services/staffOpinionBoard";

// ── منطق خالص ─────────────────────────────────────────────────────────

describe("opinion slot clash", () => {
  const at = new Date("2026-11-01T07:00:00.000Z");
  const candidates = [
    { articleId: "a-self", writerId: "w1", writerName: "أنا", scheduledAt: at },
    { articleId: "a-same-writer", writerId: "w1", writerName: "أنا", scheduledAt: at },
    { articleId: "a-other", writerId: "w2", writerName: "كاتب آخر", scheduledAt: new Date("2026-11-01T07:00:42.000Z") },
    { articleId: "a-next-minute", writerId: "w3", writerName: "بعد دقيقة", scheduledAt: new Date("2026-11-01T07:01:00.000Z") },
  ];

  it("flags only other writers scheduled in the same minute", () => {
    const clashes = findOpinionSlotClashes({ scheduledAt: at, articleId: "a-self", writerId: "w1", candidates });
    expect(clashes.map((c) => c.articleId)).toEqual(["a-other"]);
  });

  it("builds an Arabic warning carrying the other writer", () => {
    const [w] = buildOpinionSlotClashWarnings([candidates[2]]);
    expect(w).toEqual({
      code: "slot_clash",
      message: "تنبيه: الكاتب كاتب آخر مجدول في الموعد نفسه",
      otherWriterName: "كاتب آخر",
      otherArticleId: "a-other",
    });
  });

  it("compares by minute and ignores invalid dates", () => {
    expect(isSameScheduleMinute(at, new Date(at.getTime() + 59_000))).toBe(true);
    expect(isSameScheduleMinute(at, new Date(at.getTime() + 60_000))).toBe(false);
    expect(findOpinionSlotClashes({ scheduledAt: new Date("x"), articleId: "z", writerId: null, candidates })).toEqual([]);
  });
});

describe("opinion status mapping", () => {
  it("maps desk statuses", () => {
    expect(resolveStaffOpinionArticleStatus({ status: "draft", reviewStatus: "pending_review" })).toBe("new_draft");
    expect(resolveStaffOpinionArticleStatus({ status: "draft", reviewStatus: null, source: "ios-app" })).toBe("new_draft");
    expect(resolveStaffOpinionArticleStatus({ status: "draft", reviewStatus: "approved" })).toBe("in_prep");
    expect(resolveStaffOpinionArticleStatus({ status: "scheduled", reviewStatus: "approved" })).toBe("scheduled");
    expect(resolveStaffOpinionArticleStatus({ status: "published", reviewStatus: "approved" })).toBe("published");
  });

  it("hides drafts that are not the desk's business", () => {
    expect(resolveStaffOpinionArticleStatus({ status: "draft", reviewStatus: null, source: "web" })).toBeNull();
    expect(resolveStaffOpinionArticleStatus({ status: "draft", reviewStatus: "needs_changes" })).toBeNull();
    expect(resolveStaffOpinionArticleStatus({ status: "draft", reviewStatus: "rejected" })).toBeNull();
    expect(resolveStaffOpinionArticleStatus({ status: "archived", reviewStatus: "approved" })).toBeNull();
  });
});

describe("canOpinion capabilities", () => {
  const none = { opinionReview: false, articlesSchedule: false, articlesPublish: false, articlesEditAny: false };
  it("needs opinion.review or articles.schedule to view anything", () => {
    expect(computeStaffOpinionCapabilities({ ...none, articlesPublish: true, articlesEditAny: true })).toEqual({
      view: false, schedule: false, publish: false, returnToWriter: false,
    });
  });
  it("reviewer without publish: view + return only", () => {
    expect(computeStaffOpinionCapabilities({ ...none, opinionReview: true })).toEqual({
      view: true, schedule: false, publish: false, returnToWriter: true,
    });
  });
  it("scheduler: view + schedule; publish needs articles.publish; return via edit_any", () => {
    expect(computeStaffOpinionCapabilities({ ...none, articlesSchedule: true })).toEqual({
      view: true, schedule: true, publish: false, returnToWriter: false,
    });
    expect(
      computeStaffOpinionCapabilities({ ...none, opinionReview: true, articlesPublish: true, articlesEditAny: true }),
    ).toEqual({ view: true, schedule: true, publish: true, returnToWriter: true });
  });
});

describe("buildStaffOpinionBoard", () => {
  // الأربعاء 28 أكتوبر 2026، 09:00 الرياض
  const now = new Date("2026-10-28T06:00:00.000Z");
  const w = (id: string, name: string, fixedSlot: StaffOpinionWriter["fixedSlot"]): StaffOpinionWriter => ({
    id, name, avatarUrl: null, jobTitle: null, fixedSlot,
  });
  const writers = new Map<string, StaffOpinionWriter>([
    ["w1", w("w1", "د. كاتب الرأي", { weekday: 4, publishTime: "09:00" })],
    ["w2", w("w2", "أ. كاتبة الرأي", { weekday: 6, publishTime: "08:00" })],
    ["w4", w("w4", "م. كاتب الأسبوع", { weekday: 0, publishTime: "10:00" })],
    ["w5", w("w5", "د. كاتب المقال", { weekday: 2, publishTime: "09:00" })],
    ["w6", w("w6", "كاتب الصباح", { weekday: 3, publishTime: "06:00" })],
    ["w3", w("w3", "كاتب ضيف", null)],
  ]);
  const row = (id: string, authorId: string, status: string, reviewStatus: string | null, extra: Record<string, unknown> = {}) => ({
    id, title: `مقال ${id}`, authorId, status, reviewStatus, source: "web",
    scheduledAt: null, publishedAt: null, updatedAt: new Date("2026-10-28T05:48:00.000Z"), ...extra,
  });
  const board = buildStaffOpinionBoard({
    now,
    weekStart: parseWeekStart("2026-10-28")!,
    writers,
    articles: [
      row("a1", "w1", "draft", "pending_review"),
      row("a2", "w2", "draft", "approved"),
      row("a4", "w4", "scheduled", "approved", { scheduledAt: new Date("2026-11-01T07:00:00.000Z") }),
      row("a3", "w3", "draft", "pending_review"),
      row("ax", "w5", "draft", "needs_changes"),
    ],
  });

  it("puts every fixed slot on the timeline, sorted, with its state", () => {
    expect(board.weekStart).toBe("2026-10-28");
    expect(board.slots.map((s) => [s.writer.id, s.slotAt, s.state, s.article?.status ?? null])).toEqual([
      ["w6", "2026-10-28T03:00:00.000Z", "late", null],
      ["w1", "2026-10-29T06:00:00.000Z", "arrived", "new_draft"],
      ["w2", "2026-10-31T05:00:00.000Z", "arrived", "in_prep"],
      ["w4", "2026-11-01T07:00:00.000Z", "scheduled", "scheduled"],
      ["w5", "2026-11-03T06:00:00.000Z", "missing", null],
    ]);
    expect(board.slots[1].deeplink).toBe("sabqdesk://opinion/a1");
  });

  it("lists writers without a fixed slot separately and counts the badge", () => {
    expect(board.unslotted.map((s) => [s.writer.id, s.slotAt, s.article?.id])).toEqual([["w3", null, "a3"]]);
    expect(board.pendingCount).toBe(3);
  });

  it("counts day dots", () => {
    const byDate = Object.fromEntries(board.days.map((d) => [d.date, d.counts]));
    expect(board.days).toHaveLength(7);
    expect(byDate["2026-10-29"]).toEqual({ draft: 1, prep: 0, scheduled: 0, missing: 0 });
    expect(byDate["2026-10-31"]).toEqual({ draft: 0, prep: 1, scheduled: 0, missing: 0 });
    expect(byDate["2026-11-01"]).toEqual({ draft: 0, prep: 0, scheduled: 1, missing: 0 });
    expect(byDate["2026-11-03"]).toEqual({ draft: 0, prep: 0, scheduled: 0, missing: 1 });
    expect(byDate["2026-10-28"].missing).toBe(1);
  });

  it("gives a second pending draft of a slotted writer the following fixed slot", () => {
    const b = buildStaffOpinionBoard({
      now,
      weekStart: parseWeekStart("2026-10-28")!,
      writers,
      articles: [
        row("a4", "w4", "scheduled", "approved", { scheduledAt: new Date("2026-11-01T07:00:00.000Z") }),
        row("a4b", "w4", "draft", "pending_review"),
      ],
    });
    const next = b.slots.find((s) => s.article?.id === "a4b");
    expect(next?.slotAt).toBe("2026-11-08T07:00:00.000Z");
    expect(b.unslotted).toEqual([]);
  });

  it("rejects malformed week starts", () => {
    expect(parseWeekStart("2026-02-30")).toBeNull();
    expect(parseWeekStart("28-10-2026")).toBeNull();
  });
});

// ── المسارات ─────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use("/api/v1/staff", staffAppMobileRouter);
const server = createServer(app);
let base = "";

function call(method: string, path: string, body?: unknown, auth = true) {
  return fetch(`${base}/api/v1/staff${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(auth ? { Authorization: "Bearer member_session_x" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

let granted: string[] = [];

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
beforeEach(() => {
  vi.stubEnv("STAFF_APP_READ_RATE_LIMIT", "1000");
  vi.stubEnv("STAFF_APP_OPINION_RATE_LIMIT", "1000");
  for (const fn of Object.values(mocks)) fn.mockReset();
  granted = ["opinion.review", "articles.schedule", "articles.publish", "articles.edit_any"];
  mocks.verifyMemberBearer.mockImplementation(async (req: express.Request) =>
    req.headers.authorization === "Bearer member_session_x" ? { userId: staffUser.id } : null,
  );
  mocks.userHasPermission.mockImplementation(async (_u: string, code: string) => granted.includes(code));
  mocks.logActivity.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/api/v1/staff/opinion routes", () => {
  it("401 without a session", async () => {
    const res = await call("GET", "/opinion/board", undefined, false);
    expect(res.status).toBe(401);
    expect(mocks.getStaffOpinionBoard).not.toHaveBeenCalled();
  });

  it("403 for members without opinion.review / articles.schedule", async () => {
    granted = ["articles.publish", "articles.edit_any"];
    for (const [method, path, body] of [
      ["GET", "/opinion/board", undefined],
      ["GET", "/opinion/a1", undefined],
      ["POST", "/opinion/a1/publish", {}],
      ["POST", "/opinion/a1/schedule", { mode: "fixed_slot" }],
      ["POST", "/opinion/a1/return-to-writer", { note: "عدّل المقدمة" }],
      ["POST", "/opinion/a1/renotify", {}],
    ] as const) {
      const res = await call(method, path, body);
      expect(res.status, `${method} ${path}`).toBe(403);
      expect((await res.json()).code).toBe("forbidden");
    }
  });

  it("publish needs articles.publish; reviewers can still view", async () => {
    granted = ["opinion.review"];
    mocks.getStaffOpinionBoard.mockResolvedValue({ weekStart: "2026-10-28", days: [], slots: [], unslotted: [], pendingCount: 0 });
    expect((await call("GET", "/opinion/board")).status).toBe(200);
    expect((await call("POST", "/opinion/a1/publish", {})).status).toBe(403);
    expect(mocks.publishOpinionFromDesk).not.toHaveBeenCalled();
  });

  it("/me exposes canOpinion", async () => {
    granted = ["articles.schedule"];
    const me = await (await call("GET", "/me")).json();
    expect(me.capabilities.canOpinion).toEqual({ view: true, schedule: true, publish: false, returnToWriter: false });
  });

  it("board passes weekStart and validates it", async () => {
    mocks.getStaffOpinionBoard.mockResolvedValue({ weekStart: "2026-10-28", days: [], slots: [], unslotted: [], pendingCount: 2 });
    const ok = await call("GET", "/opinion/board?weekStart=2026-10-28");
    expect(ok.status).toBe(200);
    expect((await ok.json()).pendingCount).toBe(2);
    expect(mocks.getStaffOpinionBoard).toHaveBeenCalledWith({ weekStart: "2026-10-28" });
    expect((await call("GET", "/opinion/board?weekStart=28-10")).status).toBe(400);
  });

  it("return-to-writer requires a 3..2000 char note", async () => {
    for (const body of [{}, { note: "" }, { note: "  ab " }, { note: "x".repeat(2001) }]) {
      const res = await call("POST", "/opinion/a1/return-to-writer", body);
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("validation_error");
    }
    expect(mocks.returnOpinionToWriterFromDesk).not.toHaveBeenCalled();

    mocks.returnOpinionToWriterFromDesk.mockResolvedValue({
      article: { id: "a1", status: "draft", reviewStatus: "needs_changes" },
      previous: { status: "draft", reviewStatus: "pending_review" },
    });
    const ok = await call("POST", "/opinion/a1/return-to-writer", { note: "  عدّل المقدمة  " });
    expect(ok.status).toBe(200);
    expect(mocks.returnOpinionToWriterFromDesk).toHaveBeenCalledWith({ articleId: "a1", actorId: "staff-1", note: "عدّل المقدمة" });
    expect(mocks.logActivity).toHaveBeenCalledWith(expect.objectContaining({
      action: "staff_opinion_return_to_writer",
      entityId: "a1",
      metadata: expect.objectContaining({ channel: "staff-app" }),
    }));
  });

  it("schedule passes clash warnings through with 200 and audits", async () => {
    const warnings = [{ code: "slot_clash", message: "تنبيه: الكاتب ب مجدول في الموعد نفسه", otherWriterName: "ب", otherArticleId: "a9" }];
    mocks.scheduleOpinionFromDesk.mockResolvedValue({
      article: { id: "a1", status: "scheduled", scheduledAt: "2026-10-29T06:00:00.000Z" },
      previous: { status: "draft", scheduledAt: null, reviewStatus: "pending_review" },
      scheduledAt: "2026-10-29T06:00:00.000Z",
      warnings,
    });
    const res = await call("POST", "/opinion/a1/schedule", { scheduledAt: "2026-10-29T09:00:00+03:00" });
    expect(res.status).toBe(200);
    expect((await res.json()).warnings).toEqual(warnings);
    expect(mocks.scheduleOpinionFromDesk).toHaveBeenCalledWith({
      articleId: "a1", actorId: "staff-1", request: { scheduledAt: "2026-10-29T09:00:00+03:00" },
    });
    expect(mocks.logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "staff_opinion_schedule" }));
  });

  it("schedule rejects bad bodies and maps service errors", async () => {
    expect((await call("POST", "/opinion/a1/schedule", {})).status).toBe(400);
    expect((await call("POST", "/opinion/a1/schedule", { scheduledAt: "tomorrow" })).status).toBe(400);
    mocks.scheduleOpinionFromDesk.mockRejectedValue(new StaffOpinionDeskError(409, "conflict", "لا موعد ثابت"));
    const res = await call("POST", "/opinion/a1/schedule", { mode: "fixed_slot" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ code: "conflict", message: "لا موعد ثابت" });
  });

  it("slot-check returns warnings without writing", async () => {
    mocks.checkOpinionSlotClashes.mockResolvedValue([]);
    const res = await call("GET", "/opinion/a1/slot-check?scheduledAt=2026-10-29T09:00:00%2B03:00");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ scheduledAt: "2026-10-29T06:00:00.000Z", warnings: [] });
    expect(mocks.logActivity).not.toHaveBeenCalled();
  });

  it("publish: 409 when already published, audit on success", async () => {
    mocks.publishOpinionFromDesk.mockRejectedValueOnce(new StaffOpinionDeskError(409, "conflict", "هذا المقال منشور بالفعل"));
    expect((await call("POST", "/opinion/a1/publish", {})).status).toBe(409);
    mocks.publishOpinionFromDesk.mockResolvedValue({
      article: { id: "a1", status: "published", publishedAt: "2026-10-28T06:00:00.000Z" },
      previous: { status: "draft", reviewStatus: "pending_review" },
    });
    const ok = await call("POST", "/opinion/a1/publish", {});
    expect(ok.status).toBe(200);
    expect(mocks.logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "staff_opinion_publish" }));
    expect((await call("POST", "/opinion/a1/publish", { force: true })).status).toBe(400);
  });

  it("prepare is a 501 stub, flag or not", async () => {
    const res = await call("POST", "/opinion/a1/prepare", {});
    expect(res.status).toBe(501);
    expect(await res.json()).toEqual({ code: "not_implemented", message: "التجهيز الآلي قريبًا" });
    vi.stubEnv("OPINION_AUTO_PREP_ENABLED", "true");
    expect((await call("POST", "/opinion/a1/prepare", {})).status).toBe(501);
  });

  describe("POST /opinion/:id/renotify", () => {
    const sent = { articleId: "", pushSent: 2, emailRecipients: 1, emailSent: true };

    it("403 without opinion.review / articles.schedule; never calls the desk channels", async () => {
      granted = ["articles.publish", "articles.edit_any"];
      const res = await call("POST", "/opinion/rn-forbidden/renotify", {});
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("forbidden");
      expect(mocks.renotifyOpinionDraftFromDesk).not.toHaveBeenCalled();
    });

    it("works with articles.schedule alone (same as view)", async () => {
      granted = ["articles.schedule"];
      mocks.renotifyOpinionDraftFromDesk.mockResolvedValue({ ...sent, articleId: "rn-sched" });
      expect((await call("POST", "/opinion/rn-sched/renotify", {})).status).toBe(200);
    });

    it("404 / 409 from the service pass through and do not burn the rate limit", async () => {
      mocks.renotifyOpinionDraftFromDesk.mockRejectedValueOnce(
        new StaffOpinionDeskError(404, "not_found", "مقال الرأي غير موجود"),
      );
      expect((await call("POST", "/opinion/rn-missing/renotify", {})).status).toBe(404);

      mocks.renotifyOpinionDraftFromDesk.mockRejectedValueOnce(
        new StaffOpinionDeskError(409, "conflict", "إعادة التنبيه متاحة فقط لمسودة رأي بانتظار المراجعة"),
      );
      const conflict = await call("POST", "/opinion/rn-409/renotify", {});
      expect(conflict.status).toBe(409);
      expect((await conflict.json()).code).toBe("conflict");
      expect(mocks.logActivity).not.toHaveBeenCalled();

      // الطلب الفاشل لا يُحتسب: نفس المقال ينجح بعد أن يصبح pending_review.
      mocks.renotifyOpinionDraftFromDesk.mockResolvedValueOnce({ ...sent, articleId: "rn-409" });
      expect((await call("POST", "/opinion/rn-409/renotify", {})).status).toBe(200);
    });

    it("returns what the desk channels reported and audits staff_opinion_renotify", async () => {
      mocks.renotifyOpinionDraftFromDesk.mockResolvedValue({ ...sent, articleId: "rn-ok" });
      const res = await call("POST", "/opinion/rn-ok/renotify", {});
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, pushSent: 2, emailSent: true, emailRecipients: 1 });
      expect(mocks.renotifyOpinionDraftFromDesk).toHaveBeenCalledWith({ articleId: "rn-ok" });
      expect(mocks.logActivity).toHaveBeenCalledWith(expect.objectContaining({
        userId: "staff-1",
        action: "staff_opinion_renotify",
        entityType: "article",
        entityId: "rn-ok",
        metadata: expect.objectContaining({ channel: "staff-app", pushSent: 2, emailSent: true }),
      }));
      // لا جدولة ولا نشر ولا إعادة للكاتب.
      expect(mocks.scheduleOpinionFromDesk).not.toHaveBeenCalled();
      expect(mocks.publishOpinionFromDesk).not.toHaveBeenCalled();
      expect(mocks.returnOpinionToWriterFromDesk).not.toHaveBeenCalled();
    });

    it("429 on a second renotify of the same article within 5 minutes; other articles unaffected", async () => {
      mocks.renotifyOpinionDraftFromDesk.mockImplementation(async ({ articleId }: { articleId: string }) => ({
        ...sent,
        articleId,
      }));
      expect((await call("POST", "/opinion/rn-limit/renotify", {})).status).toBe(200);
      const limited = await call("POST", "/opinion/rn-limit/renotify", {});
      expect(limited.status).toBe(429);
      expect((await limited.json()).code).toBe("rate_limited");
      expect(mocks.renotifyOpinionDraftFromDesk).toHaveBeenCalledTimes(1);
      expect((await call("POST", "/opinion/rn-limit-other/renotify", {})).status).toBe(200);
    });
  });
});
