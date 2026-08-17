import { describe, expect, it } from "vitest";
import { pickActiveRoundKey } from "../../server/services/pickActiveRound";

const rounds = [1, 2, 3, 4].map((n) => ({
  key: `Regular Season - ${n}`,
  label: `الجولة ${n}`,
}));

function fx(roundLabel: string, finished: boolean) {
  return { round: roundLabel, status: { finished } };
}

describe("pickActiveRoundKey", () => {
  it("returns null for an empty round list", () => {
    expect(pickActiveRoundKey([], "Regular Season - 1", [])).toBeNull();
  });

  it("falls back to apiCurrent when fixtures are missing", () => {
    expect(pickActiveRoundKey(rounds, "Regular Season - 2", [])).toBe("Regular Season - 2");
  });

  it("falls back to the first round when fixtures and apiCurrent are missing", () => {
    expect(pickActiveRoundKey(rounds, null, [])).toBe("Regular Season - 1");
  });

  it("keeps round 1 before the season starts (all unfinished)", () => {
    const fixtures = [
      fx("الجولة 1", false),
      fx("الجولة 1", false),
      fx("الجولة 2", false),
    ];
    expect(pickActiveRoundKey(rounds, "Regular Season - 1", fixtures)).toBe("Regular Season - 1");
  });

  it("advances to the next round after the current one finishes", () => {
    const fixtures = [
      fx("الجولة 1", true),
      fx("الجولة 1", true),
      fx("الجولة 2", false),
      fx("الجولة 2", false),
    ];
    // المزود ما زال يشير للجولة 1 — نتقدّم رغم ذلك
    expect(pickActiveRoundKey(rounds, "Regular Season - 1", fixtures)).toBe("Regular Season - 2");
  });

  it("stays on a round while any match is still unfinished", () => {
    const fixtures = [
      fx("الجولة 1", true),
      fx("الجولة 1", false),
      fx("الجولة 2", false),
    ];
    expect(pickActiveRoundKey(rounds, "Regular Season - 1", fixtures)).toBe("Regular Season - 1");
  });

  it("skips multiple finished rounds in one step", () => {
    const fixtures = [
      fx("الجولة 1", true),
      fx("الجولة 2", true),
      fx("الجولة 3", false),
    ];
    expect(pickActiveRoundKey(rounds, "Regular Season - 1", fixtures)).toBe("Regular Season - 3");
  });

  it("selects the first unpublished round after finished ones", () => {
    const fixtures = [fx("الجولة 1", true), fx("الجولة 2", true)];
    expect(pickActiveRoundKey(rounds, "Regular Season - 2", fixtures)).toBe("Regular Season - 3");
  });

  it("stays on the last round when the season is complete", () => {
    const fixtures = rounds.flatMap((r) => [fx(r.label, true), fx(r.label, true)]);
    expect(pickActiveRoundKey(rounds, "Regular Season - 4", fixtures)).toBe("Regular Season - 4");
  });
});
