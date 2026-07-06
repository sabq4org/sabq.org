/**
 * بناء حقائق لقطات VARA الذكية. كل ما يخرج من هنا حتمي ومؤرّض:
 * المواعيد، النتائج، المراكز، وأهمية المباراة محسوبة من بيانات المزود والخدمات
 * القائمة. الـAI في المرحلة التالية يصوغ فقط ولا يضيف حقائق.
 */
import { apiFootballGet } from "../apiFootballClient";
import {
  getStandings,
  getTeamRecentResults,
  SAUDI_COMPETITIONS,
  type CompetitionCategory,
  type SaudiCompetition,
  type SplLiveBoardItem,
} from "../saudiLeagueService";
import {
  localizeSplCompetition,
  localizeSplRound,
  localizeSplTeamName,
} from "../saudiLeagueNames";
import { matchImportance } from "../sportsIntelligence/config";

const TIMEZONE = "Asia/Riyadh";
const NEXT_FIXTURES = 5;

const byLeagueId = new Map(SAUDI_COMPETITIONS.map((comp) => [comp.id, comp]));

export interface SnapTeamRef {
  id: number;
  name: string;
  logo?: string | null;
}

export interface SnapFixtureFact {
  fixtureId: number;
  kickoff: string;
  kickoffTs: number;
  kickoffLocalTime: string;
  relativeDay: string;
  round: string;
  competition: string;
  competitionSlug: string | null;
  category: CompetitionCategory | null;
  home: SnapTeamRef;
  away: SnapTeamRef;
  opponent: SnapTeamRef;
  targetSide: "home" | "away";
  goals: { home: number | null; away: number | null };
  status: { live: boolean; finished: boolean; elapsed: number | null };
  importance: number;
  targetStanding?: SnapStandingFact | null;
  opponentStanding?: SnapStandingFact | null;
  pointsGap?: number | null;
}

export interface SnapStandingFact {
  rank: number;
  points: number;
  played: number;
  goalsDiff: number;
}

export interface SnapRecentResultFact {
  fixtureId: number;
  kickoffTs: number;
  competition: string;
  competitionSlug: string | null;
  home: SnapTeamRef;
  away: SnapTeamRef;
  opponent: SnapTeamRef;
  targetSide: "home" | "away";
  goals: { home: number; away: number };
  outcome: "win" | "draw" | "loss";
}

export interface TeamSnapFacts {
  teamId: number;
  teamName: string;
  generatedAt: string;
  upcoming: SnapFixtureFact[];
  recent: SnapRecentResultFact[];
  nextMatch: SnapFixtureFact | null;
  latestResult: SnapRecentResultFact | null;
  bigMatch: SnapFixtureFact | null;
}

function formatRiyadhTime(timestamp: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp * 1000));
}

function riyadhDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function relativeDay(timestamp: number, now = new Date()): string {
  const target = riyadhDateKey(new Date(timestamp * 1000));
  const today = riyadhDateKey(now);
  const tomorrow = riyadhDateKey(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const afterTomorrow = riyadhDateKey(new Date(now.getTime() + 48 * 60 * 60 * 1000));
  if (target === today) return "اليوم";
  if (target === tomorrow) return "غدًا";
  if (target === afterTomorrow) return "بعد غد";
  return target;
}

function teamRef(raw: any): SnapTeamRef {
  const id = Number(raw?.id ?? 0);
  const fallback = String(raw?.name ?? "").trim();
  return {
    id,
    name: localizeSplTeamName(id, fallback),
    logo: raw?.logo ?? null,
  };
}

function statusOf(raw: any): SnapFixtureFact["status"] {
  const short = String(raw?.fixture?.status?.short ?? "").toUpperCase();
  return {
    live: ["1H", "2H", "ET", "BT", "P", "INT", "LIVE"].includes(short),
    finished: ["FT", "AET", "PEN"].includes(short),
    elapsed: raw?.fixture?.status?.elapsed ?? null,
  };
}

function toUpcomingFact(raw: any, teamId: number): SnapFixtureFact | null {
  const fixtureId = Number(raw?.fixture?.id ?? 0);
  const kickoffTs = Number(raw?.fixture?.timestamp ?? 0);
  if (!fixtureId || !kickoffTs) return null;

  const home = teamRef(raw?.teams?.home);
  const away = teamRef(raw?.teams?.away);
  const targetSide = home.id === teamId ? "home" : away.id === teamId ? "away" : null;
  if (!targetSide) return null;
  const opponent = targetSide === "home" ? away : home;
  const comp = byLeagueId.get(Number(raw?.league?.id ?? 0));
  const status = statusOf(raw);
  const goals = { home: raw?.goals?.home ?? null, away: raw?.goals?.away ?? null };
  const category = comp?.category ?? null;
  const competitionSlug = comp?.slug ?? null;
  const competition = comp?.name ?? localizeSplCompetition(raw?.league?.name ?? "");

  return {
    fixtureId,
    kickoff: raw?.fixture?.date ?? new Date(kickoffTs * 1000).toISOString(),
    kickoffTs,
    kickoffLocalTime: formatRiyadhTime(kickoffTs),
    relativeDay: relativeDay(kickoffTs),
    round: localizeSplRound(raw?.league?.round ?? raw?.fixture?.round ?? ""),
    competition,
    competitionSlug,
    category,
    home,
    away,
    opponent,
    targetSide,
    goals,
    status,
    importance: matchImportance({ category, competitionSlug, status, goals }),
  };
}

function toRecentFact(item: SplLiveBoardItem, teamId: number): SnapRecentResultFact | null {
  const targetSide = item.home.id === teamId ? "home" : item.away.id === teamId ? "away" : null;
  if (!targetSide || item.goals.home == null || item.goals.away == null) return null;
  const targetGoals = targetSide === "home" ? item.goals.home : item.goals.away;
  const opponentGoals = targetSide === "home" ? item.goals.away : item.goals.home;
  const outcome = targetGoals > opponentGoals ? "win" : targetGoals < opponentGoals ? "loss" : "draw";
  return {
    fixtureId: item.id,
    kickoffTs: item.timestamp,
    competition: item.competition,
    competitionSlug: item.competitionSlug,
    home: item.home,
    away: item.away,
    opponent: targetSide === "home" ? item.away : item.home,
    targetSide,
    goals: { home: item.goals.home, away: item.goals.away },
    outcome,
  };
}

async function nextFixtures(teamId: number): Promise<SnapFixtureFact[]> {
  const rows = await apiFootballGet(
    "SportsSnaps",
    "fixtures",
    { team: String(teamId), next: String(NEXT_FIXTURES), timezone: TIMEZONE },
    { wrapObjectResponse: true },
  );
  return (Array.isArray(rows) ? rows : [])
    .map((row) => toUpcomingFact(row, teamId))
    .filter((item): item is SnapFixtureFact => Boolean(item))
    .sort((a, b) => a.kickoffTs - b.kickoffTs);
}

async function attachStandings(fixture: SnapFixtureFact, teamId: number): Promise<SnapFixtureFact> {
  const comp = fixture.competitionSlug
    ? SAUDI_COMPETITIONS.find((item) => item.slug === fixture.competitionSlug)
    : null;
  if (!comp?.hasStandings) return fixture;
  const standings = await getStandings(comp as SaudiCompetition).catch(() => []);
  const target = standings.find((row) => row.team.id === teamId);
  const opponent = standings.find((row) => row.team.id === fixture.opponent.id);
  const compact = (row: typeof standings[number] | undefined): SnapStandingFact | null =>
    row
      ? { rank: row.rank, points: row.points, played: row.played, goalsDiff: row.goalsDiff }
      : null;
  return {
    ...fixture,
    targetStanding: compact(target),
    opponentStanding: compact(opponent),
    pointsGap: target && opponent ? Math.abs(target.points - opponent.points) : null,
  };
}

function inferTeamName(teamId: number, upcoming: SnapFixtureFact[], recent: SnapRecentResultFact[]): string {
  for (const fx of upcoming) {
    if (fx.home.id === teamId) return fx.home.name;
    if (fx.away.id === teamId) return fx.away.name;
  }
  for (const fx of recent) {
    if (fx.home.id === teamId) return fx.home.name;
    if (fx.away.id === teamId) return fx.away.name;
  }
  return `الفريق ${teamId}`;
}

function pickBigMatch(upcoming: SnapFixtureFact[]): SnapFixtureFact | null {
  return upcoming
    .filter((fx) => fx.importance >= 80)
    .sort((a, b) => b.importance - a.importance || a.kickoffTs - b.kickoffTs)[0] ?? null;
}

export async function buildTeamFacts(teamId: number): Promise<TeamSnapFacts> {
  const [upcomingRaw, recentRaw] = await Promise.all([
    nextFixtures(teamId).catch(() => []),
    getTeamRecentResults(teamId, 3).catch(() => []),
  ]);

  const upcoming = await Promise.all(upcomingRaw.map((fx) => attachStandings(fx, teamId)));
  const recent = recentRaw
    .map((item) => toRecentFact(item, teamId))
    .filter((item): item is SnapRecentResultFact => Boolean(item));

  return {
    teamId,
    teamName: inferTeamName(teamId, upcoming, recent),
    generatedAt: new Date().toISOString(),
    upcoming,
    recent,
    nextMatch: upcoming[0] ?? null,
    latestResult: recent[0] ?? null,
    bigMatch: pickBigMatch(upcoming),
  };
}
