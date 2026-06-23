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
