import { describe, it, expect, vi } from "vitest";

vi.mock("../../server/services/saudiLeagueService", () => ({ getMatchLite: vi.fn() }));

import { findPostponedFixtureIds, isPreMatchSnapKind } from "../../server/services/sportsSnaps/postponedGuard";

const fx = (code: string, live = false, finished = false) => ({ timestamp: 1, status: { code, live, finished } });

describe("حارس لقطات فارا قبل المباراة — المؤجلة", () => {
  it("يُسقط المؤجلة والملغاة ويُبقي القائمة", async () => {
    const table: Record<number, ReturnType<typeof fx> | null> = {
      1: fx("PST"),
      2: fx("NS"),
      3: fx("CANC"),
      4: fx("TBD"),
      5: null,
    };
    const ids = await findPostponedFixtureIds([1, 2, 3, 4, 5, 1], async (id) => table[id] ?? null);
    expect([...ids].sort()).toEqual([1, 3]);
  });

  it("فشل المزوّد لا يوقف إشعارًا صحيحًا", async () => {
    const ids = await findPostponedFixtureIds([7], async () => {
      throw new Error("provider down");
    });
    expect(ids.size).toBe(0);
  });

  it("الحارس يخص لقطات ما قبل المباراة فقط", () => {
    expect(isPreMatchSnapKind("upcoming_match")).toBe(true);
    expect(isPreMatchSnapKind("behavioral_big_match")).toBe(true);
    expect(isPreMatchSnapKind("post_match_recap")).toBe(false);
  });
});
