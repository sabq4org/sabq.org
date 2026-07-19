import { describe, expect, it } from "vitest";
import {
  collectGroundedNumbers,
  findBannedSnapTerms,
  findUngroundedNumbers,
  validateNeutralLanguage,
  validateNumbersAreGrounded,
  validateSnapCandidate,
} from "../../server/services/sportsSnaps/guardrails";

describe("sports snaps guardrails — neutral language", () => {
  it("rejects banned escalation terms after Arabic normalization", () => {
    expect(findBannedSnapTerms("سحق الفريق منافسه بثلاثية")).toContain("سحق");
    expect(findBannedSnapTerms("صياغة فيها إذلال واضح")).toContain("اذلال");
    expect(findBannedSnapTerms("حديث عن حرب ومعركة كروية")).toEqual(
      expect.arrayContaining(["حرب", "معركة"]),
    );
  });

  it("accepts calm sports wording", () => {
    const result = validateNeutralLanguage("غدًا 21:00: النصر يواجه الأهلي في الجولة 3");
    expect(result.ok).toBe(true);
  });
});

describe("sports snaps guardrails — grounded numbers", () => {
  const sourceStats = {
    kickoffLocalTime: "21:00",
    round: 3,
    recentResults: [
      { homeGoals: 1, awayGoals: 1 },
      { homeGoals: 2, awayGoals: 0 },
    ],
  };

  it("collects western and Arabic-Indic numerals from source stats", () => {
    const numbers = collectGroundedNumbers({ round: "٣", kickoff: "٢١:٠٠" });
    expect(numbers.has("3")).toBe(true);
    expect(numbers.has("21:00")).toBe(true);
    expect(numbers.has("21")).toBe(true);
  });

  it("accepts numbers that are present in sourceStats", () => {
    const result = validateNumbersAreGrounded(
      "غدًا 21:00 في الجولة 3، وآخر نتيجة كانت 1-1",
      sourceStats,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects invented numbers", () => {
    const missing = findUngroundedNumbers("فاز في آخر 5 مباريات", sourceStats);
    expect(missing).toEqual(["5"]);
  });
});

describe("sports snaps guardrails — candidate structure", () => {
  it("accepts a valid phase-one snap candidate", () => {
    const result = validateSnapCandidate(
      {
        kind: "upcoming_match",
        headline: "موعد قريب",
        body: "غدًا 21:00: الهلال يواجه الاتحاد في الجولة 3",
        accent: "green",
      },
      { kickoff: "21:00", round: 3 },
    );
    expect(result.ok).toBe(true);
  });

  it("reports structural, language, and grounding failures together", () => {
    const result = validateSnapCandidate(
      {
        kind: "unknown_kind",
        headline: "x".repeat(61),
        body: "سحق منافسه بنتيجة 5-0",
        accent: "blue",
      } as any,
      { knownScore: "1-0" },
    );

    expect(result.ok).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "invalid_kind",
        "invalid_accent",
        "headline_too_long",
        "banned_terms",
        "ungrounded_numbers",
      ]),
    );
    expect(result.bannedTerms).toContain("سحق");
    expect(result.missingNumbers).toEqual(["5"]);
  });
});
