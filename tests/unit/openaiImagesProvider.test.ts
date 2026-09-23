import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ construct: vi.fn(), generate: vi.fn() }));
vi.mock("openai", () => ({ default: class { images = { generate: mocks.generate }; constructor(options: unknown) { mocks.construct(options); } } }));
import { areOpenAIImagesConfigured, generateOpenAIEditorialImage, safeImageError } from "../../server/services/openaiImagesProvider";
import { editorialImageRequestSchema, type EditorialImageRequest } from "../../shared/editorialImages";
const input: EditorialImageRequest = { requestId: "1d0c84a5-666b-498e-9079-7bf7a046d661", prompt: "رسم توضيحي لخبر اقتصادي", model: "gpt-image-2.5-flare", size: "1536x864", quality: "medium" };
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jv1kAAAAASUVORK5CYII=";
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("OPENAI_IMAGES_API_KEY", "images-only-test-key"); });
afterEach(() => vi.unstubAllEnvs());

describe("dedicated OpenAI image provider", () => {
  it("never falls back to either general API key", async () => {
    vi.stubEnv("OPENAI_IMAGES_API_KEY", " ");
    vi.stubEnv("OPENAI_API_KEY", "general-key");
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_API_KEY", "integration-key");
    expect(areOpenAIImagesConfigured()).toBe(false);
    await expect(generateOpenAIEditorialImage(input)).rejects.toMatchObject({ code: "not_configured", status: 503 });
    expect(mocks.construct).not.toHaveBeenCalled();
  });
  it("pins credentials and endpoint and makes one image call", async () => {
    vi.stubEnv("OPENAI_BASE_URL", "https://example.invalid");
    vi.stubEnv("OPENAI_ORG_ID", "other-organization");
    vi.stubEnv("OPENAI_PROJECT_ID", "other-project");
    const usage = { input_tokens: 10, output_tokens: 40, total_tokens: 50 };
    mocks.generate.mockResolvedValue({ data: [{ b64_json: png }], usage, _request_id: "req-image" });
    const result = await generateOpenAIEditorialImage(input);
    expect(mocks.construct).toHaveBeenCalledWith({ apiKey: "images-only-test-key", baseURL: "https://api.openai.com/v1", organization: null, project: null, timeout: 150000, maxRetries: 0 });
    expect(mocks.generate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ model: input.model, size: "1536x864", quality: "medium", output_format: "png", n: 1 }));
    expect(result.buffer).toEqual(Buffer.from(png, "base64"));
    expect(result.usage).toEqual(usage);
    expect(result.prompt).toContain(input.prompt);
  });
  it.each([401, 403, 404, 429, 500])("sanitizes provider error %s without retry or fallback", async (status) => {
    mocks.generate.mockRejectedValue({ status, message: "secret-key provider raw response" });
    await expect(generateOpenAIEditorialImage(input)).rejects.not.toThrow("secret-key");
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.construct).toHaveBeenCalledTimes(1);
  });
  it.each([{ data: [] }, { data: [{ url: "http://127.0.0.1/private" }] }, { data: [{ b64_json: "bm90LWFuLWltYWdl" }] }])("rejects missing or invalid inline image bytes", async (response) => {
    mocks.generate.mockResolvedValue(response);
    await expect(generateOpenAIEditorialImage(input)).rejects.toMatchObject({ status: 502 });
  });
  it("classifies moderation and timeouts", () => {
    expect(safeImageError({ code: "moderation_blocked" }).code).toBe("moderation_blocked");
    expect(safeImageError({ name: "APIConnectionTimeoutError" }).status).toBe(504);
  });
  it("rejects arbitrary provider/model/size overrides and oversized prompts", () => {
    for (const patch of [{ apiKey: "injected" }, { baseURL: "https://evil.invalid" }, { model: "gpt-image-2" }, { size: "8192x8192" }, { quality: "max" }, { numImages: 100 }, { prompt: "x".repeat(4001) }]) {
      expect(editorialImageRequestSchema.safeParse({ ...input, ...patch }).success).toBe(false);
    }
  });
});
