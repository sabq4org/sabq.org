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
  SPL_POSITION_AR,
  SPL_POSITION_ORDER,
  SPL_STAT_AR,
  SPL_STAT_ORDER,
  SPL_TROPHY_PLACE_AR,
  localizeSplCompetition,
  localizeSplCountry,
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

// ---------- النادي: معلومات + تشكيلة + صفحة متكاملة ----------

const SQUAD_TTL = 24 * 60 * 60 * 1000; // التشكيلة شبه ثابتة خلال الموسم
const PLAYER_CARD_TTL = 60 * 60 * 1000; // الملف شبه ثابت؛ أرقام الموسم تتجدد كل ساعة

export interface SplTeamInfo {
  id: number;
  name: string;
  logo: string;
  country: string | null;
  founded: number | null;
  venue: { name: string; city: string; capacity: number | null; image: string } | null;
}

export interface SplSquadPlayer {
  id: number;
  name: string;
  number: number | null;
  position: string;
  positionEn: string;
  age: number | null;
  photo: string;
}

export interface SplSquad {
  team: SplTeamInfo;
  players: SplSquadPlayer[];
}

/** معلومات النادي (الملعب، سنة التأسيس) — اسم النادي بالخريطة الثابتة */
async function getTeamInfo(teamId: number): Promise<SplTeamInfo | null> {
  return withSWR(`spl:teaminfo:${teamId}`, SQUAD_TTL, SQUAD_TTL * 2, async () => {
    const rows = await apiGet("teams", { id: teamId });
    const entry = rows[0];
    if (!entry?.team?.id) return null;
    return {
      id: entry.team.id,
      name: localizeSplTeamName(entry.team.id, entry.team.name ?? ""),
      logo: entry.team.logo ?? "",
      country: entry.team.country ?? null,
      founded: entry.team.founded ?? null,
      venue: entry.venue
        ? {
            name: entry.venue.name ?? "",
            city: entry.venue.city ?? "",
            capacity: entry.venue.capacity ?? null,
            image: entry.venue.image ?? "",
          }
        : null,
    };
  });
}

/** تشكيلة النادي مرتّبة حسب المركز ثم الرقم */
export async function getSquad(teamId: number): Promise<SplSquad | null> {
  return withSWR(`spl:squad:${teamId}`, SQUAD_TTL, SQUAD_TTL * 2, async () => {
    const rows = await apiGet("players/squads", { team: teamId });
    const entry = rows[0];
    if (!entry) return null;
    const players: SplSquadPlayer[] = (entry.players ?? [])
      .map((p: any): SplSquadPlayer => ({
        id: p.id ?? 0,
        name: localizePlayerName(p.name) || p.name || "",
        number: p.number ?? null,
        position: SPL_POSITION_AR[p.position] ?? p.position ?? "",
        positionEn: p.position ?? "",
        age: p.age ?? null,
        photo: p.photo ?? "",
      }))
      .sort(
        (a: SplSquadPlayer, b: SplSquadPlayer) =>
          (SPL_POSITION_ORDER[a.positionEn] ?? 9) - (SPL_POSITION_ORDER[b.positionEn] ?? 9) ||
          (a.number ?? 99) - (b.number ?? 99)
      );
    const team: SplTeamInfo = {
      id: entry.team?.id ?? teamId,
      name: localizeSplTeamName(entry.team?.id, entry.team?.name ?? ""),
      logo: entry.team?.logo ?? "",
      country: null,
      founded: null,
      venue: null,
    };
    return { team, players };
  });
}

export interface SplTeamProfile {
  team: SplTeamInfo;
  /** صف النادي في ترتيب دوريه (إن كان في دوري له جدول) */
  standing: SplStandingRow | null;
  /** سلَك البطولة التي عُثر على النادي فيها (لجلب مبارياته) */
  competitionSlug: string | null;
  competitionName: string | null;
  fixtures: SplFixture[];
  squad: SplSquadPlayer[];
}

/**
 * صفحة النادي المتكاملة: هويته + صفّه في ترتيب دوريه + مبارياته + تشكيلته.
 * يحدّد دوري النادي بالبحث في جداول البطولات السعودية ذات الترتيب (روشن أولًا).
 * كل النداءات خلف كاش SWR مشترك، فالتجميع لا يكلّف المزود نداءات تُذكر.
 */
export async function getTeamProfile(teamId: number): Promise<SplTeamProfile | null> {
  const leagueComps = SAUDI_COMPETITIONS.filter((c) => c.hasStandings);

  let comp: SaudiCompetition | null = null;
  let standing: SplStandingRow | null = null;
  for (const c of leagueComps) {
    const table = await getStandings(c).catch(() => [] as SplStandingRow[]);
    const row = table.find((r) => r.team.id === teamId);
    if (row) {
      comp = c;
      standing = row;
      break;
    }
  }

  const [info, squad] = await Promise.all([
    getTeamInfo(teamId).catch(() => null),
    getSquad(teamId).catch(() => null),
  ]);

  let fixtures: SplFixture[] = [];
  if (comp) {
    const all = await getFixtures(comp).catch(() => [] as SplFixture[]);
    fixtures = all
      .filter((f) => f.home.id === teamId || f.away.id === teamId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  const team: SplTeamInfo | null = info ?? squad?.team ?? (standing
    ? { id: standing.team.id, name: standing.team.name, logo: standing.team.logo, country: null, founded: null, venue: null }
    : null);
  if (!team || !team.id) return null;

  return {
    team,
    standing,
    competitionSlug: comp?.slug ?? null,
    competitionName: comp?.name ?? null,
    fixtures,
    squad: squad?.players ?? [],
  };
}

// ---------- بطاقة اللاعب الشاملة ----------

const parseMetric = (value: unknown): number | null => {
  const n = parseInt(String(value ?? "").replace(/\D/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export interface SplPlayerSeasonStats {
  competition: string;
  team: SplTeam;
  matches: number;
  lineups: number;
  minutes: number;
  rating: number | null;
  goals: number;
  assists: number;
  yellow: number;
  red: number;
  saves: number;
  conceded: number;
}

export interface SplPlayerCareerStop {
  teamId: number;
  team: string;
  logo: string;
  seasons: number[];
}

export interface SplPlayerTrophy {
  competition: string;
  country: string;
  season: string;
  place: string;
  winner: boolean;
}

export interface SplPlayerCard {
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
  /** أرقام اللاعب في كل بطولة لعبها هذا الموسم (الأكثر مشاركةً أولًا) */
  seasonStats: SplPlayerSeasonStats[];
  career: SplPlayerCareerStop[];
  trophies: SplPlayerTrophy[];
}

export async function getPlayerCard(playerId: number): Promise<SplPlayerCard | null> {
  // موسم دوري روشن الحالي كمرجع لأرقام الموسم الجاري
  const proLeague = SAUDI_COMPETITIONS.find((c) => c.slug === "pro-league")!;
  const season = await seasonFor(proLeague);

  return withSWR(`spl:player:${playerId}`, PLAYER_CARD_TTL, PLAYER_CARD_TTL * 2, async () => {
    const [profileRows, careerRows, trophyRows, statsRows] = await Promise.all([
      apiGet("players/profiles", { player: playerId }),
      apiGet("players/teams", { player: playerId }).catch(() => [] as any[]),
      apiGet("trophies", { player: playerId }).catch(() => [] as any[]),
      apiGet("players", { id: playerId, season }).catch(() => [] as any[]),
    ]);

    const p = profileRows[0]?.player;
    if (!p?.id) return null;

    const seasonStats: SplPlayerSeasonStats[] = (statsRows[0]?.statistics ?? [])
      .map((st: any): SplPlayerSeasonStats => ({
        competition: localizeSplCompetition(st.league?.name ?? ""),
        team: localizeTeam(st.team),
        matches: st.games?.appearences ?? 0,
        lineups: st.games?.lineups ?? 0,
        minutes: st.games?.minutes ?? 0,
        rating: Number.isFinite(parseFloat(st.games?.rating ?? "")) ? parseFloat(st.games.rating) : null,
        goals: st.goals?.total ?? 0,
        assists: st.goals?.assists ?? 0,
        yellow: st.cards?.yellow ?? 0,
        red: (st.cards?.red ?? 0) + (st.cards?.yellowred ?? 0),
        saves: st.goals?.saves ?? 0,
        conceded: st.goals?.conceded ?? 0,
      }))
      .filter((s: SplPlayerSeasonStats) => s.matches > 0)
      .sort((a: SplPlayerSeasonStats, b: SplPlayerSeasonStats) => b.matches - a.matches);

    const career: SplPlayerCareerStop[] = careerRows
      .map((row: any): SplPlayerCareerStop => ({
        teamId: row.team?.id ?? 0,
        team: localizeSplTeamName(row.team?.id, row.team?.name ?? ""),
        logo: row.team?.logo ?? "",
        seasons: ((row.seasons ?? []) as number[]).filter((s) => Number.isFinite(s)).sort((a, b) => a - b),
      }))
      .filter((stop: SplPlayerCareerStop) => stop.team)
      .sort(
        (a: SplPlayerCareerStop, b: SplPlayerCareerStop) =>
          (b.seasons[b.seasons.length - 1] ?? 0) - (a.seasons[a.seasons.length - 1] ?? 0)
      );

    const seen = new Set<string>();
    const trophies: SplPlayerTrophy[] = trophyRows
      .filter((row: any) => row?.league && row?.season)
      .filter((row: any) => {
        const key = `${row.league}|${row.country}|${row.season}|${row.place}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((row: any): SplPlayerTrophy => ({
        competition: localizeSplCompetition(row.league),
        country: localizeSplCountry(row.country ?? ""),
        season: String(row.season),
        place: SPL_TROPHY_PLACE_AR[row.place] ?? row.place ?? "",
        winner: row.place === "Winner",
      }))
      .sort((a: SplPlayerTrophy, b: SplPlayerTrophy) => b.season.localeCompare(a.season));

    const officialFull = [p.firstname, p.lastname].filter(Boolean).join(" ").trim();
    const displayName = localizePlayerName(p.name) || p.name || "";
    const translatedFull = officialFull ? localizePlayerName(officialFull) || officialFull : "";

    return {
      id: p.id,
      name: displayName,
      fullName: translatedFull && translatedFull !== displayName ? translatedFull : null,
      photo: p.photo ?? "",
      position: SPL_POSITION_AR[p.position] ?? p.position ?? "",
      number: p.number ?? null,
      age: p.age ?? null,
      birthDate: p.birth?.date ?? null,
      birthPlace: p.birth?.place ? localizePlayerName(p.birth.place) || p.birth.place : null,
      nationality: localizeSplCountry(p.nationality ?? "") || null,
      height: parseMetric(p.height),
      weight: parseMetric(p.weight),
      seasonStats,
      career,
      trophies,
    };
  });
}
