/**
 * خدمة «خليجي 27» (كأس الخليج العربي 27 — تستضيفها السعودية في جدة، 23 سبتمبر
 * → 6 أكتوبر 2026).
 *
 * الأساس **بيانات ثابتة رسمية** (gulfCupData) لأن API-Football لم يُنشئ موسم 2026
 * للبطولة (league=25) بعد. متى توفّر الموسم، تُدمج النتائج/الحالات الحيّة فوق
 * الأساس تلقائيًّا (مطابقة بمعرّفات المنتخبات + يوم المباراة)، فينقلب القسم من
 * «وضع العدّ التنازلي» إلى «الوضع الحيّ» دون أي تغيير في الكود.
 *
 * الأسماء معرّبة هنا (منتخبات/ملاعب/جولات/حالات) قبل وصولها للواجهة، وكل نقطة
 * خلف كاش SWR. أفضل جهد بالكامل: أي فشل في API-Football يُبقي الأساس الثابت.
 */
import { withSWR } from "../memoryCache";
import {
  SAUDI_TEAM_ID,
  WC_FINISHED_STATUSES,
  WC_LIVE_STATUSES,
  WC_STATUS_AR,
  localizeRound,
  localizeTeamName,
} from "./worldCupNames";
import { localizeGcTeam, localizeGcVenue } from "./gulfCupNames";
import {
  GC_FIXTURES,
  GC_GROUPS,
  GC_HOST,
  GC_TEAM_IDS,
  GC_VENUES,
  type GcSeedFixture,
} from "./gulfCupData";

const API_BASE = "https://v3.football.api-sports.io";
const LEAGUE_ID = 25; // Gulf Cup of Nations (API-Football)
const SEASON = 2026; // خليجي 27 — السعودية 2026 (يظهر لاحقًا لدى المزوّد)
const TIMEZONE = "Asia/Riyadh";

const OVERVIEW_TTL = 5 * 60 * 1000;
const FIXTURES_TTL = 5 * 60 * 1000;
const STANDINGS_TTL = 5 * 60 * 1000;
const OVERLAY_TTL = 60 * 1000; // مطابقة المزوّد (تتغيّر فقط عند ظهور الموسم/نتيجة)

/** القسم متاح دائمًا (بيانات ثابتة)؛ الإثراء الحيّ يتطلّب APIFOOTBALL_KEY. */
export function isGulfCupConfigured(): boolean {
  return true;
}

function apiFootballEnabled(): boolean {
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
  if (!response.ok) throw new Error(`[GulfCup] API-Football HTTP ${response.status} for ${path}`);

  const data: any = await response.json();
  const errors = data?.errors;
  if (errors && !Array.isArray(errors) && Object.keys(errors).length > 0) {
    throw new Error(`[GulfCup] API-Football error for ${path}: ${JSON.stringify(errors)}`);
  }
  return Array.isArray(data?.response) ? data.response : [];
}

// ---------- DTOs المُعرَّبة (تطابق بنية كأس آسيا للواجهة) ----------

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

// ---------- محوّلات الأساس الثابت ----------

const teamLogo = (id: number): string => `https://media.api-sports.io/football/teams/${id}.png`;

function seedTeam(id: number): GcTeam {
  return { id, name: localizeGcTeam(id, localizeTeamName(id, String(id))), logo: teamLogo(id) };
}

function placeholderTeam(label: string | undefined): GcTeam {
  return { id: 0, name: label ?? "يُحدَّد لاحقًا", logo: "" };
}

function seedStatus() {
  return {
    code: "NS",
    label: WC_STATUS_AR["NS"] ?? "لم تبدأ",
    elapsed: null as number | null,
    live: false,
    finished: false,
  };
}

function seedToFixture(seed: GcSeedFixture): GcFixture {
  const venue = GC_VENUES[seed.venue];
  return {
    id: seed.id,
    matchNo: seed.matchNo,
    date: seed.kickoff,
    timestamp: Math.floor(new Date(seed.kickoff).getTime() / 1000),
    status: seedStatus(),
    round: localizeRound(seed.roundEn),
    roundEn: seed.roundEn,
    venue: { name: venue.name, city: venue.city },
    home: seed.homeId != null ? seedTeam(seed.homeId) : placeholderTeam(seed.homePlaceholder),
    away: seed.awayId != null ? seedTeam(seed.awayId) : placeholderTeam(seed.awayPlaceholder),
    goals: { home: null, away: null },
  };
}

// ---------- دمج بيانات API-Football (متى توفّر الموسم) ----------

function dayKey(iso: string): string {
  // مفتاح اليوم بتوقيت الرياض (لمطابقة مباراة الأساس بمباراة المزوّد).
  const d = new Date(iso);
  const r = new Date(d.getTime() + 3 * 3600 * 1000); // +03:00
  return r.toISOString().slice(0, 10);
}

interface ProviderFixture {
  id: number;
  date: string;
  timestamp: number;
  code: string;
  elapsed: number | null;
  homeId: number;
  awayId: number;
  goalsHome: number | null;
  goalsAway: number | null;
  venueName: string | null;
  venueCity: string | null;
}

/** جدول المزوّد (إن وُجد الموسم) — مفهرس بزوج المنتخبين + اليوم. فارغ = لا إثراء. */
async function getProviderFixtures(): Promise<Map<string, ProviderFixture>> {
  if (!apiFootballEnabled()) return new Map();
  return withSWR("gc:provider:fixtures", OVERLAY_TTL, OVERLAY_TTL * 3, async () => {
    const rows = await apiGet("fixtures", { league: LEAGUE_ID, season: SEASON, timezone: TIMEZONE }).catch(
      () => [] as any[],
    );
    const map = new Map<string, ProviderFixture>();
    for (const raw of rows) {
      const homeId = raw?.teams?.home?.id ?? 0;
      const awayId = raw?.teams?.away?.id ?? 0;
      const date = raw?.fixture?.date ?? "";
      if (!homeId || !awayId || !date) continue;
      const pf: ProviderFixture = {
        id: raw?.fixture?.id ?? 0,
        date,
        timestamp: raw?.fixture?.timestamp ?? 0,
        code: raw?.fixture?.status?.short ?? "NS",
        elapsed: raw?.fixture?.status?.elapsed ?? null,
        homeId,
        awayId,
        goalsHome: raw?.goals?.home ?? null,
        goalsAway: raw?.goals?.away ?? null,
        venueName: raw?.fixture?.venue?.name ?? null,
        venueCity: raw?.fixture?.venue?.city ?? null,
      };
      const pair = [homeId, awayId].sort((a, b) => a - b).join("-");
      map.set(`${pair}|${dayKey(date)}`, pf);
    }
    return map;
  }).catch(() => new Map<string, ProviderFixture>());
}

/** يدمج نتيجة/حالة المزوّد فوق مباراة الأساس الثابت (إن وُجدت مطابقة). */
function overlayFixture(base: GcFixture, provider: Map<string, ProviderFixture>): GcFixture {
  if (provider.size === 0 || !base.home.id || !base.away.id) return base;
  const pair = [base.home.id, base.away.id].sort((a, b) => a - b).join("-");
  const pf = provider.get(`${pair}|${dayKey(base.date)}`);
  if (!pf) return base;
  const venue = localizeGcVenue(pf.venueName, pf.venueCity);
  return {
    ...base,
    id: pf.id || base.id,
    date: pf.date || base.date,
    timestamp: pf.timestamp || base.timestamp,
    status: {
      code: pf.code,
      label: WC_STATUS_AR[pf.code] ?? pf.code,
      elapsed: pf.elapsed,
      live: WC_LIVE_STATUSES.has(pf.code),
      finished: WC_FINISHED_STATUSES.has(pf.code),
    },
    venue: venue.name ? venue : base.venue,
    goals: { home: pf.goalsHome, away: pf.goalsAway },
  };
}

// ---------- نقاط البيانات ----------

/** المنتخبات الثمانية (السعودية أولًا ثم أبجديًّا عربيًّا). */
export async function getGcTeams(): Promise<GcTeam[]> {
  const teams = GC_TEAM_IDS.map(seedTeam);
  return teams.sort((a, b) => {
    if (a.id === SAUDI_TEAM_ID) return -1;
    if (b.id === SAUDI_TEAM_ID) return 1;
    return a.name.localeCompare(b.name, "ar");
  });
}

/** جدول المباريات كاملًا (مُرتَّب زمنيًّا) مع دمج بيانات المزوّد متى توفّرت. */
export async function getGcFixtures(): Promise<GcFixture[]> {
  return withSWR("gc:fixtures", FIXTURES_TTL, FIXTURES_TTL * 3, async () => {
    const provider = await getProviderFixtures();
    return GC_FIXTURES.map(seedToFixture)
      .map((fx) => overlayFixture(fx, provider))
      .sort((a, b) => a.timestamp - b.timestamp);
  });
}

/** مجموعتا البطولة وترتيبهما — محسوب من النتائج المنتهية (أصفار قبل الانطلاق). */
export async function getGcStandings(): Promise<GcGroup[]> {
  return withSWR("gc:standings", STANDINGS_TTL, STANDINGS_TTL * 3, async () => {
    const fixtures = await getGcFixtures();
    type Stat = { played: number; win: number; draw: number; lose: number; gf: number; ga: number };
    const stats = new Map<number, Stat>();
    const ensure = (id: number): Stat => {
      if (!stats.has(id)) stats.set(id, { played: 0, win: 0, draw: 0, lose: 0, gf: 0, ga: 0 });
      return stats.get(id)!;
    };
    for (const f of fixtures) {
      if (!f.roundEn.startsWith("Group Stage") || !f.status.finished) continue;
      const hg = f.goals.home;
      const ag = f.goals.away;
      if (hg == null || ag == null) continue;
      const h = ensure(f.home.id);
      const a = ensure(f.away.id);
      h.played++;
      a.played++;
      h.gf += hg;
      h.ga += ag;
      a.gf += ag;
      a.ga += hg;
      if (hg > ag) {
        h.win++;
        a.lose++;
      } else if (hg < ag) {
        a.win++;
        h.lose++;
      } else {
        h.draw++;
        a.draw++;
      }
    }

    return GC_GROUPS.map((group): GcGroup => {
      const rows: GcStandingRow[] = group.teamIds.map((id) => {
        const s = stats.get(id) ?? { played: 0, win: 0, draw: 0, lose: 0, gf: 0, ga: 0 };
        return {
          rank: 0,
          team: seedTeam(id),
          played: s.played,
          win: s.win,
          draw: s.draw,
          lose: s.lose,
          goalsFor: s.gf,
          goalsAgainst: s.ga,
          goalsDiff: s.gf - s.ga,
          points: s.win * 3 + s.draw,
        };
      });
      rows.sort(
        (a, b) =>
          b.points - a.points ||
          b.goalsDiff - a.goalsDiff ||
          b.goalsFor - a.goalsFor ||
          a.team.name.localeCompare(b.team.name, "ar"),
      );
      rows.forEach((row, i) => (row.rank = i + 1));
      return { name: group.name, rows };
    });
  });
}

/** نظرة عامة: عدّ تنازلي + المضيف + الملاعب + تركيز السعودية + المباراة القادمة. */
export async function getGcOverview(): Promise<GcOverview> {
  return withSWR("gc:overview", OVERVIEW_TTL, OVERVIEW_TTL * 3, async () => {
    const [fixtures, standings, teams] = await Promise.all([
      getGcFixtures(),
      getGcStandings(),
      getGcTeams(),
    ]);

    const sorted = [...fixtures].sort((a, b) => a.timestamp - b.timestamp);
    const startsAt = sorted[0]?.date ?? null;
    const endsAt = sorted[sorted.length - 1]?.date ?? null;
    const now = Date.now();
    const started = sorted.some((f) => f.status.live || f.status.finished);

    const venueSeen = new Set<string>();
    const venues: { name: string; city: string }[] = [];
    for (const f of sorted) {
      const key = `${f.venue.name}|${f.venue.city}`;
      if (!f.venue.name || venueSeen.has(key)) continue;
      venueSeen.add(key);
      venues.push(f.venue);
    }

    const saudiTeam = teams.find((t) => t.id === SAUDI_TEAM_ID) ?? null;
    const saudiGroup =
      standings.find((g) => g.rows.some((r) => r.team.id === SAUDI_TEAM_ID))?.name ?? null;
    const saudiFixtures = sorted.filter(
      (f) => f.home.id === SAUDI_TEAM_ID || f.away.id === SAUDI_TEAM_ID,
    );

    const nextMatch =
      sorted.find((f) => !f.status.finished && f.timestamp * 1000 >= now - 2 * 60 * 60 * 1000) ??
      null;

    return {
      startsAt,
      endsAt,
      teamsCount: teams.length,
      groupsCount: standings.length,
      host: GC_HOST,
      venues,
      started,
      saudi: { team: saudiTeam, group: saudiGroup, fixtures: saudiFixtures },
      nextMatch,
    };
  });
}

// ---------- صفحة المنتخب + تفاصيل المباراة (MVP من البيانات الثابتة) ----------

export interface GcTeamStats {
  groupName: string | null;
  rank: number | null;
  played: number;
  win: number;
  draw: number;
  lose: number;
  goalsFor: number;
  goalsAgainst: number;
  goalsDiff: number;
  points: number;
  form: ("W" | "D" | "L")[];
}

export interface GcTeamProfile {
  team: GcTeam;
  isSaudi: boolean;
  coach: string | null;
  group: GcGroup | null;
  stats: GcTeamStats;
  nextMatch: GcFixture | null;
  fixtures: GcFixture[];
  squad: { id: number; name: string; number: number | null; position: string }[];
}

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

export interface GcMatchDetail {
  fixture: GcFixture;
  events: GcMatchEvent[];
  lineups: GcLineup[];
  statistics: GcStatistic[];
  headToHead: GcFixture[];
}

function resultForTeam(fixture: GcFixture, teamId: number): "W" | "D" | "L" | null {
  if (!fixture.status.finished || fixture.goals.home == null || fixture.goals.away == null) return null;
  const own = fixture.home.id === teamId ? fixture.goals.home : fixture.goals.away;
  const against = fixture.home.id === teamId ? fixture.goals.away : fixture.goals.home;
  if (own > against) return "W";
  if (own < against) return "L";
  return "D";
}

/** صفحة المنتخب: مجموعة + إحصاءات + جدول مبارياته (القائمة/المدرب فارغان حتى موسم API-Football). */
export async function getGcTeamProfile(teamId: number): Promise<GcTeamProfile | null> {
  if (!GC_TEAM_IDS.includes(teamId)) return null;

  const [fixtures, standings, teams] = await Promise.all([
    getGcFixtures(),
    getGcStandings(),
    getGcTeams(),
  ]);

  const team = teams.find((t) => t.id === teamId) ?? seedTeam(teamId);
  const teamFixtures = fixtures
    .filter((f) => f.home.id === teamId || f.away.id === teamId)
    .sort((a, b) => a.timestamp - b.timestamp);

  const group = standings.find((g) => g.rows.some((r) => r.team.id === teamId)) ?? null;
  const row = group?.rows.find((r) => r.team.id === teamId) ?? null;
  const finishedFixtures = teamFixtures.filter(
    (f) => f.status.finished && f.goals.home != null && f.goals.away != null,
  );
  const fallbackStats = finishedFixtures.reduce(
    (acc, fixture) => {
      const own = fixture.home.id === teamId ? fixture.goals.home! : fixture.goals.away!;
      const against = fixture.home.id === teamId ? fixture.goals.away! : fixture.goals.home!;
      acc.played += 1;
      acc.goalsFor += own;
      acc.goalsAgainst += against;
      if (own > against) {
        acc.win += 1;
        acc.points += 3;
      } else if (own === against) {
        acc.draw += 1;
        acc.points += 1;
      } else {
        acc.lose += 1;
      }
      return acc;
    },
    { played: 0, win: 0, draw: 0, lose: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
  );
  const form = finishedFixtures
    .sort((a, b) => b.timestamp - a.timestamp)
    .map((f) => resultForTeam(f, teamId))
    .filter((x): x is "W" | "D" | "L" => Boolean(x))
    .slice(0, 5);
  const nextMatch = teamFixtures.find((f) => !f.status.finished) ?? null;

  return {
    team,
    isSaudi: teamId === SAUDI_TEAM_ID,
    coach: null,
    group,
    stats: {
      groupName: group?.name ?? null,
      rank: row?.rank ?? null,
      played: row?.played ?? fallbackStats.played,
      win: row?.win ?? fallbackStats.win,
      draw: row?.draw ?? fallbackStats.draw,
      lose: row?.lose ?? fallbackStats.lose,
      goalsFor: row?.goalsFor ?? fallbackStats.goalsFor,
      goalsAgainst: row?.goalsAgainst ?? fallbackStats.goalsAgainst,
      goalsDiff: row?.goalsDiff ?? fallbackStats.goalsFor - fallbackStats.goalsAgainst,
      points: row?.points ?? fallbackStats.points,
      form,
    },
    nextMatch,
    fixtures: teamFixtures,
    squad: [],
  };
}

/** سجل المواجهات المباشرة بين منتخبين (من مباريات البطولة المنتهية). */
export async function getGcHeadToHead(teamA: number, teamB: number): Promise<GcFixture[]> {
  const fixtures = await getGcFixtures();
  return fixtures
    .filter(
      (f) =>
        f.status.finished &&
        ((f.home.id === teamA && f.away.id === teamB) || (f.home.id === teamB && f.away.id === teamA)),
    )
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 10);
}

const MATCH_DETAIL_TTL = 5 * 60 * 1000;
const MATCH_DETAIL_LIVE_TTL = 20 * 1000;

/** تفاصيل المباراة — يُثرى من API-Football متى توفّر الموسم، وإلا بيانات الجدول الثابت. */
export async function getGcMatchDetail(fixtureId: number): Promise<GcMatchDetail | null> {
  const fixtures = await getGcFixtures().catch(() => [] as GcFixture[]);
  const known = fixtures.find((f) => f.id === fixtureId);
  if (!known) return null;

  let events: GcMatchEvent[] = [];
  let lineups: GcLineup[] = [];
  let statistics: GcStatistic[] = [];
  let fixture = known;

  if (apiFootballEnabled()) {
    const ttl = known.status.live ? MATCH_DETAIL_LIVE_TTL : MATCH_DETAIL_TTL;
    const item = await withSWR(`gc:match:${fixtureId}`, ttl, ttl * 2, async () => {
      const rows = await apiGet("fixtures", { id: fixtureId, timezone: TIMEZONE }).catch(() => [] as any[]);
      return rows[0] ?? null;
    }).catch(() => null);

    if (item) {
      const code = item?.fixture?.status?.short ?? known.status.code;
      fixture = {
        ...known,
        date: item.fixture?.date ?? known.date,
        timestamp: item.fixture?.timestamp ?? known.timestamp,
        status: {
          code,
          label: WC_STATUS_AR[code] ?? code,
          elapsed: item.fixture?.status?.elapsed ?? known.status.elapsed,
          live: WC_LIVE_STATUSES.has(code),
          finished: WC_FINISHED_STATUSES.has(code),
        },
        goals: {
          home: item.goals?.home ?? known.goals.home,
          away: item.goals?.away ?? known.goals.away,
        },
      };
      events = (item.events ?? []).map((ev: any) => ({
        minute: ev?.time?.elapsed ?? 0,
        extraMinute: ev?.time?.extra ?? null,
        teamId: ev?.team?.id ?? 0,
        type: ev?.type ?? "",
        label: ev?.detail ?? ev?.type ?? "",
        player: ev?.player?.name ?? null,
      }));
      lineups = (item.lineups ?? []).map((lineup: any) => ({
        teamId: lineup?.team?.id ?? 0,
        teamName: localizeGcTeam(lineup?.team?.id, lineup?.team?.name ?? ""),
        formation: lineup?.formation ?? null,
        coach: lineup?.coach?.name ?? "",
        startXI: (lineup.startXI ?? []).map((p: any) => ({
          id: p?.player?.id ?? 0,
          name: p?.player?.name ?? "",
          number: p?.player?.number ?? null,
          position: p?.player?.pos ?? null,
        })),
        substitutes: (lineup.substitutes ?? []).map((p: any) => ({
          id: p?.player?.id ?? 0,
          name: p?.player?.name ?? "",
          number: p?.player?.number ?? null,
          position: p?.player?.pos ?? null,
        })),
      }));
      const homeStats = (item.statistics ?? []).find((s: any) => s.team?.id === item.teams?.home?.id);
      const awayStats = (item.statistics ?? []).find((s: any) => s.team?.id === item.teams?.away?.id);
      statistics = (homeStats?.statistics ?? []).slice(0, 12).map((stat: any) => ({
        key: stat.type,
        label: stat.type,
        home: String(stat.value ?? 0),
        away: String((awayStats?.statistics ?? []).find((s: any) => s.type === stat.type)?.value ?? 0),
      }));
    }
  }

  const headToHead =
    fixture.home.id && fixture.away.id
      ? await getGcHeadToHead(fixture.home.id, fixture.away.id).catch(() => [] as GcFixture[])
      : [];

  return { fixture, events, lineups, statistics, headToHead };
}

/** يحوّل مباراة خليجي إلى SplMatchDetail لدورة Live Activity عند فشل getMatchDetail. */
export async function getGcFixtureForLiveActivity(fixtureId: number): Promise<GcFixture | null> {
  const fixtures = await getGcFixtures().catch(() => [] as GcFixture[]);
  return fixtures.find((f) => f.id === fixtureId) ?? null;
}

export { TIMEZONE as GC_TIMEZONE, LEAGUE_ID as GC_LEAGUE_ID, SEASON as GC_SEASON };
