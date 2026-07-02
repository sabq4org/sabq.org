/**
 * أنواع قسم «كأس خادم الحرمين الشريفين» — مرآة لما يرسله /api/kings-cup/*
 * (مُعرَّب من الخادم عبر saudiLeagueService). مساعدات التوقيت مُعاد استخدامها
 * من قسم كأس العالم (wcTypes) لتوحيد التنسيق.
 */
export {
  formatKickoffTime,
  formatKickoffDay,
  riyadhDayKey,
  todayRiyadhKey,
  countdownTo,
  elapsedLabel,
  formatMarketValue,
} from "../worldcup/wcTypes";

export interface KcTeam {
  id: number;
  name: string;
  logo: string;
  winner: boolean | null;
}

export interface KcFixture {
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
  home: KcTeam;
  away: KcTeam;
  goals: { home: number | null; away: number | null };
  penalties?: { home: number | null; away: number | null } | null;
}

export interface KcScorer {
  rank: number;
  id: number;
  name: string;
  photo: string;
  team: KcTeam;
  goals: number;
  assists: number;
  penalties: number;
  matches: number;
}

export interface KcLeader {
  rank: number;
  id: number;
  name: string;
  photo: string;
  team: KcTeam;
  goals?: number;
  assists?: number;
  yellow?: number;
  red?: number;
}

export interface KcChampion {
  team: { id: number; name: string; logo: string };
  runnerUp: { id: number; name: string; logo: string } | null;
  score: string | null;
  penalties: string | null;
  decidedAt: string | null;
  source: "auto" | "manual";
}

export interface KcOverview {
  blockHidden?: boolean;
  live: KcFixture[];
  today: KcFixture[];
  nextMatch: KcFixture | null;
  matchOfTheDay: { fixture: KcFixture; prediction: unknown | null } | null;
  started: boolean;
  champion: KcChampion | null;
  updatedAt: string;
}

export interface KcBracketRound {
  round: string;
  matches: KcFixture[];
}

export interface KcBracket {
  rounds: KcBracketRound[];
}

export interface KcSquadPlayer {
  id: number;
  name: string;
  number: number | null;
  position: string;
  positionEn: string;
  age: number | null;
  photo: string;
}

export interface KcTeamInfo {
  id: number;
  name: string;
  logo: string;
  country: string | null;
  founded: number | null;
  venue: { name: string; city: string; capacity: number | null; image: string } | null;
}

export interface KcTeamProfile {
  team: KcTeamInfo;
  standing: unknown | null;
  competitionSlug: string | null;
  competitionName: string | null;
  fixtures: KcFixture[];
  squad: KcSquadPlayer[];
  coach: { id: number; name: string; photo: string; age: number | null; nationality: string | null } | null;
  topScorers: { id: number; name: string; photo: string; goals: number }[];
}

export interface KcMatchEvent {
  minute: number | null;
  extra: number | null;
  teamId: number;
  team: string;
  player: string;
  assist: string | null;
  type: string;
  label: string;
}

export interface KcStatRow {
  type: string;
  label: string;
  home: string | number | null;
  away: string | number | null;
}

export interface KcLineupPlayer {
  id: number;
  number: number | null;
  name: string;
  pos: string;
  grid: string | null;
}

export interface KcLineup {
  team: { id: number; name: string; logo: string };
  formation: string | null;
  coach: string | null;
  startXI: KcLineupPlayer[];
  substitutes: KcLineupPlayer[];
}

export interface KcMatchDetail {
  fixture: KcFixture;
  events: KcMatchEvent[];
  statistics: {
    home: { id: number; name: string };
    away: { id: number; name: string };
    rows: KcStatRow[];
  } | null;
  lineups: KcLineup[];
  leagueId: number | null;
}

export interface KcPlayerSeasonStats {
  competition: string;
  team: KcTeam;
  matches: number;
  minutes: number;
  goals: number;
  assists: number;
  yellow: number;
  red: number;
  rating: number | null;
}

export interface KcPlayerCard {
  id: number;
  name: string;
  fullName: string | null;
  photo: string;
  position: string;
  number: number | null;
  age: number | null;
  birthDate: string | null;
  birthPlace: string | null;
  nationality: string | null;
  height: number | null;
  weight: number | null;
  seasonStats: KcPlayerSeasonStats[];
  career: { teamId: number; team: string; logo: string; seasons: number[] }[];
  trophies: { competition: string; country: string; season: string; place: string; winner: boolean }[];
  currentTeam: KcTeam | null;
}

/** لمحة النسخة السابقة — /api/kings-cup/history */
export interface KcHistory {
  previousSeason: number | null;
  champion: { id: number; name: string; logo: string } | null;
  topScorer: { id: number; name: string; photo: string; team: KcTeam; goals: number } | null;
}

export const KINGS_CUP_THEME = {
  band: "bg-amber-50 dark:bg-amber-950/25 border-amber-600/10 dark:border-amber-400/10",
  card: "bg-gradient-to-bl from-[#0b3d2e] via-[#0f5138] to-[#08301f]",
  ring: "ring-emerald-900/40",
  soft: "text-emerald-100/80",
  accent: "text-amber-300",
  cta: "bg-amber-300 text-emerald-950 hover:bg-amber-200",
} as const;
