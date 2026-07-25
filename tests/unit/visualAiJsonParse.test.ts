import { describe, expect, it } from "vitest";
import { parseVisualAiJson } from "../../server/services/visualAiJson";

describe("parseVisualAiJson", () => {
  it("parses clean JSON", () => {
    const parsed = parseVisualAiJson('{"qualityScore":80,"tags":["a"]}');
    expect(parsed).toEqual({ qualityScore: 80, tags: ["a"] });
  });

  it("strips markdown fences", () => {
    const raw = "```json\n{\n  \"qualityScore\": 80,\n  \"relevanceScore\": 95\n}\n```";
    const parsed = parseVisualAiJson(raw);
    expect(parsed).toEqual({ qualityScore: 80, relevanceScore: 95 });
  });

  it("repairs truncated JSON cut mid-object", () => {
    const raw = `\`\`\`json
{
  "qualityScore": 80,
  "resolution": "Good",
  "contentDescription": {
    "ar": "وصف",
    "en": "desc",
    "ur": "تفصیل"
  },
  "detectedObjects": ["bus", "desert"],
  "hasSensitiveContent": true,
  "relevanceScore": 95,`;
    const parsed = parseVisualAiJson(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.qualityScore).toBe(80);
    expect(parsed!.relevanceScore).toBe(95);
    expect(parsed!.hasSensitiveContent).toBe(true);
  });

  it("returns null for empty input", () => {
    expect(parseVisualAiJson("")).toBeNull();
    expect(parseVisualAiJson("not json at all")).toBeNull();
  });
});
