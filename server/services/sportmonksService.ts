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
const WC_LEAGUE_ID = 732; // World Cup عند SportMonks

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

async function smGet(path: string, params: Record<string, string> = {}): Promise<any> {
  const token = (process.env.SPORTMONKS_API_TOKEN || "").trim();
  if (!token) throw new Error("SPORTMONKS_API_TOKEN is not set");

  const url = new URL(`${SM_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("api_token", token);

  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    throw new Error(`[SportMonks] HTTP ${response.status} for ${path}`);
  }
  return response.json();
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
  // التوقعات مستقرّة نسبيًا — كاش متوسط بغضّ النظر عن حالة المباراة
  return withSWR(`wc:forecast:${r.smId}`, CACHE_TTL.MEDIUM, CACHE_TTL.LONG, () =>
    buildForecast(r.smId)
  );
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
  return withSWR("wc:livescores", 4000, 8000, fetchLiveScores);
}

/** النتيجة الحيّة لمباراة بمعرّف API-Football (يحلّ معرّف SportMonks ثم يبحث). */
export async function getLiveScore(apiFootballFixtureId: number): Promise<WcLiveScore | null> {
  const r = await resolveFixture(apiFootballFixtureId).catch(() => null);
  if (!r) return null;
  const arr = await getLiveScores().catch(() => [] as WcLiveScore[]);
  return arr.find((s) => s.smId === r.smId) ?? null;
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
  // مهمة، بدايات الأشواط...). المزود يعلّمها بـ is_goal/is_important.
  const notable = rawComments.filter((c) => c?.is_goal || c?.is_important);
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
