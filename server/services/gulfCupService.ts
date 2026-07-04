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
import { GC_EDITIONS, getGcTeamLegacy, type GcTeamLegacy } from "./gulfCupHistory";
import { resolveNames } from "./worldCupNameTranslator";
import { apiFootballGet } from "./apiFootballClient";

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
  return apiFootballGet("GulfCup", path, params);
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

export interface GcSquadPlayer {
  id: number;
  name: string;
  number: number | null;
  position: string;
  positionEn: string | null;
  age: number | null;
  photo: string | null;
}

export interface GcTeamProfile {
  team: GcTeam;
  isSaudi: boolean;
  coach: string | null;
  group: GcGroup | null;
  stats: GcTeamStats;
  nextMatch: GcFixture | null;
  fixtures: GcFixture[];
  squad: GcSquadPlayer[];
  /** إرث المنتخب في تاريخ البطولة (ألقاب/وصافات/استضافات) — ثابت محلّي. */
  legacy: GcTeamLegacy | null;
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
  /** سجلّ المواجهات عبر التاريخ (كل البطولات) — null إن غاب المزوّد. */
  history: GcH2HSummary | null;
}

/** تعريب أسماء إحصاءات API-Football الشائعة (يُترك الاسم كما هو إن لم يُعرَّف). */
const STAT_AR: Record<string, string> = {
  "Shots on Goal": "تسديدات على المرمى",
  "Shots off Goal": "تسديدات خارج المرمى",
  "Total Shots": "إجمالي التسديدات",
  "Blocked Shots": "تسديدات مصدودة",
  "Shots insidebox": "تسديد من الداخل",
  "Shots outsidebox": "تسديد من الخارج",
  "Fouls": "أخطاء",
  "Corner Kicks": "ركنيات",
  "Offsides": "تسلّل",
  "Ball Possession": "الاستحواذ",
  "Yellow Cards": "بطاقات صفراء",
  "Red Cards": "بطاقات حمراء",
  "Goalkeeper Saves": "تصدّيات الحارس",
  "Total passes": "التمريرات",
  "Passes accurate": "تمريرات صحيحة",
  "Passes %": "دقّة التمرير",
  "expected_goals": "الأهداف المتوقّعة xG",
};

// ---------- قائمة اللاعبين والمدرّب (API-Football — تعمل للمنتخبات بلا موسم) ----------

const POSITION_AR: Record<string, string> = {
  Goalkeeper: "حارس مرمى",
  Defender: "مدافع",
  Midfielder: "لاعب وسط",
  Attacker: "مهاجم",
};
const POSITION_ORDER: Record<string, number> = { Goalkeeper: 0, Defender: 1, Midfielder: 2, Attacker: 3 };
const SQUAD_TTL = 6 * 60 * 60 * 1000; // القوائم شبه ثابتة

/** قائمة منتخب (players/squads) — القائمة الحالية لدى المزوّد، بأسماء معرّبة. */
async function getGcSquad(teamId: number): Promise<GcSquadPlayer[]> {
  if (!apiFootballEnabled()) return [];
  return withSWR(`gc:squad:${teamId}`, SQUAD_TTL, SQUAD_TTL * 2, async () => {
    const rows = await apiGet("players/squads", { team: teamId });
    const raw: any[] = rows[0]?.players ?? [];
    if (raw.length === 0) return [];
    const tr = await resolveNames(raw.map((p: any) => p.name)).catch(
      () => (n: string | null | undefined) => n ?? "",
    );
    return raw
      .map(
        (p: any): GcSquadPlayer => ({
          id: p.id ?? 0,
          name: tr(p.name),
          number: p.number ?? null,
          position: POSITION_AR[p.position] ?? p.position ?? "",
          positionEn: p.position ?? null,
          age: p.age ?? null,
          photo: p.photo ?? null,
        }),
      )
      .sort(
        (a, b) =>
          (POSITION_ORDER[a.positionEn ?? ""] ?? 9) - (POSITION_ORDER[b.positionEn ?? ""] ?? 9) ||
          (a.number ?? 99) - (b.number ?? 99),
      );
  }).catch(() => []);
}

/** المدرّب الحالي (coachs) — «فريقه الحالي» هو هذا المنتخب. */
async function getGcCoach(teamId: number): Promise<string | null> {
  if (!apiFootballEnabled()) return null;
  return withSWR(`gc:coach:${teamId}`, SQUAD_TTL, SQUAD_TTL * 2, async () => {
    const rows = await apiGet("coachs", { team: teamId });
    const current = rows.find((r: any) => r.team?.id === teamId) ?? rows[0];
    const raw: string | undefined = current?.name;
    if (!raw) return null;
    const tr = await resolveNames([raw]).catch(() => (n: string | null | undefined) => n ?? "");
    return tr(raw);
  }).catch(() => null);
}

function resultForTeam(fixture: GcFixture, teamId: number): "W" | "D" | "L" | null {
  if (!fixture.status.finished || fixture.goals.home == null || fixture.goals.away == null) return null;
  const own = fixture.home.id === teamId ? fixture.goals.home : fixture.goals.away;
  const against = fixture.home.id === teamId ? fixture.goals.away : fixture.goals.home;
  if (own > against) return "W";
  if (own < against) return "L";
  return "D";
}

/** صفحة المنتخب: مجموعة + إحصاءات + جدول + قائمة اللاعبين + المدرّب + الإرث التاريخي. */
export async function getGcTeamProfile(teamId: number): Promise<GcTeamProfile | null> {
  if (!GC_TEAM_IDS.includes(teamId)) return null;

  const [fixtures, standings, teams, squad, coach] = await Promise.all([
    getGcFixtures(),
    getGcStandings(),
    getGcTeams(),
    getGcSquad(teamId),
    getGcCoach(teamId),
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
    coach,
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
    squad,
    legacy: getGcTeamLegacy(teamId),
  };
}

// ---------- الهدّافون وصنّاع الأهداف (players/topscorers | topassists) ----------

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
  /** هل هذه أرقام النسخة الحالية أم آخر نسخة منتهية؟ */
  isCurrent: boolean;
  scorers: GcScorer[];
  assists: GcScorer[];
}

const SCORERS_TTL = 10 * 60 * 1000;
const SCORERS_FALLBACK_SEASON = 2024; // خليجي 26 (الكويت 2024–25)

function mapScorerRows(rows: any[], tr: (n: string | null | undefined) => string): GcScorer[] {
  return rows.map((row: any, index: number): GcScorer => {
    const stats = row.statistics?.[0] ?? {};
    const teamId = stats.team?.id ?? 0;
    return {
      rank: index + 1,
      id: row.player?.id ?? 0,
      name: tr(row.player?.name),
      photo: row.player?.photo ?? "",
      team: {
        id: teamId,
        name: localizeGcTeam(teamId, stats.team?.name ?? ""),
        logo: stats.team?.logo ?? teamLogo(teamId),
      },
      goals: stats.goals?.total ?? 0,
      assists: stats.goals?.assists ?? 0,
      penalties: stats.penalty?.scored ?? 0,
      matches: stats.games?.appearences ?? 0,
      minutes: stats.games?.minutes ?? 0,
    };
  });
}

/**
 * لوحتا الهدّافين وصنّاع الأهداف — موسم 2026 أولًا، وإن لم يتوفّر لدى المزوّد بعد
 * تُعرض أرقام خليجي 26 (موسم 2024) بوسمها صراحةً `isCurrent=false`.
 */
export async function getGcScorers(): Promise<GcScorersBoard> {
  const empty: GcScorersBoard = { season: SEASON, isCurrent: true, scorers: [], assists: [] };
  if (!apiFootballEnabled()) return empty;
  return withSWR("gc:scorers", SCORERS_TTL, SCORERS_TTL * 3, async () => {
    for (const season of [SEASON, SCORERS_FALLBACK_SEASON]) {
      const [goalRows, assistRows] = await Promise.all([
        apiGet("players/topscorers", { league: LEAGUE_ID, season }).catch(() => [] as any[]),
        apiGet("players/topassists", { league: LEAGUE_ID, season }).catch(() => [] as any[]),
      ]);
      if (goalRows.length === 0 && assistRows.length === 0) continue;
      const names = [...goalRows, ...assistRows].map((r: any) => r.player?.name);
      const tr = await resolveNames(names).catch(() => (n: string | null | undefined) => n ?? "");
      return {
        season,
        isCurrent: season === SEASON,
        scorers: mapScorerRows(goalRows.slice(0, 15), tr),
        assists: mapScorerRows(assistRows.slice(0, 10), tr),
      };
    }
    return empty;
  }).catch(() => empty);
}

// ---------- سجلّ البطولة التاريخي (ثابت محلّي) ----------

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

/** سجلّ النسخ 1..27 (تنازليًّا: الأحدث أولًا) + جدول الألقاب لكل منتخب. */
export function getGcHistory(): GcHistory {
  const editions = [...GC_EDITIONS]
    .sort((a, b) => b.edition - a.edition)
    .map(
      (e): GcEditionDto => ({
        edition: e.edition,
        title: `خليجي ${e.edition}`,
        year: e.year,
        host: seedTeam(e.hostId),
        hostCity: e.hostCity,
        champion: e.championId != null ? seedTeam(e.championId) : null,
        runnerUp: e.runnerUpId != null ? seedTeam(e.runnerUpId) : null,
        finalNote: e.finalNote,
        upcoming: e.upcoming === true,
      }),
    );

  const titles = GC_TEAM_IDS.map((id): GcTitleRow => {
    const legacy = getGcTeamLegacy(id);
    return {
      team: seedTeam(id),
      titles: legacy.titles,
      runnerUps: legacy.runnerUps,
      hosted: legacy.hosted,
      lastTitleYear: legacy.lastTitleYear,
    };
  }).sort((a, b) => b.titles - a.titles || b.runnerUps - a.runnerUps || a.team.name.localeCompare(b.team.name, "ar"));

  return { editions, titles };
}

// ---------- المواجهات التاريخية بين منتخبين (fixtures/headtohead) ----------

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

const H2H_TTL = 24 * 60 * 60 * 1000; // التاريخ لا يتغيّر إلا بمباراة جديدة

const H2H_COMPETITION_AR: Record<string, string> = {
  "Gulf Cup of Nations": "كأس الخليج",
  "Friendlies": "ودّية",
  "International Friendlies": "ودّية",
  "World Cup - Qualification Asia": "تصفيات المونديال",
  "Asian Cup": "كأس آسيا",
  "Asian Cup - Qualification": "تصفيات كأس آسيا",
  "Arab Cup": "كأس العرب",
  "FIFA Arab Cup": "كأس العرب",
  "WAFF Championship": "بطولة غرب آسيا",
};

/**
 * سجلّ كل المواجهات عبر التاريخ (كل البطولات) بين منتخبَي مباراة — يُحسب اتجاه
 * الفوز نسبةً إلى ترتيب (home/away) المُمرَّر لا ترتيب المباراة التاريخية.
 */
export async function getGcH2HSummary(homeId: number, awayId: number): Promise<GcH2HSummary | null> {
  if (!apiFootballEnabled() || !homeId || !awayId) return null;
  const key = `gc:h2h:${[homeId, awayId].sort((a, b) => a - b).join("-")}`;
  const summary = await withSWR(key, H2H_TTL, H2H_TTL * 2, async () => {
    const rows = await apiGet("fixtures/headtohead", { h2h: `${homeId}-${awayId}`, last: 50 });
    const finished = rows.filter((r: any) => WC_FINISHED_STATUSES.has(r?.fixture?.status?.short ?? ""));
    let aWins = 0;
    let bWins = 0;
    let draws = 0;
    for (const r of finished) {
      const hg = r?.goals?.home;
      const ag = r?.goals?.away;
      if (hg == null || ag == null) continue;
      if (hg === ag) draws++;
      else if (hg > ag ? r?.teams?.home?.id === homeId : r?.teams?.away?.id === homeId) aWins++;
      else bWins++;
    }
    const recent = finished
      .sort((x: any, y: any) => (y?.fixture?.timestamp ?? 0) - (x?.fixture?.timestamp ?? 0))
      .slice(0, 6)
      .map((r: any): GcH2HMatch => {
        const league = r?.league?.name ?? "";
        const hid = r?.teams?.home?.id ?? 0;
        const aid = r?.teams?.away?.id ?? 0;
        return {
          date: r?.fixture?.date ?? "",
          competition: H2H_COMPETITION_AR[league] ?? league,
          home: { id: hid, name: localizeGcTeam(hid, r?.teams?.home?.name ?? ""), logo: r?.teams?.home?.logo ?? teamLogo(hid) },
          away: { id: aid, name: localizeGcTeam(aid, r?.teams?.away?.name ?? ""), logo: r?.teams?.away?.logo ?? teamLogo(aid) },
          goals: { home: r?.goals?.home ?? null, away: r?.goals?.away ?? null },
        };
      });
    return { total: aWins + bWins + draws, homeWins: aWins, awayWins: bWins, draws, recent };
  }).catch(() => null);
  return summary;
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
        label: STAT_AR[stat.type] ?? stat.type,
        home: String(stat.value ?? 0),
        away: String((awayStats?.statistics ?? []).find((s: any) => s.type === stat.type)?.value ?? 0),
      }));
    }
  }

  const [headToHead, history] = await Promise.all([
    fixture.home.id && fixture.away.id
      ? getGcHeadToHead(fixture.home.id, fixture.away.id).catch(() => [] as GcFixture[])
      : Promise.resolve([] as GcFixture[]),
    fixture.home.id && fixture.away.id
      ? getGcH2HSummary(fixture.home.id, fixture.away.id).catch(() => null)
      : Promise.resolve(null),
  ]);

  return { fixture, events, lineups, statistics, headToHead, history };
}

/** يحوّل مباراة خليجي إلى SplMatchDetail لدورة Live Activity عند فشل getMatchDetail. */
export async function getGcFixtureForLiveActivity(fixtureId: number): Promise<GcFixture | null> {
  const fixtures = await getGcFixtures().catch(() => [] as GcFixture[]);
  return fixtures.find((f) => f.id === fixtureId) ?? null;
}

export { TIMEZONE as GC_TIMEZONE, LEAGUE_ID as GC_LEAGUE_ID, SEASON as GC_SEASON };
