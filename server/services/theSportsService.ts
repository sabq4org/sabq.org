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

// خريطة منسّقة: slug البطولة لدينا (saudiLeagueService) → competition_id في TheSports.
// المعرّفات زوّدنا بها فريق TheSports رسميًا (2026‑06‑23) وهي ثابتة لا تتغيّر.
// تُستعمل لتعميم الطبقة اللحظية خارج المونديال (المرحلة 1): نقيّد diary على هذه
// المعرّفات ثم نطابق مبارياتنا زمنيًا كما في جسر المونديال.
export const TS_COMPETITION_IDS: Record<string, string> = {
  "world-cup": WC_COMPETITION_ID,
  "pro-league": "j1l4rjnh66nm7vx",          // دوري روشن السعودي
  "afc-champions-league": "9dn1m1ghjpmoepl", // دوري أبطال آسيا للنخبة
  "premier-league": "jednm9whz0ryox8",       // الدوري الإنجليزي الممتاز
  "la-liga": "vl7oqdehlyr510j",              // الدوري الإسباني
  "serie-a": "4zp5rzghp5q82w1",             // الدوري الإيطالي
  "bundesliga": "gy0or5jhg6qwzv3",          // الدوري الألماني
  "ligue-1": "yl5ergphnzr8k0o",             // الدوري الفرنسي
};

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

// تتبّع آخر فشل للتشخيص: قبل هذا كان الـ cooldown يُفعَّل صامتًا بلا أثر في السجلات،
// فلا يمكن تمييز «المزوّد خامل» عن «IP Railway غير مُدرج» عن «يعمل طبيعيًّا».
// هذان المتغيّران يُقرآن عبر getTheSportsStatus() في /health فقط (لا يكشفان أسرارًا).
let tsLastError: string | null = null;
let tsLastErrorAt: number | null = null;

/**
 * يُفعّل الـcooldown ويسجّل سبب الفشل (رسالة TheSports الخام). يُستدعى من كل
 * نقطة دخول عند فشل النداء. مركزيّ لتجنّب تكرار منطق التهدئة وضمان وجود أثر
 * واحد قابل للتشخيص في السجلات.
 */
function armCooldown(reason: unknown): void {
  const msg = reason instanceof Error ? reason.message : String(reason);
  tsCooldownUntil = Date.now() + TS_FAIL_COOLDOWN_MS;
  tsLastError = msg;
  tsLastErrorAt = Date.now();
  // تحذير واحد لكل فشل (لا نداء) — رسائل TheSports مثل «URL not authorized»
  // أو «IP not authorized» تُظهر فورًا هل المشكلة إدراج IP أم لا.
  console.warn(`[TheSports] cooldown armed (${TS_FAIL_COOLDOWN_MS}ms): ${msg}`);
}

/**
 * لقطة تشخيصية لحالة مزوّد TheSports — تُستهلك من /health فقط. تكشف ما يلي:
 *   - configured: هل ضُبطت THESPORTS_USER/SECRET؟
 *   - inCooldown: هل نحن داخل فترة التهدئة (أي فشل حديث)؟
 *   - cooldownRemainingMs: كم بقي على انتهاء التهدئة (0 لو لسنا فيها).
 *   - lastError / lastErrorAt: آخر رسالة خطأ خام وزمنها (أداة التشخيص الرئيسية).
 * لا تكشف أسرارًا (لا user/secret).
 */
export function getTheSportsStatus(): {
  configured: boolean;
  inCooldown: boolean;
  cooldownRemainingMs: number;
  lastError: string | null;
  lastErrorAt: number | null;
} {
  const now = Date.now();
  const inCooldown = now < tsCooldownUntil;
  return {
    configured: isTheSportsConfigured(),
    inCooldown,
    cooldownRemainingMs: inCooldown ? tsCooldownUntil - now : 0,
    lastError: tsLastError,
    lastErrorAt: tsLastErrorAt,
  };
}

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

// معرّف بطولة TheSports المقابل لـslug بطولة لدينا — أو null لو لم تُربط بعد.
// الطبقة اللحظية العامة لا تعمل إلا للبطولات المُدرَجة في الخريطة المنسّقة.
export function getTsCompetitionId(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return TS_COMPETITION_IDS[slug] ?? null;
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

// ───────────────────── أسماء المزوّد متعدّدة اللغات (language/list) ─────────────────────
// TheSports تُتيح أسماء الكيانات بلغات عدّة عبر نقطة `language/list`: ترجّع لكل id
// حقولًا مثل `name_ar` (الأسماء الموجودة فقط). نطلب بالـuuid المستهدف فقط (لاعبو
// المباراة الحاليّون) بدل تحميل القاموس الكامل (مئات الآلاف). أفضل جهد تامّ: أي
// تعذّر → نُرجع null فيتراجع المستدعي للتعريب المحلي (worldCupNameTranslator).
//
// type: 1-category · 2-country · 3-competition · 4-team · 5-player · 6-injury
export const TS_I18N_TYPE = { category: 1, country: 2, competition: 3, team: 4, player: 5, injury: 6 } as const;

const I18N_TTL = 24 * 60 * 60 * 1000; // الأسماء شبه ثابتة
const i18nCache = new Map<string, string>(); // `${type}:${id}` → الاسم العربي (name_aa)
const i18nMissing = new Set<string>(); // معرّفات بلا ترجمة (لا نكرّر طلبها)

// العربية في TheSports هي الحقل `name_aa` (لا `name_ar`) — تحقّق حيّ 2026‑06‑23.
const I18N_NAME_FIELD = "name_aa";
// `language/list` **لا يدعم uuid متعدّدًا** (تحقّق حيّ): النداء بـuuid واحد فقط.
// فنطلب واحدًا تلو الآخر بتزامن محدود، ونحدّ العدد لكل استدعاء حمايةً للحصة.
const I18N_MAX_LOOKUPS = 80;
const I18N_CONCURRENCY = 6;

export function isTsLanguageEnabled(): boolean {
  // لم تعد تتطلّب THESPORTS_LANG — الأسماء العربية (name_aa) تُجلب متى توفّر الاشتراك.
  return isTheSportsConfigured();
}

/**
 * يحلّ الأسماء العربية (`name_aa`) لمجموعة معرّفات كيان من نوع واحد، ثم يعيد دالة
 * بحث متزامنة. أفضل جهد: يجلب غير المُكاش (uuid واحد/نداء، تزامن محدود) ويتجاهل أي
 * فشل. ملاحظة (PR #450): الحقل `name_aa` لا `name_ar`، والنداء مفرد لا متعدّد.
 */
export async function resolveTsNames(
  type: number,
  ids: (string | null | undefined)[],
): Promise<(id: string | null | undefined) => string | null> {
  const lookup = (id: string | null | undefined): string | null =>
    id ? i18nCache.get(`${type}:${id}`) ?? null : null;
  if (!isTheSportsConfigured() || Date.now() < tsCooldownUntil) return lookup;

  const want = Array.from(
    new Set(ids.filter((x): x is string => !!x && x.trim().length > 0).map((x) => x.trim())),
  )
    .filter((id) => !i18nCache.has(`${type}:${id}`) && !i18nMissing.has(`${type}:${id}`))
    .slice(0, I18N_MAX_LOOKUPS);
  if (want.length === 0) return lookup;

  for (let i = 0; i < want.length; i += I18N_CONCURRENCY) {
    const slice = want.slice(i, i + I18N_CONCURRENCY);
    await Promise.all(
      slice.map(async (id) => {
        try {
          const data = await withSWR(`ts:lang:${type}:${id}`, I18N_TTL, I18N_TTL, () =>
            tsGet("language/list", { type: String(type), uuid: id }),
          );
          const row = Array.isArray(data?.results) ? data.results[0] : null;
          const name = row?.[I18N_NAME_FIELD];
          if (typeof name === "string" && name.trim()) i18nCache.set(`${type}:${id}`, name.trim());
          else i18nMissing.add(`${type}:${id}`); // موجود بلا اسم عربي — لا نكرّر
        } catch {
          // مهلة/تهدئة عابرة — لا نُعلّم missing؛ المستدعي يتراجع بهدوء.
        }
      }),
    );
  }
  return lookup;
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

// جدول يوم كامل (كل البطولات: مُعرّفات + أوقات + نتائج) — يُكاش طويلًا ويُشارَك
// بين كل البطولات (نداء diary واحد لليوم يخدم المونديال والدوري السعودي وغيرها).
async function getDiaryRaw(dateKey: string): Promise<any[]> {
  const data = await withSWR(
    `ts:diary:${dateKey}`,
    BRIDGE_TTL,
    BRIDGE_TTL * 2,
    () => tsGet("match/diary", { date: dateKey })
  );
  return Array.isArray(data?.results) ? data.results : [];
}

// حلّ معرّف مباراة TheSports لمباراتنا عبر الجسر (بطولة + وقت بداية).
//
// التعميم خارج المونديال: نفلتر diary على competitionId ثم نطابق وقت البداية
// بسماحية دقيقتين. **شرط الأمان: تطابق فريد** — إن وُجدت أكثر من مباراة في نفس
// البطولة بنفس التوقيت (جولة دوري بمواعيد متزامنة، أو الجولة الأخيرة لمجموعات
// المونديال) نمتنع عن الربط ونرجع null، فلا نخاطر بربط خاطئ يعطي نتيجة مباراة
// أخرى. يتراجع المستدعي بهدوء لـSportMonks/API-Football. (الأسماء محجوبة في
// diary، فلا يمكن فضّ الالتباس بالأسماء بعد — يأتي لاحقًا عبر results_extra.)
async function resolveTsMatchId(
  fixtureId: number,
  kickoffTs: number,
  competitionId: string
): Promise<string | null> {
  const cached = matchIdBridge.get(fixtureId);
  if (cached) return cached;
  if (!kickoffTs || !competitionId) return null;

  for (const dateKey of candidateDateKeys(kickoffTs)) {
    const day = await getDiaryRaw(dateKey);
    const candidates = day.filter(
      (m) =>
        m.competition_id === competitionId &&
        Math.abs((m.match_time ?? 0) - kickoffTs) <= 120
    );
    // التباس (مباريات متزامنة في نفس البطولة) → لا نخمّن.
    if (candidates.length > 1) return null;
    if (candidates.length === 1 && candidates[0]?.id) {
      matchIdBridge.set(fixtureId, candidates[0].id);
      return candidates[0].id;
    }
  }
  return null;
}

// كل المباريات الجارية الآن (نداء واحد يخدم جميع المباريات) — يُكاش بالثواني.
// يرجع كل عنصر بحقوله الكاملة: score + stats + incidents + tlive — فنقرأ النتيجة
// والأحداث والإحصاءات والتعليق من النداء نفسه بلا تكلفة شبكة إضافية.
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

// عنصر detail_live الخام لمباراتنا (بعد حلّ الجسر) — مصدر مشترك للنتيجة والأحداث.
async function getLiveEntry(
  fixtureId: number,
  kickoffTs: number,
  competitionId: string
): Promise<any | null> {
  const tsMatchId = await resolveTsMatchId(fixtureId, kickoffTs, competitionId);
  if (!tsMatchId) return null;
  const liveMap = await getLiveMap();
  return liveMap.get(tsMatchId) ?? null;
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

// ───────────────────────── أحداث المباراة (incidents) ─────────────────────────
// خريطة أكواد TheSports (مُستخرَجة تجريبيًا من مباريات المونديال الحيّة + التوثيق):
//   1 هدف · 8 هدف ركلة جزاء · 3 صفراء · 4 حمراء · 15 صفراوان→حمراء · 9 تبديل ·
//   11 ركلة جزاء (احتُسبت) · 12 ركلة جزاء مهدرة · 17/28 VAR · 19 وقت بدل ضائع.
// position: 1=صاحب الأرض، 2=الضيف، 0=محايد.
export type TsEventType =
  | "goal"
  | "penalty_goal"
  | "yellow"
  | "red"
  | "yellow_red"
  | "sub"
  | "penalty"
  | "penalty_missed"
  | "var"
  | "injury_time"
  | "other";

const INCIDENT_TYPE: Record<number, TsEventType> = {
  1: "goal",
  8: "penalty_goal",
  3: "yellow",
  4: "red",
  15: "yellow_red",
  9: "sub",
  11: "penalty",
  12: "penalty_missed",
  17: "var",
  28: "var",
  19: "injury_time",
};

export interface TsEvent {
  rawType: number;
  type: TsEventType;
  team: "home" | "away" | null;
  minute: number;
  second: number | null;
  player: string | null;
  playerId: string | null;
  assist: string | null;
  inPlayer: string | null;
  outPlayer: string | null;
  homeScore: number | null;
  awayScore: number | null;
  varReason: number | null;
  varResult: number | null;
}

function teamFromPosition(p: any): "home" | "away" | null {
  const n = Number(p);
  return n === 1 ? "home" : n === 2 ? "away" : null;
}

function decodeEvents(incidents: any): TsEvent[] {
  if (!Array.isArray(incidents)) return [];
  return incidents
    .map((inc): TsEvent => ({
      rawType: Number(inc?.type) || 0,
      type: INCIDENT_TYPE[Number(inc?.type)] ?? "other",
      team: teamFromPosition(inc?.position),
      minute: Number(inc?.time) || 0,
      second: inc?.second != null ? Number(inc.second) : null,
      player: inc?.player_name ?? null,
      playerId: inc?.player_id ?? null,
      assist: inc?.assist1_name ?? null,
      inPlayer: inc?.in_player_name ?? null,
      outPlayer: inc?.out_player_name ?? null,
      homeScore: inc?.home_score != null ? Number(inc.home_score) : null,
      awayScore: inc?.away_score != null ? Number(inc.away_score) : null,
      varReason: inc?.var_reason != null ? Number(inc.var_reason) : null,
      varResult: inc?.var_result != null ? Number(inc.var_result) : null,
    }))
    .sort((a, b) => (a.second ?? a.minute * 60) - (b.second ?? b.minute * 60));
}

// ───────────────────────── إحصاءات حيّة (stats) ─────────────────────────
// أكواد TheSports: 25 استحواذ% · 21 تسديد على المرمى · 22 خارج المرمى ·
//   23 هجمات · 24 هجمات خطرة · 2 ركنيات · 3 بطاقات صفراء · 4 بطاقات حمراء.
export interface TsLiveStats {
  possession?: [number, number];
  shotsOnTarget?: [number, number];
  shotsOffTarget?: [number, number];
  attacks?: [number, number];
  dangerousAttacks?: [number, number];
  corners?: [number, number];
  yellow?: [number, number];
  red?: [number, number];
}

const STAT_TYPE: Record<number, keyof TsLiveStats> = {
  25: "possession",
  21: "shotsOnTarget",
  22: "shotsOffTarget",
  23: "attacks",
  24: "dangerousAttacks",
  2: "corners",
  3: "yellow",
  4: "red",
};

function decodeStats(stats: any): TsLiveStats | null {
  if (!Array.isArray(stats) || stats.length === 0) return null;
  const out: TsLiveStats = {};
  for (const s of stats) {
    const key = STAT_TYPE[Number(s?.type)];
    if (key) out[key] = [Number(s?.home) || 0, Number(s?.away) || 0];
  }
  return Object.keys(out).length ? out : null;
}

// ───────────────────────── تعليق نصّي مباشر (tlive) ─────────────────────────
export interface TsCommentaryItem {
  minute: string;
  text: string;
  position: number;
}

function decodeCommentary(tlive: any): TsCommentaryItem[] {
  if (!Array.isArray(tlive)) return [];
  return tlive
    .filter((t) => t && t.data)
    .map((t) => ({
      minute: String(t.time ?? ""),
      text: String(t.data),
      position: Number(t.position) || 0,
    }));
}

export interface TsMatchLive extends TsFastScore {
  events: TsEvent[];
  stats: TsLiveStats | null;
  commentary: TsCommentaryItem[];
}

function buildFastScore(decoded: NonNullable<ReturnType<typeof decodeScore>>): TsFastScore {
  return {
    home: decoded.home,
    away: decoded.away,
    penHome: decoded.penHome,
    penAway: decoded.penAway,
    statusId: decoded.statusId,
    live: TS_LIVE_STATUS.has(decoded.statusId),
    finished: decoded.statusId === TS_FINISHED_STATUS,
  };
}

/**
 * النتيجة اللحظية الفائقة لمباراة — أفضل جهد.
 * @param fixtureId معرّف مباراتنا (API-Football)
 * @param kickoffTs وقت البداية (ثوانٍ، UTC) — مفتاح الجسر
 * @param competitionId معرّف بطولة TheSports (افتراضيًا المونديال للتوافق الخلفي)
 * @returns النتيجة الحيّة من TheSports أو null للتراجع للمصدر الحالي
 */
export async function getTheSportsFastScore(
  fixtureId: number,
  kickoffTs: number,
  competitionId: string = WC_COMPETITION_ID
): Promise<TsFastScore | null> {
  if (!isTheSportsConfigured()) return null;
  // قاطع الدائرة: أثناء التهدئة لا نلمس الشبكة إطلاقًا → تراجع فوري لـ SportMonks.
  if (Date.now() < tsCooldownUntil) return null;
  try {
    const live = await getLiveEntry(fixtureId, kickoffTs, competitionId);
    if (!live) return null; // ليست جارية الآن (منتهية/لم تبدأ) → اترك المصدر الحالي
    const decoded = decodeScore(live.score);
    if (!decoded) return null;
    return buildFastScore(decoded);
  } catch (e) {
    // فشل (IP غير مُدرَج/نقطة محجوبة/شبكة) → فعّل التهدئة فلا نُبطئ الطلبات التالية.
    armCooldown(e); // يُسجّل رسالة TheSports الخام للتشخيص (URL/IP not authorized، إلخ).
    return null; // تراجع صامت لـ SportMonks ثم API-Football
  }
}

/**
 * لقطة حيّة كاملة لمباراة مونديال: النتيجة + الأحداث + الإحصاءات + التعليق —
 * كلّها من نداء detail_live المكاش نفسه (بلا تكلفة شبكة إضافية فوق fast score).
 * أفضل جهد: ترجع null عند أي فشل/تهدئة فيتراجع المستدعي لمصدره الحالي.
 */
export async function getTheSportsMatchLive(
  fixtureId: number,
  kickoffTs: number,
  competitionId: string = WC_COMPETITION_ID
): Promise<TsMatchLive | null> {
  if (!isTheSportsConfigured()) return null;
  if (Date.now() < tsCooldownUntil) return null;
  try {
    const live = await getLiveEntry(fixtureId, kickoffTs, competitionId);
    if (!live) return null;
    const decoded = decodeScore(live.score);
    if (!decoded) return null;
    return {
      ...buildFastScore(decoded),
      events: decodeEvents(live.incidents),
      stats: decodeStats(live.stats),
      commentary: decodeCommentary(live.tlive),
    };
  } catch (e) {
    armCooldown(e);
    return null;
  }
}

// ───────────────────── بيانات إثرائية شبه ثابتة (additional/list, market) ─────────────────────
// نقاط مُفعَّلة في الباقة (متحقَّق منها 2026‑06‑23): team/additional/list (uuid مفرد)،
// competition/additional/list، player/market/list (uuid مفرد)، match/recent/list.
// كلّها أفضل جهد: أي فشل/تهدئة/IP غير مُدرَج → null فيتراجع المستدعي بهدوء.
const EXTRA_TTL = 24 * 60 * 60 * 1000; // بيانات شبه ثابتة (قيمة سوقية/تأسيس/حامل لقب)

export interface TsTeamExtra {
  id: string;
  name: string;
  logo: string;
  marketValue: number | null;
  marketValueCurrency: string;
  foundation: number | null;
  totalPlayers: number | null;
  coachId: string | null;
}

export async function getTsTeamExtra(uuid: string): Promise<TsTeamExtra | null> {
  if (!uuid || !isTheSportsConfigured() || Date.now() < tsCooldownUntil) return null;
  try {
    const data = await withSWR(`ts:team:extra:${uuid}`, EXTRA_TTL, EXTRA_TTL * 2, () =>
      tsGet("team/additional/list", { uuid }),
    );
    const r = Array.isArray(data?.results) ? data.results[0] : null;
    if (!r?.id) return null;
    return {
      id: String(r.id),
      name: typeof r.name === "string" ? r.name : "",
      logo: typeof r.logo === "string" ? r.logo : "",
      marketValue: typeof r.market_value === "number" && r.market_value > 0 ? r.market_value : null,
      marketValueCurrency: typeof r.market_value_currency === "string" ? r.market_value_currency : "€",
      foundation: typeof r.foundation_time === "number" && r.foundation_time > 0 ? r.foundation_time : null,
      totalPlayers: typeof r.total_players === "number" && r.total_players > 0 ? r.total_players : null,
      coachId: r.coach_id ? String(r.coach_id) : null,
    };
  } catch (e) {
    armCooldown(e);
    return null;
  }
}

export interface TsCompetitionExtra {
  id: string;
  name: string;
  logo: string;
  curSeasonId: string | null;
  titleHolderTeamId: string | null;
  titleHolderCount: number | null;
  mostTitlesTeamIds: string[];
  mostTitlesCount: number | null;
  host: string | null;
}

export async function getTsCompetitionExtra(uuid: string): Promise<TsCompetitionExtra | null> {
  if (!uuid || !isTheSportsConfigured() || Date.now() < tsCooldownUntil) return null;
  try {
    const data = await withSWR(`ts:comp:extra:${uuid}`, EXTRA_TTL, EXTRA_TTL * 2, () =>
      tsGet("competition/additional/list", { uuid }),
    );
    const r = Array.isArray(data?.results) ? data.results[0] : null;
    if (!r?.id) return null;
    // title_holder: [team_id, titles] · most_titles: [[team_id,...], titles]
    const th = Array.isArray(r.title_holder) ? r.title_holder : [];
    const mt = Array.isArray(r.most_titles) ? r.most_titles : [];
    return {
      id: String(r.id),
      name: typeof r.name === "string" ? r.name : "",
      logo: typeof r.logo === "string" ? r.logo : "",
      curSeasonId: r.cur_season_id ? String(r.cur_season_id) : null,
      titleHolderTeamId: th[0] ? String(th[0]) : null,
      titleHolderCount: typeof th[1] === "number" ? th[1] : null,
      mostTitlesTeamIds: Array.isArray(mt[0]) ? mt[0].map((x: any) => String(x)) : [],
      mostTitlesCount: typeof mt[1] === "number" ? mt[1] : null,
      host: r.host?.country ? String(r.host.country) : null,
    };
  } catch (e) {
    armCooldown(e);
    return null;
  }
}

// أزواج فرق مباريات بطولة في موسم معيّن (للجسر عبر مطابقة وقت البداية) — من
// match/recent/list (يُرجع كل مباريات البطولة بأوقاتها ومعرّفات فريقيها ومعرّف
// المباراة `id`). نُضمّن `id` ليخدم جسر معرّف المباراة (قنوات البثّ/الإحصاء).
export interface TsMatchPair {
  id: string; // معرّف مباراة TheSports (uuid) — لجسر المباراة
  home: string;
  away: string;
  time: number;
}

export async function getTsCompetitionMatchPairs(
  competitionId: string,
  seasonId: string | null,
): Promise<TsMatchPair[]> {
  if (!competitionId || !isTheSportsConfigured() || Date.now() < tsCooldownUntil) return [];
  try {
    const data = await withSWR(
      `ts:recent:${competitionId}`,
      6 * 60 * 60 * 1000,
      12 * 60 * 60 * 1000,
      () => tsGet("match/recent/list", { competition_id: competitionId }),
    );
    const rows: any[] = Array.isArray(data?.results) ? data.results : [];
    return rows
      .filter((m) => (!seasonId || m.season_id === seasonId) && m.home_team_id && m.away_team_id && m.match_time)
      .map((m) => ({
        id: m.id != null ? String(m.id) : "",
        home: String(m.home_team_id),
        away: String(m.away_team_id),
        time: Number(m.match_time),
      }));
  } catch (e) {
    armCooldown(e);
    return [];
  }
}

// ───────────────────── الترتيب اللحظي (real-time standings) ─────────────────────
// صفّ ترتيب واحد بمعرّف فريق TheSports (uuid). يُطابَق لاحقًا بصفوفنا عبر الجسر.
export interface TsStandingRow {
  teamId: string;
  position: number;
  points: number;
  played: number;
  won: number;
  draw: number;
  loss: number;
  goals: number;
  goalsAgainst: number;
  goalDiff: number;
}

function parseStandingTables(resultsRaw: any, seasonId: string | null): Map<string, TsStandingRow> {
  const out = new Map<string, TsStandingRow>();
  // season/recent/table/detail يُرجع كائنًا واحدًا {promotions,tables}؛ table/live مصفوفة.
  const results = Array.isArray(resultsRaw) ? resultsRaw : resultsRaw ? [resultsRaw] : [];
  for (const res of results) {
    if (seasonId && res?.season_id && res.season_id !== seasonId) continue;
    for (const table of Array.isArray(res?.tables) ? res.tables : []) {
      for (const r of Array.isArray(table?.rows) ? table.rows : []) {
        if (!r?.team_id) continue;
        out.set(String(r.team_id), {
          teamId: String(r.team_id),
          position: Number(r.position) || 0,
          points: Number(r.points) || 0,
          played: Number(r.total) || 0,
          won: Number(r.won) || 0,
          draw: Number(r.draw) || 0,
          loss: Number(r.loss) || 0,
          goals: Number(r.goals) || 0,
          goalsAgainst: Number(r.goals_against) || 0,
          goalDiff: Number(r.goal_diff) || 0,
        });
      }
    }
  }
  return out;
}

/**
 * الترتيب اللحظي لبطولة عبر TheSports (المسار الصحيح المؤكَّد من الدعم 2026‑06‑23):
 * `season/recent/table/detail?uuid=<seasonId>` — الترتيب الكامل المحدَّث آنيًّا (متاح
 * دائمًا، لا أثناء المباريات فقط). يتراجع إلى `table/live` (الجداول الجارية عالميًّا،
 * يُصفّى بموسم البطولة) عند تعذّره. فارغ = لا إثراء.
 */
export async function getTsLiveStandings(
  competitionId: string,
  seasonId: string | null,
): Promise<Map<string, TsStandingRow>> {
  if (!isTheSportsConfigured() || Date.now() < tsCooldownUntil) return new Map();
  // 1) الترتيب الرسمي المحدَّث آنيًّا — الباراميتر هو `uuid` (معرّف الموسم)
  if (seasonId) {
    try {
      const data = await withSWR(`ts:seasontable:${seasonId}`, 20 * 1000, 60 * 1000, () =>
        tsGet("season/recent/table/detail", { uuid: seasonId }),
      );
      const map = parseStandingTables(data?.results, null);
      if (map.size > 0) return map;
    } catch {
      /* نتراجع إلى table/live */
    }
  }
  // 2) table/live (نافذة المباراة المباشرة) — يُصفّى بموسم البطولة
  if (competitionId) {
    try {
      const data = await withSWR(`ts:tablelive:${competitionId}`, 15 * 1000, 45 * 1000, () =>
        tsGet("table/live", { competition_id: competitionId }),
      );
      return parseStandingTables(data?.results, seasonId);
    } catch (e) {
      armCooldown(e);
    }
  }
  return new Map();
}

// ───────────────────── قنوات بثّ المباراة (match/tv/list) ─────────────────────
// نقطة مؤكَّدة من الدعم (2026‑06‑23): تُرجع قنوات بثّ مباراة بمعرّفها (uuid).
// أفضل جهد: أي فشل → [] فلا قسم بثّ. كاش 6س (القنوات شبه ثابتة قبل المباراة).
//
// ⚠️ أسماء الحقول غير متحقَّقة حيًّا — تحليل دفاعي: اسم القناة، الدولة، الرابط، الشعار.
export interface TsTvChannel {
  name: string;
  country: string | null;
  url: string | null;
  logo: string | null;
}

export async function getTsMatchTv(matchUuid: string): Promise<TsTvChannel[]> {
  if (!matchUuid || !isTheSportsConfigured() || Date.now() < tsCooldownUntil) return [];
  try {
    const data = await withSWR(`ts:tv:${matchUuid}`, 6 * 60 * 60 * 1000, 12 * 60 * 60 * 1000, () =>
      tsGet("match/tv/list", { uuid: matchUuid }),
    );
    // الشكل المتحقَّق (2026‑06‑23): results[0].tv = [{ country_id, names: [..] }]
    const results: any[] = Array.isArray(data?.results) ? data.results : [];
    const entries: any[] = Array.isArray(results[0]?.tv) ? results[0].tv : [];
    const out: TsTvChannel[] = [];
    const seen = new Set<string>();
    for (const e of entries) {
      const names: any[] = Array.isArray(e?.names) ? e.names : [];
      for (const nm of names) {
        if (typeof nm !== "string" || !nm.trim()) continue;
        const key = nm.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ name: nm.trim(), country: null, url: null, logo: null });
      }
    }
    // نُبرز beIN (صاحب حقوق المونديال في الخليج/الشرق الأوسط) أولًا، ثم نحدّ الضجيج
    out.sort((a, b) => (/bein/i.test(b.name) ? 1 : 0) - (/bein/i.test(a.name) ? 1 : 0));
    return out.slice(0, 6);
  } catch (e) {
    armCooldown(e);
    return [];
  }
}

// ───────────────────── إحصاء المباراة المفصّل (match/team_stats/detail) ─────────────────────
// نقطة + بنية **متحقَّقة حيًّا (2026‑06‑23)**: `results` مصفوفة من كائنين (فريق لكل
// كائن)، كلٌّ مسطّح بحقول **مسمّاة**: `team_id` + `ball_possession, shots,
// shots_on_target, passes, passes_accuracy, corner_kicks, fouls, offsides,
// yellow_cards, red_cards, tackles, interceptions, ...`. نُرجع جانبَي الفريقين
// خامًّا (teamId + القيم)؛ التسمية والإقران (مضيف/ضيف) في worldCupService.
// أفضل جهد: أي فشل → [].
export interface TsTeamStatSide {
  teamId: string;
  values: Record<string, number>;
}

export async function getTsMatchTeamStats(matchUuid: string): Promise<TsTeamStatSide[]> {
  if (!matchUuid || !isTheSportsConfigured() || Date.now() < tsCooldownUntil) return [];
  try {
    const data = await withSWR(`ts:teamstats:${matchUuid}`, 2 * 60 * 1000, 30 * 60 * 1000, () =>
      tsGet("match/team_stats/detail", { uuid: matchUuid }),
    );
    const rows: any[] = Array.isArray(data?.results) ? data.results : [];
    return rows
      .filter((r) => r?.team_id)
      .map((r) => {
        const values: Record<string, number> = {};
        for (const [k, v] of Object.entries(r)) {
          if (k === "team_id") continue;
          const n = Number(v);
          if (Number.isFinite(n)) values[k] = n;
        }
        return { teamId: String(r.team_id), values };
      });
  } catch (e) {
    armCooldown(e);
    return [];
  }
}

// ───────────────────── تصنيف فيفا للمنتخبات (ranking/fifa/men) ─────────────────────
// نقطة + بنية **متحقَّقة حيًّا (2026‑06‑23)**: `results` كائن فيه `items[]`، وكل عنصر:
// `{ team:{id,name,logo}, region_id, ranking, points, previous_points, position_changed }`.
// `team.id` يطابق جسرنا مباشرة (لا مطابقة أسماء). تُحدَّث ~شهريًّا فنُكاشها طويلًا.
// أفضل جهد: أي فشل → خريطة فارغة فلا إثراء (لا عطل).
export interface TsFifaRank {
  teamId: string;       // معرّف فريق TheSports (uuid) — يطابق الجسر
  rank: number;         // ترتيب المنتخب عالميًّا
  points: number | null;
  change: number | null; // عدد المراكز المتغيّرة (position_changed: موجب = صعد ▲، سالب = نزل ▼)
}

function pickNum(...vals: any[]): number | null {
  for (const v of vals) {
    if (v == null || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export async function getTsFifaRanking(): Promise<Map<string, TsFifaRank>> {
  if (!isTheSportsConfigured() || Date.now() < tsCooldownUntil) return new Map();
  try {
    const data = await withSWR("ts:fifa:men", EXTRA_TTL, EXTRA_TTL * 2, () =>
      tsGet("ranking/fifa/men"),
    );
    // الاستجابة المتحقَّقة: results = { pub_time, pub_times, items: [...] }
    const r0 = Array.isArray(data?.results) ? data.results[0] : data?.results;
    const rows: any[] = Array.isArray(r0?.items) ? r0.items : [];
    const map = new Map<string, TsFifaRank>();
    for (const r of rows) {
      const teamId = r?.team?.id != null ? String(r.team.id) : "";
      const rank = pickNum(r?.ranking, r?.rank) ?? 0;
      if (!teamId || !rank) continue;
      const points = pickNum(r?.points);
      // التغيّر المتحقَّق: position_changed (موجب=صعد ▲، سالب=نزل ▼).
      const change = pickNum(r?.position_changed);
      map.set(teamId, { teamId, rank, points, change });
    }
    return map;
  } catch (e) {
    armCooldown(e);
    return new Map();
  }
}

// ───────────────────── إصابات/غيابات الفريق (team/injury/list) ─────────────────────
// نقطة + بنية **متحقَّقة حيًّا (2026‑06‑23)**: `results[0].injury` مصفوفة عناصر:
// `{ player_id, competition_id, type, injury_id, reason, start_time, end_time, missed_matches }`.
// **لا اسم لاعب في الرد** (يُحلّ بالاسم العربي عبر language/list type 5)، و`reason`
// نصّ إنجليزي ("Calf Injury") يُعرَّب في worldCupService. أفضل جهد: أي فشل → [].
export interface TsInjury {
  playerId: string | null;
  reason: string | null;    // نصّ إنجليزي — يُعرَّب لاحقًا
  injuryId: string | null;  // معرّف نوع الإصابة
  startTime: number | null;
  endTime: number | null;
  missedMatches: number | null;
}

export async function getTsTeamInjuries(uuid: string): Promise<TsInjury[]> {
  if (!uuid || !isTheSportsConfigured() || Date.now() < tsCooldownUntil) return [];
  try {
    const data = await withSWR(`ts:injury:${uuid}`, 6 * 60 * 60 * 1000, 12 * 60 * 60 * 1000, () =>
      tsGet("team/injury/list", { uuid }),
    );
    const results: any[] = Array.isArray(data?.results) ? data.results : [];
    const injuries: any[] = Array.isArray(results[0]?.injury) ? results[0].injury : [];
    return injuries.map((r) => ({
      playerId: r?.player_id != null ? String(r.player_id) : null,
      reason: typeof r?.reason === "string" && r.reason.trim() ? r.reason.trim() : null,
      injuryId: r?.injury_id != null ? String(r.injury_id) : null,
      startTime: pickNum(r?.start_time),
      endTime: pickNum(r?.end_time),
      missedMatches: pickNum(r?.missed_matches),
    }));
  } catch (e) {
    armCooldown(e);
    return [];
  }
}

// ───────────────────── زخم/ضغط المباراة (match/trend/detail) ─────────────────────
// نقطة + بنية **متحقَّقة حيًّا (2026‑06‑24)**: `results = { count, per, data:[[...],[...]] }`.
// `data` مصفوفة أشواط (count شوطًا، per دقيقة لكل شوط)، كل قيمة −100..100 = صافي
// الزخم اللحظي لتلك الدقيقة (موجب = هجمة المضيف، سالب = هجمة الضيف). نسطّح الأشواط
// إلى سلسلة دقيقة‑بدقيقة. أفضل جهد: أي فشل → null فيتراجع المستدعي لـSportMonks.
export interface TsTrend {
  perMinutes: number; // دقائق لكل شوط (عادة 45)
  values: { minute: number; value: number }[]; // مسطّحة عبر الأشواط (value: −100..100)
}

export async function getTsMatchTrend(matchUuid: string): Promise<TsTrend | null> {
  if (!matchUuid || !isTheSportsConfigured() || Date.now() < tsCooldownUntil) return null;
  try {
    const data = await withSWR(`ts:trend:${matchUuid}`, LIVE_TTL, LIVE_SWR, () =>
      tsGet("match/trend/detail", { uuid: matchUuid }),
    );
    const r = data?.results;
    const per = pickNum(r?.per) ?? 45;
    const halves: any[] = Array.isArray(r?.data) ? r.data : [];
    const values: { minute: number; value: number }[] = [];
    halves.forEach((half, h) => {
      if (!Array.isArray(half)) return;
      half.forEach((v: any, i: number) => {
        const n = Number(v);
        if (Number.isFinite(n)) values.push({ minute: h * per + i + 1, value: n });
      });
    });
    if (values.length === 0) return null;
    return { perMinutes: per, values };
  } catch (e) {
    armCooldown(e);
    return null;
  }
}

// ───────────────────── التشكيلات والخطط (match/lineup/detail) ─────────────────────
// نقطة + بنية **متحقَّقة حيًّا (2026‑06‑24)**: `results = { confirmed, home_formation,
// away_formation, coach_id:{home,away}, lineup:{home:[],away:[]}, injury:[] }`. كل
// لاعب: `{ id, first(1=أساسي), captain, name, logo, shirt_number, position, x, y, rating }`.
// الأسماء إنجليزية → نُعرّبها عبر resolveTsNames(type player). أفضل جهد: أي فشل → null.
export interface TsLineupPlayer {
  id: string;
  name: string;        // خام (إنجليزي) — للمطابقة
  nameAr: string | null; // معرَّب (name_aa) إن توفّر
  starter: boolean;
  captain: boolean;
  shirtNumber: number | null;
  position: string | null;
  x: number | null;    // 0..100 (عمق الملعب) — قد يكون 0 لبعض المباريات
  y: number | null;    // 0..100 (عرض الملعب)
  rating: number | null;
  photo: string | null;
}
export interface TsLineup {
  confirmed: boolean;
  homeFormation: string | null;
  awayFormation: string | null;
  home: TsLineupPlayer[];
  away: TsLineupPlayer[];
}

export async function getTsLineup(matchUuid: string): Promise<TsLineup | null> {
  if (!matchUuid || !isTheSportsConfigured() || Date.now() < tsCooldownUntil) return null;
  try {
    const data = await withSWR(`ts:lineup:${matchUuid}`, 60 * 1000, 5 * 60 * 1000, () =>
      tsGet("match/lineup/detail", { uuid: matchUuid }),
    );
    const r = data?.results;
    if (!r) return null;
    const lp = r.lineup ?? {};
    const mapSide = (arr: any): TsLineupPlayer[] =>
      (Array.isArray(arr) ? arr : []).map((p: any): TsLineupPlayer => {
        const rt = Number(p?.rating);
        return {
          id: p?.id != null ? String(p.id) : "",
          name: typeof p?.name === "string" ? p.name : "",
          nameAr: null,
          starter: Number(p?.first) === 1,
          captain: Number(p?.captain) === 1,
          shirtNumber: pickNum(p?.shirt_number),
          position: typeof p?.position === "string" && p.position ? p.position : null,
          x: pickNum(p?.x),
          y: pickNum(p?.y),
          rating: Number.isFinite(rt) && rt > 0 ? rt : null,
          photo: typeof p?.logo === "string" && p.logo ? p.logo : null,
        };
      });
    const home = mapSide(lp.home);
    const away = mapSide(lp.away);
    if (home.length === 0 && away.length === 0) return null;
    // تعريب أسماء اللاعبين (name_aa) دفعةً واحدة
    const lookup = await resolveTsNames(
      TS_I18N_TYPE.player,
      [...home, ...away].map((p) => p.id),
    );
    for (const p of [...home, ...away]) p.nameAr = lookup(p.id);
    return {
      confirmed: Number(r?.confirmed) === 1,
      homeFormation: typeof r?.home_formation === "string" && r.home_formation ? r.home_formation : null,
      awayFormation: typeof r?.away_formation === "string" && r.away_formation ? r.away_formation : null,
      home,
      away,
    };
  } catch (e) {
    armCooldown(e);
    return null;
  }
}

// ───────────────────── قائمة المنتخب (team/squad/list) ─────────────────────
// نقطة + بنية **متحقَّقة حيًّا (2026‑06‑24)**: `results[0] = { id, team, squad:[
// { player:{id,name}, position, shirt_number } ] }`. تُستخدم كجسر لربط لاعبي
// API-Football (بالاسم/الرقم) بمعرّفات TheSports (للقيمة السوقية وتاريخها).
export interface TsSquadPlayer {
  id: string;
  name: string; // إنجليزي
  position: string | null;
  shirtNumber: number | null;
}

export async function getTsTeamSquad(teamUuid: string): Promise<TsSquadPlayer[]> {
  if (!teamUuid || !isTheSportsConfigured() || Date.now() < tsCooldownUntil) return [];
  try {
    const data = await withSWR(`ts:squad:${teamUuid}`, EXTRA_TTL, EXTRA_TTL * 2, () =>
      tsGet("team/squad/list", { uuid: teamUuid }),
    );
    const r0 = Array.isArray(data?.results) ? data.results[0] : null;
    const sq: any[] = Array.isArray(r0?.squad) ? r0.squad : [];
    return sq
      .map((s: any): TsSquadPlayer => ({
        id: s?.player?.id != null ? String(s.player.id) : "",
        name: typeof s?.player?.name === "string" ? s.player.name : "",
        position: typeof s?.position === "string" && s.position ? s.position : null,
        shirtNumber: pickNum(s?.shirt_number),
      }))
      .filter((p) => p.id);
  } catch (e) {
    armCooldown(e);
    return [];
  }
}

// ───────────────────── القيمة السوقية للاعبين (player/with_stat/list) ─────────────────────
// نقطة + بنية **متحقَّقة حيًّا (2026‑06‑24)**: لكل لاعب `{ id, market_value,
// market_value_currency, ability, ... }`. نطلب على مستوى البطولة (نداء واحد مكاش
// طويلًا) ونعيد خريطة uuid → القيمة السوقية. أفضل جهد: أي فشل → خريطة فارغة.
export interface TsPlayerMarket {
  marketValue: number | null;
  currency: string;
}

export async function getTsCompetitionPlayerMarket(
  competitionId: string,
): Promise<Map<string, TsPlayerMarket>> {
  if (!competitionId || !isTheSportsConfigured() || Date.now() < tsCooldownUntil) return new Map();
  try {
    const data = await withSWR(`ts:pstat:${competitionId}`, EXTRA_TTL, EXTRA_TTL * 2, () =>
      tsGet("player/with_stat/list", { competition_id: competitionId }),
    );
    const rows: any[] = Array.isArray(data?.results) ? data.results : [];
    const map = new Map<string, TsPlayerMarket>();
    for (const r of rows) {
      const id = r?.id != null ? String(r.id) : "";
      if (!id) continue;
      const mv = pickNum(r?.market_value);
      map.set(id, {
        marketValue: mv != null && mv > 0 ? mv : null,
        currency: typeof r?.market_value_currency === "string" && r.market_value_currency ? r.market_value_currency : "€",
      });
    }
    return map;
  } catch (e) {
    armCooldown(e);
    return new Map();
  }
}

// ───────────────────── تاريخ القيمة السوقية للاعب (player/market/list) ─────────────────────
// نقطة + بنية **متحقَّقة حيًّا (2026‑06‑24)**: `results[0] = { id, history:[
// { market_time, market_value, market_value_currency, team_id, age } ] }`. أفضل جهد: [].
export interface TsMarketPoint {
  time: number; // ثوانٍ (epoch)
  value: number;
  currency: string;
  age: number | null;
}

export async function getTsPlayerMarketHistory(playerUuid: string): Promise<TsMarketPoint[]> {
  if (!playerUuid || !isTheSportsConfigured() || Date.now() < tsCooldownUntil) return [];
  try {
    const data = await withSWR(`ts:market:${playerUuid}`, EXTRA_TTL, EXTRA_TTL * 2, () =>
      tsGet("player/market/list", { uuid: playerUuid }),
    );
    const r0 = Array.isArray(data?.results) ? data.results[0] : null;
    const hist: any[] = Array.isArray(r0?.history) ? r0.history : [];
    return hist
      .map((h: any): TsMarketPoint => ({
        time: pickNum(h?.market_time) ?? 0,
        value: pickNum(h?.market_value) ?? 0,
        currency: typeof h?.market_value_currency === "string" && h.market_value_currency ? h.market_value_currency : "€",
        age: pickNum(h?.age),
      }))
      .filter((h) => h.time > 0 && h.value > 0)
      .sort((a, b) => a.time - b.time);
  } catch (e) {
    armCooldown(e);
    return [];
  }
}
