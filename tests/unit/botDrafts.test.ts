import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  invalidate: vi.fn(),
  uploadImage: vi.fn(),
  isUploadAvailable: vi.fn(() => true),
  isR2Configured: vi.fn(() => true),
}));
vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/rbac", () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../server/memoryCache", () => ({ memoryCache: { invalidatePattern: state.invalidate }, CACHE_TTL: {} }));
vi.mock("../../server/services/articleEventsService", () => ({ logArticleEvent: vi.fn().mockResolvedValue([]) }));
vi.mock("../../server/services/newsImageStorageService", async (original) => {
  const actual = await original<typeof import("../../server/services/newsImageStorageService")>();
  return {
    ...actual,
    newsImageStorageService: {
      upload: (...args: unknown[]) => state.uploadImage(...args),
      isUploadAvailable: () => state.isUploadAvailable(),
      isR2Configured: () => state.isR2Configured(),
    },
  };
});
vi.mock("../../server/services/botDraftsService", async (original) => ({
  ...(await original<typeof import("../../server/services/botDraftsService")>()),
  createBotDraft: state.create,
  getBotDraft: state.get,
  updateBotDraft: state.update,
}));

import router from "../../server/routes/botDrafts";
import {
  BotDraftError,
  attributionForBotDraftCreate,
  authenticateBotToken,
  generateArabicSlug,
  isAssignableBotCategoryStatus,
  isMissingBotDraftReporter,
  appendBotDraftBodyImages,
  normalizeDraftContent,
  parseBotDraftTokens,
  reporterIdForBotDraftUpdate,
  toBotDraftResponse,
} from "../../server/services/botDraftsService";
import {
  BOT_DRAFT_BODY_IMAGE_LIMIT,
  BOT_DRAFT_FORBIDDEN_FIELDS,
  BOT_DRAFTS_IMAGE_FIELD,
  BOT_DRAFTS_IMAGE_MAX_BYTES,
  BOT_DRAFTS_IMAGE_PURPOSE,
  BOT_DRAFTS_IMAGES_PATH,
  findForbiddenBotDraftFields,
} from "../../shared/botDrafts";
import { isCsrfExemptRequest } from "../../server/csrf";
import sharp from "sharp";

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

async function tinyJpeg(): Promise<Buffer> {
  return sharp({
    create: { width: 2, height: 2, channels: 3, background: { r: 200, g: 40, b: 40 } },
  })
    .jpeg()
    .toBuffer();
}

function uploadCall(
  file: Blob | undefined,
  filename = "cover.jpg",
  token: string | null = NASHR,
  fieldName = BOT_DRAFTS_IMAGE_FIELD,
) {
  const form = new FormData();
  if (file) form.append(fieldName, file, filename);
  return fetch(`${base}${BOT_DRAFTS_IMAGES_PATH}`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: form,
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
  state.isUploadAvailable.mockReturnValue(true);
  state.isR2Configured.mockReturnValue(true);
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
    expect(isCsrfExemptRequest("POST", "/internal/bot-drafts/images", "/api/internal/bot-drafts/images")).toBe(true);
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
    const bodyHttp = await call("POST", "/api/internal/bot-drafts", {
      title: "عنوان تجريبي",
      content: "x".repeat(30),
      imageUrls: ["http://insecure.example/a.jpg"],
    });
    expect(bodyHttp.status).toBe(400);
    const tooMany = await call("POST", "/api/internal/bot-drafts", {
      title: "عنوان تجريبي",
      content: "x".repeat(30),
      imageUrls: Array.from({ length: BOT_DRAFT_BODY_IMAGE_LIMIT + 1 }, (_, i) => `https://media.sabq.org/news/${i}.webp`),
    });
    expect(tooMany.status).toBe(400);
    expect(state.create).not.toHaveBeenCalled();
  });
  it("accepts body image URLs without treating them as a cover", async () => {
    state.create.mockResolvedValue(draft());
    const imageUrls = ["https://media.sabq.org/news/body.webp"];
    const response = await call("POST", "/api/internal/bot-drafts", {
      title: "عنوان تجريبي",
      content: "نص الخبر التجريبي الذي يتجاوز عشرين حرفاً.",
      imageUrls,
    });
    expect(response.status).toBe(201);
    expect(state.create).toHaveBeenCalledWith(
      { name: "nashr-sabq" },
      expect.objectContaining({ imageUrls }),
      expect.anything(),
    );
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

describe("POST /api/internal/bot-drafts/images", () => {
  it("returns 401 and never reaches storage when the token is missing or wrong", async () => {
    const jpeg = new Blob([await tinyJpeg()], { type: "image/jpeg" });
    for (const token of [null, "wrong-token-that-is-long-enough-0123456789"]) {
      const response = await uploadCall(jpeg, "cover.jpg", token);
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect((await response.json()).code).toBe("unauthorized");
    }
    expect(state.uploadImage).not.toHaveBeenCalled();
  });

  it("rejects a missing file, a non-image, and forged jpeg bytes", async () => {
    const missing = await uploadCall(undefined);
    expect(missing.status).toBe(400);
    expect((await missing.json()).code).toBe("validation_error");

    const pdf = await uploadCall(new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: "application/pdf" }), "doc.pdf");
    expect(pdf.status).toBe(400);
    expect((await pdf.json()).code).toBe("invalid_image");

    const forged = await uploadCall(new Blob([Buffer.from("not-an-image")], { type: "image/jpeg" }), "fake.jpg");
    expect(forged.status).toBe(400);
    expect((await forged.json()).code).toBe("invalid_image");
    expect(state.uploadImage).not.toHaveBeenCalled();
  });

  it("rejects files larger than the editorial 10MB cap", async () => {
    const huge = new Blob([new Uint8Array(BOT_DRAFTS_IMAGE_MAX_BYTES + 1)], { type: "image/jpeg" });
    const response = await uploadCall(huge, "huge.jpg");
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("file_too_large");
    expect(state.uploadImage).not.toHaveBeenCalled();
  });

  it("stores via newsImageStorageService and returns an https deliveryUrl", async () => {
    state.uploadImage.mockResolvedValue({
      success: true,
      deliveryUrl: "https://media.sabq.org/news/2026/09/abc/w1600.webp",
      imageId: "img-42",
      filename: "cover.jpg",
      provider: "r2",
      thumbnailUrl: "https://media.sabq.org/news/2026/09/abc/w480.webp",
      width: 1600,
      height: 900,
    });
    const jpeg = await tinyJpeg();
    const response = await uploadCall(new Blob([jpeg], { type: "image/jpeg" }), "غلاف.jpg");
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      deliveryUrl: "https://media.sabq.org/news/2026/09/abc/w1600.webp",
      imageId: "img-42",
      filename: "cover.jpg",
      provider: "r2",
      thumbnailUrl: "https://media.sabq.org/news/2026/09/abc/w480.webp",
      width: 1600,
      height: 900,
      purpose: BOT_DRAFTS_IMAGE_PURPOSE,
    });
    expect(state.uploadImage).toHaveBeenCalledWith(
      expect.objectContaining({
        mimeType: "image/jpeg",
        purpose: BOT_DRAFTS_IMAGE_PURPOSE,
        forceR2: true,
        metadata: { source: "bot-drafts", bot: "nashr-sabq" },
      }),
    );
    const uploaded = state.uploadImage.mock.calls[0][0] as { buffer: Buffer };
    expect(Buffer.isBuffer(uploaded.buffer)).toBe(true);
    expect(uploaded.buffer.length).toBe(jpeg.length);
  });

  it("accepts a GIF by magic bytes and stores it", async () => {
    state.uploadImage.mockResolvedValue({
      success: true,
      deliveryUrl: "https://media.sabq.org/news/2026/09/gif/original.gif",
      imageId: "gif-1",
      filename: "anim.gif",
      provider: "r2",
    });
    const gif = Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(16, 0)]);
    const response = await uploadCall(new Blob([gif], { type: "image/gif" }), "anim.gif");
    expect(response.status).toBe(201);
    expect(state.uploadImage).toHaveBeenCalledWith(expect.objectContaining({ mimeType: "image/gif", purpose: BOT_DRAFTS_IMAGE_PURPOSE }));
  });

  it("returns 503 when R2 news-image storage is not configured", async () => {
    state.isR2Configured.mockReturnValue(false);
    const response = await uploadCall(new Blob([await tinyJpeg()], { type: "image/jpeg" }));
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("storage_unavailable");
    expect(state.uploadImage).not.toHaveBeenCalled();
  });

  it("rejects a Cloudflare Images URL so bot covers stay on R2 / media.sabq.org", async () => {
    state.uploadImage.mockResolvedValue({
      success: true,
      deliveryUrl: "https://imagedelivery.net/hash/img/public",
      imageId: "cf-1",
      provider: "cloudflare-images",
    });
    const response = await uploadCall(new Blob([await tinyJpeg()], { type: "image/jpeg" }));
    expect(response.status).toBe(502);
    expect((await response.json()).code).toBe("upload_failed");
  });

  it("rejects a non-https delivery URL from storage", async () => {
    state.uploadImage.mockResolvedValue({
      success: true,
      deliveryUrl: "http://insecure.example/cover.jpg",
      imageId: "img-1",
    });
    const response = await uploadCall(new Blob([await tinyJpeg()], { type: "image/jpeg" }));
    expect(response.status).toBe(502);
    expect((await response.json()).code).toBe("upload_failed");
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
  it("accepts a body-image append without resending content", async () => {
    state.update.mockResolvedValue(draft());
    const imageUrls = ["https://media.sabq.org/news/extra.webp"];
    const response = await call("PATCH", "/api/internal/bot-drafts/art-1", { imageUrls });
    expect(response.status).toBe(200);
    expect(state.update).toHaveBeenCalledWith(
      { name: "nashr-sabq" },
      "art-1",
      { imageUrls },
      expect.anything(),
    );
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
    expect(BOT_DRAFT_FORBIDDEN_FIELDS).toEqual(expect.arrayContaining(["authorId", "reporterId"]));
    expect(findForbiddenBotDraftFields({ title: "x", authorId: "u1", reporterId: "u2" })).toEqual(["authorId", "reporterId"]);
  });
  it("attributes create as author+reporter = صحيفة سبق and fills reporter only when null", () => {
    const sabq = "RnP7eDOAl5T5rGpib9_8d";
    expect(attributionForBotDraftCreate(sabq)).toEqual({ authorId: sabq, reporterId: sabq });
    expect(isMissingBotDraftReporter(null)).toBe(true);
    expect(isMissingBotDraftReporter(undefined)).toBe(true);
    expect(isMissingBotDraftReporter("")).toBe(true);
    expect(isMissingBotDraftReporter("editor-choice")).toBe(false);
    expect(reporterIdForBotDraftUpdate(null, sabq)).toBe(sabq);
    expect(reporterIdForBotDraftUpdate(undefined, sabq)).toBe(sabq);
    expect(reporterIdForBotDraftUpdate("", sabq)).toBe(sabq);
    expect(reporterIdForBotDraftUpdate("editor-choice", sabq)).toBeUndefined();
  });
  it("wraps plain text into escaped paragraphs and passes HTML through the sanitizer", () => {
    expect(normalizeDraftContent("فقرة أولى a < b & c\n\nفقرة ثانية\nسطر")).toBe("<p>فقرة أولى a &lt; b &amp; c</p>\n<p>فقرة ثانية<br>سطر</p>");
    expect(normalizeDraftContent("<p>مرحبا</p>")).toBe("<p>مرحبا</p>");
    expect(normalizeDraftContent("<p>نص</p>", "text")).toBe("<p>&lt;p&gt;نص&lt;/p&gt;</p>");
  });
  it("appends imageUrls under the body as editor images, not raw URL text", async () => {
    const { sanitize } = await import("isomorphic-dompurify");
    const first = "https://media.sabq.org/news/body-1.webp";
    const second = "https://media.sabq.org/news/body-2.webp";
    const html = normalizeDraftContent("فقرة أولى من الخبر.\n\nفقرة ثانية تكمل المتن.", undefined, [first, second, first]);
    expect(html.startsWith("<p>فقرة أولى من الخبر.</p>")).toBe(true);
    expect(html.indexOf("</p>")).toBeLessThan(html.indexOf("<img"));
    expect(html.match(/<img\b/g)).toHaveLength(2);
    for (const url of [first, second]) {
      expect(html).toContain(
        `<img src="${url}" alt="صورة" data-align="center" data-width="100%" class="sabq-article-image sabq-image--center" style="width: 100%; float: none; margin: 1.5rem auto; max-width: 100%; height: auto;">`,
      );
    }
    const visible = sanitize(html, {
      ADD_TAGS: ["iframe", "blockquote", "img", "figure", "figcaption"],
      ADD_ATTR: ["src", "class", "data-align", "data-width", "data-caption", "alt", "style"],
    }).replace(/\ssrc="[^"]*"/g, "");
    expect(visible).not.toContain(first);
    expect(visible).not.toContain(second);
  });
  it("keeps article text when HTML contains a closed img and drops handlers", async () => {
    const { sanitizeArticleHtml } = await import("../../server/utils/sanitizeHtml");
    const url = "https://media.sabq.org/news/inline.webp";
    const html = normalizeDraftContent(
      `<p>متن الخبر التجريبي الطويل.</p><img src="${url}" alt="ملعب" onerror="alert(1)">`,
      "html",
    );
    expect(html).toContain("<p>متن الخبر التجريبي الطويل.</p>");
    expect(html).toContain(`src="${url}"`);
    expect(html).toContain('alt="ملعب"');
    expect(html).toContain('class="sabq-article-image sabq-image--center"');
    expect(html).not.toContain("onerror");
    const published = sanitizeArticleHtml(html);
    expect(published).toContain(`src="${url}"`);
    expect(published).toContain('data-width="100%"');
    expect(published).toContain('data-align="center"');
    expect(published).not.toMatch(/onerror/i);
    const stripped = normalizeDraftContent(
      '<p>متن كافٍ للخبر التجريبي هنا.</p><img src="javascript:alert(1)">',
      "html",
    );
    expect(stripped).toContain("متن كافٍ للخبر التجريبي هنا.");
    expect(stripped).not.toContain("javascript:");
    expect(stripped).not.toContain("<img");
  });
  it("drops an unclosed img tag instead of swallowing the following paragraphs", () => {
    const html = normalizeDraftContent(
      '<img src="https://media.sabq.org/news/broken.webp"\n<p>متن الخبر الذي يجب أن يبقى ظاهراً في المعاينة.</p>',
      "html",
    );
    expect(html).toContain("<p>متن الخبر الذي يجب أن يبقى ظاهراً في المعاينة.</p>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("broken.webp");
  });
  it("turns a standalone media.sabq.org paragraph into an image and leaves URLs inside sentences as text", () => {
    const url = "https://media.sabq.org/news/line.webp";
    const fromLine = normalizeDraftContent(`فقرة الخبر التجريبي الأولى.\n\n${url}`);
    expect(fromLine).toContain("<p>فقرة الخبر التجريبي الأولى.</p>");
    expect(fromLine).toContain(`src="${url}"`);
    expect(fromLine).not.toContain(`<p>${url}</p>`);
    const sentence = normalizeDraftContent(`انظر ${url} داخل الخبر التجريبي الطويل.`);
    expect(sentence).not.toContain("<img");
    expect(sentence).toContain(url);
  });
  it("appends new body images without rewriting an editor image already in the draft", () => {
    const existing =
      '<p>محرر</p>\n<img src="https://media.sabq.org/news/old.webp" alt="قديم" data-width="25%" class="sabq-article-image sabq-image--left">';
    const next = appendBotDraftBodyImages(existing, [
      "https://media.sabq.org/news/old.webp",
      "https://media.sabq.org/news/new.webp",
    ]);
    expect(next).toContain('data-width="25%"');
    expect(next).toContain("sabq-image--left");
    expect(next.indexOf("old.webp")).toBeLessThan(next.indexOf("new.webp"));
    expect(next.match(/<img\b/g)).toHaveLength(2);
    expect(appendBotDraftBodyImages(existing, ["https://media.sabq.org/news/old.webp"])).toBe(existing);
  });
  it("builds Arabic slugs like the dashboard does", () => {
    expect(generateArabicSlug("  خبر: عاجل!! من الرياض  ")).toBe("خبر-عاجل-من-الرياض");
    expect(generateArabicSlug("Hello World 2026")).toBe("hello-world-2026");
  });
  it("accepts publishable category statuses visible and historical active", () => {
    expect(isAssignableBotCategoryStatus("visible")).toBe(true);
    expect(isAssignableBotCategoryStatus("active")).toBe(true);
    expect(isAssignableBotCategoryStatus("inactive")).toBe(false);
    expect(isAssignableBotCategoryStatus("deleted")).toBe(false);
    expect(isAssignableBotCategoryStatus(null)).toBe(false);
    expect(isAssignableBotCategoryStatus(undefined)).toBe(false);
    expect(isAssignableBotCategoryStatus("")).toBe(false);
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
      bodyImageUrls: [],
    });
  });
  it("returns body image URLs and keeps the article text out of the response", () => {
    const now = new Date("2026-09-22T10:00:00Z");
    const row = {
      id: "art-9", status: "draft", title: "ت", subtitle: null, slug: "ت", excerpt: null, categoryId: null,
      imageUrl: "https://media.sabq.org/news/cover.webp",
      content: normalizeDraftContent("متن تجريبي طويل بما يكفي.", undefined, ["https://media.sabq.org/news/body.webp"]),
      sourceUrl: null, seo: null, source: "bot", sourceMetadata: { type: "bot" },
      createdAt: now, updatedAt: now,
    } as any;
    const response = toBotDraftResponse(row, null);
    expect(response.bodyImageUrls).toEqual(["https://media.sabq.org/news/body.webp"]);
    expect(response.imageUrl).toBe("https://media.sabq.org/news/cover.webp");
    expect(JSON.stringify(response)).not.toContain("متن تجريبي");
  });
});
