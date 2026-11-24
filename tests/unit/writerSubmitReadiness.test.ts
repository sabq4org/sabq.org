import { describe, expect, it } from "vitest";
import {
  buildWriterReadiness,
  findQuotedPassage,
  formatWriterSlot,
  readingMinutes,
  summarizeWriterReadiness,
  WRITER_TITLE_APP_LIMIT,
} from "../../client/src/lib/writerSubmitReadiness";

describe("writer submit readiness", () => {
  it("marks a complete article as ready", () => {
    const items = buildWriterReadiness({
      title: "التعليم المهني ليس خيارًا ثانيًا",
      hasImage: true,
      words: 640,
      slotMissing: false,
      slotLabel: "الثلاثاء 9:00 ص",
    });
    expect(summarizeWriterReadiness(items)).toMatchObject({ done: 4, total: 4, firstMissing: null });
    expect(items.find((i) => i.id === "text")?.detail).toBe("640 كلمة، 4 د قراءة");
    expect(items.find((i) => i.id === "slot")?.detail).toBe("الثلاثاء 9:00 ص");
  });

  it("puts the blocking weekly slot first among missing items", () => {
    const items = buildWriterReadiness({ title: "", hasImage: false, words: 120, slotMissing: true });
    const summary = summarizeWriterReadiness(items);
    expect(summary.done).toBe(0);
    expect(summary.firstMissing?.id).toBe("slot");
    expect(items.find((i) => i.id === "slot")).toMatchObject({ blocking: true, action: "pick-day" });
  });

  it("warns when the title is too long for the app card", () => {
    const items = buildWriterReadiness({
      title: "ع".repeat(WRITER_TITLE_APP_LIMIT + 5),
      hasImage: true,
      words: 400,
      slotMissing: false,
    });
    const title = items.find((i) => i.id === "title");
    expect(title?.ok).toBe(false);
    expect(title?.blocking).toBe(false);
  });

  it("computes reading minutes like the editor", () => {
    expect(readingMinutes(0)).toBe(0);
    expect(readingMinutes(1)).toBe(1);
    expect(readingMinutes(401)).toBe(3);
  });

  it("formats the weekly slot in 12-hour Arabic", () => {
    expect(formatWriterSlot(2, "09:00")).toBe("الثلاثاء 9:00 ص");
    expect(formatWriterSlot(0, "21:30")).toBe("الأحد 9:30 م");
    expect(formatWriterSlot(4, "12:00")).toBe("الخميس 12:00 م");
    expect(formatWriterSlot(null, "09:00")).toBeNull();
  });

  it("finds the quoted passage from the editor note in the text", () => {
    const text = "المقدمة هنا. ارتفعت البطالة بين الخريجين إلى أرقام قياسية في العام الماضي. والخاتمة.";
    const notes = "يرجى توثيق الرقم في «ارتفعت البطالة بين الخريجين إلى أرقام قياسية» بمصدر.";
    expect(findQuotedPassage(notes, text)).toBe("ارتفعت البطالة بين الخريجين إلى أرقام قياسية");
    expect(findQuotedPassage("ملاحظة عامة بلا اقتباس", text)).toBeNull();
    expect(findQuotedPassage("«جملة غير موجودة في المقال إطلاقًا»", text)).toBeNull();
  });

  it("ignores tashkeel when matching the quote", () => {
    const text = "إنَّ التعليمَ المهنيَّ ضرورةٌ";
    expect(findQuotedPassage("«إن التعليم المهني ضرورة»", text)).toBe("إن التعليم المهني ضرورة");
  });
});
