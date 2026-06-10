import { describe, it, expect } from "vitest";
import {
  LOYALTY_ACTIONS,
  LOYALTY_ACTION_POINTS,
  LOYALTY_DAILY_CAPS,
  LOYALTY_DEDUP_HOURS,
  LOYALTY_TIERS,
  computeTier,
  nextTier,
  tierProgress,
  streakMultiplier,
} from "@shared/loyalty";

// Tier thresholds: 0 / 100 / 500 / 2000 / 10000. An off-by-one here demotes
// real users' badges, so every boundary is pinned exactly.
describe("computeTier — exact boundaries", () => {
  const cases: Array<[points: number, expectedLevel: number]> = [
    [0, 1],
    [99, 1],
    [100, 2],
    [499, 2],
    [500, 3],
    [1999, 3],
    [2000, 4],
    [9999, 4],
    [10000, 5],
    [1_000_000, 5],
  ];

  it.each(cases)("%i lifetime points → tier level %i", (points, level) => {
    expect(computeTier(points).level).toBe(level);
  });

  it("negative points fall back to tier 1 (defensive)", () => {
    expect(computeTier(-5).level).toBe(1);
  });
});

describe("nextTier / tierProgress", () => {
  it("walks the ladder and ends with null after level 5", () => {
    expect(nextTier(1)?.level).toBe(2);
    expect(nextTier(4)?.level).toBe(5);
    expect(nextTier(5)).toBeNull();
  });

  it("one point below a threshold reports exactly 1 point to next", () => {
    const p = tierProgress(9999);
    expect(p.current.level).toBe(4);
    expect(p.next?.level).toBe(5);
    expect(p.pointsToNext).toBe(1);
  });

  it("at the top tier there is no next and pointsToNext is 0", () => {
    const p = tierProgress(10000);
    expect(p.current.level).toBe(5);
    expect(p.next).toBeNull();
    expect(p.pointsToNext).toBe(0);
  });

  it("pointsToNext never goes negative", () => {
    expect(tierProgress(150).pointsToNext).toBe(350);
    expect(tierProgress(100).pointsToNext).toBe(400);
  });
});

describe("streakMultiplier — boundaries at 7/14/30 days", () => {
  const cases: Array<[days: number, multiplier: number]> = [
    [0, 1],
    [6, 1],
    [7, 1.5],
    [13, 1.5],
    [14, 1.75],
    [29, 1.75],
    [30, 2.0],
    [365, 2.0],
  ];

  it.each(cases)("%i-day streak → x%d", (days, multiplier) => {
    expect(streakMultiplier(days).multiplier).toBe(multiplier);
  });
});

// The three records are documented as "must stay in sync" — a new action
// added to LOYALTY_ACTIONS without points/cap/dedup entries would award
// undefined points at runtime. TypeScript enforces this at compile time;
// this test keeps it enforced even through `as any` regressions.
describe("action tables stay in sync", () => {
  const actions = Object.values(LOYALTY_ACTIONS);

  it("every action has points, a daily-cap entry, and a dedup entry", () => {
    for (const action of actions) {
      expect(LOYALTY_ACTION_POINTS[action], `points for ${action}`).toBeTypeOf("number");
      expect(LOYALTY_DAILY_CAPS, `cap for ${action}`).toHaveProperty(action);
      expect(LOYALTY_DEDUP_HOURS, `dedup for ${action}`).toHaveProperty(action);
    }
  });

  it("one-time bonuses are capped at 1 with a lifetime dedup window", () => {
    for (const oneTime of ["PROFILE_COMPLETE", "EMAIL_VERIFIED"] as const) {
      expect(LOYALTY_DAILY_CAPS[oneTime]).toBe(1);
      expect(LOYALTY_DEDUP_HOURS[oneTime]).toBe(100000);
    }
  });

  it("tier list is strictly ascending in both level and threshold", () => {
    for (let i = 1; i < LOYALTY_TIERS.length; i++) {
      expect(LOYALTY_TIERS[i].level).toBe(LOYALTY_TIERS[i - 1].level + 1);
      expect(LOYALTY_TIERS[i].minLifetimePoints).toBeGreaterThan(
        LOYALTY_TIERS[i - 1].minLifetimePoints,
      );
    }
  });
});
