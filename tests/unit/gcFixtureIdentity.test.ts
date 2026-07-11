import { describe, expect, it } from "vitest";
import { GC_FIXTURES } from "../../server/services/gulfCupData";
import {
  gcImmutableTournamentLockAt,
  isGcTournamentLocked,
  resolveGcFixtureIdentities,
  type GcProviderFixtureIdentity,
} from "../../server/services/gulfCupFixtureIdentity";

function provider(
  providerId: number,
  input: Partial<GcProviderFixtureIdentity> & Pick<GcProviderFixtureIdentity, "homeId" | "awayId">,
): GcProviderFixtureIdentity {
  const date = input.date ?? "2026-09-23T21:00:00+03:00";
  return {
    providerId,
    matchNo: input.matchNo ?? null,
    date,
    timestamp: input.timestamp ?? Math.floor(Date.parse(date) / 1000),
    roundEn: input.roundEn ?? "Group Stage - 1",
    homeId: input.homeId,
    awayId: input.awayId,
  };
}

describe("Gulf Cup fixture identity", () => {
  it("matches a group fixture by teams while preserving the internal id", () => {
    const [resolved] = resolveGcFixtureIdentities(
      [GC_FIXTURES[0]],
      [provider(991_001, { homeId: 1570, awayId: 23 })],
    );

    expect(resolved.id).toBe(27_000_001);
    expect(resolved.matchNo).toBe(1);
    expect(resolved.providerId).toBe(991_001);
  });

  it("keeps matching a postponed group fixture after it moves to another day", () => {
    const delayed = provider(991_002, {
      homeId: 23,
      awayId: 1570,
      date: "2026-09-25T19:30:00+03:00",
      roundEn: "Group Stage - 1",
    });
    const [resolved] = resolveGcFixtureIdentities([GC_FIXTURES[0]], [delayed]);

    expect(resolved.id).toBe(GC_FIXTURES[0].id);
    expect(resolved.provider?.date).toBe("2026-09-25T19:30:00+03:00");
  });

  it("overlays both placeholder semi-finals and the final by match number/round", () => {
    const seeds = GC_FIXTURES.slice(12);
    const rows = [
      provider(991_014, {
        matchNo: 14,
        roundEn: "Semi Finals",
        homeId: 1563,
        awayId: 1567,
        date: "2026-10-03T20:30:00+03:00",
      }),
      provider(991_013, {
        matchNo: 13,
        roundEn: "Semi-finals",
        homeId: 23,
        awayId: 1569,
        // Delayed beyond the other semi: matchNo, not chronology, owns identity.
        date: "2026-10-04T18:00:00+03:00",
      }),
      provider(991_015, {
        roundEn: "Final",
        homeId: 23,
        awayId: 1563,
        date: "2026-10-08T20:30:00+03:00",
      }),
    ];

    const resolved = resolveGcFixtureIdentities(seeds, rows);
    expect(resolved.map((row) => [row.id, row.providerId])).toEqual([
      [27_000_013, 991_013],
      [27_000_014, 991_014],
      [27_000_015, 991_015],
    ]);
  });

  it("keeps semifinal ids when postponement reverses provider chronology", () => {
    const resolved = resolveGcFixtureIdentities(GC_FIXTURES.slice(12, 14), [
      provider(992_013, {
        roundEn: "Semifinals",
        homeId: 23,
        awayId: 1569,
        // Semi 13 is now after semi 14; bracket membership must still win.
        date: "2026-10-06T22:00:00+03:00",
      }),
      provider(992_014, {
        roundEn: "Semifinals",
        homeId: 1563,
        awayId: 1567,
        date: "2026-10-05T18:00:00+03:00",
      }),
    ]);

    expect(resolved.map((row) => row.providerId)).toEqual([992_013, 992_014]);
  });

  it("changes only providerId during the static-to-provider transition", () => {
    const before = resolveGcFixtureIdentities(GC_FIXTURES.slice(0, 2), []);
    const after = resolveGcFixtureIdentities(GC_FIXTURES.slice(0, 2), [
      provider(993_001, { homeId: 23, awayId: 1570 }),
    ]);

    expect(after.map((row) => row.id)).toEqual(before.map((row) => row.id));
    expect(before.map((row) => row.providerId)).toEqual([null, null]);
    expect(after.map((row) => row.providerId)).toEqual([993_001, null]);
  });

  it("does not reopen the champion gate when the provider postpones match one", () => {
    const lockAt = gcImmutableTournamentLockAt(GC_FIXTURES)!;
    const delayed = resolveGcFixtureIdentities(GC_FIXTURES, [
      provider(994_001, {
        homeId: 23,
        awayId: 1570,
        date: "2026-10-10T21:00:00+03:00",
      }),
    ]);

    expect(delayed[0].provider?.date).toBe("2026-10-10T21:00:00+03:00");
    expect(isGcTournamentLocked(GC_FIXTURES, lockAt - 1)).toBe(false);
    expect(isGcTournamentLocked(GC_FIXTURES, lockAt)).toBe(true);
    expect(isGcTournamentLocked(GC_FIXTURES, lockAt + 30 * 24 * 60 * 60 * 1000)).toBe(true);
  });

  it("fails closed when a semifinal row has no valid bracket-slot signal", () => {
    const resolved = resolveGcFixtureIdentities(GC_FIXTURES.slice(12, 14), [
      provider(995_013, {
        roundEn: "Semi-finals",
        homeId: 999,
        awayId: 998,
        date: "2026-10-04T18:00:00+03:00",
      }),
    ]);
    expect(resolved.map((row) => row.providerId)).toEqual([null, null]);
  });
});
