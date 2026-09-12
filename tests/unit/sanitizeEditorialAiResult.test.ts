import { describe, expect, it } from "vitest";
import { sanitizeEditorialAiResult } from "../../client/src/lib/sanitizeEditorialAiResult";

describe("browser AI response boundary (shared preview and Apply state)", () => {
  it.each([
    '<img src=x onerror=alert(1)>',
    '<svg><a onload="alert(1)">bad</a></svg>',
    '<math><mtext><img src=x onerror=alert(1)></mtext></math>',
    '<a href="java&#x73;cript:alert(1)">bad</a>',
    '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
  ])("sanitizes both languages before they enter UI state: %s", (html) => {
    const raw = { body: html, enVersion: { body: html, headline: "English" }, sources: [] };
    const clean = sanitizeEditorialAiResult(raw);
    expect(clean.body).not.toMatch(/onerror|onload|javascript:|<svg|<math|<iframe|<script/i);
    expect(clean.enVersion!.body).toBe(clean.body);
    expect(clean.enVersion!.headline).toBe("English");
    expect(raw.body).toBe(html);
  });
  it("preserves safe content, metadata and citations while rejecting executable links", () => {
    const body = '<h2>أخبار</h2><p class="qa-question"><strong>سؤال</strong></p><table><tbody><tr><td>جواب</td></tr></tbody></table><img src="https://example.com/a.jpg" data-width="25%" data-align="right">';
    const result = sanitizeEditorialAiResult({ body, enVersion: null, meta: { modelId: "test" }, sources:
      ["https://example.com", "http://example.com", "javascript:alert(1)", "java\nscript:alert(1)", "data:text/html,test", "/relative"].map(url => ({ title: "Source", url })) });
    expect(result.body).toBe(body);
    expect(result.meta).toEqual({ modelId: "test" });
    expect(result.sources.map(s => s.url)).toEqual(["https://example.com", "http://example.com"]);
  });
});
