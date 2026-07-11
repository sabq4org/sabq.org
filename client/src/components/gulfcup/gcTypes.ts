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
  live?: boolean;
  liveDelta?: number;
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

// ---------- مركز المباراة (يطابق GcMatchDetail في الخادم) ----------

export interface GcMatchEvent {
  minute: number;
  extraMinute: number | null;
  teamId: number;
  type: string;
  label: string;
  player: string | null;
}

export interface GcLineupPlayer {
  id: number;
  name: string;
  number: number | null;
  position: string | null;
}

export interface GcLineup {
  teamId: number;
  teamName: string;
  formation: string | null;
  coach: string;
  startXI: GcLineupPlayer[];
  substitutes: GcLineupPlayer[];
}

export interface GcStatistic {
  key: string;
  label: string;
  home: string;
  away: string;
}

export interface GcH2HMatch {
  date: string;
  competition: string;
  home: GcTeam;
  away: GcTeam;
  goals: { home: number | null; away: number | null };
}

export interface GcH2HSummary {
  total: number;
  homeWins: number;
  awayWins: number;
  draws: number;
  recent: GcH2HMatch[];
}

// ---------- إثراء TheSports (اختيارية كلها — تغيب قبل توفر بيانات المزوّد) ----------

export interface GcRichLineupPlayer {
  id: string;
  name: string;
  number: number | null;
  position: string | null;
  x: number | null;
  y: number | null;
  rating: number | null;
  photo: string | null;
  captain: boolean;
  starter: boolean;
}

export interface GcRichLineup {
  confirmed: boolean;
  homeFormation: string | null;
  awayFormation: string | null;
  home: GcRichLineupPlayer[];
  away: GcRichLineupPlayer[];
}

export interface GcTrend {
  perMinutes: number;
  values: { minute: number; value: number }[];
}

export interface GcTvChannel {
  name: string;
  country: string | null;
  logo: string | null;
}

export interface GcPlayerMatchStat {
  playerId: string;
  name: string;
  photo: string | null;
  side: "home" | "away" | null;
  starter: boolean;
  minutes: number;
  rating: number | null;
  values: Record<string, number>;
}

export interface GcInjury {
  player: string;
  reason: string | null;
  missedMatches: number | null;
}

export interface GcFifaRank {
  rank: number;
  points: number | null;
  change: number | null;
}

export interface GcXg {
  home: number | null;
  away: number | null;
}

export interface GcForecast {
  home: number;
  draw: number;
  away: number;
}

export interface GcExpectedPlayer {
  name: string;
  jersey: number | null;
  row: number | null;
}

export interface GcExpectedSide {
  formation: string | null;
  starters: GcExpectedPlayer[];
}

export interface GcExpectedLineups {
  home: GcExpectedSide | null;
  away: GcExpectedSide | null;
}

export interface GcReferee {
  name: string;
  photo: string | null;
  country: string | null;
  matches: number | null;
  yellowAvg: number | null;
  penaltiesAvg: number | null;
}

export interface GcCommentaryItem {
  minute: number | null;
  extraMinute: number | null;
  goal: boolean;
  important: boolean;
  text: string;
}

export interface GcMatchDetail {
  fixture: GcFixture;
  events: GcMatchEvent[];
  lineups: GcLineup[];
  statistics: GcStatistic[];
  headToHead: GcFixture[];
  history: GcH2HSummary | null;
  lineupsRich?: GcRichLineup | null;
  trend?: GcTrend | null;
  tv?: GcTvChannel[];
  playerStats?: GcPlayerMatchStat[];
  injuries?: { home: GcInjury[]; away: GcInjury[] } | null;
  fifa?: { home: GcFifaRank | null; away: GcFifaRank | null } | null;
  xg?: GcXg | null;
  forecast?: GcForecast | null;
  expectedLineups?: GcExpectedLineups | null;
  referee?: GcReferee | null;
  commentary?: GcCommentaryItem[] | null;
}

// ---------- الهدّافون + سجلّ البطولة (يطابقان الخادم) ----------

export interface GcScorer {
  rank: number;
  id: number;
  name: string;
  photo: string;
  team: GcTeam;
  goals: number;
  assists: number;
  penalties: number;
  matches: number;
  minutes: number;
}

export interface GcScorersBoard {
  /** الموسم الذي جاءت منه البيانات (2026 = النسخة الحالية، 2024 = خليجي 26). */
  season: number;
  isCurrent: boolean;
  scorers: GcScorer[];
  assists: GcScorer[];
}

export interface GcEditionDto {
  edition: number;
  title: string;
  year: string;
  host: GcTeam;
  hostCity: string | null;
  champion: GcTeam | null;
  runnerUp: GcTeam | null;
  finalNote: string | null;
  upcoming: boolean;
}

export interface GcTitleRow {
  team: GcTeam;
  titles: number;
  runnerUps: number;
  hosted: number;
  lastTitleYear: string | null;
}

export interface GcHistory {
  editions: GcEditionDto[];
  titles: GcTitleRow[];
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
