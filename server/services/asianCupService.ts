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

const API_BASE = "https://v3.football.api-sports.io";
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
  const apiKey = (process.env.APIFOOTBALL_KEY || "").trim();
  if (!apiKey) throw new Error("APIFOOTBALL_KEY is not set");

  const url = new URL(`${API_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const response = await fetch(url, {
    headers: { "x-apisports-key": apiKey },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`[AsianCup] API-Football HTTP ${response.status} for ${path}`);

  const data: any = await response.json();
  const errors = data?.errors;
  if (errors && !Array.isArray(errors) && Object.keys(errors).length > 0) {
    throw new Error(`[AsianCup] API-Football error for ${path}: ${JSON.stringify(errors)}`);
  }
  return Array.isArray(data?.response) ? data.response : [];
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
 * مباريات «Group Stage»). الترتيب يُحسب من النتائج المنتهية فقط (قبل البطولة:
 * أصفار = تكوين المجموعات فحسب). مجموعة المضيف (السعودية) أولًا.
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
    return { name: `المجموعة ${GROUP_ORDINALS[idx] ?? String(idx + 1)}`, rows };
  });
}

/** مجموعات النهائيات وترتيبها (محسوبة من الجدول) — فارغة قبل اعتماد القرعة. */
export async function getAcStandings(): Promise<AcGroup[]> {
  return withSWR("ac:standings", STANDINGS_TTL, STANDINGS_TTL * 3, async () => {
    const [fixtures, teams] = await Promise.all([getAcFixtures(), getAcTeams()]);
    return buildGroupsFromFixtures(fixtures, teams);
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
  fixtures: AcFixture[];
  squad: AcSquadPlayer[];
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
    fixtures: teamFixtures,
    squad: squad?.players ?? [],
  };
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
      const hasAssist = !!(ev?.assist?.name || ev?.assist?.id);
      return {
        minute: ev?.time?.elapsed ?? 0,
        extraMinute: ev?.time?.extra ?? null,
        teamId: ev?.team?.id ?? 0,
        type: localized.type,
        label: localized.label,
        detail: ev?.detail ?? "",
        player: tr(ev?.player?.name),
        playerEn: ev?.player?.name ?? "",
        playerId: ev?.player?.id ?? null,
        assist: hasAssist ? tr(ev?.assist?.name) || null : null,
        assistEn: hasAssist ? ev?.assist?.name ?? null : null,
        assistId: ev?.assist?.id ?? null,
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
