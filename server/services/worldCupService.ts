/**
 * خدمة كأس العالم 2026 — عميل API-Football (v3.football.api-sports.io).
 *
 * كل الاستجابات تُعرَّب هنا (منتخبات/ملاعب/جولات/حالات/أحداث) قبل وصولها
 * للواجهة، وكل نقطة بيانات خلف كاش SWR بحيث يخدم آلاف الزوار من طلب واحد
 * للمزود. التوقيت يُطلب من المزود مباشرة بتوقيت الرياض.
 */
import { withSWR, CACHE_TTL } from "../memoryCache";
import {
  SAUDI_TEAM_ID,
  WC_FINISHED_STATUSES,
  WC_LIVE_STATUSES,
  WC_STATUS_AR,
  localizeEvent,
  localizeGroup,
  localizePlayerName,
  localizeRound,
  localizeTeamName,
  localizeVenue,
} from "./worldCupNames";

const API_BASE = "https://v3.football.api-sports.io";
const LEAGUE_ID = 1; // World Cup
const SEASON = 2026;
const TIMEZONE = "Asia/Riyadh";

// إيقاعات تحديث أقصر من CACHE_TTL العام — البيانات الحية تتغير بالثواني
const LIVE_TTL = 15 * 1000;
const FIXTURES_TTL = 60 * 1000;
const MATCH_DETAIL_LIVE_TTL = 20 * 1000;

export function isWorldCupConfigured(): boolean {
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
    throw new Error(`[WorldCup] API-Football HTTP ${response.status} for ${path}`);
  }

  const data: any = await response.json();
  const errors = data?.errors;
  if (errors && !Array.isArray(errors) && Object.keys(errors).length > 0) {
    throw new Error(`[WorldCup] API-Football error for ${path}: ${JSON.stringify(errors)}`);
  }
  return Array.isArray(data?.response) ? data.response : [];
}

// ---------- DTOs المُعرَّبة التي تستهلكها الواجهة ----------

export interface WcTeam {
  id: number;
  name: string;
  logo: string;
  winner: boolean | null;
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

function localizeTeam(raw: any): WcTeam {
  return {
    id: raw?.id ?? 0,
    name: localizeTeamName(raw?.id, raw?.name ?? ""),
    logo: raw?.logo ?? "",
    winner: raw?.winner ?? null,
  };
}

function localizeFixture(item: any): WcFixture {
  const fx = item.fixture ?? {};
  const statusCode: string = fx.status?.short ?? "TBD";
  const hasPenalties =
    item.score?.penalty?.home != null || item.score?.penalty?.away != null;
  return {
    id: fx.id,
    date: fx.date,
    timestamp: fx.timestamp,
    status: {
      code: statusCode,
      label: WC_STATUS_AR[statusCode] ?? statusCode,
      elapsed: fx.status?.elapsed ?? null,
      extra: fx.status?.extra ?? null,
      live: WC_LIVE_STATUSES.has(statusCode),
      finished: WC_FINISHED_STATUSES.has(statusCode),
    },
    round: localizeRound(item.league?.round ?? ""),
    roundEn: item.league?.round ?? "",
    venue: localizeVenue(fx.venue?.name, fx.venue?.city),
    home: localizeTeam(item.teams?.home),
    away: localizeTeam(item.teams?.away),
    goals: { home: item.goals?.home ?? null, away: item.goals?.away ?? null },
    penalties: hasPenalties
      ? { home: item.score?.penalty?.home ?? null, away: item.score?.penalty?.away ?? null }
      : null,
  };
}

// ---------- نقاط البيانات المكشوفة للراوتر ----------

export async function getFixtures(): Promise<WcFixture[]> {
  return withSWR("wc:fixtures", FIXTURES_TTL, FIXTURES_TTL * 2, async () => {
    const rows = await apiGet("fixtures", {
      league: LEAGUE_ID,
      season: SEASON,
      timezone: TIMEZONE,
    });
    return rows.map(localizeFixture).sort((a, b) => a.timestamp - b.timestamp);
  });
}

export async function getLiveFixtures(): Promise<WcFixture[]> {
  return withSWR("wc:live", LIVE_TTL, LIVE_TTL * 2, async () => {
    const rows = await apiGet("fixtures", {
      league: LEAGUE_ID,
      season: SEASON,
      live: "all",
      timezone: TIMEZONE,
    });
    return rows.map(localizeFixture).sort((a, b) => a.timestamp - b.timestamp);
  });
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

export async function getStandings(): Promise<WcGroup[]> {
  return withSWR("wc:standings", CACHE_TTL.MEDIUM, CACHE_TTL.MEDIUM * 2, async () => {
    const rows = await apiGet("standings", { league: LEAGUE_ID, season: SEASON });
    const tables: any[][] = rows[0]?.league?.standings ?? [];
    return tables
      .filter((table) => /^Group/i.test(table[0]?.group ?? ""))
      .map((table) => ({
        group: localizeGroup(table[0]?.group ?? ""),
        groupEn: table[0]?.group ?? "",
        rows: table.map((row: any): WcStandingRow => ({
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
        })),
      }));
  });
}

export interface WcScorer {
  rank: number;
  name: string;
  photo: string;
  team: WcTeam;
  goals: number;
  assists: number;
  penalties: number;
  minutes: number;
  matches: number;
}

export async function getTopScorers(): Promise<WcScorer[]> {
  return withSWR("wc:scorers", CACHE_TTL.LONG, CACHE_TTL.LONG * 2, async () => {
    const rows = await apiGet("players/topscorers", { league: LEAGUE_ID, season: SEASON });
    return rows.slice(0, 10).map((row: any, index: number): WcScorer => {
      const stats = row.statistics?.[0] ?? {};
      return {
        rank: index + 1,
        name: localizePlayerName(row.player?.name),
        photo: row.player?.photo ?? "",
        team: localizeTeam(stats.team),
        goals: stats.goals?.total ?? 0,
        assists: stats.goals?.assists ?? 0,
        penalties: stats.penalty?.scored ?? 0,
        minutes: stats.games?.minutes ?? 0,
        matches: stats.games?.appearences ?? 0,
      };
    });
  });
}

export interface WcPrediction {
  home: number;
  draw: number;
  away: number;
  advice: string | null;
}

const parsePercent = (value: unknown): number => {
  const n = parseInt(String(value ?? "").replace("%", ""), 10);
  return Number.isFinite(n) ? n : 0;
};

export async function getPrediction(fixtureId: number): Promise<WcPrediction | null> {
  return withSWR(`wc:prediction:${fixtureId}`, CACHE_TTL.VERY_LONG, CACHE_TTL.VERY_LONG * 2, async () => {
    const rows = await apiGet("predictions", { fixture: fixtureId });
    const p = rows[0]?.predictions;
    if (!p) return null;
    return {
      home: parsePercent(p.percent?.home),
      draw: parsePercent(p.percent?.draw),
      away: parsePercent(p.percent?.away),
      advice: null, // نص النصيحة يأتي إنجليزيًا من المزود — النِّسَب تكفي للواجهة
    };
  });
}

export interface WcMatchEvent {
  minute: number;
  extraMinute: number | null;
  teamId: number;
  type: string;
  label: string;
  player: string;
  assist: string | null;
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

const STAT_AR: Record<string, string> = {
  "Ball Possession": "الاستحواذ",
  "Total Shots": "التسديدات",
  "Shots on Goal": "تسديدات على المرمى",
  "Shots off Goal": "تسديدات خارج المرمى",
  "Blocked Shots": "تسديدات مصدودة",
  "Corner Kicks": "الركنيات",
  Offsides: "التسلل",
  Fouls: "الأخطاء",
  "Yellow Cards": "البطاقات الصفراء",
  "Red Cards": "البطاقات الحمراء",
  "Goalkeeper Saves": "تصديات الحارس",
  "Total passes": "التمريرات",
  "Passes accurate": "تمريرات صحيحة",
  "Passes %": "دقة التمرير",
  "expected_goals": "الأهداف المتوقعة (xG)",
};

export interface WcMatchDetail {
  fixture: WcFixture;
  events: WcMatchEvent[];
  lineups: WcLineup[];
  statistics: WcStatistic[];
  prediction: WcPrediction | null;
}

export async function getMatchDetail(fixtureId: number): Promise<WcMatchDetail | null> {
  // مباراة حية تُحدَّث كل 20 ثانية، والمنتهية/القادمة كل 5 دقائق
  const known = (await getFixtures()).find((f) => f.id === fixtureId);
  const ttl = known?.status.live ? MATCH_DETAIL_LIVE_TTL : CACHE_TTL.MEDIUM;

  const detail = await withSWR(`wc:match:${fixtureId}`, ttl, ttl * 2, async () => {
    const rows = await apiGet("fixtures", { id: fixtureId, timezone: TIMEZONE });
    const item = rows[0];
    if (!item) return null;

    const events: WcMatchEvent[] = (item.events ?? []).map((ev: any) => {
      const localized = localizeEvent(ev.type ?? "", ev.detail ?? "");
      return {
        minute: ev.time?.elapsed ?? 0,
        extraMinute: ev.time?.extra ?? null,
        teamId: ev.team?.id ?? 0,
        type: localized.type,
        label: localized.label,
        player: localizePlayerName(ev.player?.name),
        assist: ev.assist?.name ? localizePlayerName(ev.assist.name) : null,
      };
    });

    const lineups: WcLineup[] = (item.lineups ?? []).map((lineup: any): WcLineup => {
      const mapPlayer = (p: any): WcLineupPlayer => ({
        id: p.player?.id ?? 0,
        name: localizePlayerName(p.player?.name),
        number: p.player?.number ?? null,
        position: p.player?.pos ?? null,
        grid: p.player?.grid ?? null,
      });
      return {
        teamId: lineup.team?.id ?? 0,
        teamName: localizeTeamName(lineup.team?.id, lineup.team?.name ?? ""),
        formation: lineup.formation ?? null,
        coach: lineup.coach?.name ?? "",
        startXI: (lineup.startXI ?? []).map(mapPlayer),
        substitutes: (lineup.substitutes ?? []).map(mapPlayer),
      };
    });

    const homeStats = (item.statistics ?? []).find((s: any) => s.team?.id === item.teams?.home?.id);
    const awayStats = (item.statistics ?? []).find((s: any) => s.team?.id === item.teams?.away?.id);
    const statistics: WcStatistic[] = (homeStats?.statistics ?? [])
      .filter((stat: any) => STAT_AR[stat.type])
      .map((stat: any): WcStatistic => {
        const awayValue = (awayStats?.statistics ?? []).find((s: any) => s.type === stat.type)?.value;
        return {
          key: stat.type,
          label: STAT_AR[stat.type],
          home: String(stat.value ?? 0),
          away: String(awayValue ?? 0),
        };
      });

    return { fixture: localizeFixture(item), events, lineups, statistics };
  });

  if (!detail) return null;

  // التوقعات تُجلب لأي مباراة لم تنته (كاش ساعة لكل مباراة)
  let prediction: WcPrediction | null = null;
  if (!detail.fixture.status.finished) {
    try {
      prediction = await getPrediction(fixtureId);
    } catch (error) {
      console.warn(`[WorldCup] prediction failed for fixture ${fixtureId}:`, error);
    }
  }

  return { ...detail, prediction };
}

// ---------- نظرة عامة مُجمَّعة للصفحة الرئيسية للقسم ----------

/** وزن "نجومية" المنتخب لاختيار مباراة اليوم — الأخضر دائمًا أولًا */
const STAR_WEIGHT: Record<number, number> = {
  [SAUDI_TEAM_ID]: 100,
  26: 12, // الأرجنتين
  2: 12, // فرنسا
  6: 12, // البرازيل
  9: 10, // إسبانيا
  10: 10, // إنجلترا
  25: 10, // ألمانيا
  27: 10, // البرتغال
  1118: 8, // هولندا
  16: 6, // المكسيك (مضيف)
  2384: 6, // الولايات المتحدة (مضيف)
  5529: 6, // كندا (مضيف)
  31: 6, // المغرب
  12: 5, // اليابان
  777: 5, // تركيا
  3: 5, // كرواتيا
};

const starWeight = (fixture: WcFixture): number =>
  (STAR_WEIGHT[fixture.home.id] ?? 1) + (STAR_WEIGHT[fixture.away.id] ?? 1);

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

export async function getOverview(): Promise<WcOverview> {
  const [fixtures, live] = await Promise.all([getFixtures(), getLiveFixtures()]);

  // "اليوم" بتوقيت الرياض — تواريخ المزود تصل أصلًا بإزاحة +03:00
  const riyadhToday = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const today = fixtures.filter((f) => (f.date ?? "").slice(0, 10) === riyadhToday);

  const upcoming = fixtures.filter((f) => !f.status.finished && !f.status.live);
  const motdPool = live.length > 0 ? live : today.filter((f) => !f.status.finished);
  // المفاضلة بالنجومية داخل أقرب يوم لعب فقط — مباراة الافتتاح غدًا
  // لا يجوز أن تتجاوزها مباراة أبرز بعد ثلاثة أيام
  const nextDayKey = (upcoming[0]?.date ?? "").slice(0, 10);
  const nextDayMatches = upcoming.filter((f) => (f.date ?? "").slice(0, 10) === nextDayKey);
  const fallbackPool = motdPool.length > 0 ? motdPool : nextDayMatches;
  const motdFixture = [...fallbackPool].sort(
    (a, b) => starWeight(b) - starWeight(a) || a.timestamp - b.timestamp
  )[0] ?? null;

  let motdPrediction: WcPrediction | null = null;
  if (motdFixture && !motdFixture.status.finished) {
    try {
      motdPrediction = await getPrediction(motdFixture.id);
    } catch (error) {
      console.warn("[WorldCup] match-of-the-day prediction failed:", error);
    }
  }

  const saudiFixtures = fixtures.filter(
    (f) => f.home.id === SAUDI_TEAM_ID || f.away.id === SAUDI_TEAM_ID
  );
  const saudiNext = saudiFixtures.find((f) => !f.status.finished) ?? null;

  let saudiGroup: WcGroup | null = null;
  try {
    const groups = await getStandings();
    saudiGroup =
      groups.find((g) => g.rows.some((row) => row.team.id === SAUDI_TEAM_ID)) ?? null;
  } catch (error) {
    console.warn("[WorldCup] standings unavailable for overview:", error);
  }

  return {
    live,
    today,
    matchOfTheDay: motdFixture ? { fixture: motdFixture, prediction: motdPrediction } : null,
    saudi: { next: saudiNext, fixtures: saudiFixtures, group: saudiGroup },
    updatedAt: new Date().toISOString(),
  };
}
