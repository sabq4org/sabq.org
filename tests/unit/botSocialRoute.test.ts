import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  suggest: vi.fn(),
  preview: vi.fn(),
  publish: vi.fn(),
  schedule: vi.fn(),
  cancel: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  resolve: vi.fn(),
}));

const storage = vi.hoisted(() => ({
  upload: vi.fn(),
  isR2Configured: vi.fn(() => true),
}));

vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/services/newsImageStorageService", () => ({
  newsImageStorageService: {
    upload: (...args: unknown[]) => storage.upload(...args),
    isR2Configured: () => storage.isR2Configured(),
  },
  isNewsImageR2DeliveryUrl: (url: unknown) => typeof url === "string" && url.startsWith("https://media.sabq.org/"),
}));
vi.mock("../../server/services/socialPublishing/botSocialService", () => ({
  suggestBotSocialPost: (...args: unknown[]) => state.suggest(...args),
  previewBotSocialPost: (...args: unknown[]) => state.preview(...args),
  publishBotSocialPost: (...args: unknown[]) => state.publish(...args),
  scheduleBotSocialPost: (...args: unknown[]) => state.schedule(...args),
  cancelBotSocialPost: (...args: unknown[]) => state.cancel(...args),
  getBotSocialPost: (...args: unknown[]) => state.get(...args),
  listBotSocialPosts: (...args: unknown[]) => state.list(...args),
  resolveBotSocialArticleUrl: (...args: unknown[]) => state.resolve(...args),
}));

import sharp from "sharp";
import router from "../../server/routes/botSocial";
import { isCsrfExemptRequest } from "../../server/csrf";
import { BOT_SOCIAL_IMAGE_FIELD, BOT_SOCIAL_IMAGES_PATH, BOT_SOCIAL_IMAGE_PURPOSE } from "../../shared/botSocial";

const SOCIAL = "social-secret-token-0123456789abcdef-XYZ";
const DRAFTS = "drafts-secret-token-0123456789abcdef-ABCD";
const RATE = "rate-secret-token-0123456789abcdef-QQQQ";

const app = express();
app.use(express.json());
app.use(router);
const server = createServer(app);
let base = "";

function call(method: string, path: string, body?: unknown, token: string | null = SOCIAL) {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as AddressInfo;
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

beforeEach(() => {
  vi.stubEnv("SABQ_BOT_SOCIAL_TOKEN", SOCIAL);
  vi.stubEnv("BOT_SOCIAL_API_TOKENS", "");
  vi.stubEnv("BOT_DRAFTS_API_TOKENS", `nashr-sabq:${DRAFTS}`);
  vi.stubEnv("BOT_SOCIAL_WRITE_RATE_LIMIT", "1000");
  vi.stubEnv("BOT_SOCIAL_PUBLISH_RATE_LIMIT", "1000");
  vi.stubEnv("BOT_SOCIAL_SUGGEST_RATE_LIMIT", "1000");
  for (const fn of Object.values(state)) fn.mockReset();
  storage.upload.mockReset();
  storage.isR2Configured.mockReset();
  storage.isR2Configured.mockReturnValue(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("bot social auth", () => {
  it("is CSRF-exempt like the other internal bot routes", () => {
    expect(isCsrfExemptRequest("POST", "/internal/bot-social/publish", "/api/internal/bot-social/publish")).toBe(true);
    expect(isCsrfExemptRequest("POST", "/internal/bot-social/images", "/api/internal/bot-social/images")).toBe(true);
    expect(isCsrfExemptRequest("GET", "/internal/bot-social/posts", "/api/internal/bot-social/posts")).toBe(true);
  });

  it("returns 503 when the social token is unset, even if the drafts token exists", async () => {
    vi.stubEnv("SABQ_BOT_SOCIAL_TOKEN", "");
    vi.stubEnv("BOT_SOCIAL_API_TOKENS", "");
    const response = await call("POST", "/api/internal/bot-social/publish", { articleId: "art-1", clientReference: "ref-1", text: "نص" }, DRAFTS);
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("not_configured");
    expect(state.publish).not.toHaveBeenCalled();
  });

  it("rejects the drafts bearer and accepts the social bearer", async () => {
    state.publish.mockResolvedValue({ post: { id: "post-1", status: "published" }, idempotentReplay: false });
    const denied = await call("POST", "/api/internal/bot-social/publish", {
      articleId: "art-1",
      clientReference: "ref-1",
      text: "نص التغريدة",
    }, DRAFTS);
    expect(denied.status).toBe(401);
    expect((await denied.json()).code).toBe("unauthorized");

    const allowed = await call("POST", "/api/internal/bot-social/publish", {
      articleId: "art-1",
      clientReference: "ref-1",
      text: "نص التغريدة",
    });
    expect(allowed.status).toBe(200);
    expect(state.publish).toHaveBeenCalledTimes(1);
    expect(state.publish.mock.calls[0][0]).toEqual({ name: "nashr-x" });
  });

  it("returns 400 when neither articleId nor articleUrl is sent", async () => {
    const response = await call("POST", "/api/internal/bot-social/publish", { clientReference: "ref-1", text: "نص" });
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("validation_error");
    expect(state.publish).not.toHaveBeenCalled();
  });

  it("accepts articleUrl and resolves a public link before posting", async () => {
    state.publish.mockResolvedValue({ post: { id: "post-1", status: "published" }, idempotentReplay: false });
    const articleUrl = "https://www.sabq.org/article/jrdic6y/?utm=1#top";
    const response = await call("POST", "/api/internal/bot-social/publish", {
      articleUrl,
      clientReference: "ref-1",
      text: "نص التغريدة",
    });
    expect(response.status).toBe(200);
    expect(state.publish.mock.calls[0][1]).toMatchObject({ articleUrl, clientReference: "ref-1" });
    expect(state.publish.mock.calls[0][1].articleId).toBeUndefined();
  });

  it("returns 400 when clientReference is missing", async () => {
    const response = await call("POST", "/api/internal/bot-social/publish", { articleId: "art-1", text: "نص" });
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("validation_error");
    expect(state.publish).not.toHaveBeenCalled();
  });
});

describe("bot social routes", () => {
  it("returns suggest, preview, schedule, cancel, and status payloads", async () => {
    state.suggest.mockResolvedValue({ articleId: "art-1", post: "نص", hashtags: ["سبق"], suggestedText: "نص\n#سبق" });
    state.preview.mockResolvedValue({ articleId: "art-1", weightedLength: 10, valid: true });
    state.schedule.mockResolvedValue({ post: { id: "post-1", status: "scheduled" }, idempotentReplay: false });
    state.cancel.mockResolvedValue({ post: { id: "post-1", status: "canceled" }, idempotentReplay: false });
    state.get.mockResolvedValue({ post: { id: "post-1", status: "published", externalPostUrl: "https://x.com/sabqorg/status/1" } });
    state.list.mockResolvedValue({ posts: [{ id: "post-1" }] });

    expect((await call("POST", "/api/internal/bot-social/suggest", { articleId: "art-1" })).status).toBe(200);
    expect((await call("POST", "/api/internal/bot-social/preview", { articleId: "art-1", text: "نص" })).status).toBe(200);
    expect((await call("POST", "/api/internal/bot-social/schedule", {
      articleId: "art-1",
      clientReference: "ref-1",
      text: "نص",
      scheduledAt: "2026-09-28T21:00:00+03:00",
    })).status).toBe(200);
    expect((await call("POST", "/api/internal/bot-social/cancel", { clientReference: "ref-1" })).status).toBe(200);
    const status = await call("GET", "/api/internal/bot-social/posts/post-1");
    expect(status.status).toBe(200);
    expect((await status.json()).post.externalPostUrl).toBe("https://x.com/sabqorg/status/1");
    const list = await call("GET", "/api/internal/bot-social/posts");
    expect((await list.json()).posts).toHaveLength(1);
  });

  it("surfaces publish_failed with the post body", async () => {
    const { BotSocialError } = await import("../../server/services/socialPublishing/botSocialLogic");
    state.publish.mockRejectedValue(new BotSocialError(502, "publish_failed", "فشل النشر", { post: { id: "post-1", status: "failed" } }));
    const response = await call("POST", "/api/internal/bot-social/publish", {
      articleId: "art-1",
      clientReference: "ref-1",
      text: "نص",
    });
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.code).toBe("publish_failed");
    expect(body.post.status).toBe("failed");
  });

  it("rate-limits writes per bot and still allows GET", async () => {
    vi.stubEnv("SABQ_BOT_SOCIAL_TOKEN", "");
    vi.stubEnv("BOT_SOCIAL_API_TOKENS", `rate-bot:${RATE}`);
    vi.stubEnv("BOT_SOCIAL_WRITE_RATE_LIMIT", "1");
    state.preview.mockResolvedValue({ ok: true });
    state.list.mockResolvedValue({ posts: [] });
    expect((await call("POST", "/api/internal/bot-social/preview", { articleId: "art-1", text: "نص" }, RATE)).status).toBe(200);
    const limited = await call("POST", "/api/internal/bot-social/preview", { articleId: "art-1", text: "نص" }, RATE);
    expect(limited.status).toBe(429);
    expect((await limited.json()).code).toBe("rate_limited");
    expect((await call("GET", "/api/internal/bot-social/posts", undefined, RATE)).status).toBe(200);
  });

  it("resolves a URL with the same bearer and rejects a missing url", async () => {
    state.resolve.mockResolvedValue({
      articleId: "art-1",
      title: "عنوان",
      status: "published",
      publishedAt: "2026-09-01T00:00:00.000Z",
      linkUrl: "https://sabq.org/article/jrdic6y",
      lang: "ar",
    });
    const url = "https://sabq.org/article/jrdic6y";
    const response = await call("GET", `/api/internal/bot-social/resolve?url=${encodeURIComponent(url)}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ articleId: "art-1", lang: "ar" });
    expect(state.resolve).toHaveBeenCalledWith(url);

    const missing = await call("GET", "/api/internal/bot-social/resolve");
    expect(missing.status).toBe(400);
    expect((await missing.json()).code).toBe("validation_error");

    const denied = await call("GET", `/api/internal/bot-social/resolve?url=${encodeURIComponent(url)}`, undefined, DRAFTS);
    expect(denied.status).toBe(401);
  });
});

describe("original bot social route", () => {
  it("accepts publish and preview without an article and still rejects a bare body", async () => {
    state.publish.mockResolvedValue({
      post: { id: "post-orig", status: "published", externalPostUrl: "https://x.com/sabqorg/status/1" },
      idempotentReplay: false,
    });
    state.preview.mockResolvedValue({ kind: "original", valid: true, linkUrl: null });
    const published = await call("POST", "/api/internal/bot-social/publish", {
      kind: "original",
      clientReference: "ref-orig",
      text: "شرح بلا خبر",
      imageUrls: ["https://media.sabq.org/a.png", "https://media.sabq.org/b.jpg"],
    });
    expect(published.status).toBe(200);
    expect(state.publish.mock.calls[0][1]).toMatchObject({
      kind: "original",
      clientReference: "ref-orig",
      imageUrls: ["https://media.sabq.org/a.png", "https://media.sabq.org/b.jpg"],
    });
    expect(state.publish.mock.calls[0][1].articleId).toBeUndefined();

    const preview = await call("POST", "/api/internal/bot-social/preview", {
      kind: "original",
      text: "معاينة",
      imageUrl: "https://media.sabq.org/a.png",
    });
    expect(preview.status).toBe(200);
    expect(state.preview).toHaveBeenCalledTimes(1);

    const bare = await call("POST", "/api/internal/bot-social/publish", { clientReference: "ref-1", text: "نص" });
    expect(bare.status).toBe(400);
    const mixed = await call("POST", "/api/internal/bot-social/publish", {
      kind: "original",
      articleId: "art-1",
      clientReference: "ref-1",
      text: "نص",
    });
    expect(mixed.status).toBe(400);
  });

  it("uploads a designed PNG with the social token and returns a media.sabq.org URL", async () => {
    storage.upload.mockResolvedValue({
      success: true,
      deliveryUrl: "https://media.sabq.org/news/2026/10/card/w1600.png",
      imageId: "img-1",
      filename: "card.png",
      provider: "r2",
    });
    const png = await sharp({
      create: { width: 2, height: 2, channels: 3, background: { r: 10, g: 20, b: 30 } },
    }).png().toBuffer();
    const form = new FormData();
    form.append(BOT_SOCIAL_IMAGE_FIELD, new Blob([png], { type: "image/png" }), "card.png");
    const response = await fetch(`${base}${BOT_SOCIAL_IMAGES_PATH}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SOCIAL}` },
      body: form,
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      deliveryUrl: "https://media.sabq.org/news/2026/10/card/w1600.png",
      purpose: BOT_SOCIAL_IMAGE_PURPOSE,
    });
    expect(storage.upload).toHaveBeenCalledWith(expect.objectContaining({
      mimeType: "image/png",
      purpose: BOT_SOCIAL_IMAGE_PURPOSE,
      forceR2: true,
    }));

    const denied = await fetch(`${base}${BOT_SOCIAL_IMAGES_PATH}`, { method: "POST" });
    expect(denied.status).toBe(401);
  });
});
