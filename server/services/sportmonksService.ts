/**
 * خدمة SportMonks — مكمّل تغطية كأس العالم (لا تحلّ محل API-Football).
 *
 * تعطينا ما لا يوفّره API-Football: «التعليق النصي المباشر» لحظة بلحظة.
 * نجلب التعليق الإنجليزي من SportMonks، نعرّبه دفعة واحدة بالـAI (مرة لكل
 * جملة ثم كاش بالذاكرة)، ونخدم آلاف الزوار من خلف كاش SWR.
 *
 * ربط المعرّفات: الواجهة تعرف معرّف API-Football فقط؛ نحلّه إلى معرّف
 * SportMonks بمطابقة يوم الانطلاق (UTC) + اسمَي المنتخبين، ونخزّن الربط.
 *
 * كل طبقات الـAI/الربط «أفضل جهد»: لو غابت المفاتيح أو لم نجد المباراة،
 * نرجّع { available:false } دون أي عطل — الواجهة تعرض حالة فارغة لبقة.
 */
import OpenAI from "openai";
import { withSWR, CACHE_TTL } from "../memoryCache";
import { getFixtureIdentity, type WcFixtureIdentity } from "./worldCupService";

const SM_BASE = "https://api.sportmonks.com/v3/football";
const WC_LEAGUE_ID = 732; // World Cup عند SportMonks

// إيقاعات الكاش — التعليق الحيّ يتجدد بالثواني، والمنتهي ثابت
const COMMENTARY_LIVE_TTL = 20 * 1000;
const COMMENTARY_DONE_TTL = 60 * 60 * 1000;
const RESOLVE_TTL = 2 * 60 * 1000;
// سقف أسطر التعليق المُترجَمة (الأحدث أولًا) — يحدّ كلفة/زمن الترجمة الباردة
const COMMENTARY_MAX_LINES = 150;

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

const openai = new OpenAI();

// كاش ذاكرة مشترك: الجملة الإنجليزية (مُسوّاة) → العربية. القوالب تتكرر عبر
// المباريات فيكون معدّل إعادة الاستخدام عاليًا والترجمة تُدفع مرة واحدة.
const commentaryMemory = new Map<string, string>();
const failedLines = new Set<string>();
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

// ---------- DTOs المُعرَّبة التي تستهلكها الواجهة ----------

export interface WcCommentaryLine {
  id: number;
  order: number;
  minute: number | null;
  extraMinute: number | null;
  text: string; // العربي (أو الإنجليزي fallback إن تعذّر التعريب)
  textEn: string; // الأصل الإنجليزي
  isGoal: boolean;
  isImportant: boolean;
}

export interface WcCommentary {
  available: boolean;
  live: boolean;
  source: "sportmonks";
  lines: WcCommentaryLine[];
}

const EMPTY_COMMENTARY: WcCommentary = {
  available: false,
  live: false,
  source: "sportmonks",
  lines: [],
};

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

function normLine(s: string): string {
  return (s || "").replace(/\s+/g, " ").trim();
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

// ---------- ترجمة أسطر التعليق دفعةً ----------

// دفعة 30 سطرًا (~14s بالقياس) أصغر من 50 (~26s) — أسرع للتوازي وتحت المهلة
const TR_BATCH = 30;

async function translateLines(rawEn: string[]): Promise<void> {
  const missing = Array.from(
    new Set(
      rawEn
        .map(normLine)
        .filter((s) => s.length > 0 && !commentaryMemory.has(s) && !failedLines.has(s))
    )
  );
  if (missing.length === 0) return;
  if (!(process.env.OPENAI_API_KEY || "").trim()) return; // بلا AI — يُعرض الإنجليزي

  const batches: string[][] = [];
  for (let i = 0; i < missing.length; i += TR_BATCH) batches.push(missing.slice(i, i + TR_BATCH));

  // دفعات متوازية — التسلسل كان يجعل ترجمة ~120 سطرًا تتجاوز مهلة الطلب
  // (timeout) فلا يُكتب الكاش أبدًا ويبقى التبويب «هيكلًا عظميًا» للجميع.
  await Promise.all(
    batches.map(async (batch) => {
      try {
        const translated = await aiTranslateBatch(batch);
        // طابِق بمفتاح صدى النص أولًا، وإلا بالموضع — نموذج الـAI قد يُعيد
        // صياغة الـ"en" المُرجَع، فلا نعتمد على تطابقه الحرفي وحده (وإلا وُسِم
        // سطرٌ مُترجَم فعلًا كـ«فاشل» وبقي إنجليزيًا للأبد).
        const byKey = new Map<string, string>();
        for (const it of translated) {
          if (it.en && it.ar) byKey.set(normLine(it.en), it.ar.trim());
        }
        const positional = translated.length === batch.length;
        batch.forEach((en, j) => {
          const ar = byKey.get(en) ?? (positional ? (translated[j]?.ar ?? "").trim() : "");
          if (ar) commentaryMemory.set(en, ar);
          else failedLines.add(en);
        });
      } catch (error) {
        console.warn("[SportMonks] commentary translate failed:", (error as Error)?.message);
        for (const en of batch) failedLines.add(en);
      }
    })
  );
}

async function aiTranslateBatch(lines: string[]): Promise<{ en?: string; ar?: string }[]> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "أنت معلّق رياضي عربي. ستصلك أسطر تعليق مباشر لمباراة كرة قدم بالإنجليزية. " +
          "عرّب كل سطر إلى عربية فصيحة موجزة بأسلوب التعليق الرياضي، واحتفظ بأسماء اللاعبين " +
          "والمنتخبات بصيغتها العربية الشائعة (France → فرنسا، Argentina → الأرجنتين، Mbappé → مبابي). " +
          "انقل المصطلحات لا حرفيًا: free kick → ركلة حرة، corner → ركلة ركنية، offside → تسلل، " +
          "substitution → تبديل، yellow card → بطاقة صفراء، penalty → ركلة جزاء، throw-in → رمية تماس. " +
          "لا تضف أي معلومة غير موجودة في السطر. " +
          'أعد JSON فقط بالشكل: {"lines":[{"en":"<السطر كما ورد>","ar":"<العربي>"}]}',
      },
      { role: "user", content: JSON.stringify(lines) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: Math.min(8000, 200 + lines.length * 60),
  }, { timeout: 40000, maxRetries: 1 });

  const content = response.choices[0]?.message?.content;
  if (!content) return [];
  const parsed = JSON.parse(content) as { lines?: { en?: string; ar?: string }[] };
  return parsed.lines ?? [];
}

// ---------- بناء التعليق المُعرَّب ----------

async function buildCommentary(smFixtureId: number): Promise<WcCommentary> {
  const resp = await smGet(`fixtures/${smFixtureId}`, { include: "comments;state" });
  const data = resp?.data ?? {};
  const rawComments: any[] = Array.isArray(data.comments) ? data.comments : [];
  const live = LIVE_STATES.has(data.state?.developer_name ?? "");

  if (rawComments.length === 0) {
    return { available: false, live, source: "sportmonks", lines: [] };
  }

  // الأحدث أولًا (feed مباشر) ثم نقتصر على آخر COMMENTARY_MAX_LINES — نترجم
  // المعروض فقط لئلا يتجاوز التحميل البارد مهلة الطلب.
  const recent = [...rawComments]
    .sort((a, b) => (b.order ?? 0) - (a.order ?? 0))
    .slice(0, COMMENTARY_MAX_LINES);

  await translateLines(recent.map((c) => String(c.comment ?? "")));

  const lines: WcCommentaryLine[] = recent.map((c): WcCommentaryLine => {
    const en = String(c.comment ?? "");
    const key = normLine(en);
    return {
      id: c.id ?? 0,
      order: c.order ?? 0,
      minute: c.minute ?? null,
      extraMinute: c.extra_minute ?? null,
      text: commentaryMemory.get(key) ?? en,
      textEn: en,
      isGoal: Boolean(c.is_goal),
      isImportant: Boolean(c.is_important),
    };
  });

  return { available: true, live, source: "sportmonks", lines };
}

/**
 * يحلّ معرّف API-Football إلى معرّف SportMonks ويختار إيقاع الكاش حسب الحالة.
 * مشترك بين التعليق والزخم لتفادي تكرار منطق الربط.
 */
async function resolveFixture(
  apiFootballFixtureId: number,
  directSmId?: number
): Promise<{ smId: number; ttl: number } | null> {
  if (directSmId) return { smId: directSmId, ttl: CACHE_TTL.MEDIUM };
  const identity = await getFixtureIdentity(apiFootballFixtureId).catch(() => null);
  if (!identity) return null;
  const ttl = identity.live
    ? COMMENTARY_LIVE_TTL
    : identity.finished
      ? COMMENTARY_DONE_TTL
      : CACHE_TTL.MEDIUM;
  const smId = await resolveSportmonksFixtureId(apiFootballFixtureId, identity);
  return smId ? { smId, ttl } : null;
}

/**
 * التعليق النصي المباشر لمباراة، مُعرَّبًا وخلف كاش SWR.
 * @param apiFootballFixtureId معرّف المباراة كما تعرفه الواجهة (API-Football)
 * @param opts.directSmId معرّف SportMonks مباشر — للتشخيص/الأرشيف فقط
 */
export async function getCommentary(
  apiFootballFixtureId: number,
  opts: { directSmId?: number } = {}
): Promise<WcCommentary> {
  const r = await resolveFixture(apiFootballFixtureId, opts.directSmId);
  if (!r) return EMPTY_COMMENTARY;
  return withSWR(`wc:commentary:${r.smId}`, r.ttl, r.ttl * 3, () => buildCommentary(r.smId));
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
