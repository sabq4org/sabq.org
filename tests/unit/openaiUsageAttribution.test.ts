import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  calls: [] as Array<{ client: unknown; feature: string; body: any; options?: { deduplicate?: boolean } }>,
}));

vi.mock("../../server/ai/gateway/trackedOpenAI", () => ({
  trackedOpenAICompletion: vi.fn(async (client: unknown, feature: string, body: any, options?: { deduplicate?: boolean }) => {
    state.calls.push({ client, feature, body, options });
    const contentByFeature: Record<string, string> = {
      "editor-headlines": JSON.stringify({ titles: ["عنوان أول", "عنوان ثان", "عنوان ثالث"] }),
      "editor-seo-analysis": JSON.stringify({
        seoTitle: "عنوان محسّن لمحركات البحث",
        metaDescription: "وصف محسّن للمقال",
        keywords: ["سبق"],
      }),
      "editor-social-post": JSON.stringify({ post: "منشور", hashtags: ["سبق"], characterCount: 5 }),
      "seo-generator": JSON.stringify({
        metaTitle: "A sufficiently long SEO title for testing",
        metaDescription: "A sufficiently long SEO description for testing the tracked OpenAI path.",
        keywords: ["sabq", "news", "test"],
        socialTitle: "Social title",
        socialDescription: "Social description",
        imageAltText: "News image",
      }),
    };
    return {
      choices: [{ message: { content: contentByFeature[feature] || "ملخص محفوظ" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };
  }),
}));

describe("legacy OpenAI usage attribution", () => {
  beforeEach(() => {
    state.calls.length = 0;
    process.env.OPENAI_API_KEY = "unit-test-key";
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "unit-test-key";
  });

  it("attributes article summary and preserves its model, payload, and in-flight dedup", async () => {
    const { summarizeArticle } = await import("../../server/openai");
    const input = "خبر تجريبي طويل بما يكفي للاختبار";
    const result = await summarizeArticle(input);
    const call = state.calls.find((entry) => entry.feature === "editor-summarize");

    expect(result).toBe("ملخص محفوظ");
    expect(call?.body.model).toBe("gpt-5.1");
    expect(call?.body.messages[1].content).toContain(input);
    expect(call?.body.max_completion_tokens).toBe(1024);
    expect(call?.options).toEqual({ deduplicate: true });
  });

  it("attributes headlines without enabling deduplication for creative generation", async () => {
    const { generateTitle } = await import("../../server/openai");
    const result = await generateTitle("خبر عن فعالية تقنية مهمة", "ar");
    const call = state.calls.find((entry) => entry.feature === "editor-headlines");

    expect(result).toEqual(["عنوان أول", "عنوان ثان", "عنوان ثالث"]);
    expect(call?.body.model).toBe("gpt-5.1");
    expect(call?.body.temperature).toBe(0.8);
    expect(call?.body.response_format).toEqual({ type: "json_object" });
    expect(call?.options).toBeUndefined();
  });

  it("attributes SEO analysis with deduplication while preserving its request", async () => {
    const { analyzeSEO } = await import("../../server/openai");
    await analyzeSEO("عنوان الخبر", "محتوى الخبر للاختبار", "مقتطف");
    const call = state.calls.find((entry) => entry.feature === "editor-seo-analysis");

    expect(call?.body.model).toBe("gpt-5.1");
    expect(call?.body.max_completion_tokens).toBe(1536);
    expect(call?.body.messages[1].content).toContain("محتوى الخبر للاختبار");
    expect(call?.options).toEqual({ deduplicate: true });
  });

  it("attributes social post generation and preserves the selected GPT model", async () => {
    const { generateSocialPost } = await import("../../server/ai-content-tools");
    const result = await generateSocialPost("عنوان", "ملخص", "twitter");
    const call = state.calls.find((entry) => entry.feature === "editor-social-post");

    expect(result.post).toBe("منشور");
    expect(call?.body.model).toBe("gpt-5.1");
    expect(call?.body.messages[1].content).toContain("عنوان");
    expect(call?.options).toBeUndefined();
  });

  it("attributes the SEO generator OpenAI path and deduplicates identical metadata requests", async () => {
    const { generateSeoMetadata } = await import("../../server/seo-generator");
    await generateSeoMetadata(
      { id: "article-1", title: "Test article", content: "Test content" },
      "en",
    );
    const call = state.calls.find((entry) => entry.feature === "seo-generator");

    expect(call?.body.model).toBe("gpt-5.1");
    expect(call?.body.response_format).toEqual({ type: "json_object" });
    expect(call?.body.max_completion_tokens).toBe(1024);
    expect(call?.options).toEqual({ deduplicate: true });
  });
});
