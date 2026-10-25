import { beforeEach, describe, expect, it, vi } from "vitest";

const complete = vi.hoisted(() => vi.fn());
vi.mock("../../server/ai/gateway", () => ({ aiGateway: { complete } }));

const { buildModerationUserMessage, getStatusFromClassification, moderateComment } = await import(
  "../../server/ai/commentModeration"
);

describe("AI moderation with article context", () => {
  beforeEach(() => complete.mockReset());

  it("low_value goes to human review, never auto-approved", () => {
    expect(getStatusFromClassification("low_value")).toBe("pending");
    expect(getStatusFromClassification("safe")).toBe("approved");
  });

  it("includes the article title and a ≤ 400-char excerpt in the user message", () => {
    const msg = buildModerationUserMessage("65", {
      title: "وفاة الفنان فلان",
      excerpt: `<p>${"نص ".repeat(300)}</p>`,
    });
    expect(msg).toContain("عنوان الخبر: وفاة الفنان فلان");
    const excerptLine = msg.split("\n").find((l) => l.startsWith("مقتطف من الخبر: "))!;
    expect(excerptLine.length - "مقتطف من الخبر: ".length).toBeLessThanOrEqual(400);
    expect(msg).toContain('التعليق: "65"');
  });

  it("falls back to the bare comment when no article is given", () => {
    expect(buildModerationUserMessage("رحمه الله")).toBe('"رحمه الله"');
  });

  it("accepts low_value from the model and sends the context", async () => {
    complete.mockResolvedValue({
      content: JSON.stringify({ score: 55, classification: "low_value", detected: ["low_value"], reason: "رقم فقط" }),
      provider: "test",
      modelId: "m",
    });
    const out = await moderateComment("65", { article: { title: "خبر" } });
    expect(out.classification).toBe("low_value");
    expect(complete.mock.calls[0][0].messages[1].content).toContain("عنوان الخبر: خبر");
  });
});
