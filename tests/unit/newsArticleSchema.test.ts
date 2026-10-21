import { describe, expect, it } from "vitest";
import {
  buildBreadcrumbListJsonLd,
  buildNewsArticleImageVariants,
  getArticleSchemaType,
} from "../../server/utils/newsArticleSchema";

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

  it("falls back to the >=1200px brand card when imageUrl is empty or icon.png", () => {
    const variants = buildNewsArticleImageVariants("", "https://sabq.org");
    expect(variants[0]).toContain("width=1200");
    expect(variants[0]).toContain("/branding/sabq-og-image.png");
    const iconVariants = buildNewsArticleImageVariants("https://sabq.org/icon.png", "https://sabq.org");
    expect(iconVariants[0]).toContain("/branding/sabq-og-image.png");
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

describe("BreadcrumbList JSON-LD builder", () => {
  it("builds sequential positions with non-empty names and drops unnamed items", () => {
    const crumbs = buildBreadcrumbListJsonLd([
      { name: "الرئيسية", item: "https://sabq.org/" },
      { name: "   ", item: "https://sabq.org/category/empty" },
      { name: "السعودية", item: "https://sabq.org/category/saudia" },
      { name: "عنوان المقال" },
    ]);
    expect(crumbs).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "الرئيسية", item: "https://sabq.org/" },
        { "@type": "ListItem", position: 2, name: "السعودية", item: "https://sabq.org/category/saudia" },
        { "@type": "ListItem", position: 3, name: "عنوان المقال" },
      ],
    });
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
