import { beforeEach, describe, expect, it, vi } from "vitest";

const { complete } = vi.hoisted(() => ({ complete: vi.fn() }));
vi.mock("../../server/ai/gateway", () => ({ aiGateway: { complete } }));
import { EDITORIAL_JSON_SCHEMA, runEditorialTask } from "../../server/services/editorialAiService";
import { SABQ_TASK_OUTPUT_FORMAT_AR } from "../../server/ai/prompts/tasks";

describe("editorial output schema", () => {
  beforeEach(() => complete.mockReset());

  it("has exactly the top-level keys the prompt's output format documents", () => {
    const block = SABQ_TASK_OUTPUT_FORMAT_AR.slice(
      SABQ_TASK_OUTPUT_FORMAT_AR.indexOf("{"),
      SABQ_TASK_OUTPUT_FORMAT_AR.lastIndexOf("}") + 1,
    );
    const promptKeys = Object.keys(JSON.parse(block)).sort();
    expect([...EDITORIAL_JSON_SCHEMA.required].sort()).toEqual(promptKeys);
    expect(Object.keys(EDITORIAL_JSON_SCHEMA.properties).sort()).toEqual(promptKeys);
  });

  it("passes the schema to the gateway alongside jsonMode", async () => {
    complete.mockResolvedValue({
      content: JSON.stringify({ headline: "ع", body: "", editorNotes: ["ملاحظة"] }),
      provider: "test",
      modelId: "test",
      latencyMs: 1,
    });
    await runEditorialTask({ type: "review", material: "مادة" });
    expect(complete.mock.calls[0][0].options).toMatchObject({
      jsonMode: true,
      jsonSchema: EDITORIAL_JSON_SCHEMA,
    });
  });

  it("falls back when the primary completion is marked truncated", async () => {
    complete
      .mockResolvedValueOnce({
        content: JSON.stringify({ headline: "أ", body: "", editorNotes: ["ملاحظة"] }),
        provider: "anthropic",
        modelId: "claude-sonnet-4-6",
        latencyMs: 1,
        truncated: true,
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ headline: "عنوان مكتمل", body: "", editorNotes: ["ملاحظة"] }),
        provider: "openai",
        modelId: "gpt-5.1",
        latencyMs: 2,
        truncated: false,
      });

    const result = await runEditorialTask({ type: "review", material: "مادة" });

    expect(complete).toHaveBeenCalledTimes(2);
    expect(result.headline).toBe("عنوان مكتمل");
    expect(result.meta).toMatchObject({
      provider: "openai",
      modelId: "gpt-5.1",
      fallbackUsed: true,
    });
  });
});
