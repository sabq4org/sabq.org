/**
 * حسم فتحات خروج المغلوب في خليجي 27 من نتائج دور المجموعات.
 *
 * الفتحة (أول/ثاني مجموعة، أو فائز نصف نهائي) تُستبدل بالمنتخب فقط عندما
 * تحسمها المباريات المنتهية. المباريات المتبقية تُعدَّد فوزًا/تعادلًا/خسارة،
 * ولا يُعلَن المركز إلا إذا بقي المنتخب وحده فيه بالنقاط في كل سيناريو
 * (فارق الأهداف لم يُلعب بعد فيُعامَل التعادل بالنقاط كغير محسوم).
 * بعد اكتمال المجموعة: النقاط، ثم المواجهات المباشرة، ثم فارق الأهداف،
 * ثم الأهداف. تعادل لا يكسره ذلك يبقى placeholder. لا أسماء مزروعة.
 */
import type { GcBracketSlot } from "./gulfCupData";

export interface GcKnockoutSide {
  id: number;
}

export interface GcKnockoutFixture {
  matchNo: number;
  roundEn: string;
  home: GcKnockoutSide;
  away: GcKnockoutSide;
  status: { finished: boolean };
  goals: { home: number | null; away: number | null };
  penalties: { home: number | null; away: number | null };
}

interface PlayedMatch {
  homeId: number;
  awayId: number;
  homeGoals: number;
  awayGoals: number;
}

interface Mini {
  points: number;
  gd: number;
  gf: number;
  ga: number;
}

const GROUP_ROUND = /^group stage\b/i;
/** 3^6 = 729. مجموعة من 4 لا تتجاوز 6 مباريات. */
const MAX_REMAINING = 6;

function blankMini(): Mini {
  return { points: 0, gd: 0, gf: 0, ga: 0 };
}

function applyScore(row: Mini, scored: number, conceded: number): void {
  row.gf += scored;
  row.ga += conceded;
  row.gd = row.gf - row.ga;
  if (scored > conceded) row.points += 3;
  else if (scored === conceded) row.points += 1;
}

function miniTable(ids: readonly number[], matches: readonly PlayedMatch[]): Map<number, Mini> {
  const set = new Set(ids);
  const stats = new Map<number, Mini>();
  for (const id of ids) stats.set(id, blankMini());
  for (const match of matches) {
    if (!set.has(match.homeId) || !set.has(match.awayId) || match.homeId === match.awayId) continue;
    const home = stats.get(match.homeId);
    const away = stats.get(match.awayId);
    if (!home || !away) continue;
    applyScore(home, match.homeGoals, match.awayGoals);
    applyScore(away, match.awayGoals, match.homeGoals);
  }
  return stats;
}

function splitTied(ids: number[], matches: readonly PlayedMatch[], overall: Map<number, Mini>): number[][] {
  if (ids.length <= 1) return [ids];
  const h2h = miniTable(ids, matches);
  const keys: Array<(id: number) => number> = [
    (id) => h2h.get(id)?.points ?? 0,
    (id) => h2h.get(id)?.gd ?? 0,
    (id) => h2h.get(id)?.gf ?? 0,
    (id) => overall.get(id)?.gd ?? 0,
    (id) => overall.get(id)?.gf ?? 0,
  ];
  return splitByCriteria(ids, keys, 0, matches, overall);
}

function splitByCriteria(
  ids: number[],
  keys: Array<(id: number) => number>,
  keyIndex: number,
  matches: readonly PlayedMatch[],
  overall: Map<number, Mini>,
): number[][] {
  if (ids.length <= 1) return [ids];
  if (keyIndex >= keys.length) return [ids];
  const buckets = new Map<number, number[]>();
  for (const id of ids) {
    const key = keys[keyIndex](id);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(id);
    else buckets.set(key, [id]);
  }
  const ordered = [...buckets.keys()].sort((a, b) => b - a);
  if (ordered.length === 1) return splitByCriteria(ids, keys, keyIndex + 1, matches, overall);
  const out: number[][] = [];
  for (const key of ordered) {
    const group = buckets.get(key) ?? [];
    if (group.length === 1) out.push(group);
    else out.push(...splitTied(group, matches, overall));
  }
  return out;
}

/** كتل مرتَّبة. الكتلة الأطول من منتخب واحد ما زالت متعادلة بعد كل كواسر التعادل. */
export function rankCompletedGroup(teamIds: readonly number[], matches: readonly PlayedMatch[]): number[][] {
  const overall = miniTable(teamIds, matches);
  const byPoints = new Map<number, number[]>();
  for (const id of teamIds) {
    const points = overall.get(id)?.points ?? 0;
    const bucket = byPoints.get(points);
    if (bucket) bucket.push(id);
    else byPoints.set(points, [id]);
  }
  const blocks: number[][] = [];
  for (const points of [...byPoints.keys()].sort((a, b) => b - a)) {
    const group = byPoints.get(points) ?? [];
    if (group.length === 1) blocks.push(group);
    else blocks.push(...splitTied(group, matches, overall));
  }
  return blocks;
}

function singletonRanks(blocks: number[][]): Map<number, number> {
  const ranks = new Map<number, number>();
  let rank = 1;
  for (const block of blocks) {
    if (block.length === 1) ranks.set(rank, block[0]);
    rank += block.length;
  }
  return ranks;
}

function strictPointRanks(teamIds: readonly number[], points: Map<number, number>): Map<number, number> {
  const sorted = [...teamIds].sort(
    (a, b) => (points.get(b) ?? 0) - (points.get(a) ?? 0) || a - b,
  );
  const ranks = new Map<number, number>();
  for (let index = 0; index < sorted.length; index += 1) {
    const id = sorted[index];
    const mine = points.get(id) ?? 0;
    const above = index > 0 ? (points.get(sorted[index - 1]) ?? 0) : null;
    const below = index + 1 < sorted.length ? (points.get(sorted[index + 1]) ?? 0) : null;
    if (above != null && above <= mine) continue;
    if (below != null && below >= mine) continue;
    ranks.set(index + 1, id);
  }
  return ranks;
}

/**
 * المركز (1 أو 2) → معرّف المنتخب إن كان محسومًا. الغياب يعني أن الفتحة تبقى placeholder.
 */
export function decidedGroupRanks(
  teamIds: readonly number[],
  played: readonly PlayedMatch[],
  remaining: readonly { homeId: number; awayId: number }[],
): Map<number, number> {
  const ids = teamIds.filter((id) => id > 0);
  if (ids.length === 0) return new Map();
  if (remaining.length === 0) return singletonRanks(rankCompletedGroup(ids, played));
  if (remaining.length > MAX_REMAINING) return new Map();

  const base = miniTable(ids, played);
  const holders = new Map<number, number | null>();
  const total = 3 ** remaining.length;
  for (let mask = 0; mask < total; mask += 1) {
    const points = new Map<number, number>();
    for (const id of ids) points.set(id, base.get(id)?.points ?? 0);
    let cursor = mask;
    for (const match of remaining) {
      const outcome = cursor % 3;
      cursor = Math.floor(cursor / 3);
      if (outcome === 0) points.set(match.homeId, (points.get(match.homeId) ?? 0) + 3);
      else if (outcome === 1) {
        points.set(match.homeId, (points.get(match.homeId) ?? 0) + 1);
        points.set(match.awayId, (points.get(match.awayId) ?? 0) + 1);
      } else points.set(match.awayId, (points.get(match.awayId) ?? 0) + 3);
    }
    const ranks = strictPointRanks(ids, points);
    for (const rank of [1, 2]) {
      const id = ranks.get(rank) ?? null;
      if (!holders.has(rank)) holders.set(rank, id);
      else if (holders.get(rank) !== id) holders.set(rank, null);
    }
  }

  const decided = new Map<number, number>();
  for (const [rank, id] of holders) {
    if (id != null) decided.set(rank, id);
  }
  return decided;
}

function isGroupMatch(roundEn: string): boolean {
  return GROUP_ROUND.test(roundEn.trim());
}

function winnerId(fixture: GcKnockoutFixture): number | null {
  if (!fixture.status.finished || fixture.home.id <= 0 || fixture.away.id <= 0) return null;
  const homeGoals = fixture.goals.home;
  const awayGoals = fixture.goals.away;
  if (homeGoals == null || awayGoals == null) return null;
  if (homeGoals > awayGoals) return fixture.home.id;
  if (awayGoals > homeGoals) return fixture.away.id;
  const homePens = fixture.penalties.home;
  const awayPens = fixture.penalties.away;
  if (homePens == null || awayPens == null || homePens === awayPens) return null;
  return homePens > awayPens ? fixture.home.id : fixture.away.id;
}

function slotTeamId(
  slot: GcBracketSlot | undefined,
  ranksByGroup: Map<number, Map<number, number>>,
  byMatch: Map<number, GcKnockoutFixture>,
): number | null {
  if (!slot) return null;
  if (slot.kind === "groupRank") {
    return ranksByGroup.get(slot.groupIndex)?.get(slot.rank) ?? null;
  }
  const source = byMatch.get(slot.matchNo);
  return source ? winnerId(source) : null;
}

/**
 * يعيد نسخ المباريات مع استبدال placeholder (id <= 0) فقط. منتخب المزوّد
 * الموجود على الفتحة لا يُستبدل حتى لو خالف الحساب.
 */
export function applyGcKnockoutTeams<T extends GcKnockoutFixture>(
  fixtures: readonly T[],
  slotsByMatch: ReadonlyMap<number, { homeSlot?: GcBracketSlot; awaySlot?: GcBracketSlot }>,
  groups: readonly { teamIds: readonly number[] }[],
  hydrate: (id: number) => T["home"],
): T[] {
  const ranksByGroup = new Map<number, Map<number, number>>();
  groups.forEach((group, index) => {
    const memberIds = new Set(group.teamIds);
    const played: PlayedMatch[] = [];
    const remaining: { homeId: number; awayId: number }[] = [];
    for (const fixture of fixtures) {
      if (!isGroupMatch(fixture.roundEn)) continue;
      if (!memberIds.has(fixture.home.id) || !memberIds.has(fixture.away.id)) continue;
      const homeGoals = fixture.goals.home;
      const awayGoals = fixture.goals.away;
      if (fixture.status.finished && homeGoals != null && awayGoals != null) {
        played.push({
          homeId: fixture.home.id,
          awayId: fixture.away.id,
          homeGoals,
          awayGoals,
        });
      } else {
        remaining.push({ homeId: fixture.home.id, awayId: fixture.away.id });
      }
    }
    ranksByGroup.set(index, decidedGroupRanks(group.teamIds, played, remaining));
  });

  const working = fixtures.map((fixture) => ({
    ...fixture,
    home: { ...fixture.home },
    away: { ...fixture.away },
    goals: { ...fixture.goals },
    penalties: { ...fixture.penalties },
    status: { ...fixture.status },
  }));
  const byMatch = new Map(working.map((fixture) => [fixture.matchNo, fixture]));

  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false;
    for (const fixture of working) {
      const slots = slotsByMatch.get(fixture.matchNo);
      if (!slots) continue;
      if (fixture.home.id <= 0) {
        const id = slotTeamId(slots.homeSlot, ranksByGroup, byMatch);
        if (id) {
          fixture.home = { ...fixture.home, ...hydrate(id), id };
          changed = true;
        }
      }
      if (fixture.away.id <= 0) {
        const id = slotTeamId(slots.awaySlot, ranksByGroup, byMatch);
        if (id) {
          fixture.away = { ...fixture.away, ...hydrate(id), id };
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  return fixtures.map((fixture, index) => {
    const next = working[index];
    if (!next || (next.home.id === fixture.home.id && next.away.id === fixture.away.id)) return fixture;
    return { ...fixture, home: next.home as T["home"], away: next.away as T["away"] };
  });
}
