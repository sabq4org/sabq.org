/**
 * خدمة كأس آسيا 2027 (السعودية) — عميل API-Football (v3.football.api-sports.io).
 *
 * النمط مطابق لـ worldCupService.ts لكن مستقل عنه (لا يشاركه كاشًا ولا ثوابت):
 *   - LEAGUE_ID = 7 (كأس آسيا للرجال) و SEASON = 2027 (السعودية).
 *   - كل الاستجابات تُعرَّب هنا قبل وصولها للواجهة (إعادة استخدام قواميس
 *     worldCupNames لأنها عامة: حالات/جولات/مجموعات/أسماء).
 *   - كل نقطة بيانات خلف كاش SWR.
 *   - التوقيت يُطلب من المزود مباشرةً بتوقيت الرياض.
 *
 * ⚠️ حالة النسخة 2027 (تُحقِّق منها يونيو 2026): الموسم مسجّل `current:true` لكن
 * المزود لم يرفع بعد fixtures/standings/scorers (البطولة في يناير 2027). لذا كل
 * نقطة بيانات ترجع [] / null بأمان بدل رمي خطأ، والواجهة تُظهر حالة فارغة أنيقة
 * («ستُعلن المباريات قريبًا»). عند رفع البيانات قرب البطولة يمتلئ التطبيق تلقائيًا
 * بلا أي تعديل كود — لأن withSWR يُعيد المحاولة بانتهاء الكاش.
 *
 * لا يستورد db (ملتزم بـ ADR-001) — كل الوصول عبر هذه الخدمة فقط.
 */
import { withSWR, CACHE_TTL } from "../memoryCache";
import {
  WC_FINISHED_STATUSES,
  WC_LIVE_STATUSES,
  WC_STATUS_AR,
  localizeGroup,
  localizeRound,
  localizeTeamName,
  localizeVenue,
} from "./worldCupNames";

const API_BASE = "https://v3.football.api-sports.io";

// كأس آسيا للرجال = LEAGUE_ID 7 (مُتحقَّق من /leagues?search=asian%20cup).
// النسخة 2027 تستضيفها السعودية (يناير 2027). الموسم مسجّل لكن بلا مباريات بعد.
const LEAGUE_ID = 7;
const SEASON = 2027;
const TIMEZONE = "Asia/Riyadh";

// إيقاعات تحديث — مطابقة للمونديال. البيانات الحية تتغيّر بالثواني، والبطولات
// طويلة الأمد فالكاش الطويل مقبول. قبل انطلاق 2027 ترجع النقاط [] فارغة بسرعة
// (لا تكلفة مزوّد للاستجابة الفارغة)، فالكاش القصير يكفي.
const LIVE_TTL = 15 * 1000;
const FIXTURES_TTL = 30 * 1000;

// معلومات البطولة الثابتة — البطولة 2027 معلنة (المضيف/التواريخ) لكن المزوّد
// لا يرفعها ضمن /standings أو /leagues. نعرّفها يدويًّا هنا لأنها معروفة رسميًّا،
// فتظهر في الـ overview فورًا قبل رفع أي مباريات.
export interface AcTournamentInfo {
  name: string;
  nameEn: string;
  host: string;
  hostFlag: string | null;
  startDate: string; // ISO
  endDate: string; // ISO
  teams: number;
  venues: { name: string; city: string }[];
}

const TOURNAMENT_INFO: AcTournamentInfo = {
  name: "كأس آسيا 2027",
  nameEn: "AFC Asian Cup 2027",
  host: "السعودية",
  hostFlag: null,
  // التواريخ الرسمية المعلنة من الـ AFC / المزوّد (season.start/end لعام 2027).
  startDate: "2027-01-07",
  endDate: "2027-02-05",
  teams: 24,
  // الملاعب ستُملأ عند الإعلان الرسمي. فارغة الآن تُظهر حالة «ستُعلن قريبًا».
  venues: [],
};

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

  if (!response.ok) {
    throw new Error(`[AsianCup] API-Football HTTP ${response.status} for ${path}`);
  }

  const data: any = await response.json();
  const errors = data?.errors;
  if (errors && !Array.isArray(errors) && Object.keys(errors).length > 0) {
    throw new Error(`[AsianCup] API-Football error for ${path}: ${JSON.stringify(errors)}`);
  }
  return Array.isArray(data?.response) ? data.response : [];
}

// ---------- DTOs المُعرَّبة التي تستهلكها الواجهة ----------
// مطابقة لـ Wc* في worldCupService حتى يسهل port شاشات iOS لاحقًا، لكن بأسماء
// Ac* مستقلة (لا اشتراك كاش مع المونديال).

export interface AcTeam {
  id: number;
  name: string;
  logo: string;
  winner: boolean | null;
}

export interface AcFixture {
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
  home: AcTeam;
  away: AcTeam;
  goals: { home: number | null; away: number | null };
  penalties: { home: number | null; away: number | null } | null;
}

function localizeTeam(raw: any): AcTeam {
  return {
    id: raw?.id ?? 0,
    name: localizeTeamName(raw?.id, raw?.name ?? ""),
    logo: raw?.logo ?? "",
    winner: raw?.winner ?? null,
  };
}

function localizeFixture(item: any): AcFixture {
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

export async function getFixtures(
  opts: { forceFresh?: boolean } = {}
): Promise<AcFixture[]> {
  return withSWR(
    "ac:fixtures",
    FIXTURES_TTL,
    FIXTURES_TTL * 2,
    async () => {
      // قبل رفع المزوّد لجدول 2027، /fixtures?season=2027 يرجع [] فارغة — حالة
      // طبيعية، لا خطأ. نبقّي الاستجابة خلف كاش قصير لئلّا نكرّر الطلب البارد.
      const rows = await apiGet("fixtures", {
        league: LEAGUE_ID,
        season: SEASON,
        timezone: TIMEZONE,
      });
      return rows.map(localizeFixture).sort((a, b) => a.timestamp - b.timestamp);
    },
    opts.forceFresh ?? false
  );
}

export async function getLiveFixtures(): Promise<AcFixture[]> {
  return withSWR("ac:live", LIVE_TTL, LIVE_TTL * 2, async () => {
    const rows = await apiGet("fixtures", {
      league: LEAGUE_ID,
      season: SEASON,
      live: "all",
      timezone: TIMEZONE,
    });
    return rows.map(localizeFixture).sort((a, b) => a.timestamp - b.timestamp);
  });
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
  form: string | null;
}

export interface AcGroup {
  group: string;
  groupEn: string;
  rows: AcStandingRow[];
}

export async function getStandings(): Promise<AcGroup[]> {
  return withSWR("ac:standings", CACHE_TTL.MEDIUM, CACHE_TTL.MEDIUM * 2, async () => {
    const rows = await apiGet("standings", { league: LEAGUE_ID, season: SEASON });
    const tables: any[][] = rows[0]?.league?.standings ?? [];
    // نفس منطق المونديال: المزود قد يسمي المجموعة "Group A" أو "Group Stage - Group A".
    // نوحد بالحرف ونُزيل التكرار حسب معرّف المنتخب (كاش بارد قبل البطولة = [] فارغة).
    const groupLetter = (group: string): string | null =>
      (group ?? "").match(/Group\s+([A-H])\s*$/i)?.[1]?.toUpperCase() ?? null;

    const byLetter = new Map<string, Map<number, any>>();
    for (const table of tables) {
      const letter = groupLetter(table[0]?.group ?? "");
      if (!letter) continue;
      let teams = byLetter.get(letter);
      if (!teams) {
        teams = new Map();
        byLetter.set(letter, teams);
      }
      for (const row of table) {
        const id = row.team?.id ?? 0;
        if (!id) continue;
        const prev = teams.get(id);
        if (!prev || (row.all?.played ?? 0) > (prev.all?.played ?? 0)) teams.set(id, row);
      }
    }

    return [...byLetter.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([letter, teams]) => ({
        group: localizeGroup(`Group ${letter}`),
        groupEn: `Group ${letter}`,
        rows: [...teams.values()]
          .sort(
            (a, b) =>
              (a.rank ?? 99) - (b.rank ?? 99) ||
              (b.points ?? 0) - (a.points ?? 0) ||
              (b.goalsDiff ?? 0) - (a.goalsDiff ?? 0)
          )
          .map((row: any): AcStandingRow => ({
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

export interface AcMatchOfDay {
  fixture: AcFixture;
  prediction: null; // يُملأ لاحقًا في PR-A2 (مركز المباراة + توقعات المزوّد)
}

export interface AcOverview {
  info: AcTournamentInfo;
  live: AcFixture[];
  today: AcFixture[];
  matchOfTheDay: AcMatchOfDay | null;
  fixturesCount: number;
  groupsCount: number;
  updatedAt: string;
}

/**
 * النظرة العامة — الطبقة الموحّدة للواجهة الرئيسية. في نسخة 2027 (قبل رفع
 * المزوّد للمباريات) ترجع: معلومات البطولة الثابتة + قوائم فارغة + matchOfDay=null.
 * الواجهة تُظهر قسم البطولة + حالة «ستُعلن المباريات قريبًا». عند رفع البيانات
 * يمتلئ كل شيء تلقائيًا.
 */
export async function getOverview(): Promise<AcOverview> {
  const [fixtures, live] = await Promise.all([
    getFixtures().catch(() => [] as AcFixture[]),
    getLiveFixtures().catch(() => [] as AcFixture[]),
  ]);

  // "اليوم" بتوقيت الرياض — تواريخ المزود تصل بإزاحة +03:00
  const riyadhToday = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const today = fixtures.filter((f) => (f.date ?? "").slice(0, 10) === riyadhToday);

  const motdPool = live.length > 0 ? live : today.filter((f) => !f.status.finished);
  const upcoming = fixtures.filter((f) => !f.status.finished && !f.status.live);
  const nextDayKey = (upcoming[0]?.date ?? "").slice(0, 10);
  const nextDayMatches = upcoming.filter((f) => (f.date ?? "").slice(0, 10) === nextDayKey);
  const fallbackPool = motdPool.length > 0 ? motdPool : nextDayMatches;
  // الأقرب زمنيًّا أولًا (نفس منطق المونديال)
  const motdFixture = [...fallbackPool].sort((a, b) => a.timestamp - b.timestamp)[0] ?? null;

  let groupsCount = 0;
  try {
    const groups = await getStandings();
    groupsCount = groups.length;
  } catch {
    // المجموعات غير متوفّرة بعد — لا يكسر الـ overview.
  }

  return {
    info: TOURNAMENT_INFO,
    live,
    today,
    matchOfTheDay: motdFixture ? { fixture: motdFixture, prediction: null } : null,
    fixturesCount: fixtures.length,
    groupsCount,
    updatedAt: new Date().toISOString(),
  };
}

export function getTournamentInfo(): AcTournamentInfo {
  return TOURNAMENT_INFO;
}
