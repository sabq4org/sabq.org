import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  personal: vi.fn(), read: vi.fn(), list: vi.fn(), edit: vi.fn(), transition: vi.fn(), del: vi.fn(), visibility: vi.fn(),
  extras: vi.fn(), generate: vi.fn(), edit_image: vi.fn(), delete_media: vi.fn(), audit: vi.fn(), push: vi.fn(),
  gpt: vi.fn(), gptGet: vi.fn(), titles: vi.fn(), proof: vi.fn(), compare: vi.fn(), nashr: vi.fn(), legacyGet: vi.fn(), legacyPatch: vi.fn(),
}));
vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/rbac", () => ({ logActivity: vi.fn() }));
vi.mock("../../server/memoryCache", () => ({ memoryCache: { invalidatePattern: vi.fn(), delete: vi.fn() }, CACHE_TTL: {} }));
vi.mock("../../server/services/botPublisherTokenService", () => ({ authenticatePublisherToken: state.personal }));
vi.mock("../../server/services/botDraftsService", async original => ({
  ...(await original<typeof import("../../server/services/botDraftsService")>()), getBotDraft: state.legacyGet, updateBotDraft: state.legacyPatch,
}));
vi.mock("../../server/services/botEditorReads", () => ({ readBotArticle: state.read, listBotArticles: state.list }));
vi.mock("../../server/services/botEditorWrites", () => ({
  editBotArticle: state.edit, transitionBotArticle: state.transition, deleteBotArticle: state.del, changeBotVisibility: state.visibility,
}));
vi.mock("../../server/services/botEditorMedia", () => ({
  regenerateEditorExtras: state.extras, generateBotImage: state.generate, editBotImage: state.edit_image, deleteBotMedia: state.delete_media,
}));
vi.mock("../../server/services/botEditorGptImages", () => ({ startBotGptImage: state.gpt, getBotGptImage: state.gptGet }));
vi.mock("../../server/services/botEditorAi", () => ({ suggestBotTitles: state.titles, proofreadBot: state.proof, compareBotHeadlines: state.compare }));
vi.mock("../../server/services/botEditorOperationsAudit", () => ({ recordBotEditorOperation: state.audit }));
vi.mock("../../server/services/botEditorPush", () => ({ pushBotArticle: state.push, BotEditorPushError: class extends Error {} }));
vi.mock("../../server/services/botEditorLifecycle", async original => ({
  ...(await original<typeof import("../../server/services/botEditorLifecycle")>()), runNashrAction: state.nashr,
}));

import arabicRouter from "../../server/routes/botDrafts";
import englishRouter from "../../server/routes/enBotDrafts";

const nashr = "nashr-token-012345678901234567890123456789";
const other = "legacy-token-0123456789012345678901234567";
const PROTECTED = "d05bc8d5-dc9e-40d1-a07d-27dbe3ebd33a";
const app = express();
app.use(express.json());
app.use(englishRouter);
app.use(arabicRouter);
const server = createServer(app);
let base = "";
function call(method: string, path: string, token = nashr, body?: unknown) {
  return fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
}
const roots = [["ar", "/api/internal/bot-drafts"], ["en", "/api/internal/bot-drafts/en"]] as const;
beforeAll(async () => {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BOT_DRAFTS_API_TOKENS", `nashr-sabq:${nashr},legacy-bot:${other}`);
  vi.stubEnv("BOT_DRAFTS_WRITE_RATE_LIMIT", "1000");
  vi.stubEnv("BOT_DRAFTS_FAILED_RATE_LIMIT", "1000");
  vi.stubEnv("BOT_DRAFTS_EXTRAS_RATE_LIMIT", "1000");
  state.audit.mockResolvedValue(undefined);
  for (const fn of [state.edit, state.transition, state.del, state.visibility, state.extras, state.nashr, state.read, state.push]) fn.mockResolvedValue({ ok: true });
});
afterEach(() => vi.unstubAllEnvs());

describe("requireEditorCap: kill switch", () => {
  it.each(roots)("%s: a disabled capability answers 403 capability_disabled and does not reach the service", async (_l, root) => {
    vi.stubEnv("BOT_EDITOR_DISABLED_CAPS", "article.delete,image.generate_gpt,article.publish");
    const del = await call("DELETE", `${root}/a`, nashr, { updateReason: "سبب", expectedUpdatedAt: "2026-01-01T00:00:00Z" });
    expect(del.status).toBe(403);
    expect(await del.json()).toMatchObject({ code: "capability_disabled", details: { capability: "article.delete" } });
    const gpt = await call("POST", `${root}/images/generate-gpt`, nashr, { prompt: "صورة تجريبية للخبر", model: "gpt-image-2.5-flare" });
    expect(gpt.status).toBe(403);
    expect(await call("POST", `${root}/a/publish`, nashr, { updateReason: "x", expectedUpdatedAt: "2026-01-01T00:00:00Z" })).toHaveProperty("status", 403);
    expect(state.del).not.toHaveBeenCalled();
    expect(state.gpt).not.toHaveBeenCalled();
    expect(state.nashr).not.toHaveBeenCalled();
    // قدرة أخرى غير معطّلة تعمل
    expect((await call("PATCH", `${root}/a`, nashr, { title: "عنوان جديد" })).status).toBe(200);
  });
  it.each(roots)("%s: star disables every nashr route, and legacy token behaviour is unchanged", async (_l, root) => {
    vi.stubEnv("BOT_EDITOR_DISABLED_CAPS", "*");
    for (const [method, path] of [["GET", "/a"], ["PATCH", "/a"], ["POST", "/a/archive"], ["PATCH", "/a/visibility"], ["POST", "/ai/titles"], ["POST", "/images/generate"]] as const) {
      const response = await call(method, root + path, nashr, method === "GET" ? undefined : {});
      expect(response.status, `${method} ${path}`).toBe(403);
      expect(await response.json()).toMatchObject({ code: "capability_disabled" });
    }
    expect(state.edit).not.toHaveBeenCalled();
    // التوكن الآخر: المسار المخصّص 403 forbidden_action لا capability_disabled
    const exclusive = await call("POST", `${root}/ai/titles`, other, {});
    expect(exclusive.status).toBe(403);
    expect(await exclusive.json()).toMatchObject({ code: "forbidden_action" });
  });
  it("re-enables when the variable is cleared (no restart)", async () => {
    vi.stubEnv("BOT_EDITOR_DISABLED_CAPS", "article.edit");
    expect((await call("PATCH", `${roots[0][1]}/a`, nashr, { title: "عنوان" })).status).toBe(403);
    vi.stubEnv("BOT_EDITOR_DISABLED_CAPS", "");
    expect((await call("PATCH", `${roots[0][1]}/a`, nashr, { title: "عنوان" })).status).toBe(200);
  });
});

describe("protected articles: 423 on writes, reads allowed", () => {
  const writes: Array<[string, string, unknown]> = [
    ["PATCH", `/${PROTECTED}`, { title: "تعديل" }],
    ["POST", `/${PROTECTED}/archive`, {}],
    ["POST", `/${PROTECTED}/restore`, {}],
    ["POST", `/${PROTECTED}/unpublish`, {}],
    ["DELETE", `/${PROTECTED}`, { updateReason: "سبب", expectedUpdatedAt: "2026-01-01T00:00:00Z" }],
    ["PATCH", `/${PROTECTED}/visibility`, { isFeatured: true }],
    ["POST", `/${PROTECTED}/push`, {}],
    ["POST", `/${PROTECTED}/regenerate-extras`, {}],
    ["POST", `/${PROTECTED}/publish`, {}],
    ["POST", `/${PROTECTED}/schedule`, { publishAt: "2030-01-01T09:00:00+03:00" }],
    ["POST", `/${PROTECTED}/ready`, {}],
    ["POST", `/${PROTECTED}/request-revision`, {}],
  ];
  it.each(roots)("%s: every write returns 423 protected_article for nashr and for another bot token", async (_l, root) => {
    for (const token of [nashr, other]) {
      for (const [method, path, body] of writes) {
        const response = await call(method, root + path, token, body);
        expect(response.status, `${token === nashr ? "nashr" : "other"} ${method} ${path}`).toBe(423);
        expect(await response.json()).toMatchObject({ code: "protected_article" });
      }
    }
    expect(state.edit).not.toHaveBeenCalled();
    expect(state.transition).not.toHaveBeenCalled();
    expect(state.del).not.toHaveBeenCalled();
    expect(state.visibility).not.toHaveBeenCalled();
    expect(state.push).not.toHaveBeenCalled();
    expect(state.nashr).not.toHaveBeenCalled();
    expect(state.legacyPatch).not.toHaveBeenCalled();
    expect(state.audit).toHaveBeenCalledWith(expect.objectContaining({ operation: "protected_write_blocked", outcome: "failed", metadata: expect.objectContaining({ articleId: PROTECTED }) }));
  });
  it("also blocks personal botpub principals", async () => {
    state.personal.mockResolvedValue({ userId: "u1", capabilities: ["edit"], tokenId: "t", email: "e@x", name: "n", expiresAt: new Date(Date.now() + 1e6) });
    const response = await call("PATCH", `${roots[0][1]}/${PROTECTED}`, "botpub_personal-token-0123456789", { title: "x" });
    expect(response.status).toBe(423);
  });
  it.each(roots)("%s: reads of a protected article still work", async (_l, root) => {
    state.read.mockResolvedValue({ id: PROTECTED, title: "للقراءة" });
    const response = await call("GET", `${root}/${PROTECTED}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: PROTECTED });
  });
  it("does not leak the guard to unauthenticated callers (401 first)", async () => {
    const response = await call("PATCH", `${roots[0][1]}/${PROTECTED}`, "bad-token-0123456789012345678901234567890", { title: "x" });
    expect(response.status).toBe(401);
  });
  it("accepts extra protected ids from the environment", async () => {
    vi.stubEnv("BOT_EDITOR_PROTECTED_ARTICLE_IDS", "extra-protected-001");
    expect((await call("PATCH", `${roots[0][1]}/extra-protected-001`, nashr, { title: "x" })).status).toBe(423);
    expect((await call("PATCH", `${roots[0][1]}/not-protected-001`, nashr, { title: "عنوان" })).status).toBe(200);
  });
});

describe("new editor routes are exclusive to nashr-sabq and dispatch to their services", () => {
  const cases: Array<[string, string, string, ReturnType<typeof vi.fn>, number, unknown]> = [
    ["POST", "/images/generate", "generate", state.generate, 201, { prompt: "صورة واقعية", intent: "realistic", model: "recraft-v3", styleSlug: "realistic" }],
    ["POST", "/images/edit", "edit_image", state.edit_image, 201, { sourceImageUrl: "https://media.sabq.org/a.png", prompt: "أزل الخلفية" }],
    ["POST", "/images/generate-gpt", "gpt", state.gpt, 202, { prompt: "رسم توضيحي للاقتصاد", model: "gpt-image-2.5-flare" }],
    ["POST", "/ai/titles", "titles", state.titles, 200, { articleId: "a" }],
    ["POST", "/ai/proofread", "proof", state.proof, 200, { title: "عنوان للتدقيق" }],
    ["POST", "/ai/compare-headlines", "compare", state.compare, 200, { articleId: "a" }],
  ];
  it.each(roots)("%s: dispatches and rejects other tokens with 403", async (language, root) => {
    for (const [method, path, , fn, status, body] of cases) {
      fn.mockResolvedValue({ ok: true });
      const ok = await call(method, root + path, nashr, body);
      expect(ok.status, path).toBe(status);
      expect(fn, path).toHaveBeenCalledWith(...(path === "/images/generate-gpt" || path === "/images/generate" || path === "/images/edit" || path.startsWith("/ai/") ? [language, body] : [body]));
      const denied = await call(method, root + path, other, body);
      expect(denied.status, `${path} other`).toBe(403);
      expect(await denied.json()).toMatchObject({ code: "forbidden_action" });
    }
  });
  it.each(roots)("%s: GPT polling and media delete", async (_l, root) => {
    state.gptGet.mockResolvedValue({ jobId: "j", status: "processing" });
    state.delete_media.mockResolvedValue({ deleted: true });
    const poll = await call("GET", `${root}/images/generate-gpt/3b9b3b5e-0000-4000-8000-000000000001`);
    expect(poll.status).toBe(200);
    expect(state.gptGet).toHaveBeenCalledWith("3b9b3b5e-0000-4000-8000-000000000001");
    expect((await call("GET", `${root}/images/generate-gpt/3b9b3b5e-0000-4000-8000-000000000001`, other)).status).toBe(403);
    expect((await call("DELETE", `${root}/media/m1`, nashr, { updateReason: "صورة مكررة" })).status).toBe(200);
    expect(state.delete_media).toHaveBeenCalledWith("m1", { updateReason: "صورة مكررة" });
    expect((await call("DELETE", `${root}/media/m1`, other, { updateReason: "x" })).status).toBe(403);
  });
  it.each(roots)("%s: DELETE of an article goes through deleteBotArticle only (and reads query values)", async (language, root) => {
    expect((await call("DELETE", `${root}/a?updateReason=سبب&expectedUpdatedAt=2026-01-01T00:00:00Z`)).status).toBe(200);
    expect(state.del).toHaveBeenCalledWith(language, "a", { updateReason: "سبب", expectedUpdatedAt: "2026-01-01T00:00:00Z" });
    expect(state.transition).not.toHaveBeenCalled();
  });
  it("maps service errors (daily cap, not configured) to their status and code", async () => {
    const { BotDraftError } = await import("../../server/services/botDraftsService");
    state.gpt.mockRejectedValueOnce(new BotDraftError(429, "daily_cap_reached", "cap", { cap: 20 }));
    const capped = await call("POST", `${roots[0][1]}/images/generate-gpt`, nashr, {});
    expect(capped.status).toBe(429);
    expect(await capped.json()).toMatchObject({ code: "daily_cap_reached", details: { cap: 20 } });
    state.gpt.mockRejectedValueOnce(new BotDraftError(503, "not_configured", "no key"));
    expect((await call("POST", `${roots[0][1]}/images/generate-gpt`, nashr, {})).status).toBe(503);
  });
});
