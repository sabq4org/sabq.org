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
  /** الموجة 1: إثراء اختياري — يُملأ فقط إن طُلب عبر ?with=stats */
  stats: SplTeamStats | null;
  coach: SplCoach | null;
  topScorers: SplTeamScorer[];
}

/**
 * صفحة النادي المتكاملة: هويته + صفّه في ترتيب دوريه + مبارياته + تشكيلته.
 * يحدّد دوري النادي بالبحث في جداول البطولات السعودية ذات الترتيب (روشن أولًا).
 * كل النداءات خلف كاش SWR مشترك، فالتجميع لا يكلّف المزود نداءات تُذكر.
 *
 * بموجب الموجة 1: تُضاف إحصاءات النادي + المدرب + هدّافوه عند تمرير
 * withExtras=true (تُجلب فقط في صفحة النادي، لا في الاستهلاك الداخلي).
 */
export async function getTeamProfile(teamId: number, opts?: { withExtras?: boolean }): Promise<SplTeamProfile | null> {
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

  const fetchBase = [
    getTeamInfo(teamId).catch(() => null),
    getSquad(teamId).catch(() => null),
  ] as const;

  // الإثراء يُجلب تزامنيًا (Promise.all) فقط حين يطلبه المستهلك، حتى لا
  // تُكلّف نقطة /api/sports/team/:id نداءات إضافية عند من لا يستخدمها.
  const withExtras = opts?.withExtras === true;
  const extrasPromise = withExtras
    ? Promise.all([
        getTeamStats(teamId, comp).catch(() => null),
        getTeamCoach(teamId).catch(() => null),
        getTeamTopScorers(teamId, comp).catch(() => [] as SplTeamScorer[]),
      ])
    : Promise.resolve([null, null, [] as SplTeamScorer[]] as const);

  const [[info, squad], [stats, coach, topScorers]] = await Promise.all([Promise.all(fetchBase), extrasPromise]);

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
    stats,
    coach,
    topScorers,
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

// ---------- الموجة 1: إثراء النادي والبطولة ----------

const ASSISTS_TTL = CACHE_TTL.LONG; // صنّاع الأهداف يتحرك ببطء كالهدّافين
const TEAM_STATS_TTL = 30 * 60 * 1000; // إحصاءات النادي شبه ثابتة بين الجولات
const COACH_TTL = 6 * 60 * 60 * 1000; // المدرب لا يتغيّر إلا بين المواسم غالبًا
const TEAM_SCORERS_TTL = CACHE_TTL.LONG; // هدّافو النادي يحتاج تجديدًا بطيئًا

/** هل تدعم البطولة إحصاءات تفصيلية للفرق؟ نفس علم hasStats في SAUDI_COMPETITIONS. */
function competitionForStats(comp: SaudiCompetition | null): SaudiCompetition | null {
  return comp && comp.hasStats ? comp : null;
}

// ---- صنّاع الأهداف ----

export interface SplAssister {
  rank: number;
  id: number;
  name: string;
  photo: string;
  team: SplTeam;
  goals: number;
  assists: number;
  matches: number;
}

/**
 * أعلى صنّاع الأهداف في بطولة. نفس بنية topScorers لكنها تستدعي
 * players/topassists. ترجع [] للبطولات التي لا تدعمها أو إن غاب المزوّد.
 */
export async function getTopAssists(comp: SaudiCompetition): Promise<SplAssister[]> {
  if (!comp.hasScorers) return [];
  const season = await seasonFor(comp);
  return withSWR(`spl:assists:${comp.id}`, ASSISTS_TTL, ASSISTS_TTL * 2, async () => {
    const rows = await apiGet("players/topassists", { league: comp.id, season });
    return rows.slice(0, 15).map((row: any, index: number): SplAssister => {
      const stats = row.statistics?.[0] ?? {};
      return {
        rank: index + 1,
        id: row.player?.id ?? 0,
        name: localizePlayerName(row.player?.name) || row.player?.name || "",
        photo: row.player?.photo ?? "",
        team: localizeTeam(stats.team),
        goals: stats.goals?.total ?? 0,
        assists: stats.goals?.assists ?? 0,
        matches: stats.games?.appearences ?? 0,
      };
    });
  });
}

// ---- إحصاءات النادي الشاملة (teams/statistics) ----

export interface SplTeamStatFixtures {
  played: { total: number; home: number; away: number };
  wins: { total: number; home: number; away: number };
  draws: { total: number; home: number; away: number };
  loses: { total: number; home: number; away: number };
}

export interface SplTeamStatGoals {
  for: { total: number; average: string; home: string; away: string };
  against: { total: number; average: string; home: string; away: string };
}

export interface SplTeamStatBiggest {
  winsHome: string | null;
  winsAway: string | null;
  losesHome: string | null;
  losesAway: string | null;
  streakWin: number | null;
  streakLose: number | null;
  streakDraw: number | null;
}

export interface SplTeamStatSummary {
  cleanSheets: { total: number; home: number; away: number };
  failedToScore: { total: number; home: number; away: number };
  cards: { yellowTotal: number; redTotal: number };
  mostUsedFormation: string | null;
}

export interface SplTeamStats {
  leagueId: number;
  season: number;
  fixtures: SplTeamStatFixtures;
  goals: SplTeamStatGoals;
  biggest: SplTeamStatBiggest;
  summary: SplTeamStatSummary;
}

const numOr0 = (v: any): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const strOrNull = (v: any): string | null => (typeof v === "string" && v.trim() ? v : null);
const numOrNull = (v: any): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * إحصاءات النادي الكاملة في بطولته: لعب/فوز/تعادل/خسارة (داخل وخارج الأرض)،
 * الأهداف له/عليه ومتوسطاتها، أكبر النتائج، أطول السلاسل، نظافة الشباك،
 * البطاقات، والتشكيلة الأكثر استخداماً. مصدرها teams/statistics.
 *
 * تتطلّب بطولة تدعم الإحصاءات (hasStats). إن لم تُمرَّر بطولة صراحةً نكتشف
 * دوري النادي بالبحث في جداول الترتيب (كما يفعل getTeamProfile)، حتى تعمل
 * النقطة المنفصلة /api/sports/team/:id/stats بلا حاجة لتحديد البطولة.
 */
export async function getTeamStats(
  teamId: number,
  compOverride?: SaudiCompetition | null,
): Promise<SplTeamStats | null> {
  // البطولة الممرّرة أولًا؛ وإلا نكتشفها من الترتيب.
  let comp = competitionForStats(compOverride ?? null);
  if (!comp) {
    const leagueComps = SAUDI_COMPETITIONS.filter((c) => c.hasStats);
    for (const c of leagueComps) {
      const table = await getStandings(c).catch(() => [] as SplStandingRow[]);
      if (table.some((r) => r.team.id === teamId)) {
        comp = c;
        break;
      }
    }
  }
  if (!comp) return null;
  const season = await seasonFor(comp);

  return withSWR(`spl:teamstats:${teamId}:${comp.id}`, TEAM_STATS_TTL, TEAM_STATS_TTL * 2, async () => {
    // ملاحظة: teams/statistics لا يدعم معامل timezone (عكس fixtures) — إرساله
    // يردّ خطأ "The Timezone field do not exist." ويفشل الطلب كله. تُترك الأهداف
    // كما يرجعها المزوّد (UTC)؛ الأرقام الإجمالية لا تتأثر بالمنطقة الزمنية.
    const rows = await apiGet("teams/statistics", {
      league: comp.id,
      season,
      team: teamId,
    });
    const data = rows[0];
    if (!data) return null;

    const fx = data.fixtures ?? {};
    const gl = data.goals ?? {};
    const bg = data.biggest ?? {};
    const cs = data.clean_sheet ?? {};
    const fts = data.failed_to_score ?? {};
    const cards = data.cards ?? {};

    return {
      leagueId: comp.id,
      season,
      fixtures: {
        played: { total: numOr0(fx.played?.total), home: numOr0(fx.played?.home), away: numOr0(fx.played?.away) },
        wins: { total: numOr0(fx.wins?.total), home: numOr0(fx.wins?.home), away: numOr0(fx.wins?.away) },
        draws: { total: numOr0(fx.draws?.total), home: numOr0(fx.draws?.home), away: numOr0(fx.draws?.away) },
        loses: { total: numOr0(fx.loses?.total), home: numOr0(fx.loses?.home), away: numOr0(fx.loses?.away) },
      },
      goals: {
        for: {
          total: numOr0(gl.for?.total?.total),
          average: strOrNull(gl.for?.average?.total) ?? "0",
          home: strOrNull(gl.for?.average?.home) ?? "0",
          away: strOrNull(gl.for?.average?.away) ?? "0",
        },
        against: {
          total: numOr0(gl.against?.total?.total),
          average: strOrNull(gl.against?.average?.total) ?? "0",
          home: strOrNull(gl.against?.average?.home) ?? "0",
          away: strOrNull(gl.against?.average?.away) ?? "0",
        },
      },
      biggest: {
        winsHome: strOrNull(bg.wins?.home),
        winsAway: strOrNull(bg.wins?.away),
        losesHome: strOrNull(bg.loses?.home),
        losesAway: strOrNull(bg.loses?.away),
        streakWin: numOrNull(bg.streak?.wins),
        streakLose: numOrNull(bg.streak?.loses),
        streakDraw: numOrNull(bg.streak?.draws),
      },
      summary: {
        cleanSheets: { total: numOr0(cs.total), home: numOr0(cs.home), away: numOr0(cs.away) },
        failedToScore: { total: numOr0(fts.total), home: numOr0(fts.home), away: numOr0(fts.away) },
        cards: {
          yellowTotal: numOr0(cards.yellow?.total),
          redTotal: numOr0(cards.red?.total),
        },
        mostUsedFormation: strOrNull(data.lineups?.[0]?.formation),
      },
    };
  });
}

// ---- المدرب ----

export interface SplCoach {
  id: number;
  name: string;
  photo: string;
  nationality: string;
  age: number | null;
  startDate: string | null;
  career: { team: string; start: string | null; end: string | null }[];
}

/**
 * المدرب الحالي للنادي + أبرز محطّاته. المصدر coaches?team. الاسم يعود لخريطة
 * التعريب إن أمكن (اسم النادي)، وجنسية المدرب تُترجم عبر localizeSplCountry.
 */
export async function getTeamCoach(teamId: number): Promise<SplCoach | null> {
  return withSWR(`spl:coach:${teamId}`, COACH_TTL, COACH_TTL * 2, async () => {
    const rows = await apiGet("coachs", { id: teamId });
    const entry = rows[0];
    if (!entry?.id) return null;
    return {
      id: entry.id,
      name: localizePlayerName(entry.name) || entry.name || "",
      photo: entry.photo ?? "",
      nationality: localizeSplCountry(entry.nationality ?? "") || "",
      age: Number.isFinite(entry.age) ? entry.age : null,
      startDate: entry.career?.[0]?.start ? String(entry.career[0].start) : null,
      career: (Array.isArray(entry.career) ? entry.career : [])
        .map((c: any) => ({
          team: localizeSplTeamName(c.team?.id, c.team?.name ?? "") || c.team?.name || "",
          start: c.start ? String(c.start) : null,
          end: c.end ? String(c.end) : null,
        }))
        .filter((c: { team: string }) => c.team)
        .slice(0, 8),
    };
  });
}

// ---- هدّافو النادي ----

export interface SplTeamScorer {
  rank: number;
  id: number;
  name: string;
  photo: string;
  goals: number;
  assists: number;
  penalties: number;
  matches: number;
}

/**
 * أعلى 5 هدّافين في النادي خلال موسمه الحالي. تُجلب من players/topscorers
 * مفلترة على teamId ثم تُقتطع لأعلى 5. ترجع [] إن غابت البيانات.
 */
export async function getTeamTopScorers(
  teamId: number,
  compOverride?: SaudiCompetition | null,
): Promise<SplTeamScorer[]> {
  const comp = competitionForStats(compOverride ?? null) ?? SAUDI_COMPETITIONS.find((c) => c.slug === "pro-league")!;
  const season = await seasonFor(comp);

  return withSWR(`spl:teamscorers:${teamId}:${comp.id}`, TEAM_SCORERS_TTL, TEAM_SCORERS_TTL * 2, async () => {
    const rows = await apiGet("players/topscorers", { league: comp.id, season });
    return rows
      .filter((row: any) => row.statistics?.[0]?.team?.id === teamId)
      .slice(0, 5)
      .map((row: any, index: number): SplTeamScorer => {
        const stats = row.statistics?.[0] ?? {};
        return {
          rank: index + 1,
          id: row.player?.id ?? 0,
          name: localizePlayerName(row.player?.name) || row.player?.name || "",
          photo: row.player?.photo ?? "",
          goals: stats.goals?.total ?? 0,
          assists: stats.goals?.assists ?? 0,
          penalties: stats.penalty?.scored ?? 0,
          matches: stats.games?.appearences ?? 0,
        };
      });
  });
}

// ---------- تقييمات لاعبي المباراة (رجل المباراة الحقيقي) ----------
// تُجلب بكسل (lazy) عند فتح تبويب التقييمات فقط — ليست ضمن getMatchDetail
// تفاديًا لنداءة خامسة ثقيلة (بيانات 22+ لاعبًا) على كل فتح مباراة.

export interface SplMatchPlayerRating {
  id: number;
  name: string;
  photo: string;
  teamId: number;
  team: string;
  number: number | null;
  pos: string;
  rating: number | null;
  minutes: number;
  goals: number;
  assists: number;
  yellow: number;
  red: number;
  captain: boolean;
}

export interface SplMatchRatings {
  motm: { id: number; name: string; team: string; rating: number } | null;
  players: SplMatchPlayerRating[];
}

export async function getMatchPlayerRatings(fixtureId: number): Promise<SplMatchRatings | null> {
  return withSWR(`spl:matchplayers:${fixtureId}`, MATCH_DETAIL_TTL, MATCH_DETAIL_TTL * 6, async () => {
    const rows = await apiGet("fixtures/players", { fixture: fixtureId });
    if (rows.length === 0) return null;

    const players: SplMatchPlayerRating[] = [];
    for (const teamRow of rows) {
      const team = localizeTeam(teamRow.team);
      for (const entry of teamRow.players ?? []) {
        const st = entry.statistics?.[0] ?? {};
        const ratingNum = parseFloat(st.games?.rating ?? "");
        players.push({
          id: entry.player?.id ?? 0,
          name: localizePlayerName(entry.player?.name) || entry.player?.name || "",
          photo: entry.player?.photo ?? "",
          teamId: team.id,
          team: team.name,
          number: st.games?.number ?? null,
          pos: POS_AR[st.games?.position] ?? st.games?.position ?? "",
          rating: Number.isFinite(ratingNum) ? ratingNum : null,
          minutes: st.games?.minutes ?? 0,
          goals: st.goals?.total ?? 0,
          assists: st.goals?.assists ?? 0,
          yellow: st.cards?.yellow ?? 0,
          red: st.cards?.red ?? 0,
          captain: st.games?.captain ?? false,
        });
      }
    }
    if (players.length === 0) return null;

    // الأعلى تقييمًا أولًا؛ من بلا تقييم في الأسفل.
    players.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
    const top = players[0];
    const motm =
      top && top.rating != null
        ? { id: top.id, name: top.name, team: top.team, rating: top.rating }
        : null;

    return { motm, players };
  });
}
