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
import { applyProvisionalTable } from "./liveStandings";
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
import {
  getTheSportsFastScore,
  getTheSportsMatchLiveByUuid,
  getTsCompetitionExtra,
  getTsCompetitionId,
  getTsCompetitionMatchPairs,
  getTsFifaRanking,
  getTsLineup,
  getTsMatchPlayerStats,
  getTsMatchTrend,
  getTsMatchTv,
  getTsTeamInjuries,
  getTsTeamSquad,
} from "./theSportsService";

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
  /** صفّ يتأثّر بمباراة جارية (ترتيب مبدئي لحظي). */
  live?: boolean;
  /** حراك المركز اللحظي: موجب = صعد، سالب = هبط. */
  liveDelta?: number;
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
  const base = await withSWR("gc:fixtures", FIXTURES_TTL, FIXTURES_TTL * 3, async () => {
    const provider = await getProviderFixtures();
    return GC_FIXTURES.map(seedToFixture)
      .map((fx) => overlayFixture(fx, provider))
      .sort((a, b) => a.timestamp - b.timestamp);
  });
  // فوق الكاش: نتيجة TheSports اللحظية (MQTT/بولينغ 2ث) للمباريات الجارية فقط —
  // تصل الأهداف بثوانٍ بدل انتظار دورة كاش المزوّد الأساسي.
  return overlayGcLiveScores(base);
}

/** يبني ترتيب المجموعات من النتائج المنتهية ثم يطبّق المباريات الجارية مبدئيًّا. */
function buildGcGroupsFromFixtures(fixtures: GcFixture[]): GcGroup[] {
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
    const memberIds = new Set(group.teamIds);
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
    const liveInGroup = fixtures.filter(
      (f) =>
        f.roundEn.startsWith("Group Stage") &&
        f.status.live &&
        !f.status.finished &&
        memberIds.has(f.home.id) &&
        memberIds.has(f.away.id),
    );
    return { name: group.name, rows: applyProvisionalTable(rows, liveInGroup) };
  });
}

/** جدول المزوّد الرسمي (standings) — null قبل توفّر الموسم أو عند أي فشل. */
async function getProviderStandings(): Promise<GcGroup[] | null> {
  if (!apiFootballEnabled()) return null;
  return withSWR("gc:standings:official", STANDINGS_TTL, STANDINGS_TTL * 3, async () => {
    const rows = await apiGet("standings", { league: LEAGUE_ID, season: SEASON }).catch(() => [] as any[]);
    const tables: any[][] = rows[0]?.league?.standings ?? [];
    if (!Array.isArray(tables) || tables.length === 0) return null;
    const groups: GcGroup[] = [];
    for (const table of tables) {
      if (!Array.isArray(table) || table.length === 0) continue;
      const ids = new Set(table.map((r: any) => r?.team?.id ?? 0));
      // اسم المجموعة العربي من الأساس الثابت بمطابقة العضوية، لا من نص المزوّد.
      const seedGroup = GC_GROUPS.find((g) => g.teamIds.filter((id) => ids.has(id)).length >= 3);
      groups.push({
        name: seedGroup?.name ?? String(table[0]?.group ?? "مجموعة"),
        rows: table.map(
          (row: any): GcStandingRow => ({
            rank: row?.rank ?? 0,
            team: seedTeam(row?.team?.id ?? 0),
            played: row?.all?.played ?? 0,
            win: row?.all?.win ?? 0,
            draw: row?.all?.draw ?? 0,
            lose: row?.all?.lose ?? 0,
            goalsFor: row?.all?.goals?.for ?? 0,
            goalsAgainst: row?.all?.goals?.against ?? 0,
            goalsDiff: row?.goalsDiff ?? (row?.all?.goals?.for ?? 0) - (row?.all?.goals?.against ?? 0),
            points: row?.points ?? 0,
          }),
        ),
      });
    }
    return groups.length > 0 ? groups : null;
  }).catch(() => null);
}

/**
 * مجموعتا البطولة وترتيبهما — أثناء المباريات: حساب مبدئي لحظي (أسرع استجابة)؛
 * خارجها: جدول المزوّد الرسمي إن وُجد (يحسم حالات التعادل الشاذة)، وإلا المحسوب.
 */
export async function getGcStandings(): Promise<GcGroup[]> {
  const fixtures = await getGcFixtures();
  const hasLive = fixtures.some(
    (f) => f.roundEn.startsWith("Group Stage") && f.status.live && !f.status.finished,
  );
  if (hasLive) return buildGcGroupsFromFixtures(fixtures);
  const official = await getProviderStandings();
  if (official) return official;
  return withSWR("gc:standings", STANDINGS_TTL, STANDINGS_TTL * 3, async () => {
    return buildGcGroupsFromFixtures(await getGcFixtures());
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
  /** تصنيف الفيفا (TheSports) — null قبل توفّر الجسر. */
  fifaRank?: GcFifaRank | null;
  /** الإصابات والغيابات الحالية (TheSports) — [] قبل توفّر الجسر. */
  injuries?: GcInjury[];
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
  /** إثراء TheSports — اختيارية كلها، تغيب بأمان قبل توفر بيانات المزوّد. */
  lineupsRich?: GcRichLineup | null;
  trend?: GcTrend | null;
  tv?: GcTvChannel[];
  playerStats?: GcPlayerMatchStat[];
  injuries?: { home: GcInjury[]; away: GcInjury[] } | null;
  fifa?: { home: GcFifaRank | null; away: GcFifaRank | null } | null;
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

  const [fixtures, standings, teams, squad, coach, fifaRank, injuries] = await Promise.all([
    getGcFixtures(),
    getGcStandings(),
    getGcTeams(),
    getGcSquad(teamId),
    getGcCoach(teamId),
    getGcFifaRank(teamId).catch(() => null),
    getGcTeamInjuryList(teamId).catch(() => [] as GcInjury[]),
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
    fifaRank,
    injuries,
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

  // ---------- إثراء TheSports (أفضل جهد — يغيب كليًّا قبل توفر الموسم) ----------
  let lineupsRich: GcRichLineup | null = null;
  let trend: GcTrend | null = null;
  let tv: GcTvChannel[] = [];
  let playerStats: GcPlayerMatchStat[] = [];
  const tsUuid = await getGcMatchTsId(fixture).catch(() => null);
  if (tsUuid) {
    const ttl = fixture.status.live ? MATCH_DETAIL_LIVE_TTL : MATCH_DETAIL_TTL;
    const extras = await withSWR(`gc:match:ts:${fixture.id}`, ttl, ttl * 2, async () => {
      const [lu, tr, channels, ps] = await Promise.all([
        getTsLineup(tsUuid).catch(() => null),
        getTsMatchTrend(tsUuid).catch(() => null),
        getTsMatchTv(tsUuid).catch(() => []),
        getTsMatchPlayerStats(tsUuid).catch(() => []),
      ]);
      return { lu, tr, channels, ps };
    }).catch(() => null);

    if (extras) {
      lineupsRich = extras.lu ? mapTsLineupToGc(extras.lu) : null;
      trend = extras.tr ? { perMinutes: extras.tr.perMinutes, values: extras.tr.values } : null;
      tv = (extras.channels ?? []).map((c) => ({ name: c.name, country: c.country, logo: c.logo }));
      playerStats = mapTsPlayerStats(extras.ps ?? [], extras.lu ?? null);
    }

    // نتيجة/حالة لحظية من خريطة MQTT الحية — تسبق كاش المزوّد الأساسي.
    if (fixture.status.live) {
      const liveTs = await getTheSportsMatchLiveByUuid(tsUuid).catch(() => null);
      if (liveTs && (liveTs.live || liveTs.finished)) {
        fixture = {
          ...fixture,
          goals: { home: liveTs.home, away: liveTs.away },
          status: {
            ...fixture.status,
            elapsed: liveTs.elapsed ?? fixture.status.elapsed,
            live: liveTs.live,
            finished: liveTs.finished || fixture.status.finished,
          },
        };
      }
    }
  }

  const [homeInjuries, awayInjuries, fifaHome, fifaAway] = await Promise.all([
    fixture.home.id ? getGcTeamInjuryList(fixture.home.id).catch(() => []) : Promise.resolve([]),
    fixture.away.id ? getGcTeamInjuryList(fixture.away.id).catch(() => []) : Promise.resolve([]),
    fixture.home.id ? getGcFifaRank(fixture.home.id).catch(() => null) : Promise.resolve(null),
    fixture.away.id ? getGcFifaRank(fixture.away.id).catch(() => null) : Promise.resolve(null),
  ]);

  return {
    fixture,
    events,
    lineups,
    statistics,
    headToHead,
    history,
    lineupsRich,
    trend,
    tv,
    playerStats,
    injuries:
      homeInjuries.length || awayInjuries.length ? { home: homeInjuries, away: awayInjuries } : null,
    fifa: fifaHome || fifaAway ? { home: fifaHome, away: fifaAway } : null,
  };
}

/** يحوّل مباراة خليجي إلى SplMatchDetail لدورة Live Activity عند فشل getMatchDetail. */
export async function getGcFixtureForLiveActivity(fixtureId: number): Promise<GcFixture | null> {
  const fixtures = await getGcFixtures().catch(() => [] as GcFixture[]);
  return fixtures.find((f) => f.id === fixtureId) ?? null;
}

// ---------- جسر TheSports (نفس نمط المونديال — كله أفضل جهد) ----------
// معرّف كأس الخليج لدى TheSports مسجّل في خريطة البطولات؛ عامل MQTT يستقبل
// مبارياتها أصلًا (لا فلتر بطولات) — كل المطلوب هنا حلّ المعرّفات ثم السحب.

const GC_TS_COMPETITION_ID = getTsCompetitionId("gulf-cup");
const GC_BRIDGE_TTL = 6 * 60 * 60 * 1000;
const INJURY_TTL = 6 * 60 * 60 * 1000;

export interface GcRichLineupPlayer {
  id: string;
  name: string;
  number: number | null;
  position: string | null;
  /** إحداثيات على الملعب (0..100) — null إن غابت لدى المزوّد. */
  x: number | null;
  y: number | null;
  /** تقييم المباراة (يتجدّد أثناء اللعب). */
  rating: number | null;
  photo: string | null;
  captain: boolean;
  starter: boolean;
}

export interface GcRichLineup {
  confirmed: boolean;
  homeFormation: string | null;
  awayFormation: string | null;
  home: GcRichLineupPlayer[];
  away: GcRichLineupPlayer[];
}

export interface GcTrend {
  perMinutes: number;
  /** القيمة −100..100: موجب = ضغط المضيف، سالب = ضغط الضيف. */
  values: { minute: number; value: number }[];
}

export interface GcTvChannel {
  name: string;
  country: string | null;
  logo: string | null;
}

export interface GcPlayerMatchStat {
  playerId: string;
  name: string;
  photo: string | null;
  side: "home" | "away" | null;
  starter: boolean;
  minutes: number;
  rating: number | null;
  /** خام إحصاءات المزوّد (goals/shots/passes...) — تختار الواجهة ما يهمّها. */
  values: Record<string, number>;
}

export interface GcInjury {
  player: string;
  reason: string | null;
  missedMatches: number | null;
}

export interface GcFifaRank {
  rank: number;
  points: number | null;
  change: number | null;
}

/** جسر منتخب API-Football → uuid لدى TheSports (تصويت تطابق أوقات فريد). */
let gcTeamBridge: { at: number; map: Map<number, string> } | null = null;

async function getGcTeamBridge(): Promise<Map<number, string>> {
  if (gcTeamBridge && Date.now() - gcTeamBridge.at < GC_BRIDGE_TTL) return gcTeamBridge.map;
  const map = new Map<number, string>();
  if (GC_TS_COMPETITION_ID) {
    try {
      const comp = await getTsCompetitionExtra(GC_TS_COMPETITION_ID);
      const [fixtures, pairs] = await Promise.all([
        getGcFixtures(),
        getTsCompetitionMatchPairs(GC_TS_COMPETITION_ID, comp?.curSeasonId ?? null),
      ]);
      if (pairs.length > 0) {
        const votes = new Map<number, Map<string, number>>();
        const vote = (apiId: number, uuid: string) => {
          if (!apiId || !uuid) return;
          const m = votes.get(apiId) ?? new Map<string, number>();
          m.set(uuid, (m.get(uuid) ?? 0) + 1);
          votes.set(apiId, m);
        };
        for (const fx of fixtures) {
          if (!fx.home.id || !fx.away.id || !fx.timestamp) continue;
          const hits = pairs.filter((p) => Math.abs(p.time - fx.timestamp) <= 120);
          if (hits.length !== 1) continue; // تطابق فريد فقط — اتجاه آمن
          vote(fx.home.id, hits[0].home);
          vote(fx.away.id, hits[0].away);
        }
        for (const [apiId, m] of votes) {
          let best = "";
          let bestN = 0;
          for (const [uuid, n] of m) if (n > bestN) ((best = uuid), (bestN = n));
          if (best) map.set(apiId, best);
        }
      }
    } catch (error) {
      console.warn("[GulfCup] TheSports team bridge failed:", error);
    }
  }
  gcTeamBridge = { at: Date.now(), map };
  return map;
}

/** جسر معرّف المباراة (زوج uuid المنتخبين ∩ match/recent/list) — يُكاش بعد أول حلّ. */
const gcMatchIdBridge = new Map<number, string>();

async function getGcMatchTsId(fx: GcFixture): Promise<string | null> {
  if (!GC_TS_COMPETITION_ID || !fx.home.id || !fx.away.id) return null;
  const cached = gcMatchIdBridge.get(fx.id);
  if (cached) return cached;
  const [bridge, comp] = await Promise.all([
    getGcTeamBridge(),
    getTsCompetitionExtra(GC_TS_COMPETITION_ID),
  ]);
  const homeUuid = bridge.get(fx.home.id);
  const awayUuid = bridge.get(fx.away.id);
  if (!homeUuid || !awayUuid) return null;
  const pairs = await getTsCompetitionMatchPairs(GC_TS_COMPETITION_ID, comp?.curSeasonId ?? null);
  const matches = pairs.filter(
    (p) =>
      p.id &&
      ((p.home === homeUuid && p.away === awayUuid) ||
        (p.home === awayUuid && p.away === homeUuid)),
  );
  if (matches.length === 0) return null;
  const best = matches.reduce((a, b) =>
    Math.abs(b.time - fx.timestamp) < Math.abs(a.time - fx.timestamp) ? b : a,
  );
  if (!best.id) return null;
  gcMatchIdBridge.set(fx.id, best.id);
  return best.id;
}

/** نتيجة TheSports اللحظية فوق المباريات الجارية فقط (الجسر الزمني ±دقيقتين). */
async function overlayGcLiveScores(fixtures: GcFixture[]): Promise<GcFixture[]> {
  if (!GC_TS_COMPETITION_ID) return fixtures;
  if (!fixtures.some((f) => f.status.live && !f.status.finished)) return fixtures;
  return Promise.all(
    fixtures.map(async (f) => {
      if (!f.status.live || f.status.finished) return f;
      const ts = await getTheSportsFastScore(f.id, f.timestamp, GC_TS_COMPETITION_ID).catch(
        () => null,
      );
      if (!ts || (!ts.live && !ts.finished)) return f;
      return {
        ...f,
        goals: { home: ts.home, away: ts.away },
        status: {
          ...f.status,
          elapsed: ts.elapsed ?? f.status.elapsed,
          live: ts.live,
          finished: ts.finished || f.status.finished,
        },
      };
    }),
  );
}

function mapTsLineupToGc(lu: NonNullable<Awaited<ReturnType<typeof getTsLineup>>>): GcRichLineup {
  const mapPlayer = (p: (typeof lu.home)[number]): GcRichLineupPlayer => ({
    id: p.id,
    name: p.nameAr ?? p.name,
    number: p.shirtNumber,
    position: p.position,
    x: p.x,
    y: p.y,
    rating: p.rating,
    photo: p.photo,
    captain: p.captain,
    starter: p.starter,
  });
  return {
    confirmed: lu.confirmed,
    homeFormation: lu.homeFormation,
    awayFormation: lu.awayFormation,
    home: lu.home.map(mapPlayer),
    away: lu.away.map(mapPlayer),
  };
}

function mapTsPlayerStats(
  stats: Awaited<ReturnType<typeof getTsMatchPlayerStats>>,
  lu: Awaited<ReturnType<typeof getTsLineup>>,
): GcPlayerMatchStat[] {
  if (stats.length === 0) return [];
  const meta = new Map<string, { name: string; photo: string | null; side: "home" | "away" }>();
  for (const p of lu?.home ?? []) meta.set(p.id, { name: p.nameAr ?? p.name, photo: p.photo, side: "home" });
  for (const p of lu?.away ?? []) meta.set(p.id, { name: p.nameAr ?? p.name, photo: p.photo, side: "away" });
  return stats
    .map((s): GcPlayerMatchStat => {
      const m = meta.get(s.playerId);
      return {
        playerId: s.playerId,
        name: m?.name ?? "",
        photo: m?.photo ?? null,
        side: m?.side ?? null,
        starter: s.starter,
        minutes: s.minutes,
        rating: s.rating,
        values: s.values,
      };
    })
    .filter((s) => s.name)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
}

/** إصابات منتخب بأسماء معرّبة (uuid عبر الجسر، الأسماء من قائمة الفريق). */
async function getGcTeamInjuryList(teamId: number): Promise<GcInjury[]> {
  const bridge = await getGcTeamBridge();
  const uuid = bridge.get(teamId);
  if (!uuid) return [];
  return withSWR(`gc:injuries:${teamId}`, INJURY_TTL, INJURY_TTL * 2, async () => {
    const [injuries, squad] = await Promise.all([
      getTsTeamInjuries(uuid).catch(() => []),
      getTsTeamSquad(uuid).catch(() => []),
    ]);
    if (injuries.length === 0) return [];
    const nameById = new Map(squad.map((p) => [p.id, p.name]));
    const rawNames = injuries.map((i) => nameById.get(i.playerId ?? "") ?? null);
    const tr = await resolveNames(rawNames.filter((n): n is string => Boolean(n))).catch(
      () => (n: string | null | undefined) => n ?? "",
    );
    return injuries
      .map((i, idx): GcInjury | null => {
        const raw = rawNames[idx];
        if (!raw) return null;
        return { player: tr(raw), reason: i.reason, missedMatches: i.missedMatches };
      })
      .filter((x): x is GcInjury => x !== null);
  }).catch(() => []);
}

/** تصنيف الفيفا لمنتخب — null قبل توفّر جسر الفريق أو التصنيف. */
async function getGcFifaRank(teamId: number): Promise<GcFifaRank | null> {
  const bridge = await getGcTeamBridge();
  const uuid = bridge.get(teamId);
  if (!uuid) return null;
  const ranks = await getTsFifaRanking().catch(() => new Map());
  const r = ranks.get(uuid);
  return r ? { rank: r.rank, points: r.points, change: r.change } : null;
}

export { TIMEZONE as GC_TIMEZONE, LEAGUE_ID as GC_LEAGUE_ID, SEASON as GC_SEASON };
