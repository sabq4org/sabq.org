import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OptimizedImage } from "../../client/src/components/OptimizedImage";
import { HERO_SIZES_ATTR } from "../../shared/cdnImage";
import { ARTICLE_HERO_QUALITY, buildArticleHeroPreload, buildHeroImagePreload, getCacheBustedImageUrl } from "../../shared/articleHeroPreload";

const publication = { status: "published", publishedAt: "2020-01-01T00:00:00Z", updatedAt: "2020-01-02T00:00:00Z" };

describe("article hero discovery", () => {
  // Vitest's node transform uses classic JSX; the client build uses Vite React.
  beforeEach(() => vi.stubGlobal("React", React));
  afterEach(() => vi.unstubAllGlobals());
  it.each([
    "https://media.sabq.org/news/2026/08/eac5d52a-bbb4-410f-9bb7-470597c89261/w740.webp",
    "https://imagedelivery.net/account/image/public",
    "/uploads/article-hero.jpg",
  ])("preloads the same responsive resource the image renders: %s", imageUrl => {
    const preload = buildArticleHeroPreload({ ...publication, imageUrl })!;
    const html = renderToStaticMarkup(createElement(OptimizedImage, {
      src: getCacheBustedImageUrl(imageUrl, publication.updatedAt),
      alt: "خبر", priority: true, quality: ARTICLE_HERO_QUALITY, sizes: HERO_SIZES_ATTR,
    }));
    const srcset = html.match(/<source[^>]*srcset="([^"]+)"/i)?.[1].replaceAll("&amp;", "&");
    expect(srcset).toBe(preload.imagesrcset);
    expect(preload.imagesizes).toBe(HERO_SIZES_ATTR);
    expect(html).toContain('fetchpriority="high"');
    expect(html).toContain('loading="eager"');
  });

  it("does not preload private, scheduled, video, or missing images", () => {
    for (const override of [
      { status: "draft" }, { status: "archived" }, { publishedAt: "2999-01-01" },
      { publishedAt: null }, { isVideoTemplate: true }, { imageUrl: null },
      { imageUrl: "data:image/png;base64,a" }, { imageUrl: "blob:example" },
    ]) expect(buildArticleHeroPreload({ ...publication, imageUrl: "/uploads/hero.jpg", ...override })).toBeUndefined();
  });

  it("preserves image versions and keeps homepage defaults separate", () => {
    const url = "/uploads/hero.jpg?format=webp";
    const versioned = getCacheBustedImageUrl(url, publication.updatedAt);
    expect(versioned).toBe(url + "&v=" + Math.floor(Date.parse(publication.updatedAt) / 1000).toString(36));
    expect(getCacheBustedImageUrl(url, "2020-01-03")).not.toBe(versioned);
    expect(buildArticleHeroPreload({ ...publication, imageUrl: url })?.imagesrcset).toContain("quality=85");
    expect(buildHeroImagePreload(url)?.imagesrcset).toContain("quality=72");
  });
});
