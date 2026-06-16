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

  // withSWR يدمج الطلبات المتزامنة لمباراة غير محلولة في استدعاء SportMonks واحد
  const found = await withSWR<number | null>(
    `wc:smfix:${apiFootballFixtureId}`,
    RESOLVE_TTL,
    RESOLVE_TTL * 2,
    async () => {
      if (!identity.kickoffIso || !identity.homeNameEn || !identity.awayNameEn) return null;
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
        if (parts.includes(homeKey) && parts.includes(awayKey)) return fx.id ?? null;
      }
      return null;
    }
  );

  if (found) fixtureIdMap.set(apiFootballFixtureId, found);
  return found;
}

// ---------- ترجمة أسطر التعليق دفعةً ----------

const TR_BATCH = 50;

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

  for (let i = 0; i < missing.length; i += TR_BATCH) {
    const batch = missing.slice(i, i + TR_BATCH);
    try {
      const out = await aiTranslateBatch(batch);
      for (const en of batch) {
        const ar = out[en];
        if (ar && ar.trim()) commentaryMemory.set(en, ar.trim());
        else failedLines.add(en);
      }
    } catch (error) {
      console.warn("[SportMonks] commentary translate failed:", (error as Error)?.message);
      for (const en of batch) failedLines.add(en);
    }
  }
}

async function aiTranslateBatch(lines: string[]): Promise<Record<string, string>> {
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
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return {};
  const parsed = JSON.parse(content) as { lines?: { en?: string; ar?: string }[] };
  const out: Record<string, string> = {};
  for (const item of parsed.lines ?? []) {
    if (item.en && item.ar) out[normLine(item.en)] = item.ar;
  }
  return out;
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

  await translateLines(rawComments.map((c) => String(c.comment ?? "")));

  const lines: WcCommentaryLine[] = rawComments
    .map((c): WcCommentaryLine => {
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
    })
    .sort((a, b) => b.order - a.order); // الأحدث أولًا — تجربة feed مباشر

  return { available: true, live, source: "sportmonks", lines };
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
  let smId: number | null = opts.directSmId ?? null;
  let ttl: number = CACHE_TTL.MEDIUM;

  if (!smId) {
    const identity = await getFixtureIdentity(apiFootballFixtureId).catch(() => null);
    if (!identity) return EMPTY_COMMENTARY;
    ttl = identity.live
      ? COMMENTARY_LIVE_TTL
      : identity.finished
        ? COMMENTARY_DONE_TTL
        : CACHE_TTL.MEDIUM;
    smId = await resolveSportmonksFixtureId(apiFootballFixtureId, identity);
  }

  if (!smId) return EMPTY_COMMENTARY;

  return withSWR(`wc:commentary:${smId}`, ttl, ttl * 3, () => buildCommentary(smId!));
}
