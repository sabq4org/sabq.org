import { describe, expect, it } from "vitest";
import { getArticleDisplayImageUrl } from "../../shared/articleHeroPreload";
import { formatArticleForMobile, mobileInfographicImages } from "../../server/services/mobileArticleFormat";

const FULL = "https://media.sabq.org/news/full-infographic.jpg";
const BANNER = "https://media.sabq.org/news/banner-16x9.jpg";

describe("getArticleDisplayImageUrl (cards)", () => {
  it("prefers the 16:9 front image for infographics", () => {
    expect(getArticleDisplayImageUrl({ articleType: "infographic", imageUrl: FULL, infographicBannerUrl: BANNER })).toBe(BANNER);
  });
  it("falls back to the full infographic when no front image exists", () => {
    expect(getArticleDisplayImageUrl({ articleType: "infographic", imageUrl: FULL, infographicBannerUrl: "  " })).toBe(FULL);
  });
  it("leaves other article types on imageUrl", () => {
    expect(getArticleDisplayImageUrl({ articleType: "news", imageUrl: FULL, infographicBannerUrl: BANNER })).toBe(FULL);
  });
});

describe("mobileInfographicImages", () => {
  const article = { articleType: "infographic", imageUrl: FULL, infographicBannerUrl: BANNER };
  it("sends the front image in lists so installed apps show it", () => {
    expect(mobileInfographicImages(article, false)).toEqual({ imageUrl: BANNER, fullUrl: FULL });
  });
  it("keeps the full infographic as image_url on the detail endpoint", () => {
    expect(mobileInfographicImages(article, true)).toEqual({ imageUrl: FULL, fullUrl: FULL });
  });
  it("does not touch news articles", () => {
    expect(mobileInfographicImages({ articleType: "news", imageUrl: FULL, infographicBannerUrl: BANNER }, false)).toEqual({ imageUrl: FULL, fullUrl: null });
  });
});

describe("formatArticleForMobile", () => {
  const row = { article: { id: "a1", title: "t", slug: "s", content: "<p>نص</p>", articleType: "infographic", imageUrl: FULL, infographicBannerUrl: BANNER } };
  it("adds article_type and infographic_image_url", () => {
    const list = formatArticleForMobile(row, "https://sabq.org");
    expect(list.image_url).toBe(BANNER);
    expect(list.article_type).toBe("infographic");
    expect(list.infographic_image_url).toBe(FULL);
    expect(formatArticleForMobile(row, "https://sabq.org", { detail: true }).image_url).toBe(FULL);
  });
});
