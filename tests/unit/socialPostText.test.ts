import { describe, expect, it } from "vitest";
import {
  composeXPostText,
  validateXPostText,
  xWeightedLength,
  X_MAX_WEIGHTED_LENGTH,
  X_URL_WEIGHT,
} from "../../shared/socialPostText";

describe("socialPostText — العد الموزون لمنصة X", () => {
  it("يحسب الحرف العربي واللاتيني بوزن 1", () => {
    expect(xWeightedLength("مرحبا")).toBe(5);
    expect(xWeightedLength("hello")).toBe(5);
    expect(xWeightedLength("خبر عاجل: hello")).toBe(15);
  });

  it("يحسب الإيموجي بوزن 2", () => {
    expect(xWeightedLength("😀")).toBe(2);
    expect(xWeightedLength("ا😀ب")).toBe(4);
  });

  it("يحسب أي رابط بوزن ثابت 23 مهما طال", () => {
    const short = "https://x.co/a";
    const long = `https://sabq.org/article/${"x".repeat(300)}`;
    expect(xWeightedLength(short)).toBe(X_URL_WEIGHT);
    expect(xWeightedLength(long)).toBe(X_URL_WEIGHT);
    expect(xWeightedLength(`اقرأ ${long}`)).toBe(5 + X_URL_WEIGHT);
  });

  it("يحسب عدة روابط كلاً بوزن 23", () => {
    expect(xWeightedLength("https://a.com/x https://b.com/y")).toBe(23 + 1 + 23);
  });

  it("يركب النص والرابط بسطر جديد", () => {
    expect(composeXPostText("خبر", "https://sabq.org/a")).toBe("خبر\nhttps://sabq.org/a");
    expect(composeXPostText("  خبر  ", null)).toBe("خبر");
    expect(composeXPostText("", "https://sabq.org/a")).toBe("https://sabq.org/a");
  });

  it("نص عربي بطول 280 بالضبط صالح، و281 مرفوض", () => {
    const exact = "ا".repeat(X_MAX_WEIGHTED_LENGTH);
    expect(validateXPostText(exact).valid).toBe(true);
    expect(validateXPostText(exact + "ا").valid).toBe(false);
  });

  it("مع الرابط: الحد الفعلي للنص 256 حرفاً (23 للرابط + 1 لسطر جديد)", () => {
    const link = "https://sabq.org/article/some-slug";
    const okText = "ا".repeat(256);
    const tooLong = "ا".repeat(257);
    expect(validateXPostText(okText, link).valid).toBe(true);
    expect(validateXPostText(okText, link).weightedLength).toBe(280);
    expect(validateXPostText(tooLong, link).valid).toBe(false);
  });

  it("النص الفارغ غير صالح ويُعلَّم empty", () => {
    const v = validateXPostText("   ");
    expect(v.empty).toBe(true);
    expect(v.valid).toBe(false);
  });

  it("remaining يعكس المتبقي بدقة (نص مختلط عربي/إنجليزي)", () => {
    const v = validateXPostText("خبر hello");
    expect(v.weightedLength).toBe(9);
    expect(v.remaining).toBe(X_MAX_WEIGHTED_LENGTH - 9);
  });
});
