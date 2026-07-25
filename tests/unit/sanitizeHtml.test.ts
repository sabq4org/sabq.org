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
