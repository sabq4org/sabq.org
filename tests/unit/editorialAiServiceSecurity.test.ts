import { beforeEach, describe, expect, it, vi } from "vitest";

const { complete } = vi.hoisted(() => ({ complete: vi.fn() }));
vi.mock("../../server/ai/gateway", () => ({ aiGateway: { complete } }));
import { runEditorialTask } from "../../server/services/editorialAiService";

const malicious = '<p>خبر عربي آمن</p><img src=x onerror=alert(1)><svg onload=alert(2)></svg><a href="javascript:alert(3)">رابط</a>';
function response(body = malicious) {
  return {
    headline: "عنوان", body, editorNotes: ["للمراجعة"],
    enVersion: { headline: "News", body: malicious, pushText: "" },
    sources: [
      { title: "Bad", url: "javascript:alert(1)" },
      { title: "Data", url: "data:text/html,boom" },
      { title: "Source", url: "https://example.com/news" },
    ],
  };
}
beforeEach(() => complete.mockReset());
function modelOutput(value: ReturnType<typeof response>) {
  return { content: JSON.stringify(value), provider: "test", modelId: "test", latencyMs: 1 };
}
describe("editorial AI output trust boundary", () => {
  it("removes active HTML in both languages and rejects unsafe source links", async () => {
    complete.mockResolvedValue(modelOutput(response()));
    const result = await runEditorialTask({ type: "review", material: "مادة تحريرية للمراجعة" });
    for (const body of [result.body, result.enVersion!.body]) {
      expect(body).not.toMatch(/onerror|onload|javascript:|<svg/i);
      expect(body).toContain("خبر عربي آمن");
    }
    expect(result.sources).toEqual([{ title: "Source", url: "https://example.com/news" }]);
  });

  it("retains safe editorial formatting and image layout", async () => {
    const body = '<h2>عنوان فرعي</h2><p class="qa-question"><strong>سؤال</strong></p><table><tbody><tr><td>جواب</td></tr></tbody></table><img src="https://example.com/a.jpg" data-width="25%" data-align="right">';
    complete.mockResolvedValue(modelOutput(response(body)));
    const result = await runEditorialTask({ type: "review", material: "مادة تحريرية للمراجعة" });
    expect(result.body).toContain('class="qa-question"');
    expect(result.body).toContain("<table>");
    expect(result.body).toContain('data-width="25%"');
  });

  it("validates completeness after removing executable content", async () => {
    const material = "تفاصيل الخبر ومعلومات المصدر والتحقق من الأحداث. ".repeat(20);
    complete.mockResolvedValueOnce(modelOutput(response(`<p>خبر</p><script>${material}</script>`)))
      .mockResolvedValueOnce(modelOutput(response(`<p>${material}</p>`)));
    const result = await runEditorialTask({ type: "edit", material });
    expect(result.meta.fallbackUsed).toBe(true);
    expect(result.body).toBe(`<p>${material}</p>`);
  });

  it("does not let HTML parser repairs hide a truncated model response", async () => {
    complete.mockResolvedValueOnce(modelOutput(response("<p>خبر غير مكتمل")))
      .mockResolvedValueOnce(modelOutput(response("<p>خبر مكتمل.</p>")));
    const result = await runEditorialTask({ type: "edit", material: "خبر مكتمل." });
    expect(result.meta.fallbackUsed).toBe(true);
    expect(result.body).toBe("<p>خبر مكتمل.</p>");
  });
});
