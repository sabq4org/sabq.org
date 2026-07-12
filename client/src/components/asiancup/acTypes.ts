/**
 * أنواع ومساعدات قسم كأس آسيا 2027 (تطابق DTOs الخادم في asianCupService.ts).
 * تُعيد استخدام مساعدات التاريخ/العدّ التنازلي من قسم المونديال لتفادي التكرار.
 */
export {
  countdownTo,
  formatKickoffDay,
  formatKickoffTime,
  formatMarketValue,
  riyadhDayKey,
  todayRiyadhKey,
  type WcCountdown as AcCountdown,
} from "@/components/worldcup/wcTypes";

import { riyadhDayKey, formatKickoffDay } from "@/components/worldcup/wcTypes";

export const SAUDI_TEAM_ID = 23;

export interface AcTeam {
  id: number;
  name: string;
  nameEn?: string;
  logo: string;
  /** تصنيف فيفا (TheSports عبر جسر الخادم) — اختياري */
  fifaRank?: number | null;
}

export interface AcFixture {
  id: number;
  date: string;
  timestamp: number;
  status: {
    code: string;
    label: string;
    elapsed: number | null;
    live: boolean;
    finished: boolean;
  };
  round: string;
  roundEn: string;
  venue: { name: string; city: string };
  home: AcTeam;
  away: AcTeam;
  goals: { home: number | null; away: number | null };
}

export interface AcStandingRow {
  rank: number;
  team: AcTeam;
  played: number;
  win: number;
  draw: number;
  lose: number;
  goalsFor: number;
  goalsAgainst: number;
  goalsDiff: number;
  points: number;
  live?: boolean;
  liveDelta?: number;
}

export interface AcGroup {
  name: string;
  rows: AcStandingRow[];
}

export interface AcOverview {
  startsAt: string | null;
  endsAt: string | null;
  teamsCount: number;
  groupsCount: number;
  host: string;
  venues: { name: string; city: string }[];
  started: boolean;
  saudi: {
    team: AcTeam | null;
    group: string | null;
    fixtures: AcFixture[];
  };
  nextMatch: AcFixture | null;
}

/** عدّ تنازلي من سلسلة ISO (تصل بإزاحة +03:00 فالتحويل مباشر). */
export function countdownFromIso(iso: string | null): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
} {
  const target = iso ? new Date(iso).getTime() : 0;
  const total = Math.max(0, target - Date.now());
  return {
    days: Math.floor(total / 86_400_000),
    hours: Math.floor((total % 86_400_000) / 3_600_000),
    minutes: Math.floor((total % 3_600_000) / 60_000),
    seconds: Math.floor((total % 60_000) / 1000),
    total,
  };
}

export interface AcDayGroup {
  key: string;
  label: string;
  items: AcFixture[];
}

/** تجميع المباريات حسب اليوم (بتوقيت الرياض). */
export function groupFixturesByDay(fixtures: AcFixture[]): AcDayGroup[] {
  const map = new Map<string, AcFixture[]>();
  for (const f of fixtures) {
    const key = riyadhDayKey(f.date);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(f);
  }
  const involvesSaudi = (f: AcFixture) =>
    f.home.id === SAUDI_TEAM_ID || f.away.id === SAUDI_TEAM_ID;
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, items]) => ({
      key,
      label: formatKickoffDay(items[0].date),
      // مباراة المنتخب المضيف تتصدّر يومها (السعودية × فلسطين تتصدّر الجولة الأولى)
      items: [...items].sort(
        (a, b) =>
          (involvesSaudi(a) ? 0 : 1) - (involvesSaudi(b) ? 0 : 1) || a.timestamp - b.timestamp,
      ),
    }));
}

/** نافذة البطولة الرسمية (AFC): 7 يناير – 5 فبراير 2027. */
export const AC_TOURNAMENT_STARTS_AT = "2027-01-07T17:00:00+03:00";
export const AC_TOURNAMENT_ENDS_AT = "2027-02-05T21:00:00+03:00";

/** نطاق تواريخ البطولة بصيغة مختصرة مع أصفار بادئة (07 يناير - 05 فبراير 2027). */
export function formatDateRange(startIso: string | null, endIso: string | null): string {
  if (!startIso) return "";
  const tz = "Asia/Riyadh";
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return "";

  const day = new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "2-digit" });
  const monthYear = new Intl.DateTimeFormat("ar-SA", {
    timeZone: tz,
    month: "long",
    year: "numeric",
    numberingSystem: "latn",
  });
  const dayMonth = new Intl.DateTimeFormat("ar-SA", {
    timeZone: tz,
    day: "2-digit",
    month: "long",
    numberingSystem: "latn",
  });
  const full = new Intl.DateTimeFormat("ar-SA", {
    timeZone: tz,
    day: "2-digit",
    month: "long",
    year: "numeric",
    numberingSystem: "latn",
  });

  if (!endIso) return full.format(start);
  const end = new Date(endIso);
  if (Number.isNaN(end.getTime())) return full.format(start);

  const parts = (d: Date) => {
    const p = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(d);
    return {
      y: p.find((x) => x.type === "year")?.value,
      m: p.find((x) => x.type === "month")?.value,
      d: p.find((x) => x.type === "day")?.value,
    };
  };
  const a = parts(start);
  const b = parts(end);

  if (a.y === b.y && a.m === b.m) {
    return `${day.format(start)} - ${day.format(end)} ${monthYear.format(end)}`;
  }
  if (a.y === b.y) {
    return `${dayMonth.format(start)} - ${full.format(end)}`;
  }
  return `${full.format(start)} - ${full.format(end)}`;
}

// ===== تفاصيل المباراة (نافذة الويب) — مرآة نحيفة لِـ AcMatchDetail في الخادم =====

export interface AcTvChannel {
  name: string;
  country: string | null;
  logo: string | null;
}

export interface AcMatchPrediction {
  home: number;
  draw: number;
  away: number;
}

export interface AcMatchDetailSlim {
  fixture: AcFixture;
  prediction: AcMatchPrediction | null;
  headToHead: AcFixture[];
  tv: AcTvChannel[];
}

/** لاعب في قائمة المنتخب */
export interface AcSquadPlayer {
  id: number;
  name: string;
  nameEn: string;
  number: number | null;
  position: string;
  positionEn: string;
  age: number | null;
  photo: string;
}

export interface AcFifaRank {
  rank: number;
  points: number | null;
  change: number | null;
}

export interface AcSeasonStatItem {
  label: string;
  value: number;
  percent?: boolean;
}

export interface AcTeamSeasonStats {
  available: boolean;
  matches: number;
  items: AcSeasonStatItem[];
}

/** ملف المنتخب المتكامل من `/api/asian-cup/team/:id` */
export interface AcTeamExtra {
  marketValue: number | null;
  marketValueCurrency: string;
  foundation: number | null;
  squadSize: number | null;
}

export interface AcCoachInfo {
  name: string;
  photo: string;
  formation: string | null;
  age: number | null;
  nationality: string | null;
}

export interface AcVenueInfo {
  name: string;
  capacity: number | null;
  city: string;
  country: string | null;
}

export interface AcInjury {
  player: string;
  reason: string | null;
  status: string | null;
  until: string | null;
}

export interface AcTeamProfile {
  team: AcTeam;
  isSaudi: boolean;
  coach: string | null;
  /** مجموعة المنتخب — null قبل اعتماد القرعة/الجداول */
  group: AcGroup | null;
  stats: {
    groupName: string | null;
    rank: number | null;
    played: number;
    win: number;
    draw: number;
    lose: number;
    goalsFor: number;
    goalsAgainst: number;
    goalsDiff: number;
    points: number;
    form: ("W" | "D" | "L")[];
  };
  nextMatch: AcFixture | null;
  fixtures: AcFixture[];
  squad: AcSquadPlayer[];
  fifaRank: AcFifaRank | null;
  seasonStats: AcTeamSeasonStats | null;
  extra?: AcTeamExtra | null;
  injuries?: AcInjury[];
  coachInfo?: AcCoachInfo | null;
  venue?: AcVenueInfo | null;
}

