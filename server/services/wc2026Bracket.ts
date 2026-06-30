/**
 * البنية الرسمية لشجرة الأدوار الإقصائية — كأس العالم 2026 (FIFA).
 *
 * API-Football يعطينا مباريات دور الـ32 بفرقها الحقيقية لكنه لا يحمل رقم المباراة
 * الرسمي ولا موضعها في الشجرة. نُثبّت البنية الرسمية (73–104) ونربط مباريات
 * الاشتراك بها، ثم نُرقّي الفائزين تلقائيًّa للدور التالي مع رموز FIFA (W74، 2A، …).
 */
import type { WcFixture, WcTeam } from "./worldCupService";
import { localizeRound, localizeVenue, WC_STATUS_AR } from "./worldCupNames";

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

/** رموز خانات دور الـ32 (مضيف، ضيف) — Annex C / الجدول الرسمي FIFA. */
export const WC2026_R32_SLOTS: Record<number, [string, string]> = {
  73: ["2A", "2B"],
  74: ["1E", "3ABCDF"],
  75: ["1F", "2C"],
  76: ["1C", "2F"],
  77: ["1I", "3CDFGH"],
  78: ["2E", "2I"],
  79: ["1A", "3CEFHI"],
  80: ["1L", "3EHIJK"],
  81: ["1D", "3BEFIJ"],
  82: ["1G", "3AEHIJ"],
  83: ["2K", "2L"],
  84: ["1H", "2J"],
  85: ["1B", "3EFGIJ"],
  86: ["1J", "2H"],
  87: ["1K", "3DEIJL"],
  88: ["2D", "2G"],
};

/** مواعيد وملاعب الأدوار الإقصائية (73–104) — +03:00 كما يُرسل API-Football. */
export const WC2026_KNOCKOUT_SCHEDULE: Record<
  number,
  { date: string; timestamp: number; venueEn: string; cityEn: string }
> = {
  89: { date: "2026-07-05T00:00:00+03:00", timestamp: 1783198800, venueEn: "Lincoln Financial Field", cityEn: "Philadelphia" },
  90: { date: "2026-07-04T20:00:00+03:00", timestamp: 1783184400, venueEn: "NRG Stadium", cityEn: "Houston" },
  91: { date: "2026-07-05T23:00:00+03:00", timestamp: 1783281600, venueEn: "MetLife Stadium", cityEn: "East Rutherford" },
  92: { date: "2026-07-06T02:00:00+03:00", timestamp: 1783292400, venueEn: "Estadio Azteca", cityEn: "Mexico City" },
  93: { date: "2026-07-06T22:00:00+03:00", timestamp: 1783364400, venueEn: "AT&T Stadium", cityEn: "Arlington" },
  94: { date: "2026-07-07T03:00:00+03:00", timestamp: 1783382400, venueEn: "Lumen Field", cityEn: "Seattle" },
  95: { date: "2026-07-07T19:00:00+03:00", timestamp: 1783440000, venueEn: "BC Place", cityEn: "Vancouver" },
  96: { date: "2026-07-07T23:00:00+03:00", timestamp: 1783454400, venueEn: "Mercedes-Benz Stadium", cityEn: "Atlanta" },
  97: { date: "2026-07-09T23:00:00+03:00", timestamp: 1783627200, venueEn: "Gillette Stadium", cityEn: "Foxborough" },
  98: { date: "2026-07-10T22:00:00+03:00", timestamp: 1783710000, venueEn: "SoFi Stadium", cityEn: "Inglewood" },
  99: { date: "2026-07-12T00:00:00+03:00", timestamp: 1783803600, venueEn: "Hard Rock Stadium", cityEn: "Miami Gardens" },
  100: { date: "2026-07-12T04:00:00+03:00", timestamp: 1783818000, venueEn: "Arrowhead Stadium", cityEn: "Kansas City" },
  101: { date: "2026-07-14T22:00:00+03:00", timestamp: 1784055600, venueEn: "AT&T Stadium", cityEn: "Arlington" },
  102: { date: "2026-07-15T22:00:00+03:00", timestamp: 1784142000, venueEn: "Mercedes-Benz Stadium", cityEn: "Atlanta" },
  103: { date: "2026-07-19T00:00:00+03:00", timestamp: 1784408400, venueEn: "Hard Rock Stadium", cityEn: "Miami Gardens" },
  104: { date: "2026-07-19T22:00:00+03:00", timestamp: 1784487600, venueEn: "MetLife Stadium", cityEn: "East Rutherford" },
};

const ROUND_EN: Record<WcRoundKey, string> = {
  "round of 32": "Round of 32",
  "round of 16": "Round of 16",
  "quarter-finals": "Quarter-finals",
  "semi-finals": "Semi-finals",
  final: "Final",
};

const THIRD_PLACE_ROUND_EN = "3rd Place Final";

/** معرّفات اصطناعية للمباريات غير المنشورة بعد في API-Football (90000000 + رقم المباراة). */
export const syntheticFixtureId = (matchNo: number): number => 90_000_000 + matchNo;

export const winnerSlotCode = (matchNo: number): string => `W${matchNo}`;
export const loserSlotCode = (matchNo: number): string => `L${matchNo}`;

export function slotCodesForMatch(matchNo: number): [string, string] {
  if (matchNo === WC2026_THIRD_PLACE_NO) return [loserSlotCode(101), loserSlotCode(102)];
  const r32 = WC2026_R32_SLOTS[matchNo];
  if (r32) return r32;
  const sources = WC2026_SOURCES[matchNo];
  if (sources) return [winnerSlotCode(sources[0]), winnerSlotCode(sources[1])];
  return ["TBD", "TBD"];
}

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

function loserTeam(fx?: WcFixture): WcTeam | undefined {
  const side = fixtureWinnerSide(fx);
  if (!fx || side == null) return undefined;
  return side === "home" ? fx.away : fx.home;
}

function placeholderTeam(code: string): WcTeam {
  return { id: 0, name: code, logo: "", winner: null };
}

function pendingStatus() {
  return {
    code: "NS",
    label: WC_STATUS_AR.NS ?? "لم تبدأ",
    elapsed: null as number | null,
    extra: null as number | null,
    live: false,
    finished: false,
  };
}

function roundEnForMatch(matchNo: number): string {
  if (matchNo === WC2026_THIRD_PLACE_NO) return THIRD_PLACE_ROUND_EN;
  const key = MATCH_ROUND[matchNo];
  return key ? ROUND_EN[key] : "Round of 32";
}

function resolveSide(
  fixtureSide: WcTeam | undefined,
  promoted: WcTeam | undefined,
  code: string,
): { team: WcTeam; code?: string } {
  if (isResolvedTeam(fixtureSide)) return { team: fixtureSide! };
  if (isResolvedTeam(promoted)) return { team: promoted! };
  return { team: placeholderTeam(code), code };
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
        slot.topLabel = winnerSlotCode(sources[0]);
        slot.bottomLabel = winnerSlotCode(sources[1]);
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

function enrichFixture(
  fx: WcFixture,
  matchNo: number,
  topTeam?: WcTeam,
  bottomTeam?: WcTeam,
): WcFixture {
  const [homeCodeRaw, awayCodeRaw] = slotCodesForMatch(matchNo);
  const home = resolveSide(fx.home, topTeam, homeCodeRaw);
  const away = resolveSide(fx.away, bottomTeam, awayCodeRaw);
  return {
    ...fx,
    matchNo,
    home: home.team,
    away: away.team,
    homeCode: home.code,
    awayCode: away.code,
  };
}

function buildSyntheticFixture(
  matchNo: number,
  topTeam?: WcTeam,
  bottomTeam?: WcTeam,
  loserTop?: WcTeam,
  loserBottom?: WcTeam,
): WcFixture {
  const sched = WC2026_KNOCKOUT_SCHEDULE[matchNo];
  const roundEn = roundEnForMatch(matchNo);
  const venue = sched
    ? localizeVenue(sched.venueEn, sched.cityEn)
    : { name: "", city: "" };
  const [homeCodeRaw, awayCodeRaw] = slotCodesForMatch(matchNo);
  const homePromoted = matchNo === WC2026_THIRD_PLACE_NO ? loserTop : topTeam;
  const awayPromoted = matchNo === WC2026_THIRD_PLACE_NO ? loserBottom : bottomTeam;
  const home = resolveSide(undefined, homePromoted, homeCodeRaw);
  const away = resolveSide(undefined, awayPromoted, awayCodeRaw);
  return {
    id: syntheticFixtureId(matchNo),
    date: sched?.date ?? "",
    timestamp: sched?.timestamp ?? 0,
    status: pendingStatus(),
    round: localizeRound(roundEn),
    roundEn,
    venue,
    home: home.team,
    away: away.team,
    goals: { home: null, away: null },
    penalties: null,
    matchNo,
    homeCode: home.code,
    awayCode: away.code,
  };
}

const ALL_KNOCKOUT_MATCH_NOS = (() => {
  const out: number[] = [];
  for (const key of WC_ROUND_KEYS) out.push(...WC2026_TREE[key]);
  out.push(WC2026_THIRD_PLACE_NO);
  return out.sort((a, b) => a - b);
})();

/**
 * يُكمّل جدول المباريات: يُبقي دور المجموعات من API، ويضيف/يُثرِي كل مباراة
 * إقصائية (73–104) برقمها الرسمي ورموز الخانات، مع ترقية الفائزين/الخاسرين تلقائيًّa.
 */
export function mergeFullKnockoutSchedule(apiFixtures: WcFixture[]): WcFixture[] {
  const groupStage = apiFixtures.filter((fx) => !canonKnockoutRound(fx.roundEn) && !isThirdPlaceRound(fx.roundEn));
  const byMatch = buildMatchIndex(apiFixtures);
  const knockoutOut: WcFixture[] = [];

  for (const matchNo of ALL_KNOCKOUT_MATCH_NOS) {
    const sources = WC2026_SOURCES[matchNo];
    const topTeam = sources ? winnerTeam(byMatch.get(sources[0])) : undefined;
    const bottomTeam = sources ? winnerTeam(byMatch.get(sources[1])) : undefined;
    const loserTop = matchNo === WC2026_THIRD_PLACE_NO ? loserTeam(byMatch.get(101)) : undefined;
    const loserBottom = matchNo === WC2026_THIRD_PLACE_NO ? loserTeam(byMatch.get(102)) : undefined;

    const existing = byMatch.get(matchNo);
    if (existing) {
      knockoutOut.push(enrichFixture(existing, matchNo, topTeam, bottomTeam));
    } else {
      knockoutOut.push(buildSyntheticFixture(matchNo, topTeam, bottomTeam, loserTop, loserBottom));
    }
  }

  return [...groupStage, ...knockoutOut].sort((a, b) => a.timestamp - b.timestamp);
}
