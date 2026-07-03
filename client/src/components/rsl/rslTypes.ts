/**
 * أنواع مركز «دوري روشن السعودي» — مرآة لما يرسله /api/rsl/* و/api/sports/pro-league/*
 * (مُعرَّب من الخادم عبر saudiLeagueService). مساعدات التوقيت مُعاد استخدامها
 * من قسم كأس العالم (wcTypes) لتوحيد التنسيق — نفس نهج كأس الملك.
 */
export {
  formatKickoffTime,
  formatKickoffDay,
  riyadhDayKey,
  todayRiyadhKey,
  countdownTo,
  elapsedLabel,
} from "../worldcup/wcTypes";

export const RSL_SLUG = "pro-league";

export interface RslTeam {
  id: number;
  name: string;
  logo: string;
  winner?: boolean | null;
}

export interface RslFixture {
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
  home: RslTeam;
  away: RslTeam;
  goals: { home: number | null; away: number | null };
  penalties?: { home: number | null; away: number | null } | null;
}

export interface RslStandingSplit {
  played: number;
  win: number;
  draw: number;
  lose: number;
  goalsFor: number;
  goalsAgainst: number;
}

export interface RslStandingRow {
  rank: number;
  team: RslTeam;
  played: number;
  win: number;
  draw: number;
  lose: number;
  goalsFor: number;
  goalsAgainst: number;
  goalsDiff: number;
  points: number;
  form: string | null;
  home: RslStandingSplit | null;
  away: RslStandingSplit | null;
  trend: "up" | "down" | "same" | null;
  live?: boolean;
}

export interface RslScorer {
  rank: number;
  id: number;
  name: string;
  photo: string;
  team: RslTeam;
  goals: number;
  assists: number;
  penalties: number;
  matches: number;
}

export interface RslLeader {
  rank: number;
  id: number;
  name: string;
  photo: string;
  team: RslTeam;
  goals?: number;
  assists?: number;
  yellow?: number;
  red?: number;
}

/** حالة الموسم — /api/rsl/hero → outlook (محرّك الانتقال بين المواسم) */
export interface RslSeasonOutlook {
  phase: "in-season" | "pre-season" | "off-season" | "unknown";
  season: number;
  status: string;
  start: string | null;
  end: string | null;
  champion: { id: number; name: string; logo: string } | null;
  nextSeason: number | null;
  nextSeasonStart: string | null;
  firstKickoff: number | null; // ms
  daysUntilKickoff: number | null;
  openers: RslFixture[];
}

/** ملخّص «يوم الجولة» — نفس شكل كأس الملك */
export interface RslMatchday {
  count: number;
  round: string | null;
  date: string;
  nextKickoffTs: number | null;
  sameKickoff: boolean;
  liveCount: number;
  finishedCount: number;
}

/** إرث الموسم الماضي — hero → lastSeason */
export interface RslLastSeason {
  previousSeason: number | null;
  champion: { id: number; name: string; logo: string } | null;
  topScorer: { id: number; name: string; photo: string; team: RslTeam; goals: number } | null;
}

/** استجابة /api/rsl/hero */
export interface RslHero {
  outlook: RslSeasonOutlook;
  live: RslFixture[];
  today: RslFixture[];
  nextMatch: RslFixture | null;
  matchday: RslMatchday | null;
  lastSeason: RslLastSeason | null;
  blockHidden: boolean;
  predictionsEnabled: boolean;
  updatedAt: string;
}
