/**
 * خدمة دوري روشن السعودي للمحترفين — عميل API-Football (v3.football.api-sports.io).
 *
 * قسم رياضي مخفي قيد التطوير: لا يعمل إلا عند SAUDI_LEAGUE_ENABLED=true،
 * ويستخدم نفس مفتاح APIFOOTBALL_KEY وخطة Mega القائمة (الدوري السعودي
 * مغطّى بالكامل في هذه الخطة). لا يمسّ تغطية المونديال إطلاقًا.
 *
 * كل ما يصل للواجهة معرَّب، وكل نقطة بيانات خلف كاش SWR ليخدم آلاف الزوار
 * من طلب واحد للمزود.
 */
import { withSWR, CACHE_TTL } from "../memoryCache";
import pLimit from "p-limit";
import { aiManager, AI_MODELS } from "../ai-manager";
import {
  WC_FINISHED_STATUSES,
  WC_LIVE_STATUSES,
  WC_STATUS_AR,
  localizeEvent,
} from "./worldCupNames";
import { resolveNames } from "./worldCupNameTranslator";
import { getPlayerForm as smGetPlayerForm, isSportmonksConfigured } from "./sportmonksService";
import {
  getTheSportsFastScore,
  getTheSportsMatchLive,
  getTsCompetitionExtra,
  getTsCompetitionId,
  getTsCompetitionMatchPairs,
  getTsCompetitionPlayerMarket,
  getTsMatchTeamStats,
  getTsMatchTv,
  getTsPlayerMarketHistory,
  getTsTeamInjuries,
  getTsTeamSquad,
  resolveTsMatchId,
  resolveTsNames,
  TS_I18N_TYPE,
  TS_VAR_RESULT_AR,
  type TsEvent,
  type TsLiveStats,
  type TsTeamStatSide,
} from "./theSportsService";
import {
  SPL_POSITION_AR,
  SPL_POSITION_ORDER,
  SPL_STAT_AR,
  SPL_STAT_ORDER,
  SPL_TROPHY_PLACE_AR,
  localizeSplCoachName,
  localizeSplCompetition,
  localizeSplCountry,
  localizeSplInjuryType,
  localizeSplInjuryReason,
  localizeSplPlayerName,
  localizeSplRound,
  localizeSplTeamName,
  localizeSplTransferType,
} from "./saudiLeagueNames";

const API_BASE = "https://v3.football.api-sports.io";
const TIMEZONE = "Asia/Riyadh";

const LIVE_TTL = 15 * 1000;
// لوحتا «مباريات اليوم» (/sports/matches) و«البث المباشر» (/sports/live) تستهلكان
// نداءً واحدًا مجمّعًا (live=all) يُحدَّث للجميع عبر withSWR (نداء واحد لكل نافذة
// مهما كثُر الزوّار). نخفض إيقاعه إلى 8ث ليطابق استطلاع العميل التكيّفي (#488)
// فلا تنتظر النتيجة/كشف «جارية الآن» نافذة 15ث — مهمّ للبطولات غير المُدرَجة في
// طبقة TheSports اللحظية (5ث) إذ تأتي نتيجتها من القاعدة (API-Football) فقط.
const LIVE_BOARD_TTL = 8 * 1000;
const FIXTURES_TTL = 60 * 1000;
const TODAY_TTL = 60 * 1000; // قائمة مباريات اليوم — تتغيّر ببطء (الجاري يُحدَّث بكاش live)
const MATCH_DETAIL_TTL = 20 * 1000;
const SEASON_TTL = 6 * 60 * 60 * 1000; // الموسم الحالي شبه ثابت
const ROUNDS_TTL = 30 * 60 * 1000; // قائمة الجولات تتغيّر نادرًا
const H2H_TTL = 60 * 60 * 1000; // المواجهات التاريخية شبه ثابتة

/**
 * سجل البطولات السعودية التي يغطّيها القسم، مفلتر على ما يدعمه المزود فعلًا
 * (الأعلام مأخوذة من coverage في /leagues). كأس ولي العهد (827) مستبعد —
 * متوقف منذ 2017. الموسم يُحلّ ديناميكيًا (current) فلا حاجة لتعديل الكود
 * عند انتقال المواسم؛ fallbackSeason احتياط لو فشل الطلب.
 */
export type CompetitionCategory = "saudi" | "gulf" | "arab" | "european" | "world";

export interface SaudiCompetition {
  id: number;
  slug: string;
  name: string;
  type: "league" | "cup";
  hasStandings: boolean;
  hasScorers: boolean;
  hasStats: boolean;
  fallbackSeason: number;
  category: CompetitionCategory;
}

export const SAUDI_COMPETITIONS: SaudiCompetition[] = [
  { id: 307, slug: "pro-league", name: "دوري روشن السعودي", type: "league", hasStandings: true, hasScorers: true, hasStats: true, fallbackSeason: 2025, category: "saudi" },
  { id: 308, slug: "division-1", name: "دوري يلو لأندية الدرجة الأولى", type: "league", hasStandings: true, hasScorers: true, hasStats: false, fallbackSeason: 2025, category: "saudi" },
  { id: 309, slug: "division-2", name: "دوري الدرجة الثانية السعودي", type: "league", hasStandings: true, hasScorers: false, hasStats: false, fallbackSeason: 2025, category: "saudi" },
  { id: 504, slug: "kings-cup", name: "كأس خادم الحرمين الشريفين", type: "cup", hasStandings: false, hasScorers: true, hasStats: false, fallbackSeason: 2027, category: "saudi" },
  { id: 826, slug: "super-cup", name: "كأس السوبر السعودي", type: "cup", hasStandings: false, hasScorers: true, hasStats: false, fallbackSeason: 2026, category: "saudi" },
  { id: 1227, slug: "womens-league", name: "الدوري السعودي الممتاز للسيدات", type: "league", hasStandings: true, hasScorers: false, hasStats: false, fallbackSeason: 2026, category: "saudi" },
  // بطولات قارية/عالمية تشارك فيها الأندية السعودية. الترتيب متعدّد المجموعات
  // (AFC: مجموعتان، كأس العالم للأندية: 8 مجموعات) فيُترك hasStandings=false حتى
  // ندعم عرض الترتيب متعدّد المجموعات لاحقًا — المباريات والهدّافون يعملان الآن.
  // كأس العالم للمنتخبات (id 1) — موسم 2026 (نسخة 48 منتخبًا) بمجموعات متعدّدة،
  // فيُترك hasStandings=false كبقية بطولات المجموعات. المباريات والهدّافون يعملان.
  { id: 1, slug: "world-cup", name: "كأس العالم", type: "cup", hasStandings: false, hasScorers: true, hasStats: false, fallbackSeason: 2026, category: "world" },
  { id: 17, slug: "afc-champions-league", name: "دوري أبطال آسيا للنخبة", type: "cup", hasStandings: false, hasScorers: true, hasStats: false, fallbackSeason: 2025, category: "world" },
  { id: 15, slug: "club-world-cup", name: "كأس العالم للأندية", type: "cup", hasStandings: false, hasScorers: true, hasStats: false, fallbackSeason: 2025, category: "world" },
  // الدوريات الأوروبية الكبرى الخمسة — تغطية كاملة (ترتيب/هدّافون/تشكيلات/أحداث).
  { id: 39, slug: "premier-league", name: "الدوري الإنجليزي", type: "league", hasStandings: true, hasScorers: true, hasStats: true, fallbackSeason: 2025, category: "european" },
  { id: 140, slug: "la-liga", name: "الدوري الإسباني", type: "league", hasStandings: true, hasScorers: true, hasStats: true, fallbackSeason: 2025, category: "european" },
  { id: 135, slug: "serie-a", name: "الدوري الإيطالي", type: "league", hasStandings: true, hasScorers: true, hasStats: true, fallbackSeason: 2025, category: "european" },
  { id: 78, slug: "bundesliga", name: "الدوري الألماني", type: "league", hasStandings: true, hasScorers: true, hasStats: true, fallbackSeason: 2025, category: "european" },
  { id: 61, slug: "ligue-1", name: "الدوري الفرنسي", type: "league", hasStandings: true, hasScorers: true, hasStats: true, fallbackSeason: 2025, category: "european" },
  // كؤوس أوروبا للأندية — مرحلة الدوري الحديثة جدول واحد (36 فريقًا) فيعمل
  // hasStandings مباشرة عبر standings[0]؛ الأدوار الإقصائية تظهر في المباريات.
  { id: 2, slug: "champions-league", name: "دوري أبطال أوروبا", type: "cup", hasStandings: true, hasScorers: true, hasStats: false, fallbackSeason: 2025, category: "european" },
  { id: 3, slug: "europa-league", name: "الدوري الأوروبي", type: "cup", hasStandings: true, hasScorers: true, hasStats: false, fallbackSeason: 2025, category: "european" },
  { id: 848, slug: "conference-league", name: "دوري المؤتمر الأوروبي", type: "cup", hasStandings: true, hasScorers: true, hasStats: false, fallbackSeason: 2025, category: "european" },
  // الدرجات الإسبانية الأدنى من La Liga — تغطية كاملة في API-Football.
  // الدرجة الثانية (Segunda División) دوري واحد بجدول مفرد.
  { id: 141, slug: "segunda-division", name: "الدرجة الثانية الإسبانية", type: "league", hasStandings: true, hasScorers: true, hasStats: true, fallbackSeason: 2025, category: "european" },
  // الدرجة الثالثة (Primera Federación) — اسمها في API-Football "Primera División
  // RFEF" ومقسّمة إلى مجموعتين حيّتين، لكل مجموعة معرّف مستقل وجدول ترتيب مفرد
  // (لا ترتيب متعدّد المجموعات)، فتُضاف كدوريين عاديين. المجموعات 3/4/5
  // (437/438/692) ميتة (عالقة عند موسم 2020) فتُتجاهَل.
  { id: 435, slug: "primera-rfef-1", name: "الدرجة الثالثة الإسبانية - المجموعة 1", type: "league", hasStandings: true, hasScorers: true, hasStats: true, fallbackSeason: 2025, category: "european" },
  { id: 436, slug: "primera-rfef-2", name: "الدرجة الثالثة الإسبانية - المجموعة 2", type: "league", hasStandings: true, hasScorers: true, hasStats: true, fallbackSeason: 2025, category: "european" },
  // دوريات الخليج — أندية معرّبة (قاموس GULF_TEAM_AR). كأس الخليج للمنتخبات
  // «خليجي 27» (id 25) له قسم مخصّص مستقل (gulfCupService + /gulf-cup) يعتمد
  // الجدول الرسمي الثابت حتى يضيف المزوّد موسم 2026؛ نُدرجه هنا للبوابة العامة
  // أيضًا (موسم 2026) فيظهر ضمن فئة الخليج بمجرّد توفّره لدى API-Football.
  { id: 25, slug: "gulf-cup", name: "كأس الخليج العربي (خليجي 27)", type: "cup", hasStandings: false, hasScorers: true, hasStats: false, fallbackSeason: 2026, category: "gulf" },
  { id: 301, slug: "uae-pro-league", name: "دوري أدنوك للمحترفين", type: "league", hasStandings: true, hasScorers: true, hasStats: false, fallbackSeason: 2025, category: "gulf" },
  { id: 305, slug: "qatar-stars-league", name: "دوري نجوم قطر", type: "league", hasStandings: true, hasScorers: true, hasStats: false, fallbackSeason: 2025, category: "gulf" },
  { id: 330, slug: "kuwait-premier-league", name: "الدوري الكويتي الممتاز", type: "league", hasStandings: true, hasScorers: true, hasStats: false, fallbackSeason: 2025, category: "gulf" },
  { id: 417, slug: "bahrain-premier-league", name: "الدوري البحريني الممتاز", type: "league", hasStandings: true, hasScorers: true, hasStats: false, fallbackSeason: 2025, category: "gulf" },
  { id: 406, slug: "oman-pro-league", name: "دوري عُمانتل للمحترفين", type: "league", hasStandings: true, hasScorers: false, hasStats: false, fallbackSeason: 2025, category: "gulf" },
  { id: 1162, slug: "gulf-club-champions", name: "كأس الخليج للأندية الأبطال", type: "cup", hasStandings: false, hasScorers: true, hasStats: false, fallbackSeason: 2025, category: "gulf" },
  // الدوريات العربية — تغطية ترتيب/أحداث في API-Football (إحصاءات اللاعبين
  // متاحة لمصر فقط، فبقيتها hasScorers=false لتجنّب تبويب هدّافين فارغ).
  // أسماء الأندية تظهر بالإنجليزية حتى نضيف قواميس تعريب لاحقًا (fallback آمن).
  { id: 233, slug: "egypt-premier-league", name: "الدوري المصري الممتاز", type: "league", hasStandings: true, hasScorers: true, hasStats: false, fallbackSeason: 2025, category: "arab" },
  { id: 200, slug: "morocco-botola", name: "البطولة الاحترافية المغربية", type: "league", hasStandings: true, hasScorers: false, hasStats: false, fallbackSeason: 2025, category: "arab" },
  { id: 202, slug: "tunisia-ligue-1", name: "الرابطة التونسية المحترفة الأولى", type: "league", hasStandings: true, hasScorers: false, hasStats: false, fallbackSeason: 2025, category: "arab" },
  { id: 186, slug: "algeria-ligue-1", name: "الرابطة الجزائرية المحترفة الأولى", type: "league", hasStandings: true, hasScorers: false, hasStats: false, fallbackSeason: 2025, category: "arab" },
  { id: 542, slug: "iraq-stars-league", name: "دوري نجوم العراق", type: "league", hasStandings: true, hasScorers: false, hasStats: false, fallbackSeason: 2025, category: "arab" },
  { id: 387, slug: "jordan-league", name: "دوري المحترفين الأردني", type: "league", hasStandings: true, hasScorers: false, hasStats: false, fallbackSeason: 2025, category: "arab" },
  { id: 390, slug: "lebanon-premier-league", name: "الدوري اللبناني الممتاز", type: "league", hasStandings: true, hasScorers: false, hasStats: false, fallbackSeason: 2025, category: "arab" },
  { id: 425, slug: "syria-premier-league", name: "الدوري السوري الممتاز", type: "league", hasStandings: true, hasScorers: false, hasStats: false, fallbackSeason: 2025, category: "arab" },
];

export function getCompetition(slug: string): SaudiCompetition | undefined {
  return SAUDI_COMPETITIONS.find((c) => c.slug === slug);
}

export function listCompetitions() {
  return SAUDI_COMPETITIONS.map(({ slug, name, type, hasStandings, hasScorers, hasStats, category }) => ({
    slug,
    name,
    type,
    hasStandings,
    hasScorers,
    hasStats,
    category,
  }));
}

/** الموسم الحالي من المزود (current=true) مخزَّن 6 ساعات؛ يصمد أمام انتقال المواسم تلقائيًا */
async function seasonFor(comp: SaudiCompetition): Promise<number> {
  return withSWR(`spl:season:${comp.id}`, SEASON_TTL, SEASON_TTL * 2, async () => {
    try {
      const rows = await apiGet("leagues", { id: comp.id, current: "true" });
      const seasons: any[] = rows[0]?.seasons ?? [];
      const year = seasons.find((s: any) => s.current)?.year ?? seasons[seasons.length - 1]?.year;
      return typeof year === "number" ? year : comp.fallbackSeason;
    } catch {
      return comp.fallbackSeason;
    }
  });
}

/** هل العلم مرفوع؟ القسم مخفي تمامًا ما لم يُفعَّل صراحةً */
export function isSaudiLeagueEnabled(): boolean {
  return (process.env.SAUDI_LEAGUE_ENABLED || "").trim().toLowerCase() === "true";
}

/** هل المفتاح متاح؟ (منفصل عن العلم حتى نُميّز 404 المخفي عن 503 غير المهيّأ) */
export function isSaudiLeagueConfigured(): boolean {
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
    throw new Error(`[SaudiLeague] API-Football HTTP ${response.status} for ${path}`);
  }

  const data: any = await response.json();
  const errors = data?.errors;
  if (errors && !Array.isArray(errors) && Object.keys(errors).length > 0) {
    throw new Error(`[SaudiLeague] API-Football error for ${path}: ${JSON.stringify(errors)}`);
  }
  // معظم النقاط تعيد response كمصفوفة، لكن بعضها (teams/statistics) يعيد كائنًا
  // واحدًا — نلفّه في مصفوفة حتى يستهلكه المستدعي عبر rows[0] بنفس النمط.
  const resp = data?.response;
  if (Array.isArray(resp)) return resp;
  if (resp && typeof resp === "object") return [resp];
  return [];
}

// ---------- DTOs المُعرَّبة ----------

export interface SplTeam {
  id: number;
  name: string;
  logo: string;
  winner: boolean | null;
}

export interface SplFixture {
  id: number;
  date: string;
  timestamp: number;
  status: {
    code: string;
    label: string;
    elapsed: number | null;
    /** دقائق بدل الضائع المحتسبة (مثل 90+3 ⇒ elapsed=90, extra=3)؛ null إن لم تتوفّر. */
    extra: number | null;
    live: boolean;
    finished: boolean;
  };
  round: string;
  venue: { name: string; city: string };
  home: SplTeam;
  away: SplTeam;
  goals: { home: number | null; away: number | null };
  // نتيجة ركلات الترجيح (أدوار خروج المغلوب) — null ما لم تُحسم بالترجيح.
  penalties?: { home: number | null; away: number | null } | null;
}

function localizeTeam(raw: any): SplTeam {
  return {
    id: raw?.id ?? 0,
    name: localizeSplTeamName(raw?.id, raw?.name ?? ""),
    logo: raw?.logo ?? "",
    winner: raw?.winner ?? null,
  };
}

function localizeFixture(item: any): SplFixture {
  const fx = item.fixture ?? {};
  const statusCode: string = fx.status?.short ?? "TBD";
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
    round: localizeSplRound(item.league?.round ?? ""),
    venue: { name: fx.venue?.name ?? "", city: fx.venue?.city ?? "" },
    home: localizeTeam(item.teams?.home),
    away: localizeTeam(item.teams?.away),
    goals: { home: item.goals?.home ?? null, away: item.goals?.away ?? null },
    penalties:
      item.score?.penalty?.home != null || item.score?.penalty?.away != null
        ? { home: item.score?.penalty?.home ?? null, away: item.score?.penalty?.away ?? null }
        : null,
  };
}

// ---------- المباريات ----------

export async function getFixtures(comp: SaudiCompetition, seasonOverride?: number): Promise<SplFixture[]> {
  const season = seasonOverride ?? await seasonFor(comp);
  return withSWR(`spl:fixtures:${comp.id}:${season}`, FIXTURES_TTL, FIXTURES_TTL * 2, async () => {
    const rows = await apiGet("fixtures", { league: comp.id, season, timezone: TIMEZONE });
    return rows.map(localizeFixture).sort((a, b) => a.timestamp - b.timestamp);
  });
}

export async function getLiveFixtures(comp: SaudiCompetition): Promise<SplFixture[]> {
  const season = await seasonFor(comp);
  return withSWR(`spl:live:${comp.id}`, LIVE_TTL, LIVE_TTL * 2, async () => {
    const rows = await apiGet("fixtures", {
      league: comp.id,
      season,
      live: "all",
      timezone: TIMEZONE,
    });
    return rows.map(localizeFixture).sort((a, b) => a.timestamp - b.timestamp);
  });
}

// ---------- الجولات (متصفّح الجولات) ----------

export interface SplRound {
  key: string; // الخام كما يعيده المزود (للاستعلام): "Regular Season - 5"
  label: string; // المعرّب للعرض: "الجولة 5"
}

/**
 * قائمة جولات البطولة + الجولة الحالية (من fixtures/rounds). تُرجع رؤوسًا خامًّا
 * (للاستعلام) + تسمية معرّبة (للعرض). فارغة لمن لا جولات له (خارج الموسم/كؤوس).
 */
export async function getCompetitionRounds(
  comp: SaudiCompetition,
  seasonOverride?: number,
): Promise<{ rounds: SplRound[]; current: string | null }> {
  const season = seasonOverride ?? await seasonFor(comp);
  return withSWR(`spl:rounds:${comp.id}:${season}`, ROUNDS_TTL, ROUNDS_TTL * 2, async () => {
    const [all, cur] = await Promise.all([
      apiGet("fixtures/rounds", { league: comp.id, season }),
      apiGet("fixtures/rounds", { league: comp.id, season, current: "true" }).catch(() => [] as any[]),
    ]);
    const rounds: SplRound[] = (Array.isArray(all) ? all : [])
      .filter((r: any) => typeof r === "string" && r.trim())
      .map((r: string) => ({ key: r, label: localizeSplRound(r) }));
    const current = Array.isArray(cur) && typeof cur[0] === "string" ? cur[0] : null;
    return { rounds, current };
  });
}

/** مباريات جولة محدّدة (round الخام كما يعود من getCompetitionRounds). */
export async function getFixturesByRound(comp: SaudiCompetition, round: string, seasonOverride?: number): Promise<SplFixture[]> {
  const season = seasonOverride ?? await seasonFor(comp);
  return withSWR(`spl:roundfx:${comp.id}:${season}:${round}`, FIXTURES_TTL, FIXTURES_TTL * 2, async () => {
    const rows = await apiGet("fixtures", { league: comp.id, season, round, timezone: TIMEZONE });
    return rows.map(localizeFixture).sort((a, b) => a.timestamp - b.timestamp);
  });
}

// ---------- لوحة مباشرة شاملة (كل البطولات السعودية) ----------

export interface SplLiveBoardItem extends SplFixture {
  competition: string;
  competitionSlug: string | null;
}

/**
 * كل مباريات الأندية السعودية المباشرة الآن عبر جميع بطولاتنا — في نداء واحد
 * (fixtures?live=all عالمي ثم نُرشّح على معرّفات بطولاتنا). يُغني عن استطلاع
 * كل بطولة على حدة، ويتيح شريطًا مباشرًا موحّدًا بصرف النظر عن البطولة المختارة.
 */
export async function getGlobalLiveFixtures(): Promise<SplLiveBoardItem[]> {
  return withSWR(`spl:live:all`, LIVE_BOARD_TTL, LIVE_BOARD_TTL * 2, async () => {
    const rows = await apiGet("fixtures", { live: "all", timezone: TIMEZONE });
    const byId = new Map(SAUDI_COMPETITIONS.map((c) => [c.id, c]));
    return rows
      .filter((r: any) => byId.has(r.league?.id))
      .map((r: any): SplLiveBoardItem => {
        const comp = byId.get(r.league.id)!;
        return { ...localizeFixture(r), competition: comp.name, competitionSlug: comp.slug };
      })
      .sort((a, b) => a.timestamp - b.timestamp);
  });
}

/** مفتاح يوم بتوقيت الرياض (YYYY-MM-DD) — لتحديد نطاق "اليوم" محليًا بدقة. */
const riyadhDayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * كل مباريات الأندية السعودية اليوم عبر جميع بطولاتنا — في نداء واحد
 * (fixtures?date=اليوم عالمي ثم نُرشّح على معرّفات بطولاتنا). تشمل المقرّرة
 * والجارية والمنتهية اليوم، مرتّبة: الجارية أولًا ثم الأقرب موعدًا — لنظرة
 * سريعة موحّدة أعلى الصفحة بصرف النظر عن البطولة المختارة.
 */
export async function getGlobalTodayFixtures(date?: string): Promise<SplLiveBoardItem[]> {
  // ?date اختياري بصيغة YYYY-MM-DD (بتوقيت الرياض ضمنًا)؛ غير ذلك = اليوم.
  const dateKey = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : riyadhDayFmt.format(new Date());
  return withSWR(`spl:today:${dateKey}`, TODAY_TTL, TODAY_TTL * 2, async () => {
    const rows = await apiGet("fixtures", { date: dateKey, timezone: TIMEZONE });
    const byId = new Map(SAUDI_COMPETITIONS.map((c) => [c.id, c]));
    return rows
      .filter((r: any) => byId.has(r.league?.id))
      .map((r: any): SplLiveBoardItem => {
        const comp = byId.get(r.league.id)!;
        return { ...localizeFixture(r), competition: comp.name, competitionSlug: comp.slug };
      })
      .sort((a, b) => {
        if (a.status.live !== b.status.live) return a.status.live ? -1 : 1;
        return a.timestamp - b.timestamp;
      });
  });
}

// ---------- البث المباشر العالمي (الدوريات العالمية التي موسمها قائم الآن) ----------

export interface SplWorldLiveItem extends SplLiveBoardItem {
  country: string; // الاسم الخام (إنجليزي) كما يعيده المزود
  countryAr: string; // معرَّب (مع fallback للإنجليزي)
  flag: string | null;
  leagueId: number;
  leagueLogo: string | null;
}

let ongoingLeaguesCache: { at: number; ids: Set<number> } | null = null;
const ONGOING_LEAGUES_TTL = 12 * 60 * 60 * 1000; // قائمة المواسم تتغيّر يوميًا فقط

/**
 * معرّفات كل دوريات العالم التي موسمها الحالي «قائم» الآن (تاريخ اليوم ضمن نطاق
 * start..end للموسم الحالي)، من نداء واحد leagues?current=true خلف كاش نصف يوم.
 * تُستخدم لترشيح البث المباشر العالمي على البطولات العاملة فعلًا — لا ودّيات ولا
 * بطولات خامدة موسمها منتهٍ.
 */
export async function getOngoingLeagueIds(): Promise<Set<number>> {
  if (ongoingLeaguesCache && Date.now() - ongoingLeaguesCache.at < ONGOING_LEAGUES_TTL) {
    return ongoingLeaguesCache.ids;
  }
  const today = riyadhDayFmt.format(new Date()); // YYYY-MM-DD
  const rows = await apiGet("leagues", { current: "true" });
  const ids = new Set<number>();
  for (const r of rows) {
    const id = r?.league?.id;
    if (!id) continue;
    const seasons: any[] = Array.isArray(r?.seasons) ? r.seasons : [];
    const cur = seasons.find((s) => s?.current) ?? seasons[seasons.length - 1];
    const start = cur?.start;
    const end = cur?.end;
    if (typeof start === "string" && typeof end === "string" && start <= today && today <= end) {
      ids.add(id);
    }
  }
  ongoingLeaguesCache = { at: Date.now(), ids };
  return ids;
}

// أنماط ضجيج لا نريدها في «البطولات العالمية القائمة»: ودّيات، فئات سنّية، احتياط.
const NOISE_LEAGUE_RE = /friendl|\bu-?1[5-9]\b|\bu-?2[0-3]\b|youth|reserve|amateur/i;

function localizeWorldLeagueName(name: string, country: string): string {
  const trimmed = (name || "").trim();
  const countryName = (country || "").trim().toLowerCase();
  if (!trimmed) return "";

  // Names like "Premier League" are reused in many countries. The generic
  // SPL dictionary maps it to England, which is only safe with country context.
  if (trimmed === "Premier League" && !["england", "world"].includes(countryName)) {
    return trimmed;
  }

  return localizeSplCompetition(trimmed);
}

/**
 * المباريات المباشرة في البطولات العالمية التي موسمها قائم الآن — نُبقي بطولاتنا
 * المنتقاة دائمًا، ونضيف أي دوري عالمي موسمه قائم (عبر كل العالم لا قائمتنا فقط)،
 * ونستبعد ضجيج الودّيات والفئات السنّية. نداء fixtures?live=all + مجموعة المواسم
 * القائمة، كلاهما خلف كاش SWR يخدم آلاف الزوار. الأسماء المعروفة تُعرَّب مع
 * fallback إنجليزي آمن. (مجمّع في الواجهة حسب الدولة ثم الدوري.)
 */
export async function getWorldLiveFixtures(): Promise<SplWorldLiveItem[]> {
  return withSWR(`spl:world-live`, LIVE_BOARD_TTL, LIVE_BOARD_TTL * 2, async () => {
    const [rows, ongoing] = await Promise.all([
      apiGet("fixtures", { live: "all", timezone: TIMEZONE }),
      getOngoingLeagueIds().catch(() => new Set<number>()),
    ]);
    const byId = new Map(SAUDI_COMPETITIONS.map((c) => [c.id, c]));
    return rows
      .filter((r: any) => {
        const lg = r.league ?? {};
        const id = lg.id;
        if (!id) return false;
        if (byId.has(id)) return true; // بطولاتنا المنتقاة تظهر دائمًا
        if (NOISE_LEAGUE_RE.test(String(lg.name ?? ""))) return false; // ودّيات/فئات سنّية
        if (ongoing.size === 0) return true; // تعذّر تحديد المواسم → لا نُفرّغ الصفحة
        return ongoing.has(id); // دوري عالمي موسمه قائم فقط
      })
      .map((r: any): SplWorldLiveItem => {
        const lg = r.league ?? {};
        const known = byId.get(lg.id);
        return {
          ...localizeFixture(r),
          competition: known?.name ?? localizeWorldLeagueName(lg.name ?? "", lg.country ?? ""),
          competitionSlug: known?.slug ?? null,
          country: lg.country ?? "",
          countryAr: localizeSplCountry(lg.country ?? ""),
          flag: lg.flag ?? null,
          leagueId: lg.id ?? 0,
          leagueLogo: lg.logo ?? null,
        };
      })
      .sort((a, b) => {
        // الأبكر بدءًا (الأكثر دقائق) أولًا داخل نفس الدوري لاحقًا في الواجهة؛
        // هنا ترتيب عام بالوقت يكفي قبل التجميع.
        return a.timestamp - b.timestamp;
      });
  });
}

const TEAM_RECENT_TTL = 10 * 60 * 1000; // نتائج الفريق الأخيرة تتغيّر بعد كل مباراة فقط

/**
 * آخر نتائج فريق محدّد (fixtures?team=&last=). تُرجّع المباريات المنتهية فقط،
 * مرتّبة من الأحدث، مع تسمية البطولة (مُعرّبة إن كانت ضمن بطولاتنا، وإلا الاسم
 * الخام). تُستخدم في ملخّص «ما فاتك» — عبر كل البطولات لا بطولة واحدة.
 */
export async function getTeamRecentResults(teamId: number, last = 5): Promise<SplLiveBoardItem[]> {
  return withSWR(`spl:team:${teamId}:recent:${last}`, TEAM_RECENT_TTL, TEAM_RECENT_TTL * 2, async () => {
    const rows = await apiGet("fixtures", { team: String(teamId), last: String(last), timezone: TIMEZONE });
    const byId = new Map(SAUDI_COMPETITIONS.map((c) => [c.id, c]));
    return rows
      .map((r: any): SplLiveBoardItem => {
        const comp = byId.get(r.league?.id);
        return {
          ...localizeFixture(r),
          competition: comp?.name ?? (r.league?.name ?? ""),
          competitionSlug: comp?.slug ?? null,
        };
      })
      .filter((fx) => fx.status.finished)
      .sort((a, b) => b.timestamp - a.timestamp);
  });
}

// ---------- المواجهات المباشرة (Head-to-Head) ----------

export interface SplH2HMeeting {
  id: number;
  timestamp: number;
  date: string;
  competition: string;
  home: { id: number; name: string; logo: string };
  away: { id: number; name: string; logo: string };
  goals: { home: number | null; away: number | null };
}

export interface SplH2H {
  summary: { total: number; homeWins: number; draws: number; awayWins: number };
  meetings: SplH2HMeeting[];
}

/**
 * تاريخ المواجهات بين فريقين (fixtures/headtohead). الملخّص (فوز/تعادل/خسارة)
 * محسوب من منظور homeId المطلوب، على المباريات المحسومة فقط. أسماء الأندية
 * تُعرّب عبر الخريطة. يعمل عبر كل البطولات (لا يقتصر على بطولة واحدة).
 */
export async function getHeadToHead(homeId: number, awayId: number, last = 8): Promise<SplH2H> {
  return withSWR(`spl:h2h:${homeId}-${awayId}`, H2H_TTL, H2H_TTL * 2, async () => {
    const rows = await apiGet("fixtures/headtohead", { h2h: `${homeId}-${awayId}`, last, timezone: TIMEZONE });
    const meetings: SplH2HMeeting[] = (Array.isArray(rows) ? rows : [])
      .map((r: any): SplH2HMeeting => ({
        id: r.fixture?.id ?? 0,
        timestamp: r.fixture?.timestamp ?? 0,
        date: r.fixture?.date ?? "",
        competition: localizeSplCompetition(r.league?.name ?? ""),
        home: { id: r.teams?.home?.id ?? 0, name: localizeSplTeamName(r.teams?.home?.id, r.teams?.home?.name ?? ""), logo: r.teams?.home?.logo ?? "" },
        away: { id: r.teams?.away?.id ?? 0, name: localizeSplTeamName(r.teams?.away?.id, r.teams?.away?.name ?? ""), logo: r.teams?.away?.logo ?? "" },
        goals: { home: r.goals?.home ?? null, away: r.goals?.away ?? null },
      }))
      .sort((a, b) => b.timestamp - a.timestamp);

    let total = 0, homeWins = 0, draws = 0, awayWins = 0;
    for (const m of meetings) {
      if (m.goals.home == null || m.goals.away == null) continue;
      total++;
      const hg = m.home.id === homeId ? m.goals.home : m.goals.away;
      const ag = m.home.id === homeId ? m.goals.away : m.goals.home;
      if (hg === ag) draws++;
      else if (hg > ag) homeWins++;
      else awayWins++;
    }
    return { summary: { total, homeWins, draws, awayWins }, meetings };
  });
}

// ---------- الترتيب (جدول واحد للدوري) ----------

export interface SplStandingSplit {
  played: number;
  win: number;
  draw: number;
  lose: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number; // محسوب: فوز×3 + تعادل (المزوّد لا يعيد نقاط السبليت)
}

export interface SplStandingRow {
  rank: number;
  team: SplTeam;
  played: number;
  win: number;
  draw: number;
  lose: number;
  goalsFor: number;
  goalsAgainst: number;
  goalsDiff: number;
  points: number;
  form: string | null;
  home: SplStandingSplit | null;
  away: SplStandingSplit | null;
  // اتجاه المركز مقارنة بالجولة السابقة (يعيده API-Football في status).
  trend: "up" | "down" | "same" | null;
  // true إذا طُبّقت عليه نتيجة مباراة جارية (ترتيب مبدئي لحظي).
  live?: boolean;
  // حراك المركز اللحظي بسبب المباريات الجارية (موجب=صعد، سالب=هبط) — سهم الاتجاه.
  liveDelta?: number;
}

export async function getStandings(comp: SaudiCompetition, seasonOverride?: number): Promise<SplStandingRow[]> {
  if (!comp.hasStandings) return [];
  const season = seasonOverride ?? await seasonFor(comp);
  return withSWR(`spl:standings:${comp.id}:${season}`, CACHE_TTL.MEDIUM, CACHE_TTL.MEDIUM * 2, async () => {
    const rows = await apiGet("standings", { league: comp.id, season });
    const table: any[] = rows[0]?.league?.standings?.[0] ?? [];
    const toSplit = (s: any): SplStandingSplit | null => {
      if (!s) return null;
      const win = s.win ?? 0, draw = s.draw ?? 0;
      return {
        played: s.played ?? 0,
        win,
        draw,
        lose: s.lose ?? 0,
        goalsFor: s.goals?.for ?? 0,
        goalsAgainst: s.goals?.against ?? 0,
        points: win * 3 + draw,
      };
    };
    return table
      .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
      .map((row: any): SplStandingRow => ({
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
        home: toSplit(row.home),
        away: toSplit(row.away),
        trend: ((): "up" | "down" | "same" | null => {
          const s = String(row.status ?? "").toLowerCase();
          if (s === "up") return "up";
          if (s === "down") return "down";
          if (s === "same" || s === "equal") return "same";
          return null;
        })(),
      }));
  });
}

// ---------- الهدافون ----------

export interface SplScorer {
  rank: number;
  id: number;
  name: string;
  photo: string;
  team: SplTeam;
  goals: number;
  assists: number;
  penalties: number;
  matches: number;
}

export async function getTopScorers(comp: SaudiCompetition, seasonOverride?: number): Promise<SplScorer[]> {
  if (!comp.hasScorers) return [];
  const season = seasonOverride ?? await seasonFor(comp);
  return withSWR(`spl:scorers:${comp.id}:${season}`, CACHE_TTL.LONG, CACHE_TTL.LONG * 2, async () => {
    const rows = await apiGet("players/topscorers", { league: comp.id, season });
    const tr = await resolveNames(rows.map((r: any) => r.player?.name));
    return rows.slice(0, 15).map((row: any, index: number): SplScorer => {
      const stats = row.statistics?.[0] ?? {};
      return {
        rank: index + 1,
        id: row.player?.id ?? 0,
        name: localizeSplPlayerName(row.player?.id, row.player?.name ?? "", tr),
        photo: row.player?.photo ?? "",
        team: localizeTeam(stats.team),
        goals: stats.goals?.total ?? 0,
        assists: stats.goals?.assists ?? 0,
        penalties: stats.penalty?.scored ?? 0,
        matches: stats.games?.appearences ?? 0,
      };
    });
  });
}

// ---------- لمحة النسخة السابقة (حامل اللقب + هدّاف الموسم الماضي) ----------

export interface SplPreviousChampion {
  id: number;
  name: string;
  logo: string;
}

export interface SplPreviousScorer {
  id: number;
  name: string;
  photo: string;
  team: SplTeam;
  goals: number;
}

export interface SplCompetitionHistory {
  /** الموسم السابق (الحالي - 1)؛ قد يكون null لو تعذّر تحديد الموسم. */
  previousSeason: number | null;
  /** حامل اللقب في النسخة السابقة (متصدّر الترتيب للدوريات، فائز النهائي للكؤوس). */
  champion: SplPreviousChampion | null;
  /** هدّاف النسخة السابقة (الأول في قائمة الهدّافين). */
  topScorer: SplPreviousScorer | null;
}

const FINISHED_STATUSES = new Set(["FT", "AET", "PEN"]);

/**
 * لمحة عن النسخة السابقة للبطولة: من حملَ اللقب ومن تصدّر الهدّافين الموسم الماضي.
 * - الدوريات (hasStandings): البطل = متصدّر ترتيب الموسم السابق.
 * - الكؤوس: البطل = الفائز في آخر مباراة منتهية (النهائي) من الموسم السابق.
 * مخزَّن طويلًا (بيانات تاريخية ثابتة) ويتدهور بسلاسة إلى null عند أي فشل جزئي.
 */
export async function getCompetitionHistory(
  comp: SaudiCompetition,
  targetSeason?: number,
): Promise<SplCompetitionHistory> {
  const current = await seasonFor(comp);
  // الافتراضي = النسخة السابقة (current - 1) لعرض «حامل اللقب» في بطولة جارية/قادمة.
  // للبطولة المنتهية نمرّر موسمها المنتهي نفسه فيصير البطل/الهدّاف من ذلك الموسم لا ما قبله.
  const prev = typeof targetSeason === "number" ? targetSeason : current - 1;

  return withSWR(`spl:history:v1:${comp.id}:${prev}`, CACHE_TTL.LONG, CACHE_TTL.LONG * 4, async () => {
    let champion: SplPreviousChampion | null = null;

    if (comp.hasStandings) {
      const rows = await apiGet("standings", { league: comp.id, season: prev }).catch(() => []);
      const table: any[] = rows[0]?.league?.standings?.[0] ?? [];
      const top = table.find((r: any) => r.rank === 1) ?? table[0];
      if (top?.team) {
        champion = {
          id: top.team.id ?? 0,
          name: localizeSplTeamName(top.team.id, top.team.name ?? ""),
          logo: top.team.logo ?? "",
        };
      }
    } else {
      // كأس: نستنتج البطل من فائز آخر مباراة منتهية (النهائي) في الموسم السابق.
      const fx = await apiGet("fixtures", { league: comp.id, season: prev }).catch(() => []);
      const finished = fx
        .filter((r: any) => FINISHED_STATUSES.has(r.fixture?.status?.short))
        .sort((a: any, b: any) => (b.fixture?.timestamp ?? 0) - (a.fixture?.timestamp ?? 0));
      const final = finished[0];
      const home = final?.teams?.home;
      const away = final?.teams?.away;
      const winner = home?.winner ? home : away?.winner ? away : null;
      if (winner) {
        champion = {
          id: winner.id ?? 0,
          name: localizeSplTeamName(winner.id, winner.name ?? ""),
          logo: winner.logo ?? "",
        };
      }
    }

    let topScorer: SplPreviousScorer | null = null;
    if (comp.hasScorers) {
      const rows = await apiGet("players/topscorers", { league: comp.id, season: prev }).catch(() => []);
      const r0 = rows[0];
      if (r0?.player) {
        const stats = r0.statistics?.[0] ?? {};
        const tr = await resolveNames([r0.player?.name]);
        topScorer = {
          id: r0.player.id ?? 0,
          name: localizeSplPlayerName(r0.player.id, r0.player.name ?? "", tr),
          photo: r0.player.photo ?? "",
          team: localizeTeam(stats.team),
          goals: stats.goals?.total ?? 0,
        };
      }
    }

    return { previousSeason: prev, champion, topScorer };
  });
}

// ---------- تفاصيل مباراة (أحداث + إحصاءات «لغة الأرقام») ----------

export interface SplMatchEvent {
  minute: number | null;
  extra: number | null;
  teamId: number;
  team: string;
  player: string;
  assist: string | null;
  type: string;
  label: string;
}

export interface SplStatRow {
  type: string;
  label: string;
  home: string | number | null;
  away: string | number | null;
}

export interface SplLineupPlayer {
  id: number;
  number: number | null;
  name: string;
  pos: string;
  /** إحداثيات اللاعب على أرض الملعب بصيغة "صف:عمود" (للـ Pitch View)؛ قد تغيب للمباريات القديمة. */
  grid: string | null;
}

export interface SplLineup {
  team: { id: number; name: string; logo: string };
  formation: string | null;
  coach: string | null;
  startXI: SplLineupPlayer[];
  substitutes: SplLineupPlayer[];
}

export interface SplMatchDetail {
  fixture: SplFixture;
  events: SplMatchEvent[];
  statistics: {
    home: { id: number; name: string };
    away: { id: number; name: string };
    rows: SplStatRow[];
  } | null;
  lineups: SplLineup[];
  /** معرّف الدوري في API-Football — لربط الطبقة اللحظية (TheSports) بالبطولة. */
  leagueId: number | null;
}

const POS_AR: Record<string, string> = { G: "حراسة", D: "دفاع", M: "وسط", F: "هجوم" };

type NameTranslator = (name: string | null | undefined) => string;

function localizeLineupPlayer(p: any, tr: NameTranslator): SplLineupPlayer {
  const pl = p?.player ?? {};
  return {
    id: pl.id ?? 0,
    number: pl.number ?? null,
    name: localizeSplPlayerName(pl.id, pl.name ?? "", tr),
    pos: POS_AR[pl.pos] ?? pl.pos ?? "",
    grid: pl.grid ?? null,
  };
}

function localizeLineups(rows: any[], tr: NameTranslator): SplLineup[] {
  return rows.map((t: any): SplLineup => ({
    team: {
      id: t.team?.id ?? 0,
      name: localizeSplTeamName(t.team?.id, t.team?.name ?? ""),
      logo: t.team?.logo ?? "",
    },
    formation: t.formation ?? null,
    coach: t.coach?.name ?? null,
    startXI: (t.startXI ?? []).map((p: any) => localizeLineupPlayer(p, tr)),
    substitutes: (t.substitutes ?? []).map((p: any) => localizeLineupPlayer(p, tr)),
  }));
}

function localizeEventRow(e: any, tr: NameTranslator): SplMatchEvent {
  const loc = localizeEvent(e.type ?? "", e.detail ?? "");
  return {
    minute: e.time?.elapsed ?? null,
    extra: e.time?.extra ?? null,
    teamId: e.team?.id ?? 0,
    team: localizeSplTeamName(e.team?.id, e.team?.name ?? ""),
    player: tr(e.player?.name),
    assist: e.assist?.name ? tr(e.assist.name) : null,
    type: loc.type,
    label: loc.label,
  };
}

function creditedGoalCounts(events: SplMatchEvent[], homeId: number): { home: number; away: number } {
  let home = 0;
  let away = 0;
  for (const e of events) {
    if (e.type !== "goal") continue;
    const scoredByHome = e.teamId === homeId;
    const ownGoal = e.label.includes("عكسي");
    const creditHome = ownGoal ? !scoredByHome : scoredByHome;
    if (creditHome) home += 1;
    else away += 1;
  }
  return { home, away };
}

function appendScoreSummaryEvents(fixture: SplFixture, events: SplMatchEvent[]): SplMatchEvent[] {
  if (!fixture.status.finished) return events;
  const out = [...events];
  const counted = creditedGoalCounts(events, fixture.home.id);
  const homeGoals = fixture.goals.home ?? 0;
  const awayGoals = fixture.goals.away ?? 0;

  const pushMissingGoals = (team: SplTeam, missing: number, total: number) => {
    if (missing <= 0 || total <= 0) return;
    out.push({
      minute: null,
      extra: null,
      teamId: team.id,
      team: team.name,
      player: "ملخص الأهداف",
      assist: null,
      type: "score-summary",
      label: total === 1 ? "هدف مسجل دون تفاصيل من المصدر" : `${total} أهداف مسجلة دون تفاصيل من المصدر`,
    });
  };

  pushMissingGoals(fixture.home, homeGoals - counted.home, homeGoals);
  pushMissingGoals(fixture.away, awayGoals - counted.away, awayGoals);

  const pen = fixture.penalties;
  const hasPenaltySummary = events.some((e) => e.type === "shootout-summary" || e.label.includes("الترجيح"));
  if (!hasPenaltySummary && pen && (pen.home != null || pen.away != null)) {
    if (pen.home != null) {
      out.push({
        minute: 120,
        extra: null,
        teamId: fixture.home.id,
        team: fixture.home.name,
        player: "ركلات الترجيح",
        assist: null,
        type: "shootout-summary",
        label: `${pen.home} ركلات ناجحة`,
      });
    }
    if (pen.away != null) {
      out.push({
        minute: 120,
        extra: null,
        teamId: fixture.away.id,
        team: fixture.away.name,
        player: "ركلات الترجيح",
        assist: null,
        type: "shootout-summary",
        label: `${pen.away} ركلات ناجحة`,
      });
    }
  }

  return out;
}

function localizeStats(rows: any[]): SplMatchDetail["statistics"] {
  if (rows.length < 2) return null;
  const [home, away] = rows;
  const homeMap = new Map<string, any>((home.statistics ?? []).map((s: any) => [s.type, s.value]));
  const awayMap = new Map<string, any>((away.statistics ?? []).map((s: any) => [s.type, s.value]));
  const order = (t: string) => {
    const i = SPL_STAT_ORDER.indexOf(t);
    return i === -1 ? 99 : i;
  };
  const types = [...new Set<string>((home.statistics ?? []).map((s: any) => s.type))].sort(
    (a, b) => order(a) - order(b)
  );
  return {
    home: { id: home.team?.id ?? 0, name: localizeSplTeamName(home.team?.id, home.team?.name ?? "") },
    away: { id: away.team?.id ?? 0, name: localizeSplTeamName(away.team?.id, away.team?.name ?? "") },
    rows: types.map((t) => ({
      type: t,
      label: SPL_STAT_AR[t] ?? t,
      home: homeMap.get(t) ?? null,
      away: awayMap.get(t) ?? null,
    })),
  };
}

export async function getMatchDetail(fixtureId: number): Promise<SplMatchDetail | null> {
  return withSWR(`spl:match:${fixtureId}`, MATCH_DETAIL_TTL, MATCH_DETAIL_TTL * 2, async () => {
    const rows = await apiGet("fixtures", { id: fixtureId, timezone: TIMEZONE });
    const item = rows[0];
    if (!item) return null;
    const fixture = localizeFixture(item);
    const [eventsRaw, statsRaw, lineupsRaw] = await Promise.all([
      apiGet("fixtures/events", { fixture: fixtureId }).catch(() => []),
      apiGet("fixtures/statistics", { fixture: fixtureId }).catch(() => []),
      apiGet("fixtures/lineups", { fixture: fixtureId }).catch(() => []),
    ]);
    const rawNames: (string | null | undefined)[] = [];
    for (const e of eventsRaw) rawNames.push(e.player?.name, e.assist?.name);
    for (const t of lineupsRaw) {
      for (const p of t.startXI ?? []) rawNames.push(p.player?.name);
      for (const p of t.substitutes ?? []) rawNames.push(p.player?.name);
    }
    const tr = await resolveNames(rawNames);
    const events = eventsRaw.map((e: any) => localizeEventRow(e, tr));
    return {
      fixture,
      events: appendScoreSummaryEvents(fixture, events),
      statistics: localizeStats(statsRaw),
      lineups: localizeLineups(lineupsRaw, tr),
      leagueId: item.league?.id ?? null,
    };
  });
}

const MATCH_EVENTS_TTL = 12 * 1000; // أحداث المباراة المباشرة — تحديث متكرّر لكشف الكروت/الفار

/**
 * أحداث المباراة فقط (نداء `fixtures/events` واحد) — يستخدمه جوب التنبيهات الرياضية
 * للكشف اللحظي عن البطاقات وحالات الفار دون إشعال نداءات الإحصاءات/التشكيلات لكل
 * مباراة كما يفعل getMatchDetail (جذر طوفان rate-limit). محميّ بـ SWR قصير (12ث).
 */
export async function getMatchEventsOnly(fixtureId: number): Promise<SplMatchEvent[]> {
  return withSWR(`spl:events:${fixtureId}`, MATCH_EVENTS_TTL, MATCH_EVENTS_TTL * 2, async () => {
    const eventsRaw = await apiGet("fixtures/events", { fixture: fixtureId }).catch(() => []);
    const rawNames: (string | null | undefined)[] = [];
    for (const e of eventsRaw) rawNames.push(e.player?.name, e.assist?.name);
    const tr = await resolveNames(rawNames);
    return eventsRaw.map((e: any) => localizeEventRow(e, tr));
  });
}

// ============================================================
// الطبقة اللحظية الفائقة (TheSports) — تعميمها على البوابة (المرحلة 1)
// ------------------------------------------------------------
// أثناء اللعب فقط، وللبطولات المُدرَجة في خريطة TS_COMPETITION_IDS فقط، نُركّب
// نتيجة/أحداث/إحصاءات TheSports اللحظية (sub-minute، أسرع وأغنى من API-Football)
// فوق بيانات المباراة. أفضل جهد: أي فشل/تهدئة/التباس → نُبقي بيانات API-Football
// كما هي. المنتهية تبقى من API-Football (أحداث قابلة للنقر + تقييمات + معرّفات).
// ============================================================

function getCompetitionByLeagueId(id: number): SaudiCompetition | undefined {
  return SAUDI_COMPETITIONS.find((c) => c.id === id);
}

// نوع/تسمية حدث TheSports بمفردات الواجهة نفسها (تطابق localizeEvent).
const TS_EVENT_LABEL: Record<TsEvent["type"], { type: string; label: string } | null> = {
  goal: { type: "goal", label: "هدف" },
  penalty_goal: { type: "goal", label: "هدف من ركلة جزاء" },
  own_goal: { type: "goal", label: "هدف عكسي" },
  penalty_missed: { type: "missed-penalty", label: "ركلة جزاء ضائعة" },
  yellow: { type: "yellow-card", label: "بطاقة صفراء" },
  red: { type: "red-card", label: "بطاقة حمراء" },
  yellow_red: { type: "red-card", label: "بطاقة حمراء (إنذاران)" },
  sub: { type: "substitution", label: "تبديل" },
  var: { type: "var", label: "مراجعة الفار" },
  injury_time: null, // وقت بدل ضائع — لا يُعرَض كسطر
  other: null,
};

// تسمية حدث الفار بنتيجة المراجعة إن حُسمت (إلغاء هدف/احتساب جزاء...)، وإلا العامة.
function tsEventLabel(e: TsEvent, meta: { type: string; label: string }): string {
  if (e.type === "var" && e.varResult != null && TS_VAR_RESULT_AR[e.varResult]) {
    return TS_VAR_RESULT_AR[e.varResult];
  }
  return meta.label;
}

async function mapTsEventsToSpl(events: TsEvent[], fx: SplFixture): Promise<SplMatchEvent[]> {
  const rawNames: (string | null | undefined)[] = [];
  for (const e of events) rawNames.push(e.player, e.assist, e.inPlayer, e.outPlayer);
  const tr = await resolveNames(rawNames);
  // تفضيل أسماء المزوّد العربية (language/list) للاعب الرئيسي عبر معرّفه عند تفعيل
  // THESPORTS_LANG؛ تتراجع لتعريب worldCupNameTranslator. أفضل جهد: لا تُعطّل شيئًا.
  const arById = await resolveTsNames(TS_I18N_TYPE.player, events.map((e) => e.playerId));
  const out: SplMatchEvent[] = [];
  for (const e of events) {
    const meta = TS_EVENT_LABEL[e.type];
    if (!meta) continue;
    const teamId = e.team === "home" ? fx.home.id : e.team === "away" ? fx.away.id : 0;
    const team = e.team === "home" ? fx.home.name : e.team === "away" ? fx.away.name : "";
    if (e.type === "sub") {
      out.push({
        minute: e.minute, extra: null, teamId, team,
        player: arById(e.playerId) ?? tr(e.inPlayer), assist: e.outPlayer ? tr(e.outPlayer) : null,
        type: meta.type, label: meta.label,
      });
    } else {
      out.push({
        minute: e.minute, extra: null, teamId, team,
        player: arById(e.playerId) ?? tr(e.player), assist: e.assist ? tr(e.assist) : null,
        type: meta.type, label: tsEventLabel(e, meta),
      });
    }
  }
  return out;
}

// خريطة إحصاءات TheSports → مفاتيح SplStatRow (نُعيد استخدام تسميات SPL_STAT_AR).
const TS_STAT_TO_SPL: { key: keyof TsLiveStats; type: string; label: string; pct?: boolean }[] = [
  { key: "possession", type: "Ball Possession", label: SPL_STAT_AR["Ball Possession"], pct: true },
  { key: "shotsOnTarget", type: "Shots on Goal", label: SPL_STAT_AR["Shots on Goal"] },
  { key: "shotsOffTarget", type: "Shots off Goal", label: SPL_STAT_AR["Shots off Goal"] },
  { key: "attacks", type: "Attacks", label: "الهجمات" },
  { key: "dangerousAttacks", type: "Dangerous Attacks", label: "هجمات خطيرة" },
  { key: "corners", type: "Corner Kicks", label: SPL_STAT_AR["Corner Kicks"] },
  { key: "yellow", type: "Yellow Cards", label: SPL_STAT_AR["Yellow Cards"] },
  { key: "red", type: "Red Cards", label: SPL_STAT_AR["Red Cards"] },
];

function mapTsStatsToSpl(ts: TsLiveStats, detail: SplMatchDetail): SplMatchDetail["statistics"] {
  const fx = detail.fixture;
  const base = detail.statistics;
  const rowsByType = new Map<string, SplStatRow>();
  if (base) for (const r of base.rows) rowsByType.set(r.type, r);
  for (const m of TS_STAT_TO_SPL) {
    const pair = ts[m.key] as [number, number] | undefined;
    if (!pair) continue;
    const [h, a] = pair;
    rowsByType.set(m.type, {
      type: m.type,
      label: m.label,
      home: m.pct ? `${h}%` : h,
      away: m.pct ? `${a}%` : a,
    });
  }
  if (rowsByType.size === 0) return base;
  const order = (t: string) => {
    const i = SPL_STAT_ORDER.indexOf(t);
    return i === -1 ? 99 : i;
  };
  const rows = [...rowsByType.values()].sort((x, y) => order(x.type) - order(y.type));
  return {
    home: base?.home ?? { id: fx.home.id, name: fx.home.name },
    away: base?.away ?? { id: fx.away.id, name: fx.away.name },
    rows,
  };
}

// جوهر مشترك: ركّب نتيجة TheSports الحيّة على أي SplFixture بمعرّف بطولة معروف.
async function overlayFastScoreOnFixture<T extends SplFixture>(f: T, tsCompId: string): Promise<T> {
  if (!f.status.live) return f;
  try {
    const ts = await getTheSportsFastScore(f.id, f.timestamp, tsCompId);
    if (!ts || (!ts.live && !ts.finished)) return f;
    return {
      ...f,
      goals: { home: ts.home, away: ts.away },
      // ركلات الترجيح من TheSports إن رُصدت (شوط ترجيح حيّ)، وإلا نُبقي قيمة
      // API-Football (تظهر عند انتهاء المباراة) فلا نمحوها بقيمة فارغة.
      penalties:
        ts.penHome != null || ts.penAway != null
          ? { home: ts.penHome, away: ts.penAway }
          : f.penalties,
      status: { ...f.status, live: ts.live, finished: ts.finished || f.status.finished },
    };
  } catch {
    return f;
  }
}

/**
 * تركيب نتيجة TheSports اللحظية على عنصر لوحة (today/live) — أفضل جهد.
 * يعمل فقط للمباريات الجارية في بطولة مُدرَجة؛ غير ذلك يُعيد العنصر كما هو.
 */
export async function overlayLiveBoardScore<T extends SplLiveBoardItem>(item: T): Promise<T> {
  const tsCompId = getTsCompetitionId(item.competitionSlug);
  if (!tsCompId) return item;
  return overlayFastScoreOnFixture(item, tsCompId);
}

export async function overlayLiveBoardList<T extends SplLiveBoardItem>(items: T[]): Promise<T[]> {
  return Promise.all((items ?? []).map((i) => overlayLiveBoardScore(i)));
}

/**
 * تركيب نتيجة TheSports اللحظية على قائمة مباريات بطولة معروفة (SplFixture بلا
 * competitionSlug) — لمركز مباريات البطولة. أفضل جهد.
 */
export async function overlayLiveFixturesForComp<T extends SplFixture>(
  items: T[],
  compSlug: string
): Promise<T[]> {
  const tsCompId = getTsCompetitionId(compSlug);
  if (!tsCompId) return items ?? [];
  return Promise.all((items ?? []).map((f) => overlayFastScoreOnFixture(f, tsCompId)));
}

/**
 * تركيب لقطة TheSports الحيّة الكاملة (نتيجة + أحداث + إحصاءات) على تفاصيل
 * مباراة البوابة — أثناء اللعب فقط وللبطولات المُدرَجة. أفضل جهد.
 */
export async function overlayLiveMatchDetail(detail: SplMatchDetail): Promise<SplMatchDetail> {
  const fx = detail.fixture;
  if (!fx.status.live) return detail;
  const comp = detail.leagueId != null ? getCompetitionByLeagueId(detail.leagueId) : undefined;
  const tsCompId = getTsCompetitionId(comp?.slug);
  if (!tsCompId) return detail;
  try {
    const ts = await getTheSportsMatchLive(fx.id, fx.timestamp, tsCompId);
    if (!ts || (!ts.live && !ts.finished)) return detail;
    const fixture: SplFixture = {
      ...fx,
      goals: { home: ts.home, away: ts.away },
      status: { ...fx.status, live: ts.live, finished: ts.finished || fx.status.finished },
    };
    const events = ts.events.length ? await mapTsEventsToSpl(ts.events, fx) : detail.events;
    const statistics = ts.stats ? mapTsStatsToSpl(ts.stats, detail) : detail.statistics;
    return { ...detail, fixture, events, statistics };
  } catch {
    return detail;
  }
}

// ---------- قنوات بثّ المباراة («أين تُشاهد») ----------

const TV_TTL = 60 * 60 * 1000; // القنوات شبه ثابتة قبل المباراة

export interface SplMatchTv {
  available: boolean;
  channels: { name: string; url: string | null }[];
}

/**
 * قنوات بثّ المباراة عبر TheSports («أين تُشاهد») — للبطولات المُدرَجة فقط.
 * نحلّ معرّف مباراة TheSports من معرّف API-Football (جسر الوقت+البطولة عبر
 * diary) ثم نجلب القنوات (beIN أولًا، حدّ 6). أفضل جهد: أي تعذّر/التباس/IP غير
 * مُدرَج → available:false فتُخفي الواجهة القسم بسلاسة. يعمل لكل المراحل (قادمة
 * أساسًا حيث القناة أنفع، وكذلك الجارية/المنتهية حديثًا ما دامت في diary).
 */
export async function getMatchTvChannels(fixtureId: number): Promise<SplMatchTv> {
  if (!isSaudiLeagueConfigured()) return { available: false, channels: [] };
  return withSWR(`spl:tv:${fixtureId}`, TV_TTL, TV_TTL * 2, async () => {
    const detail = await getMatchDetail(fixtureId).catch(() => null);
    if (!detail?.fixture) return { available: false, channels: [] };
    const comp = detail.leagueId != null ? getCompetitionByLeagueId(detail.leagueId) : undefined;
    const tsCompId = getTsCompetitionId(comp?.slug);
    if (!tsCompId) return { available: false, channels: [] };
    const uuid = await resolveTsMatchId(fixtureId, detail.fixture.timestamp, tsCompId);
    if (!uuid) return { available: false, channels: [] };
    const tv = await getTsMatchTv(uuid);
    const channels = tv.map((c) => ({ name: c.name, url: c.url })).filter((c) => c.name);
    return { available: channels.length > 0, channels };
  });
}

// ---------- إحصاء الفريقين المفصّل (TheSports) — احتياط لتبويب الأرقام ----------

const TS_TEAM_STATS_TTL = 30 * 60 * 1000;

// حقول TheSports **مسمّاة** (متحقَّقة حيًّا)؛ نختار لائحة مألوفة. `accOf` يحسب نسبة
// الدقّة من حقلَي العدّ (passes + passes_accuracy). `posType` = نوع الاستحواذ
// لتعرفه الواجهة فتبرزه كشريط، وإلا أي type فريد.
const SPL_TS_STAT_FIELDS: { field: string; label: string; pct?: boolean; accOf?: string; type?: string }[] = [
  { field: "ball_possession", label: "الاستحواذ", pct: true, type: "Ball Possession" },
  { field: "shots", label: "إجمالي التسديدات" },
  { field: "shots_on_target", label: "التسديدات على المرمى" },
  { field: "passes", label: "التمريرات" },
  { field: "passes_accuracy", label: "دقّة التمرير", pct: true, accOf: "passes" },
  { field: "corner_kicks", label: "الركنيات" },
  { field: "fouls", label: "الأخطاء" },
  { field: "offsides", label: "التسلّل" },
  { field: "yellow_cards", label: "البطاقات الصفراء" },
  { field: "red_cards", label: "البطاقات الحمراء" },
];

export interface SplTeamStatRow {
  type: string;
  label: string;
  home: string;
  away: string;
}

export interface SplMatchTeamStats {
  available: boolean;
  rows: SplTeamStatRow[];
}

/**
 * إحصاء الفريقين المفصّل لمباراة عبر جسر المباراة (TheSports) — احتياط يملأ الفجوة
 * في تبويب الأرقام حين تغيب إحصاءات API-Football/SportMonks. حقول مسمّاة، إقران
 * مضيف/ضيف عبر جسر الفِرق. أفضل جهد: أي تعذّر → available:false. كاش 30 دقيقة.
 */
export async function getMatchTeamStats(fixtureId: number): Promise<SplMatchTeamStats> {
  if (!isSaudiLeagueConfigured()) return { available: false, rows: [] };
  return withSWR(`spl:teamstats:${fixtureId}`, TS_TEAM_STATS_TTL, TS_TEAM_STATS_TTL * 2, async () => {
    const detail = await getMatchDetail(fixtureId).catch(() => null);
    if (!detail?.fixture) return { available: false, rows: [] };
    const comp = detail.leagueId != null ? getCompetitionByLeagueId(detail.leagueId) : undefined;
    const tsCompId = getTsCompetitionId(comp?.slug);
    if (!comp || !tsCompId) return { available: false, rows: [] };
    const uuid = await resolveTsMatchId(fixtureId, detail.fixture.timestamp, tsCompId);
    if (!uuid) return { available: false, rows: [] };
    const sides = await getTsMatchTeamStats(uuid).catch(() => [] as TsTeamStatSide[]);
    if (sides.length < 2) return { available: false, rows: [] };

    // إقران مضيف/ضيف عبر جسر الفِرق؛ وإلا نفترض الترتيب [مضيف، ضيف].
    const bridge = await getSplTeamBridge(comp);
    const homeUuid = bridge.get(detail.fixture.home.id) ?? null;
    let home = sides[0];
    let away = sides[1];
    if (homeUuid && sides[1].teamId === homeUuid) ((home = sides[1]), (away = sides[0]));

    const valOf = (side: TsTeamStatSide, f: (typeof SPL_TS_STAT_FIELDS)[number]): number | null => {
      const v = side.values[f.field];
      if (v == null) return null;
      if (f.accOf) {
        const total = side.values[f.accOf];
        if (!total) return null;
        return Math.round((v / total) * 100);
      }
      return v;
    };

    const rows: SplTeamStatRow[] = [];
    for (const f of SPL_TS_STAT_FIELDS) {
      const h = valOf(home, f);
      const a = valOf(away, f);
      if (h == null && a == null) continue;
      if ((h ?? 0) === 0 && (a ?? 0) === 0) continue; // صفر للطرفين = غير مُبلَّغ
      const suffix = f.pct ? "%" : "";
      rows.push({ type: f.type ?? `ts:${f.field}`, label: f.label, home: `${h ?? 0}${suffix}`, away: `${a ?? 0}${suffix}` });
    }
    return { available: rows.length > 0, rows };
  });
}

// ---------- جسر الفِرق (API-Football teamId ↔ TheSports uuid) + الإصابات ----------

const SPL_BRIDGE_TTL = 6 * 60 * 60 * 1000;
const splTeamBridges = new Map<string, { at: number; map: Map<number, string> }>();

/**
 * جسر فِرق بطولة سعودية: API-Football teamId → TheSports uuid. نطابق مبارياتنا
 * (home.id/away.id + timestamp) بأزواج فِرق TheSports (uuid + match_time) بتطابق
 * وقت **فريد** ثم نصوّت عبر كل مباريات الفريق → اتجاه آمن (نفس منطق المونديال).
 * يُكاش لكل بطولة (مفتاح tsCompId) 6 ساعات. أفضل جهد: أي تعذّر → خريطة فارغة.
 */
async function getSplTeamBridge(comp: SaudiCompetition): Promise<Map<number, string>> {
  const tsCompId = getTsCompetitionId(comp.slug);
  if (!tsCompId) return new Map();
  const cached = splTeamBridges.get(tsCompId);
  if (cached && Date.now() - cached.at < SPL_BRIDGE_TTL) return cached.map;
  const map = new Map<number, string>();
  try {
    const ext = await getTsCompetitionExtra(tsCompId);
    const [fixtures, pairs] = await Promise.all([
      getFixtures(comp).catch(() => [] as SplFixture[]),
      getTsCompetitionMatchPairs(tsCompId, ext?.curSeasonId ?? null),
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
    console.warn("[Sports] TheSports team bridge failed:", error);
  }
  splTeamBridges.set(tsCompId, { at: Date.now(), map });
  return map;
}

/**
 * يحلّ نادٍ سعودي (API-Football teamId) إلى بطولته ومعرّف TheSports عبر بطولات
 * الترتيب (روشن أولًا) — يتوقّف عند أول إصابة. أفضل جهد: null إن تعذّر.
 */
async function resolveSplClubUuid(
  clubId: number,
): Promise<{ comp: SaudiCompetition; uuid: string } | null> {
  for (const comp of SAUDI_COMPETITIONS.filter((c) => c.hasStandings)) {
    if (!getTsCompetitionId(comp.slug)) continue;
    const bridge = await getSplTeamBridge(comp);
    const uuid = bridge.get(clubId);
    if (uuid) return { comp, uuid };
  }
  return null;
}

const TS_INJURIES_TTL = 6 * 60 * 60 * 1000;

export interface SplTsInjury {
  player: string;
  reason: string | null;
  until: string | null;
}

function fmtSplInjuryDate(ts: number | null): string | null {
  if (!ts || ts <= 0) return null;
  try {
    return new Intl.DateTimeFormat("ar", {
      day: "numeric",
      month: "long",
      calendar: "gregory",
      timeZone: TIMEZONE,
    }).format(new Date(ts * 1000));
  } catch {
    return null;
  }
}

/**
 * إصابات/غيابات نادٍ عبر الجسر (TheSports) — يحتاج سلَك بطولة النادي (لبناء الجسر
 * الصحيح). الأسماء عربية مباشرةً من المزوّد (`name_aa`)، والسبب يُعرَّب أفضل جهد.
 * نُسقط أي صفّ بلا اسم قابل للعرض. أي تعذّر/IP غير مُدرَج → []. كاش 6 ساعات.
 */
export async function getTeamInjuries(teamId: number, compSlug: string | null): Promise<SplTsInjury[]> {
  if (!isSaudiLeagueConfigured() || !compSlug) return [];
  const comp = SAUDI_COMPETITIONS.find((c) => c.slug === compSlug);
  if (!comp) return [];
  return withSWR(`spl:ts-injuries:${teamId}`, TS_INJURIES_TTL, TS_INJURIES_TTL * 2, async () => {
    const bridge = await getSplTeamBridge(comp);
    const uuid = bridge.get(teamId);
    if (!uuid) return [];
    const raw = await getTsTeamInjuries(uuid).catch(() => []);
    if (raw.length === 0) return [];
    const noop = (_: string | null | undefined): string | null => null;
    const nameOf = await resolveTsNames(
      TS_I18N_TYPE.player,
      raw.map((r) => r.playerId).filter((x): x is string => !!x),
    ).catch(() => noop);
    const out: SplTsInjury[] = [];
    for (const r of raw) {
      const player = r.playerId ? nameOf(r.playerId) : null;
      if (!player) continue; // بلا اسم → لا نعرض
      out.push({
        player,
        reason: localizeSplInjuryReason(r.reason),
        until: fmtSplInjuryDate(r.endTime),
      });
    }
    return out;
  });
}

// ---------- هوية المباراة لمطابقتها بـSportMonks ----------

export interface SplFixtureIdentity {
  fixtureId: number;
  kickoffIso: string | null;
  homeNameEn: string | null;
  awayNameEn: string | null;
}

const IDENTITY_TTL = 6 * 60 * 60 * 1000; // الهوية شبه ثابتة (تاريخ + أسماء)

/**
 * هوية مباراة /sports (تاريخ الانطلاق + الأسماء الإنجليزية الخام) — يستخدمها
 * جسر SportMonks لمطابقة المباراة وجلب الإثراءات (xG/الضغط/الطقس...).
 */
export async function getSportsFixtureIdentity(
  fixtureId: number,
): Promise<SplFixtureIdentity | null> {
  return withSWR(`spl:identity:${fixtureId}`, IDENTITY_TTL, IDENTITY_TTL * 2, async () => {
    const rows = await apiGet("fixtures", { id: fixtureId, timezone: TIMEZONE });
    const item = rows[0];
    if (!item) return null;
    return {
      fixtureId,
      kickoffIso: item.fixture?.date ?? null,
      homeNameEn: item.teams?.home?.name ?? null,
      awayNameEn: item.teams?.away?.name ?? null,
    };
  });
}

export interface SplMatchSeoMeta {
  id: number;
  home: { id: number; name: string; logo: string };
  away: { id: number; name: string; logo: string };
  goals: { home: number | null; away: number | null };
  status: { finished: boolean; live: boolean; label: string };
  round: string;
  venueName: string | null;
  kickoffIso: string | null;
  competitionName: string | null;
}

/**
 * ميتا خفيفة لصفحة المباراة (`/sports/match/:id`) — الأسماء المعرَّبة + النتيجة
 * + الحالة + الجولة + الملعب، من نداء `fixtures` واحد خلف كاش SWR (دون
 * أحداث/إحصاءات/تشكيلات كما يفعل getMatchDetail). تُستهلَك من /api/edge/seo-meta.
 */
export async function getMatchSeoMeta(fixtureId: number): Promise<SplMatchSeoMeta | null> {
  if (!isSaudiLeagueConfigured()) return null;
  return withSWR(`spl:matchseo:${fixtureId}`, MATCH_DETAIL_TTL * 6, MATCH_DETAIL_TTL * 12, async () => {
    const rows = await apiGet("fixtures", { id: fixtureId, timezone: TIMEZONE });
    const item = rows[0];
    if (!item) return null;
    const fx = localizeFixture(item);
    const comp = item.league?.id != null ? getCompetitionByLeagueId(item.league.id) : undefined;
    return {
      id: fixtureId,
      home: fx.home,
      away: fx.away,
      goals: fx.goals,
      status: { finished: fx.status.finished, live: fx.status.live, label: fx.status.label },
      round: fx.round,
      venueName: fx.venue?.name || null,
      kickoffIso: fx.date ?? null,
      competitionName: comp?.name ?? localizeSplCompetition(item.league?.name ?? "") ?? null,
    };
  });
}

// ---------- النادي: معلومات + تشكيلة + صفحة متكاملة ----------

const SQUAD_TTL = 24 * 60 * 60 * 1000; // التشكيلة شبه ثابتة خلال الموسم
const PLAYER_CARD_TTL = 60 * 60 * 1000; // الملف شبه ثابت؛ أرقام الموسم تتجدد كل ساعة

export interface SplTeamInfo {
  id: number;
  name: string;
  logo: string;
  country: string | null;
  founded: number | null;
  venue: { name: string; city: string; capacity: number | null; image: string } | null;
}

export interface SplSquadPlayer {
  id: number;
  name: string;
  number: number | null;
  position: string;
  positionEn: string;
  age: number | null;
  photo: string;
}

export interface SplSquad {
  team: SplTeamInfo;
  players: SplSquadPlayer[];
}

/** معلومات النادي (الملعب، سنة التأسيس) — اسم النادي بالخريطة الثابتة */
async function getTeamInfo(teamId: number): Promise<SplTeamInfo | null> {
  return withSWR(`spl:teaminfo:${teamId}`, SQUAD_TTL, SQUAD_TTL * 2, async () => {
    const rows = await apiGet("teams", { id: teamId });
    const entry = rows[0];
    if (!entry?.team?.id) return null;
    return {
      id: entry.team.id,
      name: localizeSplTeamName(entry.team.id, entry.team.name ?? ""),
      logo: entry.team.logo ?? "",
      country: entry.team.country ?? null,
      founded: entry.team.founded ?? null,
      venue: entry.venue
        ? {
            name: entry.venue.name ?? "",
            city: entry.venue.city ?? "",
            capacity: entry.venue.capacity ?? null,
            image: entry.venue.image ?? "",
          }
        : null,
    };
  });
}

/** تشكيلة النادي مرتّبة حسب المركز ثم الرقم */
export async function getSquad(teamId: number): Promise<SplSquad | null> {
  return withSWR(`spl:squad:${teamId}`, SQUAD_TTL, SQUAD_TTL * 2, async () => {
    const rows = await apiGet("players/squads", { team: teamId });
    const entry = rows[0];
    if (!entry) return null;
    const tr = await resolveNames((entry.players ?? []).map((p: any) => p.name));
    const players: SplSquadPlayer[] = (entry.players ?? [])
      .map((p: any): SplSquadPlayer => ({
        id: p.id ?? 0,
        name: localizeSplPlayerName(p.id, p.name ?? "", tr),
        number: p.number ?? null,
        position: SPL_POSITION_AR[p.position] ?? p.position ?? "",
        positionEn: p.position ?? "",
        age: p.age ?? null,
        photo: p.photo ?? "",
      }))
      .sort(
        (a: SplSquadPlayer, b: SplSquadPlayer) =>
          (SPL_POSITION_ORDER[a.positionEn] ?? 9) - (SPL_POSITION_ORDER[b.positionEn] ?? 9) ||
          (a.number ?? 99) - (b.number ?? 99)
      );
    const team: SplTeamInfo = {
      id: entry.team?.id ?? teamId,
      name: localizeSplTeamName(entry.team?.id, entry.team?.name ?? ""),
      logo: entry.team?.logo ?? "",
      country: null,
      founded: null,
      venue: null,
    };
    return { team, players };
  });
}

export interface SplTeamProfile {
  team: SplTeamInfo;
  /** صف النادي في ترتيب دوريه (إن كان في دوري له جدول) */
  standing: SplStandingRow | null;
  /** سلَك البطولة التي عُثر على النادي فيها (لجلب مبارياته) */
  competitionSlug: string | null;
  competitionName: string | null;
  fixtures: SplFixture[];
  squad: SplSquadPlayer[];
  /** الموجة 1: إثراء اختياري — يُملأ فقط إن طُلب عبر ?with=stats */
  stats: SplTeamStats | null;
  coach: SplCoach | null;
  topScorers: SplTeamScorer[];
}

/**
 * صفحة النادي المتكاملة: هويته + صفّه في ترتيب دوريه + مبارياته + تشكيلته.
 * يحدّد دوري النادي بالبحث في جداول البطولات السعودية ذات الترتيب (روشن أولًا).
 * كل النداءات خلف كاش SWR مشترك، فالتجميع لا يكلّف المزود نداءات تُذكر.
 *
 * بموجب الموجة 1: تُضاف إحصاءات النادي + المدرب + هدّافوه عند تمرير
 * withExtras=true (تُجلب فقط في صفحة النادي، لا في الاستهلاك الداخلي).
 */
export async function getTeamProfile(teamId: number, opts?: { withExtras?: boolean }): Promise<SplTeamProfile | null> {
  const leagueComps = SAUDI_COMPETITIONS.filter((c) => c.hasStandings);

  // معلومات النادي + التشكيلة لا تعتمدان على البطولة، فنبدأهما فورًا بالتوازي مع
  // اكتشاف بطولة النادي — يقلّص زمن البرود بدمج النداءات بدل تسلسلها.
  const basePromise = Promise.all([
    getTeamInfo(teamId).catch(() => null),
    getSquad(teamId).catch(() => null),
  ]);

  // اكتشاف بطولة النادي وصفّه: نجلب جداول البطولات بالتوازي بدل التسلسل.
  // قبل الموسم قد تكون الجداول الجديدة فارغة، فالتسلسل كان يمرّ على كل
  // البطولات الأربع متتاليًا (٨+ نداءات) ويبطّئ الصفحة عدة ثوانٍ.
  let comp: SaudiCompetition | null = null;
  let standing: SplStandingRow | null = null;
  const tables = await Promise.all(
    leagueComps.map((c) =>
      getStandings(c)
        .catch(() => [] as SplStandingRow[])
        .then((table) => ({ c, table }))
    )
  );
  for (const { c, table } of tables) {
    const row = table.find((r) => r.team.id === teamId);
    if (row) {
      comp = c;
      standing = row;
      break;
    }
  }

  // الإثراء يُجلب فقط حين يطلبه المستهلك (?with=stats)، حتى لا تُكلّف النقطة
  // الأساسية نداءات إضافية. المباريات (تعتمد على البطولة) + الإثراء يُجلبان
  // بالتوازي مع بعضهما وبعد معرفة البطولة، ومع نتيجة basePromise الجارية.
  const withExtras = opts?.withExtras === true;
  const [[info, squad], fixturesAll, [stats, coach, topScorers]] = await Promise.all([
    basePromise,
    comp ? getFixtures(comp).catch(() => [] as SplFixture[]) : Promise.resolve([] as SplFixture[]),
    withExtras
      ? Promise.all([
          getTeamStats(teamId, comp).catch(() => null),
          getTeamCoach(teamId).catch(() => null),
          getTeamTopScorers(teamId, comp).catch(() => [] as SplTeamScorer[]),
        ])
      : Promise.resolve([null, null, [] as SplTeamScorer[]] as const),
  ]);

  const fixtures: SplFixture[] = fixturesAll
    .filter((f) => f.home.id === teamId || f.away.id === teamId)
    .sort((a, b) => a.timestamp - b.timestamp);

  const team: SplTeamInfo | null = info ?? squad?.team ?? (standing
    ? { id: standing.team.id, name: standing.team.name, logo: standing.team.logo, country: null, founded: null, venue: null }
    : null);
  if (!team || !team.id) return null;

  return {
    team,
    standing,
    competitionSlug: comp?.slug ?? null,
    competitionName: comp?.name ?? null,
    fixtures,
    squad: squad?.players ?? [],
    stats,
    coach,
    topScorers,
  };
}

// ---------- ميتا صفحة النادي (OG/SEO) ----------

export interface SplTeamSeoMeta {
  id: number;
  name: string;
  logo: string;
  founded: number | null;
  venueName: string | null;
  venueCity: string | null;
  venueImage: string | null;
  competitionName: string | null;
  rank: number | null;
  points: number | null;
}

/**
 * بيانات خفيفة لميتا صفحة النادي (`/sports2/team/:id`) — اسمه وشعاره وملعبه
 * وصفّه في الترتيب فقط، بلا جلب التشكيلة أو المباريات. نداءان كحدّ أقصى
 * (الترتيب + معلومات النادي) وكلاهما خلف كاش SWR، فالاستهلاك من زواحف الـ
 * SEO رخيص. يُستهلك من seoInjector و /api/edge/seo-meta.
 */
export async function getTeamSeoMeta(teamId: number): Promise<SplTeamSeoMeta | null> {
  if (!isSaudiLeagueConfigured()) return null;

  const leagueComps = SAUDI_COMPETITIONS.filter((c) => c.hasStandings);
  let competitionName: string | null = null;
  let rank: number | null = null;
  let points: number | null = null;
  let standingTeam: SplTeam | null = null;
  for (const c of leagueComps) {
    const table = await getStandings(c).catch(() => [] as SplStandingRow[]);
    const row = table.find((r) => r.team.id === teamId);
    if (row) {
      competitionName = c.name;
      rank = row.rank;
      points = row.points;
      standingTeam = row.team;
      break;
    }
  }

  const info = await getTeamInfo(teamId).catch(() => null);
  const team: SplTeamInfo | null =
    info ??
    (standingTeam
      ? { id: standingTeam.id, name: standingTeam.name, logo: standingTeam.logo, country: null, founded: null, venue: null }
      : null);
  if (!team || !team.id) return null;

  return {
    id: team.id,
    name: team.name,
    logo: team.logo,
    founded: team.founded,
    venueName: team.venue?.name || null,
    venueCity: team.venue?.city || null,
    venueImage: team.venue?.image || null,
    competitionName,
    rank,
    points,
  };
}

// ---------- بطاقة اللاعب الشاملة ----------

const parseMetric = (value: unknown): number | null => {
  const n = parseInt(String(value ?? "").replace(/\D/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export interface SplPlayerSeasonStats {
  competition: string;
  team: SplTeam;
  matches: number;
  lineups: number;
  minutes: number;
  rating: number | null;
  goals: number;
  assists: number;
  yellow: number;
  red: number;
  saves: number;
  conceded: number;
}

export interface SplPlayerCareerStop {
  teamId: number;
  team: string;
  logo: string;
  seasons: number[];
}

export interface SplPlayerTrophy {
  competition: string;
  country: string;
  season: string;
  place: string;
  winner: boolean;
}

export interface SplPlayerCard {
  id: number;
  name: string;
  fullName: string | null;
  photo: string;
  position: string;
  number: number | null;
  age: number | null;
  birthDate: string | null;
  birthPlace: string | null;
  nationality: string | null;
  height: number | null;
  weight: number | null;
  /** أرقام اللاعب في كل بطولة لعبها هذا الموسم (الأكثر مشاركةً أولًا) */
  seasonStats: SplPlayerSeasonStats[];
  career: SplPlayerCareerStop[];
  trophies: SplPlayerTrophy[];
  /** النادي الحالي = أحدث ناد في المسيرة (يستبعد المنتخب) — أدقّ من أكثر البطولات مشاركةً بعد الانتقالات */
  currentTeam: SplTeam | null;
}

export async function getPlayerCard(playerId: number): Promise<SplPlayerCard | null> {
  // موسم دوري روشن الحالي كمرجع لأرقام الموسم الجاري
  const proLeague = SAUDI_COMPETITIONS.find((c) => c.slug === "pro-league")!;
  const season = await seasonFor(proLeague);

  return withSWR(`spl:player:${playerId}`, PLAYER_CARD_TTL, PLAYER_CARD_TTL * 2, async () => {
    const [profileRows, careerRows, trophyRows, statsRows] = await Promise.all([
      apiGet("players/profiles", { player: playerId }),
      apiGet("players/teams", { player: playerId }).catch(() => [] as any[]),
      apiGet("trophies", { player: playerId }).catch(() => [] as any[]),
      apiGet("players", { id: playerId, season }).catch(() => [] as any[]),
    ]);

    const p = profileRows[0]?.player;
    if (!p?.id) return null;

    const seasonStats: SplPlayerSeasonStats[] = (statsRows[0]?.statistics ?? [])
      .map((st: any): SplPlayerSeasonStats => ({
        competition: localizeSplCompetition(st.league?.name ?? ""),
        team: localizeTeam(st.team),
        matches: st.games?.appearences ?? 0,
        lineups: st.games?.lineups ?? 0,
        minutes: st.games?.minutes ?? 0,
        rating: Number.isFinite(parseFloat(st.games?.rating ?? "")) ? parseFloat(st.games.rating) : null,
        goals: st.goals?.total ?? 0,
        assists: st.goals?.assists ?? 0,
        yellow: st.cards?.yellow ?? 0,
        red: (st.cards?.red ?? 0) + (st.cards?.yellowred ?? 0),
        saves: st.goals?.saves ?? 0,
        conceded: st.goals?.conceded ?? 0,
      }))
      .filter((s: SplPlayerSeasonStats) => s.matches > 0)
      .sort((a: SplPlayerSeasonStats, b: SplPlayerSeasonStats) => b.matches - a.matches);

    const career: SplPlayerCareerStop[] = careerRows
      .map((row: any): SplPlayerCareerStop => ({
        teamId: row.team?.id ?? 0,
        team: localizeSplTeamName(row.team?.id, row.team?.name ?? ""),
        logo: row.team?.logo ?? "",
        seasons: ((row.seasons ?? []) as number[]).filter((s) => Number.isFinite(s)).sort((a, b) => a - b),
      }))
      .filter((stop: SplPlayerCareerStop) => stop.team)
      .sort(
        (a: SplPlayerCareerStop, b: SplPlayerCareerStop) =>
          (b.seasons[b.seasons.length - 1] ?? 0) - (a.seasons[a.seasons.length - 1] ?? 0)
      );

    // النادي الحالي: أحدث ناد في المسيرة (نستبعد المنتخب) — أدقّ بعد الانتقالات من
    // «أكثر البطولات مشاركةً» الذي قد يبقى على ناد سابق بسبب مباريات كأس مبكرة.
    const clubStops = (careerRows as any[])
      .filter((row) => row?.team?.id && row.team.national !== true && row.team.name !== p.nationality)
      .map((row) => ({
        id: row.team.id as number,
        name: localizeSplTeamName(row.team.id, row.team.name ?? ""),
        logo: (row.team.logo as string) ?? "",
        last: Math.max(0, ...((row.seasons ?? []) as number[]).filter((s: number) => Number.isFinite(s))),
      }))
      .sort((a, b) => b.last - a.last);
    const currentTeam: SplTeam | null = clubStops[0]
      ? { id: clubStops[0].id, name: clubStops[0].name, logo: clubStops[0].logo, winner: null }
      : seasonStats[0]?.team ?? null;

    const seen = new Set<string>();
    const trophies: SplPlayerTrophy[] = trophyRows
      .filter((row: any) => row?.league && row?.season)
      .filter((row: any) => {
        const key = `${row.league}|${row.country}|${row.season}|${row.place}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((row: any): SplPlayerTrophy => ({
        competition: localizeSplCompetition(row.league),
        country: localizeSplCountry(row.country ?? ""),
        season: String(row.season),
        place: SPL_TROPHY_PLACE_AR[row.place] ?? row.place ?? "",
        winner: row.place === "Winner",
      }))
      .sort((a: SplPlayerTrophy, b: SplPlayerTrophy) => b.season.localeCompare(a.season));

    const officialFull = [p.firstname, p.lastname].filter(Boolean).join(" ").trim();
    const tr = await resolveNames([p.name, officialFull, p.birth?.place]);
    const displayName = localizeSplPlayerName(p.id, p.name ?? "", tr);
    const translatedFull = officialFull ? tr(officialFull) : "";

    return {
      id: p.id,
      name: displayName,
      fullName: translatedFull && translatedFull !== displayName ? translatedFull : null,
      photo: p.photo ?? "",
      position: SPL_POSITION_AR[p.position] ?? p.position ?? "",
      number: p.number ?? null,
      age: p.age ?? null,
      birthDate: p.birth?.date ?? null,
      birthPlace: p.birth?.place ? tr(p.birth.place) : null,
      nationality: localizeSplCountry(p.nationality ?? "") || null,
      height: parseMetric(p.height),
      weight: parseMetric(p.weight),
      seasonStats,
      career,
      trophies,
      currentTeam,
    };
  });
}

// ---------- القيمة السوقية للاعب (TheSports) ----------

const MARKET_TTL = 24 * 60 * 60 * 1000; // القيمة السوقية شبه ثابتة

export interface SplMarketPoint {
  time: number; // ثوانٍ (epoch)
  value: number;
}

export interface SplPlayerMarket {
  available: boolean;
  value: number | null;
  currency: string;
  peak: number | null;
  history: SplMarketPoint[];
}

const EMPTY_MARKET: SplPlayerMarket = { available: false, value: null, currency: "€", peak: null, history: [] };

// تطبيع اسم للمطابقة بين API-Football وTheSports (إنجليزي): إزالة التشكيل/علامات.
function normName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * القيمة السوقية للاعب نادٍ سعودي + تاريخها (TheSports). نجسر اللاعب إلى معرّف
 * TheSports عبر قائمة ناديه (team/squad/list مطابقة بالاسم ثم الرقم) ثم نجلب
 * تاريخ القيمة (player/market/list)، ونتراجع للقيمة الحالية على مستوى البطولة
 * (player/with_stat/list) عند غياب التاريخ. أفضل جهد: أي تعذّر/IP غير مُدرَج →
 * available:false فتُخفى الواجهة. كاش 24 ساعة.
 */
export async function getPlayerMarketValue(playerId: number): Promise<SplPlayerMarket> {
  if (!isSaudiLeagueConfigured()) return EMPTY_MARKET;
  return withSWR(`spl:market:${playerId}`, MARKET_TTL, MARKET_TTL * 2, async () => {
    // النادي الحالي من بطاقة اللاعب (أحدث ناد في المسيرة — صحيح بعد الانتقالات)،
    // والاسم/الرقم الإنجليزيان من الملف الشخصي (للمطابقة في قائمة TheSports).
    const [card, profileRows] = await Promise.all([
      getPlayerCard(playerId).catch(() => null),
      apiGet("players/profiles", { player: playerId }).catch(() => [] as any[]),
    ]);
    const clubId = card?.currentTeam?.id;
    if (!clubId) return EMPTY_MARKET;
    const p = profileRows[0]?.player;
    const playerNameEn = String(p?.name ?? "").trim();
    const playerNumber: number | null = typeof p?.number === "number" ? p.number : null;

    // نحلّ بطولة النادي ومعرّف TheSports عبر بطولات الترتيب (روشن أولًا) — أول إصابة.
    const resolved = await resolveSplClubUuid(clubId);
    if (!resolved) return EMPTY_MARKET;
    const comp = resolved.comp;
    const squad = await getTsTeamSquad(resolved.uuid);
    if (squad.length === 0) return EMPTY_MARKET;

    const target = normName(playerNameEn);
    let match = target ? squad.find((s) => normName(s.name) === target) : undefined;
    if (!match && playerNumber != null) match = squad.find((s) => s.shirtNumber === playerNumber);
    if (!match && target) {
      const last = target.split(" ").pop() || "";
      if (last.length >= 3) match = squad.find((s) => normName(s.name).split(" ").includes(last));
    }
    if (!match) return EMPTY_MARKET;

    const history = await getTsPlayerMarketHistory(match.id).catch(() => []);
    if (history.length > 0) {
      const latest = history[history.length - 1];
      return {
        available: true,
        value: latest.value,
        currency: latest.currency,
        peak: Math.max(...history.map((h) => h.value)),
        history: history.map((h) => ({ time: h.time, value: h.value })),
      };
    }
    // تراجع: القيمة الحالية فقط من خريطة البطولة (بلا تاريخ).
    const tsCompId = getTsCompetitionId(comp.slug);
    if (tsCompId) {
      const mvMap = await getTsCompetitionPlayerMarket(tsCompId).catch(() => new Map());
      const mv = mvMap.get(match.id);
      if (mv?.marketValue) {
        return { available: true, value: mv.marketValue, currency: mv.currency, peak: mv.marketValue, history: [] };
      }
    }
    return EMPTY_MARKET;
  });
}

// ---------- فورمة اللاعب (SportMonks) — آخر مبارياته بتقييم/xG ----------

const PLAYER_FORM_TTL = 6 * 60 * 60 * 1000;

export interface SplPlayerFormMatch {
  date: string;
  opponent: string;
  opponentLogo: string;
  homeAway: "home" | "away";
  result: "W" | "D" | "L";
  scoreFor: number;
  scoreAgainst: number;
  xg: number | null;
  goals: number;
  rating: number | null;
  league: string;
}

export interface SplPlayerForm {
  available: boolean;
  matches: SplPlayerFormMatch[];
}

/**
 * فورمة اللاعب: آخر ٥ مباريات (نتيجة/تقييم/xG) عبر SportMonks، مجسورًا بالاسم
 * الإنجليزي + الميلاد. أسماء الخصوم معرَّبة best-effort والبطولة عبر قاموسنا.
 * أفضل جهد: أي تعذّر → available:false فتُخفى الواجهة. كاش 6 ساعات.
 */
export async function getPlayerForm(playerId: number): Promise<SplPlayerForm> {
  if (!isSaudiLeagueConfigured() || !isSportmonksConfigured()) return { available: false, matches: [] };
  return withSWR(`spl:form:${playerId}`, PLAYER_FORM_TTL, PLAYER_FORM_TTL * 2, async () => {
    const profileRows = await apiGet("players/profiles", { player: playerId }).catch(() => [] as any[]);
    const p = profileRows[0]?.player;
    if (!p) return { available: false, matches: [] };
    const form = await smGetPlayerForm({
      firstname: p.firstname ?? null,
      lastname: p.lastname ?? null,
      dob: p.birth?.date ?? null,
    }).catch(() => ({ available: false, matches: [] }));
    if (!form.available || form.matches.length === 0) return { available: false, matches: [] };
    const tr = await resolveNames(form.matches.map((m) => m.opponent)).catch(() => null);
    return {
      available: true,
      matches: form.matches.map((m) => ({
        ...m,
        opponent: (tr ? tr(m.opponent) : m.opponent) || m.opponent,
        league: localizeSplCompetition(m.league),
      })),
    };
  });
}

// ---------- الموجة 1: إثراء النادي والبطولة ----------

const ASSISTS_TTL = CACHE_TTL.LONG; // صنّاع الأهداف يتحرك ببطء كالهدّافين
const TEAM_STATS_TTL = 30 * 60 * 1000; // إحصاءات النادي شبه ثابتة بين الجولات
const COACH_TTL = 6 * 60 * 60 * 1000; // المدرب لا يتغيّر إلا بين المواسم غالبًا
const TEAM_SCORERS_TTL = CACHE_TTL.LONG; // هدّافو النادي يحتاج تجديدًا بطيئًا

/** هل تدعم البطولة إحصاءات تفصيلية للفرق؟ نفس علم hasStats في SAUDI_COMPETITIONS. */
function competitionForStats(comp: SaudiCompetition | null): SaudiCompetition | null {
  return comp && comp.hasStats ? comp : null;
}

// ---- صنّاع الأهداف ----

export interface SplAssister {
  rank: number;
  id: number;
  name: string;
  photo: string;
  team: SplTeam;
  goals: number;
  assists: number;
  matches: number;
}

/**
 * أعلى صنّاع الأهداف في بطولة. نفس بنية topScorers لكنها تستدعي
 * players/topassists. ترجع [] للبطولات التي لا تدعمها أو إن غاب المزوّد.
 */
export async function getTopAssists(comp: SaudiCompetition, seasonOverride?: number): Promise<SplAssister[]> {
  if (!comp.hasScorers) return [];
  const season = seasonOverride ?? await seasonFor(comp);
  return withSWR(`spl:assists:${comp.id}:${season}`, ASSISTS_TTL, ASSISTS_TTL * 2, async () => {
    const rows = await apiGet("players/topassists", { league: comp.id, season });
    const tr = await resolveNames(rows.map((r: any) => r.player?.name));
    return rows.slice(0, 15).map((row: any, index: number): SplAssister => {
      const stats = row.statistics?.[0] ?? {};
      return {
        rank: index + 1,
        id: row.player?.id ?? 0,
        name: localizeSplPlayerName(row.player?.id, row.player?.name ?? "", tr),
        photo: row.player?.photo ?? "",
        team: localizeTeam(stats.team),
        goals: stats.goals?.total ?? 0,
        assists: stats.goals?.assists ?? 0,
        matches: stats.games?.appearences ?? 0,
      };
    });
  });
}

// ---- إحصاءات النادي الشاملة (teams/statistics) ----

export interface SplTeamStatFixtures {
  played: { total: number; home: number; away: number };
  wins: { total: number; home: number; away: number };
  draws: { total: number; home: number; away: number };
  loses: { total: number; home: number; away: number };
}

export interface SplTeamStatGoals {
  for: { total: number; average: string; home: string; away: string };
  against: { total: number; average: string; home: string; away: string };
}

export interface SplTeamStatBiggest {
  winsHome: string | null;
  winsAway: string | null;
  losesHome: string | null;
  losesAway: string | null;
  streakWin: number | null;
  streakLose: number | null;
  streakDraw: number | null;
}

export interface SplTeamStatSummary {
  cleanSheets: { total: number; home: number; away: number };
  failedToScore: { total: number; home: number; away: number };
  cards: { yellowTotal: number; redTotal: number };
  mostUsedFormation: string | null;
}

export interface SplGoalTiming {
  bucket: string; // فترة الدقائق: "0-15" ... "76-90"
  for: number; // أهداف سجّلها الفريق في هذه الفترة
  against: number; // أهداف استقبلها
}

export interface SplTeamStats {
  leagueId: number;
  season: number;
  fixtures: SplTeamStatFixtures;
  goals: SplTeamStatGoals;
  biggest: SplTeamStatBiggest;
  summary: SplTeamStatSummary;
  timing: SplGoalTiming[];
}

const numOr0 = (v: any): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const strOrNull = (v: any): string | null => (typeof v === "string" && v.trim() ? v : null);
const numOrNull = (v: any): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * إحصاءات النادي الكاملة في بطولته: لعب/فوز/تعادل/خسارة (داخل وخارج الأرض)،
 * الأهداف له/عليه ومتوسطاتها، أكبر النتائج، أطول السلاسل، نظافة الشباك،
 * البطاقات، والتشكيلة الأكثر استخداماً. مصدرها teams/statistics.
 *
 * تتطلّب بطولة تدعم الإحصاءات (hasStats). إن لم تُمرَّر بطولة صراحةً نكتشف
 * دوري النادي بالبحث في جداول الترتيب (كما يفعل getTeamProfile)، حتى تعمل
 * النقطة المنفصلة /api/sports/team/:id/stats بلا حاجة لتحديد البطولة.
 */
export async function getTeamStats(
  teamId: number,
  compOverride?: SaudiCompetition | null,
): Promise<SplTeamStats | null> {
  // البطولة الممرّرة أولًا؛ وإلا نكتشفها من الترتيب.
  let comp = competitionForStats(compOverride ?? null);
  if (!comp) {
    const leagueComps = SAUDI_COMPETITIONS.filter((c) => c.hasStats);
    for (const c of leagueComps) {
      const table = await getStandings(c).catch(() => [] as SplStandingRow[]);
      if (table.some((r) => r.team.id === teamId)) {
        comp = c;
        break;
      }
    }
  }
  if (!comp) return null;
  const season = await seasonFor(comp);

  return withSWR(`spl:teamstats:${teamId}:${comp.id}`, TEAM_STATS_TTL, TEAM_STATS_TTL * 2, async () => {
    // ملاحظة: teams/statistics لا يدعم معامل timezone (عكس fixtures) — إرساله
    // يردّ خطأ "The Timezone field do not exist." ويفشل الطلب كله. تُترك الأهداف
    // كما يرجعها المزوّد (UTC)؛ الأرقام الإجمالية لا تتأثر بالمنطقة الزمنية.
    const rows = await apiGet("teams/statistics", {
      league: comp.id,
      season,
      team: teamId,
    });
    const data = rows[0];
    if (!data) return null;

    const fx = data.fixtures ?? {};
    const gl = data.goals ?? {};
    const bg = data.biggest ?? {};
    const cs = data.clean_sheet ?? {};
    const fts = data.failed_to_score ?? {};
    const cards = data.cards ?? {};

    // توزيع الأهداف حسب فترات الدقائق (له/عليه) — نُسقط الفترات الفارغة.
    const gfMin = gl.for?.minute ?? {};
    const gaMin = gl.against?.minute ?? {};
    const timing: SplGoalTiming[] = ["0-15", "16-30", "31-45", "46-60", "61-75", "76-90", "91-105", "106-120"]
      .map((b) => ({ bucket: b, for: numOr0(gfMin[b]?.total), against: numOr0(gaMin[b]?.total) }))
      .filter((t) => t.for > 0 || t.against > 0);

    return {
      leagueId: comp.id,
      season,
      fixtures: {
        played: { total: numOr0(fx.played?.total), home: numOr0(fx.played?.home), away: numOr0(fx.played?.away) },
        wins: { total: numOr0(fx.wins?.total), home: numOr0(fx.wins?.home), away: numOr0(fx.wins?.away) },
        draws: { total: numOr0(fx.draws?.total), home: numOr0(fx.draws?.home), away: numOr0(fx.draws?.away) },
        loses: { total: numOr0(fx.loses?.total), home: numOr0(fx.loses?.home), away: numOr0(fx.loses?.away) },
      },
      goals: {
        for: {
          total: numOr0(gl.for?.total?.total),
          average: strOrNull(gl.for?.average?.total) ?? "0",
          home: strOrNull(gl.for?.average?.home) ?? "0",
          away: strOrNull(gl.for?.average?.away) ?? "0",
        },
        against: {
          total: numOr0(gl.against?.total?.total),
          average: strOrNull(gl.against?.average?.total) ?? "0",
          home: strOrNull(gl.against?.average?.home) ?? "0",
          away: strOrNull(gl.against?.average?.away) ?? "0",
        },
      },
      biggest: {
        winsHome: strOrNull(bg.wins?.home),
        winsAway: strOrNull(bg.wins?.away),
        losesHome: strOrNull(bg.loses?.home),
        losesAway: strOrNull(bg.loses?.away),
        streakWin: numOrNull(bg.streak?.wins),
        streakLose: numOrNull(bg.streak?.loses),
        streakDraw: numOrNull(bg.streak?.draws),
      },
      summary: {
        cleanSheets: { total: numOr0(cs.total), home: numOr0(cs.home), away: numOr0(cs.away) },
        failedToScore: { total: numOr0(fts.total), home: numOr0(fts.home), away: numOr0(fts.away) },
        cards: {
          yellowTotal: numOr0(cards.yellow?.total),
          redTotal: numOr0(cards.red?.total),
        },
        mostUsedFormation: strOrNull(data.lineups?.[0]?.formation),
      },
      timing,
    };
  });
}

// ---- المدرب ----

export interface SplCoach {
  id: number;
  name: string;
  photo: string;
  nationality: string;
  age: number | null;
  startDate: string | null;
  career: { team: string; start: string | null; end: string | null }[];
}

/**
 * المدرب الحالي للنادي + أبرز محطّاته. المصدر coaches?team. الاسم يعود لخريطة
 * التعريب إن أمكن (اسم النادي)، وجنسية المدرب تُترجم عبر localizeSplCountry.
 */
export async function getTeamCoach(teamId: number): Promise<SplCoach | null> {
  return withSWR(`spl:coach:${teamId}`, COACH_TTL, COACH_TTL * 2, async () => {
    // coachs?team يعيد طاقم التدريب (مدرب + مساعدون). المدرب الأول هو الرئيسي.
    // ملاحظة: المعامل team لا id — id هو معرّف المدرب لا النادي.
    const rows = await apiGet("coachs", { team: teamId });
    const entry = Array.isArray(rows)
      ? rows.find((r: any) => Array.isArray(r?.career) && r.career.some((c: any) => c?.team?.id === teamId && !c?.end)) ?? rows[0]
      : null;
    if (!entry?.id) return null;
    const tr = await resolveNames([entry.name]);
    return {
      id: entry.id,
      name: localizeSplCoachName(entry.id, entry.name ?? "", tr),
      photo: entry.photo ?? "",
      nationality: localizeSplCountry(entry.nationality ?? "") || "",
      age: Number.isFinite(entry.age) ? entry.age : null,
      startDate: entry.career?.[0]?.start ? String(entry.career[0].start) : null,
      career: (Array.isArray(entry.career) ? entry.career : [])
        .map((c: any) => ({
          team: localizeSplTeamName(c.team?.id, c.team?.name ?? "") || c.team?.name || "",
          start: c.start ? String(c.start) : null,
          end: c.end ? String(c.end) : null,
        }))
        .filter((c: { team: string }) => c.team)
        .slice(0, 8),
    };
  });
}

// ---- هدّافو النادي ----

export interface SplTeamScorer {
  rank: number;
  id: number;
  name: string;
  photo: string;
  goals: number;
  assists: number;
  penalties: number;
  matches: number;
}

/**
 * أعلى 5 هدّافين في النادي خلال موسمه الحالي. تُجلب من players/topscorers
 * مفلترة على teamId ثم تُقتطع لأعلى 5. ترجع [] إن غابت البيانات.
 */
export async function getTeamTopScorers(
  teamId: number,
  compOverride?: SaudiCompetition | null,
): Promise<SplTeamScorer[]> {
  const comp = competitionForStats(compOverride ?? null) ?? SAUDI_COMPETITIONS.find((c) => c.slug === "pro-league")!;
  const season = await seasonFor(comp);

  return withSWR(`spl:teamscorers:${teamId}:${comp.id}`, TEAM_SCORERS_TTL, TEAM_SCORERS_TTL * 2, async () => {
    const rows = await apiGet("players/topscorers", { league: comp.id, season });
    const tr = await resolveNames(rows.map((r: any) => r.player?.name));
    return rows
      .filter((row: any) => row.statistics?.[0]?.team?.id === teamId)
      .slice(0, 5)
      .map((row: any, index: number): SplTeamScorer => {
        const stats = row.statistics?.[0] ?? {};
        return {
          rank: index + 1,
          id: row.player?.id ?? 0,
          name: localizeSplPlayerName(row.player?.id, row.player?.name ?? "", tr),
          photo: row.player?.photo ?? "",
          goals: stats.goals?.total ?? 0,
          assists: stats.goals?.assists ?? 0,
          penalties: stats.penalty?.scored ?? 0,
          matches: stats.games?.appearences ?? 0,
        };
      });
  });
}

// ---------- تقييمات لاعبي المباراة (رجل المباراة الحقيقي) ----------
// تُجلب بكسل (lazy) عند فتح تبويب التقييمات فقط — ليست ضمن getMatchDetail
// تفاديًا لنداءة خامسة ثقيلة (بيانات 22+ لاعبًا) على كل فتح مباراة.

export interface SplMatchPlayerRating {
  id: number;
  name: string;
  photo: string;
  teamId: number;
  team: string;
  number: number | null;
  pos: string;
  rating: number | null;
  minutes: number;
  goals: number;
  assists: number;
  yellow: number;
  red: number;
  captain: boolean;
}

export interface SplMatchRatings {
  motm: { id: number; name: string; team: string; rating: number } | null;
  players: SplMatchPlayerRating[];
}

export async function getMatchPlayerRatings(fixtureId: number): Promise<SplMatchRatings | null> {
  return withSWR(`spl:matchplayers:${fixtureId}`, MATCH_DETAIL_TTL, MATCH_DETAIL_TTL * 6, async () => {
    const rows = await apiGet("fixtures/players", { fixture: fixtureId });
    if (rows.length === 0) return null;

    const tr = await resolveNames(
      rows.flatMap((teamRow: any) => (teamRow.players ?? []).map((e: any) => e.player?.name)),
    );
    const players: SplMatchPlayerRating[] = [];
    for (const teamRow of rows) {
      const team = localizeTeam(teamRow.team);
      for (const entry of teamRow.players ?? []) {
        const st = entry.statistics?.[0] ?? {};
        const ratingNum = parseFloat(st.games?.rating ?? "");
        players.push({
          id: entry.player?.id ?? 0,
          name: localizeSplPlayerName(entry.player?.id, entry.player?.name ?? "", tr),
          photo: entry.player?.photo ?? "",
          teamId: team.id,
          team: team.name,
          number: st.games?.number ?? null,
          pos: POS_AR[st.games?.position] ?? st.games?.position ?? "",
          rating: Number.isFinite(ratingNum) ? ratingNum : null,
          minutes: st.games?.minutes ?? 0,
          goals: st.goals?.total ?? 0,
          assists: st.goals?.assists ?? 0,
          yellow: st.cards?.yellow ?? 0,
          red: st.cards?.red ?? 0,
          captain: st.games?.captain ?? false,
        });
      }
    }
    if (players.length === 0) return null;

    // الأعلى تقييمًا أولًا؛ من بلا تقييم في الأسفل.
    players.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
    const top = players[0];
    const motm =
      top && top.rating != null
        ? { id: top.id, name: top.name, team: top.team, rating: top.rating }
        : null;

    return { motm, players };
  });
}

// ============================================================
// الموجة 2/3 — إثراء إضافي
// ============================================================

const HISTORY_TTL = CACHE_TTL.LONG;
const TRANSFERS_TTL = 60 * 60 * 1000; // الانتقالات تتحرّك في النوافذ فقط
const INJURIES_TTL = 60 * 60 * 1000;
const PREDICTION_TTL = 15 * 60 * 1000; // التوقعات تُحدَّث قبل المباراة
const CARDS_TTL = CACHE_TTL.LONG;
const COMP_META_TTL = SEASON_TTL;

// ---------- البند 9: ترويسة البطولة (شعار + موسم) ----------

/**
 * حالة موسم البطولة:
 * - `ongoing`: انطلق الموسم ولم ينتهِ بعد (اليوم بين start و end).
 * - `upcoming`: موسم محدّد لكنه لم يبدأ بعد (today < start) — مثل الدوريات
 *    الأوروبية صيفًا التي يصبح موسمها current قبل انطلاقها بأسابيع.
 * - `finished`: انتهى الموسم (today > end).
 * - `unknown`: لا تتوفر تواريخ start/end من المزود.
 */
export type CompetitionStatus = "ongoing" | "upcoming" | "finished" | "unknown";

function computeStatus(start: string | null, end: string | null): CompetitionStatus {
  if (!start || !end) return "unknown";
  const today = new Date().toISOString().slice(0, 10); // بتوقيت UTC؛ تواريخ المزود يومية فلا حاجة لدقّة المنطقة
  if (today < start) return "upcoming";
  if (today > end) return "finished";
  return "ongoing";
}

export interface SplCompetitionMeta {
  logo: string | null;
  season: number;
  round: string | null;
  start: string | null;
  end: string | null;
  status: CompetitionStatus;
}

export async function getCompetitionMeta(comp: SaudiCompetition): Promise<SplCompetitionMeta> {
  try {
    // المفتاح موسوم بنسخة (v2) لأن شكل القيمة تغيّر (إضافة start/end/status)؛
    // رفع النسخة يُبطل القيم القديمة فورًا بدل انتظار TTL.
    // ملاحظة مهمة: لا نلتقط الخطأ داخل الـ fetcher — نتركه يُرمى حتى لا يخزّن
    // withSWR نتيجة fallback خاطئة (start/end=null) لـ 6 ساعات عند فشل/تحديد
    // معدّل من API-Football (يحدث وقت النشر مع رشقة الطلبات المتوازية).
    return await withSWR(`spl:compmeta:v2:${comp.id}`, COMP_META_TTL, COMP_META_TTL * 2, async () => {
      const rows = await apiGet("leagues", { id: comp.id });
      if (!rows.length) throw new Error(`[SaudiLeague] no league data for ${comp.id}`);
      const lg = rows[0]?.league ?? {};
      const seasons: any[] = rows[0]?.seasons ?? [];
      const current = seasons.find((s: any) => s.current) ?? seasons[seasons.length - 1];
      const start = typeof current?.start === "string" ? current.start : null;
      const end = typeof current?.end === "string" ? current.end : null;
      let status = computeStatus(start, end);
      // المزود قد يُبقي موسمًا قديمًا بعلم current بينما انطلقت مباريات الموسم
      // الجديد فعلًا (شائع في الدوريات العربية)، فيظهر «انتهى الموسم» خطأً.
      // وجود مباراة قادمة وشيكة دلالة كافية أن الموسم جارٍ — نطلب التالية فقط
      // حين تحتسب الحالة finished (تكلفة محدودة بطلب واحد للحالات النادرة).
      if (status === "finished") {
        const next = await apiGet("fixtures", { league: comp.id, next: 1 }).catch(() => []);
        const ts = next[0]?.fixture?.timestamp;
        if (typeof ts === "number" && (ts * 1000 - Date.now()) / 86_400_000 <= 21) {
          status = "ongoing";
        }
      }
      return {
        logo: lg.logo ?? null,
        season: typeof current?.year === "number" ? current.year : comp.fallbackSeason,
        round: null,
        start,
        end,
        status,
      };
    });
  } catch {
    // fallback غير مُخزَّن — الطلب التالي يعيد المحاولة (شفاء ذاتي).
    return { logo: null, season: comp.fallbackSeason, round: null, start: null, end: null, status: "unknown" };
  }
}

// تقييد التوازي عند جلب ميتا كل البطولات: بلا تقييد كان الإقلاع البارد يُطلق
// +34 نداءً متوازيًا لـ`leagues` دفعةً واحدة، فيتجاوز حدّ API-Football في الدقيقة،
// فتفشل معه نداءات المباريات/الترتيب اللحظية. 3 متوازية تبقينا تحت الحدّ، وكل
// نجاح يُكاش موسمًا كاملًا فتهدأ العاصفة بعد أول دورة. مشترك لمنع رشقات متزامنة.
const compMetaLimit = pLimit(3);

/** قائمة البطولات مُثراة بالشعار والموسم وحالته — لترويسة البطولة الديناميكية في الواجهة. */
export async function listCompetitionsWithMeta() {
  const base = listCompetitions();
  const metas = await Promise.all(
    SAUDI_COMPETITIONS.map((c) => compMetaLimit(() => getCompetitionMeta(c).catch(() => null)))
  );
  return base.map((c, i) => ({
    ...c,
    logo: metas[i]?.logo ?? null,
    season: metas[i]?.season ?? null,
    start: metas[i]?.start ?? null,
    end: metas[i]?.end ?? null,
    status: metas[i]?.status ?? ("unknown" as CompetitionStatus),
  }));
}

// ---------- نظرة الموسم (Season Outlook) — جاهزية ما قبل الموسم/العطلة ----------

const OUTLOOK_TTL = 30 * 60 * 1000;

/** مباريات موسم محدّد (غير الحالي) — يُستخدم لاستكشاف جدول الموسم القادم قبل أن يصبح current. */
async function getFixturesForSeason(comp: SaudiCompetition, season: number): Promise<SplFixture[]> {
  return withSWR(`spl:fixtures:${comp.id}:${season}`, FIXTURES_TTL * 5, FIXTURES_TTL * 10, async () => {
    const rows = await apiGet("fixtures", { league: comp.id, season, timezone: TIMEZONE });
    return rows.map(localizeFixture).sort((a, b) => a.timestamp - b.timestamp);
  });
}

export interface SplSeasonOutlook {
  /** in-season: مباريات جارية/قادمة الآن · pre-season: انطلاق قريب بجدول منشور · off-season: انتهى ولا جدول جديد بعد. */
  phase: "in-season" | "pre-season" | "off-season" | "unknown";
  season: number;
  status: CompetitionStatus;
  start: string | null;
  end: string | null;
  /** بطل الموسم المنتهي (متصدّر الجدول النهائي للدوريات فقط). */
  champion: { id: number; name: string; logo: string } | null;
  /** الموسم القادم (إن اختُلف عن الحالي). */
  nextSeason: number | null;
  /** تاريخ انطلاق الموسم القادم (YYYY-MM-DD) إن توفّر. */
  nextSeasonStart: string | null;
  /** توقيت أول مباراة قادمة (ms) — للعدّ التنازلي. */
  firstKickoff: number | null;
  /** أيام متبقّية حتى أول مباراة. */
  daysUntilKickoff: number | null;
  /** مباريات الجولة الأولى للموسم القادم (مقصورة) — لإبراز الافتتاح. */
  openers: SplFixture[];
}

/**
 * يكشف حالة البطولة بين المواسم تلقائيًا. المنطق:
 *  1. جارٍ: حالة ongoing أو وجود مباراة مباشرة/قادمة في الموسم الحالي.
 *  2. ما قبل الموسم: الموسم الحالي لم يبدأ بعد (upcoming) ⇒ افتتاحياته؛ أو الموسم
 *     انتهى لكن جدول الموسم القادم نُشر ⇒ افتتاحياته + عدّ تنازلي.
 *  3. عطلة: الموسم انتهى ولا جدول للموسم القادم بعد (نُبرز البطل وننتظر النشر).
 * كل النداءات أفضل جهد؛ يتراجع لـ in-season/unknown بسلاسة عند الشك.
 */
export async function getSeasonOutlook(comp: SaudiCompetition): Promise<SplSeasonOutlook> {
  return withSWR(`spl:outlook:${comp.id}`, OUTLOOK_TTL, OUTLOOK_TTL * 2, async () => {
    const meta = await getCompetitionMeta(comp);
    const fixtures = await getFixtures(comp).catch(() => [] as SplFixture[]);
    const now = Date.now();
    const hasLive = fixtures.some((f) => f.status.live);
    // قادمة في الموسم الحالي (سماح 3 ساعات للجارية حديثًا).
    const futureCurrent = fixtures
      .filter((f) => !f.status.finished && f.timestamp * 1000 >= now - 3 * 3_600_000)
      .sort((a, b) => a.timestamp - b.timestamp);

    let champion: SplSeasonOutlook["champion"] = null;
    if (comp.type === "league" && comp.hasStandings && meta.status === "finished") {
      const table = await getStandings(comp).catch(() => [] as SplStandingRow[]);
      const top = table[0];
      if (top && top.played > 0) champion = { id: top.team.id, name: top.team.name, logo: top.team.logo };
    }

    const base = { season: meta.season, status: meta.status, start: meta.start, end: meta.end, champion };
    const buildPre = (
      openersAll: SplFixture[],
      nextSeason: number,
      nextSeasonStart: string | null,
    ): SplSeasonOutlook => {
      const sorted = [...openersAll].sort((a, b) => a.timestamp - b.timestamp);
      const first = sorted[0];
      const kickoff = first.timestamp * 1000;
      return {
        ...base,
        phase: "pre-season",
        nextSeason,
        nextSeasonStart: nextSeasonStart ?? first.date.slice(0, 10),
        firstKickoff: kickoff,
        daysUntilKickoff: Math.max(0, Math.ceil((kickoff - now) / 86_400_000)),
        openers: sorted.filter((f) => f.round === first.round).slice(0, 10),
      };
    };

    // 1) جارٍ.
    if (meta.status === "ongoing" || hasLive || (meta.status !== "upcoming" && futureCurrent.length > 0)) {
      return { ...base, phase: "in-season", nextSeason: null, nextSeasonStart: null, firstKickoff: null, daysUntilKickoff: null, openers: [] };
    }

    // 2أ) الموسم الحالي لم يبدأ بعد.
    if (meta.status === "upcoming" && futureCurrent.length > 0) {
      return buildPre(futureCurrent, meta.season, meta.start);
    }

    // 2ب/3) الموسم انتهى ⇒ نتفقّد الموسم القادم.
    const nextSeason = meta.season + 1;
    let nextSeasonStart: string | null = null;
    try {
      const lgRows = await apiGet("leagues", { id: comp.id });
      const seasons: any[] = lgRows[0]?.seasons ?? [];
      const ns = seasons.find((s: any) => s.year === nextSeason);
      nextSeasonStart = typeof ns?.start === "string" ? ns.start : null;
    } catch {
      /* أفضل جهد */
    }

    const nextFx = await getFixturesForSeason(comp, nextSeason).catch(() => [] as SplFixture[]);
    const futureNext = nextFx.filter((f) => f.timestamp * 1000 >= now);
    if (futureNext.length > 0) {
      return buildPre(futureNext, nextSeason, nextSeasonStart);
    }

    return { ...base, phase: "off-season", nextSeason, nextSeasonStart, firstKickoff: null, daysUntilKickoff: null, openers: [] };
  });
}

// ---------- البند 5: تطوّر أداء اللاعب عبر المواسم ----------

export interface SplPlayerSeasonPoint {
  season: number;
  competition: string;
  matches: number;
  goals: number;
  assists: number;
}

export async function getPlayerSeasonHistory(playerId: number): Promise<SplPlayerSeasonPoint[]> {
  const proLeague = SAUDI_COMPETITIONS.find((c) => c.slug === "pro-league")!;
  const current = await seasonFor(proLeague);
  const years = [current - 3, current - 2, current - 1, current];

  const perYear = await Promise.all(
    years.map((year) =>
      withSWR(`spl:playerseason:${playerId}:${year}`, HISTORY_TTL, HISTORY_TTL * 2, async () => {
        const rows = await apiGet("players", { id: playerId, season: year }).catch(() => [] as any[]);
        const stats: any[] = rows[0]?.statistics ?? [];
        if (stats.length === 0) return null;
        // يجمع كل البطولات في الموسم؛ يُسمّي الموسم بأكثر بطولة مشاركةً.
        let matches = 0, goals = 0, assists = 0;
        let topComp = "", topApps = -1;
        for (const st of stats) {
          const apps = st.games?.appearences ?? 0;
          matches += apps;
          goals += st.goals?.total ?? 0;
          assists += st.goals?.assists ?? 0;
          if (apps > topApps) { topApps = apps; topComp = st.league?.name ?? ""; }
        }
        if (matches === 0) return null;
        return {
          season: year,
          competition: localizeSplCompetition(topComp),
          matches, goals, assists,
        } as SplPlayerSeasonPoint;
      }).catch(() => null)
    )
  );

  return perYear.filter((p): p is SplPlayerSeasonPoint => p != null);
}

// ---------- البند 6: انتقالات اللاعب ----------

export interface SplPlayerTransfer {
  date: string;
  type: string;
  fromId: number;
  from: string;
  fromLogo: string;
  toId: number;
  to: string;
  toLogo: string;
}

export async function getPlayerTransfers(playerId: number): Promise<SplPlayerTransfer[]> {
  return withSWR(`spl:transfers:player:${playerId}`, TRANSFERS_TTL, TRANSFERS_TTL * 2, async () => {
    const rows = await apiGet("transfers", { player: playerId });
    const list: any[] = rows[0]?.transfers ?? [];
    return list
      .map((t: any): SplPlayerTransfer => ({
        date: t.date ?? "",
        type: localizeSplTransferType(t.type),
        fromId: t.teams?.out?.id ?? 0,
        from: localizeSplTeamName(t.teams?.out?.id, t.teams?.out?.name ?? ""),
        fromLogo: t.teams?.out?.logo ?? "",
        toId: t.teams?.in?.id ?? 0,
        to: localizeSplTeamName(t.teams?.in?.id, t.teams?.in?.name ?? ""),
        toLogo: t.teams?.in?.logo ?? "",
      }))
      .filter((t: SplPlayerTransfer) => t.from || t.to)
      .sort((a: SplPlayerTransfer, b: SplPlayerTransfer) => b.date.localeCompare(a.date));
  });
}

// ---------- البند 7: إصابات/غيابات اللاعب ----------

export interface SplPlayerInjury {
  date: string;
  type: string;
  reason: string;
  team: string;
  competition: string;
}

export async function getPlayerInjuries(playerId: number, limit = 8): Promise<SplPlayerInjury[]> {
  const proLeague = SAUDI_COMPETITIONS.find((c) => c.slug === "pro-league")!;
  const current = await seasonFor(proLeague);
  const years = [current, current - 1];

  return withSWR(`spl:injuries:player:${playerId}`, INJURIES_TTL, INJURIES_TTL * 2, async () => {
    const batches = await Promise.all(
      years.map((season) => apiGet("injuries", { player: playerId, season }).catch(() => [] as any[]))
    );
    const seen = new Set<string>();
    const all: SplPlayerInjury[] = [];
    for (const rows of batches) {
      for (const row of rows) {
        const date = row.fixture?.date ?? row.player?.date ?? "";
        const reason = row.player?.reason ?? "";
        const key = `${date}|${reason}`;
        if (seen.has(key)) continue;
        seen.add(key);
        all.push({
          date,
          type: localizeSplInjuryType(row.player?.type),
          reason,
          team: localizeSplTeamName(row.team?.id, row.team?.name ?? ""),
          competition: localizeSplCompetition(row.league?.name ?? ""),
        });
      }
    }
    return all
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit);
  });
}

// ---------- البند 8: انتقالات النادي (وصل/غادر) ----------

export interface SplTeamTransfer {
  date: string;
  type: string;
  playerId: number;
  player: string;
  teamId: number;
  team: string;
  teamLogo: string;
}

export interface SplTeamTransfers {
  arrivals: SplTeamTransfer[];
  departures: SplTeamTransfer[];
}

export async function getTeamTransfers(teamId: number, limit = 15): Promise<SplTeamTransfers> {
  return withSWR(`spl:transfers:team:${teamId}`, TRANSFERS_TTL, TRANSFERS_TTL * 2, async () => {
    const rows = await apiGet("transfers", { team: teamId });
    const tr = await resolveNames(rows.map((r: any) => r.player?.name));
    const arrivals: SplTeamTransfer[] = [];
    const departures: SplTeamTransfer[] = [];

    for (const row of rows) {
      const playerId = row.player?.id ?? 0;
      const playerName = localizeSplPlayerName(playerId, row.player?.name ?? "", tr);
      for (const t of row.transfers ?? []) {
        const inId = t.teams?.in?.id ?? 0;
        const outId = t.teams?.out?.id ?? 0;
        const base = {
          date: t.date ?? "",
          type: localizeSplTransferType(t.type),
          playerId,
          player: playerName,
        };
        if (inId === teamId) {
          arrivals.push({ ...base, teamId: outId, team: localizeSplTeamName(outId, t.teams?.out?.name ?? ""), teamLogo: t.teams?.out?.logo ?? "" });
        } else if (outId === teamId) {
          departures.push({ ...base, teamId: inId, team: localizeSplTeamName(inId, t.teams?.in?.name ?? ""), teamLogo: t.teams?.in?.logo ?? "" });
        }
      }
    }

    const byDateDesc = (a: SplTeamTransfer, b: SplTeamTransfer) => b.date.localeCompare(a.date);
    return {
      arrivals: arrivals.sort(byDateDesc).slice(0, limit),
      departures: departures.sort(byDateDesc).slice(0, limit),
    };
  });
}

// ---------- البند 8.ب: مركز انتقالات الدوري (موجز موحّد لكل الأندية) ----------
//
// يجمع حركة الوصول/المغادرة لكل أندية دوري روشن في موجز واحد مرتّب زمنيًا،
// ليغذّي صفحة «مركز الانتقالات» العامة. يعيد استخدام نقطة transfers ذاتها
// (نفس مزوّد API-Football) لكنه يجمع ويزيل التكرار عبر الأندية.
//
// ملاحظة عن «المبلغ»: API-Football يضع قيمة الصفقة داخل حقل type كنصّ
// (مثل "€ 80M") وغالبًا يأتي "Free"/"Loan"/"N/A" — فنُصنّف النوع ونعرض
// المبلغ عند توفّره فقط (لا نختلق رقمًا).

export interface SplClub {
  id: number;
  name: string;
  logo: string;
}

const CLUBS_TTL = 12 * 60 * 60 * 1000; // قائمة الأندية تتغيّر بين المواسم فقط

/** أندية دوري روشن للموسم الحالي (لقائمة الفلترة + معرفة «نادٍ سعودي»). */
export async function getProLeagueClubs(): Promise<SplClub[]> {
  const comp = SAUDI_COMPETITIONS.find((c) => c.slug === "pro-league")!;
  const season = await seasonFor(comp);
  return withSWR(`spl:clubs:${comp.id}`, CLUBS_TTL, CLUBS_TTL * 2, async () => {
    const rows = await apiGet("teams", { league: comp.id, season });
    return rows
      .map((r: any): SplClub => ({
        id: r.team?.id ?? 0,
        name: localizeSplTeamName(r.team?.id, r.team?.name ?? ""),
        logo: r.team?.logo ?? "",
      }))
      .filter((c: SplClub) => c.id > 0)
      .sort((a: SplClub, b: SplClub) => a.name.localeCompare(b.name, "ar"));
  });
}

export type SplTransferKind = "money" | "free" | "loan" | "loanend" | "other";

/** تصنيف قيمة حقل type الخام (قبل التعريب) إلى فئة قابلة للفلترة. */
function classifyTransferKind(raw: string | null | undefined): SplTransferKind {
  const s = (raw ?? "").trim();
  const low = s.toLowerCase();
  if (!s || low === "n/a") return "other";
  if (low.includes("loan") && low.includes("end")) return "loanend";
  if (low.includes("loan")) return "loan";
  if (low.includes("free")) return "free";
  if (/[€$£]/.test(s) || /\d/.test(s)) return "money";
  return "other";
}

export interface SplLeagueTransfer {
  id: string; // مفتاح إزالة التكرار
  date: string; // ISO yyyy-mm-dd
  type: string; // النوع المعروض (مُعرَّب) أو المبلغ كما ورد
  kind: SplTransferKind;
  feeValue: number | null; // المبلغ بالأرقام (يورو) إن أمكن تحليله — للفرز فقط
  player: { id: number; name: string };
  from: { id: number; name: string; logo: string };
  to: { id: number; name: string; logo: string };
  inClubId: number | null; // نادي روشن المستقبِل (إن وُجد)
  outClubId: number | null; // نادي روشن المُطلِق (إن وُجد)
}

export interface SplLeagueTransfersResult {
  clubs: SplClub[];
  transfers: SplLeagueTransfer[];
  topDeals: SplLeagueTransfer[]; // أبرز الصفقات بمبلغ معلن (كامل السجل، الأعلى مبلغًا)
  stats: { total: number; withFee: number; loans: number; free: number };
}

/** يحلّل مبلغ الصفقة من نصّ مثل "€ 80M" / "€ 500K" إلى رقم (يورو). null عند التعذّر. */
function parseFeeValue(raw: string | null | undefined): number | null {
  const s = (raw ?? "").trim();
  const m = s.match(/([\d.]+)\s*([MmKk]?)/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  if (!Number.isFinite(num)) return null;
  const unit = m[2].toLowerCase();
  const mult = unit === "m" ? 1_000_000 : unit === "k" ? 1_000 : 1;
  return num * mult;
}

const LEAGUE_TRANSFERS_TTL = 60 * 60 * 1000; // الانتقالات تتحرّك في النوافذ فقط

export async function getLeagueTransfers(sinceMonths = 18, limit = 250): Promise<SplLeagueTransfersResult> {
  const clubs = await getProLeagueClubs();
  const clubIds = new Set(clubs.map((c) => c.id));
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - sinceMonths);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  return withSWR(`spl:transfers:league:${sinceMonths}`, LEAGUE_TRANSFERS_TTL, LEAGUE_TRANSFERS_TTL * 2, async () => {
    // انتقالات كل نادٍ بالتوازي — كل نداء مُكاش على حدة («أفضل جهد»: فشل نادٍ لا يُسقط الباقي).
    const perClub = await Promise.all(clubs.map((c) => apiGet("transfers", { team: c.id }).catch(() => [] as any[])));

    // مرحلة أولى: التقط الانتقالات الحقيقية التي تخصّ ناديًا من روشن (تنقّل بين ناديين
    // مختلفين)، مع علم «حديثة» للموجز الزمني — بلا تعريب بعد (نؤجّله للمعروض فقط).
    interface Pending { pid: number; rawName: string; t: any; inId: number; outId: number; recent: boolean; fee: number | null; }
    const seen = new Set<string>();
    const pending: Pending[] = [];
    for (const rows of perClub) {
      for (const it of rows) {
        const pid = it.player?.id ?? 0;
        const rawName = it.player?.name ?? "";
        for (const t of it.transfers ?? []) {
          const date = t.date ?? "";
          if (!date) continue;
          const inId = t.teams?.in?.id ?? 0;
          const outId = t.teams?.out?.id ?? 0;
          if (inId && outId && inId === outId) continue; // تجديد عقد/زيادة لا تنقّل
          if (!clubIds.has(inId) && !clubIds.has(outId)) continue;
          const key = `${pid}|${date}|${outId}|${inId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          pending.push({ pid, rawName, t, inId, outId, recent: date >= cutoffIso, fee: parseFeeValue(t.type) });
        }
      }
    }

    // اختر المعروض أولًا (موجز حديث + أبرز الصفقات)، ثم عرّب أسماءه فقط — لا نترجم
    // مئات الأسماء التاريخية غير المعروضة (تجنّبًا لمهلة الـAI داخل الطلب).
    const recentRaw = pending
      .filter((p) => p.recent)
      .sort((a, b) => b.t.date.localeCompare(a.t.date))
      .slice(0, limit);
    const topRaw = pending
      .filter((p) => p.fee != null && classifyTransferKind(p.t.type) === "money")
      .sort((a, b) => (b.fee ?? 0) - (a.fee ?? 0))
      .slice(0, 8);

    const names = new Set<string>();
    for (const p of [...recentRaw, ...topRaw]) if (p.rawName) names.add(p.rawName);
    // لا نحبس على الـAI: نعرّب بالمتاح فورًا (قاموس + كاش DB)، ونطلق ترجمة
    // الناقص بالخلفية لتملأ DB فتظهر مُعرَّبة في التحديث التالي (نمط مُثبَت).
    const nameList = [...names];
    const tr = await resolveNames(nameList, { skipAi: true });
    void resolveNames(nameList).catch(() => {});

    const build = ({ pid, rawName, t, inId, outId, fee }: Pending): SplLeagueTransfer => ({
      id: `${pid}|${t.date}|${outId}|${inId}`,
      date: t.date,
      type: localizeSplTransferType(t.type),
      kind: classifyTransferKind(t.type),
      feeValue: fee,
      player: { id: pid, name: localizeSplPlayerName(pid, rawName, tr) },
      from: { id: outId, name: localizeSplTeamName(outId, t.teams?.out?.name ?? ""), logo: t.teams?.out?.logo ?? "" },
      to: { id: inId, name: localizeSplTeamName(inId, t.teams?.in?.name ?? ""), logo: t.teams?.in?.logo ?? "" },
      inClubId: clubIds.has(inId) ? inId : null,
      outClubId: clubIds.has(outId) ? outId : null,
    });

    const transfers = recentRaw.map(build);
    const topDeals = topRaw.map(build);

    return {
      clubs,
      transfers,
      topDeals,
      stats: {
        total: transfers.length,
        withFee: transfers.filter((t) => t.kind === "money").length,
        loans: transfers.filter((t) => t.kind === "loan" || t.kind === "loanend").length,
        free: transfers.filter((t) => t.kind === "free").length,
      },
    };
  });
}

// ---------- البند 12: توقّعات المباراة ----------

export interface SplFixturePrediction {
  homePct: number;
  drawPct: number;
  awayPct: number;
  winnerId: number | null;
  winnerName: string | null;
  advice: string | null;
}

const pctToNum = (v: unknown): number => {
  const n = parseInt(String(v ?? "").replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
};

export async function getFixturePrediction(fixtureId: number): Promise<SplFixturePrediction | null> {
  return withSWR(`spl:prediction:${fixtureId}`, PREDICTION_TTL, PREDICTION_TTL * 2, async () => {
    const rows = await apiGet("predictions", { fixture: fixtureId });
    const p = rows[0]?.predictions;
    if (!p?.percent) return null;
    const homePct = pctToNum(p.percent.home);
    const drawPct = pctToNum(p.percent.draw);
    const awayPct = pctToNum(p.percent.away);
    if (homePct + drawPct + awayPct === 0) return null;
    // قبل توفّر بيانات الموسم يرجع المزوّد عنصرًا وهميًّا متساوي الأثلاث
    // (33/33/33 مع advice «No predictions available») — نُسقطه كي لا يُعرض
    // شريط احتمالات زائف (متحقَّق على كأس الملك 26/27 قبل انطلاقه).
    if (/no predictions available/i.test(p.advice ?? "")) return null;
    if (homePct === drawPct && drawPct === awayPct) return null;
    const winnerId = p.winner?.id ?? null;
    return {
      homePct, drawPct, awayPct,
      winnerId,
      winnerName: winnerId ? localizeSplTeamName(winnerId, p.winner?.name ?? "") : null,
      advice: p.advice ?? null,
    };
  });
}

// ---------- سجل أبطال الكؤوس متعدد المواسم ----------
// «سجلّ البطولة» من بيانات المزوّد الحقيقية (لا قوائم مكتوبة يدويًّا): لكل موسم
// منتهٍ نستنتج النهائي = آخر مباراة منتهية، ومنه البطل والوصيف والنتيجة
// والترجيح. المدى = المواسم المتاحة لدى المزوّد (كأس الملك: منذ 2016/17).

export interface SplCupEdition {
  /** سنة الموسم لدى المزوّد (2026 = نسخة 2025/26 — الكؤوس تُرقَّم بسنة النهاية) */
  season: number;
  champion: SplPreviousChampion | null;
  runnerUp: SplPreviousChampion | null;
  /** نتيجة النهائي بمنظور الفائز أولًا (مثل "2 - 1") */
  score: string | null;
  /** نتيجة الترجيح بمنظور الفائز أولًا إن حُسم النهائي به */
  penalties: string | null;
}

export interface SplCupRecord {
  sinceSeason: number | null;
  /** النسخ المنتهية، الأحدث أولًا */
  editions: SplCupEdition[];
  /** جدار الألقاب ضمن المدى المتاح، الأكثر تتويجًا أولًا */
  titles: { id: number; name: string; logo: string; titles: number; lastSeason: number }[];
}

export async function getCupChampionsRecord(comp: SaudiCompetition): Promise<SplCupRecord> {
  return withSWR(`spl:cuprecord:${comp.id}`, CACHE_TTL.LONG, CACHE_TTL.LONG * 4, async () => {
    const leagueRows = await apiGet("leagues", { id: comp.id }).catch(() => []);
    const seasons: number[] = (leagueRows[0]?.seasons ?? [])
      .map((s: any) => s.year)
      .filter((y: any) => typeof y === "number")
      .sort((a: number, b: number) => b - a);

    const editions: SplCupEdition[] = [];
    // تسلسليًّا عمدًا (~10 نداءات خلف كاش LONG) — لا نضغط حصة المزوّد دفعة واحدة.
    for (const season of seasons) {
      const fx = await apiGet("fixtures", { league: comp.id, season }).catch(() => []);
      const finished = fx
        .filter((r: any) => FINISHED_STATUSES.has(r.fixture?.status?.short))
        .sort((a: any, b: any) => (b.fixture?.timestamp ?? 0) - (a.fixture?.timestamp ?? 0));
      // موسم بلا مباريات منتهية = جارٍ/قادم — ليس نسخة محسومة
      if (finished.length === 0) continue;
      const final = finished[0];
      const home = final?.teams?.home;
      const away = final?.teams?.away;
      const winner = home?.winner ? home : away?.winner ? away : null;
      const loser = winner === home ? away : winner === away ? home : null;
      if (!winner) continue;
      const toTeam = (t: any): SplPreviousChampion => ({
        id: t?.id ?? 0,
        name: localizeSplTeamName(t?.id, t?.name ?? ""),
        logo: t?.logo ?? "",
      });
      const gWin = winner === home ? final?.goals?.home : final?.goals?.away;
      const gLose = winner === home ? final?.goals?.away : final?.goals?.home;
      const pen = final?.score?.penalty ?? {};
      const pWin = winner === home ? pen.home : pen.away;
      const pLose = winner === home ? pen.away : pen.home;
      editions.push({
        season,
        champion: toTeam(winner),
        runnerUp: loser ? toTeam(loser) : null,
        score: gWin != null && gLose != null ? `${gWin} - ${gLose}` : null,
        penalties: pWin != null && pLose != null ? `${pWin} - ${pLose}` : null,
      });
    }

    const byTeam = new Map<number, { id: number; name: string; logo: string; titles: number; lastSeason: number }>();
    for (const e of editions) {
      if (!e.champion) continue;
      const row = byTeam.get(e.champion.id);
      if (row) {
        row.titles += 1;
        row.lastSeason = Math.max(row.lastSeason, e.season);
      } else {
        byTeam.set(e.champion.id, { ...e.champion, titles: 1, lastSeason: e.season });
      }
    }
    const titles = [...byTeam.values()].sort((a, b) => b.titles - a.titles || b.lastSeason - a.lastSeason);

    return {
      sinceSeason: editions.length > 0 ? editions[editions.length - 1].season : null,
      editions,
      titles,
    };
  });
}

// ---------- إضافة: متصدّرو البطاقات (إنذارات/طرد) ----------

export interface SplCardLeader {
  rank: number;
  id: number;
  name: string;
  photo: string;
  team: string;
  teamLogo: string;
  yellow: number;
  red: number;
  matches: number;
}

async function getCardLeaders(comp: SaudiCompetition, kind: "yellow" | "red", seasonOverride?: number): Promise<SplCardLeader[]> {
  const season = seasonOverride ?? await seasonFor(comp);
  const path = kind === "yellow" ? "players/topyellowcards" : "players/topredcards";
  return withSWR(`spl:${path}:${comp.id}:${season}`, CARDS_TTL, CARDS_TTL * 2, async () => {
    const rows = await apiGet(path, { league: comp.id, season });
    const tr = await resolveNames(rows.map((r: any) => r.player?.name));
    return rows.slice(0, 10).map((row: any, index: number): SplCardLeader => {
      const st = row.statistics?.[0] ?? {};
      return {
        rank: index + 1,
        id: row.player?.id ?? 0,
        name: localizeSplPlayerName(row.player?.id, row.player?.name ?? "", tr),
        photo: row.player?.photo ?? "",
        team: localizeSplTeamName(st.team?.id, st.team?.name ?? ""),
        teamLogo: st.team?.logo ?? "",
        yellow: (st.cards?.yellow ?? 0) + (st.cards?.yellowred ?? 0),
        red: st.cards?.red ?? 0,
        matches: st.games?.appearences ?? 0,
      };
    });
  });
}

export function getTopYellowCards(comp: SaudiCompetition, seasonOverride?: number): Promise<SplCardLeader[]> {
  return getCardLeaders(comp, "yellow", seasonOverride);
}

export function getTopRedCards(comp: SaudiCompetition, seasonOverride?: number): Promise<SplCardLeader[]> {
  return getCardLeaders(comp, "red", seasonOverride);
}

// ============================================================
// المرحلة 2 (الذكاء): سرد المباراة + معاينة ما قبل المباراة
// نولّد نصًّا عربيًا عبر aiManager من البيانات الوقائعية المجلوبة أصلًا، خلف
// كاش SWR: توليد واحد يخدم كل الزوار خلال نافذة الكاش (يضبط التكلفة والكمون).
// النموذج يُمنع صراحةً من اختلاق أي معلومة غير معطاة.
// ============================================================

const STORY_LIVE_TTL = 60 * 1000; // المباراة جارية: تتجدد كل دقيقة مع الأحداث
const STORY_FT_TTL = 24 * 60 * 60 * 1000; // المباراة انتهت: السرد ثابت
const PREVIEW_TTL = 30 * 60 * 1000;

export interface SplMatchStory {
  text: string;
  generatedAt: number;
  live: boolean;
}

export interface SplMatchPreview {
  text: string;
  generatedAt: number;
}

/**
 * سرد صحفي عربي موجز للمباراة (جارية/منتهية) من أحداثها وإحصائياتها. يرجع null
 * قبل انطلاق المباراة أو إن تعذّر التوليد. مخزَّن: 1د للجارية، 24س للمنتهية.
 */
export async function generateMatchStory(fixtureId: number): Promise<SplMatchStory | null> {
  const detail = await getMatchDetail(fixtureId);
  if (!detail) return null;
  const fx = detail.fixture;
  if (!fx.status.live && !fx.status.finished) return null; // لا سرد قبل البداية
  const live = fx.status.live;
  const ttl = live ? STORY_LIVE_TTL : STORY_FT_TTL;

  return withSWR(`spl:story:${fixtureId}:${live ? "live" : "ft"}`, ttl, ttl * 2, async () => {
    const lines: string[] = [];
    lines.push(`المباراة: ${fx.home.name} (المضيف) ضد ${fx.away.name}`);
    if (fx.round) lines.push(`البطولة/الجولة: ${fx.round}`);
    if (fx.venue.name) lines.push(`الملعب: ${fx.venue.name}${fx.venue.city ? ` - ${fx.venue.city}` : ""}`);
    lines.push(live ? `الحالة: جارية — الدقيقة ${fx.status.elapsed ?? ""}` : "الحالة: انتهت");
    lines.push(`النتيجة: ${fx.home.name} ${fx.goals.home ?? 0} - ${fx.goals.away ?? 0} ${fx.away.name}`);
    if (detail.events.length > 0) {
      lines.push("الأحداث بالترتيب:");
      for (const e of detail.events) {
        const min = e.minute != null ? `${e.minute}'${e.extra ? `+${e.extra}` : ""}` : "";
        lines.push(`- ${min} ${e.label} | ${e.player}${e.assist ? ` (صناعة ${e.assist})` : ""} | ${e.team}`);
      }
    }
    if (detail.statistics) {
      const keys = ["Ball Possession", "Total Shots", "Shots on Goal", "Corner Kicks", "expected_goals"];
      const picked = detail.statistics.rows.filter((r) => keys.includes(r.type));
      if (picked.length > 0) {
        lines.push(`إحصاءات مختارة (${fx.home.name} / ${fx.away.name}):`);
        for (const r of picked) lines.push(`- ${r.label}: ${r.home ?? "-"} / ${r.away ?? "-"}`);
      }
    }

    const prompt = `أنت محرّر رياضي في صحيفة «سبق». اكتب تقريرًا صحفيًا موجزًا بالعربية الفصحى عن هذه المباراة اعتمادًا حصريًا على الوقائع التالية، دون اختلاق أي معلومة غير مذكورة ودون تحيّز. ${live ? "المباراة ما زالت جارية فاكتب بصيغة الحاضر وبما حدث حتى الآن." : "المباراة انتهت فاكتب بصيغة الماضي."} فقرة أو فقرتان (٩٠-١٦٠ كلمة)، نصًّا متّصلًا دون عناوين أو نقاط أو رموز.\n\nالوقائع:\n${lines.join("\n")}`;

    try {
      const res = await aiManager.generate(prompt, { ...AI_MODELS.GPT_5_1, maxTokens: 700 });
      const text = (res.content || "").trim();
      if (!text) return null;
      return { text, generatedAt: Date.now(), live };
    } catch (error) {
      console.error("[SaudiLeague] match story AI failed:", error);
      return null;
    }
  });
}

/**
 * معاينة عربية موجزة لمباراة مرتقبة من المواجهات السابقة والترجيحات. يرجع null
 * إن بدأت المباراة أو انتهت أو تعذّر التوليد. مخزَّنة 30 دقيقة.
 */
export async function generateMatchPreview(fixtureId: number): Promise<SplMatchPreview | null> {
  const detail = await getMatchDetail(fixtureId);
  if (!detail) return null;
  const fx = detail.fixture;
  if (fx.status.live || fx.status.finished) return null; // معاينة قبل البداية فقط

  return withSWR(`spl:preview:${fixtureId}`, PREVIEW_TTL, PREVIEW_TTL * 2, async () => {
    const [h2h, prediction] = await Promise.all([
      getHeadToHead(fx.home.id, fx.away.id).catch(() => null),
      getFixturePrediction(fixtureId).catch(() => null),
    ]);

    const lines: string[] = [];
    lines.push(`المباراة المرتقبة: ${fx.home.name} (المضيف) ضد ${fx.away.name}`);
    if (fx.round) lines.push(`البطولة/الجولة: ${fx.round}`);
    if (fx.venue.name) lines.push(`الملعب: ${fx.venue.name}${fx.venue.city ? ` - ${fx.venue.city}` : ""}`);
    if (h2h?.summary && h2h.summary.total > 0) {
      lines.push(`المواجهات السابقة (${h2h.summary.total}): فوز ${fx.home.name} ${h2h.summary.homeWins}، تعادل ${h2h.summary.draws}، فوز ${fx.away.name} ${h2h.summary.awayWins}`);
    }
    if (h2h?.meetings?.length) {
      lines.push("آخر اللقاءات:");
      for (const m of h2h.meetings.slice(0, 5)) {
        if (m.goals.home == null || m.goals.away == null) continue;
        lines.push(`- ${m.home.name} ${m.goals.home} - ${m.goals.away} ${m.away.name}`);
      }
    }
    if (prediction) {
      lines.push(`الترجيحات: فوز ${fx.home.name} ${prediction.homePct}%، تعادل ${prediction.drawPct}%، فوز ${fx.away.name} ${prediction.awayPct}%`);
      if (prediction.advice) lines.push(`توصية المزوّد: ${prediction.advice}`);
    }

    const prompt = `أنت محرّر رياضي في صحيفة «سبق». اكتب معاينة تشويقية موجزة بالعربية الفصحى لهذه المباراة المرتقبة اعتمادًا حصريًا على المعطيات التالية دون اختلاق أي معلومة غير مذكورة. اذكر سياق اللقاء وأبرز ما يُنتظر فيه. فقرة أو فقرتان (٩٠-١٥٠ كلمة)، نصًّا متّصلًا دون عناوين أو نقاط أو رموز.\n\nالمعطيات:\n${lines.join("\n")}`;

    try {
      const res = await aiManager.generate(prompt, { ...AI_MODELS.GPT_5_1, maxTokens: 600 });
      const text = (res.content || "").trim();
      if (!text) return null;
      return { text, generatedAt: Date.now() };
    } catch (error) {
      console.error("[SaudiLeague] match preview AI failed:", error);
      return null;
    }
  });
}
