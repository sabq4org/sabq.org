// TheSports — مصدر نتيجة لحظية فائق السرعة (sub-minute) لمباريات المونديال.
//
// لماذا: مزوّدونا الحاليون (API-Football للأسماء/التشكيلات، SportMonks للنتيجة
// الحيّة) يتأخّران ~دقيقة على النتيجة، فتتأخّر المتابعة الحيّة وقفل الشاشة.
// TheSports يحدّث النتيجة فورًا. نستخدمه نتيجةً سريعةً فقط — لا أسماء ولا تشكيلات
// (الاشتراك «لحظي فقط»: detail_live + match/diary يعملان، وكل نقاط الأسماء محجوبة).
//
// الجسر (لا نحتاج أسماء TheSports إطلاقًا):
//   1) بطولة المونديال ثابتة في TheSports: competition_id = WC_COMPETITION_ID
//      (تحقّق مباشر: طابقنا نيوزيلندا 1–3 مصر + الأرجنتين×النمسا + فرنسا×العراق
//       بوقت البداية والنتيجة بالضبط — 2026-06-22).
//   2) لمباراتنا (WcFixture لها timestamp = وقت البداية) نبحث diary لذلك اليوم،
//      نُرشّح competition==WC، ونطابق match_time == fx.timestamp. مباريات المونديال
//      متباعدة ~3 ساعات داخل البطولة فلا تصادم على الدقيقة → ربط أحادي مؤكّد.
//   3) detail_live (نداء واحد يرجع كل المباريات الجارية) → نقرأ النتيجة بمعرّف
//      مباراة TheSports المربوط.
//
// أفضل جهد بالكامل: أي فشل (IP غير مُدرَج في الإنتاج، نقطة محجوبة، شبكة) يرجع
// null فيتراجع overlayLiveScore بهدوء إلى SportMonks ثم API-Football.
//
// تفعيل الإنتاج يتطلّب: ضبط THESPORTS_USER + THESPORTS_SECRET، وإدراج عنوان
// خروج Railway في قائمة TheSports المسموح بها (هذه القائمة هي ما يحجب «URL not
// authorized»). بدون أيٍّ منهما يبقى المزوّد خاملًا والسلوك الحالي كما هو.

import { withSWR } from "../memoryCache";

const TS_BASE = "https://api.thesports.com/v1/football";

// مُعرّف بطولة كأس العالم في TheSports (مُتحقَّق منه بمطابقة الجدول والنتيجة).
export const WC_COMPETITION_ID = "kp3glrw7hwqdyjv";

// حالات TheSports: 1=لم تبدأ، 2=ش1، 3=استراحة، 4=ش2، 5/6=وقت إضافي، 7=ركلات،
// 8=انتهت، 9=تأجيل، ...
const TS_LIVE_STATUS = new Set([2, 3, 4, 5, 6, 7]);
const TS_FINISHED_STATUS = 8;

// إيقاعات الكاش: detail_live حيّ بالثواني، والجسر (المعرّف) دائم بعد أول حلّ.
const LIVE_TTL = 5 * 1000;
const LIVE_SWR = 12 * 1000;
const BRIDGE_TTL = 6 * 60 * 60 * 1000; // المعرّف لا يتغيّر؛ نُعيد الحلّ مرتين/يوم احتياطًا

// ربط إيجابي فقط: معرّف مباراتنا (API-Football) → معرّف مباراة TheSports.
const matchIdBridge = new Map<number, string>();

export function isTheSportsConfigured(): boolean {
  return Boolean(
    (process.env.THESPORTS_USER || "").trim() && (process.env.THESPORTS_SECRET || "").trim()
  );
}

async function tsGet(path: string, params: Record<string, string> = {}): Promise<any> {
  const user = (process.env.THESPORTS_USER || "").trim();
  const secret = (process.env.THESPORTS_SECRET || "").trim();
  if (!user || !secret) throw new Error("THESPORTS_USER / THESPORTS_SECRET غير مضبوطين");

  const url = new URL(`${TS_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("user", user);
  url.searchParams.set("secret", secret);

  const response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`[TheSports] HTTP ${response.status} for ${path}`);
  const json = await response.json();
  // الأخطاء تأتي 200 بجسم {err:"..."} (نقطة محجوبة / IP غير مُدرَج)
  if (json && typeof json === "object" && "err" in json) {
    throw new Error(`[TheSports] ${json.err}`);
  }
  return json;
}

// مفتاح يوم UTC من طابع زمني (تنسيق diary: YYYYMMDD)
function utcDateKey(timestampSec: number): string {
  const d = new Date(timestampSec * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

// جدول يوم كامل لبطولة المونديال (مُعرّفات + أوقات + نتائج) — يُكاش طويلًا.
async function getWcDiary(dateKey: string): Promise<any[]> {
  const data = await withSWR(
    `ts:diary:${dateKey}`,
    BRIDGE_TTL,
    BRIDGE_TTL * 2,
    () => tsGet("match/diary", { date: dateKey })
  );
  const results: any[] = Array.isArray(data?.results) ? data.results : [];
  return results.filter((m) => m.competition_id === WC_COMPETITION_ID);
}

// حلّ معرّف مباراة TheSports لمباراتنا عبر الجسر (بطولة + وقت بداية).
async function resolveTsMatchId(fixtureId: number, kickoffTs: number): Promise<string | null> {
  const cached = matchIdBridge.get(fixtureId);
  if (cached) return cached;
  if (!kickoffTs) return null;

  const wc = await getWcDiary(utcDateKey(kickoffTs));
  // مطابقة بوقت البداية بسماحية دقيقتين (فروقات تقريب بين المزوّدين)
  const hit = wc.find((m) => Math.abs((m.match_time ?? 0) - kickoffTs) <= 120);
  if (hit?.id) {
    matchIdBridge.set(fixtureId, hit.id);
    return hit.id;
  }
  return null;
}

// كل المباريات الجارية الآن (نداء واحد يخدم جميع المباريات) — يُكاش بالثواني.
async function getLiveMap(): Promise<Map<string, any>> {
  const data = await withSWR(
    "ts:detail_live",
    LIVE_TTL,
    LIVE_SWR,
    () => tsGet("match/detail_live")
  );
  const results: any[] = Array.isArray(data?.results) ? data.results : [];
  const map = new Map<string, any>();
  for (const m of results) if (m?.id) map.set(m.id, m);
  return map;
}

export interface TsFastScore {
  home: number;
  away: number;
  statusId: number;
  live: boolean;
  finished: boolean;
}

// score: [matchId, statusId, [home: reg,ht,red,yel,corner,ot,pen], [away...], ts, ""]
function decodeScore(scoreArr: any): { home: number; away: number; statusId: number } | null {
  if (!Array.isArray(scoreArr) || scoreArr.length < 4) return null;
  const statusId = Number(scoreArr[1]);
  const homeArr = scoreArr[2];
  const awayArr = scoreArr[3];
  if (!Array.isArray(homeArr) || !Array.isArray(awayArr)) return null;
  return { home: Number(homeArr[0]) || 0, away: Number(awayArr[0]) || 0, statusId };
}

/**
 * النتيجة اللحظية الفائقة لمباراة مونديال — أفضل جهد.
 * @param fixtureId معرّف مباراتنا (API-Football)
 * @param kickoffTs وقت البداية (ثوانٍ، UTC) — مفتاح الجسر
 * @returns النتيجة الحيّة من TheSports أو null للتراجع للمصدر الحالي
 */
export async function getTheSportsFastScore(
  fixtureId: number,
  kickoffTs: number
): Promise<TsFastScore | null> {
  if (!isTheSportsConfigured()) return null;
  try {
    const tsMatchId = await resolveTsMatchId(fixtureId, kickoffTs);
    if (!tsMatchId) return null;

    const liveMap = await getLiveMap();
    const live = liveMap.get(tsMatchId);
    if (!live) return null; // ليست جارية الآن (منتهية/لم تبدأ) → اترك المصدر الحالي

    const decoded = decodeScore(live.score);
    if (!decoded) return null;

    return {
      home: decoded.home,
      away: decoded.away,
      statusId: decoded.statusId,
      live: TS_LIVE_STATUS.has(decoded.statusId),
      finished: decoded.statusId === TS_FINISHED_STATUS,
    };
  } catch {
    return null; // IP غير مُدرَج / نقطة محجوبة / شبكة → تراجع صامت
  }
}
