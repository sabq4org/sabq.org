import { describe, expect, it } from "vitest";
import { mergeSeoMetadata, seoGenerateSchema } from "../../server/services/seoGenerateRequest";

const longContent = "x".repeat(120);

describe("POST /api/seo/generate request contract", () => {
  it("accepts the English editor body with no mode as a saved article", () => {
    const parsed = seoGenerateSchema.parse({ articleId: "en-1", language: "en" });
    expect(parsed).toEqual({ mode: "saved", articleId: "en-1", language: "en" });
  });

  it("accepts the Urdu editor body with no mode", () => {
    expect(seoGenerateSchema.parse({ articleId: "ur-1", language: "ur" }).mode).toBe("saved");
  });

  it("keeps the Arabic saved body unchanged", () => {
    expect(seoGenerateSchema.parse({ mode: "saved", articleId: "a1" })).toEqual({
      mode: "saved",
      articleId: "a1",
      language: "ar",
    });
  });

  it("accepts a draft body, with or without mode", () => {
    const draftData = { title: "A title long enough", content: longContent };
    expect(seoGenerateSchema.parse({ mode: "draft", draftData, language: "en" }).mode).toBe("draft");
    expect(seoGenerateSchema.parse({ draftData, language: "en" }).mode).toBe("draft");
  });

  it("still rejects a body with neither article nor draft", () => {
    expect(() => seoGenerateSchema.parse({ language: "en" })).toThrow();
    expect(() => seoGenerateSchema.parse({ mode: "saved", articleId: "" })).toThrow();
  });

  it("still validates the draft length rules", () => {
    expect(() =>
      seoGenerateSchema.parse({ mode: "draft", draftData: { title: "short", content: longContent } }),
    ).toThrow();
  });
});

describe("mergeSeoMetadata", () => {
  it("keeps the translation link while replacing SEO bookkeeping", () => {
    const merged = mergeSeoMetadata(
      { sourceArticleId: "ar-9", translatedAt: "t0", status: "draft", provider: "openai" },
      { status: "generated", provider: "anthropic", manualOverride: false },
    );
    expect(merged).toEqual({
      sourceArticleId: "ar-9",
      translatedAt: "t0",
      status: "generated",
      provider: "anthropic",
      manualOverride: false,
    });
  });

  it("handles a missing or malformed existing value", () => {
    expect(mergeSeoMetadata(null, { status: "generated" })).toEqual({ status: "generated" });
    expect(mergeSeoMetadata([1], { status: "generated" })).toEqual({ status: "generated" });
  });
});
