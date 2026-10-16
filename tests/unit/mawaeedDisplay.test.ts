import { describe, expect, it } from "vitest";
import { compactOccurrenceTitle, compactServiceOccurrenceTitle, stripDisplayedSourceSentence } from "../../shared/mawaeed/display";

describe("compactOccurrenceTitle", () => {
  it("removes the matching salary month and year", () => {
    expect(compactOccurrenceTitle("الرواتب — أكتوبر2026", "2026-10-27")).toBe("الرواتب");
  });

  it("keeps the payment number while removing a parenthesized matching month", () => {
    expect(compactOccurrenceTitle("حساب المواطن — الدفعة 108 (نوفمبر 2026)", "2026-11-10"))
      .toBe("حساب المواطن — الدفعة 108");
  });

  it("keeps a different month and pension range", () => {
    expect(compactOccurrenceTitle("التقاعد — من نوفمبر 2026 إلى يناير 2027", "2026-10-25"))
      .toBe("التقاعد — من نوفمبر 2026 إلى يناير 2027");
    expect(compactOccurrenceTitle("التقاعد — من نوفمبر 2026 إلى يناير 2027", "2026-11-25"))
      .toBe("التقاعد — من نوفمبر 2026 إلى يناير 2027");
  });

  it("removes the context-free pension suffix only with a matching month", () => {
    expect(compactOccurrenceTitle("الضمان الاجتماعي المطور — معاش (أكتوبر 2026)", "2026-10-01"))
      .toBe("الضمان الاجتماعي المطور");
    expect(compactOccurrenceTitle("الضمان الاجتماعي المطور — معاش (نوفمبر 2026)", "2026-10-01"))
      .toBe("الضمان الاجتماعي المطور — معاش (نوفمبر 2026)");
  });

  it("does not strip a school title's year when it is not a month-year suffix", () => {
    expect(compactOccurrenceTitle("إجازة الخريف 1448", "2026-11-22")).toBe("إجازة الخريف 1448");
  });

  it("keeps only service-specific row details", () => {
    expect(compactServiceOccurrenceTitle("رواتب موظفي الدولة — أكتوبر 2026", "2026-10-27", "salary")).toBe("");
    expect(compactServiceOccurrenceTitle("حساب المواطن — الدفعة 108 (نوفمبر 2026)", "2026-11-10", "citizen"))
      .toBe("الدفعة 108");
    expect(compactServiceOccurrenceTitle("معاشات التقاعد المدني والعسكري والتأمينات — نوفمبر 2026", "2026-11-01", "pension"))
      .toBe("المدني والعسكري والتأمينات");
  });

  it("removes only explicit source sentences from displayed FAQ text", () => {
    expect(stripDisplayedSourceSentence("يُصرف يوم 27. المصدر: وزارة المالية — جدول 2026."))
      .toBe("يُصرف يوم 27.");
    expect(stripDisplayedSourceSentence("تحدد وزارة المالية قاعدة الصرف الرسمية."))
      .toBe("تحدد وزارة المالية قاعدة الصرف الرسمية.");
  });
});
