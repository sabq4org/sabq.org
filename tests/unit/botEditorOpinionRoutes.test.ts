import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  board: vi.fn(), item: vi.fn(), draft: vi.fn(), clash: vi.fn(), schedule: vi.fn(), publish: vi.fn(), ret: vi.fn(),
  prepStart: vi.fn(), prepGet: vi.fn(), imgStart: vi.fn(), imgGet: vi.fn(), edit: vi.fn(), audit: vi.fn(), transition: vi.fn(), editPublished: vi.fn(),
}));
vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/rbac", () => ({ logActivity: vi.fn() }));
vi.mock("../../server/memoryCache", () => ({ memoryCache: { invalidatePattern: vi.fn(), delete: vi.fn() }, CACHE_TTL: {} }));
vi.mock("../../server/services/botDraftsService", async original => ({
  ...(await original<typeof import("../../server/services/botDraftsService")>()), resolveBotAuthorId: async () => "bot-author",
}));
vi.mock("../../server/services/staffOpinionDeskService", async original => ({
  ...(await original<typeof import("../../server/services/staffOpinionDeskService")>()),
  getStaffOpinionBoard: m.board, getStaffOpinionItem: m.item, getOpinionDraftContent: m.draft, checkOpinionSlotClashes: m.clash,
  scheduleOpinionFromDesk: m.schedule, publishOpinionFromDesk: m.publish, returnOpinionToWriterFromDesk: m.ret,
}));
vi.mock("../../server/services/staffOpinionPrepareService", () => ({ startOpinionPrep: m.prepStart, getOpinionPrepJob: m.prepGet }));
vi.mock("../../server/services/staffOpinionImageService", () => ({ startOpinionImage: m.imgStart, getOpinionImageJob: m.imgGet }));
vi.mock("../../server/services/staffOpinionContentService", () => ({ editOpinionDraftFromDesk: m.edit }));
vi.mock("../../server/services/botEditorOperationsAudit", () => ({ recordBotEditorOperation: m.audit }));
vi.mock("../../server/services/botEditorWrites", () => ({
  editBotArticle: vi.fn(), editPublishedOpinion: m.editPublished, transitionBotArticle: m.transition, deleteBotArticle: vi.fn(), changeBotVisibility: vi.fn(),
}));

import arabicRouter from "../../server/routes/botDrafts";
import englishRouter from "../../server/routes/enBotDrafts";
import { PROTECTED_ARTICLE_IDS } from "../../shared/botEditorCapabilities";
import { StaffOpinionDeskError } from "../../server/services/staffOpinionDeskService";

const nashr = "nashr-token-012345678901234567890123456789";
const other = "legacy-token-0123456789012345678901234567";
const OP = "/api/internal/bot-drafts/opinion/drafts";
const PROTECTED_OPINION = PROTECTED_ARTICLE_IDS.find(id => id.startsWith("8dab8d72"))!;
const app = express();
app.use(express.json());
app.use(englishRouter);
app.use(arabicRouter);
const server = createServer(app);
let base = "";
const call = (method: string, path: string, token = nashr, body?: unknown) => fetch(base + path, {
  method, headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body),
});
beforeAll(async () => {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BOT_DRAFTS_API_TOKENS", `nashr-sabq:${nashr},legacy-bot:${other}`);
  for (const k of ["WRITE", "FAILED", "EXTRAS"]) vi.stubEnv(`BOT_DRAFTS_${k}_RATE_LIMIT`, "1000");
  m.audit.mockResolvedValue(undefined);
  m.item.mockResolvedValue({ item: { article: { status: "new_draft" }, slotAt: null }, nextSlot: null });
  m.draft.mockResolvedValue({ title: "عنوان", content: "نص" });
  m.prepGet.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

describe("nashr opinion routes → the opinion desk services (actor = bot author)", () => {
  it("board is flattened and ordered pending → scheduled → published", async () => {
    const mk = (id: string, status: string, slotAt: string | null) => ({ slotAt, article: { id, status } });
    m.board.mockResolvedValue({ weekStart: "2026-11-16", slots: [mk("p", "published", "2026-11-17"), mk("s", "scheduled", "2026-11-18")], unslotted: [mk("n", "new_draft", null), { slotAt: null, article: null }] });
    const res = await call("GET", OP);
    expect(res.status).toBe(200);
    expect((await res.json()).items.map((i: any) => i.article.id)).toEqual(["n", "s", "p"]);
  });
  it("detail, edit, schedule, publish, return call the same service functions with the bot actor", async () => {
    expect((await call("GET", `${OP}/a1`)).status).toBe(200);
    m.edit.mockResolvedValue({ changed: true, changedFields: ["title"], article: { id: "a1", status: "scheduled", scheduledAt: null } });
    const edit = await call("PATCH", `${OP}/a1`, nashr, { title: "عنوان معدّل للمقال" });
    expect(edit.status).toBe(200);
    expect(m.edit).toHaveBeenCalledWith(expect.objectContaining({ articleId: "a1", actorId: "bot-author", title: "عنوان معدّل للمقال" }));
    m.schedule.mockResolvedValue({ article: { id: "a1", status: "scheduled", scheduledAt: "x" }, previous: {}, scheduledAt: "2026-11-20T09:00:00.000Z", warnings: [] });
    expect((await call("POST", `${OP}/a1/schedule`, nashr, {})).status).toBe(200);
    expect(m.schedule).toHaveBeenCalledWith({ articleId: "a1", actorId: "bot-author", request: { mode: "fixed_slot" } });
    await call("POST", `${OP}/a1/schedule`, nashr, { scheduledAt: "2026-11-21T09:00:00+03:00" });
    expect(m.schedule).toHaveBeenLastCalledWith({ articleId: "a1", actorId: "bot-author", request: { scheduledAt: "2026-11-21T09:00:00+03:00" } });
    m.publish.mockResolvedValue({ article: { id: "a1", status: "published", publishedAt: "x" }, previous: {} });
    expect((await call("POST", `${OP}/a1/publish`, nashr, {})).status).toBe(200);
    expect((await call("POST", `${OP}/a1/publish`, nashr, { extra: 1 })).status).toBe(400);
    m.ret.mockResolvedValue({ article: { id: "a1", status: "draft", reviewStatus: "needs_revision" }, previous: {} });
    expect((await call("POST", `${OP}/a1/return`, nashr, { note: "عدّل المقدمة" })).status).toBe(200);
    expect((await call("POST", `${OP}/a1/return`, nashr, { note: "x" })).status).toBe(400);
    expect(m.audit.mock.calls.map(c => c[0].operation)).toEqual(expect.arrayContaining(["opinion_edit", "opinion_schedule", "opinion_publish", "opinion_return_to_writer"]));
  });
  it("prepare answers 202 and image answers 202 or 200 (image_exists)", async () => {
    m.prepStart.mockResolvedValue({ job: { articleId: "a1" }, created: true });
    const prep = await call("POST", `${OP}/a1/prepare`, nashr, {});
    expect(prep.status).toBe(202);
    expect(m.prepStart).toHaveBeenCalledWith({ articleId: "a1", actorId: "bot-author", scheduledAt: undefined });
    m.imgStart.mockResolvedValueOnce({ job: { status: "running" }, outcome: "started", imageUrl: null });
    expect((await call("POST", `${OP}/a1/image`, nashr, {})).status).toBe(202);
    m.imgStart.mockResolvedValueOnce({ job: null, outcome: "image_exists", imageUrl: "https://media.sabq.org/x.webp" });
    const exists = await call("POST", `${OP}/a1/image`, nashr, {});
    expect(exists.status).toBe(200);
    expect(await exists.json()).toMatchObject({ skipped: "image_exists", imageUrl: "https://media.sabq.org/x.webp" });
    expect((await call("GET", `${OP}/a1/prepare`)).status).toBe(404);
  });
  it("maps desk errors to bot-draft codes", async () => {
    m.publish.mockRejectedValueOnce(new StaffOpinionDeskError(409, "conflict", "هذا المقال منشور بالفعل"));
    const conflict = await call("POST", `${OP}/a1/publish`, nashr, {});
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ code: "draft_changed", message: "هذا المقال منشور بالفعل" });
    m.item.mockRejectedValueOnce(new StaffOpinionDeskError(404, "not_found", "مقال الرأي غير موجود"));
    expect((await call("GET", `${OP}/missing`)).status).toBe(404);
  });
  it("archive, restore and unpublish of an opinion article use the shared transition path", async () => {
    m.transition.mockResolvedValue({ ok: true });
    for (const action of ["archive", "restore", "unpublish"]) {
      expect((await call("POST", `/api/internal/bot-drafts/a1/${action}`, nashr, {})).status).toBe(200);
      expect(m.transition).toHaveBeenLastCalledWith("ar", "a1", action, {});
    }
  });
});

describe("opinion routes: exclusivity, kill switch, protected articles", () => {
  const routes: Array<[string, string, unknown]> = [
    ["GET", "", undefined], ["GET", "/a1", undefined], ["PATCH", "/a1", { title: "عنوان معدّل للمقال" }], ["GET", "/a1/slot-check?scheduledAt=2026-11-20T09:00:00%2B03:00", undefined],
    ["POST", "/a1/prepare", {}], ["GET", "/a1/prepare", undefined], ["POST", "/a1/image", {}], ["GET", "/a1/image", undefined],
    ["POST", "/a1/schedule", {}], ["POST", "/a1/publish", {}], ["POST", "/a1/return", { note: "عدّل المقدمة" }],
  ];
  it("every other token gets 403 forbidden_action", async () => {
    for (const [method, path, body] of routes) {
      const res = await call(method, OP + path, other, body);
      expect(res.status, `${method} ${path}`).toBe(403);
      expect((await res.json()).code).toBe("forbidden_action");
    }
    for (const fn of [m.board, m.edit, m.schedule, m.publish, m.ret, m.prepStart, m.imgStart]) expect(fn).not.toHaveBeenCalled();
  });
  it("each opinion capability can be switched off separately", async () => {
    const cases: Array<[string, string, string, unknown]> = [
      ["opinion.read", "GET", "/a1", undefined], ["opinion.edit", "PATCH", "/a1", { title: "عنوان معدّل للمقال" }],
      ["opinion.lifecycle", "POST", "/a1/publish", {}], ["opinion.lifecycle", "POST", "/a1/prepare", {}], ["opinion.image", "POST", "/a1/image", {}],
    ];
    for (const [cap, method, path, body] of cases) {
      vi.stubEnv("BOT_EDITOR_DISABLED_CAPS", cap);
      const res = await call(method, OP + path, nashr, body);
      expect(res.status, `${cap} ${path}`).toBe(403);
      expect(await res.json()).toMatchObject({ code: "capability_disabled", details: { capability: cap } });
    }
    vi.stubEnv("BOT_EDITOR_DISABLED_CAPS", "opinion.image");
    expect((await call("POST", `${OP}/a1/publish`, nashr, {})).status).not.toBe(403);
    expect(m.edit).not.toHaveBeenCalled();
    expect(m.imgStart).not.toHaveBeenCalled();
  });
  it("writes on a protected opinion article answer 423 and reads still work", async () => {
    for (const [method, path, body] of routes.filter(([mm]) => mm !== "GET")) {
      const res = await call(method, `${OP}/${PROTECTED_OPINION}${path.replace("/a1", "")}`, nashr, body);
      expect(res.status, `${method} ${path}`).toBe(423);
      expect((await res.json()).code).toBe("protected_article");
    }
    const archive = await call("POST", `/api/internal/bot-drafts/${PROTECTED_OPINION}/archive`, nashr, {});
    expect(archive.status).toBe(423);
    expect((await call("GET", `${OP}/${PROTECTED_OPINION}`)).status).toBe(200);
    for (const fn of [m.edit, m.schedule, m.publish, m.ret, m.prepStart, m.imgStart, m.transition]) expect(fn).not.toHaveBeenCalled();
  });
  it("the service also refuses a protected id by itself (defence in depth)", async () => {
    const svc = await import("../../server/services/botEditorOpinion");
    await expect(svc.publishOpinion(PROTECTED_OPINION, {})).rejects.toMatchObject({ httpStatus: 423, code: "protected_article" });
    await expect(svc.editOpinion(PROTECTED_OPINION, { title: "عنوان معدّل للمقال" })).rejects.toMatchObject({ httpStatus: 423 });
  });
  it("the English router has no opinion routes", async () => {
    const res = await call("GET", "/api/internal/bot-drafts/en/opinion/drafts");
    expect([403, 404, 405]).toContain(res.status);
    expect(m.board).not.toHaveBeenCalled();
  });
});

describe("PATCH /opinion/published/:id (published opinion edit)", () => {
  const PUB = "/api/internal/bot-drafts/opinion/published";
  const body = { title: "عنوان معدّل للمقال المنشور", updateReason: "إصلاح", expectedUpdatedAt: "2026-11-20T06:00:00.126Z" };
  it("nashr reaches editPublishedOpinion with the id and raw body", async () => {
    m.editPublished.mockResolvedValue({ id: "a1", status: "published" });
    const res = await call("PATCH", `${PUB}/a1`, nashr, body);
    expect(res.status).toBe(200);
    expect(m.editPublished).toHaveBeenCalledWith("a1", body);
  });
  it("another legacy token gets 403 forbidden_action and the service is not called", async () => {
    const res = await call("PATCH", `${PUB}/a1`, other, body);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "forbidden_action" });
    expect(m.editPublished).not.toHaveBeenCalled();
  });
  it("kill switch opinion.edit_published or * returns 403 capability_disabled before the service", async () => {
    for (const caps of ["opinion.edit_published", "*"]) {
      vi.stubEnv("BOT_EDITOR_DISABLED_CAPS", caps);
      const res = await call("PATCH", `${PUB}/a1`, nashr, body);
      expect(res.status, caps).toBe(403);
      expect(await res.json()).toMatchObject({ code: "capability_disabled", details: { capability: "opinion.edit_published" } });
    }
    expect(m.editPublished).not.toHaveBeenCalled();
  });
  it("the five protected ids answer 423 at the router, before the service", async () => {
    for (const id of PROTECTED_ARTICLE_IDS) {
      const res = await call("PATCH", `${PUB}/${id}`, nashr, body);
      expect(res.status, id.slice(0, 8)).toBe(423);
      expect(await res.json()).toMatchObject({ code: "protected_article" });
    }
    expect(m.editPublished).not.toHaveBeenCalled();
  });
});
