/**
 * أنواع قسم كأس العالم 2026 — مرآة لما يرسله /api/world-cup/* (مُعرَّب من الخادم)
 * + مساعدات التوقيت/التجميع المشتركة بين مكونات القسم.
 */

export interface WcTeam {
  id: number;
  name: string;
  logo: string;
  winner: boolean | null;
}

/** التعليق النصي المباشر (من SportMonks، مُعرَّب) — /api/world-cup/commentary/:id */
export interface WcCommentaryLine {
  id: number;
  order: number;
  minute: number | null;
  extraMinute: number | null;
  text: string;
  textEn: string;
  isGoal: boolean;
  isImportant: boolean;
}

export interface WcCommentary {
  available: boolean;
  live: boolean;
  source: string;
  lines: WcCommentaryLine[];
}

export interface WcFixture {
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
  roundEn: string;
  venue: { name: string; city: string };
  home: WcTeam;
  away: WcTeam;
  goals: { home: number | null; away: number | null };
  penalties: { home: number | null; away: number | null } | null;
}

export interface WcStandingRow {
  rank: number;
  team: WcTeam;
  played: number;
  win: number;
  draw: number;
  lose: number;
  goalsFor: number;
  goalsAgainst: number;
  goalsDiff: number;
  points: number;
  form: string | null;
}

export interface WcGroup {
  group: string;
  groupEn: string;
  rows: WcStandingRow[];
}

export interface WcScorer {
  rank: number;
  /** معرّف اللاعب عند المزود — يفتح بطاقة اللاعب؛ 0 = غير معروف */
  id: number;
  name: string;
  photo: string;
  team: WcTeam;
  goals: number;
  assists: number;
  penalties: number;
  minutes: number;
  matches: number;
}

export interface WcPrediction {
  home: number;
  draw: number;
  away: number;
  advice: string | null;
}

export interface WcMatchEvent {
  minute: number;
  extraMinute: number | null;
  teamId: number;
  type: string;
  label: string;
  player: string;
  playerId: number | null;
  assist: string | null;
  assistId: number | null;
}

export interface WcLineupPlayer {
  id: number;
  name: string;
  number: number | null;
  position: string | null;
  grid: string | null;
}

export interface WcLineup {
  teamId: number;
  teamName: string;
  formation: string | null;
  coach: string;
  startXI: WcLineupPlayer[];
  substitutes: WcLineupPlayer[];
}

export interface WcStatistic {
  key: string;
  label: string;
  home: string;
  away: string;
}

export interface WcPlayerRating {
  id: number;
  name: string;
  photo: string;
  teamId: number;
  number: number | null;
  position: string;
  rating: number;
  minutes: number;
  goals: number;
  assists: number;
  captain: boolean;
}

export interface WcMatchDetail {
  fixture: WcFixture;
  events: WcMatchEvent[];
  lineups: WcLineup[];
  statistics: WcStatistic[];
  prediction: WcPrediction | null;
  ratings: WcPlayerRating[];
  manOfTheMatch: WcPlayerRating | null;
  headToHead: WcFixture[];
}

export interface WcLeader {
  rank: number;
  /** معرّف اللاعب عند المزود — يفتح بطاقة اللاعب؛ 0 = غير معروف */
  id: number;
  name: string;
  photo: string;
  team: WcTeam;
  goals: number;
  assists: number;
  yellow: number;
  red: number;
  minutes: number;
  matches: number;
}

export interface WcSquadPlayer {
  id: number;
  name: string;
  number: number | null;
  position: string;
  positionEn: string;
  age: number | null;
  photo: string;
}

export interface WcSquad {
  team: WcTeam;
  players: WcSquadPlayer[];
}

export interface WcTeamProfile {
  team: WcTeam;
  isSaudi: boolean;
  coach: string | null;
  group: WcGroup | null;
  fixtures: WcFixture[];
  squad: WcSquadPlayer[];
}

export interface WcPlayerCareerStop {
  teamId: number;
  team: string;
  logo: string;
  seasons: number[];
}

export interface WcPlayerTrophy {
  competition: string;
  country: string;
  season: string;
  place: string;
  winner: boolean;
}

export interface WcPlayerTournamentStats {
  matches: number;
  lineups: number;
  minutes: number;
  rating: number | null;
  goals: number;
  assists: number;
  shots: number;
  shotsOn: number;
  passes: number;
  keyPasses: number;
  dribblesAttempts: number;
  dribblesSuccess: number;
  tackles: number;
  yellow: number;
  red: number;
  saves: number;
  conceded: number;
  penaltiesScored: number;
  penaltiesMissed: number;
}

export interface WcPlayerCard {
  id: number;
  name: string;
  fullName: string | null;
  photo: string;
  position: string;
  positionEn: string;
  number: number | null;
  age: number | null;
  birthDate: string | null;
  birthPlace: string | null;
  height: number | null;
  weight: number | null;
  career: WcPlayerCareerStop[];
  trophies: WcPlayerTrophy[];
  stats: WcPlayerTournamentStats | null;
  injury: { reason: string } | null;
}

export interface WcOverview {
  live: WcFixture[];
  today: WcFixture[];
  matchOfTheDay: { fixture: WcFixture; prediction: WcPrediction | null } | null;
  saudi: {
    next: WcFixture | null;
    fixtures: WcFixture[];
    group: WcGroup | null;
  };
  updatedAt: string;
}

export const SAUDI_TEAM_ID = 23;

// ميلادي + أرقام لاتينية + توقيت الرياض — التواريخ تصل من الخادم بإزاحة +03:00 أصلًا
const AR_LOCALE = "ar-SA-u-ca-gregory-nu-latn";
const RIYADH = "Asia/Riyadh";

const timeFmt = new Intl.DateTimeFormat(AR_LOCALE, {
  timeZone: RIYADH,
  hour: "numeric",
  minute: "2-digit",
});

const dayFmt = new Intl.DateTimeFormat(AR_LOCALE, {
  timeZone: RIYADH,
  weekday: "long",
  day: "numeric",
  month: "long",
});

export function formatKickoffTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}

export function formatKickoffDay(iso: string): string {
  return dayFmt.format(new Date(iso));
}

/** مفتاح اليوم بتوقيت الرياض (التواريخ تصل بإزاحة +03:00 فالقصّ المباشر صحيح) */
export function riyadhDayKey(iso: string): string {
  return (iso ?? "").slice(0, 10);
}

export function todayRiyadhKey(): string {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export interface WcDayGroup {
  key: string;
  label: string;
  items: WcFixture[];
}

export function groupFixturesByDay(fixtures: WcFixture[]): WcDayGroup[] {
  const groups: WcDayGroup[] = [];
  for (const fixture of fixtures) {
    const key = riyadhDayKey(fixture.date);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(fixture);
    } else {
      groups.push({ key, label: formatKickoffDay(fixture.date), items: [fixture] });
    }
  }
  return groups;
}

export interface WcCountdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
}

/** دقيقة اللعب مع الوقت بدل الضائع: 90+8' بدل 90' المجمدة */
export function elapsedLabel(status: WcFixture["status"]): string {
  if (status.elapsed == null) return status.label;
  return status.extra ? `${status.elapsed}+${status.extra}'` : `${status.elapsed}'`;
}

export function countdownTo(timestamp: number): WcCountdown {
  const total = Math.max(0, timestamp * 1000 - Date.now());
  return {
    days: Math.floor(total / 86_400_000),
    hours: Math.floor((total % 86_400_000) / 3_600_000),
    minutes: Math.floor((total % 3_600_000) / 60_000),
    seconds: Math.floor((total % 60_000) / 1000),
    total,
  };
}
