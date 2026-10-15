import { describe, expect, it } from "vitest";
import {
  kickoffDayAr,
  kickoffTimeAr,
  lockCountdownAr,
} from "../../client/src/components/predictions/predictionTypes";

const ARABIC_INDIC = /[٠-٩۰-۹]/;

function stripIsolates(value: string): string {
  return value.replace(/[\u2066\u2069]/g, "");
}

describe("prediction display numerals", () => {
  it("formats kickoff time in Riyadh with Latin digits", () => {
    const time = kickoffTimeAr("2026-09-23T18:00:00.000Z");
    expect(time).not.toMatch(ARABIC_INDIC);
    expect(time).toMatch(/0?9:00/);
    expect(time).toContain("م");
  });

  it("formats kickoff day with Latin digits and Gregorian month", () => {
    const day = kickoffDayAr("2026-09-23T18:00:00.000Z");
    expect(day).not.toMatch(ARABIC_INDIC);
    expect(day).toContain("23");
    expect(day).toContain("سبتمبر");
  });

  it("formats the lock countdown with Latin digits", () => {
    const now = Date.parse("2026-09-23T12:00:00.000Z");
    const locksAt = "2026-09-23T18:15:00.000Z";
    const countdown = lockCountdownAr(locksAt, now);
    expect(countdown).toBeTruthy();
    expect(countdown).not.toMatch(ARABIC_INDIC);
    expect(stripIsolates(countdown!)).toBe("يُقفل بعد 6س 15د");
  });
});
