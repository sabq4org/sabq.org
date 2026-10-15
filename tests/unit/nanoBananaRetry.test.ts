import { describe, it, expect, vi, beforeEach } from "vitest";

// نفاد رصيد Gemini (2026-09-25): رسالة «quota/billing» كانت تُعاد محاولتها 5 مرات
// (قرابة دقيقة ونصف) قبل أن يصل المحرر ردّ الفشل.
const generateContent = vi.fn();

vi.mock("../../server/utils/googleGenAi", () => ({
  createGoogleGenAI: () => ({ models: { generateContent } }),
}));
vi.mock("../../server/objectStorage", () => ({ ObjectStorageService: class {} }));
vi.mock("../../server/services/newsImageStorageService", () => ({ newsImageStorageService: {} }));

const { generateImage } = await import("../../server/services/nanoBananaService");

describe("nanoBanana generateImage retries", () => {
  beforeEach(() => {
    generateContent.mockReset();
  });

  it("fails fast on a depleted balance instead of retrying", async () => {
    generateContent.mockImplementation(async () => {
      throw Object.assign(new Error("429 RESOURCE_EXHAUSTED: Your prepayment credits are depleted. Manage your project and billing."), { status: 429 });
    });
    const result = await generateImage({ prompt: "x", model: "gemini-3-pro-image-preview" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("credits are depleted");
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("does not retry a non-rate-limit error", async () => {
    generateContent.mockImplementation(async () => {
      throw new Error("Internal error");
    });
    const result = await generateImage({ prompt: "x", model: "gemini-3-pro-image-preview" });
    expect(result.success).toBe(false);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});
