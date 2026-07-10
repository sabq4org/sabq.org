import { describe, it, expect } from "vitest";
import {
  integerToArabicWords,
  yearToArabicWords,
  normalizeTextForTts,
} from "../../server/utils/arabicTtsNormalize";

describe("integerToArabicWords", () => {
  it("handles zero and small numbers", () => {
    expect(integerToArabicWords(0)).toBe("صفر");
    expect(integerToArabicWords(5)).toBe("خمسة");
    expect(integerToArabicWords(11)).toBe("أحد عشر");
    expect(integerToArabicWords(21)).toBe("واحد وعشرون");
  });

  it("handles hundreds and thousands", () => {
    expect(integerToArabicWords(100)).toBe("مائة");
    expect(integerToArabicWords(250)).toBe("مائتان وخمسون");
    expect(integerToArabicWords(1000)).toBe("ألف");
    expect(integerToArabicWords(2000)).toBe("ألفان");
    expect(integerToArabicWords(1500)).toBe("ألف وخمسمائة");
  });

  it("handles millions", () => {
    expect(integerToArabicWords(1_000_000)).toBe("مليون");
    expect(integerToArabicWords(3_000_000)).toBe("ثلاثة ملايين");
  });
});

describe("yearToArabicWords", () => {
  it("reads 20xx as ألفين + remainder", () => {
    expect(yearToArabicWords(2026)).toBe("ألفين وستة وعشرين");
    expect(yearToArabicWords(2000)).toBe("ألفين");
  });
});

describe("normalizeTextForTts", () => {
  it("converts Eastern Arabic digits then verbalizes", () => {
    const out = normalizeTextForTts("ارتفع المؤشر ١٥٪ اليوم");
    expect(out).toContain("بالمئة");
    expect(out).not.toMatch(/[0-9٠-٩]/);
  });

  it("verbalizes percentages", () => {
    expect(normalizeTextForTts("نمو 15% في السوق")).toContain("خمسة عشر بالمئة");
  });

  it("verbalizes ISO dates", () => {
    const out = normalizeTextForTts("صدر القرار في 2026-07-10");
    expect(out).toContain("يوليو");
    expect(out).toContain("ألفين");
    expect(out).not.toMatch(/\d/);
  });

  it("verbalizes day/month/year dates", () => {
    const out = normalizeTextForTts("الموعد 10/7/2026");
    expect(out).toContain("يوليو");
  });

  it("verbalizes times", () => {
    const out = normalizeTextForTts("تبدأ المباراة الساعة 14:30");
    expect(out).toContain("والنصف");
    expect(out).toContain("مساءً");
  });

  it("verbalizes currency", () => {
    const out = normalizeTextForTts("بلغت القيمة 1,250 ريال");
    expect(out).toContain("ريال");
    expect(out).toContain("ألف");
    expect(out).not.toMatch(/\d/);
  });

  it("verbalizes number + مليون already in text", () => {
    const out = normalizeTextForTts("استثمار 3.5 مليون دولار");
    expect(out).toContain("ثلاثة فاصلة خمسة مليون");
  });

  it("reads long digit IDs individually", () => {
    const out = normalizeTextForTts("الرقم المرجعي 0501234567");
    expect(out).toContain("صفر");
    expect(out).toContain("خمسة");
  });

  it("skips verbalization for English language", () => {
    const out = normalizeTextForTts("Growth of 15% in 2026", { language: "en" });
    expect(out).toContain("15%");
    expect(out).toContain("2026");
  });

  it("auto-skips mostly Latin text", () => {
    const out = normalizeTextForTts("Sabq reports 15% growth", { language: "auto" });
    expect(out).toContain("15%");
  });

  it("is idempotent on already-verbalized Arabic", () => {
    const once = normalizeTextForTts("ارتفع بنسبة 12%");
    const twice = normalizeTextForTts(once);
    expect(twice).toBe(once);
  });
});
