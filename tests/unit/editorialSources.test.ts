import { describe, expect, it } from "vitest";
import { appendReviewedSources } from "../../client/src/lib/editorialSources";

describe("reviewed editorial sources", () => {
  const sources = [
    { title: "مصدر موثوق", url: "https://example.com/bulletin" },
    { title: "غير مختار", url: "https://example.com/other" },
  ];

  it("does not append sources without explicit selection", () => {
    expect(appendReviewedSources("<p>المتن</p>", sources, [])).toBe("<p>المتن</p>");
  });

  it("appends only selected safe sources and escapes labels", () => {
    const html = appendReviewedSources("<p>المتن</p>", [
      ...sources,
      { title: "<script>alert(1)</script>", url: "https://example.com/escaped" },
    ], [0, 1, 2]);
    expect(html).toContain("https://example.com/bulletin");
    expect(html).toContain("غير مختار");
    expect(html).toContain("target=\"_blank\"");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("filters non-http sources", () => {
    expect(appendReviewedSources("<p>المتن</p>", [{ title: "خطر", url: "javascript:alert(1)" }], [0]))
      .toBe("<p>المتن</p>");
  });
});
