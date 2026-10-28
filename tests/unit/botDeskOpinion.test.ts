// مسارات الرأي في bot-desk API لبوت «مكتب سبق».
// الشرط الأساسي: لا منطق خاص بالبوت — «جهّز وجدول» وغيرها تستدعي الدوال نفسها
// التي يستدعيها تطبيق الديسك (/api/v1/staff/opinion/*)، والصلاحية تُحسب بالمساعد نفسه.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyMemberBearer: vi.fn(),
  authenticatePublisherToken: vi.fn(),
  userHasPermission: vi.fn(),
  logActivity: vi.fn(),
  resolveStaffCapabilitiesAndRoles: vi.fn(),
  getStaffOpinionBoard: vi.fn(),
  getStaffOpinionItem: vi.fn(),
  getOpinionDraftContent: vi.fn(),
  checkOpinionSlotClashes: vi.fn(),
  scheduleOpinionFromDesk: vi.fn(),
  publishOpinionFromDesk: vi.fn(),
  returnOpinionToWriterFromDesk: vi.fn(),
  renotifyOpinionDraftFromDesk: vi.fn(),
  startOpinionPrep: vi.fn(),
  getOpinionPrepJob: vi.fn(),
  sendEmailNotification: vi.fn(),
  createNotification: vi.fn(),
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

const BOT_PRINCIPAL = {
  userId: "maktab-sabq-bot",
  tokenId: "tok-uuid-1",
  tokenPrefix: "botpub_valid_per",
  label: "maktab-sabq",
  email: "maktab@sabq.org",
  name: "مكتب سبق",
  expiresAt: new Date("2027-01-01T00:00:00.000Z"),
  capabilities: ["read", "publish", "schedule"],
};
const VALID_CREDENTIAL = "botpub_valid_personal_credential";

vi.mock("../../server/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([staffUser]) }) }) }),
  },
}));
vi.mock("../../server/services/memberSessionService", () => ({
  verifyMemberBearer: (...a: unknown[]) => mocks.verifyMemberBearer(...a),
}));
vi.mock("../../server/services/botPublisherTokenService", () => ({
  authenticatePublisherToken: (...a: unknown[]) => mocks.authenticatePublisherToken(...a),
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
// المساعد الحقيقي يعمل (userHasPermission المزيّف يحدد الأذونات)؛ نتجسس فقط لنثبت أن البوت يستدعيه.
vi.mock("../../server/services/staffAppService", async () => {
  const actual = await vi.importActual<typeof import("../../server/services/staffAppService")>(
    "../../server/services/staffAppService",
  );
  mocks.resolveStaffCapabilitiesAndRoles.mockImplementation(actual.resolveStaffCapabilitiesAndRoles);
  return {
    ...actual,
    resolveStaffCapabilitiesAndRoles: (...a: Parameters<typeof actual.resolveStaffCapabilitiesAndRoles>) =>
      mocks.resolveStaffCapabilitiesAndRoles(...a),
  };
});
vi.mock("../../server/services/staffOpinionDeskService", async () => {
  const actual = await vi.importActual<typeof import("../../server/services/staffOpinionDeskService")>(
    "../../server/services/staffOpinionDeskService",
  );
  return {
    ...actual,
    getStaffOpinionBoard: (...a: unknown[]) => mocks.getStaffOpinionBoard(...a),
    getStaffOpinionItem: (...a: unknown[]) => mocks.getStaffOpinionItem(...a),
    getOpinionDraftContent: (...a: unknown[]) => mocks.getOpinionDraftContent(...a),
    checkOpinionSlotClashes: (...a: unknown[]) => mocks.checkOpinionSlotClashes(...a),
    scheduleOpinionFromDesk: (...a: unknown[]) => mocks.scheduleOpinionFromDesk(...a),
    publishOpinionFromDesk: (...a: unknown[]) => mocks.publishOpinionFromDesk(...a),
    returnOpinionToWriterFromDesk: (...a: unknown[]) => mocks.returnOpinionToWriterFromDesk(...a),
    renotifyOpinionDraftFromDesk: (...a: unknown[]) => mocks.renotifyOpinionDraftFromDesk(...a),
  };
});
vi.mock("../../server/services/staffOpinionPrepareService", () => ({
  startOpinionPrep: (...a: unknown[]) => mocks.startOpinionPrep(...a),
  getOpinionPrepJob: (...a: unknown[]) => mocks.getOpinionPrepJob(...a),
}));
vi.mock("../../server/services/email", () => ({
  sendEmailNotification: (...a: unknown[]) => mocks.sendEmailNotification(...a),
}));
vi.mock("../../server/storage", () => ({
  storage: { createNotification: (...a: unknown[]) => mocks.createNotification(...a) },
}));

import botDeskRouter from "../../server/routes/botDesk";
import staffAppMobileRouter from "../../server/routes/staffAppMobile";
import { StaffOpinionDeskError } from "../../server/services/staffOpinionDeskService";
import * as prepService from "../../server/services/staffOpinionPrepareService";

const BOT = "/api/internal/bot-desk/opinion/drafts";

const app = express();
app.use(express.json());
app.use(botDeskRouter);
app.use("/api/v1/staff", staffAppMobileRouter);
const server = createServer(app);
let base = "";

function bot(method: string, path: string, body?: unknown, credential: string | null = VALID_CREDENTIAL) {
  return fetch(`${base}${BOT}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function staff(method: string, path: string, body?: unknown) {
  return fetch(`${base}/api/v1/staff${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      Authorization: "Bearer member_session_x",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const writer = { id: "w1", name: "سعد الكاتب", avatarUrl: null, slotLabel: "الخميس 09:00", isActive: true };
function item(id: string, status: string, slotAt: string | null) {
  return {
    writer,
    slotAt,
    state: status === "published" ? "published" : status === "scheduled" ? "scheduled" : "pending",
    article: { id, title: `مقال ${id}`, status, submittedAt: null, scheduledAt: null, publishedAt: null },
    deeplink: `sabqdesk://opinion/${id}`,
  };
}
const job = {
  articleId: "a1", status: "running", step: "proofread", stepLabel: "تدقيق العنوان والنص",
  startedAt: "2026-10-28T06:00:00.000Z", finishedAt: null, scheduledAt: null,
  titleChanged: false, contentFixes: 0, image: null, message: null,
};

let granted: string[] = [];

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
beforeEach(() => {
  vi.stubEnv("BOT_DESK_WRITE_RATE_LIMIT", "1000");
  vi.stubEnv("BOT_DESK_PUBLISH_RATE_LIMIT", "1000");
  vi.stubEnv("BOT_DESK_OPINION_RATE_LIMIT", "1000");
  vi.stubEnv("STAFF_APP_READ_RATE_LIMIT", "1000");
  vi.stubEnv("STAFF_APP_OPINION_RATE_LIMIT", "1000");
  for (const [name, fn] of Object.entries(mocks)) {
    if (name === "resolveStaffCapabilitiesAndRoles") fn.mockClear();
    else fn.mockReset();
  }
  granted = ["opinion.review", "articles.schedule", "articles.publish", "articles.edit_any"];
  mocks.authenticatePublisherToken.mockImplementation(async (raw: string) =>
    raw === VALID_CREDENTIAL ? BOT_PRINCIPAL : null,
  );
  mocks.verifyMemberBearer.mockImplementation(async (req: express.Request) =>
    req.headers.authorization === "Bearer member_session_x" ? { userId: staffUser.id } : null,
  );
  mocks.userHasPermission.mockImplementation(async (_u: string, code: string) => granted.includes(code));
  mocks.logActivity.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("bot-desk opinion — auth & permissions", () => {
  it("401 without a botpub_ token; services never called", async () => {
    for (const cred of [null, "legacy-shared-credential-placeholder", "botpub_revoked"]) {
      const res = await bot("GET", "", undefined, cred);
      expect(res.status).toBe(401);
      expect((await res.json()).code).toBe("unauthorized");
    }
    expect((await bot("POST", "/a1/prepare", {}, null)).status).toBe(401);
    expect(mocks.getStaffOpinionBoard).not.toHaveBeenCalled();
    expect(mocks.startOpinionPrep).not.toHaveBeenCalled();
  });

  it("checks the token owner's permissions via resolveStaffCapabilitiesAndRoles (same as the app)", async () => {
    mocks.getStaffOpinionBoard.mockResolvedValue({ weekStart: "2026-10-26", days: [], slots: [], unslotted: [], pendingCount: 0 });
    expect((await bot("GET", "")).status).toBe(200);
    expect(mocks.resolveStaffCapabilitiesAndRoles).toHaveBeenCalledWith(BOT_PRINCIPAL.userId);
    expect(mocks.userHasPermission).toHaveBeenCalledWith(BOT_PRINCIPAL.userId, "opinion.review");
  });

  it("403 for an owner without opinion.review / articles.schedule", async () => {
    granted = ["articles.publish", "articles.edit_any"];
    for (const [method, path, body] of [
      ["GET", "", undefined],
      ["GET", "/a1", undefined],
      ["POST", "/a1/prepare", {}],
      ["GET", "/a1/prepare", undefined],
      ["POST", "/a1/schedule", {}],
      ["POST", "/a1/publish", {}],
      ["POST", "/a1/return", { note: "عدّل المقدمة" }],
    ] as const) {
      const res = await bot(method, path, body);
      expect(res.status, `${method} ${path}`).toBe(403);
      expect((await res.json()).code).toBe("forbidden");
    }
    expect(mocks.startOpinionPrep).not.toHaveBeenCalled();
    expect(mocks.scheduleOpinionFromDesk).not.toHaveBeenCalled();
  });

  it("reviewer-only owner can read but not publish (articles.publish needed, like the app)", async () => {
    granted = ["opinion.review"];
    mocks.getOpinionPrepJob.mockResolvedValue(null);
    expect((await bot("GET", "/a1/prepare")).status).toBe(404);
    expect((await bot("POST", "/a1/publish", {})).status).toBe(403);
    expect((await bot("POST", "/a1/prepare", {})).status).toBe(403);
    expect(mocks.publishOpinionFromDesk).not.toHaveBeenCalled();
  });
});

describe("bot-desk opinion — reads", () => {
  it("board: pending first, then scheduled, then published; empty slots dropped", async () => {
    const board = {
      weekStart: "2026-10-26",
      days: [],
      slots: [
        item("pub", "published", "2026-10-26T06:00:00.000Z"),
        item("sch", "scheduled", "2026-10-27T06:00:00.000Z"),
        { writer, slotAt: "2026-10-28T06:00:00.000Z", state: "empty", article: null, deeplink: null },
        item("new", "new_draft", "2026-10-29T06:00:00.000Z"),
      ],
      unslotted: [item("prep", "in_prep", null)],
      pendingCount: 2,
    };
    mocks.getStaffOpinionBoard.mockResolvedValue(board);
    const res = await bot("GET", "?weekStart=2026-10-26");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items.map((i: { article: { id: string } }) => i.article.id)).toEqual(["new", "prep", "sch", "pub"]);
    expect(json.slots).toHaveLength(4);
    expect(json.pendingCount).toBe(2);
    expect(mocks.getStaffOpinionBoard).toHaveBeenCalledWith({ weekStart: "2026-10-26" });
    expect((await bot("GET", "?weekStart=26-10")).status).toBe(400);
  });

  it("detail: item + nextSlot + full draft + clash warnings + prep job", async () => {
    mocks.getStaffOpinionItem.mockResolvedValue({
      item: item("a1", "new_draft", "2026-10-29T06:00:00.000Z"),
      nextSlot: "2026-10-29T06:00:00.000Z",
    });
    const draft = {
      id: "a1", title: "مقال a1", subtitle: null, slug: "a1", status: "draft", reviewStatus: "pending_review",
      reviewNotes: null, content: "<p>نص</p>", excerpt: "مقتطف", imageUrl: null, albumImages: [],
      isAiGeneratedImage: false, category: { id: "c1", name: "رأي" }, aiSummary: null, seo: null, updatedAt: null,
    };
    mocks.getOpinionDraftContent.mockResolvedValue(draft);
    mocks.getOpinionPrepJob.mockResolvedValue(job);
    const warnings = [{ code: "slot_clash", message: "تنبيه", otherWriterName: "ب", otherArticleId: "a9" }];
    mocks.checkOpinionSlotClashes.mockResolvedValue(warnings);
    const res = await bot("GET", "/a1");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.draft).toEqual(draft);
    expect(json.prep).toEqual(job);
    expect(json.warnings).toEqual(warnings);
    expect(json.nextSlot).toBe("2026-10-29T06:00:00.000Z");
    expect(mocks.checkOpinionSlotClashes).toHaveBeenCalledWith("a1", new Date("2026-10-29T06:00:00.000Z"));
  });

  it("detail 404 passes the desk service error through", async () => {
    mocks.getStaffOpinionItem.mockRejectedValue(new StaffOpinionDeskError(404, "not_found", "مقال الرأي غير موجود"));
    const res = await bot("GET", "/missing");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ code: "not_found", message: "مقال الرأي غير موجود" });
  });

  it("slot-check returns warnings without writing", async () => {
    mocks.checkOpinionSlotClashes.mockResolvedValue([]);
    const res = await bot("GET", "/a1/slot-check?scheduledAt=2026-10-29T09:00:00%2B03:00");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ scheduledAt: "2026-10-29T06:00:00.000Z", warnings: [] });
    expect(mocks.logActivity).not.toHaveBeenCalled();
  });
});

describe("bot-desk opinion — «جهّز وجدول» (prepare)", () => {
  it("delegates to startOpinionPrep with the bot owner as actor; 202 + audit once", async () => {
    mocks.startOpinionPrep.mockResolvedValueOnce({ job, created: true });
    const res = await bot("POST", "/a1/prepare", {});
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ job });
    expect(mocks.startOpinionPrep).toHaveBeenCalledWith({ articleId: "a1", actorId: BOT_PRINCIPAL.userId, scheduledAt: undefined });
    expect(mocks.logActivity).toHaveBeenCalledWith(expect.objectContaining({
      action: "opinion_prepare_start",
      entityId: "a1",
      metadata: expect.objectContaining({ channel: "bot-desk-api", scheduledAt: "fixed_slot" }),
    }));

    mocks.logActivity.mockClear();
    mocks.startOpinionPrep.mockResolvedValueOnce({ job, created: false });
    expect((await bot("POST", "/a1/prepare", { scheduledAt: "2026-10-29T09:00:00+03:00" })).status).toBe(202);
    expect(mocks.startOpinionPrep).toHaveBeenLastCalledWith({
      articleId: "a1", actorId: BOT_PRINCIPAL.userId, scheduledAt: "2026-10-29T09:00:00+03:00",
    });
    expect(mocks.logActivity).not.toHaveBeenCalled();
  });

  it("validates the body and passes 404/409 through", async () => {
    expect((await bot("POST", "/a1/prepare", { scheduledAt: "tomorrow" })).status).toBe(400);
    expect((await bot("POST", "/a1/prepare", { force: true })).status).toBe(400);
    mocks.startOpinionPrep.mockRejectedValueOnce(new StaffOpinionDeskError(409, "conflict", "المقال قيد التحرير لدى محرر آخر"));
    const conflict = await bot("POST", "/a1/prepare", {});
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ code: "conflict", message: "المقال قيد التحرير لدى محرر آخر" });
    mocks.startOpinionPrep.mockRejectedValueOnce(new StaffOpinionDeskError(404, "not_found", "مقال الرأي غير موجود"));
    expect((await bot("POST", "/x/prepare", {})).status).toBe(404);
  });

  it("status mirrors the app's GET /opinion/:id/prepare", async () => {
    mocks.getOpinionPrepJob.mockResolvedValueOnce({ ...job, status: "done", scheduledAt: "2026-11-01T06:00:00.000Z" });
    const res = await bot("GET", "/a1/prepare");
    expect(res.status).toBe(200);
    expect((await res.json()).job.status).toBe("done");
    mocks.getOpinionPrepJob.mockResolvedValueOnce(null);
    const missing = await bot("GET", "/a1/prepare");
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ code: "not_found", message: "لا يوجد تجهيز لهذا المقال" });
  });

  it("the app route and the bot route invoke the SAME startOpinionPrep function", async () => {
    mocks.startOpinionPrep.mockResolvedValue({ job, created: true });
    expect((await staff("POST", "/opinion/a1/prepare", {})).status).toBe(202);
    expect((await bot("POST", "/a1/prepare", {})).status).toBe(202);
    expect(mocks.startOpinionPrep).toHaveBeenCalledTimes(2);
    expect(mocks.startOpinionPrep.mock.calls[0][0]).toEqual({ articleId: "a1", actorId: staffUser.id, scheduledAt: undefined });
    expect(mocks.startOpinionPrep.mock.calls[1][0]).toEqual({ articleId: "a1", actorId: BOT_PRINCIPAL.userId, scheduledAt: undefined });
    // ولا يوجد مسار تجهيز آخر في الوحدة: الوحدة تصدّر دالتي التجهيز والحالة فقط.
    expect(Object.keys(prepService).sort()).toEqual(["getOpinionPrepJob", "startOpinionPrep"]);

    mocks.getOpinionPrepJob.mockResolvedValue(job);
    expect((await staff("GET", "/opinion/a1/prepare")).status).toBe(200);
    expect((await bot("GET", "/a1/prepare")).status).toBe(200);
    expect(mocks.getOpinionPrepJob).toHaveBeenCalledTimes(2);
  });
});

describe("bot-desk opinion — schedule / publish / return", () => {
  const scheduled = {
    article: { id: "a1", status: "scheduled", scheduledAt: "2026-10-29T06:00:00.000Z" },
    previous: { status: "draft", scheduledAt: null, reviewStatus: "pending_review" },
    scheduledAt: "2026-10-29T06:00:00.000Z",
    warnings: [],
  };

  it("schedule: empty body = writer's fixed slot; same service as the app", async () => {
    mocks.scheduleOpinionFromDesk.mockResolvedValue(scheduled);
    const res = await bot("POST", "/a1/schedule", {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ article: scheduled.article, scheduledAt: scheduled.scheduledAt, warnings: [] });
    expect(mocks.scheduleOpinionFromDesk).toHaveBeenCalledWith({
      articleId: "a1", actorId: BOT_PRINCIPAL.userId, request: { mode: "fixed_slot" },
    });
    expect(mocks.logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "opinion_schedule" }));

    await bot("POST", "/a1/schedule", { scheduledAt: "2026-10-29T09:00:00+03:00" });
    expect(mocks.scheduleOpinionFromDesk).toHaveBeenLastCalledWith({
      articleId: "a1", actorId: BOT_PRINCIPAL.userId, request: { scheduledAt: "2026-10-29T09:00:00+03:00" },
    });

    await staff("POST", "/opinion/a1/schedule", { mode: "fixed_slot" });
    expect(mocks.scheduleOpinionFromDesk).toHaveBeenLastCalledWith({
      articleId: "a1", actorId: staffUser.id, request: { mode: "fixed_slot" },
    });
  });

  it("schedule: rejects bad bodies and passes 409 through", async () => {
    expect((await bot("POST", "/a1/schedule", { scheduledAt: "tomorrow" })).status).toBe(400);
    expect((await bot("POST", "/a1/schedule", { scheduledAt: "2026-10-29T09:00:00" })).status).toBe(400);
    mocks.scheduleOpinionFromDesk.mockRejectedValue(new StaffOpinionDeskError(409, "conflict", "لا موعد ثابت"));
    const res = await bot("POST", "/a1/schedule", {});
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ code: "conflict", message: "لا موعد ثابت" });
  });

  it("publish: empty body only, 409 passthrough, audit on success", async () => {
    expect((await bot("POST", "/a1/publish", { force: true })).status).toBe(400);
    mocks.publishOpinionFromDesk.mockRejectedValueOnce(new StaffOpinionDeskError(409, "conflict", "هذا المقال منشور بالفعل"));
    expect((await bot("POST", "/a1/publish", {})).status).toBe(409);
    mocks.publishOpinionFromDesk.mockResolvedValue({
      article: { id: "a1", status: "published", publishedAt: "2026-10-28T06:00:00.000Z" },
      previous: { status: "draft", reviewStatus: "pending_review" },
    });
    expect((await bot("POST", "/a1/publish", {})).status).toBe(200);
    expect(mocks.publishOpinionFromDesk).toHaveBeenLastCalledWith({ articleId: "a1", actorId: BOT_PRINCIPAL.userId });
    expect(mocks.logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "opinion_publish" }));
  });

  it("return: needs a 3..2000 char note", async () => {
    for (const body of [{}, { note: "" }, { note: " ab " }, { note: "x".repeat(2001) }]) {
      expect((await bot("POST", "/a1/return", body)).status).toBe(400);
    }
    mocks.returnOpinionToWriterFromDesk.mockResolvedValue({
      article: { id: "a1", status: "draft", reviewStatus: "needs_changes" },
      previous: { status: "draft", reviewStatus: "pending_review" },
    });
    expect((await bot("POST", "/a1/return", { note: "  عدّل المقدمة  " })).status).toBe(200);
    expect(mocks.returnOpinionToWriterFromDesk).toHaveBeenCalledWith({
      articleId: "a1", actorId: BOT_PRINCIPAL.userId, note: "عدّل المقدمة",
    });
    expect(mocks.logActivity).toHaveBeenCalledWith(expect.objectContaining({
      action: "opinion_return_to_writer",
      metadata: expect.objectContaining({ channel: "bot-desk-api", noteLength: 12 }),
    }));
  });
});
