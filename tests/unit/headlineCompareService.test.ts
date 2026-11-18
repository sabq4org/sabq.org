import { describe, expect, it, vi } from "vitest";

const gen = vi.hoisted(() => vi.fn());
vi.mock("../../server/ai-manager", () => ({
  aiManager: { generateMultiple: gen },
  AI_MODELS: { GPT5: { name: "gpt5" }, CLAUDE_SONNET: { name: "claude" }, GEMINI_FLASH: { name: "gemini" } },
}));

import { buildCompareHeadlinesPrompt, compareHeadlines } from "../../server/services/headlineCompareService";

describe("headlineCompareService (extracted from /api/ai/compare-headlines unchanged)", () => {
  it("builds the same prompt: 500-char excerpt, optional current title", () => {
    const prompt = buildCompareHeadlinesPrompt("س".repeat(900), "العنوان الحالي");
    expect(prompt).toContain("س".repeat(500) + "...");
    expect(prompt).not.toContain("س".repeat(501));
    expect(prompt).toContain("العنوان الحالي: العنوان الحالي");
    expect(buildCompareHeadlinesPrompt("نص", undefined)).not.toContain("العنوان الحالي:");
  });
  it("asks three models in parallel and strips surrounding quotes", async () => {
    gen.mockResolvedValue([
      { provider: "openai", model: "m1", content: '"عنوان أول"' },
      { provider: "anthropic", model: "m2", content: " عنوان ثان " },
      { provider: "google", model: "m3", content: "", error: "fail" },
    ]);
    const out = await compareHeadlines("محتوى الخبر", undefined);
    expect(gen.mock.calls[0][1]).toHaveLength(3);
    expect(out).toEqual([
      { provider: "openai", model: "m1", title: "عنوان أول", error: undefined },
      { provider: "anthropic", model: "m2", title: "عنوان ثان", error: undefined },
      { provider: "google", model: "m3", title: "", error: "fail" },
    ]);
  });
});
