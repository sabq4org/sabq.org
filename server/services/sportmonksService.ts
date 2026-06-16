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
