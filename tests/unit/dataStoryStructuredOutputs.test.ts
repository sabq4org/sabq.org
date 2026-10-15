import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { anthropicCreate, openaiCreate } = vi.hoisted(() => ({
  anthropicCreate: vi.fn(),
  openaiCreate: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: anthropicCreate };
  },
}));

vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: openaiCreate } };
  },
}));

import { generateStory } from "../../server/data-story-ai";

const DATASET = {
  rows: [{ city: "الرياض", value: 10 }],
  columns: [
    { name: "city", type: "string" as const },
    { name: "value", type: "number" as const },
  ],
  rowCount: 1,
  columnCount: 2,
  previewData: [{ city: "الرياض", value: 10 }],
};

const ANALYSIS = {
  statistics: {},
  insights: {
    keyFindings: [],
    trends: [],
    anomalies: [],
    recommendations: [],
    narrative: "",
  },
  charts: [],
  provider: "openai",
  model: "gpt-5.1",
  tokensUsed: 1,
  processingTime: 1,
};

const STORY = {
  title: "عنوان مكتمل",
  subtitle: "عنوان فرعي مكتمل",
  excerpt: "موجز مكتمل.",
  content: "<p>محتوى مكتمل.</p>",
  outline: { sections: [] },
};

function claudeResponse(text: string, stopReason = "end_turn") {
  return {
    content: [{ type: "text", text }],
    usage: { input_tokens: 10, output_tokens: 20 },
    stop_reason: stopReason,
  };
}

function gptResponse(text: string, finishReason = "stop") {
  return {
    choices: [{ message: { content: text }, finish_reason: finishReason }],
    usage: { total_tokens: 30 },
  };
}

describe("data story structured output fallback", () => {
  const originalSwitch = process.env.CLAUDE_STRUCTURED_OUTPUTS;

  beforeEach(() => {
    anthropicCreate.mockReset();
    openaiCreate.mockReset();
  });

  afterEach(() => {
    if (originalSwitch === undefined) delete process.env.CLAUDE_STRUCTURED_OUTPUTS;
    else process.env.CLAUDE_STRUCTURED_OUTPUTS = originalSwitch;
  });

  it("falls back from Claude max_tokens to a complete GPT response and keeps the switch off request shape", async () => {
    delete process.env.CLAUDE_STRUCTURED_OUTPUTS;
    anthropicCreate.mockResolvedValueOnce(claudeResponse("partial", "max_tokens"));
    openaiCreate.mockResolvedValueOnce(gptResponse(JSON.stringify(STORY)));

    const result = await generateStory(DATASET, ANALYSIS, "test.csv");

    expect(result.provider).toBe("openai");
    expect(result.draft).toEqual(STORY);
    expect(anthropicCreate.mock.calls[0][0]).not.toHaveProperty("output_config");
    expect(openaiCreate.mock.calls[0][0]).toMatchObject({
      response_format: { type: "json_object" },
      max_completion_tokens: 4096,
    });
  });

  it("rejects parseable GPT JSON when the fallback finish_reason is length", async () => {
    process.env.CLAUDE_STRUCTURED_OUTPUTS = "on";
    anthropicCreate.mockResolvedValueOnce(claudeResponse("partial", "max_tokens"));
    openaiCreate.mockResolvedValueOnce(gptResponse(JSON.stringify(STORY), "length"));

    await expect(generateStory(DATASET, ANALYSIS, "test.csv")).rejects.toThrow(
      "فشل توليد القصة: Claude story truncated (max_tokens)",
    );
    expect(anthropicCreate.mock.calls[0][0]).toMatchObject({
      output_config: { format: { type: "json_schema" } },
    });
  });

  it("retains the successful fenced JSON path from Claude", async () => {
    delete process.env.CLAUDE_STRUCTURED_OUTPUTS;
    anthropicCreate.mockResolvedValueOnce(claudeResponse(`\`\`\`json\n${JSON.stringify(STORY)}\n\`\`\``));

    const result = await generateStory(DATASET, ANALYSIS, "test.csv");

    expect(result.provider).toBe("anthropic");
    expect(result.draft).toEqual(STORY);
    expect(openaiCreate).not.toHaveBeenCalled();
  });
});
