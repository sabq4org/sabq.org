import { describe, expect, it } from "vitest";
import { tallyGcScorersFromFixtures } from "../../server/services/gulfCupScorerTally";

const team = (id: number) => ({ id, name: `T${id}`, logo: "" });
const goal = (
  playerId: number,
  name: string,
  teamId: number,
  minute: number,
  detail = "Normal Goal",
  assist?: { id: number; name: string },
) => ({
  type: "Goal",
  detail,
  time: { elapsed: minute, extra: null },
  team: { id: teamId },
  player: { id: playerId, name },
  assist: assist ?? { id: null, name: null },
});

// مطابقة لأحداث مباراة الإمارات 4-0 اليمن (خليجي 27) كما يعيدها المزوّد.
const uaeYemen = {
  fixture: { id: 1637930, timestamp: 1_790_000_000 },
  events: [
    goal(10, "N. Gimenez", 1563, 26, "Normal Goal", { id: 11, name: "Bruno" }),
    goal(20, "N. Sahal", 1563, 36, "Own Goal"),
    goal(12, "Luan Pereira", 1563, 45, "Normal Goal", { id: 10, name: "N. Gimenez" }),
    goal(10, "N. Gimenez", 1563, 51, "Penalty"),
    { type: "subst", detail: "Substitution 1", time: { elapsed: 62 }, team: { id: 1563 }, player: { id: 10, name: "N. Gimenez" } },
    { type: "Card", detail: "Yellow Card", time: { elapsed: 68 }, team: { id: 1563 }, player: { id: 13, name: "O. Camara" } },
  ],
};

const saudiKuwait = {
  fixture: { id: 1637929, timestamp: 1_789_900_000 },
  events: [
    goal(30, "S. Al Dawsari", 23, 70, "Normal Goal", { id: 31, name: "F. Al Buraikan" }),
    goal(40, "Y. Nasser", 1570, 80, "Missed Penalty"),
  ],
};

describe("tallyGcScorersFromFixtures — هدّافو النسخة الحالية من أحداث المباريات", () => {
  const board = tallyGcScorersFromFixtures([uaeYemen, saudiKuwait], (n) => `ع:${n}`, team);

  it("يستبعد الأهداف العكسية والركلات الضائعة ويحتسب ركلات الجزاء", () => {
    expect(board.scorers.map((s) => [s.id, s.goals])).toEqual([
      [10, 2],
      [12, 1], // تعادل في الأهداف والتمريرات: الأحدث تسجيلًا أولًا
      [30, 1],
    ]);
    expect(board.scorers[0].penalties).toBe(1);
    expect(board.scorers.find((s) => s.id === 20)).toBeUndefined();
    expect(board.scorers.find((s) => s.id === 40)).toBeUndefined();
  });

  it("يرتّب ويرقّم ويعرّب الأسماء ويبني الصور والمنتخب", () => {
    expect(board.scorers.map((s) => s.rank)).toEqual([1, 2, 3]);
    expect(board.scorers[0].name).toBe("ع:N. Gimenez");
    expect(board.scorers[0].photo).toBe("https://media.api-sports.io/football/players/10.png");
    expect(board.scorers[0].team).toEqual(team(1563));
  });

  it("يعدّ صنّاع الأهداف من حقل assist", () => {
    expect(board.assists.map((s) => [s.id, s.assists]).sort()).toEqual([
      [10, 1],
      [11, 1],
      [31, 1],
    ]);
    // صاحب الهدفين والتمريرة يتقدّم عند التعادل في التمريرات
    expect(board.assists[0].id).toBe(10);
  });

  it("يعيد لوحتين فارغتين حين لا توجد أهداف", () => {
    expect(tallyGcScorersFromFixtures([], (n) => n, team)).toEqual({ scorers: [], assists: [] });
    expect(tallyGcScorersFromFixtures(null as any, (n) => n, team)).toEqual({ scorers: [], assists: [] });
  });
});
