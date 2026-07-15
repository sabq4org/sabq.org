import { describe, expect, it } from "vitest";
import {
  isBrandOgFallback,
  withOgImageCacheBust,
} from "../../server/utils/ogImageUrl";
import { articleShareUrls } from "../../server/services/socialPreviewRefresh";

describe("withOgImageCacheBust", () => {
  it("appends ?v= unix seconds from updatedAt", () => {
    const url = "https://imagedelivery.net/abc/public";
    const out = withOgImageCacheBust(url, "2026-07-15T21:30:17.165Z");
    expect(out).toBe(`${url}?v=${Math.floor(Date.parse("2026-07-15T21:30:17.165Z") / 1000)}`);
  });

  it("uses &v= when query already exists", () => {
    const url = "https://media.sabq.org/news/x.webp?w=1200";
    const out = withOgImageCacheBust(url, 1_700_000_000_000);
    expect(out).toBe(`${url}&v=1700000000`);
  });

  it("replaces an existing v= param", () => {
    const url = "https://example.com/img.jpg?v=1";
    const out = withOgImageCacheBust(url, 2_000_000_000_000);
    expect(out).toBe("https://example.com/img.jpg?v=2000000000");
  });

  it("does not version brand fallbacks", () => {
    expect(isBrandOgFallback("https://sabq.org/branding/sabq-og-image.png")).toBe(true);
    expect(
      withOgImageCacheBust("https://sabq.org/branding/sabq-og-image.png", Date.now()),
    ).toBe("https://sabq.org/branding/sabq-og-image.png");
    expect(withOgImageCacheBust("https://sabq.org/icon.png", Date.now())).toBe(
      "https://sabq.org/icon.png",
    );
  });
});

describe("articleShareUrls", () => {
  it("prefers englishSlug for the Arabic public path and includes en path", () => {
    const urls = articleShareUrls({
      slug: "عنوان-عربي",
      englishSlug: "h68i3kk",
    });
    expect(urls).toContain("https://sabq.org/article/h68i3kk");
    expect(urls).toContain("https://sabq.org/en/article/h68i3kk");
    expect(urls).toContain("https://sabq.org/article/عنوان-عربي");
  });
});
