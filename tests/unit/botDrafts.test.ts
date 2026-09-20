import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ create: vi.fn(), get: vi.fn(), update: vi.fn(), invalidate: vi.fn() }));
vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/rbac", () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../server/memoryCache", () => ({ memoryCache: { invalidatePattern: state.invalidate }, CACHE_TTL: {} }));
vi.mock("../../server/services/articleEventsService", () => ({ logArticleEvent: vi.fn().mockResolvedValue([]) }));
vi.mock("../../server/services/botDraftsService", async (original) => ({
  ...(await original<typeof import("../../server/services/botDraftsService")>()),
  createBotDraft: state.create,
  getBotDraft: state.get,
  updateBotDraft: state.update,
}));

import router from "../../server/routes/botDrafts";
import {
  BotDraftError,
  authenticateBotToken,
  generateArabicSlug,
  normalizeDraftContent,
  parseBotDraftTokens,
  toBotDraftResponse,
} from "../../server/services/botDraftsService";
import { BOT_DRAFT_FORBIDDEN_FIELDS, findForbiddenBotDraftFields } from "../../shared/botDrafts";
import { isCsrfExemptRequest } from "../../server/csrf";

const NASHR = "nashr-secret-token-0123456789abcdef-XYZ";
const GROK = "grok-secret-token-0123456789abcdef-QWERTY";
const TOKENS = `nashr-sabq:${NASHR}, grok-bot:${GROK}`;

const app = express();
app.use(express.json());
app.use(router);
const server = createServer(app);
let base = "";

const draft = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "art-1",
  status: "draft",
  updatable: true,
  title: "عنوان تجريبي",
  slug: "عنوان-تجريبي",
  editUrl: "https://sabq.org/dashboard/articles/art-1/edit",
  ...over,
});

function call(method: string, path: string, body?: unknown, token: string | null = NASHR) {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("BOT_DRAFTS_API_TOKENS", TOKENS);
  vi.stubEnv("BOT_DRAFTS_WRITE_RATE_LIMIT", "1000");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("bot token parsing and authentication", () => {
  it("parses name:token entries, ignoring malformed, short and duplicate ones", () => {
    const bots = parseBotDraftTokens(`nashr-sabq:${NASHR},broken-entry,Bad Name:${GROK},short:abc,nashr-sabq:${GROK},grok-bot:${GROK}`);
    expect(bots.map((b) => b.name)).toEqual(["nashr-sabq", "grok-bot"]);
  });
  it("identifies each bot by its own token and rejects everything else", () => {
    expect(authenticateBotToken(`Bearer ${NASHR}`)).toEqual({ name: "nashr-sabq" });
    expect(authenticateBotToken(`bearer ${GROK}`)).toEqual({ name: "grok-bot" });
    expect(authenticateBotToken(`Bearer ${NASHR}x`)).toBeNull();
    expect(authenticateBotToken(NASHR)).toBeNull();
    expect(authenticateBotToken("Bearer short")).toBeNull();
    expect(authenticateBotToken(undefined)).toBeNull();
  });
});

describe("HTTP gate", () => {
  it("returns 503 when no tokens are configured and never reaches the service", async () => {
    vi.stubEnv("BOT_DRAFTS_API_TOKENS", "");
    const response = await call("POST", "/api/internal/bot-drafts", { title: "عنوان", content: "x".repeat(30) });
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("not_configured");
    expect(state.create).not.toHaveBeenCalled();
  });
  it("returns 401 with no-store for a missing or wrong token", async () => {
    for (const token of [null, "wrong-token-that-is-long-enough-0123456789"]) {
      const response = await call("GET", "/api/internal/bot-drafts/art-1", undefined, token);
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("www-authenticate")).toContain("Bearer");
      const body = await response.json();
      expect(body.code).toBe("unauthorized");
      expect(JSON.stringify(body)).not.toContain(NASHR);
    }
    expect(state.get).not.toHaveBeenCalled();
  });
  it("is CSRF-exempt through the existing /api/internal/ prefix", () => {
    expect(isCsrfExemptRequest("POST", "/internal/bot-drafts", "/api/internal/bot-drafts")).toBe(true);
    expect(isCsrfExemptRequest("PATCH", "/internal/bot-drafts/art-1", "/api/internal/bot-drafts/art-1")).toBe(true);
  });
});

describe("POST /api/internal/bot-drafts", () => {
  it("creates a draft with the bot identity and returns 201", async () => {
    state.create.mockResolvedValue(draft());
    const payload = { title: "عنوان تجريبي", content: "نص الخبر التجريبي الذي يتجاوز عشرين حرفاً.", categorySlug: "local", clientReference: "grok-42" };
    const response = await call("POST", "/api/internal/bot-drafts", payload);
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ id: "art-1", status: "draft", updatable: true });
    expect(state.create).toHaveBeenCalledWith({ name: "nashr-sabq" }, payload, expect.objectContaining({ ip: expect.any(String) }));
  });
  it.each(BOT_DRAFT_FORBIDDEN_FIELDS)("rejects forbidden field %s with 422 before validation", async (field) => {
    const response = await call("POST", "/api/internal/bot-drafts", { title: "عنوان تجريبي", content: "x".repeat(30), [field]: "published" });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "forbidden_fields", details: { fields: [field] } });
    expect(state.create).not.toHaveBeenCalled();
  });
  it("rejects unknown keys and invalid values with 400", async () => {
    const missing = await call("POST", "/api/internal/bot-drafts", { title: "عنوان" });
    expect(missing.status).toBe(400);
    expect((await missing.json()).code).toBe("validation_error");
    const unknown = await call("POST", "/api/internal/bot-drafts", { title: "عنوان تجريبي", content: "x".repeat(30), publishNow: true });
    expect(unknown.status).toBe(400);
    const http = await call("POST", "/api/internal/bot-drafts", { title: "عنوان تجريبي", content: "x".repeat(30), imageUrl: "http://insecure.example/a.jpg" });
    expect(http.status).toBe(400);
    expect(state.create).not.toHaveBeenCalled();
  });
  it("maps service errors to their status and code, and hides internal errors", async () => {
    state.create.mockRejectedValueOnce(new BotDraftError(422, "category_not_found", "التصنيف غير موجود", { categorySlug: "nope" }));
    const known = await call("POST", "/api/internal/bot-drafts", { title: "عنوان تجريبي", content: "x".repeat(30), categorySlug: "nope" });
    expect(known.status).toBe(422);
    expect(await known.json()).toMatchObject({ code: "category_not_found", details: { categorySlug: "nope" } });
    state.create.mockRejectedValueOnce(new Error(`db down for token ${NASHR}`));
    const unknown = await call("POST", "/api/internal/bot-drafts", { title: "عنوان تجريبي", content: "x".repeat(30) });
    expect(unknown.status).toBe(500);
    const body = await unknown.text();
    expect(body).not.toContain(NASHR);
    expect(body).not.toContain("db down");
  });
});

describe("GET and PATCH /api/internal/bot-drafts/:id", () => {
  it("returns the draft or 404", async () => {
    state.get.mockResolvedValueOnce(draft({ status: "published", updatable: false }));
    const found = await call("GET", "/api/internal/bot-drafts/art-1");
    expect(found.status).toBe(200);
    expect(await found.json()).toMatchObject({ status: "published", updatable: false });
    state.get.mockResolvedValueOnce(null);
    expect((await call("GET", "/api/internal/bot-drafts/missing")).status).toBe(404);
  });
  it("updates only allowed fields and surfaces 409 when the article is no longer a draft", async () => {
    state.update.mockResolvedValueOnce(draft({ title: "عنوان محدث" }));
    const ok = await call("PATCH", "/api/internal/bot-drafts/art-1", { title: "عنوان محدث" });
    expect(ok.status).toBe(200);
    expect(state.update).toHaveBeenCalledWith({ name: "nashr-sabq" }, "art-1", { title: "عنوان محدث" }, expect.anything());
    state.update.mockRejectedValueOnce(new BotDraftError(409, "not_a_draft", "لم تعد مسودة", { status: "published" }));
    const conflict = await call("PATCH", "/api/internal/bot-drafts/art-1", { excerpt: "مقدمة" });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ code: "not_a_draft", details: { status: "published" } });
  });
  it("rejects an empty patch and any status change attempt", async () => {
    expect((await call("PATCH", "/api/internal/bot-drafts/art-1", {})).status).toBe(400);
    const publish = await call("PATCH", "/api/internal/bot-drafts/art-1", { status: "published" });
    expect(publish.status).toBe(422);
    expect(state.update).not.toHaveBeenCalled();
  });
  it("throttles writes per bot with its own limiter (the global write limiter skips /api/internal)", async () => {
    vi.stubEnv("BOT_DRAFTS_WRITE_RATE_LIMIT", "1");
    state.update.mockResolvedValue(draft());
    // مفتاح المحدد هو اسم البوت؛ نستخدم grok-bot حتى لا يتأثر بعدّاد nashr-sabq من الاختبارات السابقة
    expect((await call("PATCH", "/api/internal/bot-drafts/art-1", { title: "عنوان أول" }, GROK)).status).toBe(200);
    const limited = await call("PATCH", "/api/internal/bot-drafts/art-1", { title: "عنوان ثانٍ" }, GROK);
    expect(limited.status).toBe(429);
    expect((await limited.json()).code).toBe("rate_limited");
    expect((await call("GET", "/api/internal/bot-drafts/art-1", undefined, GROK)).status).not.toBe(429);
  });
  it("refuses publish/schedule sub-actions and other verbs", async () => {
    for (const action of ["publish", "schedule", "submit-review"]) {
      const response = await call("POST", `/api/internal/bot-drafts/art-1/${action}`, {});
      expect(response.status).toBe(403);
      expect((await response.json()).code).toBe("forbidden_action");
    }
    const del = await call("DELETE", "/api/internal/bot-drafts/art-1");
    expect(del.status).toBe(405);
    expect(del.headers.get("allow")).toBe("GET, PATCH");
    const put = await call("PUT", "/api/internal/bot-drafts/art-1", { title: "x" });
    expect(put.status).toBe(405);
  });
});

describe("pure helpers", () => {
  it("lists forbidden fields present in a body", () => {
    expect(findForbiddenBotDraftFields({ title: "x", status: "draft", scheduledAt: "now" })).toEqual(["status", "scheduledAt"]);
    expect(findForbiddenBotDraftFields(null)).toEqual([]);
    expect(findForbiddenBotDraftFields([1])).toEqual([]);
  });
  it("wraps plain text into escaped paragraphs and passes HTML through the sanitizer", () => {
    expect(normalizeDraftContent("فقرة أولى a < b & c\n\nفقرة ثانية\nسطر")).toBe("<p>فقرة أولى a &lt; b &amp; c</p>\n<p>فقرة ثانية<br>سطر</p>");
    expect(normalizeDraftContent("<p>مرحبا</p>")).toBe("<p>مرحبا</p>");
    expect(normalizeDraftContent("<p>نص</p>", "text")).toBe("<p>&lt;p&gt;نص&lt;/p&gt;</p>");
  });
  it("builds Arabic slugs like the dashboard does", () => {
    expect(generateArabicSlug("  خبر: عاجل!! من الرياض  ")).toBe("خبر-عاجل-من-الرياض");
    expect(generateArabicSlug("Hello World 2026")).toBe("hello-world-2026");
  });
  it("marks non-draft rows as not updatable and exposes the dashboard edit url", () => {
    vi.stubEnv("PUBLIC_SITE_URL", "https://sabq.org/");
    const now = new Date("2026-09-20T10:00:00Z");
    const row = {
      id: "art-9", status: "published", title: "ت", subtitle: null, slug: "ت", excerpt: null, categoryId: null, imageUrl: null,
      sourceUrl: null, seo: { keywords: ["أ"] }, source: "bot", sourceMetadata: { type: "bot", bot: "grok-bot", clientReference: "g-1" },
      createdAt: now, updatedAt: now,
    } as any;
    expect(toBotDraftResponse(row, "local")).toMatchObject({
      status: "published", updatable: false, bot: "grok-bot", clientReference: "g-1", keywords: ["أ"], categorySlug: "local",
      editUrl: "https://sabq.org/dashboard/articles/art-9/edit", createdAt: now.toISOString(),
    });
  });
});
