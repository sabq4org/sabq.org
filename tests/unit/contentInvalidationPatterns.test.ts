import { describe, it, expect } from "vitest";
import { buildPublishedContentPatterns } from "../../server/services/contentInvalidation";

// حادثة 2026-08-06: نشر عاجل واحد كان يمسح كاش تفاصيل كل المقالات (^article:)
// في نفس لحظة وصول طوفة نقرات الإشعار، فتتحول النقرات كلها إلى استعلامات DB
// باردة وتمتلئ البركة. هذه الاختبارات تثبّت عقد الإبطال الموجّه: مفاتيح المقال
// المكتوب وحده تُبطل، وبقية المقالات تحتفظ بكاشها الدافئ.

const matchesAny = (patterns: string[], key: string) =>
  patterns.some((p) => new RegExp(p).test(key));

describe("buildPublishedContentPatterns — targeted invalidation", () => {
  const id = "0e2b53fc-1111-2222-3333-444455556666";
  const slug = "محمية-الإمام-تركي";
  const englishSlug = "bauzi1y";
  const patterns = buildPublishedContentPatterns([id, slug, englishSlug]);

  it("always invalidates feed-style keys", () => {
    for (const key of [
      "homepage-lite",
      "homepage:0:0",
      "breaking-ticker-active",
      "articles:list:recent",
      "lite-feed",
      "mobile:sections",
      "news-paginated-total",
    ]) {
      expect(matchesAny(patterns, key), key).toBe(true);
    }
  });

  it("invalidates every key shape of the written article (id or slug embedded)", () => {
    for (const key of [
      `article:detail:anonymous:${englishSlug}`,
      `article:detail:anonymous:${slug}`,
      `article:mobile:${id}`,
      `article:mobile:${englishSlug}`,
      `article:comments:${englishSlug}`,
      `article:media-assets:${id}:all`,
      `article:views:${id}`,
      `article:reactions-count:${id}`,
      `article:passport:ar:${englishSlug}:p`,
      `sidebar:${id}`,
    ]) {
      expect(matchesAny(patterns, key), key).toBe(true);
    }
  });

  it("leaves OTHER articles' warm caches untouched", () => {
    for (const key of [
      "article:detail:anonymous:another-article",
      "article:mobile:99998888-aaaa-bbbb-cccc-ddddeeeeffff",
      "article:comments:some-other-slug",
      "sidebar:99998888-aaaa-bbbb-cccc-ddddeeeeffff",
      "article:views:99998888-aaaa-bbbb-cccc-ddddeeeeffff",
    ]) {
      expect(matchesAny(patterns, key), key).toBe(false);
    }
  });

  it("falls back to the blanket wipe when no tokens are given", () => {
    const blanket = buildPublishedContentPatterns([]);
    expect(matchesAny(blanket, "article:detail:anonymous:anything")).toBe(true);
    expect(matchesAny(blanket, "sidebar:whatever")).toBe(true);
    expect(matchesAny(blanket, "homepage-lite")).toBe(true);
  });

  it("escapes regex metacharacters in tokens", () => {
    const tricky = buildPublishedContentPatterns(["a.b+c(d)"]);
    expect(matchesAny(tricky, "article:detail:anonymous:a.b+c(d)")).toBe(true);
    expect(matchesAny(tricky, "article:detail:anonymous:aXb+c(d)")).toBe(false);
  });

  it("drops empty/nullish tokens instead of matching everything", () => {
    const fromEmpty = buildPublishedContentPatterns(["", undefined as any, null as any]);
    // بلا رموز صالحة ⇒ السلوك الشامل القديم، لا نمط `(?:)` يطابق كل شيء
    expect(matchesAny(fromEmpty, "article:detail:anonymous:anything")).toBe(true);
    const targeted = buildPublishedContentPatterns(["real-slug", ""]);
    expect(matchesAny(targeted, "article:detail:anonymous:other")).toBe(false);
    expect(matchesAny(targeted, "article:detail:anonymous:real-slug")).toBe(true);
  });
});
