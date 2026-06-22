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

import https from "node:https";
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

// قاطع دائرة: عند أي فشل (IP غير مُدرَج/شبكة/نقطة محجوبة) نُجمّد كل نداءات
// TheSports لفترة تهدئة، فلا يتكرّر النداء البطيء في كل طلب ويُبطئ نقاطَ المستخدم
// (overview/fixtures). السبب: withSWR لا يخزّن الأخطاء — فبلا القاطع يُعاد النداء
// الفاشل كل مرّة قبل التراجع لـ SportMonks. يتعافى ذاتيًّا بعد انتهاء التهدئة.
const TS_FAIL_COOLDOWN_MS = 60 * 1000;
let tsCooldownUntil = 0;

// مهلة قصيرة: نتيجة لحظية لا قيمة لها إن تأخّرت، والأهم ألّا تُبطئ صفحة المستخدم.
const TS_HTTP_TIMEOUT_MS = 4000;

// اتصال IPv4 مُعاد الاستخدام (keep-alive) — يلغي مصافحة TLS جديدة لكل نداء،
// فيقارب أداء fetch المجمّع. family:4 على الوكيل يضمن IPv4 (قائمة TheSports IPv4).
const tsAgent = new https.Agent({ keepAlive: true, family: 4, maxSockets: 8 });

export function isTheSportsConfigured(): boolean {
  return Boolean(
    (process.env.THESPORTS_USER || "").trim() && (process.env.THESPORTS_SECRET || "").trim()
  );
}

// نُجبر IPv4 صراحةً (family: 4). قائمة TheSports المسموح بها مبنيّة على IPv4 فقط،
// و`fetch` العام في Node (undici) يفضّل IPv6 عند توفّره فيخرج بعنوان غير مُدرَج
// ويرجع «IP not authorized» — فتُعطَّل الميزة بصمت رغم صحّة المفتاح وإدراج IPv4.
// node:https يمرّر family إلى مقبس الاتصال فيُحلّ الاسم ويتصل عبر IPv4 حصرًا.
function httpsGetJson(url: URL, timeoutMs: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { agent: tsAgent, timeout: timeoutMs }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 400) {
        res.resume();
        reject(new Error(`[TheSports] HTTP ${status}`));
        return;
      }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error("[TheSports] رد غير صالح (JSON)"));
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("[TheSports] انتهت المهلة")));
    req.on("error", reject);
  });
}

async function tsGet(path: string, params: Record<string, string> = {}): Promise<any> {
  const user = (process.env.THESPORTS_USER || "").trim();
  const secret = (process.env.THESPORTS_SECRET || "").trim();
  if (!user || !secret) throw new Error("THESPORTS_USER / THESPORTS_SECRET غير مضبوطين");

  const url = new URL(`${TS_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("user", user);
  url.searchParams.set("secret", secret);

  const json = await httpsGetJson(url, TS_HTTP_TIMEOUT_MS);
  // الأخطاء تأتي 200 بجسم {err:"..."} (نقطة محجوبة / IP غير مُدرَج)
  if (json && typeof json === "object" && "err" in json) {
    throw new Error(`[TheSports] ${json.err}`);
  }
  return json;
}

// مفتاح يوم diary (YYYYMMDD). مهم: TheSports يفهرس الـdiary بتوقيت بكين (UTC+8)
// لا UTC — فمباراة 17:00 UTC تقع تحت اليوم التالي. نحسب المفتاح بإزاحة ساعات.
function dateKeyAt(timestampSec: number, offsetHours: number): string {
  const d = new Date((timestampSec + offsetHours * 3600) * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

// مفاتيح أيام مرشّحة للجسر: يوم بكين (الصحيح) + UTC + جواره ليومٍ احتياطًا ضد أي
// التباس توقيت. مكرّرات تُزال. الحلّ يحدث مرّةً ثم يُكاش المعرّف، فلا تكرار.
function candidateDateKeys(timestampSec: number): string[] {
  const keys = [
    dateKeyAt(timestampSec, 8), // بكين (UTC+8) — ما يستخدمه diary فعليًا
    dateKeyAt(timestampSec, 0), // UTC
    dateKeyAt(timestampSec, 32), // اليوم التالي بتوقيت بكين
    dateKeyAt(timestampSec, -16), // اليوم السابق بتوقيت بكين
  ];
  return [...new Set(keys)];
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

  // مطابقة بوقت البداية بسماحية دقيقتين (فروقات تقريب بين المزوّدين) عبر أيام
  // مرشّحة (التباس توقيت بكين/UTC). أول مطابقة تُربط وتُكاش.
  for (const dateKey of candidateDateKeys(kickoffTs)) {
    const wc = await getWcDiary(dateKey);
    const hit = wc.find((m) => Math.abs((m.match_time ?? 0) - kickoffTs) <= 120);
    if (hit?.id) {
      matchIdBridge.set(fixtureId, hit.id);
      return hit.id;
    }
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
  penHome: number | null;
  penAway: number | null;
  statusId: number;
  live: boolean;
  finished: boolean;
}

// score: [matchId, statusId, [home: reg,ht,red,yel,corner,ot,pen], [away...], ts, ""]
// خانات النتيجة (موثّقة من TheSports): 0=وقت أصلي 1=شوط أول 2=حمراء 3=صفراء
// 4=ركنيات 5=وقت إضافي 6=ركلات ترجيح. خوارزمية المجموع الرسمية: إن كان الوقت
// الإضافي ≠ 0 فالنتيجة المعروضة هي مجموع الوقت الإضافي (يتضمّن الـ90د)، وإلا
// فهي الوقت الأصلي؛ والركلات تُعرَض منفصلةً. هذا يصحّح أدوار خروج المغلوب —
// دور المجموعات بلا إضافي/ركلات فالخانة [0] تكفي تلقائيًا.
function decodeScore(
  scoreArr: any
): { home: number; away: number; penHome: number | null; penAway: number | null; statusId: number } | null {
  if (!Array.isArray(scoreArr) || scoreArr.length < 4) return null;
  const statusId = Number(scoreArr[1]);
  const homeArr = scoreArr[2];
  const awayArr = scoreArr[3];
  if (!Array.isArray(homeArr) || !Array.isArray(awayArr)) return null;

  const reg = (a: any[]) => Number(a[0]) || 0;
  const ot = (a: any[]) => Number(a[5]) || 0;
  const pen = (a: any[]) => Number(a[6]) || 0;

  const otHome = ot(homeArr);
  const otAway = ot(awayArr);
  const useOvertime = otHome !== 0 || otAway !== 0;
  const penHomeVal = pen(homeArr);
  const penAwayVal = pen(awayArr);
  const hasPenalties = penHomeVal !== 0 || penAwayVal !== 0;

  return {
    home: useOvertime ? otHome : reg(homeArr),
    away: useOvertime ? otAway : reg(awayArr),
    penHome: hasPenalties ? penHomeVal : null,
    penAway: hasPenalties ? penAwayVal : null,
    statusId,
  };
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
  // قاطع الدائرة: أثناء التهدئة لا نلمس الشبكة إطلاقًا → تراجع فوري لـ SportMonks.
  if (Date.now() < tsCooldownUntil) return null;
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
      penHome: decoded.penHome,
      penAway: decoded.penAway,
      statusId: decoded.statusId,
      live: TS_LIVE_STATUS.has(decoded.statusId),
      finished: decoded.statusId === TS_FINISHED_STATUS,
    };
  } catch {
    // فشل (IP غير مُدرَج/نقطة محجوبة/شبكة) → فعّل التهدئة فلا نُبطئ الطلبات التالية.
    tsCooldownUntil = Date.now() + TS_FAIL_COOLDOWN_MS;
    return null; // تراجع صامت لـ SportMonks ثم API-Football
  }
}
