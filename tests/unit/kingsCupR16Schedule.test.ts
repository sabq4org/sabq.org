import { describe, expect, it } from "vitest";
import {
  KC_R16_TIES,
  buildKcR16Synthetic,
  isKcSyntheticFixtureId,
  isKingsCupR16Round,
  mergeKingsCupR16Schedule,
  type KcR16Fixture,
} from "../../server/services/kingsCupR16Schedule";

const r32 = (homeId: number, awayId: number, id: number): KcR16Fixture => ({
  id,
  date: "2026-08-16T21:00:00+03:00",
  timestamp: 1_755_368_400,
  status: { code: "FT", label: "انتهت", elapsed: 90, extra: null, live: false, finished: true },
  round: "دور الـ32",
  venue: { name: "", city: "" },
  home: { id: homeId, name: "ه", logo: `logo-${homeId}`, winner: true },
  away: { id: awayId, name: "ض", logo: `logo-${awayId}`, winner: false },
  goals: { home: 1, away: 0 },
  penalties: null,
});

describe("kingsCupR16Schedule", () => {
  it("يزرع الثماني مواجهات إن لم ينشر المزود دور الـ16", () => {
    const merged = mergeKingsCupR16Schedule([r32(2961, 2951, 1), r32(2932, 2935, 2)]);
    const r16 = merged.filter((f) => isKingsCupR16Round(f.round));
    expect(r16).toHaveLength(8);
    expect(r16.every((f) => isKcSyntheticFixtureId(f.id) && !f.status.finished)).toBe(true);
    expect(r16.some((f) => f.home.id === 2932 && f.away.id === 2945)).toBe(true);
    expect(r16.some((f) => f.home.id === 2939 && f.away.id === 10509)).toBe(true);
  });

  it("ينسخ شعار النادي من مباريات دور الـ32", () => {
    const merged = mergeKingsCupR16Schedule([r32(2932, 2935, 1)]);
    const hilal = merged.find((f) => f.home.id === 2932 && isKingsCupR16Round(f.round));
    expect(hilal?.home.logo).toBe("logo-2932");
  });

  it("لا يكرّر مواجهة نشرها المزود بأي ترتيب", () => {
    const published: KcR16Fixture = {
      ...buildKcR16Synthetic(KC_R16_TIES[6]),
      id: 1_600_001,
      home: { id: 2945, name: "الحزم", logo: "x", winner: null },
      away: { id: 2932, name: "الهلال", logo: "y", winner: null },
    };
    published.round = "دور الـ16";
    const merged = mergeKingsCupR16Schedule([published]);
    const hilalHazem = merged.filter(
      (f) =>
        isKingsCupR16Round(f.round) &&
        [f.home.id, f.away.id].sort().join() === "2932,2945",
    );
    expect(hilalHazem).toHaveLength(1);
    expect(hilalHazem[0].id).toBe(1_600_001);
    expect(merged.filter((f) => isKcSyntheticFixtureId(f.id))).toHaveLength(7);
  });

  it("ثماني مواجهات في الكتالوج", () => {
    expect(KC_R16_TIES).toHaveLength(8);
    expect(new Set(KC_R16_TIES.map((t) => t.id)).size).toBe(8);
  });
});
