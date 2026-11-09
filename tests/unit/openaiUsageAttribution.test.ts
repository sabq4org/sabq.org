import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  calls: [] as Array<{ client: unknown; feature: string; body: any; options?: { deduplicate?: boolean } }>,
}));

// seo-generator يسجّل طلبات Claude مباشرة؛ نعزل القاعدة، ونجعل Claude يفشل لاختبار البديل.
vi.mock("../../server/ai/gateway/usageLogger", () => ({ logUsage: vi.fn() }));
vi.mock("../../server/ai/gateway/configStore", () => ({
  getModel: vi.fn(async () => undefined),
  getFeatureConfig: vi.fn(async () => ({ isEnabled: true })),
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: vi.fn(async () => { throw new Error("anthropic unavailable in test"); }) };
  },
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

// منذ 2026-11-09 أزرار المحرر (الموجز، العناوين، تحليل SEO) تمر عبر البوابة
// (Claude أولًا ثم GPT)، فتُسجَّل في ai_usage_logs من البوابة نفسها.
const gatewayState = vi.hoisted(() => ({ calls: [] as any[] }));

vi.mock("../../server/ai/gateway", () => ({
  aiGateway: {
    complete: vi.fn(async (req: any) => {
      gatewayState.calls.push(req);
      const contentByFeature: Record<string, string> = {
        "editor-headlines": "```json\n" + JSON.stringify({ titles: ["عنوان أول", "عنوان ثان", "عنوان ثالث"] }) + "\n```",
        "editor-seo-analysis": JSON.stringify({
          seoTitle: "عنوان محسّن لمحركات البحث",
          metaDescription: "وصف محسّن للمقال",
          keywords: ["سبق"],
        }),
      };
      await Promise.resolve();
      return {
        content: contentByFeature[req.feature] || "ملخص محفوظ",
        truncated: false,
        provider: "anthropic",
        modelId: "claude-sonnet-5-5",
      };
    }),
  },
}));

describe("editor buttons go through the AI gateway", () => {
  beforeEach(() => {
    gatewayState.calls.length = 0;
    // server/openai.ts still builds an OpenAI client at import for its other helpers.
    process.env.OPENAI_API_KEY = "unit-test-key";
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "unit-test-key";
  });

  it("sends the article summary to the editor-summarize feature and shares identical in-flight calls", async () => {
    const { summarizeArticle } = await import("../../server/openai");
    const input = "خبر تجريبي طويل بما يكفي للاختبار";
    const [a, b] = await Promise.all([summarizeArticle(input), summarizeArticle(input)]);
    const calls = gatewayState.calls.filter((entry) => entry.feature === "editor-summarize");

    expect(a).toBe("ملخص محفوظ");
    expect(b).toBe("ملخص محفوظ");
    expect(calls).toHaveLength(1);
    expect(calls[0].messages[1].content).toContain(input);
    expect(calls[0].options.maxTokens).toBe(1024);
    expect(calls[0].options.cacheSystemPrompt).toBe(true);
  });

  it("parses fenced JSON headlines and keeps the creative temperature hint", async () => {
    const { generateTitle } = await import("../../server/openai");
    const result = await generateTitle("خبر عن فعالية تقنية مهمة", "ar");
    const call = gatewayState.calls.find((entry) => entry.feature === "editor-headlines");

    expect(result).toEqual(["عنوان أول", "عنوان ثان", "عنوان ثالث"]);
    expect(call.options.temperature).toBe(0.8);
    expect(call.options.jsonMode).toBe(true);
  });

  it("sends SEO analysis to the editor-seo-analysis feature", async () => {
    const { analyzeSEO } = await import("../../server/openai");
    await analyzeSEO("عنوان الخبر", "محتوى الخبر للاختبار", "مقتطف");
    const call = gatewayState.calls.find((entry) => entry.feature === "editor-seo-analysis");

    expect(call.messages[1].content).toContain("محتوى الخبر للاختبار");
    expect(call.options.jsonMode).toBe(true);
  });
});

describe("legacy OpenAI usage attribution", () => {
  beforeEach(() => {
    state.calls.length = 0;
    process.env.OPENAI_API_KEY = "unit-test-key";
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "unit-test-key";
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

  it("falls back to the tracked OpenAI path for SEO metadata when Claude is unavailable", async () => {
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
