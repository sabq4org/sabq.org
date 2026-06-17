/**
 * خدمة دوري روشن السعودي للمحترفين — عميل API-Football (v3.football.api-sports.io).
 *
 * قسم رياضي مخفي قيد التطوير: لا يعمل إلا عند SAUDI_LEAGUE_ENABLED=true،
 * ويستخدم نفس مفتاح APIFOOTBALL_KEY وخطة Mega القائمة (الدوري السعودي
 * مغطّى بالكامل في هذه الخطة). لا يمسّ تغطية المونديال إطلاقًا.
 *
 * كل ما يصل للواجهة معرَّب، وكل نقطة بيانات خلف كاش SWR ليخدم آلاف الزوار
 * من طلب واحد للمزود.
 */
import { withSWR, CACHE_TTL } from "../memoryCache";
import {
  WC_FINISHED_STATUSES,
  WC_LIVE_STATUSES,
  WC_STATUS_AR,
  localizeEvent,
  localizePlayerName,
} from "./worldCupNames";
import {
  SPL_STAT_AR,
  SPL_STAT_ORDER,
  localizeSplRound,
  localizeSplTeamName,
} from "./saudiLeagueNames";

const API_BASE = "https://v3.football.api-sports.io";
const TIMEZONE = "Asia/Riyadh";

const LIVE_TTL = 15 * 1000;
const FIXTURES_TTL = 60 * 1000;
const MATCH_DETAIL_TTL = 20 * 1000;
const SEASON_TTL = 6 * 60 * 60 * 1000; // الموسم الحالي شبه ثابت

/**
 * سجل البطولات السعودية التي يغطّيها القسم، مفلتر على ما يدعمه المزود فعلًا
 * (الأعلام مأخوذة من coverage في /leagues). كأس ولي العهد (827) مستبعد —
 * متوقف منذ 2017. الموسم يُحلّ ديناميكيًا (current) فلا حاجة لتعديل الكود
 * عند انتقال المواسم؛ fallbackSeason احتياط لو فشل الطلب.
 */
export interface SaudiCompetition {
  id: number;
  slug: string;
  name: string;
  type: "league" | "cup";
  hasStandings: boolean;
  hasScorers: boolean;
  hasStats: boolean;
  fallbackSeason: number;
}

export const SAUDI_COMPETITIONS: SaudiCompetition[] = [
  { id: 307, slug: "pro-league", name: "دوري روشن للمحترفين", type: "league", hasStandings: true, hasScorers: true, hasStats: true, fallbackSeason: 2025 },
  { id: 308, slug: "division-1", name: "دوري يلو (الدرجة الأولى)", type: "league", hasStandings: true, hasScorers: true, hasStats: false, fallbackSeason: 2025 },
  { id: 309, slug: "division-2", name: "الدرجة الثانية", type: "league", hasStandings: true, hasScorers: false, hasStats: false, fallbackSeason: 2025 },
  { id: 504, slug: "kings-cup", name: "كأس الملك", type: "cup", hasStandings: false, hasScorers: true, hasStats: false, fallbackSeason: 2026 },
  { id: 826, slug: "super-cup", name: "كأس السوبر السعودي", type: "cup", hasStandings: false, hasScorers: true, hasStats: false, fallbackSeason: 2026 },
  { id: 1227, slug: "womens-league", name: "دوري السيدات الممتاز", type: "league", hasStandings: true, hasScorers: false, hasStats: false, fallbackSeason: 2026 },
];

export function getCompetition(slug: string): SaudiCompetition | undefined {
  return SAUDI_COMPETITIONS.find((c) => c.slug === slug);
}

export function listCompetitions() {
  return SAUDI_COMPETITIONS.map(({ slug, name, type, hasStandings, hasScorers, hasStats }) => ({
    slug,
    name,
    type,
    hasStandings,
    hasScorers,
    hasStats,
  }));
}

/** الموسم الحالي من المزود (current=true) مخزَّن 6 ساعات؛ يصمد أمام انتقال المواسم تلقائيًا */
async function seasonFor(comp: SaudiCompetition): Promise<number> {
  return withSWR(`spl:season:${comp.id}`, SEASON_TTL, SEASON_TTL * 2, async () => {
    try {
      const rows = await apiGet("leagues", { id: comp.id, current: "true" });
      const seasons: any[] = rows[0]?.seasons ?? [];
      const year = seasons.find((s: any) => s.current)?.year ?? seasons[seasons.length - 1]?.year;
      return typeof year === "number" ? year : comp.fallbackSeason;
    } catch {
      return comp.fallbackSeason;
    }
  });
}

/** هل العلم مرفوع؟ القسم مخفي تمامًا ما لم يُفعَّل صراحةً */
export function isSaudiLeagueEnabled(): boolean {
  return (process.env.SAUDI_LEAGUE_ENABLED || "").trim().toLowerCase() === "true";
}

/** هل المفتاح متاح؟ (منفصل عن العلم حتى نُميّز 404 المخفي عن 503 غير المهيّأ) */
export function isSaudiLeagueConfigured(): boolean {
  return Boolean((process.env.APIFOOTBALL_KEY || "").trim());
}

async function apiGet(path: string, params: Record<string, string | number>): Promise<any[]> {
  const apiKey = (process.env.APIFOOTBALL_KEY || "").trim();
  if (!apiKey) throw new Error("APIFOOTBALL_KEY is not set");

  const url = new URL(`${API_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const response = await fetch(url, {
    headers: { "x-apisports-key": apiKey },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`[SaudiLeague] API-Football HTTP ${response.status} for ${path}`);
  }

  const data: any = await response.json();
  const errors = data?.errors;
  if (errors && !Array.isArray(errors) && Object.keys(errors).length > 0) {
    throw new Error(`[SaudiLeague] API-Football error for ${path}: ${JSON.stringify(errors)}`);
  }
  return Array.isArray(data?.response) ? data.response : [];
}

// ---------- DTOs المُعرَّبة ----------

export interface SplTeam {
  id: number;
  name: string;
  logo: string;
  winner: boolean | null;
}

export interface SplFixture {
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
  venue: { name: string; city: string };
  home: SplTeam;
  away: SplTeam;
  goals: { home: number | null; away: number | null };
}

function localizeTeam(raw: any): SplTeam {
  return {
    id: raw?.id ?? 0,
    name: localizeSplTeamName(raw?.id, raw?.name ?? ""),
    logo: raw?.logo ?? "",
    winner: raw?.winner ?? null,
  };
}

function localizeFixture(item: any): SplFixture {
  const fx = item.fixture ?? {};
  const statusCode: string = fx.status?.short ?? "TBD";
  return {
    id: fx.id,
    date: fx.date,
    timestamp: fx.timestamp,
    status: {
      code: statusCode,
      label: WC_STATUS_AR[statusCode] ?? statusCode,
      elapsed: fx.status?.elapsed ?? null,
      live: WC_LIVE_STATUSES.has(statusCode),
      finished: WC_FINISHED_STATUSES.has(statusCode),
    },
    round: localizeSplRound(item.league?.round ?? ""),
    venue: { name: fx.venue?.name ?? "", city: fx.venue?.city ?? "" },
    home: localizeTeam(item.teams?.home),
    away: localizeTeam(item.teams?.away),
    goals: { home: item.goals?.home ?? null, away: item.goals?.away ?? null },
  };
}

// ---------- المباريات ----------

export async function getFixtures(comp: SaudiCompetition): Promise<SplFixture[]> {
  const season = await seasonFor(comp);
  return withSWR(`spl:fixtures:${comp.id}`, FIXTURES_TTL, FIXTURES_TTL * 2, async () => {
    const rows = await apiGet("fixtures", { league: comp.id, season, timezone: TIMEZONE });
    return rows.map(localizeFixture).sort((a, b) => a.timestamp - b.timestamp);
  });
}

export async function getLiveFixtures(comp: SaudiCompetition): Promise<SplFixture[]> {
  const season = await seasonFor(comp);
  return withSWR(`spl:live:${comp.id}`, LIVE_TTL, LIVE_TTL * 2, async () => {
    const rows = await apiGet("fixtures", {
      league: comp.id,
      season,
      live: "all",
      timezone: TIMEZONE,
    });
    return rows.map(localizeFixture).sort((a, b) => a.timestamp - b.timestamp);
  });
}

// ---------- الترتيب (جدول واحد للدوري) ----------

export interface SplStandingRow {
  rank: number;
  team: SplTeam;
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

export async function getStandings(comp: SaudiCompetition): Promise<SplStandingRow[]> {
  if (!comp.hasStandings) return [];
  const season = await seasonFor(comp);
  return withSWR(`spl:standings:${comp.id}`, CACHE_TTL.MEDIUM, CACHE_TTL.MEDIUM * 2, async () => {
    const rows = await apiGet("standings", { league: comp.id, season });
    const table: any[] = rows[0]?.league?.standings?.[0] ?? [];
    return table
      .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
      .map((row: any): SplStandingRow => ({
        rank: row.rank,
        team: localizeTeam(row.team),
        played: row.all?.played ?? 0,
        win: row.all?.win ?? 0,
        draw: row.all?.draw ?? 0,
        lose: row.all?.lose ?? 0,
        goalsFor: row.all?.goals?.for ?? 0,
        goalsAgainst: row.all?.goals?.against ?? 0,
        goalsDiff: row.goalsDiff ?? 0,
        points: row.points ?? 0,
        form: row.form ?? null,
      }));
  });
}

// ---------- الهدافون ----------

export interface SplScorer {
  rank: number;
  id: number;
  name: string;
  photo: string;
  team: SplTeam;
  goals: number;
  assists: number;
  penalties: number;
  matches: number;
}

export async function getTopScorers(comp: SaudiCompetition): Promise<SplScorer[]> {
  if (!comp.hasScorers) return [];
  const season = await seasonFor(comp);
  return withSWR(`spl:scorers:${comp.id}`, CACHE_TTL.LONG, CACHE_TTL.LONG * 2, async () => {
    const rows = await apiGet("players/topscorers", { league: comp.id, season });
    return rows.slice(0, 15).map((row: any, index: number): SplScorer => {
      const stats = row.statistics?.[0] ?? {};
      return {
        rank: index + 1,
        id: row.player?.id ?? 0,
        name: localizePlayerName(row.player?.name) || row.player?.name || "",
        photo: row.player?.photo ?? "",
        team: localizeTeam(stats.team),
        goals: stats.goals?.total ?? 0,
        assists: stats.goals?.assists ?? 0,
        penalties: stats.penalty?.scored ?? 0,
        matches: stats.games?.appearences ?? 0,
      };
    });
  });
}

// ---------- تفاصيل مباراة (أحداث + إحصاءات «لغة الأرقام») ----------

export interface SplMatchEvent {
  minute: number | null;
  extra: number | null;
  teamId: number;
  team: string;
  player: string;
  assist: string | null;
  type: string;
  label: string;
}

export interface SplStatRow {
  type: string;
  label: string;
  home: string | number | null;
  away: string | number | null;
}

export interface SplLineupPlayer {
  number: number | null;
  name: string;
  pos: string;
}

export interface SplLineup {
  team: { id: number; name: string; logo: string };
  formation: string | null;
  coach: string | null;
  startXI: SplLineupPlayer[];
  substitutes: SplLineupPlayer[];
}

export interface SplMatchDetail {
  fixture: SplFixture;
  events: SplMatchEvent[];
  statistics: {
    home: { id: number; name: string };
    away: { id: number; name: string };
    rows: SplStatRow[];
  } | null;
  lineups: SplLineup[];
}

const POS_AR: Record<string, string> = { G: "حراسة", D: "دفاع", M: "وسط", F: "هجوم" };

function localizeLineupPlayer(p: any): SplLineupPlayer {
  const pl = p?.player ?? {};
  return {
    number: pl.number ?? null,
    name: localizePlayerName(pl.name) || pl.name || "",
    pos: POS_AR[pl.pos] ?? pl.pos ?? "",
  };
}

function localizeLineups(rows: any[]): SplLineup[] {
  return rows.map((t: any): SplLineup => ({
    team: {
      id: t.team?.id ?? 0,
      name: localizeSplTeamName(t.team?.id, t.team?.name ?? ""),
      logo: t.team?.logo ?? "",
    },
    formation: t.formation ?? null,
    coach: t.coach?.name ?? null,
    startXI: (t.startXI ?? []).map(localizeLineupPlayer),
    substitutes: (t.substitutes ?? []).map(localizeLineupPlayer),
  }));
}

function localizeEventRow(e: any): SplMatchEvent {
  const loc = localizeEvent(e.type ?? "", e.detail ?? "");
  return {
    minute: e.time?.elapsed ?? null,
    extra: e.time?.extra ?? null,
    teamId: e.team?.id ?? 0,
    team: localizeSplTeamName(e.team?.id, e.team?.name ?? ""),
    player: localizePlayerName(e.player?.name) || e.player?.name || "",
    assist: e.assist?.name ? localizePlayerName(e.assist.name) || e.assist.name : null,
    type: loc.type,
    label: loc.label,
  };
}

function localizeStats(rows: any[]): SplMatchDetail["statistics"] {
  if (rows.length < 2) return null;
  const [home, away] = rows;
  const homeMap = new Map<string, any>((home.statistics ?? []).map((s: any) => [s.type, s.value]));
  const awayMap = new Map<string, any>((away.statistics ?? []).map((s: any) => [s.type, s.value]));
  const order = (t: string) => {
    const i = SPL_STAT_ORDER.indexOf(t);
    return i === -1 ? 99 : i;
  };
  const types = [...new Set<string>((home.statistics ?? []).map((s: any) => s.type))].sort(
    (a, b) => order(a) - order(b)
  );
  return {
    home: { id: home.team?.id ?? 0, name: localizeSplTeamName(home.team?.id, home.team?.name ?? "") },
    away: { id: away.team?.id ?? 0, name: localizeSplTeamName(away.team?.id, away.team?.name ?? "") },
    rows: types.map((t) => ({
      type: t,
      label: SPL_STAT_AR[t] ?? t,
      home: homeMap.get(t) ?? null,
      away: awayMap.get(t) ?? null,
    })),
  };
}

export async function getMatchDetail(fixtureId: number): Promise<SplMatchDetail | null> {
  return withSWR(`spl:match:${fixtureId}`, MATCH_DETAIL_TTL, MATCH_DETAIL_TTL * 2, async () => {
    const rows = await apiGet("fixtures", { id: fixtureId, timezone: TIMEZONE });
    const item = rows[0];
    if (!item) return null;
    const fixture = localizeFixture(item);
    const [eventsRaw, statsRaw, lineupsRaw] = await Promise.all([
      apiGet("fixtures/events", { fixture: fixtureId }).catch(() => []),
      apiGet("fixtures/statistics", { fixture: fixtureId }).catch(() => []),
      apiGet("fixtures/lineups", { fixture: fixtureId }).catch(() => []),
    ]);
    return {
      fixture,
      events: eventsRaw.map(localizeEventRow),
      statistics: localizeStats(statsRaw),
      lineups: localizeLineups(lineupsRaw),
    };
  });
}
