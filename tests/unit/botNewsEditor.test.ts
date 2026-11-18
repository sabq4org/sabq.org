import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  personal: vi.fn(), legacyGet: vi.fn(), legacyEnGet: vi.fn(), read: vi.fn(), list: vi.fn(),
  edit: vi.fn(), transition: vi.fn(), visibility: vi.fn(), extras: vi.fn(), generate: vi.fn(),
  audit: vi.fn(), push: vi.fn(),
}));
vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/rbac", () => ({ logActivity: vi.fn() }));
vi.mock("../../server/memoryCache", () => ({ memoryCache: { invalidatePattern: vi.fn() }, CACHE_TTL: {} }));
vi.mock("../../server/services/botPublisherTokenService", () => ({ authenticatePublisherToken: state.personal }));
vi.mock("../../server/services/botDraftsService", async original => ({
  ...(await original<typeof import("../../server/services/botDraftsService")>()), getBotDraft: state.legacyGet,
}));
vi.mock("../../server/services/enBotDraftsService", async original => ({
  ...(await original<typeof import("../../server/services/enBotDraftsService")>()), getEnBotDraft: state.legacyEnGet,
}));
vi.mock("../../server/services/botEditorReads", () => ({ readBotArticle: state.read, listBotArticles: state.list }));
vi.mock("../../server/services/botEditorWrites", () => ({ editBotArticle: state.edit, transitionBotArticle: state.transition, changeBotVisibility: state.visibility }));
vi.mock("../../server/services/botEditorMedia", () => ({ regenerateEditorExtras: state.extras, generateBotImage: state.generate }));
vi.mock("../../server/services/botEditorOperationsAudit", () => ({ recordBotEditorOperation: state.audit }));
vi.mock("../../server/services/botEditorPush", () => ({ pushBotArticle: state.push, BotEditorPushError: class extends Error {} }));

import arabicRouter from "../../server/routes/botDrafts";
import englishRouter from "../../server/routes/enBotDrafts";
import { BotDraftError } from "../../server/services/botDraftsService";

const nashr = "nashr-token-012345678901234567890123456789";
const other = "legacy-token-0123456789012345678901234567";
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
});
afterEach(() => vi.unstubAllEnvs());

describe("privileged news editor through both mounted routers", () => {
  it.each(roots)("routes %s shared reads to the privileged handler and other identities to the legacy handler", async (language, root) => {
    state.read.mockResolvedValue({ principal: "editor" });
    const legacy = language === "ar" ? state.legacyGet : state.legacyEnGet;
    legacy.mockResolvedValue({ id: "a", status: "draft" });
    expect(await (await call("GET", `${root}/a`, nashr)).json()).toEqual({ principal: "editor" });
    expect(state.read).toHaveBeenCalledWith(language, "a", expect.anything());
    expect((await call("GET", `${root}/a`, other)).status).toBe(200);
    expect(legacy).toHaveBeenCalled();
    expect(state.read).toHaveBeenCalledTimes(1);
  });
  it.each(roots)("restricts %s exclusive paths to the named non-personal principal", async (_language, root) => {
    state.list.mockResolvedValue({ items: [] });
    state.personal.mockResolvedValue({ userId: "nashr-sabq" });
    expect((await call("GET", root, nashr)).status).toBe(200);
    for (const token of [other, "botpub_personal-token"]) {
      const response = await call("GET", root, token);
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: "forbidden_action" });
    }
    expect(state.list).toHaveBeenCalledTimes(1);
  });
  it("shares generation quota across Arabic and English", async () => {
    vi.stubEnv("BOT_DRAFTS_EXTRAS_RATE_LIMIT", "1");
    state.generate.mockResolvedValue({ url: "https://example.test/image" });
    const ar = await call("POST", `${roots[0][1]}/images/generate`, nashr, {});
    const en = await call("POST", `${roots[1][1]}/images/generate`, nashr, {});
    expect(ar.status).toBe(201);
    expect(en.status).toBe(429);
    expect(await en.json()).toMatchObject({ code: "rate_limited" });
    expect(state.generate).toHaveBeenCalledTimes(1);
  });
  it.each(roots)("dispatches %s shared write handlers and maps protected service errors", async (language, root) => {
    state.edit.mockResolvedValue({ ok: true });
    state.transition.mockResolvedValue({ ok: true });
    state.visibility.mockResolvedValue({ ok: true });
    state.extras.mockResolvedValue({ ok: true });
    expect((await call("PATCH", `${root}/a`, nashr, { title: "new" })).status).toBe(200);
    expect(state.edit).toHaveBeenCalledWith(language, "a", { title: "new" });
    for (const action of ["archive", "restore"]) expect((await call("POST", `${root}/a/${action}`, nashr, {})).status).toBe(200);
    expect(state.transition).toHaveBeenCalledWith(language, "a", "archive", {});
    expect((await call("PATCH", `${root}/a/visibility`, nashr, { isFeatured: true })).status).toBe(200);
    expect((await call("POST", `${root}/a/regenerate-extras`, nashr, {})).status).toBe(200);
    state.read.mockRejectedValueOnce(new BotDraftError(409, "locked_by_editor", "locked", { editor: "x" }));
    const response = await call("GET", `${root}/a`);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "locked_by_editor", details: { editor: "x" } });
  });

});
