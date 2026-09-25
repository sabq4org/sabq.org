import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

import { claudeJsonOutput, claudeStructuredOutputsEnabled } from "../../server/ai/claudeStructuredOutputs";
import { anthropicAdapter } from "../../server/ai/gateway/adapters/anthropic";

const SCHEMA = { type: "object", properties: { a: { type: "string" } }, required: ["a"] };
const OK_RESPONSE = {
  content: [
    { type: "thinking", thinking: "..." },
    { type: "text", text: '{"a":' },
    { type: "text", text: '"x"}' },
  ],
  usage: { input_tokens: 10, output_tokens: 5 },
  stop_reason: "end_turn",
};

describe("claudeStructuredOutputs kill switch", () => {
  const original = process.env.CLAUDE_STRUCTURED_OUTPUTS;
  afterEach(() => {
    if (original === undefined) delete process.env.CLAUDE_STRUCTURED_OUTPUTS;
    else process.env.CLAUDE_STRUCTURED_OUTPUTS = original;
  });

  it("is off unless explicitly set to on", () => {
    delete process.env.CLAUDE_STRUCTURED_OUTPUTS;
    expect(claudeStructuredOutputsEnabled()).toBe(false);
    expect(claudeJsonOutput(SCHEMA)).toEqual({});
    process.env.CLAUDE_STRUCTURED_OUTPUTS = "true";
    expect(claudeJsonOutput(SCHEMA)).toEqual({});
  });

  it("returns output_config when on", () => {
    process.env.CLAUDE_STRUCTURED_OUTPUTS = "on";
    expect(claudeJsonOutput(SCHEMA)).toEqual({
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
    });
  });
});

describe("anthropic adapter", () => {
  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue(OK_RESPONSE);
    process.env.ANTHROPIC_API_KEY = "test";
  });
  afterEach(() => {
    delete process.env.CLAUDE_STRUCTURED_OUTPUTS;
  });

  const params = { messages: [{ role: "user" as const, content: "hi" }], timeoutMs: 1000 };

  it("joins every text block and skips thinking blocks", async () => {
    const res = await anthropicAdapter.complete!("claude-test", params);
    expect(res.content).toBe('{"a":"x"}');
  });

  it("sends output_config only when a schema is given and the switch is on", async () => {
    await anthropicAdapter.complete!("claude-test", { ...params, jsonSchema: SCHEMA });
    expect(create.mock.calls[0][0]).not.toHaveProperty("output_config");

    process.env.CLAUDE_STRUCTURED_OUTPUTS = "on";
    await anthropicAdapter.complete!("claude-test", params);
    expect(create.mock.calls[1][0]).not.toHaveProperty("output_config");

    await anthropicAdapter.complete!("claude-test", { ...params, jsonSchema: SCHEMA });
    expect(create.mock.calls[2][0].output_config).toEqual({
      format: { type: "json_schema", schema: SCHEMA },
    });
  });
});
