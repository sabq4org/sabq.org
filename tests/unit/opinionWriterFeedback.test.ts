import { describe, expect, it } from "vitest";
import {
  MAX_SUGGESTIONS_CHARS,
  countInterests,
  neutralizeSpreadsheetCell,
  validateOpinionWriterFeedback,
} from "../../shared/opinionWriterFeedback";

describe("validateOpinionWriterFeedback", () => {
  it("requires at least one known interest", () => {
    expect(validateOpinionWriterFeedback({ interests: [] }).ok).toBe(false);
    expect(validateOpinionWriterFeedback({ interests: ["hacking"] }).ok).toBe(false);
    expect(validateOpinionWriterFeedback(null).ok).toBe(false);
  });

  it("dedupes and orders by the list", () => {
    const r = validateOpinionWriterFeedback({ interests: ["local", "economy", "local"] });
    expect(r).toEqual({ ok: true, value: { interests: ["economy", "local"], otherInterest: null, suggestions: null } });
  });

  it("rejects instead of silently dropping (REVIEW.md A4)", () => {
    const code = (body: unknown) => {
      const r = validateOpinionWriterFeedback(body);
      return r.ok ? "ok" : r.code;
    };
    expect(code({ interests: ["local", "x"] })).toBe("INVALID_INTEREST");
    expect(code({ interests: ["local"], role: "admin" })).toBe("UNKNOWN_FIELD");
    expect(code({ interests: ["local"], suggestions: 5 })).toBe("INVALID_FIELD_TYPE");
    expect(code({ interests: "local" })).toBe("INVALID_INTEREST");
    expect(code([])).toBe("INVALID_BODY");
  });

  it("needs text when «أخرى» is picked, and ignores it otherwise", () => {
    expect(validateOpinionWriterFeedback({ interests: ["other"], otherInterest: "  " }).ok).toBe(false);
    const withOther = validateOpinionWriterFeedback({ interests: ["other"], otherInterest: " البيئة " });
    expect(withOther.ok && withOther.value.otherInterest).toBe("البيئة");
    const stray = validateOpinionWriterFeedback({ interests: ["social"], otherInterest: "البيئة" });
    expect(!stray.ok && stray.code).toBe("OTHER_INTEREST_WITHOUT_OTHER");
    const nullOther = validateOpinionWriterFeedback({ interests: ["social"], otherInterest: null });
    expect(nullOther.ok && nullOther.value.otherInterest).toBeNull();
  });

  it("trims and caps suggestions", () => {
    const r = validateOpinionWriterFeedback({ interests: ["culture"], suggestions: "x".repeat(MAX_SUGGESTIONS_CHARS + 50) });
    expect(r.ok && r.value.suggestions?.length).toBe(MAX_SUGGESTIONS_CHARS);
    const empty = validateOpinionWriterFeedback({ interests: ["culture"], suggestions: "   " });
    expect(empty.ok && empty.value.suggestions).toBeNull();
  });
});

describe("countInterests", () => {
  it("counts each interest across writers, ignoring unknown ids", () => {
    const counts = countInterests([
      { interests: ["economy", "local"] },
      { interests: ["economy"] },
      { interests: ["bogus"] },
    ]);
    expect(counts.economy).toBe(2);
    expect(counts.local).toBe(1);
    expect(counts.psychology).toBe(0);
    expect("bogus" in counts).toBe(false);
  });
});

describe("neutralizeSpreadsheetCell", () => {
  it("prefixes formula starters and leaves normal text", () => {
    expect(neutralizeSpreadsheetCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(neutralizeSpreadsheetCell("+966")).toBe("'+966");
    expect(neutralizeSpreadsheetCell("@x")).toBe("'@x");
    expect(neutralizeSpreadsheetCell("ورشة")).toBe("ورشة");
  });
});
