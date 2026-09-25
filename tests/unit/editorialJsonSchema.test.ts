import { describe, expect, it, vi } from "vitest";

const { complete } = vi.hoisted(() => ({ complete: vi.fn() }));
vi.mock("../../server/ai/gateway", () => ({ aiGateway: { complete } }));
import { EDITORIAL_JSON_SCHEMA, runEditorialTask } from "../../server/services/editorialAiService";
import { SABQ_TASK_OUTPUT_FORMAT_AR } from "../../server/ai/prompts/tasks";

describe("editorial output schema", () => {
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
});
