/**
 * أنواع ومساعدات قسم كأس آسيا 2027 (تطابق DTOs الخادم في asianCupService.ts).
 * تُعيد استخدام مساعدات التاريخ/العدّ التنازلي من قسم المونديال لتفادي التكرار.
 */
export {
  countdownTo,
  formatKickoffDay,
  formatKickoffTime,
  riyadhDayKey,
  todayRiyadhKey,
  type WcCountdown as AcCountdown,
} from "@/components/worldcup/wcTypes";

import { riyadhDayKey, formatKickoffDay } from "@/components/worldcup/wcTypes";

export const SAUDI_TEAM_ID = 23;

export interface AcTeam {
  id: number;
  name: string;
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
