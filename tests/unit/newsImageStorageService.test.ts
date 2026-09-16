import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cloudflareImagesService } from "../../server/services/cloudflareImagesService";
import {
  LIVE_NEWS_IMAGE_CACHE_CONTROL,
  NewsImageStorageService,
  buildNewsImageObjectPrefix,
  getR2PutTimeoutMs,
  getUploadBudgetMs,
  isNewsImagePurpose,
  parseNewsImageRolloutPercent,
  shouldRouteNewsImageToR2,
} from "../../server/services/newsImageStorageService";

const R2_ENV_KEYS = [
  "NEWS_IMAGES_R2_ACCOUNT_ID",
  "NEWS_IMAGES_R2_ACCESS_KEY_ID",
  "NEWS_IMAGES_R2_SECRET_ACCESS_KEY",
  "NEWS_IMAGES_R2_BUCKET_NAME",
  "NEWS_IMAGES_R2_PUBLIC_URL",
  "NEWS_IMAGES_R2_ROLLOUT_PERCENT",
] as const;

const originalR2Env = Object.fromEntries(
  R2_ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof R2_ENV_KEYS)[number], string | undefined>;

function restoreR2Environment(): void {
  for (const key of R2_ENV_KEYS) {
    const originalValue = originalR2Env[key];
    if (originalValue === undefined) delete process.env[key];
    else process.env[key] = originalValue;
  }
}

describe("news image storage routing", () => {
  beforeEach(() => {
    restoreR2Environment();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreR2Environment();
  });

  it.each([
    "article",
    "article-album",
    "article-inline",
    "article-infographic-banner",
    "en-article",
    "ur-article",
    "mobile-article-revision",
    "email-article",
    "whatsapp-article",
  ])("classifies %s as editorial news media", (purpose) => {
    expect(isNewsImagePurpose(purpose)).toBe(true);
  });

  it.each(["profile-image", "avatar", "category", "publisher-logo", "advertisement", "articles"])(
    "keeps %s outside the news rollout",
    (purpose) => {
      expect(isNewsImagePurpose(purpose)).toBe(false);
    },
  );

  it("clamps rollout configuration", () => {
    expect(parseNewsImageRolloutPercent(undefined)).toBe(0);
    expect(parseNewsImageRolloutPercent("not-a-number")).toBe(0);
    expect(parseNewsImageRolloutPercent(-10)).toBe(0);
    expect(parseNewsImageRolloutPercent("12.5")).toBe(12.5);
    expect(parseNewsImageRolloutPercent(110)).toBe(100);
  });

  it("keeps stable cohorts and honors hard off/on values", () => {
    expect(shouldRouteNewsImageToR2("reporter-42", 0)).toBe(false);
    expect(shouldRouteNewsImageToR2("reporter-42", 100)).toBe(true);
    expect(shouldRouteNewsImageToR2("reporter-42", 37)).toBe(
      shouldRouteNewsImageToR2("reporter-42", 37),
    );
  });

  it("builds immutable date-partitioned prefixes in UTC", () => {
    expect(buildNewsImageObjectPrefix(new Date("2026-07-13T23:59:00Z"), "image-id")).toBe(
      "news/2026/07/image-id",
    );
  });

  it("uses the approved two-day live cache policy", () => {
    expect(LIVE_NEWS_IMAGE_CACHE_CONTROL).toContain("max-age=172800");
    expect(LIVE_NEWS_IMAGE_CACHE_CONTROL).toContain("s-maxage=172800");
  });

  it("keeps uploads on Cloudflare while the R2 rollout is zero", async () => {
    process.env.NEWS_IMAGES_R2_ROLLOUT_PERCENT = "0";
    const fallback = vi.spyOn(cloudflareImagesService, "uploadToCloudflare").mockResolvedValue({
      success: true,
      imageId: "cf-image",
      deliveryUrl: "https://imagedelivery.net/example/cf-image/public",
    });

    const result = await new NewsImageStorageService().upload({
      buffer: Buffer.from("test-image"),
      filename: "story.jpg",
      mimeType: "image/jpeg",
      purpose: "article-hero",
      rolloutKey: "reporter-42",
    });

    expect(fallback).toHaveBeenCalledOnce();
    expect(result.provider).toBe("cloudflare-images");
    expect(result.deliveryUrl).toContain("imagedelivery.net");
  });

  it("never routes non-editorial images to R2", async () => {
    process.env.NEWS_IMAGES_R2_ROLLOUT_PERCENT = "100";
    const fallback = vi.spyOn(cloudflareImagesService, "uploadToCloudflare").mockResolvedValue({
      success: true,
      deliveryUrl: "https://imagedelivery.net/example/avatar/public",
    });

    const result = await new NewsImageStorageService().upload({
      buffer: Buffer.from("test-avatar"),
      filename: "avatar.jpg",
      mimeType: "image/jpeg",
      purpose: "profile-image",
      rolloutKey: "member-10",
    });

    expect(fallback).toHaveBeenCalledOnce();
    expect(result.provider).toBe("cloudflare-images");
  });

  it("falls back to Cloudflare when an R2 upload fails", async () => {
    process.env.NEWS_IMAGES_R2_ACCOUNT_ID = "account";
    process.env.NEWS_IMAGES_R2_ACCESS_KEY_ID = "access-key";
    process.env.NEWS_IMAGES_R2_SECRET_ACCESS_KEY = "secret-key";
    process.env.NEWS_IMAGES_R2_BUCKET_NAME = "sabq-news-images";
    process.env.NEWS_IMAGES_R2_PUBLIC_URL = "https://media.sabq.org";
    process.env.NEWS_IMAGES_R2_ROLLOUT_PERCENT = "100";

    const service = new NewsImageStorageService();
    vi.spyOn(
      service as unknown as { uploadToR2: () => Promise<never> },
      "uploadToR2",
    ).mockRejectedValue(new Error("simulated R2 outage"));
    const fallback = vi.spyOn(cloudflareImagesService, "uploadToCloudflare").mockResolvedValue({
      success: true,
      deliveryUrl: "https://imagedelivery.net/example/fallback/public",
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await service.upload({
      buffer: Buffer.from("test-image"),
      filename: "story.jpg",
      mimeType: "image/jpeg",
      purpose: "article-hero",
      rolloutKey: "reporter-42",
    });

    expect(fallback).toHaveBeenCalledOnce();
    expect(result.provider).toBe("cloudflare-images");
  });
});

describe("news image upload request budget", () => {
  const BUDGET_KEYS = ["NEWS_IMAGES_UPLOAD_BUDGET_MS", "NEWS_IMAGES_R2_PUT_TIMEOUT_MS"] as const;
  const originalBudgetEnv = Object.fromEntries(
    BUDGET_KEYS.map((key) => [key, process.env[key]]),
  ) as Record<(typeof BUDGET_KEYS)[number], string | undefined>;

  function configureR2(): void {
    process.env.NEWS_IMAGES_R2_ACCOUNT_ID = "account";
    process.env.NEWS_IMAGES_R2_ACCESS_KEY_ID = "access-key";
    process.env.NEWS_IMAGES_R2_SECRET_ACCESS_KEY = "secret-key";
    process.env.NEWS_IMAGES_R2_BUCKET_NAME = "sabq-news-images";
    process.env.NEWS_IMAGES_R2_PUBLIC_URL = "https://media.sabq.org";
    process.env.NEWS_IMAGES_R2_ROLLOUT_PERCENT = "100";
  }

  beforeEach(() => {
    restoreR2Environment();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreR2Environment();
    for (const key of BUDGET_KEYS) {
      const originalValue = originalBudgetEnv[key];
      if (originalValue === undefined) delete process.env[key];
      else process.env[key] = originalValue;
    }
  });

  it("reads deadlines from the environment with safe defaults", () => {
    delete process.env.NEWS_IMAGES_UPLOAD_BUDGET_MS;
    delete process.env.NEWS_IMAGES_R2_PUT_TIMEOUT_MS;
    expect(getUploadBudgetMs()).toBe(20_000);
    expect(getR2PutTimeoutMs()).toBe(10_000);
    process.env.NEWS_IMAGES_UPLOAD_BUDGET_MS = "12000";
    process.env.NEWS_IMAGES_R2_PUT_TIMEOUT_MS = "not-a-number";
    expect(getUploadBudgetMs()).toBe(12_000);
    expect(getR2PutTimeoutMs()).toBe(10_000);
  });

  it("hands the remaining budget to the Cloudflare fallback after an R2 failure", async () => {
    configureR2();
    process.env.NEWS_IMAGES_UPLOAD_BUDGET_MS = "20000";
    const service = new NewsImageStorageService();
    vi.spyOn(
      service as unknown as { uploadToR2: () => Promise<never> },
      "uploadToR2",
    ).mockRejectedValue(new Error("simulated R2 outage"));
    const fallback = vi.spyOn(cloudflareImagesService, "uploadToCloudflare").mockResolvedValue({
      success: true,
      deliveryUrl: "https://imagedelivery.net/example/fallback/public",
    });

    const result = await service.upload({
      buffer: Buffer.from("test-image"),
      filename: "story.jpg",
      mimeType: "image/jpeg",
      purpose: "article-hero",
      rolloutKey: "reporter-42",
    });

    expect(result.provider).toBe("cloudflare-images");
    const options = fallback.mock.calls[0]?.[4] as { timeoutMs?: number } | undefined;
    expect(options?.timeoutMs).toBeGreaterThan(15_000);
    expect(options?.timeoutMs).toBeLessThanOrEqual(20_000);
  });

  it("fails fast instead of chaining a second provider once the budget is spent", async () => {
    configureR2();
    process.env.NEWS_IMAGES_UPLOAD_BUDGET_MS = "1000";
    const service = new NewsImageStorageService();
    vi.spyOn(
      service as unknown as { uploadToR2: () => Promise<never> },
      "uploadToR2",
    ).mockRejectedValue(new Error("simulated R2 timeout"));
    const fallback = vi.spyOn(cloudflareImagesService, "uploadToCloudflare").mockResolvedValue({
      success: true,
      deliveryUrl: "https://imagedelivery.net/example/fallback/public",
    });

    const result = await service.upload({
      buffer: Buffer.from("test-image"),
      filename: "story.jpg",
      mimeType: "image/jpeg",
      purpose: "article-hero",
      rolloutKey: "reporter-42",
    });

    expect(fallback).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toContain("budget exhausted");
  });
});
