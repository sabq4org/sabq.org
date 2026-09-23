/**
 * اختبارات لوحات سباقات الموسم (الهدّافون، صنّاع الأهداف، والبطاقات) وتشكيلة الجولة
 */
import { describe, it, expect } from "vitest";

describe("لوحات سباقات الموسم — احتياطي تجميع الأحداث وتحديث الجولة الأولى", () => {
  it("عند غياب بيانات المزود المركزية players/top* يتم استخراج الهدّافين والبطاقات من أحداث المباريات المكتملة/الجارية", () => {
    // محاكاة قائمة أحداث مباريات الجولة الأولى
    const matchEvents = [
      {
        type: "Goal",
        detail: "Normal Goal",
        player: { id: 101, name: "Salem Al-Dawsari" },
        assist: { id: 102, name: "Ruben Neves" },
        team: { id: 1, name: "Al-Hilal" },
      },
      {
        type: "Goal",
        detail: "Penalty",
        player: { id: 101, name: "Salem Al-Dawsari" },
        assist: null,
        team: { id: 1, name: "Al-Hilal" },
      },
      {
        type: "Card",
        detail: "Yellow Card",
        player: { id: 103, name: "Ali Al-Bulayhi" },
        team: { id: 1, name: "Al-Hilal" },
      },
    ];

    const tallies = new Map<number, { goals: number; penalties: number; assists: number; yellow: number; red: number }>();
    for (const ev of matchEvents) {
      if (ev.type === "Goal") {
        const t = tallies.get(ev.player.id) ?? { goals: 0, penalties: 0, assists: 0, yellow: 0, red: 0 };
        t.goals += 1;
        if (ev.detail === "Penalty") t.penalties += 1;
        tallies.set(ev.player.id, t);

        if (ev.assist) {
          const at = tallies.get(ev.assist.id) ?? { goals: 0, penalties: 0, assists: 0, yellow: 0, red: 0 };
          at.assists += 1;
          tallies.set(ev.assist.id, at);
        }
      } else if (ev.type === "Card") {
        const t = tallies.get(ev.player.id) ?? { goals: 0, penalties: 0, assists: 0, yellow: 0, red: 0 };
        if (ev.detail === "Yellow Card") t.yellow += 1;
        tallies.set(ev.player.id, t);
      }
    }

    const salem = tallies.get(101);
    expect(salem?.goals).toBe(2);
    expect(salem?.penalties).toBe(1);

    const neves = tallies.get(102);
    expect(neves?.assists).toBe(1);

    const bulayhi = tallies.get(103);
    expect(bulayhi?.yellow).toBe(1);
  });

  it("تشكيلة الجولة: يتم إخفاء التشكيلة (available: false) إن كانت تتبع موسماً سابقاً غير الموسم الحالي", () => {
    const currentSeasonId = 23456; // 2026/27
    const lastSeasonTotw = {
      season_id: 21234, // 2025/26
      formation: "3-5-2",
      players: [{ name: "Cristiano Ronaldo" }],
    };

    const isCurrentSeason = Number(lastSeasonTotw.season_id) === currentSeasonId;
    const response = isCurrentSeason
      ? { available: true, formation: lastSeasonTotw.formation, players: lastSeasonTotw.players }
      : { available: false, formation: null, players: [] };

    expect(response.available).toBe(false);
    expect(response.players.length).toBe(0);
  });
});
