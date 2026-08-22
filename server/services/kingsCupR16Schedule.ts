/**
 * قرعة دور الـ16 لكأس الملك 2026/27 — أُعلنت 20 أغسطس 2026 (ثمانية / الاتحاد).
 * API-Football (504 / موسم 2027) لم ينشر الصفوف بعد؛ نزرع المواجهات حتى يفعل.
 * الساعات تقديرية داخل نافذة 19–20 أكتوبر حتى يصدر الموعد الرسمي.
 */
import { localizeSplRound, localizeSplTeamName } from "./saudiLeagueNames";
import { isEnglishSports } from "./sportsLang";
import { WC_STATUS_AR, WC_STATUS_EN } from "./worldCupNames";

/** الموسم الذي زُرعت فيه قرعة 20 أغسطس 2026 (تسمية المزود 2027). */
export const KC_R16_SEASON = 2027;

export const KC_SYNTHETIC_ID_MIN = 91_000_001;
export const KC_SYNTHETIC_ID_MAX = 91_000_008;

export function isKcSyntheticFixtureId(id: number): boolean {
  return id >= KC_SYNTHETIC_ID_MIN && id <= KC_SYNTHETIC_ID_MAX;
}

export function isKingsCupR16Round(round: string | null | undefined): boolean {
  const r = (round ?? "").trim().toLowerCase();
  return r === "round of 16" || r.includes("دور الـ16") || r.includes("دور ال16");
}

export type KcR16Team = {
  id: number;
  name: string;
  logo: string;
  winner: boolean | null;
};

export type KcR16Fixture = {
  id: number;
  date: string;
  timestamp: number;
  status: {
    code: string;
    label: string;
    elapsed: number | null;
    extra: number | null;
    live: boolean;
    finished: boolean;
  };
  round: string;
  venue: { name: string; city: string };
  home: KcR16Team;
  away: KcR16Team;
  goals: { home: number | null; away: number | null };
  penalties?: { home: number | null; away: number | null } | null;
};

export type KcR16Tie = {
  id: number;
  homeId: number;
  awayId: number;
  homeNameEn: string;
  awayNameEn: string;
  date: string;
};

/** صاحب الأرض أولًا كما نُشرت القرعة. */
export const KC_R16_TIES: readonly KcR16Tie[] = [
  { id: 91_000_001, homeId: 2961, awayId: 2977, homeNameEn: "Al-Orobah", awayNameEn: "Al-Okhdood", date: "2026-10-19T19:15:00+03:00" },
  { id: 91_000_002, homeId: 2933, awayId: 10513, homeNameEn: "Al-Qadsiah", awayNameEn: "NEOM", date: "2026-10-19T21:00:00+03:00" },
  { id: 91_000_003, homeId: 2936, awayId: 2937, homeNameEn: "Al-Taawoun", awayNameEn: "Al-Wehda", date: "2026-10-19T21:00:00+03:00" },
  { id: 91_000_004, homeId: 2939, awayId: 10509, homeNameEn: "Al-Nassr", awayNameEn: "Al-Kholood", date: "2026-10-19T21:00:00+03:00" },
  { id: 91_000_005, homeId: 2958, awayId: 2938, homeNameEn: "Al-Jabalain", awayNameEn: "Al-Ittihad", date: "2026-10-20T19:15:00+03:00" },
  { id: 91_000_006, homeId: 10511, awayId: 2944, homeNameEn: "Al-Riyadh", awayNameEn: "Al-Fayha", date: "2026-10-20T19:15:00+03:00" },
  { id: 91_000_007, homeId: 2932, awayId: 2945, homeNameEn: "Al-Hilal", awayNameEn: "Al-Hazem", date: "2026-10-20T21:00:00+03:00" },
  { id: 91_000_008, homeId: 26357, awayId: 2929, homeNameEn: "Al-Ula", awayNameEn: "Al-Ahli", date: "2026-10-20T21:00:00+03:00" },
];

function pairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function pendingStatus(): KcR16Fixture["status"] {
  return {
    code: "NS",
    label: isEnglishSports() ? WC_STATUS_EN.NS : WC_STATUS_AR.NS,
    elapsed: null,
    extra: null,
    live: false,
    finished: false,
  };
}

function teamFromPool(
  fixtures: KcR16Fixture[],
  id: number,
  nameEn: string,
): KcR16Team {
  for (const f of fixtures) {
    for (const t of [f.home, f.away]) {
      if (t.id === id) return { ...t, winner: null };
    }
  }
  return {
    id,
    name: localizeSplTeamName(id, nameEn),
    logo: `https://media.api-sports.io/football/teams/${id}.png`,
    winner: null,
  };
}

export function buildKcR16Synthetic(
  tie: KcR16Tie,
  pool: KcR16Fixture[] = [],
): KcR16Fixture {
  const ts = Math.floor(Date.parse(tie.date) / 1000);
  return {
    id: tie.id,
    date: tie.date,
    timestamp: Number.isFinite(ts) ? ts : 0,
    status: pendingStatus(),
    round: localizeSplRound("Round of 16"),
    venue: { name: "", city: "" },
    home: teamFromPool(pool, tie.homeId, tie.homeNameEn),
    away: teamFromPool(pool, tie.awayId, tie.awayNameEn),
    goals: { home: null, away: null },
    penalties: null,
  };
}

/**
 * يُبقي صفوف المزود كما هي، ويضيف مواجهات القرعة الناقصة فقط.
 * إن نشر API-Football المباراة (نفس الثنائي بأي ترتيب) تُحذف النسخة الاصطناعية.
 */
export function mergeKingsCupR16Schedule<T extends KcR16Fixture>(apiFixtures: T[]): T[] {
  const publishedKeys = new Set<string>();
  for (const f of apiFixtures) {
    if (isKingsCupR16Round(f.round) || isKcSyntheticFixtureId(f.id)) {
      publishedKeys.add(pairKey(f.home.id, f.away.id));
    }
  }
  const extras = KC_R16_TIES.filter(
    (tie) => !publishedKeys.has(pairKey(tie.homeId, tie.awayId)),
  ).map((tie) => buildKcR16Synthetic(tie, apiFixtures) as T);
  if (extras.length === 0) return apiFixtures;
  return [...apiFixtures, ...extras].sort((a, b) => a.timestamp - b.timestamp);
}
