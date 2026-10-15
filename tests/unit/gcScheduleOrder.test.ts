import { describe, expect, it } from "vitest";
import { groupFixturesByDay, SAUDI_TEAM_ID, type GcFixture } from "@/components/gulfcup/gcTypes";

function fx(matchNo: number, date: string, homeId: number, awayId: number, code = "NS"): GcFixture {
  const ts = Math.floor(new Date(date).getTime() / 1000);
  return {
    id: 1000 + matchNo,
    matchNo,
    date,
    timestamp: code === "TBD" ? 0 : ts,
    status: { code, label: "", elapsed: null, live: false, finished: false },
    round: "الجولة الثانية",
    roundEn: "",
    venue: { name: "", city: "" },
    home: { id: homeId, name: String(homeId), logo: "" },
    away: { id: awayId, name: String(awayId), logo: "" },
    goals: { home: null, away: null },
  };
}

const order = (fixtures: GcFixture[]) =>
  groupFixturesByDay(fixtures).map((d) => [d.key, d.items.map((f) => f.matchNo)]);

describe("groupFixturesByDay — ترتيب زمني تصاعدي بتوقيت الرياض", () => {
  it("لا تتقدّم مباراة السعودية على مباراة أبكر في اليوم نفسه (26 سبتمبر)", () => {
    const oman_ksa = fx(6, "2026-09-26T21:00:00+03:00", 9, SAUDI_TEAM_ID);
    const kuw_irq = fx(5, "2026-09-26T18:00:00+03:00", 3, 4);
    expect(order([oman_ksa, kuw_irq])).toEqual([["2026-09-26", [5, 6]]]);
  });

  it("الأيام من الأقدم إلى الأحدث مهما كان ترتيب المدخلات", () => {
    const list = [
      fx(7, "2026-09-27T18:00:00+03:00", 1, 2),
      fx(2, "2026-09-23T17:30:00+03:00", 3, 4),
      fx(1, "2026-09-23T21:00:00+03:00", SAUDI_TEAM_ID, 5),
    ];
    expect(order(list)).toEqual([
      ["2026-09-23", [2, 1]],
      ["2026-09-27", [7]],
    ]);
  });

  it("عند تساوي الموعد يُرتَّب برقم المباراة تصاعديًا", () => {
    const list = [
      fx(10, "2026-09-29T20:30:00+03:00", 9, 3),
      fx(9, "2026-09-29T20:30:00+03:00", SAUDI_TEAM_ID, 4),
    ];
    expect(order(list)).toEqual([["2026-09-29", [9, 10]]]);
    expect(order([...list].reverse())).toEqual([["2026-09-29", [9, 10]]]);
  });

  it("المباراة غير محددة الوقت في نهاية يومها", () => {
    const list = [
      fx(13, "2026-10-03T00:00:00+03:00", 1, 2, "TBD"),
      fx(14, "2026-10-03T20:30:00+03:00", 3, 4),
      fx(12, "2026-10-03T18:00:00+03:00", 5, 6),
    ];
    expect(order(list)).toEqual([["2026-10-03", [12, 14, 13]]]);
  });
});
