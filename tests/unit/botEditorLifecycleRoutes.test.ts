import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ nashr: vi.fn(), missing: vi.fn(), del: vi.fn() }));
vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/rbac", () => ({ logActivity: vi.fn() }));
vi.mock("../../server/memoryCache", () => ({ memoryCache: { invalidatePattern: vi.fn(), delete: vi.fn() }, CACHE_TTL: {} }));
vi.mock("../../server/services/botEditorLifecycle", async (original) => {
  const actual = await original<typeof import("../../server/services/botEditorLifecycle")>();
  return { ...actual, runNashrAction: state.nashr };
});
vi.mock("../../server/services/botDraftsService", async (original) => {
  const actual = await original<typeof import("../../server/services/botDraftsService")>();
  return {
    ...actual,
    publishBotDraft: state.missing,
    scheduleBotDraft: state.missing,
    rescheduleBotDraft: state.missing,
    unscheduleBotDraft: state.missing,
    markBotDraftReady: state.missing,
    getBotDraft: vi.fn(),
  };
});
vi.mock("../../server/services/enBotDraftsService", async (original) => {
  const actual = await original<typeof import("../../server/services/enBotDraftsService")>();
  return {
    ...actual,
    publishEnBotDraft: state.missing,
    scheduleEnBotDraft: state.missing,
    rescheduleEnBotDraft: state.missing,
    unscheduleEnBotDraft: state.missing,
    markEnBotDraftReady: state.missing,
    getEnBotDraft: vi.fn(),
  };
});
vi.mock("../../server/services/botEditorWrites", () => ({
  editBotArticle: vi.fn(),
  transitionBotArticle: state.nashr,
  deleteBotArticle: state.del,
  changeBotVisibility: vi.fn(),
}));

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
  return fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const roots = [["ar", "/api/internal/bot-drafts"], ["en", "/api/internal/bot-drafts/en"]] as const;
const widened = [
  ["POST", "/a/publish", "publish"],
  ["POST", "/a/schedule", "schedule"],
  ["PATCH", "/a/schedule", "reschedule"],
  ["DELETE", "/a/schedule", "unschedule"],
  ["PATCH", "/a/ready", "ready"],
  ["POST", "/a/ready", "ready"],
] as const;

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BOT_DRAFTS_API_TOKENS", `nashr-sabq:${nashr},legacy-bot:${other}`);
  vi.stubEnv("BOT_DRAFTS_WRITE_RATE_LIMIT", "1000");
  vi.stubEnv("BOT_DRAFTS_FAILED_RATE_LIMIT", "1000");
  state.nashr.mockResolvedValue({ id: "a", status: "published", actor: "nashr-sabq" });
  state.missing.mockRejectedValue(new BotDraftError(404, "not_found", "المسودة غير موجودة"));
});

describe("nashr lifecycle routes", () => {
  it.each(roots)("sends %s widened actions to the nashr handler", async (language, root) => {
    for (const [method, path, action] of widened) {
      const response = await call(method, root + path, nashr, { updateReason: "تصحيح", expectedUpdatedAt: "2026-11-18T00:00:00.000Z" });
      expect(response.status).toBe(200);
      expect(state.nashr).toHaveBeenCalledWith(language, action, "a", expect.objectContaining({ updateReason: "تصحيح" }));
    }
  });

  it.each(roots)("keeps %s source=bot scope for every other token", async (_language, root) => {
    for (const [method, path] of widened) {
      const legacyBody = path.endsWith("/schedule") && method !== "DELETE" ? { publishAt: "2030-01-01T00:00:00.000Z" } : {};
      const response = await call(method, root + path, other, legacyBody);
      const postReady = method === "POST" && path.endsWith("/ready");
      expect(response.status, `${method} ${path}`).toBe(postReady ? (_language === "ar" ? 403 : 404) : 404);
      if (!postReady) expect(await response.json()).toMatchObject({ code: "not_found" });
    }
    expect(state.nashr).not.toHaveBeenCalled();
  });

  it.each(roots)("adds %s resurface, revision, revert and soft delete for nashr only", async (language, root) => {
    for (const path of ["/a/resurface", "/a/request-revision", "/a/revert-to-draft"]) {
      expect((await call("POST", root + path, nashr, {})).status).toBe(200);
      expect((await call("POST", root + path, other, {})).status).toBe(403);
    }
    expect((await call("POST", `${root}/a/translate-to-english`, nashr, {})).status).toBe(200);
    expect(state.nashr).toHaveBeenCalledWith(language, "translate", "a", expect.anything());
    expect((await call("POST", `${root}/a/translate-to-english`, other, {})).status).toBe(403);
    state.del.mockResolvedValue({ ok: true });
    expect((await call("DELETE", `${root}/a`, nashr, { updateReason: "حذف مسودة", expectedUpdatedAt: "2026-01-01T00:00:00Z" })).status).toBe(200);
    expect(state.del).toHaveBeenCalledWith(language, "a", expect.objectContaining({ updateReason: "حذف مسودة", expectedUpdatedAt: "2026-01-01T00:00:00Z" }));
    const denied = await call("DELETE", `${root}/a`, other, {});
    expect(denied.status).toBe(language === "ar" ? 405 : 403);
  });
});
