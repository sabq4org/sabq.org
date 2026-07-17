// اختبارات استراتيجيات المنصة المركزية — تشمل حالات ذهبية مطابقة لسلوك
// المحركات القائمة (خليجي 27 وكأس العالم) وخاصية حفظ البركة:
// awarded + carried + remainder === available.

import { describe, expect, it } from "vitest";
import { runStrategy, getStrategy } from "../../server/services/predictions/registry";
import type { SettlementInput, StrategyResult } from "../../server/services/predictions/strategyTypes";
import { STRATEGY_KEYS } from "../../shared/predictions";

const LOCKS_AT = new Date("2026-08-01T18:00:00Z");

function matchEntry(
  id: string,
  predHome: number,
  predAway: number,
  extras: Partial<{ boldnessMultiplier: number; streakMultiplier: number; submittedAt: Date }> = {},
) {
  return {
    entryId: `entry-${id}`,
    userId: `user-${id}`,
    payload: { predHome, predAway },
    submittedAt: extras.submittedAt ?? new Date("2026-08-01T10:00:00Z"),
    boldnessMultiplier: extras.boldnessMultiplier,
    streakMultiplier: extras.streakMultiplier,
  };
}

function pickEntry(id: string, playerId: string, submittedAt?: Date) {
  return {
    entryId: `entry-${id}`,
    userId: `user-${id}`,
    payload: { pickId: playerId, playerId },
    submittedAt: submittedAt ?? new Date("2026-08-01T10:00:00Z"),
  };
}

function matchInput(entries: SettlementInput["entries"], finalHome: number, finalAway: number, carryIn = 0): SettlementInput {
  return {
    contestType: "match_score",
    entries,
    resultPayload: { finalHome, finalAway },
    carryIn,
    locksAt: LOCKS_AT,
  };
}

function expectPoolConserved(result: StrategyResult) {
  expect(result.pool.awarded + result.pool.carried + result.pool.remainder).toBe(result.pool.available);
  const totalAwards = result.awards.reduce((sum, a) => sum + a.basePoints, 0);
  expect(totalAwards).toBe(result.pool.awarded);
}

describe("tiered_pool (منطق خليجي 27)", () => {
  const params = {
    basePool: 1000,
    tiers: { exact: 0.5, signedMargin: 0.3, outcome: 0.2 },
    carryMode: "same_competition_next_contest",
  };

  it("يوزع الطبقات الثلاث الحصرية ويحمي من النتيجة المقلوبة", () => {
    const input = matchInput(
      [
        matchEntry("exact", 2, 1), // دقيق
        matchEntry("margin", 3, 2), // فارق موقّع
        matchEntry("outcome", 3, 1), // اتجاه
        matchEntry("flipped", 1, 2), // مقلوبة — صفر
      ],
      2,
      1,
    );
    const { result } = runStrategy(STRATEGY_KEYS.TIERED_POOL, input, params);

    expect(result.awards).toHaveLength(3);
    const byUser = Object.fromEntries(result.awards.map((a) => [a.userId, a]));
    expect(byUser["user-exact"].basePoints).toBe(500);
    expect(byUser["user-exact"].reasonCode).toBe("exact");
    expect(byUser["user-margin"].basePoints).toBe(300);
    expect(byUser["user-outcome"].basePoints).toBe(200);
    expect(byUser["user-flipped"]).toBeUndefined();
    expectPoolConserved(result);
    expect(result.pool.carried).toBe(0);
  });

  it("يرحّل الطبقات الخالية والبواقي ويضيف الجائزة المتراكمة", () => {
    // لا أحد أصاب الدقيق: طبقته (600 من 1200) تُرحَّل كاملة
    const input = matchInput([matchEntry("margin", 3, 2), matchEntry("outcome", 3, 1)], 2, 1, 200);
    const { result } = runStrategy(STRATEGY_KEYS.TIERED_POOL, input, params);

    expect(result.pool.available).toBe(1200);
    expect(result.pool.carried).toBe(600);
    expectPoolConserved(result);
  });

  it("carryMode=none يحول غير الموزَّع إلى متبقٍ لا ترحيل", () => {
    const input = matchInput([matchEntry("outcome", 3, 1)], 2, 1);
    const { result } = runStrategy(STRATEGY_KEYS.TIERED_POOL, input, { ...params, carryMode: "none" });
    expect(result.pool.carried).toBe(0);
    expect(result.pool.remainder).toBe(800);
    expectPoolConserved(result);
  });

  it("يتجاهل الحمولات الفاسدة بدل إفشال التسوية", () => {
    const input = matchInput([matchEntry("ok", 2, 1)], 2, 1);
    input.entries.push({
      entryId: "entry-bad",
      userId: "user-bad",
      payload: { غريب: true },
      submittedAt: new Date(),
    });
    const { result } = runStrategy(STRATEGY_KEYS.TIERED_POOL, input, params);
    expect(result.awards).toHaveLength(1);
    expectPoolConserved(result);
  });
});

describe("shared_pool (منطق كأس العالم/الدوري)", () => {
  it("يقسم بالتساوي على مصيبي الاتجاه (winCriterion=outcome)", () => {
    const input = matchInput(
      [matchEntry("a", 2, 1), matchEntry("b", 1, 0), matchEntry("c", 0, 1)],
      3,
      1,
    );
    const { result } = runStrategy(STRATEGY_KEYS.SHARED_POOL, input, {
      basePool: 500,
      winCriterion: "outcome",
      carryMode: "none",
    });
    // فائزان (a وb أصابا فوز المضيف) → floor(500/2)=250 لكل منهما
    expect(result.awards).toHaveLength(2);
    expect(result.awards.every((a) => a.basePoints === 250)).toBe(true);
    expectPoolConserved(result);
  });

  it("winCriterion=exact لا يكافئ إلا النتيجة الدقيقة", () => {
    const input = matchInput([matchEntry("a", 2, 1), matchEntry("b", 3, 1)], 3, 1);
    const { result } = runStrategy(STRATEGY_KEYS.SHARED_POOL, input, {
      basePool: 500,
      winCriterion: "exact",
      carryMode: "none",
    });
    expect(result.awards).toHaveLength(1);
    expect(result.awards[0].userId).toBe("user-b");
    expect(result.awards[0].basePoints).toBe(500);
    expectPoolConserved(result);
  });

  it("بلا فائزين تُرحَّل البركة كاملة عند تفعيل الترحيل", () => {
    const input = matchInput([matchEntry("a", 0, 2)], 3, 1, 100);
    const { result } = runStrategy(STRATEGY_KEYS.SHARED_POOL, input, {
      basePool: 500,
      winCriterion: "outcome",
      carryMode: "same_competition_next_contest",
    });
    expect(result.awards).toHaveLength(0);
    expect(result.pool.carried).toBe(600);
    expectPoolConserved(result);
  });
});

describe("fixed_points (الكلاسيكي 3/1/0)", () => {
  it("يمنح 3 للدقيق و1 للاتجاه و0 للخطأ", () => {
    const input = matchInput(
      [matchEntry("exact", 2, 1), matchEntry("outcome", 3, 1), matchEntry("wrong", 0, 2)],
      2,
      1,
    );
    const { result } = runStrategy(STRATEGY_KEYS.FIXED_POINTS, input, {
      exact: 3,
      signedMargin: 0,
      outcome: 1,
    });
    const byUser = Object.fromEntries(result.awards.map((a) => [a.userId, a.basePoints]));
    expect(byUser["user-exact"]).toBe(3);
    expect(byUser["user-outcome"]).toBe(1);
    expect(byUser["user-wrong"]).toBeUndefined();
    expectPoolConserved(result);
  });
});

describe("skill_weighted (كأس آسيا الذكي)", () => {
  const params = {
    tierPoints: { exact: 30, signedMargin: 18, outcome: 10 },
    boldnessMultiplierRange: { min: 100, max: 300 },
    streakMultiplierRange: { min: 100, max: 200 },
  };

  it("نقاط الطبقة × الجرأة × السلسلة بقسمة صحيحة", () => {
    const input = matchInput(
      [matchEntry("a", 2, 1, { boldnessMultiplier: 250, streakMultiplier: 150 })],
      2,
      1,
    );
    const { result } = runStrategy(STRATEGY_KEYS.SKILL_WEIGHTED, input, params);
    // 30 × 250 × 150 / 10000 = 112.5 → 112
    expect(result.awards[0].basePoints).toBe(112);
  });

  it("يقصّ المضاعفات إلى حدود الملف ويعتبر الغائب ×1.0", () => {
    const input = matchInput(
      [
        matchEntry("clamped", 2, 1, { boldnessMultiplier: 900, streakMultiplier: 50 }),
        matchEntry("default", 3, 1),
      ],
      2,
      1,
    );
    const { result } = runStrategy(STRATEGY_KEYS.SKILL_WEIGHTED, input, params);
    const byUser = Object.fromEntries(result.awards.map((a) => [a.userId, a.basePoints]));
    // 30 × 300(مقصوص) × 100(مقصوص من أسفل) / 10000 = 90
    expect(byUser["user-clamped"]).toBe(90);
    // اتجاه: 10 × 100 × 100 / 10000 = 10
    expect(byUser["user-default"]).toBe(10);
  });
});

describe("player_pool (الهدافون)", () => {
  it("يقسم بركة الهداف على المصيبين", () => {
    const input: SettlementInput = {
      contestType: "match_scorer",
      entries: [pickEntry("a", "p9"), pickEntry("b", "p9"), pickEntry("c", "p10")],
      resultPayload: { winningPlayerIds: ["p9"] },
      carryIn: 0,
      locksAt: LOCKS_AT,
    };
    const { result } = runStrategy(STRATEGY_KEYS.PLAYER_POOL, input, {
      basePool: 300,
      carryMode: "none",
    });
    expect(result.awards).toHaveLength(2);
    expect(result.awards.every((a) => a.basePoints === 150)).toBe(true);
    expect(result.awards[0].reasonCode).toBe("scorer");
    expectPoolConserved(result);
  });

  it("مباراة بلا أهداف: لا فائزين والبركة تُرحَّل", () => {
    const input: SettlementInput = {
      contestType: "first_scorer",
      entries: [pickEntry("a", "p9")],
      resultPayload: { winningPlayerIds: [] },
      carryIn: 50,
      locksAt: LOCKS_AT,
    };
    const { result } = runStrategy(STRATEGY_KEYS.PLAYER_POOL, input, {
      basePool: 200,
      carryMode: "same_competition_next_contest",
    });
    expect(result.awards).toHaveLength(0);
    expect(result.pool.carried).toBe(250);
    expectPoolConserved(result);
  });
});

describe("long_term_pool (البطل والهداف)", () => {
  it("التوزيع المتساوي يقسم البركة على المصيبين", () => {
    const input: SettlementInput = {
      contestType: "top_scorer",
      entries: [pickEntry("a", "p9"), pickEntry("b", "p9"), pickEntry("c", "p9"), pickEntry("d", "p10")],
      resultPayload: { winningPickIds: ["p9"] },
      carryIn: 0,
      locksAt: LOCKS_AT,
    };
    const { result } = runStrategy(STRATEGY_KEYS.LONG_TERM_POOL, input, {
      basePool: 3000,
      distribution: "equal",
      earlyTiers: [],
    });
    expect(result.awards).toHaveLength(3);
    expect(result.awards.every((a) => a.basePoints === 1000)).toBe(true);
    expect(result.awards[0].reasonCode).toBe("top_scorer");
    expectPoolConserved(result);
  });

  it("وزن التبكير يمنح المتوقع الأقدم نصيبًا أكبر", () => {
    const monthBefore = new Date(LOCKS_AT.getTime() - 45 * 24 * 3_600_000);
    const dayBefore = new Date(LOCKS_AT.getTime() - 24 * 3_600_000);
    const input: SettlementInput = {
      contestType: "champion",
      entries: [pickEntry("early", "team1", monthBefore), pickEntry("late", "team1", dayBefore)],
      resultPayload: { winningPickIds: ["team1"] },
      carryIn: 0,
      locksAt: LOCKS_AT,
    };
    const { result } = runStrategy(STRATEGY_KEYS.LONG_TERM_POOL, input, {
      basePool: 10000,
      distribution: "early_weighted",
      earlyTiers: [
        { beforeHours: 720, weight: 3 }, // شهر فأكثر
        { beforeHours: 168, weight: 2 }, // أسبوع فأكثر
      ],
    });
    const byUser = Object.fromEntries(result.awards.map((a) => [a.userId, a.basePoints]));
    // الأوزان: 3 و1 → 7500 و2500
    expect(byUser["user-early"]).toBe(7500);
    expect(byUser["user-late"]).toBe(2500);
    expectPoolConserved(result);
  });
});

describe("Strategy Registry", () => {
  it("يرفض استراتيجية غير مسجلة", () => {
    expect(() => getStrategy("evil_json_code")).toThrow("UNKNOWN_STRATEGY");
  });

  it("يرفض معاملات لا يكتمل مجموع نسبها", () => {
    expect(() =>
      runStrategy(STRATEGY_KEYS.TIERED_POOL, matchInput([], 1, 0), {
        basePool: 1000,
        tiers: { exact: 0.5, signedMargin: 0.3, outcome: 0.1 },
        carryMode: "none",
      }),
    ).toThrow();
  });

  it("التنفيذ حتمي: نفس المدخلات تعيد نفس النتيجة", () => {
    const input = matchInput([matchEntry("a", 2, 1), matchEntry("b", 1, 0)], 2, 1, 150);
    const params = {
      basePool: 1000,
      tiers: { exact: 0.5, signedMargin: 0.3, outcome: 0.2 },
      carryMode: "same_competition_next_contest",
    };
    const first = runStrategy(STRATEGY_KEYS.TIERED_POOL, input, params);
    const second = runStrategy(STRATEGY_KEYS.TIERED_POOL, input, params);
    expect(second.result).toEqual(first.result);
  });
});
