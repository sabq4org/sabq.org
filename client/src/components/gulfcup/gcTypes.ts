/**
 * أنواع ومساعدات قسم «خليجي 27» (تطابق DTOs الخادم في gulfCupService.ts).
 * تُعيد استخدام مساعدات التاريخ/العدّ التنازلي من قسم المونديال لتفادي التكرار.
 */
export {
  formatKickoffDay,
  formatKickoffTime,
  riyadhDayKey,
  todayRiyadhKey,
} from "@/components/worldcup/wcTypes";

import { riyadhDayKey, formatKickoffDay } from "@/components/worldcup/wcTypes";

export const SAUDI_TEAM_ID = 23;

export interface GcTeam {
  id: number;
  name: string;
  logo: string;
}

export interface GcFixture {
  id: number;
  matchNo: number;
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
  home: GcTeam;
  away: GcTeam;
  goals: { home: number | null; away: number | null };
}

export interface GcStandingRow {
  rank: number;
  team: GcTeam;
  played: number;
  win: number;
  draw: number;
  lose: number;
  goalsFor: number;
  goalsAgainst: number;
  goalsDiff: number;
  points: number;
}

export interface GcGroup {
  name: string;
  rows: GcStandingRow[];
}

export interface GcOverview {
  startsAt: string | null;
  endsAt: string | null;
  teamsCount: number;
  groupsCount: number;
  host: string;
  venues: { name: string; city: string }[];
  started: boolean;
  saudi: {
    team: GcTeam | null;
    group: string | null;
    fixtures: GcFixture[];
  };
  nextMatch: GcFixture | null;
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

export interface GcDayGroup {
  key: string;
  label: string;
  items: GcFixture[];
}

/** تجميع المباريات حسب اليوم (بتوقيت الرياض)، مع تصدّر مباراة المضيف يومها. */
export function groupFixturesByDay(fixtures: GcFixture[]): GcDayGroup[] {
  const map = new Map<string, GcFixture[]>();
  for (const f of fixtures) {
    const key = riyadhDayKey(f.date);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(f);
  }
  const involvesSaudi = (f: GcFixture) =>
    f.home.id === SAUDI_TEAM_ID || f.away.id === SAUDI_TEAM_ID;
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, items]) => ({
      key,
      label: formatKickoffDay(items[0].date),
      items: [...items].sort(
        (a, b) =>
          (involvesSaudi(a) ? 0 : 1) - (involvesSaudi(b) ? 0 : 1) || a.timestamp - b.timestamp,
      ),
    }));
}

/** نطاق تواريخ البطولة بصيغة عربية مختصرة (يوم البداية – يوم النهاية). */
export function formatDateRange(startIso: string | null, endIso: string | null): string {
  if (!startIso) return "";
  const fmt = new Intl.DateTimeFormat("ar-SA", {
    timeZone: "Asia/Riyadh",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const start = fmt.format(new Date(startIso));
  if (!endIso) return start;
  const end = fmt.format(new Date(endIso));
  return start === end ? start : `${start} — ${end}`;
}
