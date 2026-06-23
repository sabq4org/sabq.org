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
  localizeRound,
  localizeTeamName,
  localizeVenue,
} from "./worldCupNames";
import { resolveNames } from "./worldCupNameTranslator";

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
  return {
    id: raw?.id ?? 0,
    name: localizeTeamName(raw?.id, raw?.name ?? ""),
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
  const venue = localizeVenue(raw?.fixture?.venue?.name, raw?.fixture?.venue?.city);
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
    const tr = await resolveNames(raw.map((x: any) => x?.team?.name ?? ""));
    const teams: AcTeam[] = raw.map((x: any): AcTeam => {
      const id = x?.team?.id ?? 0;
      const en = x?.team?.name ?? "";
      return { id, name: localizeTeamName(id, tr(en) || en), logo: x?.team?.logo ?? "" };
    });
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
