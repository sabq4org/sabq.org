import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const flushImmediate = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("sanitizeArticleHtml", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(async () => {
    await flushImmediate();
    vi.restoreAllMocks();
    vi.doUnmock("isomorphic-dompurify");
  });

  it("removes executable HTML while preserving article markup", async () => {
    const { sanitizeArticleHtml } = await import("../../server/utils/sanitizeHtml");
    const dirty = [
      '<p class="lead" style="color:red" onclick="alert(1)">نص <strong>مهم</strong></p>',
      '<a href="javascript:alert(2)" data-track="x">رابط</a>',
      '<img src="/safe.jpg" onerror=alert(3)>',
      '<script>alert(4)</script><svg><script>alert(5)</script></svg>',
    ].join("");

    const clean = sanitizeArticleHtml(dirty);

    expect(clean).toContain('<p class="lead">نص <strong>مهم</strong></p>');
    expect(clean).toContain('<a>رابط</a>');
    expect(clean).toContain('<img src="/safe.jpg">');
    expect(clean).not.toMatch(/style|onclick|onerror|javascript:|script|svg|data-track/i);
  });

  it("preserves qa-block and sabq-table markup (class-based editor blocks)", async () => {
    const { sanitizeArticleHtml } = await import("../../server/utils/sanitizeHtml");
    const qaAndTable = [
      '<div class="qa-block">',
      '<div class="qa-q"><span class="qa-mark" aria-hidden="true">س</span><div class="qa-q-text">ما التخصصات المطلوبة؟</div></div>',
      '<div class="qa-a"><p>الأمن السيبراني والذكاء الاصطناعي.</p></div>',
      "</div>",
      '<table class="sabq-table sabq-table--card"><tbody>',
      "<tr><th><p>المسار</p></th><th><p>الدبلومات</p></th></tr>",
      "<tr><td><p>التقني</p></td><td><p>الذكاء الاصطناعي، الأمن السيبراني</p></td></tr>",
      "</tbody></table>",
    ].join("");

    const clean = sanitizeArticleHtml(qaAndTable);

    // بنية سؤال/جواب كاملة مع الـclasses
    expect(clean).toContain('class="qa-block"');
    expect(clean).toContain('class="qa-mark"');
    expect(clean).toContain('class="qa-q-text"');
    expect(clean).toContain('class="qa-a"');
    expect(clean).toContain("ما التخصصات المطلوبة؟");
    // الجدول مع مظهر البطاقة
    expect(clean).toContain('class="sabq-table sabq-table--card"');
    expect(clean).toContain("<td><p>التقني</p></td>");
  });

  it("coalesces multiple sanitizations into one Window reset per event-loop turn", async () => {
    const sanitize = vi.fn((html: string) => html);
    const clearWindow = vi.fn();
    vi.doMock("isomorphic-dompurify", () => ({ sanitize, clearWindow }));

    const { sanitizeArticleHtml } = await import("../../server/utils/sanitizeHtml");
    expect(sanitizeArticleHtml("<p>one</p>")).toBe("<p>one</p>");
    expect(sanitizeArticleHtml("<p>two</p>")).toBe("<p>two</p>");
    expect(clearWindow).not.toHaveBeenCalled();

    await flushImmediate();

    expect(sanitize).toHaveBeenCalledTimes(2);
    expect(clearWindow).toHaveBeenCalledTimes(1);
  });

  it("schedules cleanup even when sanitization throws", async () => {
    const sanitize = vi.fn(() => {
      throw new Error("parser failure");
    });
    const clearWindow = vi.fn();
    vi.doMock("isomorphic-dompurify", () => ({ sanitize, clearWindow }));

    const { sanitizeArticleHtml } = await import("../../server/utils/sanitizeHtml");
    expect(() => sanitizeArticleHtml("<p>bad</p>")).toThrow("parser failure");

    await flushImmediate();
    expect(clearWindow).toHaveBeenCalledTimes(1);
  });
});
