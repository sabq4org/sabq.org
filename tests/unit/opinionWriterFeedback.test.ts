import { describe, expect, it } from "vitest";
import {
  MAX_SUGGESTIONS_CHARS,
  countInterests,
  validateOpinionWriterFeedback,
} from "../../shared/opinionWriterFeedback";

describe("validateOpinionWriterFeedback", () => {
  it("requires at least one known interest", () => {
    expect(validateOpinionWriterFeedback({ interests: [] }).ok).toBe(false);
    expect(validateOpinionWriterFeedback({ interests: ["hacking"] }).ok).toBe(false);
    expect(validateOpinionWriterFeedback(null).ok).toBe(false);
  });

  it("drops unknown ids and duplicates, and orders by the list", () => {
    const r = validateOpinionWriterFeedback({ interests: ["local", "economy", "local", "x"] });
    expect(r).toEqual({ ok: true, value: { interests: ["economy", "local"], otherInterest: null, suggestions: null } });
  });

  it("needs text when «أخرى» is picked, and ignores it otherwise", () => {
    expect(validateOpinionWriterFeedback({ interests: ["other"], otherInterest: "  " }).ok).toBe(false);
    const withOther = validateOpinionWriterFeedback({ interests: ["other"], otherInterest: " البيئة " });
    expect(withOther.ok && withOther.value.otherInterest).toBe("البيئة");
    const ignored = validateOpinionWriterFeedback({ interests: ["social"], otherInterest: "البيئة" });
    expect(ignored.ok && ignored.value.otherInterest).toBeNull();
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
