import { afterEach, describe, expect, it, vi } from "vitest";
import { formatArticleTimestamp } from "../../client/src/lib/formatTime";

afterEach(() => vi.useRealTimers());
describe("public article time", () => {
  it("uses Arabic singular, dual and plural consistently", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-10T21:00:00Z"));
    expect(formatArticleTimestamp("2026-09-10T20:59:00Z")).toBe("منذ دقيقة");
    expect(formatArticleTimestamp("2026-09-10T20:58:00Z")).toBe("منذ دقيقتين");
    expect(formatArticleTimestamp("2026-09-10T20:54:00Z")).toBe("منذ 6 دقائق");
    expect(formatArticleTimestamp("2026-09-10T19:00:00Z")).toBe("منذ ساعتين");
  });
  it("preserves Riyadh day rollover and Gregorian Latin year", () => {
    const date = formatArticleTimestamp("2026-09-10T22:00:00Z", { format: "absolute" });
    expect(date).toContain("11"); expect(date).toContain("سبتمبر"); expect(date).toContain("2026");
  });
  it("uses Urdu for Urdu metadata and English for English", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-10T21:00:00Z"));
    expect(formatArticleTimestamp("2026-09-10T20:54:00Z", { locale: "en" })).toBe("6 minutes ago");
    const urdu = formatArticleTimestamp("2026-09-10T20:54:00Z", { locale: "ur" });
    expect(urdu).toMatch(/[\u0600-\u06ff]/); expect(urdu).not.toMatch(/minutes|ago/);
  });
  it("invalid or missing dates never crash a card", () => {
    expect(() => formatArticleTimestamp("not-a-date")).not.toThrow();
    expect(() => formatArticleTimestamp(null)).not.toThrow();
  });
});
