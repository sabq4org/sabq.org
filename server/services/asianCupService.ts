/**
 * خدمة كأس آسيا 2027 (AFC Asian Cup — تستضيفها المملكة العربية السعودية).
 *
 * مصدر البيانات الأساسي API-Football (v3.football.api-sports.io، league=7
 * season=2027). الأسماء تُعرَّب هنا (منتخبات/ملاعب/جولات/حالات) قبل وصولها
 * للواجهة، وكل نقطة خلف كاش SWR ليخدم آلاف الزوار من طلب واحد للمزوّد.
 *
 * أولوية المزوّدات (كما في قسم المونديال): TheSports أولًا للنتيجة اللحظية —
 * لكنه يتطلّب `competition_id` خاصًّا بكأس آسيا لم يُؤكَّد بعد من الدعم؛ حتى ذلك
 * الحين نعتمد API-Football (وSportMonks لاحقًا للحظة الحيّة). البطولة تنطلق
 * يناير 2027 فلا بيانات حيّة الآن — هذا القسم وضع «معاينة/عدّ تنازلي» ينقلب
 * تلقائيًّا للوضع الحيّ متى توفّرت المباريات.
 */
import { withSWR } from "../memoryCache";
import { applyProvisionalTable } from "./liveStandings";
import {
  SAUDI_TEAM_ID,
  WC_FINISHED_STATUSES,
  WC_LIVE_STATUSES,
  WC_STATUS_AR,
  WC_STATUS_EN,
  localizeEvent,
  localizeRound,
  localizeTeamName,
} from "./worldCupNames";
import { localizeAcTeam, localizeAcVenue } from "./asianCupNames";
import { resolveNames } from "./worldCupNameTranslator";
import { computeMatchProbabilities, toWholePercents } from "./asianCupRatings";
import {
  TS_COMPETITION_IDS,
  TS_I18N_TYPE,
  getTheSportsFastScore,
  getTheSportsMatchLive,
  getTsCompetitionExtra,
  getTsCompetitionMatchPairs,
  getTsFifaRanking,
  getTsLineup,
  getTsMatchPlayerStats,
  getTsMatchTeamStats,
  getTsMatchTrend,
  getTsMatchTv,
  getTsCoach,
  getTsPlayerMarketHistory,
  getTsSeasonTeamStats,
  getTsTeamExtra,
  getTsTeamInjuries,
  getTsTeamSquad,
  getTsVenue,
  isTheSportsConfigured,
  resolveTsNames,
  type TsEvent,
  type TsLineup,
  type TsLiveStats,
} from "./theSportsService";
import { apiFootballGet } from "./apiFootballClient";
import { isEnglishSports } from "./sportsLang";
import { mergeLiveMatchProgress } from "./sportsMatchStatus";
import pLimit from "p-limit";
import {
  getCommentary,
  getMatchFacts,
  getPlayerForm,
  getXg,
  isSportmonksConfigured,
} from "./sportmonksService";

const LEAGUE_ID = 7; // AFC Asian Cup
const SEASON = 2027; // كأس آسيا السعودية 2027
const TIMEZONE = "Asia/Riyadh";
const MATCH_FETCH_CONCURRENCY = 4;

/** نافذة البطولة الرسمية (AFC): 7 يناير – 5 فبراير 2027. */
const AC_OFFICIAL_START = "2027-01-07T17:00:00+03:00";
const AC_OFFICIAL_END = "2027-02-05T21:00:00+03:00";

// البطولة بعد أشهر — بيانات شبه ثابتة. كاش كريم، وتقصّ تلقائيًّا قرب المباريات.
const TEAMS_TTL = 6 * 60 * 60 * 1000;
const FIXTURES_TTL = 5 * 60 * 1000;
const STANDINGS_TTL = 5 * 60 * 1000;
const OVERVIEW_TTL = 5 * 60 * 1000;

export function isAsianCupConfigured(): boolean {
  return Boolean((process.env.APIFOOTBALL_KEY || "").trim());
}

async function apiGet(path: string, params: Record<string, string | number>): Promise<any[]> {
  return apiFootballGet("AsianCup", path, params);
}

// ---------- DTOs المُعرَّبة ----------

export interface AcTeam {
  id: number;
  name: string;
  /** الاسم القانوني من المزوّد، لاستخدام اللغات غير العربية. */
  nameEn: string;
  logo: string;
  /** تصنيف فيفا (TheSports عبر الجسر) — يظهر فقط في قائمة /teams المُثراة */
  fifaRank?: number | null;
}

export interface AcFixture {
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
  roundEn: string;
  venue: { name: string; city: string };
  home: AcTeam;
  away: AcTeam;
  goals: { home: number | null; away: number | null };
}

export interface AcStandingRow {
  rank: number;
  team: AcTeam;
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

export interface AcGroup {
  name: string;
  rows: AcStandingRow[];
}

export interface AcOverview {
  /** يبدأ من أوّل مباراة (ISO، توقيت الرياض) — الواجهة تبني العدّ التنازلي منه */
  startsAt: string | null;
  endsAt: string | null;
  teamsCount: number;
  groupsCount: number;
  host: string;
  venues: { name: string; city: string }[];
  started: boolean;
  saudi: {
    team: AcTeam | null;
    group: string | null;
    fixtures: AcFixture[];
  };
  nextMatch: AcFixture | null;
}

// ---------- محوّلات ----------

function mapTeam(raw: any): AcTeam {
  const id = raw?.id ?? 0;
  const en = raw?.name ?? "";
  // أولوية: قاموس كأس آسيا → قاموس المونديال → الإنجليزي
  return {
    id,
    name: localizeAcTeam(id, localizeTeamName(id, en)),
    nameEn: en,
    logo: raw?.logo ?? "",
  };
}

function statusOf(code: string, elapsed: number | null) {
  return {
    code,
    label: (isEnglishSports() ? WC_STATUS_EN[code] : WC_STATUS_AR[code]) ?? code,
    elapsed,
    live: WC_LIVE_STATUSES.has(code),
    finished: WC_FINISHED_STATUSES.has(code),
  };
}

function mapFixture(raw: any): AcFixture {
  const code = raw?.fixture?.status?.short ?? "NS";
  const venue = localizeAcVenue(raw?.fixture?.venue?.name, raw?.fixture?.venue?.city);
  const roundEn = raw?.league?.round ?? "";
  return {
    id: raw?.fixture?.id ?? 0,
    date: raw?.fixture?.date ?? "",
    timestamp: raw?.fixture?.timestamp ?? 0,
    status: statusOf(code, raw?.fixture?.status?.elapsed ?? null),
    round: localizeRound(roundEn),
    roundEn,
    venue,
    home: mapTeam(raw?.teams?.home),
    away: mapTeam(raw?.teams?.away),
    goals: { home: raw?.goals?.home ?? null, away: raw?.goals?.away ?? null },
  };
}

const AC_TS_COMPETITION_ID = TS_COMPETITION_IDS["asian-cup"];

const TS_STATUS_TO_AC: Record<number, { code: string; label: string }> = {
  2: { code: "1H", label: "الشوط الأول" },
  3: { code: "HT", label: "استراحة" },
  4: { code: "2H", label: "الشوط الثاني" },
  5: { code: "ET", label: "وقت إضافي" },
  6: { code: "ET", label: "وقت إضافي" },
  7: { code: "P", label: "ركلات الترجيح" },
  8: { code: "FT", label: "انتهت" },
};

/** تركيب النتيجة الأسرع على مباراة كأس آسيا الجارية، بأفضل جهد. */
async function overlayAcLiveScore(fixture: AcFixture): Promise<AcFixture> {
  const nowSec = Math.floor(Date.now() / 1000);
  const nearKickoff =
    !fixture.status.finished && fixture.timestamp <= nowSec + 600 && fixture.timestamp >= nowSec - 3 * 3600;
  if ((!fixture.status.live && !nearKickoff) || !AC_TS_COMPETITION_ID) return fixture;
  try {
    const live = await getTheSportsFastScore(
      fixture.id,
      fixture.timestamp,
      AC_TS_COMPETITION_ID,
    );
    if (!live || (!live.live && !live.finished)) return fixture;
    const mapped = TS_STATUS_TO_AC[live.statusId];
    const merged = mergeLiveMatchProgress(
      {
        ...fixture.status,
        extra: null,
      },
      {
        live: live.live,
        finished: live.finished,
        elapsed: live.elapsed,
        extra: live.extra,
        statusId: live.statusId,
        statusCode: mapped?.code,
      },
    );
    return {
      ...fixture,
      goals: { home: live.home, away: live.away },
      status: {
        ...fixture.status,
        code: merged.code,
        label: isEnglishSports()
          ? WC_STATUS_EN[merged.code] ?? merged.label
          : merged.label,
        elapsed: merged.elapsed,
        live: merged.live,
        finished: merged.finished,
      },
    };
  } catch {
    return fixture;
  }
}

// ---------- نقاط البيانات ----------

/** المنتخبات المتأهّلة (السعودية أولًا ثم أبجديًّا عربيًّا). */
export async function getAcTeams(): Promise<AcTeam[]> {
  return withSWR("ac:teams", TEAMS_TTL, TEAMS_TTL * 2, async () => {
    const raw = await apiGet("teams", { league: LEAGUE_ID, season: SEASON });
    const teams: AcTeam[] = raw.map((x: any): AcTeam => mapTeam(x?.team));
    return teams.sort((a, b) => {
      if (a.id === SAUDI_TEAM_ID) return -1;
      if (b.id === SAUDI_TEAM_ID) return 1;
      return a.name.localeCompare(b.name, "ar");
    });
  });
}

/** جدول المباريات كاملًا (مُرتَّب زمنيًّا). */
export async function getAcFixtures(): Promise<AcFixture[]> {
  const fixtures = await withSWR("ac:fixtures", FIXTURES_TTL, FIXTURES_TTL * 3, async () => {
    const raw = await apiGet("fixtures", { league: LEAGUE_ID, season: SEASON });
    return raw.map(mapFixture).sort((a, b) => a.timestamp - b.timestamp);
  });
  // الطبقة اللحظية خارج كاش API-Football الطويل: TheSports يحدّث بالـMQTT/REST
  // من دون تحوير عناصر الكاش المشتركة، وفشله يعيد الأساس كما هو.
  return Promise.all(fixtures.map(overlayAcLiveScore));
}

const GROUP_ORDINALS = [
  "الأولى",
  "الثانية",
  "الثالثة",
  "الرابعة",
  "الخامسة",
  "السادسة",
  "السابعة",
  "الثامنة",
];

/**
 * مجموعات النهائيات + ترتيبها — **محسوبة من جدول المباريات نفسه**، لا من نقطة
 * `standings` (التي تُرجع حاليًّا مجموعات التصفيات «Promotion» المضلِّلة).
 * الفِرق التي تلعب ضد بعضها في دور المجموعات = مجموعة واحدة (Union-Find على
 * مباريات «Group Stage»). الأساس من النتائج المنتهية؛ المباريات الجارية تُطبَّق
 * مبدئيًّا عبر `applyProvisionalTable` فيتحرّك الجدول مع كل هدف. مجموعة المضيف
 * (السعودية) أولًا.
 */
function buildGroupsFromFixtures(fixtures: AcFixture[], teams: AcTeam[]): AcGroup[] {
  const teamMap = new Map<number, AcTeam>();
  for (const t of teams) teamMap.set(t.id, t);

  const gs = fixtures.filter(
    (f) => f.roundEn.startsWith("Group Stage") && f.home.id > 0 && f.away.id > 0,
  );
  if (gs.length === 0) return [];

  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = x;
    while (parent.get(c) !== r) {
      const next = parent.get(c)!;
      parent.set(c, r);
      c = next;
    }
    return r;
  };
  const add = (x: number) => {
    if (!parent.has(x)) parent.set(x, x);
  };
  for (const f of gs) {
    add(f.home.id);
    add(f.away.id);
    const ra = find(f.home.id);
    const rb = find(f.away.id);
    if (ra !== rb) parent.set(ra, rb);
  }

  const members = new Map<number, Set<number>>();
  const earliest = new Map<number, number>();
  for (const id of parent.keys()) {
    const r = find(id);
    if (!members.has(r)) members.set(r, new Set());
    members.get(r)!.add(id);
  }
  for (const f of gs) {
    const r = find(f.home.id);
    const cur = earliest.get(r);
    if (cur == null || f.timestamp < cur) earliest.set(r, f.timestamp);
  }

  type Stat = { played: number; win: number; draw: number; lose: number; gf: number; ga: number };
  const stats = new Map<number, Stat>();
  const ensure = (id: number): Stat => {
    if (!stats.has(id)) stats.set(id, { played: 0, win: 0, draw: 0, lose: 0, gf: 0, ga: 0 });
    return stats.get(id)!;
  };
  for (const f of gs) {
    if (!f.status.finished) continue;
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

  // مجموعة المضيف أولًا، ثم بحسب أبكر انطلاقة
  const roots = [...members.keys()].sort((x, y) => {
    const sx = members.get(x)!.has(SAUDI_TEAM_ID) ? 0 : 1;
    const sy = members.get(y)!.has(SAUDI_TEAM_ID) ? 0 : 1;
    if (sx !== sy) return sx - sy;
    return (earliest.get(x) ?? 0) - (earliest.get(y) ?? 0);
  });

  return roots.map((r, idx) => {
    const rows: AcStandingRow[] = [...members.get(r)!].map((id) => {
      const s = stats.get(id) ?? { played: 0, win: 0, draw: 0, lose: 0, gf: 0, ga: 0 };
      const team = teamMap.get(id) ?? { id, name: String(id), nameEn: String(id), logo: "" };
      return {
        rank: 0,
        team,
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
    const liveInGroup = gs.filter(
      (f) =>
        f.status.live &&
        !f.status.finished &&
        members.get(r)!.has(f.home.id) &&
        members.get(r)!.has(f.away.id),
    );
    return {
      name: `المجموعة ${GROUP_ORDINALS[idx] ?? String(idx + 1)}`,
      rows: applyProvisionalTable(rows, liveInGroup),
    };
  });
}

/** مجموعات النهائيات وترتيبها (محسوبة من الجدول) — فارغة قبل اعتماد القرعة. */
export async function getAcStandings(): Promise<AcGroup[]> {
  // لا نُخزّن الناتج النهائي طويلًا: أثناء المباريات الجارية يجب أن يتحرّك
  // الترتيب مع النتيجة. كاش المباريات/الفرق يكفي؛ عند غياب الحيّ نُخزّن الأساس.
  const [fixtures, teams] = await Promise.all([getAcFixtures(), getAcTeams()]);
  const hasLive = fixtures.some(
    (f) => f.roundEn.startsWith("Group Stage") && f.status.live && !f.status.finished,
  );
  if (hasLive) return buildGroupsFromFixtures(fixtures, teams);
  return withSWR("ac:standings", STANDINGS_TTL, STANDINGS_TTL * 3, async () => {
    const [fx, tm] = await Promise.all([getAcFixtures(), getAcTeams()]);
    return buildGroupsFromFixtures(fx, tm);
  });
}

/** نظرة عامة: عدّ تنازلي + المضيف + الملاعب + تركيز السعودية + المباراة القادمة. */
export async function getAcOverview(): Promise<AcOverview> {
  return withSWR("ac:overview:v2", OVERVIEW_TTL, OVERVIEW_TTL * 3, async () => {
    const [fixtures, standings] = await Promise.all([getAcFixtures(), getAcStandings()]);
    const teams = await getAcTeams();

    const sorted = [...fixtures].sort((a, b) => a.timestamp - b.timestamp);
    // التواريخ الرسمية ثابتة — لا نعتمد أول/آخر مباراة في المزود (قد يكون الجدول ناقصًا).
    const startsAt = AC_OFFICIAL_START;
    const endsAt = AC_OFFICIAL_END;
    const now = Date.now();
    const started = sorted.some((f) => f.status.live || f.status.finished);

    // ملاعب فريدة من الجدول (مصدر واقعي بدل تخمين)
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
      host: "المملكة العربية السعودية",
      venues,
      started,
      saudi: { team: saudiTeam, group: saudiGroup, fixtures: saudiFixtures },
      nextMatch,
    };
  });
}

export { TIMEZONE as AC_TIMEZONE, LEAGUE_ID as AC_LEAGUE_ID, SEASON as AC_SEASON };

// ════════════════════════════════════════════════════════════════════════════
// المرحلة 1 — نقاط API-Football إضافية لكأس آسيا (بلا اعتماد خارجي):
// الهدّافون · شجرة الأدوار الإقصائية · صفحة المنتخب + القائمة · تفاصيل المباراة.
// نفس مزوّد teams/fixtures (league=7, season=2027) — لا اشتراك جديد.
// ════════════════════════════════════════════════════════════════════════════

// ترجمة المراكز والإحصاءات (نسخة محلية مختصرة بأسلوب قسم المونديال).
const AC_POSITION_AR: Record<string, string> = {
  Goalkeeper: "حارس مرمى",
  Defender: "مدافع",
  Midfielder: "لاعب وسط",
  Attacker: "مهاجم",
  G: "حارس مرمى",
  D: "مدافع",
  M: "لاعب وسط",
  F: "مهاجم",
};
const AC_POSITION_ORDER: Record<string, number> = {
  Goalkeeper: 0,
  Defender: 1,
  Midfielder: 2,
  Attacker: 3,
};
const AC_STAT_AR: Record<string, string> = {
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
};

const SCORERS_TTL = 30 * 60 * 1000;
const SQUAD_TTL = 6 * 60 * 60 * 1000;
const QUALIFICATION_TTL = 6 * 60 * 60 * 1000;
const H2H_TTL = 24 * 60 * 60 * 1000;
const MATCH_DETAIL_TTL = 5 * 60 * 1000;
const MATCH_DETAIL_LIVE_TTL = 20 * 1000;
const MATCH_DETAIL_PREKICKOFF_TTL = 60 * 1000;
const PREKICKOFF_WINDOW_MS = 60 * 60 * 1000;

// ───────────────────────── الهدّافون / الصناعات / البطاقات ─────────────────────────

export interface AcScorer {
  rank: number;
  id: number;
  name: string;
  /** الاسم الأصلي من المزوّد (لاتيني) — تستعمله الواجهة للغات غير العربية */
  nameEn: string;
  photo: string;
  team: AcTeam;
  goals: number;
  assists: number;
  penalties: number;
  minutes: number;
  matches: number;
}

/** لوحة قادة موحّدة (صناعات/بطاقات) — نفس شكل مونديال WcLeader + nameEn. */
export interface AcLeader {
  rank: number;
  id: number;
  name: string;
  nameEn: string;
  photo: string;
  team: AcTeam;
  goals: number;
  assists: number;
  yellow: number;
  red: number;
  minutes: number;
  matches: number;
}

function mapLeader(row: any, index: number, tr: (n: string | null | undefined) => string): AcLeader {
  const stats = row.statistics?.[0] ?? {};
  return {
    rank: index + 1,
    id: row.player?.id ?? 0,
    name: tr(row.player?.name),
    nameEn: row.player?.name ?? "",
    photo: row.player?.photo ?? "",
    team: mapTeam(stats.team),
    goals: stats.goals?.total ?? 0,
    assists: stats.goals?.assists ?? 0,
    yellow: stats.cards?.yellow ?? 0,
    red: (stats.cards?.red ?? 0) + (stats.cards?.yellowred ?? 0),
    minutes: stats.games?.minutes ?? 0,
    matches: stats.games?.appearences ?? 0,
  };
}

function freshestBoard<T extends { id: number; photo: string; minutes: number; matches: number }>(
  provider: T[] | null | undefined,
  providerTotal: number,
  fromEvents: T[],
  eventsTotal: number,
): T[] {
  const board = provider ?? [];
  if (board.length > 0 && providerTotal >= eventsTotal) return board;
  const byId = new Map(board.map((row) => [row.id, row]));
  return fromEvents.map((row) => {
    const known = row.id ? byId.get(row.id) : undefined;
    return known
      ? { ...row, minutes: known.minutes, matches: known.matches, photo: row.photo || known.photo }
      : row;
  });
}

interface AcRaceTally {
  playerId: number | null;
  name: string;
  nameEn: string;
  team: AcTeam;
  photo: string;
  goals: number;
  penalties: number;
  assists: number;
  yellow: number;
  red: number;
  lastAt: number;
}

interface AcRacesFromEvents {
  scorers: AcScorer[];
  assists: AcLeader[];
  cards: AcLeader[];
  totals: { goals: number; assists: number; cards: number };
}

/** أحداث المباراة فقط (خفيفة) — لتجميع السباقات اللحظي. */
async function getAcMatchEventsOnly(fixtureId: number): Promise<AcMatchEvent[]> {
  const known = (await getAcFixtures()).find((f) => f.id === fixtureId);
  let ttl = MATCH_DETAIL_TTL;
  if (known?.status.live) {
    ttl = MATCH_DETAIL_LIVE_TTL;
  } else if (known && !known.status.finished) {
    const msToKickoff = new Date(known.date).getTime() - Date.now();
    if (msToKickoff < PREKICKOFF_WINDOW_MS) ttl = MATCH_DETAIL_PREKICKOFF_TTL;
  }

  return withSWR(`ac:matchEvents:${fixtureId}`, ttl, ttl * 2, async () => {
    const rows = await apiGet("fixtures", { id: fixtureId, timezone: TIMEZONE });
    const item = rows[0];
    if (!item) return [];
    const rawNames: (string | null | undefined)[] = [];
    for (const ev of item.events ?? []) {
      rawNames.push(ev.player?.name, ev.assist?.name);
    }
    const tr = await resolveNames(rawNames);
    return (item.events ?? []).map((ev: any): AcMatchEvent => {
      const localized = localizeEvent(ev?.type ?? "", ev?.detail ?? "");
      const isSubst = String(ev?.type ?? "").toLowerCase() === "subst";
      const inSide = isSubst ? ev?.assist : ev?.player;
      const outSide = isSubst ? ev?.player : ev?.assist;
      const hasSecondary = !!(outSide?.name || outSide?.id);
      return {
        minute: ev?.time?.elapsed ?? 0,
        extraMinute: ev?.time?.extra ?? null,
        teamId: ev?.team?.id ?? 0,
        type: localized.type,
        label: localized.label,
        detail: ev?.detail ?? "",
        player: tr(inSide?.name),
        playerEn: inSide?.name ?? "",
        playerId: inSide?.id ?? null,
        assist: hasSecondary ? tr(outSide?.name) || null : null,
        assistEn: hasSecondary ? outSide?.name ?? null : null,
        assistId: outSide?.id ?? null,
      };
    });
  });
}

async function aggregateAcRacesFromEvents(): Promise<AcRacesFromEvents> {
  return withSWR<AcRacesFromEvents>("ac:racesFromEvents", 30 * 1000, 60 * 1000, async () => {
    const started = (await getAcFixtures()).filter((f) => f.status.live || f.status.finished);
    const teamById = new Map<number, AcTeam>();
    for (const f of started) {
      teamById.set(f.home.id, f.home);
      teamById.set(f.away.id, f.away);
    }

    const tallies = new Map<string, AcRaceTally>();
    const bump = (
      name: string | null,
      nameEn: string | null,
      playerId: number | null,
      teamId: number,
      at: number,
      apply: (t: AcRaceTally) => void,
    ) => {
      const team = teamById.get(teamId);
      if (!name || !team) return;
      const key = `${teamId}:${name}`;
      let tally = tallies.get(key);
      if (!tally) {
        const photo = playerId ? `https://media.api-sports.io/football/players/${playerId}.png` : "";
        tally = {
          playerId,
          name,
          nameEn: nameEn ?? "",
          team,
          photo,
          goals: 0,
          penalties: 0,
          assists: 0,
          yellow: 0,
          red: 0,
          lastAt: at,
        };
        tallies.set(key, tally);
      } else {
        if (!tally.photo && playerId) {
          tally.playerId = playerId;
          tally.photo = `https://media.api-sports.io/football/players/${playerId}.png`;
        }
        if (at > tally.lastAt) tally.lastAt = at;
      }
      apply(tally);
    };

    const FINISHED_EVENTS_TTL = 60 * 60 * 1000;
    const limit = pLimit(MATCH_FETCH_CONCURRENCY);
    const eventLists = await Promise.all(
      started.map((f): Promise<{ at: number; events: AcMatchEvent[] }> =>
        limit(async () => {
          try {
            const events = f.status.finished
              ? await withSWR(
                  `ac:raceEvents:${f.id}`,
                  FINISHED_EVENTS_TTL,
                  FINISHED_EVENTS_TTL * 2,
                  async () => await getAcMatchEventsOnly(f.id),
                )
              : await getAcMatchEventsOnly(f.id);
            return { at: f.timestamp, events };
          } catch {
            return { at: f.timestamp, events: [] };
          }
        }),
      ),
    );

    for (const { at, events } of eventLists) {
      for (const ev of events) {
        const evAt = at + (ev.minute ?? 0) * 60;
        if (ev.type === "goal" && ev.detail !== "Own Goal") {
          bump(ev.player, ev.playerEn, ev.playerId, ev.teamId, evAt, (t) => {
            t.goals += 1;
            if (ev.detail === "Penalty") t.penalties += 1;
          });
          if (ev.assist) {
            bump(ev.assist, ev.assistEn, ev.assistId, ev.teamId, evAt, (t) => {
              t.assists += 1;
            });
          }
        } else if (ev.type === "yellow-card") {
          bump(ev.player, ev.playerEn, ev.playerId, ev.teamId, evAt, (t) => {
            t.yellow += 1;
            if (ev.detail === "Second Yellow card") t.red += 1;
          });
        } else if (ev.type === "red-card") {
          bump(ev.player, ev.playerEn, ev.playerId, ev.teamId, evAt, (t) => {
            t.red += 1;
          });
        }
      }
    }

    const all = [...tallies.values()];
    const toLeader = (t: AcRaceTally, index: number): AcLeader => ({
      rank: index + 1,
      id: t.playerId ?? 0,
      name: t.name,
      nameEn: t.nameEn,
      photo: t.photo,
      team: t.team,
      goals: t.goals,
      assists: t.assists,
      yellow: t.yellow,
      red: t.red,
      minutes: 0,
      matches: 0,
    });

    return {
      scorers: all
        .filter((t) => t.goals > 0)
        .sort((a, b) => b.goals - a.goals || b.assists - a.assists || b.lastAt - a.lastAt)
        .slice(0, 10)
        .map(
          (t, i): AcScorer => ({
            rank: i + 1,
            id: t.playerId ?? 0,
            name: t.name,
            nameEn: t.nameEn,
            photo: t.photo,
            team: t.team,
            goals: t.goals,
            assists: t.assists,
            penalties: t.penalties,
            minutes: 0,
            matches: 0,
          }),
        ),
      assists: all
        .filter((t) => t.assists > 0)
        .sort((a, b) => b.assists - a.assists || b.goals - a.goals || b.lastAt - a.lastAt)
        .slice(0, 10)
        .map(toLeader),
      cards: all
        .filter((t) => t.yellow + t.red > 0)
        .sort((a, b) => b.red - a.red || b.yellow - a.yellow || b.lastAt - a.lastAt)
        .slice(0, 10)
        .map(toLeader),
      totals: {
        goals: all.reduce((sum, t) => sum + t.goals, 0),
        assists: all.reduce((sum, t) => sum + t.assists, 0),
        cards: all.reduce((sum, t) => sum + t.yellow + t.red, 0),
      },
    };
  });
}

/** قائمة الهدّافين (أعلى 10) — لوحة المزوّد + تجميع لحظي من الأحداث (مثل المونديال). */
export async function getAcTopScorers(): Promise<AcScorer[]> {
  const provider = await withSWR("ac:scorers", SCORERS_TTL, SCORERS_TTL * 2, async () => {
    const rows = await apiGet("players/topscorers", { league: LEAGUE_ID, season: SEASON });
    const total = rows.reduce((sum: number, row: any) => sum + (row.statistics?.[0]?.goals?.total ?? 0), 0);
    const top = rows.slice(0, 10);
    const tr = await resolveNames(top.map((row: any) => row?.player?.name));
    const board = top.map((row: any, index: number): AcScorer => {
      const stats = row?.statistics?.[0] ?? {};
      return {
        rank: index + 1,
        id: row?.player?.id ?? 0,
        name: tr(row?.player?.name),
        nameEn: row?.player?.name ?? "",
        photo: row?.player?.photo ?? "",
        team: mapTeam(stats.team),
        goals: stats.goals?.total ?? 0,
        assists: stats.goals?.assists ?? 0,
        penalties: stats.penalty?.scored ?? 0,
        minutes: stats.games?.minutes ?? 0,
        matches: stats.games?.appearences ?? 0,
      };
    });
    return { board, total };
  });
  const events = await aggregateAcRacesFromEvents();
  return freshestBoard(provider.board, provider.total, events.scorers, events.totals.goals);
}

/** صنّاع الأهداف — نفس آلية المونديال. */
export async function getAcTopAssists(): Promise<AcLeader[]> {
  const provider = await withSWR("ac:assists", SCORERS_TTL, SCORERS_TTL * 2, async () => {
    const rows = await apiGet("players/topassists", { league: LEAGUE_ID, season: SEASON });
    const total = rows.reduce((sum: number, row: any) => sum + (row.statistics?.[0]?.goals?.assists ?? 0), 0);
    const top = rows.slice(0, 10);
    const tr = await resolveNames(top.map((row: any) => row.player?.name));
    const board = top.map((row: any, i: number) => mapLeader(row, i, tr));
    return { board, total };
  });
  const events = await aggregateAcRacesFromEvents();
  return freshestBoard(provider.board, provider.total, events.assists, events.totals.assists);
}

/** البطاقات (صفراء + حمراء) — دمج قائمتي المزوّد + الأحداث. */
export async function getAcTopCards(): Promise<AcLeader[]> {
  const provider = await withSWR("ac:cards", SCORERS_TTL, SCORERS_TTL * 2, async () => {
    const [yellowRows, redRows] = await Promise.all([
      apiGet("players/topyellowcards", { league: LEAGUE_ID, season: SEASON }),
      apiGet("players/topredcards", { league: LEAGUE_ID, season: SEASON }),
    ]);
    const byId = new Map<number, any>();
    for (const row of [...yellowRows, ...redRows]) {
      const id = row.player?.id ?? 0;
      if (id && !byId.has(id)) byId.set(id, row);
    }
    const merged = [...byId.values()];
    const total = merged.reduce((sum: number, row: any) => {
      const c = row.statistics?.[0]?.cards ?? {};
      return sum + (c.yellow ?? 0) + (c.red ?? 0) + (c.yellowred ?? 0);
    }, 0);
    const tr = await resolveNames(merged.map((row: any) => row.player?.name));
    const board = merged
      .map((row: any) => mapLeader(row, 0, tr))
      .sort((a, b) => b.red - a.red || b.yellow - a.yellow)
      .slice(0, 10)
      .map((leader, i) => ({ ...leader, rank: i + 1 }));
    return { board, total };
  });
  const events = await aggregateAcRacesFromEvents();
  return freshestBoard(provider.board, provider.total, events.cards, events.totals.cards);
}

/** المباريات الجارية فقط. */
export async function getAcLiveFixtures(): Promise<AcFixture[]> {
  return (await getAcFixtures()).filter((f) => f.status.live && !f.status.finished);
}

// ───────────────────── شجرة الأدوار الإقصائية ─────────────────────

const AC_KNOCKOUT_ROUND_ORDER = [
  "Round of 16",
  "Quarter-finals",
  "Semi-finals",
  "3rd Place Final",
  "Final",
] as const;

export interface AcBracketRound {
  round: string;
  roundEn: string;
  matches: AcFixture[];
}

export interface AcBracket {
  source: "api-football";
  rounds: AcBracketRound[];
}

/**
 * يبني شجرة الأدوار الإقصائية من جدول المباريات نفسه: نُصنّف كل مباراة حسب
 * اسم دورها (roundEn) إلى أحد الأدوار المعروفة، ونُسقط دور المجموعات. المزوّد
 * قد يُذيّل الاسم برقم ("Round of 16 - 1") فنطابق بالبادئة. فارغة قبل القرعة.
 */
function buildAcBracket(fixtures: AcFixture[]): AcBracket {
  const byRound = new Map<string, AcFixture[]>();
  for (const fx of fixtures) {
    const r = (fx.roundEn ?? "").trim();
    if (!r) continue;
    const canon = AC_KNOCKOUT_ROUND_ORDER.find((o) => r === o || r.startsWith(o));
    if (!canon) continue;
    const arr = byRound.get(canon) ?? [];
    arr.push(fx);
    byRound.set(canon, arr);
  }
  const rounds: AcBracketRound[] = [];
  for (const o of AC_KNOCKOUT_ROUND_ORDER) {
    const matches = byRound.get(o);
    if (!matches || matches.length === 0) continue;
    matches.sort((a, b) => a.timestamp - b.timestamp);
    rounds.push({ round: localizeRound(o), roundEn: o, matches });
  }
  return { source: "api-football", rounds };
}

export async function getAcBracket(): Promise<AcBracket> {
  const fixtures = await getAcFixtures().catch(() => [] as AcFixture[]);
  return buildAcBracket(fixtures);
}

// ───────────────────── صفحة المنتخب + القائمة ─────────────────────

export interface AcSquadPlayer {
  id: number;
  name: string;
  nameEn: string;
  number: number | null;
  position: string;
  positionEn: string;
  age: number | null;
  photo: string;
}

export interface AcSquad {
  team: AcTeam;
  players: AcSquadPlayer[];
}

/** قائمة المنتخب (مرتّبة بالمركز ثم الرقم) — أسماء معرّبة بنقل صوتي. */
export async function getAcSquad(teamId: number): Promise<AcSquad | null> {
  return withSWR(`ac:squad:${teamId}`, SQUAD_TTL, SQUAD_TTL * 2, async () => {
    const rows = await apiGet("players/squads", { team: teamId });
    const entry = rows[0];
    if (!entry) return null;
    const raw: any[] = entry.players ?? [];
    const tr = await resolveNames(raw.map((p: any) => p?.name));
    const players: AcSquadPlayer[] = raw
      .map((p: any): AcSquadPlayer => ({
        id: p?.id ?? 0,
        name: tr(p?.name),
        nameEn: p?.name ?? "",
        number: p?.number ?? null,
        position: AC_POSITION_AR[p?.position] ?? p?.position ?? "",
        positionEn: p?.position ?? "",
        age: p?.age ?? null,
        photo: p?.photo ?? "",
      }))
      .sort(
        (a, b) =>
          (AC_POSITION_ORDER[a.positionEn] ?? 9) - (AC_POSITION_ORDER[b.positionEn] ?? 9) ||
          (a.number ?? 99) - (b.number ?? 99),
      );
    return { team: mapTeam(entry.team), players };
  });
}

/** المدرّب الحالي للمنتخب (اسم معرّب) — أفضل جهد. */
export async function getAcCoach(teamId: number): Promise<string | null> {
  return withSWR(`ac:coach:${teamId}`, SQUAD_TTL, SQUAD_TTL * 2, async () => {
    const rows = await apiGet("coachs", { team: teamId });
    const current = rows.find((r: any) => r?.team?.id === teamId) ?? rows[0];
    const raw: string | undefined = current?.name;
    if (!raw) return null;
    const tr = await resolveNames([raw]);
    return tr(raw);
  });
}

export interface AcTeamExtra {
  marketValue: number | null;
  marketValueCurrency: string;
  foundation: number | null;
  squadSize: number | null;
}

export interface AcCoachInfo {
  name: string;
  photo: string;
  formation: string | null;
  age: number | null;
  nationality: string | null;
}

export interface AcVenueInfo {
  name: string;
  capacity: number | null;
  city: string;
  country: string | null;
}

export interface AcInjury {
  player: string;
  reason: string | null;
  status: string | null;
  until: string | null;
}

export interface AcTeamProfile {
  team: AcTeam;
  isSaudi: boolean;
  coach: string | null;
  /** مجموعة المنتخب كاملة (لتظليل صفّه) — null قبل اعتماد القرعة/الجداول */
  group: AcGroup | null;
  stats: {
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
  };
  nextMatch: AcFixture | null;
  fixtures: AcFixture[];
  squad: AcSquadPlayer[];
  /** تصنيف فيفا (TheSports عبر الجسر) — null إن تعذّر الربط */
  fifaRank: AcFifaRank | null;
  /** إحصاء المنتخب في البطولة (TheSports season/recent/team/stat) */
  seasonStats: AcTeamSeasonStats | null;
  /** قيمة سوقية / تأسيس / حجم القائمة — null إن تعذّر */
  extra: AcTeamExtra | null;
  /** إصابات وغيابات — [] إن تعذّر */
  injuries: AcInjury[];
  /** المدرّب (صورة/خطة) من TheSports — null إن تعذّر */
  coachInfo: AcCoachInfo | null;
  /** ملعب المنتخب من TheSports — null إن تعذّر */
  venue: AcVenueInfo | null;
}

export interface AcFifaRank {
  rank: number;
  points: number | null;
  /** المراكز المتغيّرة منذ التحديث السابق (موجب = صعد) — null إن تعذّر */
  change: number | null;
}

export interface AcSeasonStatItem {
  label: string;
  value: number;
  percent?: boolean;
}

export interface AcTeamSeasonStats {
  available: boolean;
  matches: number;
  items: AcSeasonStatItem[];
}

export interface AcQualificationTimelineItem {
  id: string;
  kind: "host" | "match" | "qualified" | "note";
  date: string | null;
  title: string;
  subtitle: string | null;
  competition: string | null;
  round: string | null;
  opponent: AcTeam | null;
  isHome: boolean | null;
  venue: { name: string; city: string } | null;
  goals: { for: number | null; against: number | null };
  result: "W" | "D" | "L" | null;
  status: string | null;
}

export interface AcQualificationJourney {
  team: AcTeam;
  available: boolean;
  method: "host" | "qualifiers" | "unknown";
  source: "api-football" | "host" | "none";
  title: string;
  subtitle: string;
  stats: {
    played: number;
    win: number;
    draw: number;
    lose: number;
    goalsFor: number;
    goalsAgainst: number;
  };
  timeline: AcQualificationTimelineItem[];
  updatedAt: string;
}

export interface AcPlayerCareerStop {
  teamId: number;
  team: string;
  logo: string;
  seasons: number[];
}

export interface AcPlayerTrophy {
  competition: string;
  country: string;
  season: string;
  place: string;
  winner: boolean;
}

export interface AcPlayerTransfer {
  date: string | null;
  type: string;
  from: AcTeam | null;
  to: AcTeam | null;
}

export interface AcPlayerTournamentStats {
  matches: number;
  lineups: number;
  minutes: number;
  rating: number | null;
  goals: number;
  assists: number;
  shots: number;
  shotsOn: number;
  passes: number;
  keyPasses: number;
  tackles: number;
  yellow: number;
  red: number;
  saves: number;
  conceded: number;
  penaltiesScored: number;
  penaltiesMissed: number;
}

export interface AcPlayerMarket {
  available: boolean;
  value: number | null;
  currency: string;
  source: "thesports";
  history: { time: number; value: number }[];
}

export interface AcPlayerCard {
  id: number;
  name: string;
  fullName: string | null;
  photo: string;
  nationality: string | null;
  position: string;
  positionEn: string;
  number: number | null;
  age: number | null;
  birthDate: string | null;
  birthPlace: string | null;
  height: number | null;
  weight: number | null;
  currentTeam: AcTeam | null;
  career: AcPlayerCareerStop[];
  trophies: AcPlayerTrophy[];
  transfers: AcPlayerTransfer[];
  stats: AcPlayerTournamentStats | null;
  injury: { reason: string } | null;
  market: AcPlayerMarket;
  sources: { apiFootball: boolean; theSports: boolean };
}

function resultForTeam(fixture: AcFixture, teamId: number): "W" | "D" | "L" | null {
  if (!fixture.status.finished || fixture.goals.home == null || fixture.goals.away == null) return null;
  const own = fixture.home.id === teamId ? fixture.goals.home : fixture.goals.away;
  const against = fixture.home.id === teamId ? fixture.goals.away : fixture.goals.home;
  if (own > against) return "W";
  if (own < against) return "L";
  return "D";
}

/** صفحة المنتخب المتكاملة: الهوية + المجموعة + كل مبارياته + القائمة + المدرّب. */
export async function getAcTeamProfile(teamId: number): Promise<AcTeamProfile | null> {
  const [fixtures, squad, standings, teams, extra, injuries, basics] = await Promise.all([
    getAcFixtures(),
    getAcSquad(teamId).catch(() => null),
    getAcStandings().catch(() => [] as AcGroup[]),
    getAcTeams().catch(() => [] as AcTeam[]),
    getAcTeamExtra(teamId).catch(() => null),
    getAcTeamInjuries(teamId).catch(() => [] as AcInjury[]),
    getAcTeamBasics(teamId).catch(() => ({ coach: null, venue: null }) as {
      coach: AcCoachInfo | null;
      venue: AcVenueInfo | null;
    }),
  ]);

  const teamFixtures = fixtures
    .filter((f) => f.home.id === teamId || f.away.id === teamId)
    .sort((a, b) => a.timestamp - b.timestamp);

  let team: AcTeam | null = squad?.team ?? teams.find((t) => t.id === teamId) ?? null;
  if (!team && teamFixtures.length > 0) {
    const fx = teamFixtures[0];
    team = fx.home.id === teamId ? fx.home : fx.away;
  }
  if (!team || !team.id) return null;

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

  let coach: string | null = basics.coach?.name ?? null;
  if (!coach) {
    try {
      coach = await getAcCoach(teamId);
    } catch (error) {
      console.warn(`[AsianCup] coach ${teamId} failed:`, error);
    }
  }

  // إثراء TheSports (تصنيف فيفا + إحصاء البطولة) — أفضل جهد: غيابه لا يعطّل الملف.
  const [fifaRank, seasonStats] = await Promise.all([
    getAcTeamFifaRank(teamId).catch(() => null),
    getAcTeamSeasonStats(teamId).catch(() => null),
  ]);

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
    squad: squad?.players ?? [],
    fifaRank,
    seasonStats,
    extra,
    injuries,
    coachInfo: basics.coach,
    venue: basics.venue,
  };
}

function isQualificationCompetition(raw: any): boolean {
  const name = String(raw?.league?.name ?? "").toLowerCase();
  return (
    name.includes("asian cup") && name.includes("qualification") ||
    name.includes("asian cup") && name.includes("qualifiers") ||
    name.includes("world cup") && name.includes("qualification") && name.includes("asia")
  );
}

function localizeQualificationCompetition(raw: any): string {
  const name = String(raw?.league?.name ?? "");
  const lower = name.toLowerCase();
  if (lower.includes("world cup") && lower.includes("qualification") && lower.includes("asia")) {
    return "التصفيات الآسيوية المشتركة";
  }
  if (lower.includes("asian cup")) return "تصفيات كأس آسيا";
  return name || "التصفيات";
}

function qualificationTitleFor(item: AcQualificationTimelineItem): string {
  if (!item.opponent) return item.title;
  const side = item.isHome ? "أمام" : "ضد";
  return `${side} ${item.opponent.name}`;
}

function mapQualificationFixture(raw: any, teamId: number): AcQualificationTimelineItem {
  const home = mapTeam(raw?.teams?.home);
  const away = mapTeam(raw?.teams?.away);
  const isHome = home.id === teamId;
  const opponent = isHome ? away : home;
  const homeGoals = raw?.goals?.home ?? null;
  const awayGoals = raw?.goals?.away ?? null;
  const ownGoals = isHome ? homeGoals : awayGoals;
  const opponentGoals = isHome ? awayGoals : homeGoals;
  const finished = WC_FINISHED_STATUSES.has(raw?.fixture?.status?.short ?? "");
  let result: "W" | "D" | "L" | null = null;
  if (finished && ownGoals != null && opponentGoals != null) {
    result = ownGoals > opponentGoals ? "W" : ownGoals < opponentGoals ? "L" : "D";
  }

  const date = raw?.fixture?.date ?? null;
  const roundEn = raw?.league?.round ?? raw?.fixture?.status?.long ?? "";
  const item: AcQualificationTimelineItem = {
    id: String(raw?.fixture?.id ?? `${teamId}-${date ?? raw?.fixture?.timestamp ?? "fixture"}`),
    kind: "match",
    date,
    title: "",
    subtitle: localizeQualificationCompetition(raw),
    competition: localizeQualificationCompetition(raw),
    round: localizeRound(roundEn),
    opponent,
    isHome,
    venue: localizeAcVenue(raw?.fixture?.venue?.name ?? "", raw?.fixture?.venue?.city ?? ""),
    goals: { for: ownGoals, against: opponentGoals },
    result,
    status: statusOf(raw?.fixture?.status?.short ?? "", raw?.fixture?.status?.elapsed ?? null).label,
  };
  return { ...item, title: qualificationTitleFor(item) };
}

function qualificationStats(items: AcQualificationTimelineItem[]) {
  return items.reduce(
    (acc, item) => {
      if (item.kind !== "match" || !item.result) return acc;
      acc.played += 1;
      acc.goalsFor += item.goals.for ?? 0;
      acc.goalsAgainst += item.goals.against ?? 0;
      if (item.result === "W") acc.win += 1;
      else if (item.result === "D") acc.draw += 1;
      else acc.lose += 1;
      return acc;
    },
    { played: 0, win: 0, draw: 0, lose: 0, goalsFor: 0, goalsAgainst: 0 },
  );
}

/** رحلة المنتخب إلى كأس آسيا: صفحة زمنية مستقلة. السعودية تظهر كمستضيف، وبقية المنتخبات من تاريخ التصفيات. */
export async function getAcQualificationJourney(teamId: number): Promise<AcQualificationJourney | null> {
  const team = (await getAcTeamProfile(teamId).catch(() => null))?.team;
  if (!team) return null;

  if (teamId === SAUDI_TEAM_ID) {
    const timeline: AcQualificationTimelineItem[] = [
      {
        id: "host-award-2023-02-01",
        kind: "host",
        date: "2023-02-01T12:00:00+03:00",
        title: "اعتماد السعودية مستضيفًا للبطولة",
        subtitle: "تأهل مباشر بصفة المستضيف",
        competition: "كأس آسيا 2027",
        round: null,
        opponent: null,
        isHome: null,
        venue: null,
        goals: { for: null, against: null },
        result: null,
        status: "متأهل",
      },
      {
        id: "host-final-prep",
        kind: "qualified",
        date: null,
        title: "رحلة البطولة تبدأ من دور المجموعات",
        subtitle: "لا تُعرض للسعودية مباريات تصفيات لأنها متأهلة تلقائيًا كمستضيف",
        competition: "كأس آسيا 2027",
        round: null,
        opponent: null,
        isHome: null,
        venue: null,
        goals: { for: null, against: null },
        result: null,
        status: "مستضيف",
      },
    ];
    return {
      team,
      available: true,
      method: "host",
      source: "host",
      title: "طريق التأهل",
      subtitle: "تأهل مباشر بصفة مستضيف كأس آسيا 2027",
      stats: qualificationStats(timeline),
      timeline,
      updatedAt: new Date().toISOString(),
    };
  }

  return withSWR(`ac:qualification:${teamId}`, QUALIFICATION_TTL, QUALIFICATION_TTL * 2, async () => {
    const seasons = [2027, 2026, 2025, 2024, 2023];
    const rows = (
      await Promise.all(
        seasons.map((season) =>
          apiGet("fixtures", { team: teamId, season, timezone: TIMEZONE }).catch(() => [] as any[]),
        ),
      )
    ).flat();

    const seen = new Set<number>();
    const matches = rows
      .filter(isQualificationCompetition)
      .filter((row) => {
        const id = row?.fixture?.id;
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map((row) => mapQualificationFixture(row, teamId))
      .sort((a, b) => {
        const da = a.date ? new Date(a.date).getTime() : Number.MAX_SAFE_INTEGER;
        const db = b.date ? new Date(b.date).getTime() : Number.MAX_SAFE_INTEGER;
        return da - db;
      });

    if (matches.length === 0) {
      return {
        team,
        available: false,
        method: "unknown",
        source: "none",
        title: "طريق التأهل",
        subtitle: "لم نجد مباريات التصفيات لهذا المنتخب في المصادر المتاحة حاليًا",
        stats: qualificationStats([]),
        timeline: [
          {
            id: "no-data",
            kind: "note",
            date: null,
            title: "لا توجد بيانات تصفيات مؤكدة",
            subtitle: "ستظهر الرحلة هنا عند توفرها من الاشتراكات التاريخية",
            competition: null,
            round: null,
            opponent: null,
            isHome: null,
            venue: null,
            goals: { for: null, against: null },
            result: null,
            status: null,
          },
        ],
        updatedAt: new Date().toISOString(),
      };
    }

    return {
      team,
      available: true,
      method: "qualifiers",
      source: "api-football",
      title: "طريق التأهل",
      subtitle: "مباريات المنتخب في التصفيات المؤهلة من البيانات التاريخية",
      stats: qualificationStats(matches),
      timeline: matches,
      updatedAt: new Date().toISOString(),
    };
  });
}

// ───────────────────── ملف اللاعب الغني ─────────────────────

const PLAYER_CARD_TTL = 60 * 60 * 1000;

const TROPHY_PLACE_AR: Record<string, string> = {
  Winner: "بطل",
  "2nd Place": "وصيف",
  "3rd Place": "المركز الثالث",
};

const TRANSFER_TYPE_AR: Record<string, string> = {
  Transfer: "انتقال",
  Loan: "إعارة",
  "Free Transfer": "انتقال حر",
  "N/A": "انتقال",
};

const parseMetric = (value: unknown): number | null => {
  const n = parseInt(String(value ?? "").replace(/\D/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

function localizeGenericCountry(name: string | null | undefined): string {
  const map: Record<string, string> = {
    "Saudi Arabia": "السعودية",
    Australia: "أستراليا",
    Japan: "اليابان",
    "South Korea": "كوريا الجنوبية",
    Iran: "إيران",
    Qatar: "قطر",
    Iraq: "العراق",
    Kuwait: "الكويت",
    Oman: "عُمان",
    Jordan: "الأردن",
    Palestine: "فلسطين",
    Bahrain: "البحرين",
    "United Arab Emirates": "الإمارات",
    China: "الصين",
    Indonesia: "إندونيسيا",
    Thailand: "تايلاند",
    Vietnam: "فيتنام",
    Syria: "سوريا",
    Yemen: "اليمن",
  };
  return map[name ?? ""] ?? name ?? "";
}

function localizePlayerCompetition(name: string | null | undefined): string {
  const map: Record<string, string> = {
    "AFC Asian Cup": "كأس آسيا",
    "Asian Cup": "كأس آسيا",
    "World Cup - Qualification Asia": "التصفيات الآسيوية",
    "Asian Cup - Qualification": "تصفيات كأس آسيا",
    "Saudi League": "الدوري السعودي",
    "King's Cup": "كأس الملك",
  };
  return map[name ?? ""] ?? name ?? "";
}

export async function getAcPlayerCard(playerId: number): Promise<AcPlayerCard | null> {
  return withSWR(`ac:player:${playerId}`, PLAYER_CARD_TTL, PLAYER_CARD_TTL * 2, async () => {
    const [profileRows, careerRows, trophyRows, statsRows, injuryRows, transferRows] = await Promise.all([
      apiGet("players/profiles", { player: playerId }),
      apiGet("players/teams", { player: playerId }).catch(() => [] as any[]),
      apiGet("trophies", { player: playerId }).catch(() => [] as any[]),
      apiGet("players", { id: playerId, season: SEASON, league: LEAGUE_ID }).catch(() => [] as any[]),
      apiGet("injuries", { player: playerId, season: SEASON }).catch(() => [] as any[]),
      apiGet("transfers", { player: playerId }).catch(() => [] as any[]),
    ]);

    const p = profileRows[0]?.player;
    if (!p?.id) return null;

    const officialFull = [p.firstname, p.lastname].filter(Boolean).join(" ").trim();
    const rawTransferEvents = (transferRows[0]?.transfers ?? []) as any[];
    const tr = await resolveNames([
      p.name,
      officialFull,
      p.birth?.place,
      ...careerRows.map((row: any) => row.team?.name),
      ...rawTransferEvents.flatMap((x: any) => [x?.teams?.in?.name, x?.teams?.out?.name]),
    ]);

    const career: AcPlayerCareerStop[] = careerRows
      .map((row: any): AcPlayerCareerStop => {
        const teamId = row.team?.id ?? 0;
        return {
          teamId,
          team: localizeAcTeam(teamId, localizeTeamName(teamId, tr(row.team?.name))),
          logo: row.team?.logo ?? "",
          seasons: ((row.seasons ?? []) as number[]).filter((s) => Number.isFinite(s)).sort((a, b) => a - b),
        };
      })
      .filter((stop: AcPlayerCareerStop) => stop.team)
      .sort(
        (a: AcPlayerCareerStop, b: AcPlayerCareerStop) =>
          (b.seasons[b.seasons.length - 1] ?? 0) - (a.seasons[a.seasons.length - 1] ?? 0),
      );

    const currentCareer = career[0] ?? null;
    const currentTeam = currentCareer
      ? { id: currentCareer.teamId, name: currentCareer.team, nameEn: currentCareer.team, logo: currentCareer.logo }
      : null;

    const seenTrophies = new Set<string>();
    const trophies: AcPlayerTrophy[] = trophyRows
      .filter((row: any) => row?.league && row?.season)
      .filter((row: any) => {
        const key = `${row.league}|${row.country}|${row.season}|${row.place}`;
        if (seenTrophies.has(key)) return false;
        seenTrophies.add(key);
        return true;
      })
      .map((row: any): AcPlayerTrophy => ({
        competition: localizePlayerCompetition(row.league),
        country: localizeGenericCountry(row.country),
        season: String(row.season),
        place: TROPHY_PLACE_AR[row.place] ?? row.place ?? "",
        winner: row.place === "Winner",
      }))
      .sort((a: AcPlayerTrophy, b: AcPlayerTrophy) => b.season.localeCompare(a.season))
      .slice(0, 12);

    const transfers: AcPlayerTransfer[] = rawTransferEvents
      .map((row: any): AcPlayerTransfer => ({
        date: row?.date ?? null,
        type: TRANSFER_TYPE_AR[row?.type] ?? row?.type ?? "انتقال",
        from: row?.teams?.out?.id ? mapTeam(row.teams.out) : row?.teams?.out?.name ? { id: 0, name: tr(row.teams.out.name), nameEn: row.teams.out.name, logo: row.teams.out.logo ?? "" } : null,
        to: row?.teams?.in?.id ? mapTeam(row.teams.in) : row?.teams?.in?.name ? { id: 0, name: tr(row.teams.in.name), nameEn: row.teams.in.name, logo: row.teams.in.logo ?? "" } : null,
      }))
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
      .slice(0, 8);

    const st = statsRows[0]?.statistics?.[0];
    const matches = st?.games?.appearences ?? 0;
    const stats: AcPlayerTournamentStats | null =
      st && matches > 0
        ? {
            matches,
            lineups: st.games?.lineups ?? 0,
            minutes: st.games?.minutes ?? 0,
            rating: Number.isFinite(parseFloat(st.games?.rating ?? "")) ? parseFloat(st.games.rating) : null,
            goals: st.goals?.total ?? 0,
            assists: st.goals?.assists ?? 0,
            shots: st.shots?.total ?? 0,
            shotsOn: st.shots?.on ?? 0,
            passes: st.passes?.total ?? 0,
            keyPasses: st.passes?.key ?? 0,
            tackles: st.tackles?.total ?? 0,
            yellow: st.cards?.yellow ?? 0,
            red: (st.cards?.red ?? 0) + (st.cards?.yellowred ?? 0),
            saves: st.goals?.saves ?? 0,
            conceded: st.goals?.conceded ?? 0,
            penaltiesScored: st.penalty?.scored ?? 0,
            penaltiesMissed: st.penalty?.missed ?? 0,
          }
        : null;

    const displayName = tr(p.name);
    const translatedFull = officialFull ? tr(officialFull) : "";
    const injuryReason: string | null = injuryRows[0]?.player?.reason ?? null;

    // قيمة السوق (TheSports): جسر المنتخب → قائمة TheSports → مطابقة اسم/رقم →
    // آخر نقطة في player/market/list. أفضل جهد — أي غياب يبقيها غير متاحة.
    const market = await getAcPlayerMarket(
      st?.team?.id ?? 0,
      p.name ?? officialFull,
      p.number ?? null,
    ).catch(() => ({ available: false, value: null, currency: "€", source: "thesports" as const, history: [] }));

    return {
      id: p.id,
      name: displayName,
      fullName: translatedFull && translatedFull !== displayName ? translatedFull : null,
      photo: p.photo ?? "",
      nationality: localizeGenericCountry(p.nationality),
      position: AC_POSITION_AR[p.position] ?? p.position ?? "",
      positionEn: p.position ?? "",
      number: p.number ?? null,
      age: p.age ?? null,
      birthDate: p.birth?.date ?? null,
      birthPlace: [tr(p.birth?.place), localizeGenericCountry(p.birth?.country)].filter(Boolean).join("، ") || null,
      height: parseMetric(p.height),
      weight: parseMetric(p.weight),
      currentTeam,
      career,
      trophies,
      transfers,
      stats,
      injury: injuryReason ? { reason: injuryReason } : null,
      market,
      sources: { apiFootball: true, theSports: market.available },
    };
  });
}

// ───────────────────── تفاصيل المباراة + الأحداث ─────────────────────

export interface AcMatchEvent {
  minute: number;
  extraMinute: number | null;
  teamId: number;
  type: string;
  label: string;
  detail: string;
  player: string;
  playerEn: string;
  playerId: number | null;
  assist: string | null;
  assistEn: string | null;
  assistId: number | null;
}

export interface AcLineupPlayer {
  id: number;
  name: string;
  nameEn: string;
  number: number | null;
  position: string | null;
  grid: string | null;
}

export interface AcLineup {
  teamId: number;
  teamName: string;
  formation: string | null;
  coach: string;
  startXI: AcLineupPlayer[];
  substitutes: AcLineupPlayer[];
}

export interface AcStatistic {
  key: string;
  label: string;
  home: string;
  away: string;
}

export interface AcPlayerRating {
  id: number;
  name: string;
  nameEn: string;
  photo: string;
  teamId: number;
  number: number | null;
  position: string;
  rating: number;
  minutes: number;
  goals: number;
  assists: number;
  captain: boolean;
}

export interface AcPrediction {
  home: number;
  draw: number;
  away: number;
}

export interface AcMatchDetail {
  fixture: AcFixture;
  events: AcMatchEvent[];
  lineups: AcLineup[];
  statistics: AcStatistic[];
  ratings: AcPlayerRating[];
  manOfTheMatch: AcPlayerRating | null;
  prediction: AcPrediction | null;
  headToHead: AcFixture[];
  /** قنوات بثّ المباراة حول العالم (TheSports) — [] إن تعذّر الجسر */
  tv: AcTvChannel[];
  /** زخم المباراة بالدقيقة (يغذّي تبويبَي الزخم والضغط) — null قبل انطلاقها */
  trend: AcTrend | null;
}

export interface AcTvChannel {
  name: string;
  country: string | null;
  logo: string | null;
}

/** مخطط زخم المباراة (TheSports match/trend): نقاط {دقيقة، قيمة −100..100}، موجب = ضغط المضيف. */
export interface AcTrend {
  per: number;
  points: { minute: number; value: number }[];
}

const TS_EVENT_LABEL: Record<TsEvent["type"], string> = {
  goal: "هدف",
  penalty_goal: "هدف من ركلة جزاء",
  own_goal: "هدف عكسي",
  yellow: "بطاقة صفراء",
  red: "بطاقة حمراء",
  yellow_red: "بطاقة حمراء بعد إنذار ثانٍ",
  sub: "تبديل",
  penalty_missed: "ركلة جزاء مهدرة",
  var: "مراجعة تقنية الفيديو",
  injury_time: "وقت بدل ضائع",
  other: "حدث",
};

const TS_STAT_META: Array<[keyof TsLiveStats, string]> = [
  ["possession", "الاستحواذ"],
  ["shotsOnTarget", "تسديدات على المرمى"],
  ["shotsOffTarget", "تسديدات خارج المرمى"],
  ["attacks", "الهجمات"],
  ["dangerousAttacks", "الهجمات الخطرة"],
  ["corners", "الركنيات"],
  ["yellow", "البطاقات الصفراء"],
  ["red", "البطاقات الحمراء"],
];

function mapTsStatsToAc(stats: TsLiveStats): AcStatistic[] {
  const rows: AcStatistic[] = [];
  for (const [key, label] of TS_STAT_META) {
    const values = stats[key];
    if (!values) continue;
    const suffix = key === "possession" ? "%" : "";
    rows.push({
      key: `ts:${key}`,
      label,
      home: `${values[0]}${suffix}`,
      away: `${values[1]}${suffix}`,
    });
  }
  return rows;
}

async function mapTsEventsToAc(events: TsEvent[], fixture: AcFixture): Promise<AcMatchEvent[]> {
  const rawNames: (string | null | undefined)[] = [];
  for (const event of events) {
    rawNames.push(event.player, event.assist, event.inPlayer, event.outPlayer);
  }
  const translateName = await resolveNames(rawNames);
  const nameById = await resolveTsNames(
    TS_I18N_TYPE.player,
    events.map((event) => event.playerId),
  );
  return events
    .filter((event) => event.type !== "other")
    .map((event): AcMatchEvent => {
      const isSub = event.type === "sub";
      const primaryEn = isSub ? event.inPlayer ?? event.player ?? "" : event.player ?? "";
      const secondaryEn = isSub ? event.outPlayer : event.assist;
      const numericPlayerId = Number(event.playerId);
      return {
        minute: event.minute,
        extraMinute: null,
        teamId:
          event.team === "home"
            ? fixture.home.id
            : event.team === "away"
              ? fixture.away.id
              : 0,
        type: event.type,
        label: TS_EVENT_LABEL[event.type],
        detail: event.varResult != null ? `VAR:${event.varResult}` : "",
        player: nameById(event.playerId) ?? translateName(primaryEn),
        playerEn: primaryEn,
        playerId: Number.isFinite(numericPlayerId) ? numericPlayerId : null,
        assist: secondaryEn ? translateName(secondaryEn) : null,
        assistEn: secondaryEn ?? null,
        assistId: null,
      };
    });
}

/** تركيب لقطة TheSports الحية فوق تفاصيل API-Football من دون إفساد fallback. */
async function overlayAcLiveDetail(detail: AcMatchDetail): Promise<AcMatchDetail> {
  const fixture = await overlayAcLiveScore(detail.fixture);
  if (!fixture.status.live || !AC_TS_COMPETITION_ID) return { ...detail, fixture };
  try {
    const live = await getTheSportsMatchLive(
      detail.fixture.id,
      detail.fixture.timestamp,
      AC_TS_COMPETITION_ID,
    );
    if (!live || !live.live) return { ...detail, fixture };
    const events = live.events.length
      ? await mapTsEventsToAc(live.events, fixture)
      : detail.events;
    const statistics = live.stats ? mapTsStatsToAc(live.stats) : detail.statistics;
    return {
      ...detail,
      fixture,
      events: events.length ? events : detail.events,
      statistics: statistics.length ? statistics : detail.statistics,
    };
  } catch {
    return { ...detail, fixture };
  }
}

/** سجل المواجهات المباشرة بين منتخبين (أحدث 10 منتهية). */
export async function getAcHeadToHead(teamA: number, teamB: number): Promise<AcFixture[]> {
  const key = [teamA, teamB].sort((a, b) => a - b).join("-");
  return withSWR(`ac:h2h:${key}`, H2H_TTL, H2H_TTL * 2, async () => {
    const rows = await apiGet("fixtures/headtohead", { h2h: `${teamA}-${teamB}`, timezone: TIMEZONE });
    return rows
      .map(mapFixture)
      .filter((f) => f.status.finished)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10);
  });
}

/** التوقّع الداخلي (نموذج Elo) لمباراة لم تنته — من تقييمات المنتخبين وفورمتهما. */
async function buildAcPrediction(fixture: AcFixture): Promise<AcPrediction | null> {
  if (fixture.status.finished) return null;
  if (!fixture.home.id || !fixture.away.id) return null;
  try {
    const standings = await getAcStandings();
    const rowOf = (id: number): AcStandingRow | null =>
      standings.flatMap((g) => g.rows).find((r) => r.team.id === id) ?? null;
    const probs = computeMatchProbabilities({
      homeId: fixture.home.id,
      awayId: fixture.away.id,
      homeRow: rowOf(fixture.home.id),
      awayRow: rowOf(fixture.away.id),
    });
    return toWholePercents(probs);
  } catch {
    return null;
  }
}

/**
 * تفاصيل المباراة (نداء `fixtures?id=` واحد): الأحداث + التشكيلات + الإحصاءات +
 * تقييمات اللاعبين، مع سجل المواجهات وتوقّع داخلي للمباريات القادمة. كاش متكيّف:
 * الحيّة 20ث، قُبيل الانطلاق دقيقة، غيرها 5 دقائق.
 */
export async function getAcMatchDetail(fixtureId: number): Promise<AcMatchDetail | null> {
  const known = (await getAcFixtures().catch(() => [] as AcFixture[])).find((f) => f.id === fixtureId);
  let ttl = MATCH_DETAIL_TTL;
  if (known?.status.live) {
    ttl = MATCH_DETAIL_LIVE_TTL;
  } else if (known && !known.status.finished) {
    const msToKickoff = new Date(known.date).getTime() - Date.now();
    if (msToKickoff < PREKICKOFF_WINDOW_MS) ttl = MATCH_DETAIL_PREKICKOFF_TTL;
  }

  const detail = await withSWR(`ac:match:${fixtureId}`, ttl, ttl * 2, async () => {
    const rows = await apiGet("fixtures", { id: fixtureId, timezone: TIMEZONE });
    const item = rows[0];
    if (!item) return null;

    // اجمع أسماء كل اللاعبين (أحداث + تشكيلات + تقييمات) وعرّبها دفعة واحدة.
    const rawNames: (string | null | undefined)[] = [];
    for (const ev of item.events ?? []) rawNames.push(ev?.player?.name, ev?.assist?.name);
    for (const lineup of item.lineups ?? []) {
      for (const p of lineup.startXI ?? []) rawNames.push(p?.player?.name);
      for (const p of lineup.substitutes ?? []) rawNames.push(p?.player?.name);
    }
    for (const teamBlock of item.players ?? []) {
      for (const p of teamBlock.players ?? []) rawNames.push(p?.player?.name);
    }
    const tr = await resolveNames(rawNames);

    const events: AcMatchEvent[] = (item.events ?? []).map((ev: any): AcMatchEvent => {
      const localized = localizeEvent(ev?.type ?? "", ev?.detail ?? "");
      // تبديل: API-Football يعكس الحقلين — ev.player = الخارج، ev.assist = الداخل.
      // نعرض الداخل عنوانًا والخارج «بديلًا عن». الأهداف/البطاقات تبقى كما هي.
      const isSubst = String(ev?.type ?? "").toLowerCase() === "subst";
      const inSide = isSubst ? ev?.assist : ev?.player;
      const outSide = isSubst ? ev?.player : ev?.assist;
      const hasSecondary = !!(outSide?.name || outSide?.id);
      return {
        minute: ev?.time?.elapsed ?? 0,
        extraMinute: ev?.time?.extra ?? null,
        teamId: ev?.team?.id ?? 0,
        type: localized.type,
        label: localized.label,
        detail: ev?.detail ?? "",
        player: tr(inSide?.name),
        playerEn: inSide?.name ?? "",
        playerId: inSide?.id ?? null,
        assist: hasSecondary ? tr(outSide?.name) || null : null,
        assistEn: hasSecondary ? outSide?.name ?? null : null,
        assistId: outSide?.id ?? null,
      };
    });

    const lineups: AcLineup[] = (item.lineups ?? []).map((lineup: any): AcLineup => {
      const mapPlayer = (p: any): AcLineupPlayer => ({
        id: p?.player?.id ?? 0,
        name: tr(p?.player?.name),
        nameEn: p?.player?.name ?? "",
        number: p?.player?.number ?? null,
        position: p?.player?.pos ?? null,
        grid: p?.player?.grid ?? null,
      });
      return {
        teamId: lineup?.team?.id ?? 0,
        teamName: localizeAcTeam(lineup?.team?.id, localizeTeamName(lineup?.team?.id, lineup?.team?.name ?? "")),
        formation: lineup?.formation ?? null,
        coach: lineup?.coach?.name ?? "",
        startXI: (lineup.startXI ?? []).map(mapPlayer),
        substitutes: (lineup.substitutes ?? []).map(mapPlayer),
      };
    });

    const ratings: AcPlayerRating[] = (item.players ?? [])
      .flatMap((teamBlock: any) =>
        (teamBlock.players ?? []).map((p: any): AcPlayerRating | null => {
          const st = p?.statistics?.[0] ?? {};
          const rating = parseFloat(st.games?.rating ?? "");
          if (!Number.isFinite(rating)) return null;
          return {
            id: p?.player?.id ?? 0,
            name: tr(p?.player?.name),
            nameEn: p?.player?.name ?? "",
            photo: p?.player?.photo ?? "",
            teamId: teamBlock?.team?.id ?? 0,
            number: st.games?.number ?? null,
            position: AC_POSITION_AR[st.games?.position] ?? st.games?.position ?? "",
            rating,
            minutes: st.games?.minutes ?? 0,
            goals: st.goals?.total ?? 0,
            assists: st.goals?.assists ?? 0,
            captain: st.games?.captain ?? false,
          };
        }),
      )
      .filter(Boolean)
      .sort((a: AcPlayerRating, b: AcPlayerRating) => b.rating - a.rating);

    const homeStats = (item.statistics ?? []).find((s: any) => s.team?.id === item.teams?.home?.id);
    const awayStats = (item.statistics ?? []).find((s: any) => s.team?.id === item.teams?.away?.id);
    const statistics: AcStatistic[] = (homeStats?.statistics ?? [])
      .filter((stat: any) => AC_STAT_AR[stat.type])
      .map((stat: any): AcStatistic => {
        const awayValue = (awayStats?.statistics ?? []).find((s: any) => s.type === stat.type)?.value;
        return {
          key: stat.type,
          label: AC_STAT_AR[stat.type],
          home: String(stat.value ?? 0),
          away: String(awayValue ?? 0),
        };
      });

    return { fixture: mapFixture(item), events, lineups, statistics, ratings };
  });

  if (!detail) return null;

  const prediction = await buildAcPrediction(detail.fixture);

  let headToHead: AcFixture[] = [];
  try {
    headToHead = await getAcHeadToHead(detail.fixture.home.id, detail.fixture.away.id);
  } catch (error) {
    console.warn(`[AsianCup] h2h failed for fixture ${fixtureId}:`, error);
  }

  const manOfTheMatch =
    detail.fixture.status.finished && detail.ratings.length > 0 ? detail.ratings[0] : null;

  const tv = await getAcMatchTv(detail.fixture).catch(() => [] as AcTvChannel[]);
  const trend = await getAcMatchTrend(detail.fixture).catch(() => null);

  return overlayAcLiveDetail({ ...detail, prediction, headToHead, manOfTheMatch, tv, trend });
}

// ---------- حقائق البطولة (TheSports competition/additional) ----------
// نظير حقائق المونديال: حامل اللقب + الأكثر تتويجًا + المضيف. أسماء المنتخبات
// تُحل عربيًا عبر i18n المزوّد (name_aa). أفضل جهد: أي غياب → available:false.

export interface AcCompetitionFacts {
  available: boolean;
  titleHolder: { name: string; titles: number | null } | null;
  mostTitles: { names: string[]; titles: number | null } | null;
  host: string | null;
}

// حقل host لدى المزوّد قديم/خاطئ (تحقّق إنتاجي 2026-07-03: يرجع "China"
// لنسخة 2027 السعودية) — المضيف ثابت معلوم، والهب يعرضه في AcHostShowcase.
const AC_HOST_2027 = "السعودية";

export async function getAcFacts(): Promise<AcCompetitionFacts> {
  const empty: AcCompetitionFacts = {
    available: false,
    titleHolder: null,
    mostTitles: null,
    host: null,
  };
  const extra = await getTsCompetitionExtra(TS_COMPETITION_IDS["asian-cup"]).catch(() => null);
  if (!extra) return empty;

  const nameOf = await resolveTsNames(TS_I18N_TYPE.team, [
    extra.titleHolderTeamId,
    ...extra.mostTitlesTeamIds,
  ]);
  const holderName = nameOf(extra.titleHolderTeamId);
  const mostNames = extra.mostTitlesTeamIds
    .map((id) => nameOf(id))
    .filter((n): n is string => !!n);

  return {
    available: Boolean(holderName || mostNames.length),
    titleHolder: holderName ? { name: holderName, titles: extra.titleHolderCount } : null,
    mostTitles: mostNames.length ? { names: mostNames, titles: extra.mostTitlesCount } : null,
    host: AC_HOST_2027,
  };
}

// ---------- جسر TheSports لكأس آسيا (فيفا/البث/الإحصاء الموسمي/قيمة السوق) ----------
// نفس منهج جسر المونديال: نطابق مباريات API-Football بمباريات TheSports عبر وقت
// البداية (تطابق فريد ±دقيقتين فقط) ونصوّت عبر كل المباريات فيغلب المعرّف الصحيح.
// أفضل جهد بالكامل: غياب TheSports → خرائط فارغة → لا إثراء ولا عطل.

const AC_BRIDGE_TTL = 6 * 60 * 60 * 1000;
let acTeamBridge: { at: number; map: Map<number, string> } | null = null;

export async function getAcTeamBridge(): Promise<Map<number, string>> {
  if (acTeamBridge && Date.now() - acTeamBridge.at < AC_BRIDGE_TTL) return acTeamBridge.map;
  const map = new Map<number, string>();
  try {
    const comp = await getTsCompetitionExtra(TS_COMPETITION_IDS["asian-cup"]);
    const [fixtures, pairs] = await Promise.all([
      getAcFixtures(),
      getTsCompetitionMatchPairs(TS_COMPETITION_IDS["asian-cup"], comp?.curSeasonId ?? null),
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
        if (hits.length !== 1) continue; // تطابق فريد فقط → اتجاه آمن
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
    console.warn("[AsianCup] TheSports team bridge failed:", error);
  }
  acTeamBridge = { at: Date.now(), map };
  return map;
}

/** تصنيف فيفا لمنتخب عبر الجسر — null إن تعذّر. */
export async function getAcTeamFifaRank(teamId: number): Promise<AcFifaRank | null> {
  const [bridge, ranking] = await Promise.all([getAcTeamBridge(), getTsFifaRanking()]);
  const uuid = bridge.get(teamId);
  if (!uuid) return null;
  const r = ranking.get(uuid);
  if (!r) return null;
  return { rank: r.rank, points: r.points ?? null, change: r.change ?? null };
}

/** قيمة سوقية / تأسيس / حجم القائمة عبر جسر TheSports. */
export async function getAcTeamExtra(teamId: number): Promise<AcTeamExtra | null> {
  const bridge = await getAcTeamBridge();
  const uuid = bridge.get(teamId);
  if (!uuid) return null;
  const x = await getTsTeamExtra(uuid);
  if (!x) return null;
  if (x.marketValue == null && x.foundation == null && x.totalPlayers == null) return null;
  return {
    marketValue: x.marketValue,
    marketValueCurrency: x.marketValueCurrency,
    foundation: x.foundation,
    squadSize: x.totalPlayers,
  };
}

/** المدرّب (صورة/خطة) وملعب المنتخب من TheSports عبر الجسر. */
export async function getAcTeamBasics(
  teamId: number,
): Promise<{ coach: AcCoachInfo | null; venue: AcVenueInfo | null }> {
  const empty = { coach: null, venue: null };
  const bridge = await getAcTeamBridge();
  const uuid = bridge.get(teamId);
  if (!uuid) return empty;
  const x = await getTsTeamExtra(uuid).catch(() => null);
  if (!x) return empty;

  const [tsCoach, tsVenue] = await Promise.all([
    x.coachId ? getTsCoach(x.coachId).catch(() => null) : Promise.resolve(null),
    x.venueId ? getTsVenue(x.venueId).catch(() => null) : Promise.resolve(null),
  ]);

  const countryIds = [tsCoach?.countryId, tsVenue?.countryId].filter((c): c is string => !!c);
  const countryAr =
    countryIds.length > 0
      ? await resolveTsNames(TS_I18N_TYPE.country, countryIds).catch(
          () => (_: string | null | undefined) => null as string | null,
        )
      : (_: string | null | undefined) => null as string | null;

  const coach: AcCoachInfo | null = tsCoach
    ? {
        name: tsCoach.name,
        photo: tsCoach.logo,
        formation: tsCoach.preferredFormation,
        age: tsCoach.age,
        nationality: countryAr(tsCoach.countryId),
      }
    : null;

  const venue: AcVenueInfo | null = tsVenue
    ? {
        name: tsVenue.name,
        capacity: tsVenue.capacity,
        city: tsVenue.city,
        country: countryAr(tsVenue.countryId) ?? tsVenue.country,
      }
    : null;

  return { coach, venue };
}

const AC_INJURY_PART_AR: Record<string, string> = {
  knee: "الركبة",
  ankle: "الكاحل",
  hamstring: "أوتار الفخذ",
  thigh: "الفخذ",
  calf: "ربلة الساق",
  foot: "القدم",
  groin: "أعلى الفخذ",
  shoulder: "الكتف",
  back: "الظهر",
  head: "الرأس",
  hip: "الورك",
  muscle: "العضلة",
};

const AC_INJURY_WHOLE_AR: Record<string, string> = {
  suspended: "إيقاف",
  suspension: "إيقاف",
  ban: "إيقاف",
  illness: "مرض",
  ill: "مرض",
  knock: "رضّة",
  fatigue: "إجهاد",
  "unknown injury": "إصابة غير محدّدة",
  "knee injury": "إصابة في الركبة",
};

function translateAcInjuryReason(en: string | null): string | null {
  if (!en) return null;
  const low = en.toLowerCase().trim();
  if (AC_INJURY_WHOLE_AR[low]) return AC_INJURY_WHOLE_AR[low];
  const m = low.match(/^(.+?)\s+(injury|problem|strain|knock|surgery)$/);
  if (m && AC_INJURY_PART_AR[m[1]]) return `إصابة في ${AC_INJURY_PART_AR[m[1]]}`;
  if (AC_INJURY_PART_AR[low]) return `إصابة في ${AC_INJURY_PART_AR[low]}`;
  return en;
}

function fmtAcInjuryDate(ts: number | null): string | null {
  if (!ts || ts <= 0) return null;
  try {
    return new Intl.DateTimeFormat("ar", {
      day: "numeric",
      month: "long",
      calendar: "gregory",
      timeZone: "Asia/Riyadh",
    }).format(new Date(ts * 1000));
  } catch {
    return null;
  }
}

/** إصابات/غيابات منتخب عبر جسر TheSports — [] إن تعذّر. */
export async function getAcTeamInjuries(teamId: number): Promise<AcInjury[]> {
  const bridge = await getAcTeamBridge();
  const uuid = bridge.get(teamId);
  if (!uuid) return [];
  const raw = await getTsTeamInjuries(uuid).catch(() => []);
  if (raw.length === 0) return [];

  const noop = (_: string | null | undefined): string | null => null;
  const nameOf = await resolveTsNames(
    TS_I18N_TYPE.player,
    raw.map((r) => r.playerId),
  ).catch(() => noop);

  const out: AcInjury[] = [];
  for (const r of raw) {
    const player = r.playerId ? nameOf(r.playerId) : null;
    if (!player) continue;
    out.push({
      player,
      reason: translateAcInjuryReason(r.reason),
      status: null,
      until: fmtAcInjuryDate(r.endTime),
    });
  }
  return out;
}

// كاش مشترك لإحصاء كل المنتخبات للموسم — نداء واحد يخدم كل صفحات المنتخبات.
const AC_SEASON_STATS_TTL = 30 * 60 * 1000;
let acSeasonTeamStats: { at: number; map: Map<string, Record<string, number>> } | null = null;

async function getAcSeasonTeamStatsMap(): Promise<Map<string, Record<string, number>>> {
  if (acSeasonTeamStats && Date.now() - acSeasonTeamStats.at < AC_SEASON_STATS_TTL)
    return acSeasonTeamStats.map;
  const map = new Map<string, Record<string, number>>();
  try {
    const comp = await getTsCompetitionExtra(TS_COMPETITION_IDS["asian-cup"]);
    const season = comp?.curSeasonId ?? null;
    if (season) {
      const rows = await getTsSeasonTeamStats(season);
      for (const r of rows) map.set(r.teamId, r.values);
    }
  } catch {
    /* أفضل جهد */
  }
  acSeasonTeamStats = { at: Date.now(), map };
  return map;
}

/** إحصاء المنتخب في البطولة عبر الجسر — مُعرَّب ومُنتقى للعرض المباشر. */
export async function getAcTeamSeasonStats(teamId: number): Promise<AcTeamSeasonStats> {
  const empty: AcTeamSeasonStats = { available: false, matches: 0, items: [] };
  try {
    const bridge = await getAcTeamBridge();
    const uuid = bridge.get(teamId);
    if (!uuid) return empty;
    const map = await getAcSeasonTeamStatsMap();
    const v = map.get(uuid);
    if (!v) return empty;

    const items: AcSeasonStatItem[] = [];
    const push = (label: string, val: number | null | undefined, percent = false) => {
      if (val == null) return;
      items.push({ label, value: val, percent });
    };
    push("الأهداف المسجَّلة", v.goals);
    push("الأهداف المستقبَلة", v.goals_against);
    push("متوسّط الاستحواذ", v.ball_possession, true);
    push("التسديدات", v.shots);
    push("التسديدات على المرمى", v.shots_on_target);
    push("الركنيات", v.corner_kicks);
    push("البطاقات الصفراء", v.yellow_cards);
    push("البطاقات الحمراء", v.red_cards);
    return { available: items.length > 0, matches: v.matches ?? 0, items };
  } catch {
    return empty;
  }
}

// جسر معرّف المباراة (fixtureId ↔ TheSports uuid) عبر زوج فريقَي المباراة.
const acMatchIdBridge = new Map<number, string>();

async function getAcMatchTsId(fx: AcFixture): Promise<string | null> {
  const cached = acMatchIdBridge.get(fx.id);
  if (cached) return cached;
  if (!fx.home.id || !fx.away.id) return null;
  const [bridge, comp] = await Promise.all([
    getAcTeamBridge(),
    getTsCompetitionExtra(TS_COMPETITION_IDS["asian-cup"]),
  ]);
  const homeUuid = bridge.get(fx.home.id);
  const awayUuid = bridge.get(fx.away.id);
  if (!homeUuid || !awayUuid) return null;
  const pairs = await getTsCompetitionMatchPairs(
    TS_COMPETITION_IDS["asian-cup"],
    comp?.curSeasonId ?? null,
  );
  const matches = pairs.filter(
    (p) =>
      p.id &&
      ((p.home === homeUuid && p.away === awayUuid) || (p.home === awayUuid && p.away === homeUuid)),
  );
  if (matches.length === 0) return null;
  const best = matches.reduce((a, b) =>
    Math.abs(b.time - fx.timestamp) < Math.abs(a.time - fx.timestamp) ? b : a,
  );
  if (!best.id) return null;
  acMatchIdBridge.set(fx.id, best.id);
  return best.id;
}

/** قنوات بثّ المباراة عبر جسر المباراة — [] إن تعذّر. */
export async function getAcMatchTv(fx: AcFixture): Promise<AcTvChannel[]> {
  const uuid = await getAcMatchTsId(fx).catch(() => null);
  if (!uuid) return [];
  const channels = await getTsMatchTv(uuid).catch(() => []);
  return channels.map((c) => ({ name: c.name, country: c.country, logo: c.logo }));
}

// ---------- قيمة السوق للاعب (TheSports player/market/list) ----------

function acNormNameKey(name: string): string {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function getAcPlayerMarket(
  teamId: number,
  enName: string,
  number: number | null,
): Promise<AcPlayerMarket> {
  const empty: AcPlayerMarket = { available: false, value: null, currency: "€", source: "thesports", history: [] };
  if (!teamId || !enName) return empty;

  const bridge = await getAcTeamBridge();
  const tsTeam = bridge.get(teamId);
  if (!tsTeam) return empty;

  const tsSquad = await getTsTeamSquad(tsTeam);
  if (tsSquad.length === 0) return empty;

  // مطابقة: الاسم الكامل → رقم القميص → اسم العائلة الفريد.
  const key = acNormNameKey(enName);
  let hit = tsSquad.find((sq) => acNormNameKey(sq.name) === key) ?? null;
  if (!hit && number != null) {
    hit = tsSquad.find((sq) => sq.shirtNumber === number) ?? null;
  }
  if (!hit) {
    const last = key.split(" ").pop() ?? "";
    const sameLast = last
      ? tsSquad.filter((sq) => acNormNameKey(sq.name).split(" ").pop() === last)
      : [];
    if (sameLast.length === 1) hit = sameLast[0];
  }
  if (!hit) return empty;

  const history = await getTsPlayerMarketHistory(hit.id).catch(() => []);
  if (history.length === 0) return empty;
  const lastPoint = history[history.length - 1];
  return {
    available: lastPoint.value > 0,
    value: lastPoint.value > 0 ? lastPoint.value : null,
    currency: lastPoint.currency || "€",
    source: "thesports",
    history: history.slice(-12).map((h) => ({ time: h.time, value: h.value })),
  };
}

/**
 * قائمة المنتخبات مُثراة بتصنيف فيفا عبر الجسر — أفضل جهد: غياب TheSports →
 * القائمة كما هي. لا نلوّث كاش getAcTeams لأن الترتيب يتغيّر شهريًّا.
 */
export async function getAcTeamsRanked(): Promise<AcTeam[]> {
  const teams = await getAcTeams();
  try {
    const [bridge, ranking] = await Promise.all([getAcTeamBridge(), getTsFifaRanking()]);
    if (ranking.size === 0) return teams;
    return teams.map((t) => {
      const uuid = bridge.get(t.id);
      const r = uuid ? ranking.get(uuid) : null;
      return r ? { ...t, fifaRank: r.rank } : t;
    });
  } catch {
    return teams;
  }
}

/** زخم المباراة عبر جسر TheSports — null قبل الانطلاق أو عند تعذّر الجسر. */
export async function getAcMatchTrend(fx: AcFixture): Promise<AcTrend | null> {
  if (!fx.status.live && !fx.status.finished) return null;
  const ttl = fx.status.live ? 45 * 1000 : 30 * 60 * 1000;
  return withSWR(`ac:trend:${fx.id}`, ttl, ttl * 2, async () => {
    const uuid = await getAcMatchTsId(fx).catch(() => null);
    if (!uuid) return null;
    const trend = await getTsMatchTrend(uuid).catch(() => null);
    if (!trend || trend.values.length === 0) return null;
    return { per: trend.perMinutes, points: trend.values };
  });
}

// ---------- الزخم والضغط اللحظيان (TheSports trend عبر الجسر — نظير المونديال) ----------

export interface AcMomentumPoint {
  label: string;
  minute: number;
  home: number;
  away: number; // سالبة لتُرسم أسفل الصفر
  net: number;
}

export interface AcMomentum {
  available: boolean;
  live: boolean;
  possession: { home: number; away: number } | null;
  points: AcMomentumPoint[];
}

export interface AcPressure {
  available: boolean;
  live: boolean;
  latest: { side: "home" | "away" | "even"; value: number } | null;
  points: AcMomentumPoint[];
}

function acTrendToPoints(values: { minute: number; value: number }[]): AcMomentumPoint[] {
  return values.map((v) => ({
    label: `${v.minute}'`,
    minute: v.minute,
    home: v.value > 0 ? v.value : 0,
    away: v.value < 0 ? v.value : 0,
    net: v.value,
  }));
}

/** زخم المباراة بالدقيقة + الاستحواذ اللحظي — null قبل الانطلاق أو عند تعذّر الجسر. */
export async function getAcMomentum(fixtureId: number): Promise<AcMomentum | null> {
  const fixtures = await getAcFixtures().catch(() => [] as AcFixture[]);
  const fx = fixtures.find((f) => f.id === fixtureId);
  if (!fx || (!fx.status.live && !fx.status.finished)) return null;
  const uuid = await getAcMatchTsId(fx).catch(() => null);
  if (!uuid) return null;

  const [trend, sides] = await Promise.all([
    getTsMatchTrend(uuid),
    getTsMatchTeamStats(uuid).catch(() => []),
  ]);
  if (!trend || trend.values.length === 0) return null;

  // الاستحواذ من إحصاء الفريقين (إقران المضيف عبر الجسر)
  let possession: { home: number; away: number } | null = null;
  if (sides.length >= 2) {
    const bridge = await getAcTeamBridge();
    const homeUuid = bridge.get(fx.home.id);
    let home = sides[0];
    let away = sides[1];
    if (homeUuid && sides[1].teamId === homeUuid) {
      home = sides[1];
      away = sides[0];
    }
    const h = home.values.ball_possession;
    const a = away.values.ball_possession;
    if (h != null || a != null) {
      possession = {
        home: h ?? (a != null ? 100 - a : 0),
        away: a ?? (h != null ? 100 - h : 0),
      };
    }
  }

  return { available: true, live: fx.status.live, possession, points: acTrendToPoints(trend.values) };
}

/** مؤشّر الضغط اللحظي — الجهة المسيطرة الآن + المنحنى الكامل. */
export async function getAcPressure(fixtureId: number): Promise<AcPressure | null> {
  const fixtures = await getAcFixtures().catch(() => [] as AcFixture[]);
  const fx = fixtures.find((f) => f.id === fixtureId);
  if (!fx || (!fx.status.live && !fx.status.finished)) return null;
  const uuid = await getAcMatchTsId(fx).catch(() => null);
  if (!uuid) return null;

  const trend = await getTsMatchTrend(uuid);
  if (!trend || trend.values.length === 0) return null;
  const last = trend.values[trend.values.length - 1].value;
  const latest: AcPressure["latest"] = {
    side: last > 0 ? "home" : last < 0 ? "away" : "even",
    value: Math.abs(last),
  };
  return { available: true, live: fx.status.live, latest, points: acTrendToPoints(trend.values) };
}

// ───────────────────────── مركز المباراة — طبقات إضافية (parity مونديال) ─────────────────────────

export interface AcPlayerStatLine {
  name: string;
  rating: number | null;
  starter: boolean;
  minutes: number;
  goals: number;
  assists: number;
  yellow: number;
  red: number;
}

export interface AcMatchPlayerStats {
  available: boolean;
  home: { team: AcTeam; players: AcPlayerStatLine[] } | null;
  away: { team: AcTeam; players: AcPlayerStatLine[] } | null;
}

/** إحصاءات لاعبي المباراة من TheSports — available:false إن تعذّر الجسر. */
export async function getAcMatchPlayerStats(fixtureId: number): Promise<AcMatchPlayerStats> {
  const empty: AcMatchPlayerStats = { available: false, home: null, away: null };
  const fixtures = await getAcFixtures().catch(() => [] as AcFixture[]);
  const fx = fixtures.find((f) => f.id === fixtureId);
  if (!fx) return empty;
  const uuid = await getAcMatchTsId(fx).catch(() => null);
  if (!uuid) return empty;

  const [rows, lineup] = await Promise.all([
    getTsMatchPlayerStats(uuid).catch(() => []),
    getTsLineup(uuid).catch(() => null as TsLineup | null),
  ]);
  const played = rows.filter((r) => r.minutes > 0 || (r.rating ?? 0) > 0);
  if (played.length === 0) return empty;

  const nameOf = await resolveTsNames(TS_I18N_TYPE.player, played.map((r) => r.playerId));
  const lineupName = new Map<string, string>();
  if (lineup) {
    for (const p of [...lineup.home, ...lineup.away]) {
      const nm = p.nameAr || p.name;
      if (p.id && nm) lineupName.set(String(p.id), nm);
    }
  }

  const bridge = await getAcTeamBridge();
  const homeUuid = bridge.get(fx.home.id) ?? null;
  const awayUuid = bridge.get(fx.away.id) ?? null;

  const toLine = (r: (typeof played)[number]): AcPlayerStatLine | null => {
    const name = nameOf(r.playerId) || lineupName.get(r.playerId) || "";
    if (!name) return null;
    return {
      name,
      rating: (r.rating ?? 0) > 0 ? r.rating : null,
      starter: r.starter,
      minutes: r.minutes,
      goals: r.values.goals ?? 0,
      assists: r.values.assists ?? 0,
      yellow: r.values.yellow_cards ?? 0,
      red: r.values.red_cards ?? 0,
    };
  };

  const sortLines = (a: AcPlayerStatLine, b: AcPlayerStatLine) =>
    (b.rating ?? -1) - (a.rating ?? -1) || b.minutes - a.minutes;

  const homePlayers: AcPlayerStatLine[] = [];
  const awayPlayers: AcPlayerStatLine[] = [];
  const distinctTeams = Array.from(new Set(played.map((r) => r.teamId).filter(Boolean)));
  for (const r of played) {
    const line = toLine(r);
    if (!line) continue;
    let side: "home" | "away";
    if (homeUuid && r.teamId === homeUuid) side = "home";
    else if (awayUuid && r.teamId === awayUuid) side = "away";
    else side = r.teamId === distinctTeams[0] ? "home" : "away";
    (side === "home" ? homePlayers : awayPlayers).push(line);
  }
  homePlayers.sort(sortLines);
  awayPlayers.sort(sortLines);
  if (homePlayers.length === 0 && awayPlayers.length === 0) return empty;

  return {
    available: true,
    home: homePlayers.length ? { team: fx.home, players: homePlayers } : null,
    away: awayPlayers.length ? { team: fx.away, players: awayPlayers } : null,
  };
}

/** قنوات البث لمباراة بالمعرّف. */
export async function getAcMatchTvById(fixtureId: number): Promise<{ available: boolean; channels: AcTvChannel[] }> {
  const fixtures = await getAcFixtures().catch(() => [] as AcFixture[]);
  const fx = fixtures.find((f) => f.id === fixtureId);
  if (!fx) return { available: false, channels: [] };
  const channels = await getAcMatchTv(fx).catch(() => [] as AcTvChannel[]);
  return { available: channels.length > 0, channels };
}

/** التعليق المباشر عبر SportMonks — available:false إن لم يُفعَّل أو تعذّر الجسر. */
export async function getAcCommentary(fixtureId: number, opts: { directSmId?: number } = {}) {
  if (!isSportmonksConfigured()) {
    return { configured: false, available: false, live: false, items: [] as Awaited<ReturnType<typeof getCommentary>>["items"] };
  }
  const data = await getCommentary(fixtureId, opts);
  return { configured: true, ...data };
}

/** معطيات المباراة (طقس/غيابات/إحصاء أعمق) عبر SportMonks. */
export async function getAcMatchFacts(fixtureId: number, opts: { directSmId?: number } = {}) {
  if (!isSportmonksConfigured()) {
    return {
      configured: false,
      available: false,
      statistics: [],
      weather: null,
      absentees: [],
    };
  }
  const data = await getMatchFacts(fixtureId, opts);
  if (data.absentees.length > 0) {
    const tr = await resolveNames(data.absentees.map((a) => a.name)).catch(() => null);
    if (tr) data.absentees = data.absentees.map((a) => ({ ...a, name: tr(a.name) || a.name }));
  }
  return { configured: true, ...data };
}

/** أهداف متوقعة xG عبر SportMonks. */
export async function getAcXg(fixtureId: number, opts: { directSmId?: number } = {}) {
  if (!isSportmonksConfigured()) {
    return { configured: false, available: false };
  }
  const data = await getXg(fixtureId, opts);
  return { configured: true, ...data };
}

export interface AcPlayerFormMatch {
  opponent: string;
  date: string | null;
  goals: number;
  assists: number;
  minutes: number;
  rating: number | null;
  xg: number | null;
}

export interface AcPlayerForm {
  available: boolean;
  configured?: boolean;
  matches: AcPlayerFormMatch[];
}

/** فورمة اللاعب عبر SportMonks (جسر الاسم + الميلاد). */
export async function getAcPlayerForm(playerId: number): Promise<AcPlayerForm> {
  if (!isSportmonksConfigured()) {
    return { configured: false, available: false, matches: [] };
  }
  try {
    const rows = await apiGet("players/profiles", { player: playerId });
    const p = rows[0]?.player;
    if (!p?.id) return { available: false, matches: [] };
    const data = await getPlayerForm({
      firstname: p.firstname ?? null,
      lastname: p.lastname ?? null,
      dob: p.birth?.date ?? null,
    });
    return {
      configured: true,
      available: data.available,
      matches: (data.matches ?? []).map((m) => ({
        opponent: m.opponent ?? "",
        date: m.date ?? null,
        goals: m.goals ?? 0,
        assists: 0,
        minutes: 0,
        rating: m.rating ?? null,
        xg: m.xg ?? null,
      })),
    };
  } catch {
    return { configured: true, available: false, matches: [] };
  }
}

export interface AcPlayerMarketPublic {
  available: boolean;
  marketValue: number | null;
  currency: string;
  history: { time: number; value: number }[];
}

/** القيمة السوقية للاعب (TheSports) — شكل موحّد مع مونديال. */
export async function getAcPlayerMarketPublic(playerId: number): Promise<AcPlayerMarketPublic> {
  const empty: AcPlayerMarketPublic = { available: false, marketValue: null, currency: "€", history: [] };
  if (!isTheSportsConfigured()) return empty;
  try {
    const [profileRows, statsRows] = await Promise.all([
      apiGet("players/profiles", { player: playerId }),
      apiGet("players", { id: playerId, season: SEASON, league: LEAGUE_ID }).catch(() => [] as any[]),
    ]);
    const p = profileRows[0]?.player;
    if (!p?.id) return empty;
    const enName = [p.firstname, p.lastname].filter(Boolean).join(" ").trim() || p.name || "";
    const st = statsRows[0]?.statistics?.[0];
    const teamId = st?.team?.id ?? 0;
    const number = st?.games?.number ?? p.number ?? null;
    const market = await getAcPlayerMarket(teamId, enName, number);
    if (!market.available && (!market.history || market.history.length === 0)) return empty;
    return {
      available: market.available || (market.value != null && market.value > 0),
      marketValue: market.value,
      currency: market.currency || "€",
      history: market.history ?? [],
    };
  } catch {
    return empty;
  }
}

/** توقّع نتيجة المباراة من التقييمات الداخلية — إن وُجدت في تفاصيل المباراة. */
export async function getAcForecast(fixtureId: number): Promise<{
  available: boolean;
  home: number;
  draw: number;
  away: number;
} | null> {
  const detail = await getAcMatchDetail(fixtureId).catch(() => null);
  if (!detail?.prediction) return { available: false, home: 0, draw: 0, away: 0 };
  return { available: true, ...detail.prediction };
}
