/**
 * Pure identity contract for Gulf Cup 27 fixtures.
 *
 * `id` belongs to Sabq and is stable for the lifetime of a fixture. Provider
 * identifiers are metadata only: they may appear after predictions already
 * exist and must never replace the internal id used by storage or public APIs.
 */

export interface GcSeedFixtureIdentity {
  id: number;
  matchNo: number;
  kickoff: string;
  roundEn: string;
  homeId: number | null;
  awayId: number | null;
  /** Eligible teams for unresolved bracket slots (for example A1 vs B2). */
  homeCandidateIds?: readonly number[];
  awayCandidateIds?: readonly number[];
}

export interface GcProviderFixtureIdentity {
  providerId: number;
  matchNo: number | null;
  date: string;
  timestamp: number;
  roundEn: string;
  homeId: number;
  awayId: number;
}

export interface GcResolvedFixtureIdentity<
  S extends GcSeedFixtureIdentity,
  P extends GcProviderFixtureIdentity,
> {
  /** Stable Sabq fixture id (the only id allowed in storage and route params). */
  id: number;
  matchNo: number;
  /** API-Football id, when the provider has published a matching fixture. */
  providerId: number | null;
  seed: S;
  provider: P | null;
}

/** Earliest immutable seed kickoff; provider reschedules must never move it. */
export function gcImmutableTournamentLockAt(
  seeds: readonly GcSeedFixtureIdentity[],
): number | null {
  let earliest = Number.POSITIVE_INFINITY;
  for (const seed of seeds) {
    const parsed = Date.parse(seed.kickoff);
    if (Number.isFinite(parsed) && parsed < earliest) earliest = parsed;
  }
  return Number.isFinite(earliest) ? earliest : null;
}

/** Monotonic long-prediction/reveal gate based only on the internal schedule. */
export function isGcTournamentLocked(
  seeds: readonly GcSeedFixtureIdentity[],
  nowMs = Date.now(),
): boolean {
  const lockAt = gcImmutableTournamentLockAt(seeds);
  return lockAt != null && nowMs >= lockAt;
}

function normalizedRound(round: string): string | null {
  const value = String(round ?? "")
    .trim()
    .toLowerCase()
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/[_\s]+/g, " ");
  if (!value) return null;

  const group = value.match(/(?:group(?: stage)?|المجموعة|دور المجموعات)\s*-?\s*(\d+)/i);
  if (group) return `group:${Number(group[1])}`;
  if (/semi\s*-?\s*final|semifinal|نصف النهائي/.test(value)) return "semifinal";
  if (/quarter\s*-?\s*final|quarterfinal|ربع النهائي/.test(value)) return "quarterfinal";
  if (/round of 16|last 16|دور (?:الـ)?16/.test(value)) return "round-of-16";
  if (/\bfinals?\b|النهائي/.test(value)) return "final";
  return value.replace(/[^a-z0-9\u0600-\u06ff]+/g, "-").replace(/^-|-$/g, "") || null;
}

function teamPair(homeId: number | null, awayId: number | null): string | null {
  if (!homeId || !awayId || homeId <= 0 || awayId <= 0) return null;
  return [homeId, awayId].sort((a, b) => a - b).join(":");
}

function matchesBracketSlot(
  seed: GcSeedFixtureIdentity,
  provider: GcProviderFixtureIdentity,
): boolean {
  const homeCandidates = seed.homeCandidateIds;
  const awayCandidates = seed.awayCandidateIds;
  return Boolean(
    homeCandidates?.length &&
    awayCandidates?.length &&
    homeCandidates.includes(provider.homeId) &&
    awayCandidates.includes(provider.awayId),
  );
}

function kickoffMs(value: string, timestamp?: number): number {
  if (timestamp && Number.isFinite(timestamp) && timestamp > 0) return timestamp * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function providerPreference<S extends GcSeedFixtureIdentity, P extends GcProviderFixtureIdentity>(
  seed: S,
  provider: P,
): number {
  const seedRound = normalizedRound(seed.roundEn);
  const providerRound = normalizedRound(provider.roundEn);
  const sameRound = seedRound && providerRound && seedRound === providerRound ? 1 : 0;
  const sameTeams = teamPair(seed.homeId, seed.awayId) === teamPair(provider.homeId, provider.awayId) ? 1 : 0;
  const distance = Math.abs(kickoffMs(seed.kickoff) - kickoffMs(provider.date, provider.timestamp));
  // Explicit identity signals dominate time. Time is only a deterministic
  // tie-breaker and therefore cannot break postponements by itself.
  return sameRound * 1_000_000_000_000 + sameTeams * 100_000_000_000 - Math.min(distance, 99_999_999_999);
}

/**
 * Resolve provider rows onto the 15 immutable Sabq seeds.
 *
 * Matching order is intentionally conservative:
 * 1. official match number, when a provider exposes it;
 * 2. exact unordered team pair (date-independent, so postponements still map);
 * 3. knockout bracket constraints (A1×B2 / B1×A2), independent of date;
 * 4. a unique placeholder in a round (the final).
 *
 * Ambiguous partial knockout data is left unmatched instead of risking a
 * prediction/duel being attached to the wrong match.
 */
export function resolveGcFixtureIdentities<
  S extends GcSeedFixtureIdentity,
  P extends GcProviderFixtureIdentity,
>(seedsInput: readonly S[], providersInput: readonly P[]): GcResolvedFixtureIdentity<S, P>[] {
  const seeds = [...seedsInput].sort((a, b) => a.matchNo - b.matchNo || a.id - b.id);
  const seenProviderIds = new Set<number>();
  const providers = providersInput
    .filter((provider) => {
      if (!Number.isInteger(provider.providerId) || provider.providerId <= 0) return false;
      if (seenProviderIds.has(provider.providerId)) return false;
      seenProviderIds.add(provider.providerId);
      return true;
    })
    .sort(
      (a, b) =>
        kickoffMs(a.date, a.timestamp) - kickoffMs(b.date, b.timestamp) ||
        a.providerId - b.providerId,
    );

  const matched = new Map<number, P>();
  const usedProviderIds = new Set<number>();
  const assign = (seed: S, provider: P): void => {
    if (matched.has(seed.id) || usedProviderIds.has(provider.providerId)) return;
    matched.set(seed.id, provider);
    usedProviderIds.add(provider.providerId);
  };

  // 1) Official match number is the strongest signal and survives team/date updates.
  for (const seed of seeds) {
    const candidates = providers
      .filter(
        (provider) =>
          !usedProviderIds.has(provider.providerId) && provider.matchNo === seed.matchNo,
      )
      .sort((a, b) => providerPreference(seed, b) - providerPreference(seed, a));
    if (candidates[0]) assign(seed, candidates[0]);
  }

  // 2) Group-stage (and any already-known knockout) identities follow the team pair,
  // never the date. This is the critical postponement guarantee.
  for (const seed of seeds) {
    if (matched.has(seed.id)) continue;
    const pair = teamPair(seed.homeId, seed.awayId);
    if (!pair) continue;
    const candidates = providers
      .filter(
        (provider) =>
          !usedProviderIds.has(provider.providerId) &&
          teamPair(provider.homeId, provider.awayId) === pair,
      )
      .sort((a, b) => providerPreference(seed, b) - providerPreference(seed, a));
    if (candidates[0]) assign(seed, candidates[0]);
  }

  // 3) Match unresolved knockout slots through their immutable bracket path.
  // Home/away group membership distinguishes semi 13 (A1×B2) from semi 14
  // (B1×A2), even when one is postponed beyond the other.
  for (const seed of seeds) {
    if (matched.has(seed.id) || teamPair(seed.homeId, seed.awayId)) continue;
    const seedRound = normalizedRound(seed.roundEn);
    const candidates = providers
      .filter((provider) =>
        !usedProviderIds.has(provider.providerId) &&
        normalizedRound(provider.roundEn) === seedRound &&
        matchesBracketSlot(seed, provider),
      )
      .sort((a, b) => providerPreference(seed, b) - providerPreference(seed, a));
    if (candidates[0]) assign(seed, candidates[0]);
  }

  // 4) A placeholder round with exactly one internal slot (the final) is safe.
  // Multiple unresolved slots deliberately remain unmatched without bracket
  // constraints; chronological order can flip after a postponement.
  const placeholderRounds = new Set(
    seeds
      .filter((seed) => !matched.has(seed.id) && !teamPair(seed.homeId, seed.awayId))
      .map((seed) => normalizedRound(seed.roundEn))
      .filter((round): round is string => Boolean(round)),
  );
  for (const round of placeholderRounds) {
    const roundSeeds = seeds.filter(
      (seed) =>
        !matched.has(seed.id) &&
        !teamPair(seed.homeId, seed.awayId) &&
        normalizedRound(seed.roundEn) === round,
    );
    const roundProviders = providers.filter(
      (provider) =>
        !usedProviderIds.has(provider.providerId) && normalizedRound(provider.roundEn) === round,
    );
    if (roundSeeds.length === 0 || roundProviders.length === 0) continue;

    if (roundSeeds.length === 1 && roundProviders.length === 1) {
      const [seed] = roundSeeds;
      const candidate = roundProviders[0];
      if (candidate) assign(seed, candidate);
    }
  }

  return seeds.map((seed) => {
    const provider = matched.get(seed.id) ?? null;
    return {
      id: seed.id,
      matchNo: seed.matchNo,
      providerId: provider?.providerId ?? null,
      seed,
      provider,
    };
  });
}
