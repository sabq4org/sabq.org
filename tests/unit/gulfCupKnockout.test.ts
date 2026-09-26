/**
 * حسم فتحات نصف نهائي خليجي 27 من النتائج، لا من ترتيب اللحظة الحالي.
 * لقطة 2026-09-26 مأخوذة من /api/gulf-cup/fixtures بعد الجولة الثانية
 * للمجموعة الأولى والجولة الأولى للمجموعة الثانية.
 */
import { describe, expect, it } from "vitest";
import { GC_FIXTURES, GC_GROUPS, type GcBracketSlot } from "../../server/services/gulfCupData";
import {
  applyGcKnockoutTeams,
  decidedGroupRanks,
  type GcKnockoutFixture,
} from "../../server/services/gulfCupKnockout";
import { localizeGcPlayerName } from "../../server/services/gulfCupPlayerNames";

const SLOTS = new Map(
  GC_FIXTURES.map((seed) => [seed.matchNo, { homeSlot: seed.homeSlot, awaySlot: seed.awaySlot }]),
);

interface Side {
  id: number;
  name: string;
}

type Row = GcKnockoutFixture & { home: Side; away: Side };

function side(id: number | null, label = ""): Side {
  return { id: id ?? 0, name: id ? `team-${id}` : label };
}

function fx(
  matchNo: number,
  roundEn: string,
  homeId: number | null,
  awayId: number | null,
  score: [number, number] | null,
): Row {
  return {
    matchNo,
    roundEn,
    home: side(homeId),
    away: side(awayId),
    status: { finished: score != null },
    goals: score ? { home: score[0], away: score[1] } : { home: null, away: null },
    penalties: { home: null, away: null },
  };
}

/** نتائج 2026-09-26 باتجاه جدول سبق الثابت (نفس الفائز ونفس الأهداف). */
function snapshot(extra: Record<number, [number, number] | null> = {}): ReturnType<typeof fx>[] {
  const played: Record<number, [number, number]> = {
    1: [1, 0], // السعودية × الكويت
    2: [1, 1], // العراق × عُمان
    3: [0, 4], // اليمن × الإمارات
    4: [0, 2], // البحرين × قطر
    5: [3, 2], // العراق × الكويت
    6: [3, 0], // السعودية × عُمان
    ...Object.fromEntries(
      Object.entries(extra).flatMap(([matchNo, score]) => (score ? [[Number(matchNo), score]] : [])),
    ),
  };
  return GC_FIXTURES.map((seed) => fx(seed.matchNo, seed.roundEn, seed.homeId, seed.awayId, played[seed.matchNo] ?? null));
}

function knockout(fixtures: Row[]) {
  return applyGcKnockoutTeams(fixtures, SLOTS, GC_GROUPS, (id) => ({ id, name: `team-${id}` }));
}

function pair(fixtures: Row[], matchNo: number): [string, string] {
  const row = fixtures.find((fixture) => fixture.matchNo === matchNo);
  if (!row) throw new Error(`missing ${matchNo}`);
  return [row.home.name, row.away.name];
}

describe("خليجي 27 — لقطة 26 سبتمبر 2026", () => {
  it("لا يملأ نصف النهائي ولا النهائي لأن المركز نفسه غير محسوم", () => {
    const rows = knockout(snapshot());
    expect(pair(rows, 13)).toEqual(["", ""]);
    expect(pair(rows, 14)).toEqual(["", ""]);
    expect(pair(rows, 15)).toEqual(["", ""]);
    // السعودية (6) مضمونة بين الأولين، لكن العراق يستطيع انتزاع الصدارة.
    expect(decidedGroupRanks(
      GC_GROUPS[0].teamIds,
      [
        { homeId: 23, awayId: 1570, homeGoals: 1, awayGoals: 0 },
        { homeId: 1567, awayId: 1552, homeGoals: 1, awayGoals: 1 },
        { homeId: 1567, awayId: 1570, homeGoals: 3, awayGoals: 2 },
        { homeId: 23, awayId: 1552, homeGoals: 3, awayGoals: 0 },
      ],
      [
        { homeId: 1567, awayId: 23 },
        { homeId: 1570, awayId: 1552 },
      ],
    ).size).toBe(0);
  });

  it("يثبّت أول المجموعة الأولى فقط عندما يعجز الآخرون عن اللحاق به", () => {
    // السعودية تفوز على العراق (9 نقاط) ومباراة عُمان × الكويت لم تُلعب: عمان قد تعادل العراق بالنقاط.
    const rows = knockout(snapshot({ 9: [0, 1] }));
    expect(pair(rows, 13)).toEqual(["team-23", ""]);
    expect(pair(rows, 14)).toEqual(["", ""]);
    expect(pair(rows, 15)).toEqual(["", ""]);
  });

  it("يملأ مركزي المجموعة الأولى بعد حسم الجولة الأخيرة دون أن يخمن المجموعة الثانية", () => {
    // العراق 4 يبقى ثانيًا لأن فوز الكويت يُبقي عُمان على نقطة.
    const rows = knockout(snapshot({ 9: [0, 1], 10: [1, 0] }));
    expect(pair(rows, 13)[0]).toBe("team-23");
    expect(pair(rows, 14)[1]).toBe("team-1567");
    expect(pair(rows, 13)[1]).toBe("");
    expect(pair(rows, 14)[0]).toBe("");
    expect(pair(rows, 15)).toEqual(["", ""]);
  });

  it("لا يستبدل منتخبًا نشره المزوّد على الفتحة", () => {
    const fixtures = snapshot({ 9: [0, 1], 10: [1, 0] });
    const semi = fixtures.find((fixture) => fixture.matchNo === 13);
    if (!semi) throw new Error("missing semi");
    semi.home = { id: 1563, name: "provider-uae" };
    const rows = knockout(fixtures);
    expect(rows.find((fixture) => fixture.matchNo === 13)?.home.name).toBe("provider-uae");
  });
});

describe("كواسر التعادل بعد اكتمال المجموعة", () => {
  const group = { teamIds: [1, 2, 3, 4] };
  const slots = new Map<number, { homeSlot?: GcBracketSlot; awaySlot?: GcBracketSlot }>([
    [13, { homeSlot: { kind: "groupRank", groupIndex: 0, rank: 1 }, awaySlot: { kind: "groupRank", groupIndex: 0, rank: 2 } }],
  ]);

  it("المقدّم في المواجهة المباشرة يتقدّم على صاحب فارق الأهداف الأفضل", () => {
    // D=4 يتصدّر بالنقاط. A و B على 4 نقاط، B فاز على A، رغم أن فارق A أفضل.
    const fixtures = [
      fx(1, "Group Stage - 1", 2, 1, [1, 0]),
      fx(2, "Group Stage - 1", 1, 3, [2, 0]),
      fx(3, "Group Stage - 1", 1, 4, [1, 1]),
      fx(4, "Group Stage - 1", 2, 3, [0, 0]),
      fx(5, "Group Stage - 1", 2, 4, [0, 1]),
      fx(6, "Group Stage - 1", 3, 4, [0, 0]),
      fx(13, "Semi-finals", null, null, null),
    ];
    const [home, away] = pair(
      applyGcKnockoutTeams(fixtures, slots, [group], (id) => ({ id, name: `t${id}` })),
      13,
    );
    expect(home).toBe("t4");
    expect(away).toBe("t2");
  });

  it("التعادل الكامل بعد كل الكواسر يبقى بلا منتخب", () => {
    const fixtures = [
      fx(1, "Group Stage - 1", 1, 2, [1, 1]),
      fx(13, "Semi-finals", null, null, null),
    ];
    const [home, away] = pair(
      applyGcKnockoutTeams(fixtures, slots, [{ teamIds: [1, 2] }], (id) => ({ id, name: `t${id}` })),
      13,
    );
    expect(home).toBe("");
    expect(away).toBe("");
  });
});

describe("فائز نصف النهائي", () => {
  const slots = new Map<number, { homeSlot?: GcBracketSlot; awaySlot?: GcBracketSlot }>([
    [15, { homeSlot: { kind: "winnerOf", matchNo: 13 }, awaySlot: { kind: "winnerOf", matchNo: 14 } }],
  ]);

  it("يملأ النهائي من نتيجة نصف النهائي المنتهي بما فيها الترجيح", () => {
    const semi = fx(13, "Semi-finals", 23, 1563, [1, 1]);
    semi.penalties = { home: 4, away: 2 };
    const other = fx(14, "Semi-finals", 1569, 1567, null);
    const final = fx(15, "Final", null, null, null);
    const rows = applyGcKnockoutTeams([final, semi, other], slots, [], (id) => ({ id, name: `t${id}` }));
    expect(pair(rows, 15)).toEqual(["t23", ""]);
  });
});

describe("localizeGcPlayerName", () => {
  it("يوسّع مختصَرات معرّفات خليجي المؤكّدة ويبقي غيرها", () => {
    expect(localizeGcPlayerName(44324, "فهد البريكين")).toBe("فراس البريكان");
    expect(localizeGcPlayerName(60951, "ي. ناصر")).toBe("يوسف ناصر");
    expect(localizeGcPlayerName(6685, "ن. خيمينيز")).toBe("نيكولاس خيمينيز");
    expect(localizeGcPlayerName(140962, "ك. أ. آل")).toBe("أحمد الكعبي");
    expect(localizeGcPlayerName(72134, "ك. نبيل")).toBe("ك. نبيل");
  });
});
