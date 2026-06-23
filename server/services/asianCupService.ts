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

/** ترتيب المجموعات — قد يكون فارغًا حتى تُسحب القرعة النهائية (أفضل جهد). */
export async function getAcStandings(): Promise<AcGroup[]> {
  return withSWR("ac:standings", STANDINGS_TTL, STANDINGS_TTL * 3, async () => {
    const raw = await apiGet("standings", { league: LEAGUE_ID, season: SEASON });
    const blocks: any[] = raw?.[0]?.league?.standings ?? [];
    const groups: AcGroup[] = [];
    for (const block of blocks) {
      const rows: AcStandingRow[] = (Array.isArray(block) ? block : []).map((r: any) => ({
        rank: r?.rank ?? 0,
        team: mapTeam(r?.team),
        played: r?.all?.played ?? 0,
        win: r?.all?.win ?? 0,
        draw: r?.all?.draw ?? 0,
        lose: r?.all?.lose ?? 0,
        goalsFor: r?.all?.goals?.for ?? 0,
        goalsAgainst: r?.all?.goals?.against ?? 0,
        goalsDiff: r?.goalsDiff ?? 0,
        points: r?.points ?? 0,
      }));
      if (rows.length) groups.push({ name: rows[0] ? (block[0]?.group ?? "") : "", rows });
    }
    return groups;
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
