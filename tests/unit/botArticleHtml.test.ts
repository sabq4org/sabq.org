import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/rbac", () => ({ logActivity: vi.fn() }));
vi.mock("../../server/memoryCache", () => ({ memoryCache: { invalidatePattern: vi.fn(), delete: vi.fn() }, CACHE_TTL: {} }));

import { cleanBotArticleHtml, dropEmptyParagraphs, isCleanupOnlyChange, stripRedundantRtlAlign } from "../../server/utils/botArticleHtml";
import { normalizeDraftContent } from "../../server/services/botDraftsService";

const real = readFileSync(new URL("../fixtures/opinion_empty_nbsp_paragraph.html", import.meta.url), "utf8");

describe("cleanBotArticleHtml", () => {
  it("real opinion article b9b38df6: drops the empty &nbsp; paragraph and the redundant text-align, keeps all text", () => {
    const out = cleanBotArticleHtml(real);
    const paragraphs = (html: string) => [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map((m) => m[1]);
    expect(real.match(/<p /g)).toHaveLength(12);
    expect(out.match(/<p>/g)).toHaveLength(11);
    expect(out).not.toMatch(/style=|text-align|<p[^>]*>(?:\s|&nbsp;)*<\/p>/);
    // كل النص الأصلي محفوظ حرفياً (الفقرة الفارغة وحدها سقطت)
    expect(paragraphs(out)).toEqual(paragraphs(real).filter((p) => p.replace(/&nbsp;/g, "").trim() !== ""));
    expect(out).toContain("&nbsp;رابعاً"); // &nbsp; داخل فقرة بها نص لا يُمسّ
  });
  it("is idempotent", () => {
    const once = cleanBotArticleHtml(real);
    expect(cleanBotArticleHtml(once)).toBe(once);
  });
  it("drops <p></p>, <p> </p>, <p><br></p>, <p><br class=…></p> but keeps paragraphs with images or text", () => {
    const html = '<p>أ</p><p></p><p> </p><p><br></p><p><br class="ProseMirror-trailingBreak"></p><p><img src="https://x.test/a.jpg"></p><p><a href="/x"></a></p><p>ب</p>';
    expect(dropEmptyParagraphs(html)).toBe('<p>أ</p><p><img src="https://x.test/a.jpg"></p><p><a href="/x"></a></p><p>ب</p>');
  });
  it("strips only text-align right/start; keeps center/left/justify and other declarations; respects dir", () => {
    expect(stripRedundantRtlAlign('<p style="text-align: right">a</p>')).toBe("<p>a</p>");
    expect(stripRedundantRtlAlign("<p style='text-align:start !important'>a</p>")).toBe("<p>a</p>");
    expect(stripRedundantRtlAlign('<p style="color: red; text-align: right">a</p>')).toBe('<p style="color: red">a</p>');
    expect(stripRedundantRtlAlign('<h2 class="t" style="text-align: right">a</h2>')).toBe('<h2 class="t">a</h2>');
    expect(stripRedundantRtlAlign('<p style="text-align: center">a</p>')).toBe('<p style="text-align: center">a</p>');
    expect(stripRedundantRtlAlign('<p style="text-align: justify">a</p>')).toBe('<p style="text-align: justify">a</p>');
    expect(stripRedundantRtlAlign('<p dir="ltr" style="text-align: right">a</p>')).toBe('<p dir="ltr" style="text-align: right">a</p>');
    expect(stripRedundantRtlAlign('<span style="text-align: right">a</span>')).toBe('<span style="text-align: right">a</span>');
  });
  it("rtl:false (English) keeps text-align but still drops empty paragraphs", () => {
    expect(cleanBotArticleHtml('<p style="text-align: right">a</p><p>&nbsp;</p>', { rtl: false })).toBe('<p style="text-align: right">a</p>');
  });
});

describe("normalizeDraftContent applies the cleanup on every bot save path", () => {
  it("html: cleaned; plain text: unchanged behaviour", () => {
    expect(normalizeDraftContent('<p style="text-align: right">الفقرة الأولى من المقال</p><p>&nbsp;</p><p>الفقرة الثانية من المقال</p>', "html"))
      .toBe("<p>الفقرة الأولى من المقال</p><p>الفقرة الثانية من المقال</p>");
    expect(normalizeDraftContent("الأولى\n\nالثانية")).toBe("<p>الأولى</p>\n<p>الثانية</p>");
    expect(normalizeDraftContent('<p style="text-align: right">a</p>', "html", undefined, { rtl: false })).toBe('<p style="text-align: right">a</p>');
  });
});

describe("isCleanupOnlyChange", () => {
  const a = '<p style="text-align: right">نص</p><p>&nbsp;</p><p><img src="https://x.test/a.jpg"></p>';
  it("true for the known cleanup only (empty paragraph, redundant text-align, whitespace)", () => {
    expect(isCleanupOnlyChange(a, '<p>نص</p>\n<p><img src="https://x.test/a.jpg"></p>')).toBe(true);
    expect(isCleanupOnlyChange(real, cleanBotArticleHtml(real))).toBe(true);
  });
  it("false when an image is swapped or added, or a link/text changes, even if the plain text is identical", () => {
    expect(isCleanupOnlyChange(a, '<p>نص</p><p><img src="https://x.test/b.jpg"></p>')).toBe(false);
    expect(isCleanupOnlyChange(a, '<p>نص</p><p><img src="https://x.test/a.jpg"></p><p><img src="https://x.test/c.jpg"></p>')).toBe(false);
    expect(isCleanupOnlyChange('<p><a href="/x">نص</a></p>', '<p><a href="/y">نص</a></p>')).toBe(false);
    expect(isCleanupOnlyChange('<p>نص</p>', '<p>نص آخر</p>')).toBe(false);
    expect(isCleanupOnlyChange('<p>نص</p>', '<p style="text-align: center">نص</p>')).toBe(false);
  });
  it("ignores presentational attributes the sanitizer adds to an unchanged image (class/style/data-align)", () => {
    expect(isCleanupOnlyChange('<p><img src="https://x.test/a.jpg" alt="ص"></p>', '<p><img src="https://x.test/a.jpg" alt="ص" data-align="center" class="sabq-article-image" style="width: 100%"></p>')).toBe(true);
    expect(isCleanupOnlyChange('<p><img src="https://x.test/a.jpg" alt="ص"></p>', '<p><img src="https://x.test/a.jpg" alt="غيره"></p>')).toBe(false);
  });
  it("false for non-string input", () => {
    expect(isCleanupOnlyChange(null, "<p>x</p>")).toBe(false);
  });
});
