import { describe, expect, it } from "vitest";
import { pickTsDiaryMatch } from "../../server/services/theSportsService";

const COMP = "j1l4rjnh66nm7vx";
const KICK = 1_786_644_000;

function row(over: { id: string; time?: number; home?: string; away?: string }) {
  return {
    id: over.id,
    competition_id: COMP,
    match_time: over.time ?? KICK,
    home_team_id: over.home ?? "home-a",
    away_team_id: over.away ?? "away-a",
  };
}

describe("pickTsDiaryMatch", () => {
  it("returns the unique kickoff in the competition", () => {
    expect(pickTsDiaryMatch([row({ id: "only" })], COMP, KICK)).toBe("only");
  });

  it("refuses to guess among simultaneous Roshn kickoffs without team ids", () => {
    const day = [
      row({ id: "m1", home: "ahli", away: "diriyah" }),
      row({ id: "m2", home: "hilal", away: "nassr" }),
    ];
    expect(pickTsDiaryMatch(day, COMP, KICK)).toBeNull();
  });

  it("disambiguates simultaneous kickoffs by home/away team uuids", () => {
    const day = [
      row({ id: "m1", home: "ahli", away: "diriyah" }),
      row({ id: "m2", home: "hilal", away: "nassr" }),
    ];
    expect(
      pickTsDiaryMatch(day, COMP, KICK, { homeTsId: "ahli", awayTsId: "diriyah" }),
    ).toBe("m1");
  });

  it("returns null when team ids do not match any simultaneous row", () => {
    const day = [
      row({ id: "m1", home: "ahli", away: "diriyah" }),
      row({ id: "m2", home: "hilal", away: "nassr" }),
    ];
    expect(
      pickTsDiaryMatch(day, COMP, KICK, { homeTsId: "ittihad", awayTsId: "shabab" }),
    ).toBeNull();
  });
});
