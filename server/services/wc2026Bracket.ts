/**
 * البنية الرسمية لشجرة الأدوار الإقصائية — كأس العالم 2026 (FIFA).
 *
 * API-Football يعطينا مباريات دور الـ32 بفرقها الحقيقية لكنه لا يحمل رقم المباراة
 * الرسمي ولا موضعها في الشجرة. نُثبّت البنية الرسمية (73–104) ونربط مباريات
 * الاشتراك بها، ثم نُرقّي الفائزين تلقائيًّa للدور التالي مع وسوم «الفائز من مباراة …».
 */
import type { WcFixture, WcTeam } from "./worldCupService";

export const WC_ROUND_KEYS = [
  "round of 32",
  "round of 16",
  "quarter-finals",
  "semi-finals",
  "final",
] as const;
export type WcRoundKey = (typeof WC_ROUND_KEYS)[number];

export const WC_ROUND_LABELS: Record<WcRoundKey, string> = {
  "round of 32": "دور الـ32",
  "round of 16": "دور الـ16",
  "quarter-finals": "دور الـ8",
  "semi-finals": "دور الـ4",
  final: "النهائي",
};

export const WC2026_TREE: Record<WcRoundKey, number[]> = {
  "round of 32": [74, 77, 73, 75, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87],
  "round of 16": [89, 90, 93, 94, 91, 92, 95, 96],
  "quarter-finals": [97, 98, 99, 100],
  "semi-finals": [101, 102],
  final: [104],
};

export const WC2026_SOURCES: Record<number, [number, number]> = {
  89: [74, 77],
  90: [73, 75],
  91: [76, 78],
  92: [79, 80],
  93: [83, 84],
  94: [81, 82],
  95: [86, 88],
  96: [85, 87],
  97: [89, 90],
  98: [93, 94],
  99: [91, 92],
  100: [95, 96],
  101: [97, 98],
  102: [99, 100],
  104: [101, 102],
};

export const WC2026_THIRD_PLACE_NO = 103;

export const WC2026_R32_FIXTURE_TO_MATCH: Record<number, number> = {
  1561329: 73,
  1565176: 74,
  1562345: 75,
  1562344: 76,
  1565177: 77,
  1564789: 78,
  1567306: 79,
  1567307: 80,
  1562586: 81,
  1567308: 82,
  1567309: 83,
  1567311: 84,
  1567312: 85,
  1565179: 86,
  1567310: 87,
  1565178: 88,
};

const MATCH_ROUND: Record<number, WcRoundKey> = (() => {
  const out: Record<number, WcRoundKey> = {};
  for (const key of WC_ROUND_KEYS) for (const no of WC2026_TREE[key]) out[no] = key;
  return out;
})();

export function canonKnockoutRound(roundEn: string): WcRoundKey | null {
  const r = (roundEn || "").trim().toLowerCase();
  if (r.startsWith("round of 32")) return "round of 32";
  if (r.startsWith("round of 16")) return "round of 16";
  if (r.startsWith("quarter")) return "quarter-finals";
  if (r.startsWith("semi")) return "semi-finals";
  if (r === "final") return "final";
  return null;
}

const THIRD_PLACE_KEYS = new Set(["3rd place final", "third place", "3rd place", "play-off for third place"]);
export function isThirdPlaceRound(roundEn: string): boolean {
  return THIRD_PLACE_KEYS.has((roundEn || "").trim().toLowerCase());
}

/** منتخب محسوم (له معرّف وشعار) مقابل خانة بانتظار التأهل. */
export function isResolvedTeam(team?: WcTeam | null): boolean {
  return Boolean(team?.id && team?.logo);
}

export function fixtureWinnerSide(fx?: WcFixture): "home" | "away" | null {
  if (!fx || !fx.status.finished) return null;
  if (fx.home.winner === true) return "home";
  if (fx.away.winner === true) return "away";
  const hg = fx.goals.home ?? 0;
  const ag = fx.goals.away ?? 0;
  if (hg !== ag) return hg > ag ? "home" : "away";
  if (fx.penalties) {
    const hp = fx.penalties.home ?? 0;
    const ap = fx.penalties.away ?? 0;
    if (hp !== ap) return hp > ap ? "home" : "away";
  }
  return null;
}

function winnerTeamId(fx?: WcFixture): number | null {
  const side = fixtureWinnerSide(fx);
  if (!fx || side == null) return null;
  return (side === "home" ? fx.home.id : fx.away.id) || null;
}

function winnerTeam(fx?: WcFixture): WcTeam | undefined {
  const id = winnerTeamId(fx);
  if (!fx || id == null) return undefined;
  return fx.home.id === id ? fx.home : fx.away;
}

export function buildMatchIndex(fixtures: WcFixture[]): Map<number, WcFixture> {
  const byMatch = new Map<number, WcFixture>();
  const used = new Set<number>();

  const byRound = new Map<WcRoundKey, WcFixture[]>();
  let thirdPlaceFixture: WcFixture | undefined;
  for (const fx of fixtures) {
    if (isThirdPlaceRound(fx.roundEn)) {
      thirdPlaceFixture = thirdPlaceFixture ?? fx;
      continue;
    }
    const round = canonKnockoutRound(fx.roundEn);
    if (!round) continue;
    const arr = byRound.get(round) ?? [];
    arr.push(fx);
    byRound.set(round, arr);
  }

  for (const fx of byRound.get("round of 32") ?? []) {
    const no = WC2026_R32_FIXTURE_TO_MATCH[fx.id];
    if (no != null && !byMatch.has(no)) {
      byMatch.set(no, fx);
      used.add(fx.id);
    }
  }

  const order = [89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 104];
  for (const no of order) {
    if (byMatch.has(no)) continue;
    const [a, b] = WC2026_SOURCES[no];
    const wantA = winnerTeamId(byMatch.get(a));
    const wantB = winnerTeamId(byMatch.get(b));
    if (wantA == null || wantB == null) continue;
    const pool = byRound.get(MATCH_ROUND[no]) ?? [];
    const fx = pool.find(
      (f) =>
        !used.has(f.id) &&
        f.home.id &&
        f.away.id &&
        ((f.home.id === wantA && f.away.id === wantB) || (f.home.id === wantB && f.away.id === wantA)),
    );
    if (fx) {
      byMatch.set(no, fx);
      used.add(fx.id);
    }
  }

  if (thirdPlaceFixture) {
    byMatch.set(WC2026_THIRD_PLACE_NO, thirdPlaceFixture);
  }

  return byMatch;
}

export interface WcBracketSlot {
  matchNo: number;
  fixture?: WcFixture;
  sources?: [number, number];
  topTeam?: WcTeam;
  bottomTeam?: WcTeam;
  topLabel?: string;
  bottomLabel?: string;
}

export interface WcBracketColumn {
  key: WcRoundKey;
  label: string;
  roundIndex: number;
  slots: WcBracketSlot[];
}

export interface WcBracketModel {
  columns: WcBracketColumn[];
  thirdPlace?: WcFixture;
  hasAny: boolean;
}

export function buildBracketModel(fixtures: WcFixture[]): WcBracketModel {
  const byMatch = buildMatchIndex(fixtures);
  const columns: WcBracketColumn[] = WC_ROUND_KEYS.map((key, roundIndex) => ({
    key,
    label: WC_ROUND_LABELS[key],
    roundIndex,
    slots: WC2026_TREE[key].map((matchNo) => {
      const fixture = byMatch.get(matchNo);
      const sources = WC2026_SOURCES[matchNo];
      const slot: WcBracketSlot = { matchNo, fixture, sources };
      if (sources) {
        slot.topTeam = winnerTeam(byMatch.get(sources[0]));
        slot.bottomTeam = winnerTeam(byMatch.get(sources[1]));
        slot.topLabel = `الفائز من مباراة ${sources[0]}`;
        slot.bottomLabel = `الفائز من مباراة ${sources[1]}`;
      }
      return slot;
    }),
  }));
  const hasAny = columns.some((c) => c.slots.some((s) => s.fixture));
  return { columns, thirdPlace: byMatch.get(WC2026_THIRD_PLACE_NO), hasAny };
}

/** يُعيد الفريق المعروض في خانة الشجرة (فريق المباراة إن حُسم، وإلا الفائز المُرقّى). */
export function resolveBracketSide(
  fixtureSide: WcTeam | undefined,
  promoted: WcTeam | undefined,
): WcTeam | undefined {
  if (isResolvedTeam(fixtureSide)) return fixtureSide;
  if (isResolvedTeam(promoted)) return promoted;
  return undefined;
}
