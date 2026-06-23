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
const i18nCache = new Map<string, string>(); // `${type}:${id}` → الاسم باللغة المضبوطة
const i18nMissing = new Set<string>(); // معرّفات بلا ترجمة (لا نكرّر طلبها)

function tsLangCode(): string | null {
  const v = (process.env.THESPORTS_LANG || "").trim();
  return v || null;
}

export function isTsLanguageEnabled(): boolean {
  return isTheSportsConfigured() && !!tsLangCode();
}

/**
 * يحلّ أسماء بلغة `THESPORTS_LANG` (مثلًا `ar`) لمجموعة معرّفات كيان من نوع واحد،
 * ثم يعيد دالة بحث متزامنة. أفضل جهد: يجلب غير المُكاش بدفعات uuid، ويتجاهل أي فشل.
 */
export async function resolveTsNames(
  type: number,
  ids: (string | null | undefined)[],
): Promise<(id: string | null | undefined) => string | null> {
  const lookup = (id: string | null | undefined): string | null =>
    id ? i18nCache.get(`${type}:${id}`) ?? null : null;
  const lang = tsLangCode();
  if (!lang || !isTheSportsConfigured()) return lookup;

  const want = Array.from(
    new Set(ids.filter((x): x is string => !!x && x.trim().length > 0).map((x) => x.trim())),
  ).filter((id) => !i18nCache.has(`${type}:${id}`) && !i18nMissing.has(`${type}:${id}`));
  if (want.length === 0) return lookup;

  const nameField = `name_${lang}`;
  const CHUNK = 50;
  for (let i = 0; i < want.length; i += CHUNK) {
    const chunk = want.slice(i, i + CHUNK);
    try {
      const data = await withSWR(
        `ts:lang:${type}:${lang}:${chunk.join(",")}`,
        I18N_TTL,
        I18N_TTL,
        () => tsGet("language/list", { type: String(type), uuid: chunk.join(",") }),
      );
      const rows: any[] = Array.isArray(data?.results) ? data.results : [];
      const got = new Set<string>();
      for (const row of rows) {
        const id = row?.id != null ? String(row.id) : "";
        const ar = row?.[nameField];
        if (id && typeof ar === "string" && ar.trim()) {
          i18nCache.set(`${type}:${id}`, ar.trim());
          got.add(id);
        }
      }
      // علّم ما لم يرجع باسم بهذه اللغة كـmissing (لا نكرّر) — لا نعلّم عند فشل النداء.
      for (const id of chunk) if (!got.has(id)) i18nMissing.add(`${type}:${id}`);
    } catch {
      // مهلة/تهدئة عابرة — لا نُعلّم missing؛ المستدعي يتراجع بهدوء.
    }
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
  } catch {
    // فشل (IP غير مُدرَج/نقطة محجوبة/شبكة) → فعّل التهدئة فلا نُبطئ الطلبات التالية.
    tsCooldownUntil = Date.now() + TS_FAIL_COOLDOWN_MS;
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
  } catch {
    tsCooldownUntil = Date.now() + TS_FAIL_COOLDOWN_MS;
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
  } catch {
    tsCooldownUntil = Date.now() + TS_FAIL_COOLDOWN_MS;
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
  } catch {
    tsCooldownUntil = Date.now() + TS_FAIL_COOLDOWN_MS;
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
  } catch {
    tsCooldownUntil = Date.now() + TS_FAIL_COOLDOWN_MS;
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
    } catch {
      tsCooldownUntil = Date.now() + TS_FAIL_COOLDOWN_MS;
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
  } catch {
    tsCooldownUntil = Date.now() + TS_FAIL_COOLDOWN_MS;
    return [];
  }
}

// ───────────────────── إحصاء المباراة المفصّل (match/team_stats/detail) ─────────────────────
// نقطة مؤكَّدة من الدعم (2026‑06‑23). تُرجع إحصاء الفريقين لمباراة بمعرّفها (uuid).
// أفضل جهد: أي فشل → [] فلا إثراء. كاش 2د حيًّا و30د للمنتهية (نُكاش 5د وسطًا).
//
// ⚠️ **بنية الرد غير متحقَّقة حيًّا** (أعلى عدم يقين من غيرها — لا نعرف الشكل لا
// مجرّد أسماء الحقول). نحلّل دفاعيًّا ثلاثة أشكال محتملة: مصفوفة صفوف
// {type,home,away}؛ كائن فيه `.stats`؛ أو {home:[{type,value}], away:[...]}.
// نُرجع زوج القيمة لكل كود إحصاء خام؛ التسمية تتم في worldCupService (الأكواد
// المعروفة فقط — انظر STAT_TYPE — ويُسقط المجهول لتفادي تسمية خاطئة).
export interface TsTeamStat {
  type: number;
  home: number;
  away: number;
}

function parseTeamStats(resultsRaw: any): TsTeamStat[] {
  const merged = new Map<number, { home: number; away: number }>();
  const put = (type: any, side: "home" | "away", value: any) => {
    const t = Number(type);
    const v = Number(value);
    if (!Number.isFinite(t) || !Number.isFinite(v)) return;
    const cur = merged.get(t) ?? { home: 0, away: 0 };
    cur[side] = v;
    merged.set(t, cur);
  };
  const containers = Array.isArray(resultsRaw) ? resultsRaw : resultsRaw ? [resultsRaw] : [];
  for (const c of containers) {
    // الشكل 1/2: مصفوفة صفوف {type, home, away} مباشرةً أو تحت c.stats
    const rows = Array.isArray(c) ? c : Array.isArray(c?.stats) ? c.stats : null;
    if (rows) {
      for (const r of rows) {
        if (r?.type == null) continue;
        if (r.home != null || r.away != null) {
          put(r.type, "home", r.home ?? 0);
          put(r.type, "away", r.away ?? 0);
        }
      }
      continue;
    }
    // الشكل 3: {home:[{type,value}], away:[{type,value}]}
    for (const side of ["home", "away"] as const) {
      const arr = c?.[side] ?? c?.[`${side}_stats`];
      if (Array.isArray(arr)) for (const r of arr) put(r?.type, side, r?.value ?? r?.count ?? r?.num);
    }
  }
  return [...merged.entries()].map(([type, v]) => ({ type, home: v.home, away: v.away }));
}

export async function getTsMatchTeamStats(matchUuid: string): Promise<TsTeamStat[]> {
  if (!matchUuid || !isTheSportsConfigured() || Date.now() < tsCooldownUntil) return [];
  try {
    const data = await withSWR(`ts:teamstats:${matchUuid}`, 2 * 60 * 1000, 30 * 60 * 1000, () =>
      tsGet("match/team_stats/detail", { uuid: matchUuid }),
    );
    return parseTeamStats(data?.results);
  } catch {
    tsCooldownUntil = Date.now() + TS_FAIL_COOLDOWN_MS;
    return [];
  }
}

// ───────────────────── تصنيف فيفا للمنتخبات (ranking/fifa/men) ─────────────────────
// نقطة مؤكَّدة من الدعم (2026‑06‑23): تُرجع ترتيب المنتخبات الرجالي بمعرّف فريق
// TheSports (يطابق جسرنا مباشرة، لا حاجة لمطابقة أسماء). تُحدَّث ~شهريًّا فنُكاشها
// طويلًا. أفضل جهد: أي فشل → خريطة فارغة فلا إثراء (لا عطل).
//
// ⚠️ أسماء الحقول لم تُتحقَّق حيًّا بعد (IP الجهاز المطوِّر غير مُدرَج) — نحلّل
// دفاعيًّا أسماءً محتملة (team_id|team.id، ranking|rank|position، points،
// والتغيّر من previous_ranking أو ranking_change). يلزم تأكيدها من جهاز مُدرَج.
export interface TsFifaRank {
  teamId: string;       // معرّف فريق TheSports (uuid) — يطابق الجسر
  rank: number;         // ترتيب المنتخب عالميًّا
  points: number | null;
  change: number | null; // عدد المراكز المتغيّرة (موجب = صعد ▲، سالب = نزل ▼)
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
    // الاستجابة: results = { pub_times, pub_time, items: [...] } — المصفوفة تحت items
    const rows: any[] = Array.isArray(data?.results?.items)
      ? data.results.items
      : Array.isArray(data?.results)
        ? data.results
        : [];
    const map = new Map<string, TsFifaRank>();
    for (const r of rows) {
      const rawId = r?.team_id ?? r?.team?.id ?? (typeof r?.team === "string" ? r.team : null);
      const teamId = rawId != null ? String(rawId) : "";
      const rank = pickNum(r?.ranking, r?.rank, r?.position) ?? 0;
      if (!teamId || !rank) continue;
      const points = pickNum(r?.points, r?.point, r?.score);
      // التغيّر: نفضّل اشتقاقه من الترتيب السابق (دلالة واضحة: موجب=صعد)، وإلا حقل صريح.
      const prev = pickNum(r?.previous_ranking, r?.prev_ranking, r?.last_ranking, r?.old_ranking);
      let change: number | null = null;
      if (prev != null && prev > 0) change = prev - rank;
      else change = pickNum(r?.ranking_change, r?.rank_change, r?.change);
      map.set(teamId, { teamId, rank, points, change });
    }
    return map;
  } catch {
    tsCooldownUntil = Date.now() + TS_FAIL_COOLDOWN_MS;
    return new Map();
  }
}

// ───────────────────── إصابات/غيابات الفريق (team/injury/list) ─────────────────────
// نقطة مؤكَّدة من الدعم (2026‑06‑23). تُرجع لائحة المصابين/الغائبين لفريق بمعرّف
// TheSports (uuid). أفضل جهد: أي فشل → [] فلا إثراء. كاش 6س (تتغيّر يوميًّا).
//
// ⚠️ أسماء الحقول غير متحقَّقة حيًّا — تحليل دفاعي: معرّف/اسم اللاعب، سبب نصّي،
// معرّف نوع الإصابة (i18n type 6)، حالة الغياب، وقت البداية/النهاية المتوقّعة.
// اسم اللاعب قد لا يأتي في الرد (نقطة ملف اللاعب محجوبة) — يُحلّ best-effort لاحقًا.
export interface TsInjury {
  playerId: string | null;
  playerName: string | null; // إن أتى في الرد مباشرة
  reason: string | null;     // نصّ سبب الغياب إن وُجد
  reasonId: string | null;   // معرّف نوع الإصابة (i18n type 6)
  status: string | null;     // نوع الغياب (إصابة/إيقاف…) إن وُجد
  startTime: number | null;
  endTime: number | null;
}

export async function getTsTeamInjuries(uuid: string): Promise<TsInjury[]> {
  if (!uuid || !isTheSportsConfigured() || Date.now() < tsCooldownUntil) return [];
  try {
    const data = await withSWR(`ts:injury:${uuid}`, 6 * 60 * 60 * 1000, 12 * 60 * 60 * 1000, () =>
      tsGet("team/injury/list", { uuid }),
    );
    const rows: any[] = Array.isArray(data?.results) ? data.results : [];
    const out: TsInjury[] = [];
    for (const r of rows) {
      const playerId =
        r?.player_id != null ? String(r.player_id) : r?.player?.id != null ? String(r.player.id) : null;
      const pName = r?.player_name ?? r?.player?.name ?? r?.name;
      const reason = r?.reason ?? r?.desc ?? r?.description ?? null;
      const reasonId =
        r?.type != null && typeof r.type !== "object" ? String(r.type) : r?.injury_type != null ? String(r.injury_type) : null;
      const status = r?.missing_type ?? r?.status ?? null;
      out.push({
        playerId,
        playerName: typeof pName === "string" && pName.trim() ? pName.trim() : null,
        reason: typeof reason === "string" && reason.trim() ? reason.trim() : null,
        reasonId,
        status: typeof status === "string" && status.trim() ? status.trim() : null,
        startTime: pickNum(r?.start_time, r?.begin_time, r?.from),
        endTime: pickNum(r?.end_time, r?.expected_end_time, r?.to),
      });
    }
    return out;
  } catch {
    tsCooldownUntil = Date.now() + TS_FAIL_COOLDOWN_MS;
    return [];
  }
}
