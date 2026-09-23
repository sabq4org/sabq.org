import { describe, expect, it } from "vitest";
import { buildNewsArticleImageVariants, getArticleSchemaType } from "../../server/utils/newsArticleSchema";

describe("NewsArticle image URLs", () => {
  it("preserves media.sabq.org assets instead of routing them through Pages transforms", () => {
    const source = "https://media.sabq.org/news/2026/09/story/w1600.webp";
    expect(buildNewsArticleImageVariants(source, "https://sabq.org")).toEqual([
      source,
    ]);
  });

  it("keeps same-origin images on the supported image transform path", () => {
    const variants = buildNewsArticleImageVariants(
      "https://sabq.org/news/story.webp",
      "https://sabq.org",
    );
    expect(variants).toHaveLength(3);
    expect(variants[0]).toContain("/cdn-cgi/image/width=1200,height=675");
  });

  it("does not transform API or external images", () => {
    expect(buildNewsArticleImageVariants("/api/public-media/story.webp", "https://sabq.org")).toEqual([
      "/api/public-media/story.webp",
    ]);
    expect(buildNewsArticleImageVariants("https://images.example.test/story.webp", "https://sabq.org")).toEqual([
      "https://images.example.test/story.webp",
    ]);
  });
});

describe("editorial Schema.org article types", () => {
  it.each([
    ["opinion", "OpinionNewsArticle"],
    ["analysis", "AnalysisNewsArticle"],
    ["news", "NewsArticle"],
    [null, "NewsArticle"],
  ])("maps %s correctly", (input, expected) => {
    expect(getArticleSchemaType(input)).toBe(expected);
  });
});
