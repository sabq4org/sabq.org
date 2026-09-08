import React, { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("../../web-next/components/SiteHeader", () => ({ SiteHeader: () => createElement("header") }));
vi.mock("../../web-next/components/SiteFooter", () => ({ SiteFooter: () => createElement("footer") }));
vi.mock("../../web-next/components/ShareButtons", () => ({ ShareButtons: () => createElement("div") }));
import { ArticleView } from "../../web-next/components/ArticleView";
import type { SeoBundle } from "../../web-next/lib/seoBundle";

const bundle: SeoBundle = {
  slug: "story", englishSlug: "story", title: "خبر الاختبار", excerpt: "ملخص",
  contentHtml: "<p>المتن</p>", imageUrl: "https://media.sabq.org/story.webp",
  publishedAt: "2026-09-07T23:00:00.000Z", updatedAt: "2026-09-07T23:00:00.000Z",
  author: "صحيفة سبق", reporterHref: null, category: "محليات", categoryHref: "/category/local",
  keywords: [], articleTags: [], categoryLatest: [], articleType: "opinion",
  imageAlt: "وصف الصورة", imageCaption: "تعليق الصورة", imageSource: "المصدر",
  isAiGeneratedImage: true,
  meta: {
    title: "خبر الاختبار | سبق", description: "ملخص", canonical: "https://sabq.org/article/story",
    image: "https://media.sabq.org/story.webp", robots: "index,follow", locale: "ar_SA",
    siteName: "سبق", hreflang: [], publishedTime: "2026-09-07T23:00:00.000Z",
    modifiedTime: "2026-09-07T23:00:00.000Z",
  },
  jsonLd: {},
};

describe("ArticleView SEO rendering", () => {
  it("renders Gregorian Riyadh date, opinion label, and figure disclosure", () => {
    const html = renderToStaticMarkup(createElement(ArticleView, { bundle, lang: "ar" }));
    expect(html).toContain("مقال رأي");
    expect(html).toContain("بتوقيت الرياض");
    expect(html).toContain("<figure");
    expect(html).toContain("صورة مولدة بالذكاء الاصطناعي");
    expect(html).toContain('alt="وصف الصورة"');
    expect(html).not.toContain("آخر تحديث");
    expect(html).toContain("٨ سبتمبر ٢٠٢٦");
  });

  it("renders a meaningful update as a time element", () => {
    const html = renderToStaticMarkup(createElement(ArticleView, {
      bundle: { ...bundle, meta: { ...bundle.meta, modifiedTime: "2026-09-08T02:00:00.000Z" } }, lang: "ar",
    }));
    expect(html).toContain("آخر تحديث");
    expect(html).toContain('dateTime="2026-09-08T02:00:00.000Z"');
  });
});
