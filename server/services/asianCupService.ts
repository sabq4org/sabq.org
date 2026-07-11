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
  getTsCompetitionExtra,
  resolveTsNames,
} from "./theSportsService";
import { apiFootballGet } from "./apiFootballClient";

const LEAGUE_ID = 7; // AFC Asian Cup
const SEASON = 2027; // كأس آسيا السعودية 2027
const TIMEZONE = "Asia/Riyadh";

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
  logo: string;
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
    logo: raw?.logo ?? "",
  };
}

function statusOf(code: string, elapsed: number | null) {
  return {
    code,
    label: WC_STATUS_AR[code] ?? code,
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
  return withSWR("ac:fixtures", FIXTURES_TTL, FIXTURES_TTL * 3, async () => {
    const raw = await apiGet("fixtures", { league: LEAGUE_ID, season: SEASON });
    return raw.map(mapFixture).sort((a, b) => a.timestamp - b.timestamp);
  });
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
      const team = teamMap.get(id) ?? { id, name: String(id), logo: "" };
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
  return withSWR("ac:overview", OVERVIEW_TTL, OVERVIEW_TTL * 3, async () => {
    const [fixtures, standings] = await Promise.all([getAcFixtures(), getAcStandings()]);
    const teams = await getAcTeams();

    const sorted = [...fixtures].sort((a, b) => a.timestamp - b.timestamp);
    const startsAt = sorted[0]?.date ?? null;
    const endsAt = sorted[sorted.length - 1]?.date ?? null;
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

// ───────────────────────── الهدّافون ─────────────────────────

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

/** قائمة الهدّافين (أعلى 10) — أسماء اللاعبين بنقل صوتي عربي عبر resolveNames. */
export async function getAcTopScorers(): Promise<AcScorer[]> {
  return withSWR("ac:scorers", SCORERS_TTL, SCORERS_TTL * 2, async () => {
    const rows = await apiGet("players/topscorers", { league: LEAGUE_ID, season: SEASON });
    const top = rows.slice(0, 10);
    const tr = await resolveNames(top.map((row: any) => row?.player?.name));
    return top.map((row: any, index: number): AcScorer => {
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
  });
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
  const [fixtures, squad, standings, teams] = await Promise.all([
    getAcFixtures(),
    getAcSquad(teamId).catch(() => null),
    getAcStandings().catch(() => [] as AcGroup[]),
    getAcTeams().catch(() => [] as AcTeam[]),
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

  let coach: string | null = null;
  try {
    coach = await getAcCoach(teamId);
  } catch (error) {
    console.warn(`[AsianCup] coach ${teamId} failed:`, error);
  }

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
      ? { id: currentCareer.teamId, name: currentCareer.team, logo: currentCareer.logo }
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
        from: row?.teams?.out?.id ? mapTeam(row.teams.out) : row?.teams?.out?.name ? { id: 0, name: tr(row.teams.out.name), logo: row.teams.out.logo ?? "" } : null,
        to: row?.teams?.in?.id ? mapTeam(row.teams.in) : row?.teams?.in?.name ? { id: 0, name: tr(row.teams.in.name), logo: row.teams.in.logo ?? "" } : null,
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
      market: { available: false, value: null, currency: "€", source: "thesports", history: [] },
      sources: { apiFootball: true, theSports: false },
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

  return { ...detail, prediction, headToHead, manOfTheMatch };
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
