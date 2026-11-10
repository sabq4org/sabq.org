// عقد HTTP لمسار النسخة الإنجليزية. الخدمة مقلَّدة هنا؛ الكتابة على Postgres في
// enBotDrafts.integration.test.ts.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const state = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  regenerate: vi.fn(),
  ready: vi.fn(),
  publish: vi.fn(),
  getOperation: vi.fn(),
  schedule: vi.fn(),
  reschedule: vi.fn(),
  unschedule: vi.fn(),
  archive: vi.fn(),
  restore: vi.fn(),
  visibility: vi.fn(),
  byPublicId: vi.fn(),
  uploadImage: vi.fn(),
  isR2Configured: vi.fn(() => true),
}));

vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/rbac", () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../server/memoryCache", () => ({ memoryCache: { invalidatePattern: vi.fn() }, CACHE_TTL: {} }));
vi.mock("../../server/services/newsImageStorageService", async (original) => {
  const actual = await original<typeof import("../../server/services/newsImageStorageService")>();
  return {
    ...actual,
    newsImageStorageService: {
      upload: (...args: unknown[]) => state.uploadImage(...args),
      isUploadAvailable: () => true,
      isR2Configured: () => state.isR2Configured(),
    },
  };
});
vi.mock("../../server/services/enBotDraftsService", async (original) => ({
  ...(await original<typeof import("../../server/services/enBotDraftsService")>()),
  createEnBotDraft: state.create,
  getEnBotDraft: state.get,
  updateEnBotDraft: state.update,
  regenerateEnBotDraftExtras: state.regenerate,
  markEnBotDraftReady: state.ready,
  publishEnBotDraft: state.publish,
  getEnBotDraftPublishOperation: state.getOperation,
  scheduleEnBotDraft: state.schedule,
  rescheduleEnBotDraft: state.reschedule,
  unscheduleEnBotDraft: state.unschedule,
  archiveEnBotDraft: state.archive,
  restoreEnBotDraft: state.restore,
  updateEnBotDraftVisibility: state.visibility,
  findPublishedEnArticleByPublicId: state.byPublicId,
}));

import router from "../../server/routes/enBotDrafts";
import arabicRouter from "../../server/routes/botDrafts";
import { botDraftCreateSchema } from "../../shared/botDrafts";
import { BOT_DRAFTS_IMAGE_FIELD, BOT_DRAFTS_IMAGE_PURPOSE } from "../../shared/botDrafts";
import { isCsrfExemptRequest } from "../../server/csrf";

const NASHR = "nashr-secret-token-0123456789abcdef-XYZ";
const TOKENS = `nashr-sabq:${NASHR}`;
const app = express();
app.use(express.json());
app.use(router);
app.use(arabicRouter);
const server = createServer(app);
let base = "";

const draft = { id: "en-1", status: "draft", title: "Cabinet decision", publicUrl: null, sourceArticleId: "ar-1" };

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
  return sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 20, g: 40, b: 80 } } }).jpeg().toBuffer();
}

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});
beforeEach(() => {
  vi.clearAllMocks();
  state.isR2Configured.mockReturnValue(true);
  vi.stubEnv("BOT_DRAFTS_API_TOKENS", TOKENS);
  vi.stubEnv("BOT_DRAFTS_WRITE_RATE_LIMIT", "1000");
  vi.stubEnv("BOT_DRAFTS_EXTRAS_RATE_LIMIT", "1000");
  vi.stubEnv("BOT_DRAFTS_FAILED_RATE_LIMIT", "1000");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("English bot drafts HTTP contract", () => {
  it("keeps the English prefix inside the existing internal CSRF exemption", () => {
    expect(isCsrfExemptRequest("POST", "/internal/bot-drafts/en", "/api/internal/bot-drafts/en")).toBe(true);
    expect(isCsrfExemptRequest("POST", "/internal/bot-drafts/en/art/publish", "/api/internal/bot-drafts/en/art/publish")).toBe(true);
  });

  it("rejects sourceArticleId on the Arabic create schema", () => {
    const parsed = botDraftCreateSchema.safeParse({
      title: "عنوان عربي واضح",
      content: "<p>متن عربي أطول من الحد الأدنى للمسودة.</p>",
      sourceArticleId: "ar-1",
    });
    expect(parsed.success).toBe(false);
  });

  it("does not let an Arabic create body carry sourceArticleId", async () => {
    const response = await call("POST", "/api/internal/bot-drafts", {
      title: "عنوان عربي واضح",
      content: "<p>متن عربي أطول من الحد الأدنى للمسودة.</p>",
      sourceArticleId: "ar-1",
    });
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("validation_error");
    expect(state.create).not.toHaveBeenCalled();
  });

  it("creates, reads, updates, regenerates, and marks ready", async () => {
    state.create.mockResolvedValue(draft);
    const created = await call("POST", "/api/internal/bot-drafts/en", {
      title: "Cabinet decision",
      content: "<p>The Saudi cabinet approved a decision for the English edition of Sabq.</p>",
      categorySlug: "saudi",
      sourceArticleId: "ar-1",
    });
    expect(created.status).toBe(201);
    expect(state.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ sourceArticleId: "ar-1", categorySlug: "saudi" }), expect.anything());

    state.get.mockResolvedValue({ ...draft, content: "<p>body</p>", contentFormat: "html" });
    expect((await call("GET", "/api/internal/bot-drafts/en/en-1?includeContent=1")).status).toBe(200);
    expect(state.get).toHaveBeenCalledWith("en-1", expect.anything(), { includeContent: true });
    state.get.mockResolvedValue(null);
    expect((await call("GET", "/api/internal/bot-drafts/en/missing")).status).toBe(404);

    state.update.mockResolvedValue({ ...draft, title: "Updated" });
    expect((await call("PATCH", "/api/internal/bot-drafts/en/en-1", { title: "Updated cabinet decision" })).status).toBe(200);

    state.regenerate.mockResolvedValue({ draft, regenerated: { fields: ["summary"] } });
    expect((await call("POST", "/api/internal/bot-drafts/en/en-1/regenerate-extras", {})).status).toBe(200);

    state.ready.mockResolvedValue({ ...draft, status: "ready_to_publish", updatable: false });
    expect((await call("PATCH", "/api/internal/bot-drafts/en/en-1/ready", {})).status).toBe(200);
  });

  it("publishes with an operation receipt, then schedules, archives, restores, and sets visibility", async () => {
    const operationId = "11111111-1111-4111-8111-111111111111";
    state.publish.mockResolvedValue({ operationId, articleId: "en-1", action: "publish", status: "succeeded", response: { ...draft, status: "published" } });
    const published = await call("POST", "/api/internal/bot-drafts/en/en-1/publish", { operationId });
    expect(published.status).toBe(200);
    expect(state.publish).toHaveBeenCalledWith(expect.anything(), "en-1", expect.anything(), expect.objectContaining({ operationId }));

    state.getOperation.mockResolvedValue({ operationId, articleId: "en-1", action: "publish", status: "succeeded" });
    expect((await call("GET", `/api/internal/bot-drafts/en/en-1/operations/${operationId}`)).status).toBe(200);
    expect((await call("GET", "/api/internal/bot-drafts/en/en-1/operations/not-a-uuid")).status).toBe(400);

    state.schedule.mockResolvedValue({ ...draft, status: "scheduled" });
    expect((await call("POST", "/api/internal/bot-drafts/en/en-1/schedule", { publishAt: "2026-12-01T18:30:00+03:00" })).status).toBe(200);
    state.reschedule.mockResolvedValue({ ...draft, status: "scheduled" });
    expect((await call("PATCH", "/api/internal/bot-drafts/en/en-1/schedule", { publishAt: "2026-12-01T21:00:00+03:00" })).status).toBe(200);
    state.unschedule.mockResolvedValue(draft);
    expect((await call("DELETE", "/api/internal/bot-drafts/en/en-1/schedule", {})).status).toBe(200);

    state.archive.mockResolvedValue({ ...draft, status: "archived" });
    expect((await call("POST", "/api/internal/bot-drafts/en/en-1/archive", { reason: "duplicate" })).status).toBe(200);
    state.restore.mockResolvedValue(draft);
    expect((await call("POST", "/api/internal/bot-drafts/en/en-1/restore", {})).status).toBe(200);
    state.visibility.mockResolvedValue({ ...draft, status: "published", newsType: "breaking" });
    expect((await call("PATCH", "/api/internal/bot-drafts/en/en-1/visibility", { newsType: "breaking" })).status).toBe(200);
  });

  it("looks up a published English article by its public id", async () => {
    state.byPublicId.mockResolvedValue({ id: "en-1", status: "published", publicUrl: "https://sabq.org/en/article/cabinet" });
    const found = await call("GET", "/api/internal/bot-drafts/en/by-public-id/cabinet");
    expect(found.status).toBe(200);
    expect(state.byPublicId).toHaveBeenCalledWith("cabinet", expect.anything());
    state.byPublicId.mockResolvedValue(null);
    expect((await call("GET", "/api/internal/bot-drafts/en/by-public-id/missing")).status).toBe(404);
  });

  it("rejects forbidden fields, a missing token, and an empty body", async () => {
    expect((await call("POST", "/api/internal/bot-drafts/en", { title: "Cabinet decision", content: "<p>Enough English content for the draft body.</p>", status: "published" })).status).toBe(422);
    expect((await call("POST", "/api/internal/bot-drafts/en", { title: "x", content: "short" }, null)).status).toBe(401);
    expect((await call("PATCH", "/api/internal/bot-drafts/en/en-1", {})).status).toBe(400);
    expect(state.create).not.toHaveBeenCalled();
  });

  it("uploads a cover to the English image path with the same R2 contract", async () => {
    state.uploadImage.mockResolvedValue({
      success: true,
      deliveryUrl: "https://media.sabq.org/news/2026/11/en/w1600.webp",
      imageId: "img-en",
      filename: "cover.jpg",
      provider: "r2",
      thumbnailUrl: null,
      width: 1600,
      height: 900,
    });
    const jpeg = await tinyJpeg();
    const form = new FormData();
    form.set(BOT_DRAFTS_IMAGE_FIELD, new Blob([jpeg], { type: "image/jpeg" }), "cover.jpg");
    const response = await fetch(`${base}/api/internal/bot-drafts/en/images`, {
      method: "POST",
      headers: { Authorization: `Bearer ${NASHR}` },
      body: form,
    });
    expect(response.status).toBe(201);
    expect((await response.json()).purpose).toBe(BOT_DRAFTS_IMAGE_PURPOSE);
    expect(state.uploadImage).toHaveBeenCalledWith(expect.objectContaining({
      forceR2: true,
      purpose: BOT_DRAFTS_IMAGE_PURPOSE,
      metadata: { source: "bot-drafts-en", bot: "nashr-sabq" },
    }));
  });
});
