import { beforeEach, describe, expect, it, vi } from "vitest";

const { anthropicCreate } = vi.hoisted(() => ({ anthropicCreate: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: anthropicCreate };
  },
}));

import { anthropicAdapter } from "../../server/ai/gateway/adapters/anthropic";

const MESSAGES = [
  { role: "system" as const, content: "تعليمات ثابتة" },
  { role: "user" as const, content: "خبر" },
];

describe("anthropic adapter prompt caching", () => {
  beforeEach(() => {
    anthropicCreate.mockReset();
    anthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
      usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 5000, cache_creation_input_tokens: 0 },
      stop_reason: "end_turn",
    });
  });

  it("marks the system prompt as cacheable when asked", async () => {
    const res = await anthropicAdapter.complete!("claude-sonnet-4-6", {
      messages: MESSAGES,
      cacheSystemPrompt: true,
      timeoutMs: 1000,
    });
    expect(anthropicCreate.mock.calls[0][0].system).toEqual([
      { type: "text", text: "تعليمات ثابتة", cache_control: { type: "ephemeral" } },
    ]);
    // Cached prefix tokens still count toward the reported prompt size.
    expect(res.inputTokens).toBe(5100);
  });

  it("keeps a plain string system prompt by default", async () => {
    await anthropicAdapter.complete!("claude-sonnet-4-6", { messages: MESSAGES, timeoutMs: 1000 });
    expect(anthropicCreate.mock.calls[0][0].system).toBe("تعليمات ثابتة");
  });
});
