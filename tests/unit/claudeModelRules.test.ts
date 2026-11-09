import { beforeEach, describe, expect, it, vi } from "vitest";

const { anthropicCreate } = vi.hoisted(() => ({ anthropicCreate: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: anthropicCreate };
  },
}));

// editorGatewayText يستورد البوابة (ومعها قاعدة البيانات)؛ parseModelJson لا يحتاجها.
vi.mock("../../server/ai/gateway", () => ({ aiGateway: { complete: vi.fn() } }));

import { claudeRequestRules } from "../../server/ai/gateway/claudeModelRules";
import { anthropicAdapter } from "../../server/ai/gateway/adapters/anthropic";
import { parseModelJson } from "../../server/ai/editorGatewayText";
import { DEFAULT_FEATURES } from "../../server/ai/gateway/defaults";

const MESSAGES = [
  { role: "system" as const, content: "تعليمات" },
  { role: "user" as const, content: "خبر" },
];

describe("claudeRequestRules", () => {
  it("keeps temperature and no thinking field for 4.x and older", () => {
    expect(claudeRequestRules("claude-sonnet-4-6")).toEqual({ sendTemperature: true });
    expect(claudeRequestRules("claude-haiku-4-5")).toEqual({ sendTemperature: true });
    expect(claudeRequestRules("claude-3-5-sonnet-20241022")).toEqual({ sendTemperature: true });
  });

  it("drops temperature and turns thinking off where the model allows it", () => {
    expect(claudeRequestRules("claude-haiku-5-5")).toEqual({ sendTemperature: false, thinking: { type: "disabled" } });
    expect(claudeRequestRules("claude-sonnet-5")).toEqual({ sendTemperature: false, thinking: { type: "disabled" } });
    expect(claudeRequestRules("claude-sonnet-5-5")).toEqual({ sendTemperature: false, thinking: { type: "between_tools" } });
  });

  it("sends no thinking field for always-thinking models", () => {
    expect(claudeRequestRules("claude-opus-5-5")).toEqual({ sendTemperature: false, thinking: undefined });
    expect(claudeRequestRules("claude-fable-5-1")).toEqual({ sendTemperature: false, thinking: undefined });
  });
});

describe("anthropic adapter on Claude 5.x", () => {
  beforeEach(() => {
    anthropicCreate.mockReset();
    anthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
      usage: { input_tokens: 10, output_tokens: 2 },
      stop_reason: "end_turn",
    });
  });

  it("omits temperature and sends the thinking rule for Sonnet 5.5", async () => {
    await anthropicAdapter.complete!("claude-sonnet-5-5", { messages: MESSAGES, temperature: 0.8, timeoutMs: 1000 });
    const body = anthropicCreate.mock.calls[0][0];
    expect(body.temperature).toBeUndefined();
    expect(body.thinking).toEqual({ type: "between_tools" });
  });

  it("still sends temperature to Sonnet 4.6", async () => {
    await anthropicAdapter.complete!("claude-sonnet-4-6", { messages: MESSAGES, temperature: 0.8, timeoutMs: 1000 });
    const body = anthropicCreate.mock.calls[0][0];
    expect(body.temperature).toBe(0.8);
    expect(body.thinking).toBeUndefined();
  });

  it("throws on a refusal so the gateway moves to the fallback", async () => {
    anthropicCreate.mockResolvedValue({ content: [], usage: { input_tokens: 10, output_tokens: 0 }, stop_reason: "refusal" });
    await expect(
      anthropicAdapter.complete!("claude-sonnet-5-5", { messages: MESSAGES, timeoutMs: 1000 }),
    ).rejects.toThrow(/refusal/);
  });
});

describe("parseModelJson", () => {
  it("parses plain, fenced and prefixed JSON", () => {
    expect(parseModelJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseModelJson('```json\n{"titles":["عنوان"]}\n```')).toEqual({ titles: ["عنوان"] });
    expect(parseModelJson('إليك النتيجة:\n{"a":"ب"}')).toEqual({ a: "ب" });
  });

  it("throws when there is no JSON object", () => {
    expect(() => parseModelJson("لا يوجد")).toThrow();
  });
});

describe("Claude-first editorial defaults", () => {
  it.each(["editor-summarize", "editor-headlines", "editor-seo-analysis", "editor-smart-content", "proofread", "en-translate"])(
    "%s starts on Claude with a GPT fallback",
    (key) => {
      const cfg = DEFAULT_FEATURES.find((f) => f.featureKey === key);
      expect(cfg?.primary.provider).toBe("anthropic");
      expect(cfg?.fallbackChain.some((f) => f.provider === "openai")).toBe(true);
    },
  );
});
