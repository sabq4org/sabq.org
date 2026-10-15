import { describe, expect, it } from "vitest";
import {
  buildCardImagePreload,
  getArticleCardImageSrc,
  pickCategoryLandingLead,
} from "@shared/articleHeroPreload";
import { normalizeImageSrc } from "@/lib/cdnImage";
import { getOptimizedImageSrc, getOptimizedImageSrcSet } from "@/lib/optimizedImageSources";

// What <ArticleMedia variant="grid" priority> → <OptimizedImage preferSize="medium">
// requests (no quality/sizes props, so component defaults apply).
const OPTIMIZED_IMAGE_DEFAULT_SIZES = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw";
function clientCardRequest(article: Parameters<typeof getArticleCardImageSrc>[0]) {
  const normalized = normalizeImageSrc(getArticleCardImageSrc(article));
  return {
    href: getOptimizedImageSrc(normalized, { preferSize: "medium" }),
    srcset: getOptimizedImageSrcSet(normalized, undefined),
  };
}

const updatedAt = new Date("2026-09-20T10:00:00.000Z");

describe("category landing card preload", () => {
  it("matches the client card URL for a Cloudflare Images source", () => {
    const article = { imageUrl: "https://imagedelivery.net/HASH/abc-123/public", updatedAt };
    const client = clientCardRequest(article);
    const edge = buildCardImagePreload(article);
    expect(edge).toEqual({ href: client.href, imagesrcset: client.srcset, imagesizes: OPTIMIZED_IMAGE_DEFAULT_SIZES });
    expect(edge?.href).toContain("/w=640,q=85,fit=scale-down");
  });

  it("matches the client card URL for a media.sabq.org R2 source", () => {
    const article = {
      imageUrl: "https://media.sabq.org/news/2026/09/0f8e2a4c-1b2d-4c3e-9f00-aa11bb22cc33/w1600.webp",
      updatedAt: updatedAt.toISOString(), // the SPA sees the JSON string form
    };
    const client = clientCardRequest(article);
    const edge = buildCardImagePreload({ ...article, updatedAt }); // the edge has a Date
    expect(edge).toEqual({ href: client.href, imagesrcset: client.srcset, imagesizes: OPTIMIZED_IMAGE_DEFAULT_SIZES });
    expect(edge?.href).toMatch(/\/w960\.webp\?v=/);
    expect(edge?.imagesrcset).toContain("/w480.webp");
  });

  it("falls back through the same display-image order as the card", () => {
    const article = { imageUrl: " ", thumbnailUrl: "https://imagedelivery.net/HASH/thumb/public", updatedAt };
    expect(buildCardImagePreload(article)?.href).toBe(clientCardRequest(article).href);
    expect(buildCardImagePreload({ imageUrl: null, updatedAt })).toBeUndefined();
  });

  it("picks the card the default view renders first (30 days, newest, stable)", () => {
    const now = Date.parse("2026-09-26T00:00:00Z");
    const rows = [
      { id: "pinned-old", publishedAt: "2026-07-01T00:00:00Z" },
      { id: "a", publishedAt: "2026-09-20T00:00:00Z" },
      { id: "b", publishedAt: "2026-09-25T00:00:00Z" },
      { id: "b-tie", publishedAt: "2026-09-25T00:00:00Z" },
      { id: "none", publishedAt: null },
    ];
    const clientView = rows
      .filter((a) => a.publishedAt && new Date(a.publishedAt) >= new Date(now - 30 * 864e5))
      .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime());
    expect(pickCategoryLandingLead(rows, now)?.id).toBe(clientView[0].id);
    expect(pickCategoryLandingLead(rows, now)?.id).toBe("b");
    expect(pickCategoryLandingLead([rows[0]], now)).toBeUndefined();
  });
});
