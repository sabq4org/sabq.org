/**
 * خدمة SportMonks — مكمّل تغطية كأس العالم (لا تحلّ محل API-Football).
 *
 * تعطينا ما لا يوفّره API-Football: «الزخم الهجومي» عبر الزمن (من trends —
 * إضافة Match Facts)، خلف كاش SWR.
 *
 * ربط المعرّفات: الواجهة تعرف معرّف API-Football فقط؛ نحلّه إلى معرّف
 * SportMonks بمطابقة يوم الانطلاق (UTC) + اسمَي المنتخبين، ونخزّن الربط.
 *
 * كل طبقات الربط «أفضل جهد»: لو غاب التوكن أو لم نجد المباراة، نرجّع
 * { available:false } دون أي عطل — الواجهة تعرض حالة فارغة لبقة.
 */
import { withSWR, CACHE_TTL } from "../memoryCache";
import { getFixtureIdentity, type WcFixtureIdentity } from "./worldCupService";
import { translateCommentaries, type SmCommentary } from "./worldCupCommentaryTranslator";

const SM_BASE = "https://api.sportmonks.com/v3/football";
export const WC_LEAGUE_ID = 732; // World Cup عند SportMonks

// إيقاعات الكاش — الحيّ يتجدد بالثواني، والمنتهي ثابت
const SM_LIVE_TTL = 20 * 1000;
const SM_DONE_TTL = 60 * 60 * 1000;
const RESOLVE_TTL = 2 * 60 * 1000;

// حالات SportMonks (developer_name) التي تعني «المباراة جارية الآن»
const LIVE_STATES = new Set([
  "INPLAY_1ST_HALF",
  "INPLAY_2ND_HALF",
  "HT",
  "BREAK",
  "INPLAY_ET",
  "INPLAY_ET_2ND_HALF",
  "EXTRA_TIME",
  "PENALTIES",
  "INPLAY_PENALTIES",
]);

// ربط إيجابي فقط: معرّف API-Football → معرّف SportMonks (دائم بعد أول حلّ)
const fixtureIdMap = new Map<number, number>();

export function isSportmonksConfigured(): boolean {
  return Boolean((process.env.SPORTMONKS_API_TOKEN || "").trim());
}

/** مهلة قصيرة افتراضياً — إثراءات مركز المباراة أفضل أن تفشل سريعاً من أن تعلّق الصفحة 15ث. */
function smHttpTimeoutMs(): number {
  const n = Number(process.env.SPORTMONKS_HTTP_TIMEOUT_MS ?? 3500);
  return Number.isFinite(n) && n >= 1000 ? Math.min(n, 15_000) : 3500;
}

async function smFetch(url: URL): Promise<any> {
  const token = (process.env.SPORTMONKS_API_TOKEN || "").trim();
  if (!token) throw new Error("SPORTMONKS_API_TOKEN is not set");
  url.searchParams.set("api_token", token);

  const response = await fetch(url, { signal: AbortSignal.timeout(smHttpTimeoutMs()) });
  if (!response.ok) {
    throw new Error(`[SportMonks] HTTP ${response.status} for ${url.pathname}`);
  }
  return response.json();
}

async function smGet(path: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`${SM_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return smFetch(url);
}

// ---------- أخبار SportMonks التحريرية (معاينات + تقارير) ----------
// مادة تحريرية إنجليزية جاهزة من المزود لكل مباراة مونديال: معاينة ما قبل
// المباراة (سرد فقرتين) وتقرير ما بعدها (وقائع بالدقائق + اقتباسات). نستوردها
// مسودّات عربية في لوحة التحكم بعد إعادة الصياغة بصوت سبق. كل شيء «أفضل جهد»:
// غياب التوكن أو فشل النداء يرجّع مصفوفة فارغة دون عطل.

export interface SmNewsLine {
  id: number;
  newsitem_id: number;
  /** نص السطر الإنجليزي (فقرة معاينة، أو واقعة مباراة، أو اقتباس) */
  text: string;
  /** prematch: home | away — postmatch: line */
  type: string;
}

export interface SmNewsFixtureRef {
  id: number;
  name: string; // "Cape Verde Islands vs Saudi Arabia"
  starting_at: string; // "2026-06-27 00:00:00" (UTC)
  starting_at_timestamp: number; // ثوانٍ يونكس
  result_info: string | null; // "Saudi Arabia won after full-time." | null
  state_id: number;
  league_id: number;
}

export interface SmNewsLeagueRef {
  id: number;
  name: string;
  image_path: string | null;
  short_code: string | null;
}

export interface SmNewsItem {
  id: number; // معرّف الخبر (newsitem)
  fixture_id: number;
  league_id: number;
  title: string; // عنوان إنجليزي
  type: "prematch" | "postmatch";
  lines: SmNewsLine[];
  fixture: SmNewsFixtureRef | null;
  league: SmNewsLeagueRef | null;
}

const NEWS_INCLUDE = "lines;fixture;league";
const NEWS_TTL = 5 * 60 * 1000;
const NEWS_SWR = 2 * 60 * 1000;
const NEWS_PER_PAGE = "50"; // أقصى حجم صفحة يقبله المزوّد
const NEWS_MAX_PAGES = 12; // حارس ضد سلسلة مؤشّر لا تنتهي (600 عنصر تغطي بطولة كاملة)

function normalizeNewsItem(raw: any): SmNewsItem | null {
  if (!raw || typeof raw.id !== "number") return null;
  const lines: SmNewsLine[] = Array.isArray(raw.lines)
    ? raw.lines
        .filter((l: any) => l && typeof l.text === "string" && l.text.trim())
        .map((l: any) => ({
          id: Number(l.id),
          newsitem_id: Number(l.newsitem_id),
          text: String(l.text).trim(),
          type: String(l.type || "line"),
        }))
    : [];
  if (!lines.length) return null; // خبر بلا نص لا يفيدنا
  return {
    id: Number(raw.id),
    fixture_id: Number(raw.fixture_id),
    league_id: Number(raw.league_id),
    title: String(raw.title || "").trim(),
    type: raw.type === "postmatch" ? "postmatch" : "prematch",
    lines,
    fixture: raw.fixture
      ? {
          id: Number(raw.fixture.id),
          name: String(raw.fixture.name || ""),
          starting_at: String(raw.fixture.starting_at || ""),
          starting_at_timestamp: Number(raw.fixture.starting_at_timestamp || 0),
          result_info: raw.fixture.result_info ?? null,
          state_id: Number(raw.fixture.state_id || 0),
          league_id: Number(raw.fixture.league_id || 0),
        }
      : null,
    league: raw.league
      ? {
          id: Number(raw.league.id),
          name: String(raw.league.name || ""),
          image_path: raw.league.image_path ?? null,
          short_code: raw.league.short_code ?? null,
        }
      : null,
  };
}

/**
 * يتحقق من رابط next_cursor قبل اتباعه حرفيًا (نفس أصل المزوّد فقط).
 * لا نعيد تركيب باراميتراته: المزوّد يرفض (400) إرسال per_page مع cursor.
 */
function sanitizeNextCursorUrl(nextCursorUrl: unknown): URL | null {
  if (typeof nextCursorUrl !== "string" || !nextCursorUrl) return null;
  try {
    const url = new URL(nextCursorUrl);
    return url.origin === new URL(SM_BASE).origin ? url : null;
  } catch {
    return null;
  }
}

async function fetchNews(path: string, cacheKey: string): Promise<SmNewsItem[]> {
  if (!isSportmonksConfigured()) return [];
  try {
    // المزوّد يرجّع الأقدم أولًا بصفحات؛ لا بد من تتبّع المؤشّر حتى النهاية
    // وإلا سقطت أحدث التقارير خارج الصفحة الأولى بعد تجاوز عدد المباريات حجمها
    const data = await withSWR(cacheKey, NEWS_TTL, NEWS_SWR, async () => {
      const all: any[] = [];
      let next: URL | null = null;
      for (let page = 1; page <= NEWS_MAX_PAGES; page++) {
        let res: any;
        try {
          res = next
            ? await smFetch(next)
            : await smGet(path, { include: NEWS_INCLUDE, per_page: NEWS_PER_PAGE });
        } catch (error) {
          if (!all.length) throw error;
          console.warn(`[SportMonks] news pagination توقّف عند صفحة ${page} (${path}):`, error);
          break;
        }
        const rows = Array.isArray(res?.data) ? res.data : [];
        all.push(...rows);
        const pagination = res?.pagination;
        if (!pagination?.has_more) break;
        next = sanitizeNextCursorUrl(pagination.next_cursor);
        if (!next) {
          console.warn(`[SportMonks] news pagination: has_more بلا مؤشّر صالح (${path})`);
          break;
        }
        if (page === NEWS_MAX_PAGES) {
          console.warn(`[SportMonks] news pagination: بلغنا سقف ${NEWS_MAX_PAGES} صفحة (${path}) — الأحدث قد لم يُجلب`);
          break;
        }
      }
      return all;
    });
    const rows = Array.isArray(data) ? data : [];
    return rows.map(normalizeNewsItem).filter((x: SmNewsItem | null): x is SmNewsItem => x !== null);
  } catch (error) {
    console.warn(`[SportMonks] news fetch failed (${path}):`, error);
    return [];
  }
}

/** معاينات المباريات القادمة (pre-match) — قائمة عامة لكل مباراة مجدولة قريبًا */
export function fetchPrematchNews(): Promise<SmNewsItem[]> {
  return fetchNews("news/pre-match/upcoming", "sm:news:prematch");
}

/**
 * تقارير ما بعد المباراة (post-match) — كل المباريات المنتهية المتاحة،
 * بتتبّع ترقيم المؤشّر (next_cursor) حتى النهاية.
 */
export function fetchPostmatchNews(): Promise<SmNewsItem[]> {
  return fetchNews("news/post-match", "sm:news:postmatch");
}

// ---------- مطابقة أسماء المنتخبات بين المزوّدين ----------

function normTeam(name: string): string {
  return (name || "")
    .toLowerCase()
    .replace(/\b(fc|national team|u-?23)\b/g, "")
    .replace(/[^a-z]/g, "");
}

// فروقات تسمية معروفة بين API-Football وSportMonks — كلها تُسوّى لمفتاح موحّد.
// قابلة للتوسعة عند ظهور أي تعارض جديد في سجلات الإنتاج.
const TEAM_ALIASES: Record<string, string> = {
  usa: "unitedstates",
  unitedstates: "unitedstates",
  southkorea: "korearepublic",
  korearepublic: "korearepublic",
  iran: "iran",
  iriran: "iran",
  ivorycoast: "ivorycoast",
  ctedivoire: "ivorycoast",
  cotedivoire: "ivorycoast",
  capeverde: "capeverde",
  caboverde: "capeverde",
  czechia: "czechrepublic",
  czechrepublic: "czechrepublic",
  drcongo: "congodr",
  congodr: "congodr",
};

function teamKey(name: string): string {
  const n = normTeam(name);
  return TEAM_ALIASES[n] ?? n;
}

// ---------- حلّ معرّف SportMonks من معرّف API-Football ----------

async function resolveSportmonksFixtureId(
  apiFootballFixtureId: number,
  identity: WcFixtureIdentity
): Promise<number | null> {
  const cached = fixtureIdMap.get(apiFootballFixtureId);
  if (cached) return cached;

  // نستخدم 0 كقيمة «غير موجود» (لا null): withSWR يعامل null كـ«لا كاش»
  // فيُعيد جلب fixtures/date كل طلب لأي مباراة لا يحملها SportMonks أو يفشل
  // مطابقة اسمها — ما يستنزف حد SportMonks تحت الضغط. 0 يُخزَّن RESOLVE_TTL.
  const found = await withSWR<number>(
    `wc:smfix:${apiFootballFixtureId}`,
    RESOLVE_TTL,
    RESOLVE_TTL * 2,
    async () => {
      if (!identity.kickoffIso || !identity.homeNameEn || !identity.awayNameEn) return 0;
      const day = new Date(identity.kickoffIso).toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
      const resp = await smGet(`fixtures/date/${day}`, {
        filters: `fixtureLeagues:${WC_LEAGUE_ID}`,
        include: "participants",
      });
      const candidates: any[] = Array.isArray(resp?.data) ? resp.data : [];
      const homeKey = teamKey(identity.homeNameEn);
      const awayKey = teamKey(identity.awayNameEn);
      for (const fx of candidates) {
        const parts = (fx.participants ?? []).map((p: any) => teamKey(p?.name ?? ""));
        if (parts.includes(homeKey) && parts.includes(awayKey)) return fx.id ?? 0;
      }
      return 0;
    }
  );

  if (found > 0) {
    fixtureIdMap.set(apiFootballFixtureId, found);
    return found;
  }
  return null;
}

// ربط محايد البطولة (لـ/sports: سعودي/آسيا/...) بالأسماء + التاريخ، بلا فلتر دوري.
// اشتراكنا صغير (23 بطولة) فبحث fixtures/date يرجع مبارياتنا فقط، والمطابقة بالاسم تكفي.
const namedSmIdMap = new Map<string, number>();

/**
 * يحلّ معرّف SportMonks من هوية مباراة (تاريخ + اسمَي الفريقين الإنجليزيين)
 * عبر أي بطولة مشترَك بها — للبوابة الرياضية خارج المونديال.
 */
export async function resolveSmIdByNames(opts: {
  key: string;
  kickoffIso: string | null;
  homeNameEn: string | null;
  awayNameEn: string | null;
}): Promise<number | null> {
  const { key, kickoffIso, homeNameEn, awayNameEn } = opts;
  if (!kickoffIso || !homeNameEn || !awayNameEn) return null;
  const cached = namedSmIdMap.get(key);
  if (cached) return cached;

  const found = await withSWR<number>(
    `sm:resolve:${key}`,
    RESOLVE_TTL,
    RESOLVE_TTL * 2,
    async () => {
      const day = new Date(kickoffIso).toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
      const resp = await smGet(`fixtures/date/${day}`, { include: "participants" });
      const candidates: any[] = Array.isArray(resp?.data) ? resp.data : [];
      const homeKey = teamKey(homeNameEn);
      const awayKey = teamKey(awayNameEn);
      // تباين النقحرة (القادسية: qadisiyah/qadsiah) يكسر التطابق الصارم على الفريقين.
      // لكن الفريق يلعب مرة واحدة في اليوم: فتطابق فريق واحد بدقة + نفس التاريخ
      // يُعرّف المباراة فريدًا. نُفضّل تطابق الفريقين، ثم نقبل تطابق فريق واحد إن كان وحيدًا.
      const oneExact: number[] = [];
      for (const fx of candidates) {
        const parts = (fx.participants ?? []).map((p: any) => teamKey(p?.name ?? ""));
        const h = parts.includes(homeKey);
        const a = parts.includes(awayKey);
        if (h && a) return fx.id ?? 0;
        if (h || a) oneExact.push(fx.id ?? 0);
      }
      return oneExact.length === 1 ? oneExact[0] : 0;
    },
  );

  if (found > 0) {
    namedSmIdMap.set(key, found);
    return found;
  }
  return null;
}

/**
 * يحلّ معرّف API-Football إلى معرّف SportMonks ويختار إيقاع الكاش حسب الحالة.
 */
async function resolveFixture(
  apiFootballFixtureId: number,
  directSmId?: number
): Promise<{ smId: number; ttl: number } | null> {
  if (directSmId) return { smId: directSmId, ttl: CACHE_TTL.MEDIUM };
  const identity = await getFixtureIdentity(apiFootballFixtureId).catch(() => null);
  if (!identity) return null;
  const ttl = identity.live ? SM_LIVE_TTL : identity.finished ? SM_DONE_TTL : CACHE_TTL.MEDIUM;
  const smId = await resolveSportmonksFixtureId(apiFootballFixtureId, identity);
  return smId ? { smId, ttl } : null;
}

// ---------- الزخم الهجومي (من trends — إضافة Match Facts) ----------

export interface WcMomentumPoint {
  label: string; // وسم نهاية النافذة، مثل "15'"
  minute: number;
  home: number; // قيمة المقياس للمضيف داخل النافذة (موجبة)
  away: number; // للضيف (تُخزَّن سالبة لرسمها أسفل الصفر)
  net: number; // home - away (موجب = ضغط المضيف)
}

export interface WcMomentum {
  available: boolean;
  live: boolean;
  /** الاستحواذ في أحدث لحظة مسجّلة (مضيف/ضيف) */
  possession: { home: number; away: number } | null;
  points: WcMomentumPoint[];
}

const EMPTY_MOMENTUM: WcMomentum = {
  available: false,
  live: false,
  possession: null,
  points: [],
};

const BUCKET_MINUTES = 5;
// مقاييس الزخم بالأفضلية — الهجمات الخطيرة هي المؤشّر الكلاسيكي
const MOMENTUM_METRICS = ["Dangerous Attacks", "Attacks"];

function latestPossession(
  trends: any[],
  homeId: number,
  awayId: number
): { home: number; away: number } | null {
  const poss = trends.filter((t) => t.type?.name === "Ball Possession %");
  if (poss.length === 0) return null;
  const latestMin = Math.max(...poss.map((t) => t.minute ?? 0));
  const h = poss.find((t) => t.participant_id === homeId && t.minute === latestMin)?.value;
  const a = poss.find((t) => t.participant_id === awayId && t.minute === latestMin)?.value;
  if (h == null && a == null) return null;
  return {
    home: h ?? (a != null ? 100 - a : 0),
    away: a ?? (h != null ? 100 - h : 0),
  };
}

async function buildMomentum(smFixtureId: number): Promise<WcMomentum> {
  const resp = await smGet(`fixtures/${smFixtureId}`, {
    include: "trends.type;participants;state",
  });
  const data = resp?.data ?? {};
  const live = LIVE_STATES.has(data.state?.developer_name ?? "");
  const participants: any[] = Array.isArray(data.participants) ? data.participants : [];
  let homeId = participants.find((p) => p.meta?.location === "home")?.id;
  let awayId = participants.find((p) => p.meta?.location === "away")?.id;
  // fallback لو غاب meta.location: SportMonks يُرتّب المضيف أولًا
  if ((homeId == null || awayId == null) && participants.length === 2) {
    homeId = homeId ?? participants[0]?.id;
    awayId = awayId ?? participants[1]?.id;
  }
  const trends: any[] = Array.isArray(data.trends) ? data.trends : [];

  if (homeId == null || awayId == null || trends.length === 0) {
    return { ...EMPTY_MOMENTUM, live };
  }

  const possession = latestPossession(trends, homeId, awayId);
  const metricName = MOMENTUM_METRICS.find((m) => trends.some((t) => t.type?.name === m));
  if (!metricName) {
    return { available: possession != null, live, possession, points: [] };
  }

  // سلسلة تراكمية لكل فريق: minute → value
  const cumOf = (pid: number): Map<number, number> => {
    const map = new Map<number, number>();
    for (const t of trends) {
      if (t.type?.name === metricName && t.participant_id === pid && typeof t.minute === "number") {
        map.set(t.minute, t.value ?? 0);
      }
    }
    return map;
  };
  const homeCum = cumOf(homeId);
  const awayCum = cumOf(awayId);

  // القيمة التراكمية عند دقيقة t = آخر قيمة مسجّلة عند دقيقة ≤ t (السلسلة غير متناقصة)
  const valueAt = (map: Map<number, number>, t: number): number => {
    let v = 0;
    for (const [m, val] of map) if (m <= t && val > v) v = val;
    return v;
  };

  const metricMinutes = trends
    .filter((t) => t.type?.name === metricName)
    .map((t) => t.minute ?? 0);
  const maxMinute = metricMinutes.length ? Math.max(...metricMinutes) : 0;

  const points: WcMomentumPoint[] = [];
  for (let a = 0; a < maxMinute; a += BUCKET_MINUTES) {
    const b = a + BUCKET_MINUTES;
    // clamp ≥0 تحسّبًا لأي إعادة تصفير بين الأشواط
    const home = Math.max(0, valueAt(homeCum, b) - valueAt(homeCum, a));
    const away = Math.max(0, valueAt(awayCum, b) - valueAt(awayCum, a));
    points.push({ label: `${b}'`, minute: b, home, away: -away, net: home - away });
  }

  return { available: true, live, possession, points };
}

/**
 * الزخم الهجومي عبر الزمن (من trends — إضافة Match Facts).
 * home/away في النقاط مُحاذية لمضيف/ضيف المباراة (عبر meta.location).
 */
export async function getMomentum(
  apiFootballFixtureId: number,
  opts: { directSmId?: number } = {}
): Promise<WcMomentum> {
  const r = await resolveFixture(apiFootballFixtureId, opts.directSmId);
  if (!r) return EMPTY_MOMENTUM;
  return withSWR(`wc:momentum:${r.smId}`, r.ttl, r.ttl * 3, () => buildMomentum(r.smId));
}

// ---------- مؤشّر الضغط (Pressure Index — إضافة SportMonks) ----------

export interface WcPressurePoint {
  label: string; // وسم الدقيقة، مثل "57'"
  minute: number;
  home: number; // ضغط المضيف عند الدقيقة (موجب)
  away: number; // ضغط الضيف (يُخزَّن سالبًا لرسمه أسفل الصفر)
  net: number; // home - away (موجب = سيطرة المضيف)
}

export interface WcPressure {
  available: boolean;
  live: boolean;
  /** الفريق المسيطر في أحدث لحظة مسجّلة + قيمته (0–100 تقريبًا) */
  latest: { side: "home" | "away" | "even"; value: number } | null;
  points: WcPressurePoint[];
}

const EMPTY_PRESSURE: WcPressure = {
  available: false,
  live: false,
  latest: null,
  points: [],
};

/**
 * يبني سلسلة مؤشّر الضغط لحظة بلحظة. SportMonks يعطي قيمة موجبة لفريق واحد
 * فقط في كل لحظة (الأعلى = الأكثر سيطرة)؛ نحاذيها على المضيف/الضيف عبر
 * meta.location ونحوّل الضيف إلى سالب ليُرسم أسفل خط الصفر مثل رسم الزخم.
 */
async function buildPressure(smFixtureId: number): Promise<WcPressure> {
  const resp = await smGet(`fixtures/${smFixtureId}`, {
    include: "pressure;participants;state",
  });
  const data = resp?.data ?? {};
  const live = LIVE_STATES.has(data.state?.developer_name ?? "");
  const participants: any[] = Array.isArray(data.participants) ? data.participants : [];
  let homeId = participants.find((p) => p.meta?.location === "home")?.id;
  let awayId = participants.find((p) => p.meta?.location === "away")?.id;
  // fallback لو غاب meta.location: SportMonks يُرتّب المضيف أولًا
  if ((homeId == null || awayId == null) && participants.length === 2) {
    homeId = homeId ?? participants[0]?.id;
    awayId = awayId ?? participants[1]?.id;
  }
  const pressure: any[] = Array.isArray(data.pressure) ? data.pressure : [];

  if (homeId == null || awayId == null || pressure.length === 0) {
    return { ...EMPTY_PRESSURE, live };
  }

  // دقيقة → {home, away}: قيمة موجبة واحدة في الغالب لكل دقيقة
  const byMinute = new Map<number, { home: number; away: number }>();
  for (const p of pressure) {
    if (typeof p.minute !== "number") continue;
    const slot = byMinute.get(p.minute) ?? { home: 0, away: 0 };
    const val = Math.max(0, Number(p.pressure) || 0);
    if (p.participant_id === homeId) slot.home = val;
    else if (p.participant_id === awayId) slot.away = val;
    byMinute.set(p.minute, slot);
  }

  const points: WcPressurePoint[] = [...byMinute.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([minute, v]) => ({
      label: `${minute}'`,
      minute,
      home: v.home,
      away: -v.away,
      net: v.home - v.away,
    }));

  if (points.length === 0) return { ...EMPTY_PRESSURE, live };

  const last = points[points.length - 1];
  const latest: WcPressure["latest"] =
    last.net > 0
      ? { side: "home", value: last.home }
      : last.net < 0
        ? { side: "away", value: Math.abs(last.away) }
        : { side: "even", value: 0 };

  return { available: true, live, latest, points };
}

/**
 * مؤشّر الضغط لحظة بلحظة (Pressure Index — إضافة SportMonks).
 * home/away في النقاط مُحاذية لمضيف/ضيف المباراة (عبر meta.location).
 */
export async function getPressure(
  apiFootballFixtureId: number,
  opts: { directSmId?: number } = {}
): Promise<WcPressure> {
  const r = await resolveFixture(apiFootballFixtureId, opts.directSmId);
  if (!r) return EMPTY_PRESSURE;
  return withSWR(`wc:pressure:${r.smId}`, r.ttl, r.ttl * 3, () => buildPressure(r.smId));
}

// ---------- التوقعات الاحتمالية (Predictions — احتمالات SportMonks) ----------

export interface WcOverUnderLine {
  line: number; // 1.5 / 2.5 / 3.5 ...
  over: number; // احتمال «أكثر من» (%)
  under: number; // احتمال «أقل من» (%)
}

export interface WcCorrectScore {
  score: string; // "2-0" (المضيف-الضيف)
  prob: number; // احتمال (%)
}

export interface WcForecast {
  available: boolean;
  /** نتيجة المباراة 1×2 (نِسب مئوية) */
  fulltime: { home: number; draw: number; away: number } | null;
  /** الفريقان يسجلان */
  btts: { yes: number; no: number } | null;
  /** الفرصة المزدوجة */
  doubleChance: { homeOrDraw: number; awayOrDraw: number; homeOrAway: number } | null;
  /** مجموع الأهداف أكثر/أقل من خطوط متعددة */
  goals: WcOverUnderLine[];
  /** أرجح النتائج مرتّبة تنازليًا */
  correctScores: WcCorrectScore[];
}

const EMPTY_FORECAST: WcForecast = {
  available: false,
  fulltime: null,
  btts: null,
  doubleChance: null,
  goals: [],
  correctScores: [],
};

/**
 * يبني حزمة التوقعات من نقطة probabilities: نتيجة المباراة، الفريقان يسجلان،
 * الفرصة المزدوجة، مجموع الأهداف (1.5–3.5)، وأرجح النتائج الصحيحة.
 */
async function buildForecast(smFixtureId: number): Promise<WcForecast> {
  const resp = await smGet(`predictions/probabilities/fixtures/${smFixtureId}`, {
    include: "type",
  });
  const rows: any[] = Array.isArray(resp?.data) ? resp.data : [];
  if (rows.length === 0) return EMPTY_FORECAST;

  const byType = new Map<string, any>();
  for (const r of rows) {
    const name = r?.type?.developer_name;
    if (name) byType.set(name, r.predictions ?? {});
  }
  const pct = (v: any): number => (typeof v === "number" ? Math.round(v) : 0);

  const ft = byType.get("FULLTIME_RESULT_PROBABILITY");
  const fulltime = ft ? { home: pct(ft.home), draw: pct(ft.draw), away: pct(ft.away) } : null;

  const b = byType.get("BTTS_PROBABILITY");
  const btts = b ? { yes: pct(b.yes), no: pct(b.no) } : null;

  const dc = byType.get("DOUBLE_CHANCE_PROBABILITY");
  const doubleChance = dc
    ? {
        homeOrDraw: pct(dc.draw_home),
        awayOrDraw: pct(dc.draw_away),
        homeOrAway: pct(dc.home_away),
      }
    : null;

  // مجموع الأهداف — نعرض 1.5/2.5/3.5 فقط (4.5 نادرًا ما يُفيد القارئ)
  const goals: WcOverUnderLine[] = [];
  for (const line of [1.5, 2.5, 3.5]) {
    const ou = byType.get(`OVER_UNDER_${String(line).replace(".", "_")}_PROBABILITY`);
    if (ou && (ou.yes != null || ou.no != null)) {
      goals.push({ line, over: pct(ou.yes), under: pct(ou.no) });
    }
  }

  // أرجح النتائج — نستبعد دلاء "Other_*" ونأخذ أعلى 5 سطور نتيجة فعلية
  const cs = byType.get("CORRECT_SCORE_PROBABILITY");
  const scoresObj = cs?.scores && typeof cs.scores === "object" ? cs.scores : {};
  const correctScores: WcCorrectScore[] = Object.entries(scoresObj)
    .filter(([k]) => /^\d+-\d+$/.test(k))
    .map(([score, prob]) => ({ score, prob: typeof prob === "number" ? prob : 0 }))
    .sort((a, b) => b.prob - a.prob)
    .slice(0, 5)
    .map((s) => ({ score: s.score, prob: Math.round(s.prob * 10) / 10 }));

  const available = Boolean(
    fulltime || btts || doubleChance || goals.length || correctScores.length
  );
  return { available, fulltime, btts, doubleChance, goals, correctScores };
}

/**
 * التوقعات الاحتمالية للمباراة (Predictions — احتمالات SportMonks).
 * متاحة قبل المباراة (حتى 21 يومًا) وتُحدَّث مع اقترابها.
 */
export async function getForecast(
  apiFootballFixtureId: number,
  opts: { directSmId?: number } = {}
): Promise<WcForecast> {
  const r = await resolveFixture(apiFootballFixtureId, opts.directSmId);
  if (!r) return EMPTY_FORECAST;
  // قبل المباراة كاش متوسط؛ أثناءها قصير كي تتحدّث الاحتمالات مع المجريات
  const live = r.ttl === SM_LIVE_TTL;
  return withSWR(
    `wc:forecast:${r.smId}`,
    live ? SM_LIVE_TTL : CACHE_TTL.MEDIUM,
    live ? SM_LIVE_TTL * 3 : CACHE_TTL.LONG,
    () => buildForecast(r.smId)
  );
}

// ---------- التشكيلة المتوقعة قبل المباراة (expectedLineups) ----------

export interface WcExpectedPlayer {
  name: string;
  jersey: number | null;
  /** خانة اللاعب داخل الخطة (1 = الحارس) — للأساسيين فقط */
  slot: number | null;
  /** موقع اللاعب على الملعب "صف:عمود" (نفس صيغة grid في التشكيلة الرسمية) */
  grid: string | null;
  /** صف الخطة (مشتق من grid) — لاشتقاق شكل الخطة */
  row: number | null;
}

export interface WcExpectedSide {
  formation: string | null;
  starters: WcExpectedPlayer[];
  bench: WcExpectedPlayer[];
}

export interface WcExpectedLineups {
  available: boolean;
  home: WcExpectedSide | null;
  away: WcExpectedSide | null;
}

const EMPTY_EXPECTED_LINEUPS: WcExpectedLineups = { available: false, home: null, away: null };

// متحقَّق حيًّا (2026-07-03): 77614 = أساسي (11 صفًّا لكل فريق)، 77615 = بديل
const SM_EXPECTED_STARTER_TYPE = 77614;

function mapExpectedPlayer(raw: any): WcExpectedPlayer {
  const field = typeof raw.formation_field === "string" ? raw.formation_field : "";
  const grid = /^\d+:\d+$/.test(field) ? field : null;
  return {
    name: String(raw.player_name || "").trim(),
    jersey: Number.isFinite(Number(raw.jersey_number)) ? Number(raw.jersey_number) : null,
    slot: Number.isFinite(Number(raw.formation_position)) ? Number(raw.formation_position) : null,
    grid,
    row: grid ? Number(grid.split(":")[0]) : null,
  };
}

/** يشتقّ شكل الخطة ("4-2-3-1") من صفوف الأساسيين عند غياب `formations` الرسمية */
function deriveFormation(starters: WcExpectedPlayer[]): string | null {
  const counts = new Map<number, number>();
  for (const p of starters) {
    if (p.row && p.row > 1) counts.set(p.row, (counts.get(p.row) || 0) + 1);
  }
  if (!counts.size) return null;
  return Array.from(counts.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, n]) => n)
    .join("-");
}

async function buildExpectedLineups(smId: number): Promise<WcExpectedLineups> {
  const data = await smGet(`fixtures/${smId}`, {
    include: "expectedLineups;formations;participants",
  });
  const fx = data?.data;
  const rows: any[] = Array.isArray(fx?.expectedlineups) ? fx.expectedlineups : [];
  if (!rows.length) return EMPTY_EXPECTED_LINEUPS;

  const sideByTeam = new Map<number, "home" | "away">();
  for (const p of Array.isArray(fx?.participants) ? fx.participants : []) {
    const loc = p?.meta?.location;
    if (loc === "home" || loc === "away") sideByTeam.set(Number(p.id), loc);
  }
  const formationBySide = new Map<string, string>();
  for (const f of Array.isArray(fx?.formations) ? fx.formations : []) {
    if (f?.location && typeof f.formation === "string") {
      formationBySide.set(f.location, f.formation);
    }
  }

  const sides = {
    home: { starters: [] as WcExpectedPlayer[], bench: [] as WcExpectedPlayer[] },
    away: { starters: [] as WcExpectedPlayer[], bench: [] as WcExpectedPlayer[] },
  };
  for (const raw of rows) {
    const side = sideByTeam.get(Number(raw?.team_id));
    if (!side || !raw?.player_name) continue;
    const player = mapExpectedPlayer(raw);
    if (Number(raw.type_id) === SM_EXPECTED_STARTER_TYPE) sides[side].starters.push(player);
    else sides[side].bench.push(player);
  }
  if (!sides.home.starters.length && !sides.away.starters.length) return EMPTY_EXPECTED_LINEUPS;

  const buildSide = (side: "home" | "away"): WcExpectedSide => {
    const starters = sides[side].starters.sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99));
    return {
      formation: formationBySide.get(side) ?? deriveFormation(starters),
      starters,
      bench: sides[side].bench,
    };
  };
  return { available: true, home: buildSide("home"), away: buildSide("away") };
}

/**
 * التشكيلة المتوقعة قبل المباراة (Expected Lineups — ينشرها المزوّد قبل يومين تقريبًا).
 * تُعرض حتى صدور التشكيلة الرسمية؛ أفضل جهد: أي غياب → { available:false }.
 */
export async function getExpectedLineups(
  apiFootballFixtureId: number,
  opts: { directSmId?: number } = {}
): Promise<WcExpectedLineups> {
  const r = await resolveFixture(apiFootballFixtureId, opts.directSmId);
  if (!r) return EMPTY_EXPECTED_LINEUPS;
  return withSWR(`wc:explineup:${r.smId}`, CACHE_TTL.SHORT, CACHE_TTL.MEDIUM, () =>
    buildExpectedLineups(r.smId)
  );
}

// ---------- حكم المباراة (بطاقة صرامة الحكم) ----------

export interface WcRefereeStats {
  /** مباريات الموسم/البطولة التي تخصها الأرقام */
  matches: number;
  yellowAvg: number | null;
  /** إجمالي الصفراء — قرار المالك 2026-07-04: الأعداد الصحيحة لا الكسور («18 بطاقة في 4 مباريات» لا «4.5/مباراة») */
  yellowCount: number | null;
  /** حمراء مباشرة + صفراء ثانية (إجمالي لا معدل — الأوضح للقارئ) */
  redCount: number;
  penaltiesAvg: number | null;
  /** إجمالي ركلات الجزاء المحتسبة */
  penaltiesCount: number | null;
  foulsAvg: number | null;
  varMoments: number | null;
}

export interface WcMatchReferee {
  available: boolean;
  name: string;
  photo: string | null;
  countryName: string | null;
  countryFlag: string | null;
  stats: WcRefereeStats | null;
}

const EMPTY_REFEREE: WcMatchReferee = {
  available: false,
  name: "",
  photo: null,
  countryName: null,
  countryFlag: null,
  stats: null,
};

// متحقَّق حيًّا (2026-07-03): type_id 6 = الحكم الرئيسي (7/8 مساعدان، 9 رابع)
const SM_MAIN_REFEREE_TYPE = 6;

function refereeStatValue(details: any[], dev: string): any {
  return details.find((d: any) => d?.type?.developer_name === dev)?.value ?? null;
}

async function buildMatchReferee(smId: number): Promise<WcMatchReferee> {
  const fx = (await smGet(`fixtures/${smId}`, { include: "referees" }))?.data;
  const main = (Array.isArray(fx?.referees) ? fx.referees : []).find(
    (r: any) => Number(r?.type_id) === SM_MAIN_REFEREE_TYPE
  );
  const refereeId = Number(main?.referee_id);
  if (!refereeId) return EMPTY_REFEREE;

  // إحصاءات موسم المباراة نفسه (بطولة جارية = صرامته في هذه البطولة تحديدًا)
  const params: Record<string, string> = { include: "country;statistics.details.type" };
  const seasonId = Number(fx?.season_id);
  if (seasonId) params.filters = `refereeStatisticSeasons:${seasonId}`;
  const ref = (await smGet(`referees/${refereeId}`, params))?.data;
  const name = String(ref?.display_name || ref?.name || "").trim();
  if (!name) return EMPTY_REFEREE;

  const details: any[] = Array.isArray(ref?.statistics?.[0]?.details)
    ? ref.statistics[0].details
    : [];
  const matches = Number(refereeStatValue(details, "MATCHES")?.count) || 0;
  const yellow = refereeStatValue(details, "YELLOWCARDS");
  const red = refereeStatValue(details, "REDCARDS");
  const yellowRed = refereeStatValue(details, "YELLOWRED_CARDS");
  const pens = refereeStatValue(details, "PENALTIES");
  const fouls = refereeStatValue(details, "FOULS");
  const varMoments = refereeStatValue(details, "VAR_MOMENTS");

  return {
    available: true,
    name,
    photo: ref?.image_path ?? null,
    countryName: ref?.country?.name ?? null,
    countryFlag: ref?.country?.image_path ?? null,
    stats:
      matches > 0
        ? {
            matches,
            yellowAvg: typeof yellow?.all?.average === "number" ? yellow.all.average : null,
            yellowCount: typeof yellow?.all?.count === "number" ? yellow.all.count : null,
            redCount: (Number(red?.all?.count) || 0) + (Number(yellowRed?.all?.count) || 0),
            penaltiesAvg: typeof pens?.all?.average === "number" ? pens.all.average : null,
            penaltiesCount: typeof pens?.all?.count === "number" ? pens.all.count : null,
            foulsAvg: typeof fouls?.average === "number" ? fouls.average : null,
            varMoments: typeof varMoments?.count === "number" ? varMoments.count : null,
          }
        : null,
  };
}

/**
 * حكم المباراة الرئيسي + صرامته بالأرقام في موسم/بطولة المباراة نفسها.
 * أفضل جهد: لا حكم معلن بعد → { available:false } (يُعلن عادة قبل يوم).
 */
export async function getMatchReferee(
  apiFootballFixtureId: number,
  opts: { directSmId?: number } = {}
): Promise<WcMatchReferee> {
  const r = await resolveFixture(apiFootballFixtureId, opts.directSmId);
  if (!r) return EMPTY_REFEREE;
  return withSWR(`wc:referee:${r.smId}`, CACHE_TTL.LONG, CACHE_TTL.VERY_LONG, () =>
    buildMatchReferee(r.smId)
  );
}

// ---------- تشكيلة الجولة (Team of the Week) ----------

export interface WcTotwPlayer {
  name: string;
  photo: string | null;
  teamName: string;
  teamLogo: string | null;
  rating: number;
  /** خانة اللاعب 1..11 (1 = الحارس) */
  slot: number;
  /** صف الخطة (1 = الحارس) — يُشتق من الخانة وشكل الخطة */
  row: number;
}

export interface WcTeamOfTheWeek {
  available: boolean;
  formation: string | null;
  players: WcTotwPlayer[];
}

const EMPTY_TOTW: WcTeamOfTheWeek = { available: false, formation: null, players: [] };

/** يوزّع الخانات 1..11 على صفوف الخطة ("4-2-3-1" → حارس ثم 4 صفوف) */
function totwRowOfSlot(slot: number, formation: string | null): number {
  if (slot <= 1) return 1;
  const parts = (formation || "")
    .split("-")
    .map((n) => parseInt(n, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  let start = 2;
  for (let i = 0; i < parts.length; i++) {
    if (slot < start + parts[i]) return i + 2;
    start += parts[i];
  }
  return parts.length + 1;
}

/**
 * تشكيلة الجولة لبطولة (الأعلى تقييمًا في آخر جولة مكتملة).
 * تتجدد مرة لكل جولة — كاش طويل. أفضل جهد: أي غياب → { available:false }.
 */
export async function getTeamOfTheWeek(leagueId: number): Promise<WcTeamOfTheWeek> {
  if (!isSportmonksConfigured()) return EMPTY_TOTW;
  return withSWR(`sm:totw:v3:${leagueId}`, CACHE_TTL.VERY_LONG, CACHE_TTL.VERY_LONG * 6, async () => {
    // جلب معلومات الدوري للتحقق من أن التشكيلة تتبع الموسم الحالي
    const leagueRes = await smGet(`leagues/${leagueId}`, { include: "currentSeason" }).catch(() => null);
    const currentSeasonId = Number(
      leagueRes?.data?.currentseason?.id ??
      leagueRes?.data?.current_season_id ??
      leagueRes?.data?.season_id ??
      0,
    );

    const data = await smGet(`team-of-the-week/leagues/${leagueId}/latest`, {
      include: "player;team",
    }).catch(() => null);
    const rows: any[] = Array.isArray(data?.data) ? data.data : [];
    if (!rows.length) return EMPTY_TOTW;

    // إن كانت التشكيلة لموسم سابق غير الحالي → لا نعرضها
    const totwSeasonId = Number(rows[0]?.season_id || 0);
    if (currentSeasonId && totwSeasonId && totwSeasonId !== currentSeasonId) {
      return EMPTY_TOTW;
    }

    const formation = typeof rows[0]?.formation === "string" ? rows[0].formation : null;
    const players: WcTotwPlayer[] = rows
      .map((r: any) => {
        const slot = Number(r?.formation_position) || 0;
        return {
          name: String(r?.player?.display_name || r?.player?.name || "").trim(),
          photo: r?.player?.image_path ?? null,
          teamName: String(r?.team?.name || "").trim(),
          teamLogo: r?.team?.image_path ?? null,
          rating: Math.round(Number(r?.rating || 0) * 100) / 100,
          slot,
          row: totwRowOfSlot(slot, formation),
        };
      })
      .filter((p: WcTotwPlayer) => p.name && p.slot > 0)
      .sort((a: WcTotwPlayer, b: WcTotwPlayer) => a.slot - b.slot);
    if (!players.length) return EMPTY_TOTW;
    return { available: true, formation, players };
  });
}

// ---------- معطيات المباراة: إحصائيات + طقس + غيابات (Match Facts) ----------

export interface WcStatItem {
  key: string;
  label: string;
  home: string; // قد يحمل "%" — متوافق مع StatRow بالواجهة
  away: string;
}

export interface WcWeather {
  type: "actual" | "forecast"; // توقّع قبل المباراة / فعلي أثناءها وبعدها
  temp: number | null; // °م
  description: string; // مُعرَّب
  icon: string;
  humidity: string; // "62%"
}

export interface WcAbsentee {
  name: string;
  location: "home" | "away";
  reason: string; // مُعرَّب (إصابة/إيقاف...)
}

// تفصيل حدث يُركَّب فوق أحداث API-Football (لا يحلّ محلها) بمطابقة نوع+جهة+دقيقة
export interface WcEventDetail {
  minute: number;
  location: "home" | "away";
  klass: "goal" | "card" | "var";
  detail: string; // مُعرَّب: طريقة الهدف / سبب البطاقة / قرار VAR
  player: string;
}

export interface WcMatchFacts {
  available: boolean;
  statistics: WcStatItem[];
  weather: WcWeather | null;
  absentees: WcAbsentee[];
  eventDetails: WcEventDetail[];
  halftime: { home: number; away: number } | null;
}

const EMPTY_MATCH_FACTS: WcMatchFacts = {
  available: false,
  statistics: [],
  weather: null,
  absentees: [],
  eventDetails: [],
  halftime: null,
};

// قائمة مرتّبة بالأهمية: رمز SportMonks → تسمية عربية (وما يُعرض كنسبة)
const STAT_LABELS: { code: string; label: string; percent?: boolean }[] = [
  { code: "ball-possession", label: "الاستحواذ", percent: true },
  { code: "shots-total", label: "إجمالي التسديدات" },
  { code: "shots-on-target", label: "تسديدات على المرمى" },
  { code: "shots-off-target", label: "تسديدات خارج المرمى" },
  { code: "shots-insidebox", label: "تسديدات داخل المنطقة" },
  { code: "shots-outsidebox", label: "تسديدات خارج المنطقة" },
  { code: "dangerous-attacks", label: "هجمات خطيرة" },
  { code: "attacks", label: "الهجمات" },
  { code: "corners", label: "الركنيات" },
  { code: "offsides", label: "التسلل" },
  { code: "fouls", label: "الأخطاء" },
  { code: "saves", label: "التصدّيات" },
  { code: "passes", label: "التمريرات" },
  { code: "successful-passes", label: "تمريرات ناجحة" },
  { code: "yellowcards", label: "بطاقات صفراء" },
  { code: "redcards", label: "بطاقات حمراء" },
];

const WEATHER_AR: Record<string, string> = {
  "clear sky": "سماء صافية",
  "sky is clear": "سماء صافية",
  "few clouds": "غيوم قليلة",
  "scattered clouds": "غيوم متفرقة",
  "broken clouds": "غيوم متقطعة",
  "overcast clouds": "غائم",
  "light rain": "مطر خفيف",
  "moderate rain": "مطر معتدل",
  "heavy intensity rain": "مطر غزير",
  "very heavy rain": "مطر شديد الغزارة",
  "light intensity shower rain": "زخّات مطر خفيفة",
  "shower rain": "زخّات مطر",
  thunderstorm: "عاصفة رعدية",
  mist: "شبّورة",
  haze: "غبار خفيف",
  fog: "ضباب",
  smoke: "دخان",
  snow: "ثلوج",
};

// سبب الغياب من SportMonks (نص حرّ محدّد مثل "Hamstring Injury"/"Suspended")
// → عربي بمطابقة جزئية تغطّي الأغلب؛ fallback: النص الأصلي (نادر).
function arabicReason(raw: string): string {
  const r = (raw || "").toLowerCase();
  if (!r) return "غياب";
  if (r.includes("suspend")) return "إيقاف";
  if (r.includes("ill") || r.includes("sick") || r.includes("virus") || r.includes("flu"))
    return "مرض";
  if (r.includes("knock")) return "إصابة طفيفة";
  if (r.includes("doubt")) return "مشكوك بجاهزيته";
  if (r.includes("national")) return "ارتباط دولي";
  if (r.includes("injur")) return "إصابة";
  // إصابات محددة بالاسم لا تحوي كلمة injury
  if (
    /(hamstring|knee|ankle|groin|calf|thigh|muscle|broken|fracture|acl|ligament|back|shoulder|foot|toe|hip|concussion|jaw|rib|wrist|finger)/.test(
      r
    )
  )
    return "إصابة";
  return raw;
}

function teamSides(participants: any[]): { homeId: number | null; awayId: number | null } {
  let homeId = participants.find((p) => p.meta?.location === "home")?.id ?? null;
  let awayId = participants.find((p) => p.meta?.location === "away")?.id ?? null;
  if ((homeId == null || awayId == null) && participants.length === 2) {
    homeId = homeId ?? participants[0]?.id ?? null;
    awayId = awayId ?? participants[1]?.id ?? null;
  }
  return { homeId, awayId };
}

function buildStatistics(stats: any[]): WcStatItem[] {
  const map = new Map<string, { home: number; away: number }>();
  for (const s of stats) {
    const code = s.type?.code;
    if (!code) continue;
    const slot = map.get(code) ?? { home: 0, away: 0 };
    const val = Number(s.data?.value) || 0;
    if (s.location === "home") slot.home = val;
    else if (s.location === "away") slot.away = val;
    map.set(code, slot);
  }
  const out: WcStatItem[] = [];
  for (const { code, label, percent } of STAT_LABELS) {
    const v = map.get(code);
    if (!v || (v.home === 0 && v.away === 0)) continue;
    out.push({
      key: code,
      label,
      home: percent ? `${v.home}%` : String(v.home),
      away: percent ? `${v.away}%` : String(v.away),
    });
  }
  return out;
}

function buildWeather(w: any): WcWeather | null {
  if (!w) return null;
  const descRaw = (w.description || w.current?.description || "").toString();
  const temp = w.temperature?.day ?? w.current?.temp ?? null;
  if (temp == null && !descRaw) return null;
  return {
    type: w.type === "forecast" ? "forecast" : "actual",
    temp: typeof temp === "number" ? Math.round(temp) : null,
    description: WEATHER_AR[descRaw.toLowerCase()] ?? descRaw,
    icon: w.icon || "",
    humidity: w.humidity || w.current?.humidity || "",
  };
}

function buildAbsentees(
  sidelined: any[],
  homeId: number | null,
  awayId: number | null
): WcAbsentee[] {
  const out: WcAbsentee[] = [];
  for (const s of sidelined) {
    const name = s.sideline?.player?.name; // يُحلّ غالبًا للمباريات القادمة فقط
    if (!name) continue;
    const location =
      s.participant_id === homeId ? "home" : s.participant_id === awayId ? "away" : null;
    if (!location) continue;
    const reason = arabicReason((s.sideline?.type?.name || "").toString());
    out.push({ name, location, reason });
  }
  return out;
}

// طريقة الهدف من حقل info (SportMonks) → عربي. fallback: "" (لا نعرض المجهول)
function goalMethodAr(info: string): string {
  const r = (info || "").toLowerCase();
  if (r.includes("header")) return "رأسية";
  if (r.includes("left foot")) return "تسديدة يسارية";
  if (r.includes("right foot")) return "تسديدة يمينية";
  if (r.includes("penalty")) return "ركلة جزاء";
  if (r.includes("free")) return "ركلة حرة";
  if (r.includes("tap")) return "لمسة قرب المرمى";
  if (r.includes("solo")) return "انفراد";
  if (r.includes("shot")) return "تسديدة";
  return "";
}

// سبب البطاقة من حقل info → عربي. fallback: "" (لا نعرض المجهول)
function cardReasonAr(info: string): string {
  const r = (info || "").toLowerCase();
  if (r.includes("professional")) return "خطأ تكتيكي";
  if (r.includes("persistent")) return "أخطاء متكررة";
  if (r.includes("foul")) return "خطأ";
  if (r.includes("argument") || r.includes("dissent")) return "احتجاج";
  if (r.includes("hand")) return "لمسة يد";
  if (r.includes("time")) return "تضييع وقت";
  if (r.includes("dangerous")) return "لعب خطير";
  if (r.includes("rough")) return "خشونة";
  if (r.includes("unsporting")) return "سلوك غير رياضي";
  if (r.includes("simulation") || r.includes("diving")) return "تمثيل";
  return "";
}

// قرار الـVAR من حقل addition → عربي. fallback: مراجعة عامة
function varDecisionAr(addition: string): string {
  const r = (addition || "").toLowerCase();
  if (r.includes("goal") && r.includes("disallow")) return "إلغاء هدف (VAR)";
  if (r.includes("goal") && r.includes("award")) return "احتساب هدف (VAR)";
  if (r.includes("penalty") && r.includes("not")) return "إلغاء ركلة جزاء (VAR)";
  if (r.includes("penalty")) return "احتساب ركلة جزاء (VAR)";
  if (r.includes("red") && r.includes("cancel")) return "إلغاء طرد (VAR)";
  if (r.includes("red")) return "طرد (VAR)";
  return "مراجعة الحكم (VAR)";
}

function buildEventDetails(
  events: any[],
  homeId: number | null,
  awayId: number | null
): WcEventDetail[] {
  const out: WcEventDetail[] = [];
  for (const e of events) {
    const code = (e.type?.code || "").toLowerCase();
    const minute = typeof e.minute === "number" ? e.minute : null;
    if (minute == null) continue;
    const location =
      e.participant_id === homeId ? "home" : e.participant_id === awayId ? "away" : null;
    if (!location) continue;

    if (code === "goal" || code === "own-goal" || code === "penalty") {
      const detail = goalMethodAr(e.info);
      if (detail) out.push({ minute, location, klass: "goal", detail, player: e.player_name || "" });
    } else if (code === "yellowcard" || code === "redcard" || code === "yellowredcard") {
      const detail = cardReasonAr(e.info);
      if (detail) out.push({ minute, location, klass: "card", detail, player: e.player_name || "" });
    } else if (code === "var" || code === "var_card") {
      const detail = varDecisionAr(e.addition);
      out.push({ minute, location, klass: "var", detail, player: e.player_name || "" });
    }
  }
  return out;
}

function buildHalftime(scores: any[]): { home: number; away: number } | null {
  const ht = scores.filter((s) => s.description === "1ST_HALF");
  if (ht.length === 0) return null;
  const home = ht.find((s) => s.score?.participant === "home")?.score?.goals;
  const away = ht.find((s) => s.score?.participant === "away")?.score?.goals;
  if (home == null && away == null) return null;
  return { home: home ?? 0, away: away ?? 0 };
}

async function buildMatchFacts(smFixtureId: number): Promise<WcMatchFacts> {
  const resp = await smGet(`fixtures/${smFixtureId}`, {
    include:
      "statistics.type;participants;weatherReport;sidelined.sideline.player;sidelined.sideline.type;events.type;scores",
  });
  const data = resp?.data ?? {};
  const participants: any[] = Array.isArray(data.participants) ? data.participants : [];
  const { homeId, awayId } = teamSides(participants);

  const statistics = buildStatistics(Array.isArray(data.statistics) ? data.statistics : []);
  const weather = buildWeather(data.weatherreport);
  const absentees = buildAbsentees(
    Array.isArray(data.sidelined) ? data.sidelined : [],
    homeId,
    awayId
  );
  const eventDetails = buildEventDetails(
    Array.isArray(data.events) ? data.events : [],
    homeId,
    awayId
  );
  const halftime = buildHalftime(Array.isArray(data.scores) ? data.scores : []);

  const available =
    statistics.length > 0 ||
    weather != null ||
    absentees.length > 0 ||
    eventDetails.length > 0 ||
    halftime != null;
  return { available, statistics, weather, absentees, eventDetails, halftime };
}

/**
 * معطيات المباراة من SportMonks: إحصائيات أعمق (حتى 41 نوعًا)، الطقس
 * (توقّع قبل المباراة + فعلي بعدها)، والغيابات (تظهر غالبًا قبل المباراة).
 */
export async function getMatchFacts(
  apiFootballFixtureId: number,
  opts: { directSmId?: number } = {}
): Promise<WcMatchFacts> {
  const r = await resolveFixture(apiFootballFixtureId, opts.directSmId);
  if (!r) return EMPTY_MATCH_FACTS;
  return withSWR(`wc:facts:${r.smId}`, r.ttl, r.ttl * 3, () => buildMatchFacts(r.smId));
}

// ---------- الأهداف المتوقعة xG (من lineups.details — متاح للمونديال) ----------

export interface WcXgPlayer {
  name: string;
  location: "home" | "away";
  xg: number;
}

export interface WcXg {
  available: boolean;
  /** xG = مجموع الأهداف المتوقعة للاعبي الفريق؛ xgot = على المرمى */
  home: { xg: number; xgot: number };
  away: { xg: number; xgot: number };
  topPlayers: WcXgPlayer[]; // الأعلى خطورة (xG) — حتى 5
}

const EMPTY_XG: WcXg = {
  available: false,
  home: { xg: 0, xgot: 0 },
  away: { xg: 0, xgot: 0 },
  topPlayers: [],
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * xG للفريقين = مجموع expected-goals للاعبي كل فريق (من lineups.details).
 * متاح لمباريات المونديال خلافًا لـ xGFixture الفارغ على مستوى المباراة.
 */
async function buildXg(smFixtureId: number): Promise<WcXg> {
  const resp = await smGet(`fixtures/${smFixtureId}`, {
    include: "lineups.details.type;participants",
  });
  const data = resp?.data ?? {};
  const { homeId, awayId } = teamSides(Array.isArray(data.participants) ? data.participants : []);
  const lineups: any[] = Array.isArray(data.lineups) ? data.lineups : [];

  let homeXg = 0,
    awayXg = 0,
    homeXgot = 0,
    awayXgot = 0;
  const players: WcXgPlayer[] = [];

  for (const lu of lineups) {
    const location = lu.team_id === homeId ? "home" : lu.team_id === awayId ? "away" : null;
    if (!location) continue;
    const details: any[] = Array.isArray(lu.details) ? lu.details : [];
    let pXg = 0;
    for (const d of details) {
      const code = d.type?.code;
      const v = Number(d.data?.value) || 0;
      if (code === "expected-goals") {
        pXg += v;
        if (location === "home") homeXg += v;
        else awayXg += v;
      } else if (code === "expected-goals-on-target") {
        if (location === "home") homeXgot += v;
        else awayXgot += v;
      }
    }
    if (pXg > 0) players.push({ name: lu.player_name || "", location, xg: round2(pXg) });
  }

  const available = homeXg > 0 || awayXg > 0;
  const topPlayers = players.sort((a, b) => b.xg - a.xg).slice(0, 5);
  return {
    available,
    home: { xg: round2(homeXg), xgot: round2(homeXgot) },
    away: { xg: round2(awayXg), xgot: round2(awayXgot) },
    topPlayers,
  };
}

/**
 * الأهداف المتوقعة (xG) للفريقين + أبرز صانعي الخطورة.
 * يُحاذى home/away عبر meta.location مثل بقية معطيات SportMonks.
 */
export async function getXg(
  apiFootballFixtureId: number,
  opts: { directSmId?: number } = {}
): Promise<WcXg> {
  const r = await resolveFixture(apiFootballFixtureId, opts.directSmId);
  if (!r) return EMPTY_XG;
  return withSWR(`wc:xg:${r.smId}`, r.ttl, r.ttl * 3, () => buildXg(r.smId));
}

// ---------- النتيجة الحيّة اللحظية (livescores/inplay — للمتابعة المباشرة) ----------

export interface WcLiveScore {
  smId: number;
  home: number;
  away: number;
  minute: number; // الدقيقة الجارية التراكمية من الشوط النشط
  stateDevName: string;
  live: boolean;
  finished: boolean;
}

const FINISHED_STATES = new Set(["FT", "AET", "FT_PEN", "AET_PEN"]);

async function fetchLiveScores(): Promise<WcLiveScore[]> {
  const resp = await smGet("livescores/inplay", {
    include: "participants;scores;periods;state",
  });
  const rows: any[] = Array.isArray(resp?.data) ? resp.data : [];
  const out: WcLiveScore[] = [];
  for (const fx of rows) {
    const scores: any[] = Array.isArray(fx.scores) ? fx.scores : [];
    const cur = scores.filter((s) => s.description === "CURRENT");
    const home = cur.find((s) => s.score?.participant === "home")?.score?.goals ?? 0;
    const away = cur.find((s) => s.score?.participant === "away")?.score?.goals ?? 0;
    const state = fx.state?.developer_name ?? "";
    const periods: any[] = Array.isArray(fx.periods) ? fx.periods : [];
    const ticking = periods.find((p) => p.ticking);
    const minute = typeof ticking?.minutes === "number" ? ticking.minutes : 0;
    out.push({
      smId: fx.id,
      home,
      away,
      minute,
      stateDevName: state,
      live: LIVE_STATES.has(state),
      finished: FINISHED_STATES.has(state),
    });
  }
  return out;
}

/**
 * النتائج الحيّة اللحظية لكل المباريات الجارية (نداء inplay واحد) خلف كاش
 * قصير جدًا (~4ث) يُشارَك عبر دورة العامل كلها. مصدر «الوقت الحقيقي» لتحديث
 * شاشة القفل — تحديث المزوّد <15ث، فيتجاوز كاش API-Football البطيء (20ث).
 * مصفوفة (لا Map) لتأمين التخزين عبر withSWR.
 */
export async function getLiveScores(): Promise<WcLiveScore[]> {
  // كاش قصير جدًا (1.5ث طازج + 3ث بائت) ليلاحق دورة العامل المتكيّفة (2ث أثناء
  // البث). نداء inplay واحد يغطّي كل المباريات، فالضغط على المزوّد يبقى ~نداء/2ث.
  return withSWR("wc:livescores", 1500, 3000, fetchLiveScores);
}

/** النتيجة الحيّة لمباراة بمعرّف API-Football (يحلّ معرّف SportMonks ثم يبحث). */
export async function getLiveScore(apiFootballFixtureId: number): Promise<WcLiveScore | null> {
  const r = await resolveFixture(apiFootballFixtureId).catch(() => null);
  if (!r) return null;
  const arr = await getLiveScores().catch(() => [] as WcLiveScore[]);
  return arr.find((s) => s.smId === r.smId) ?? null;
}

// ---------- فورمة اللاعب + xG (جسر بالاسم الإنجليزي + الميلاد) ----------

export interface WcPlayerFormMatch {
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

export interface WcPlayerForm {
  available: boolean;
  matches: WcPlayerFormMatch[];
}

const EMPTY_PLAYER_FORM: WcPlayerForm = { available: false, matches: [] };

// جسر لاعب: اسم إنجليزي كامل + ميلاد → معرّف SportMonks. الميلاد مفتاح قوي يمنع
// الخلط؛ نطابقه أولًا، ثم نقبل مرشّحًا وحيدًا. غير ذلك = لا مطابقة (لا بيانات مغلوطة).
const smPlayerIdMap = new Map<string, number>();
async function resolveSmPlayerId(
  firstname: string | null,
  lastname: string | null,
  dob: string | null
): Promise<number | null> {
  const full = [firstname, lastname].filter(Boolean).join(" ").trim();
  if (!full) return null;
  const key = `${full}|${dob || ""}`;
  const cached = smPlayerIdMap.get(key);
  if (cached) return cached;
  const found = await withSWR<number>(`sm:player:${key}`, RESOLVE_TTL * 5, RESOLVE_TTL * 10, async () => {
    const resp = await smGet(`players/search/${encodeURIComponent(full)}`);
    const cands: any[] = Array.isArray(resp?.data) ? resp.data : [];
    if (cands.length === 0) return 0;
    const byDob = dob ? cands.find((c) => c.date_of_birth === dob) : null;
    const pick = byDob ?? (cands.length === 1 ? cands[0] : null);
    return pick?.id ?? 0;
  });
  if (found > 0) {
    smPlayerIdMap.set(key, found);
    return found;
  }
  return null;
}

async function buildPlayerForm(smPlayerId: number): Promise<WcPlayerForm> {
  const resp = await smGet(`players/${smPlayerId}`, {
    include:
      "latest.xGlineup.type;latest.details.type;latest.fixture.participants;latest.fixture.scores;latest.fixture.league",
  });
  const latest: any[] = Array.isArray(resp?.data?.latest) ? resp.data.latest : [];
  const sorted = [...latest].sort(
    (a, b) => (b.fixture?.starting_at_timestamp ?? 0) - (a.fixture?.starting_at_timestamp ?? 0)
  );
  const matches: WcPlayerFormMatch[] = [];
  for (const l of sorted) {
    const fx = l.fixture;
    if (!fx) continue;
    const parts: any[] = Array.isArray(fx.participants) ? fx.participants : [];
    const opp = parts.find((p) => p.id !== l.team_id);
    const me = parts.find((p) => p.id === l.team_id);
    const cur: any[] = Array.isArray(fx.scores) ? fx.scores.filter((s: any) => s.description === "CURRENT") : [];
    const scoreFor = cur.find((s) => s.participant_id === l.team_id)?.score?.goals ?? 0;
    const scoreAgainst = cur.find((s) => s.participant_id !== l.team_id)?.score?.goals ?? 0;
    const xgRec = (l.xglineup ?? []).find((x: any) => x.type?.code === "expected-goals");
    const details: any[] = Array.isArray(l.details) ? l.details : [];
    const stat = (code: string) => details.find((d) => d.type?.code === code)?.data?.value;
    matches.push({
      date: fx.starting_at ?? "",
      opponent: opp?.name ?? "",
      opponentLogo: opp?.image_path ?? "",
      homeAway: me?.meta?.location === "home" ? "home" : "away",
      result: scoreFor > scoreAgainst ? "W" : scoreFor < scoreAgainst ? "L" : "D",
      scoreFor,
      scoreAgainst,
      xg: xgRec ? Math.round((Number(xgRec.data?.value) || 0) * 100) / 100 : null,
      goals: Number(stat("goals")) || 0,
      rating: stat("rating") != null ? Math.round(Number(stat("rating")) * 10) / 10 : null,
      league: fx.league?.name ?? "",
    });
    if (matches.length >= 5) break;
  }
  return { available: matches.length > 0, matches };
}

/** فورمة اللاعب (آخر ٥ مباريات + xG) عبر جسر الاسم الإنجليزي + الميلاد. */
export async function getPlayerForm(opts: {
  firstname: string | null;
  lastname: string | null;
  dob: string | null;
}): Promise<WcPlayerForm> {
  const id = await resolveSmPlayerId(opts.firstname, opts.lastname, opts.dob).catch(() => null);
  if (!id) return EMPTY_PLAYER_FORM;
  return withSWR(`wc:playerform:${id}`, CACHE_TTL.LONG, CACHE_TTL.VERY_LONG, () => buildPlayerForm(id));
}

// ---------- التعليق المباشر المترجم (من commentaries — إضافة Match Facts) ----------

export interface WcCommentaryItem {
  minute: number;
  extraMinute: number | null;
  goal: boolean;
  important: boolean;
  textAr: string;
  textEn: string;
  order: number;
}

export interface WcCommentary {
  available: boolean;
  live: boolean;
  items: WcCommentaryItem[];
}

const EMPTY_COMMENTARY: WcCommentary = { available: false, live: false, items: [] };

// أسطر التعليق التي تصحّح هدفًا (إلغاء/مراجعة فار). SportMonks لا يحذف سطر
// «GOAL!» عند إلغائه، بل يُلحِق سطر تصحيح نصّيًّا غالبًا دون علامة is_goal/
// is_important — فنلتقطه بالكلمات المفتاحية كي لا يختفي التصحيح من الفلتر.
const VAR_CORRECTION_RE =
  /\b(?:VAR|disallow(?:ed)?|ruled\s+out|overturn(?:ed)?|chalked\s+off|cancell?ed|no\s+goal|offside)\b/i;
function isVarCorrectionComment(comment: unknown): boolean {
  return typeof comment === "string" && VAR_CORRECTION_RE.test(comment);
}

/**
 * يبني حمولة التعليق المباشر من بيانات SportMonks الخام: يكتفي باللحظات
 * المهمة (is_goal أو is_important) كما اتُّفق مع المستخدم، ويعرّبها للعربية.
 */
async function buildCommentary(smFixtureId: number): Promise<WcCommentary> {
  // نطلب تعريف حالة المباراة عبر state، والتعليقات الخام من commentaries
  const [fixtureResp, commentsResp] = await Promise.all([
    smGet(`fixtures/${smFixtureId}`, { include: "state" }).catch(() => null),
    smGet(`commentaries/fixtures/${smFixtureId}`).catch(() => null),
  ]);
  const live = LIVE_STATES.has(fixtureResp?.data?.state?.developer_name ?? "");
  const rawComments: any[] = Array.isArray(commentsResp?.data) ? commentsResp.data : [];
  if (rawComments.length === 0) {
    return { ...EMPTY_COMMENTARY, live };
  }

  // فلترة اللحظات المهمة فقط — الأهداف والأحداث البارزة (ركلات جزاء، تبديلات
  // مهمة، بدايات الأشواط...). المزود يعلّمها بـ is_goal/is_important. ونُبقي
  // دائمًا أسطر مراجعة الفار/الإلغاء ولو لم يعلّمها المزوّد: سطر «GOAL!» يأتي
  // بـ is_goal ويُعرَض، لكن سطر التصحيح («ruled out / disallowed / VAR») يأتي
  // غالبًا بلا علامة فيُحذف — فيبدو الهدف قائمًا رغم إلغائه. تضمينه يُظهر القصة
  // كاملة (هدف ← أُلغي بالفار) كما في التعليق الاحترافي.
  const notable = rawComments.filter(
    (c) => c?.is_goal || c?.is_important || isVarCorrectionComment(c?.comment),
  );
  // إن لم يُعلّم المزود أي لحظة (نادر، أو مباراة بلا أهداف/أحداث)، نُفرّغ الكل
  // حتى لا تظهر المباراة المنتهية كأنها بلا تعليق إطلاقًا.
  const source = notable.length > 0 ? notable : rawComments;

  const items = await translateCommentaries(
    source.map((c) => ({
      comment: c?.comment ?? "",
      minute: c?.minute ?? null,
      extra_minute: c?.extra_minute ?? null,
      is_goal: Boolean(c?.is_goal),
      is_important: Boolean(c?.is_important),
      order: c?.order ?? 0,
    }))
  );

  return { available: items.length > 0, live, items };
}

/**
 * التعليق المباشر المترجم (من commentaries — إضافة Match Facts).
 * يُرجّع اللحظات المهمة فقط (أهداف + أحداث بارزة)، مُعرّبة، مرتّبة (الأحدث أولًا).
 */
export async function getCommentary(
  apiFootballFixtureId: number,
  opts: { directSmId?: number } = {}
): Promise<WcCommentary> {
  const r = await resolveFixture(apiFootballFixtureId, opts.directSmId);
  if (!r) return EMPTY_COMMENTARY;
  return withSWR(`wc:commentary:${r.smId}`, r.ttl, r.ttl * 3, () => buildCommentary(r.smId));
}

// ---------- مباريات يوم مجمّعة حسب الدوري (leagues/date) — تجربة ----------
// نداء واحد يعيد الدوريات التي لها مباريات في التاريخ مع مباريات `today`
// (نتيجة + فرق + مرحلة + مجموعة + جولة + حالة). مناسب لـ «مباريات العالم اليوم»
// مع فلترة باقة سبق (فئة ≤2 + دورياتنا المعروفة). ليس لجدول الترتيب.

const SM_TODAY_INCLUDE =
  "today.scores;today.participants;today.stage;today.group;today.round;today.state;country";
const SM_TODAY_TTL = 30 * 1000;
const SM_TODAY_SWR = 60 * 1000;

/** دوريات باقة سبق التي نُبقيها حتى لو كانت فئتها أعلى من 2 */
const SM_PRIORITY_LEAGUE_IDS = new Set([
  732, // World Cup
  944, // Saudi Pro League (Roshn)
  950, // King's Cup
  953, // Crown Prince Cup
  1085, // AFC Champions League Elite
  1452, // FIFA Intercontinental Cup — فئة 4 فتُستبعد بلا هذا الاستثناء
]);

export interface SmTodayTeam {
  id: number;
  name: string;
  logo: string | null;
}

export interface SmTodayFixture {
  id: number;
  name: string;
  startingAt: string;
  timestamp: number;
  status: {
    code: string;
    label: string;
    elapsed: number | null;
    live: boolean;
    finished: boolean;
  };
  home: SmTodayTeam;
  away: SmTodayTeam;
  goals: { home: number | null; away: number | null };
  round: string | null;
  stage: string | null;
  group: string | null;
}

export interface SmTodayLeague {
  id: number;
  name: string;
  shortCode: string | null;
  imagePath: string | null;
  category: number;
  country: string | null;
  countryCode: string | null;
  fixtures: SmTodayFixture[];
}

export interface SmTodayBoard {
  available: boolean;
  date: string;
  leagues: SmTodayLeague[];
  /** عدد الدوريات التي استُبعدت بالفلتر (للتجربة/التشخيص) */
  filteredOut: number;
}

function smGoalsFromScores(scores: any[] | undefined, side: "home" | "away"): number | null {
  if (!Array.isArray(scores) || scores.length === 0) return null;
  const current = scores.find(
    (s) => s?.description === "CURRENT" && s?.score?.participant === side
  );
  if (current && typeof current.score?.goals === "number") return current.score.goals;
  const any = scores.find((s) => s?.score?.participant === side);
  return typeof any?.score?.goals === "number" ? any.score.goals : null;
}

function smParticipant(parts: any[] | undefined, side: "home" | "away"): SmTodayTeam {
  const p = Array.isArray(parts)
    ? parts.find((x) => x?.meta?.location === side) ?? null
    : null;
  return {
    id: Number(p?.id) || 0,
    name: String(p?.name || (side === "home" ? "مضيف" : "ضيف")),
    logo: typeof p?.image_path === "string" ? p.image_path : null,
  };
}

function normalizeSmTodayFixture(raw: any): SmTodayFixture | null {
  if (!raw || typeof raw.id !== "number") return null;
  const stateDev = String(raw?.state?.developer_name || "").toUpperCase();
  const stateShort = String(raw?.state?.short_name || raw?.state?.name || stateDev || "NS");
  const live = LIVE_STATES.has(stateDev);
  const finished = FINISHED_STATES.has(stateDev) || stateDev === "FT" || Number(raw.state_id) === 5;
  const minute =
    typeof raw?.state?.payload?.minute === "number"
      ? raw.state.payload.minute
      : typeof raw?.minute === "number"
        ? raw.minute
        : null;
  const ts =
    typeof raw.starting_at_timestamp === "number"
      ? raw.starting_at_timestamp
      : raw.starting_at
        ? Math.floor(new Date(String(raw.starting_at).replace(" ", "T") + "Z").getTime() / 1000)
        : 0;

  return {
    id: raw.id,
    name: String(raw.name || ""),
    startingAt: String(raw.starting_at || ""),
    timestamp: ts,
    status: {
      code: stateDev || stateShort || "NS",
      label: stateShort || stateDev || "NS",
      elapsed: live ? minute : null,
      live,
      finished,
    },
    home: smParticipant(raw.participants, "home"),
    away: smParticipant(raw.participants, "away"),
    goals: {
      home: smGoalsFromScores(raw.scores, "home"),
      away: smGoalsFromScores(raw.scores, "away"),
    },
    round: raw?.round?.name ? String(raw.round.name) : null,
    stage: raw?.stage?.name ? String(raw.stage.name) : null,
    group: raw?.group?.name ? String(raw.group.name) : null,
  };
}

function shouldKeepSmLeague(raw: any, includeAll: boolean): boolean {
  if (includeAll) return true;
  const id = Number(raw?.id) || 0;
  if (SM_PRIORITY_LEAGUE_IDS.has(id)) return true;
  const category = Number(raw?.category);
  // فئة 1–2 = دوريات/كؤوس بارزة في باقة SportMonks؛ 3+ هامشية غالبًا
  return Number.isFinite(category) && category > 0 && category <= 2;
}

async function fetchLeaguesByDate(day: string, includeAll: boolean): Promise<SmTodayBoard> {
  if (!isSportmonksConfigured()) {
    return { available: false, date: day, leagues: [], filteredOut: 0 };
  }

  const leagues: SmTodayLeague[] = [];
  let filteredOut = 0;
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= 8) {
    const resp = await smGet(`leagues/date/${day}`, {
      include: SM_TODAY_INCLUDE,
      per_page: "50",
      page: String(page),
    });
    const rows: any[] = Array.isArray(resp?.data) ? resp.data : [];
    for (const raw of rows) {
      if (!raw || typeof raw.id !== "number") continue;
      if (!shouldKeepSmLeague(raw, includeAll)) {
        filteredOut += 1;
        continue;
      }
      const fixtures = (Array.isArray(raw.today) ? raw.today : [])
        .map(normalizeSmTodayFixture)
        .filter((f: SmTodayFixture | null): f is SmTodayFixture => Boolean(f))
        .sort((a: SmTodayFixture, b: SmTodayFixture) => a.timestamp - b.timestamp);
      if (fixtures.length === 0) continue;
      leagues.push({
        id: raw.id,
        name: String(raw.name || ""),
        shortCode: raw.short_code ? String(raw.short_code) : null,
        imagePath: typeof raw.image_path === "string" ? raw.image_path : null,
        category: Number(raw.category) || 0,
        country: raw?.country?.name ? String(raw.country.name) : null,
        countryCode: raw?.country?.fifa_name || raw?.country?.iso2 || null,
        fixtures,
      });
    }
    const pagination = resp?.pagination;
    hasMore = Boolean(pagination?.has_more);
    page += 1;
    if (rows.length === 0) break;
  }

  leagues.sort((a, b) => {
    const aPri = SM_PRIORITY_LEAGUE_IDS.has(a.id) ? 0 : 1;
    const bPri = SM_PRIORITY_LEAGUE_IDS.has(b.id) ? 0 : 1;
    if (aPri !== bPri) return aPri - bPri;
    if (a.category !== b.category) return a.category - b.category;
    return a.name.localeCompare(b.name, "en");
  });

  return { available: true, date: day, leagues, filteredOut };
}

/**
 * مباريات يوم مجمّعة حسب الدوري عبر SportMonks `leagues/date/{date}`.
 * @param date YYYY-MM-DD (UTC تقريبًا كما يعيد المزوّد)
 * @param includeAll إن true تُعرض كل الدوريات دون فلتر فئة
 */
export async function getSmLeaguesByDate(
  date?: string,
  includeAll = false
): Promise<SmTodayBoard> {
  const day =
    date && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? date
      : new Date().toISOString().slice(0, 10);
  const key = `sm:leagues-date:${day}:${includeAll ? "all" : "top"}`;
  return withSWR(key, SM_TODAY_TTL, SM_TODAY_SWR, () => fetchLeaguesByDate(day, includeAll));
}

// ---------- قوائم التشكيلة الرسمية للأندية (Squads) ----------

export interface SmSquadPlayer {
  id: number;
  playerId: number;
  teamId: number;
  jerseyNumber: number | null;
  positionId: number | null;
  detailedPositionId: number | null;
  detailedPositionAr: string | null;
  position: string;
  positionAr: string;
  captain: boolean;
  contractStart: string | null;
  contractEnd: string | null;
  name: string;
  displayName: string;
  commonName: string;
  photo: string;
  height: number | null;
  weight: number | null;
  dateOfBirth: string | null;
  age: number | null;
  nationality: {
    id: number;
    name: string;
    nameAr: string;
    fifaName: string | null;
    iso2: string | null;
    flagUrl: string | null;
  } | null;
}

export interface SmTeamSquad {
  available: boolean;
  teamId: number;
  teamName: string;
  teamLogo: string;
  players: SmSquadPlayer[];
}

const SM_DETAILED_POSITIONS: Record<number, { en: string; ar: string }> = {
  24: { en: "Goalkeeper", ar: "حارس مرمى" },
  148: { en: "Centre Back", ar: "قلب دفاع" },
  149: { en: "Defensive Midfield", ar: "وسط دفاعي" },
  150: { en: "Central Midfield", ar: "وسط مركزي" },
  151: { en: "Centre Forward", ar: "رأس حربة" },
  152: { en: "Left Winger", ar: "جناح أيسر" },
  153: { en: "Attacking Midfield", ar: "وسط هجومي" },
  154: { en: "Right Back", ar: "ظهير أيمن" },
  155: { en: "Left Back", ar: "ظهير أيسر" },
  156: { en: "Right Winger", ar: "جناح أيمن" },
  157: { en: "Secondary Striker", ar: "مهاجم ثانٍ" },
};

/**
 * جلب قائمة تشكيلة الفريق من SportMonks (v3) مع بيانات اللاعبين والجنسيات وعقودهم.
 */
export async function getSmSquad(teamId: number, seasonId?: number): Promise<SmTeamSquad> {
  if (!isSportmonksConfigured() || !Number.isFinite(teamId) || teamId <= 0) {
    return { available: false, teamId, teamName: "", teamLogo: "", players: [] };
  }
  const key = `sm:squad:v1:${teamId}:${seasonId ?? "current"}`;
  return withSWR(key, 24 * 60 * 60 * 1000, 48 * 60 * 60 * 1000, async () => {
    try {
      const params: Record<string, string> = {
        include: "team;player.nationality;player.statistics.details.type;player.position",
      };
      if (seasonId) params.filters = `playerstatisticSeasons:${seasonId}`;
      const resp = await smGet(`squads/teams/${teamId}`, params);
      const list: any[] = Array.isArray(resp?.data) ? resp.data : [];
      if (list.length === 0) {
        return { available: false, teamId, teamName: "", teamLogo: "", players: [] };
      }
      const first = list[0];
      const teamName = first?.team?.name || "";
      const teamLogo = first?.team?.image_path || "";
      const players: SmSquadPlayer[] = list.map((item: any) => {
        const p = item.player || {};
        const posInfo = item.detailed_position_id ? SM_DETAILED_POSITIONS[item.detailed_position_id] : null;
        const posName =
          p.position?.name ||
          (item.position_id === 24
            ? "Goalkeeper"
            : item.position_id === 25
            ? "Defender"
            : item.position_id === 26
            ? "Midfielder"
            : "Attacker");
        const posAr =
          item.position_id === 24
            ? "حارس مرمى"
            : item.position_id === 25
            ? "مدافع"
            : item.position_id === 26
            ? "لاعب وسط"
            : "مهاجم";

        let age: number | null = null;
        if (p.date_of_birth) {
          const birth = new Date(p.date_of_birth);
          if (!isNaN(birth.getTime())) {
            const ageDiffMs = Date.now() - birth.getTime();
            const ageDate = new Date(ageDiffMs);
            age = Math.abs(ageDate.getUTCFullYear() - 1970);
          }
        }

        const nat = p.nationality
          ? {
              id: Number(p.nationality.id || 0),
              name: String(p.nationality.name || ""),
              nameAr: String(p.nationality.name || ""),
              fifaName: p.nationality.fifa_name || null,
              iso2: p.nationality.iso2 || null,
              flagUrl: p.nationality.image_path || null,
            }
          : null;

        return {
          id: Number(item.id || 0),
          playerId: Number(item.player_id || p.id || 0),
          teamId: Number(item.team_id || teamId),
          jerseyNumber: item.jersey_number != null ? Number(item.jersey_number) : null,
          positionId: item.position_id != null ? Number(item.position_id) : null,
          detailedPositionId: item.detailed_position_id != null ? Number(item.detailed_position_id) : null,
          detailedPositionAr: posInfo?.ar || null,
          position: posName,
          positionAr: posAr,
          captain: Boolean(item.captain),
          contractStart: item.start || null,
          contractEnd: item.end || null,
          name: p.display_name || p.name || p.common_name || "",
          displayName: p.display_name || p.name || "",
          commonName: p.common_name || "",
          photo: p.image_path || "",
          height: p.height ? Number(p.height) : null,
          weight: p.weight ? Number(p.weight) : null,
          dateOfBirth: p.date_of_birth || null,
          age,
          nationality: nat,
        };
      });

      return {
        available: true,
        teamId,
        teamName,
        teamLogo,
        players,
      };
    } catch {
      return { available: false, teamId, teamName: "", teamLogo: "", players: [] };
    }
  });
}

