/**
 * التنبيهات الرياضية الذكية (المرحلة 3ب).
 *
 * دورة دوريّة تقارن حالة مباريات اليوم بآخر لقطة معروفة (snapshot في الذاكرة)،
 * تكتشف الأحداث المهمّة (انطلاق، هدف، نهاية)، ثم تُرسلها لمتابعي الفريقين فقط:
 *   1) إشعار داخل التطبيق  → notifications_inbox + بثّ لحظي (notificationBus)
 *   2) إشعار دفعي          → APNs (iOS) + FCM (Android) لأجهزة المستخدم النشطة
 *
 * مبادئ التصميم:
 *   - بلا استدعاءات AI؛ مجرّد دلتا + إرسال. بيانات المباريات من saudiLeagueService
 *     المحميّة بـ SWR، فلا ضغط إضافي على API-Football.
 *   - أول مشاهدة لأي مباراة تُسجَّل كخطّ أساس بلا إرسال (تتجنّب إغراق المستخدم عند
 *     الإقلاع بأحداث وقعت قبل التشغيل).
 *   - اللقطة في الذاكرة كافية للأساس (baseline)؛ منع تكرار البطاقات عبر المصادر
 *     يعتمد على Redis SET NX (مع سقوط آمن لذاكرة العملية إن لم يتوفر Redis).
 *   - فشل التوصيل لمستخدم لا يكسر بقيّة الدورة (محصّن بـ try/catch).
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { notificationsInbox, pushDevices } from "@shared/schema";
import { notificationBus } from "../notificationBus";
import { getRedisClient } from "../redis";
import {
  getGlobalTodayFixtures,
  getGlobalLiveFixtures,
  getMatchEventsOnly,
  type SplLiveBoardItem,
  type SplMatchEvent,
} from "./saudiLeagueService";
import {
  getTeamFollowerUserIds,
  getMatchFollowerUserIds,
  getFollowedMatchFixtureIds,
} from "./sportsFollowsService";
import {
  getTheSportsMatchLive,
  getTsCompetitionId,
  isTheSportsConfigured,
  resolveTsNames,
  TS_I18N_TYPE,
  TS_VAR_DECISIVE_RESULTS,
  TS_VAR_RESULT_AR,
  type TsEvent,
  type TsLiveStats,
  type TsMatchLive,
} from "./theSportsService";
import { resolveNames } from "./worldCupNameTranslator";
import {
  filterUsersByEventPref,
  type SportsAlertEventKey,
} from "./sportsAlertPrefsService";
import {
  sendPushNotification,
  createCustomNotificationPayload,
  isApnsConfigured,
} from "./apnsService";
import {
  sendToMultipleDevices,
  isFcmConfigured,
} from "./fcmService";

interface MatchSnapshot {
  homeGoals: number;
  awayGoals: number;
  live: boolean;
  finished: boolean;
}

type SportsAlertKind = "kickoff" | "goal" | "fulltime" | "card" | "var" | "stat_insight";

// تحويل نوع الحدث إلى مفتاح التفضيل المقابل (لترشيح المستلمين).
const ALERT_KIND_TO_PREF: Record<SportsAlertKind, SportsAlertEventKey> = {
  kickoff: "kickoff",
  goal: "goals",
  fulltime: "fulltime",
  card: "cards",
  var: "varReview",
  stat_insight: "smartSnaps",
};

interface DetectedAlert {
  fixtureId: number;
  kind: SportsAlertKind;
  title: string;
  body: string;
  teamRefIds: string[]; // معرّفات الفريقين (نص) لجلب المتابعين
  dedupeKey?: string; // بصمة معنوية عند تغيّر النص رقميًا دون تغيّر القصة
}

// لقطة آخر حالة لكل مباراة (id → snapshot). تُمسح ضمنيًّا بانتهاء اليوم لأن
// مباريات اليوم تتغيّر؛ نُنظّف المفاتيح القديمة دوريًّا لتفادي التضخّم.
const snapshots = new Map<number, MatchSnapshot>();
let lastCleanup = 0;

// آخر إحصاءات TheSports مرصودة لكل مباراة أثناء البث. detail_live يختفي بعد
// الصافرة، فلحظة اكتشاف «نهاية المباراة» لا تضمن لقطة حيّة — نحتفظ بآخرها
// لإثراء إشعار النهاية بأرقام المباراة (المونديال).
const lastStats = new Map<number, TsLiveStats>();

// «نهاية» متعادلة بلا ركلات ترجيح في دور إقصائي لا تكون نهاية حقيقية — القاعدة
// تحتّم أشواطًا إضافية أو ترجيحًا، والغالب أنها FT خاطفة من المزوّد عند د90 قبل
// التحوّل لحالة الإضافي (ET). نحتجز الإعلان حتى تنحسم أو تثبت مهلةً كاملة
// (حارس ضد مزوّد لا يُحدّث حالته أبدًا). id → أول لحظة رصد. ذاكرة فقط — إعادة
// النشر أثناء الاحتجاز تعيد عدّ المهلة، وهذا أهون من تعقيد الحالة المحفوظة.
const pendingLevelFulltime = new Map<number, number>();
const LEVEL_FULLTIME_HOLD_MS = Number(
  process.env.SPORTS_LEVEL_FULLTIME_HOLD_MS ?? 5 * 60_000,
);

// أدوار إقصائية بالتسميات المتداولة في مصادرنا (عربية من worldCupNames/التعريب،
// أو إنجليزية كما يمرّرها المزوّد في وضع en). مطابقة جزئية متساهلة — الحارس
// احترازي ولا يضرّ لو فاته دورٌ غريب التسمية (نعود لسلوك الإرسال الفوري).
const KNOCKOUT_ROUND_HINTS = [
  "نهائي", // النهائي/نصف النهائي/ربع النهائي/ثمن النهائي
  "دور الـ", // دور الـ32/دور الـ16
  "المركز الثالث",
  "الملحق",
  "final",
  "round of",
  "quarter",
  "semi",
  "third place",
  "play-off",
  "playoff",
  "knockout",
];

function isKnockoutRound(round: string): boolean {
  const r = round.trim().toLowerCase();
  if (!r) return false;
  return KNOCKOUT_ROUND_HINTS.some((hint) => r.includes(hint));
}

/** تعادل بلا حسم ترجيحي في دور إقصائي — «نهايته» مشبوهة حتى إشعار آخر. */
function isSuspectLevelKnockoutEnd(m: SplLiveBoardItem): boolean {
  if ((m.goals.home ?? 0) !== (m.goals.away ?? 0)) return false;
  const pens = m.penalties;
  if (pens && pens.home != null && pens.away != null && pens.home !== pens.away) return false;
  return isKnockoutRound(m.round);
}

// توقيعات أحداث الكروت/الفار المُرسَلة لكل مباراة (id → set of signatures). أول
// رصدٍ لمباراة يؤسّس خطّ الأساس بلا إرسال (يتفادى إغراق متابعٍ جديد بكروت سابقة).
const eventSeen = new Map<number, Set<string>>();
let lastEventCleanup = 0;

// أحداث بطاقة/فار مرصودة لكن لم تُؤكَّد بعد (id مباراة → توقيع → أول لحظة رصد).
// لا نُرسل إشعار بطاقة/فار إلا بعد أن يصمد الحدث في فيد المزوّد نافذةً زمنيةً تتجاوز
// كاش الأحداث (12ث) — أي بعد تحديثٍ حقيقيّ واحد على الأقل. الغرض: أخطاء المزوّد
// العابرة (بطاقة تظهر ثم يُصحّحها ويحذفها) تختفي قبل انقضاء النافذة فلا تخرج أبدًا.
// (الدورة كل 3ث لكن الأحداث مخزَّنة 12ث؛ فالتأكيد زمنيّ لا بعدد الدورات.)
const eventPending = new Map<number, Map<string, number>>();
const EVENT_CONFIRM_MS = Number(process.env.SPORTS_CARD_CONFIRM_MS ?? 20_000);

// نفس نافذة التأكيد لمسار TheSports (بطاقات/فار) — يقلّل الشبح ويعطي وقتًا لـ playerId.
const tsEventPending = new Map<number, Map<string, number>>();

const eventSig = (e: SplMatchEvent): string => {
  // البطاقات: لاعب واحد ≤ بطاقة واحدة من كل نوع → نتجاهل الدقيقة المتذبذبة لمنع تكرار الإشعار.
  // أولوية playerId الثابت؛ الاسم فقط كاحتياط (مُطبَّع) حتى لا يتقلّب التوقيع مع التعريب.
  if (e.type === "yellow-card" || e.type === "red-card") {
    const who =
      e.playerId != null
        ? `id:${e.playerId}`
        : `n:${(e.player || "").trim().toLowerCase().replace(/\s+/g, " ")}`;
    return `${e.type}|${e.teamId}|${who}`;
  }
  // الفار: المزوّد يعدّل الدقيقة ويملأ اسم اللاعب لاحقًا → توقيع بالفريق والتفصيل
  // فقط كي لا يُرسَل إشعار المراجعة نفسها مرّتين.
  if (e.type === "var") {
    return `var|${e.teamId}|${e.label}`;
  }
  return `${e.type}|${e.minute ?? ""}|${e.extra ?? ""}|${e.teamId}|${e.player}`;
};

/** أسماء بديلة لنفس بطاقة AF — عند اكتمال playerId لاحقًا لا يُعاد الإرسال باسم مختلف. */
function eventSigAliases(e: SplMatchEvent): string[] {
  if (e.type !== "yellow-card" && e.type !== "red-card") return [eventSig(e)];
  const out = new Set<string>([eventSig(e)]);
  if (e.playerId != null && e.player) {
    const nameWho = `n:${e.player.trim().toLowerCase().replace(/\s+/g, " ")}`;
    out.add(`${e.type}|${e.teamId}|${nameWho}`);
  }
  return [...out];
}

// توقيعات أحداث TheSports المُرسَلة لكل مباراة مونديال (منفصلة عن توقيعات
// API-Football كي لا تتصادم عند تبدّل المصدر). أول رصدٍ = خطّ أساس بلا إرسال.
const tsEventSeen = new Map<number, Set<string>>();
let lastTsEventCleanup = 0;

// لا نرسل حدثًا يُضاف متأخرًا جدًا من المزوّد. بعض مزوّدي الأحداث يعيدون ملء
// بطاقة/فار قديمة أثناء الشوط الثاني؛ كانت تُعامل كـ«حدث جديد» وتصل للمستخدم
// متأخرة جدًا (مثال: بطاقة د21 تصل عند د81). نترك هامشًا صغيرًا للتأخير الطبيعي.
const STALE_EVENT_MINUTE_GRACE = 8;
/** أقصى عمر بالوقت الحقيقي منذ أول ظهور في pending قبل اعتبار الحدث متأخرًا جدًا. */
const STALE_EVENT_WALL_MS = Number(process.env.SPORTS_STALE_EVENT_WALL_MS ?? 5 * 60_000);

function isStaleMatchEvent(
  match: SplLiveBoardItem,
  eventMinute: number | null | undefined,
  extraMinute = 0,
): boolean {
  // بعد انتهاء المباراة: أي backfill لبطاقة/فار متأخر يُرفض (لا نُغرق بعد الصافرة).
  if (match.status.finished) return true;

  const currentMinute = match.status.elapsed;
  if (eventMinute != null && eventMinute > 0 && currentMinute != null) {
    // يعمل حتى لو انقطع علم live مؤقتًا طالما الدقيقة متاحة.
    if (currentMinute - (eventMinute + extraMinute) > STALE_EVENT_MINUTE_GRACE) {
      return true;
    }
  }
  return false;
}

/** رفض بالوقت الحقيقي إن بقي الحدث معلّقًا أطول من STALE_EVENT_WALL_MS. */
function isStaleByWallClock(firstSeenAt: number, nowMs = Date.now()): boolean {
  return nowMs - firstSeenAt > STALE_EVENT_WALL_MS;
}

// حارس الإرسال الأخير: بصمة نصّ الإشعار نفسه لكل مباراة — مهما تقلّبت تواقيع
// المزوّد أعلاه، إشعارٌ بعنوان+نصّ سبق إرسالهما حرفيًّا لنفس المباراة لا يخرج ثانيةً.
const sentAlertSigs = new Map<number, Set<string>>();
let lastSentSigsCleanup = 0;
const alertSig = (a: DetectedAlert): string => a.dedupeKey ?? `${a.kind}|${a.title}|${a.body}`;

// P1: مفتاح بطاقة/فار موحّد عبر API-Football و TheSports + Redis SET NX قبل الإرسال.
// يمنع تكرار البطاقة حين يفشل أحد المصدرين أو يختلف نصّ العنوان/الجسم بين المسارين.
const CARD_ALERT_LOCK_TTL_MS = 6 * 60 * 60 * 1000;
const cardAlertMemoryLocks = new Map<string, number>();

function normalizePlayerKey(
  playerId?: string | number | null,
  playerName?: string | null,
): string {
  if (playerId != null && String(playerId).trim() !== "") return `id:${playerId}`;
  const name = (playerName || "").trim().toLowerCase().replace(/\s+/g, " ");
  return name ? `n:${name}` : "n:unknown";
}

/** لقفل Redis عبر المصدرين: الاسم أوّلًا (AF id ≠ TS id)، ثم المعرّف احتياطًا. */
function normalizePlayerKeyCrossSource(
  playerId?: string | number | null,
  playerName?: string | null,
): string {
  const name = (playerName || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (name) return `n:${name}`;
  return normalizePlayerKey(playerId, null);
}

function matchTeamSide(
  m: SplLiveBoardItem,
  teamId?: number | null,
  team?: "home" | "away" | null,
): "home" | "away" | "x" {
  if (team === "home" || team === "away") return team;
  if (teamId != null) {
    if (teamId === m.home.id) return "home";
    if (teamId === m.away.id) return "away";
  }
  return "x";
}

function buildCardDedupeKey(
  fixtureId: number,
  side: string,
  playerKey: string,
  kind: "yellow" | "red",
  minute?: number | null,
): string {
  // الدقيقة+الفريق+النوع مشتركة بين AF و TS (معرّفات اللاعبين تختلف بين المصدرين).
  if (minute != null && minute > 0) {
    return `card:${fixtureId}:${side}:${kind}:m${minute}`;
  }
  return `card:${fixtureId}:${side}:${playerKey}:${kind}`;
}

function buildVarDedupeKey(fixtureId: number, side: string, detail: string): string {
  const d = detail.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 80);
  return `var:${fixtureId}:${side}:${d || "review"}`;
}

function compactCardAlertLocks(now = Date.now()): void {
  for (const [key, expiresAt] of cardAlertMemoryLocks) {
    if (expiresAt <= now) cardAlertMemoryLocks.delete(key);
  }
}

/** SET NX عبر Redis؛ عند غياب Redis نسقط لـ Map محلي بنفس TTL. */
async function claimAlertSlot(dedupeKey: string): Promise<boolean> {
  const redisKey = `sports_alerts:dedupe:${dedupeKey}`;
  const redis = getRedisClient();
  if (redis) {
    try {
      return (await redis.setLock(redisKey, "1", CARD_ALERT_LOCK_TTL_MS)) === "OK";
    } catch (err) {
      console.error("[SportsAlerts] alert dedupe redis lock failed:", err);
    }
  }
  compactCardAlertLocks();
  if (cardAlertMemoryLocks.has(redisKey)) return false;
  cardAlertMemoryLocks.set(redisKey, Date.now() + CARD_ALERT_LOCK_TTL_MS);
  return true;
}

const STAT_INSIGHT_BUCKET_MINUTES = 10;
const STAT_INSIGHT_LOCK_TTL_MS = 75 * 60 * 1000;
const STAT_INSIGHT_MIN_SEND_GAP_MS = 20 * 60 * 1000;
const statInsightMemoryLocks = new Map<string, number>();

interface StatInsightStory {
  key: string;
  title: string;
  body: string;
}

function statInsightDedupeKey(story: StatInsightStory): string {
  return `stat_insight:${story.key}`;
}

function hasSentStatInsightStory(fixtureId: number, story: StatInsightStory): boolean {
  const sigs = sentAlertSigs.get(fixtureId);
  if (!sigs) return false;
  const key = statInsightDedupeKey(story);
  if (sigs.has(key)) return true;
  // توافق مع الحالة المحفوظة قبل إضافة البصمة المعنوية: كانت تحفظ النص كاملاً،
  // فتغيير الأرقام وحده كان يسمح بتكرار نفس القصة. العنوان هنا يحمل القصة والفريق.
  const legacyPrefix = `stat_insight|${story.title}|`;
  for (const sig of sigs) {
    if (sig.startsWith(legacyPrefix)) return true;
  }
  return false;
}

// توقيع مستقرّ ضد تذبذب دقيقة المزوّد (السبب الشائع لتكرار إشعار البطاقة، مثل ظهور
// نفس البطاقة عند د83 ثم د84):
//   - البطاقات: لاعب واحد ≤ بطاقة واحدة من كل نوع في المباراة → بلا دقيقة.
//   - الأهداف (ومنها العكسية): قد تتعدّد للاعب الواحد → نُميّزها بالنتيجة التراكمية
//     الثابتة بدل الدقيقة.
//   - الفار: الدقيقة/الثانية والاسم تُستكمل لاحقًا → التوقيع بالفريق + سبب/نتيجة
//     المراجعة. تضمين var_result مقصود: المراجعة المعلّقة (0) لا تُشعِر، وحين تُحسم
//     تتغيّر النتيجة فيتولّد توقيع جديد يُطلق إشعار القرار مرّة واحدة.
//   - غير ذلك (تبديل): نُبقي الدقيقة/الثانية للتمييز.
const tsEventSig = (e: TsEvent): string => {
  // بطاقات: أولوية playerId؛ بلا اسم معرَّب في التوقيع (التعريب يتقلّب بين الدورات).
  if (e.type === "yellow" || e.type === "red" || e.type === "yellow_red") {
    const who =
      e.playerId != null && String(e.playerId).trim() !== ""
        ? `id:${e.playerId}`
        : `n:${(e.player || e.inPlayer || "").trim().toLowerCase().replace(/\s+/g, " ")}`;
    return `${e.type}|${e.team ?? ""}|${who}`;
  }
  if (e.type === "goal" || e.type === "penalty_goal" || e.type === "own_goal") {
    // بلا لاعب في التوقيع: المزوّد يستكمل playerId/الاسم على دفعات بعد الحدث
    // فيتقلّب التوقيع ويتكرّر الإشعار (هدف روميرو ×3 فجر 2026-07-04). الفريق +
    // النوع + النتيجة التراكمية (أو الدقيقة عند غيابها) يميّزان كل هدف بثبات.
    const score =
      e.homeScore != null && e.awayScore != null ? `${e.homeScore}-${e.awayScore}` : String(e.minute);
    return `${e.type}|${e.team ?? ""}|${score}`;
  }
  if (e.type === "var") {
    return `var|${e.team ?? ""}|${e.varReason ?? ""}|${e.varResult ?? ""}`;
  }
  const who = e.playerId ?? e.player ?? e.inPlayer ?? "";
  return `${e.rawType}|${e.minute}|${e.second ?? ""}|${e.team ?? ""}|${who}`;
};

/** أسماء بديلة لنفس بطاقة TheSports عند اكتمال playerId بعد أول رصد بالاسم. */
function tsEventSigAliases(e: TsEvent): string[] {
  if (e.type !== "yellow" && e.type !== "red" && e.type !== "yellow_red") {
    return [tsEventSig(e)];
  }
  const out = new Set<string>([tsEventSig(e)]);
  if (e.playerId != null && String(e.playerId).trim() !== "") {
    const name = (e.player || e.inPlayer || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (name) out.add(`${e.type}|${e.team ?? ""}|n:${name}`);
  }
  return [...out];
}

const fmtScore = (m: SplLiveBoardItem) => `${m.goals.home ?? 0}-${m.goals.away ?? 0}`;

// «تنبيه ذكي» = الحدث + لماذا يهمّ. نحسب سياق النتيجة حتمياً من المباراة نفسها
// (بلا نداء API ولا LLM في المسار الحسّاس — التزاماً بضوابط كلفة/كمون المحرّك):
// حسم متأخّر، فوز عريض، تعادل مثير... جملةٌ قصيرة تُضاف لجسم الإشعار.
function resultContext(m: SplLiveBoardItem): string | null {
  // ترجيح محسوم يسبق كل القراءات — «تعادل يقسّم النقاط» لغة دوريات لا تصلح
  // لمباراة إقصائية حُسمت من علامة الجزاء.
  const pens = m.penalties;
  if (pens && pens.home != null && pens.away != null && pens.home !== pens.away) {
    const winner = pens.home > pens.away ? m.home.name : m.away.name;
    return `${winner} يحسمها بركلات الترجيح ${pens.home}-${pens.away}`;
  }
  const gh = m.goals.home ?? 0;
  const ga = m.goals.away ?? 0;
  const total = gh + ga;
  const diff = Math.abs(gh - ga);
  const winner = gh > ga ? m.home.name : ga > gh ? m.away.name : null;
  if (winner && diff >= 3) return `فوز عريض لـ${winner}`;
  if (!winner && total >= 4) return "تعادل مثير غزير الأهداف";
  if (!winner && total >= 2) return "تعادل يقسّم النقاط";
  if (winner && diff === 1) return `${winner} يخطف الفوز بفارق هدف`;
  if (winner) return `فوز مستحقّ لـ${winner}`;
  return null;
}

// سياق الهدف: هل جاء في الوقت القاتل؟ (يرفع أهمية الإشعار للمتابع).
function goalContext(m: SplLiveBoardItem): string | null {
  const el = m.status.elapsed;
  if (el != null && el >= 85) return "في الدقائق الأخيرة";
  return null;
}

function compactStatInsightLocks(now = Date.now()): void {
  for (const [key, expiresAt] of statInsightMemoryLocks) {
    if (expiresAt <= now) statInsightMemoryLocks.delete(key);
  }
}

async function reserveStatInsightBucket(fixtureId: number, bucket: number): Promise<boolean> {
  const key = `sports_alerts:stat_insight:${fixtureId}:${bucket}`;
  const redis = getRedisClient();
  if (redis) {
    try {
      return (await redis.setLock(key, "1", STAT_INSIGHT_LOCK_TTL_MS)) === "OK";
    } catch (err) {
      console.error("[SportsAlerts] stat insight redis lock failed:", err);
    }
  }

  compactStatInsightLocks();
  if (statInsightMemoryLocks.has(key)) return false;
  statInsightMemoryLocks.set(key, Date.now() + STAT_INSIGHT_LOCK_TTL_MS);
  return true;
}

async function reserveStatInsightSendGap(fixtureId: number): Promise<boolean> {
  const key = `sports_alerts:stat_insight:gap:${fixtureId}`;
  const redis = getRedisClient();
  if (redis) {
    try {
      return (await redis.setLock(key, "1", STAT_INSIGHT_MIN_SEND_GAP_MS)) === "OK";
    } catch (err) {
      console.error("[SportsAlerts] stat insight gap lock failed:", err);
    }
  }

  compactStatInsightLocks();
  if (statInsightMemoryLocks.has(key)) return false;
  statInsightMemoryLocks.set(key, Date.now() + STAT_INSIGHT_MIN_SEND_GAP_MS);
  return true;
}

function statPair(stats: TsLiveStats | null, key: keyof TsLiveStats): [number, number] | null {
  const value = stats?.[key];
  return Array.isArray(value) ? value : null;
}

function pickStatInsightStory(m: SplLiveBoardItem, stats: TsLiveStats | null): StatInsightStory | null {
  if (!stats) return null;
  const teams = [m.home.name, m.away.name] as const;
  const winnerSide = (pair: [number, number]) => (pair[0] >= pair[1] ? "home" : "away");
  const winnerName = (pair: [number, number]) => teams[winnerSide(pair) === "home" ? 0 : 1];
  const loserName = (pair: [number, number]) => teams[winnerSide(pair) === "home" ? 1 : 0];
  const diff = (pair: [number, number]) => Math.abs(pair[0] - pair[1]);
  const total = (pair: [number, number]) => pair[0] + pair[1];

  const dangerous = statPair(stats, "dangerousAttacks");
  const shotsOn = statPair(stats, "shotsOnTarget");
  const shotsOff = statPair(stats, "shotsOffTarget");
  const possession = statPair(stats, "possession");
  const corners = statPair(stats, "corners");
  const attacks = statPair(stats, "attacks");

  if (dangerous && diff(dangerous) >= 8 && total(dangerous) >= 14) {
    const team = winnerName(dangerous);
    return {
      key: `dangerous-pressure:${winnerSide(dangerous)}`,
      title: `${team} يرفع الضغط`,
      body: `الهجمات الخطرة تميل بوضوح: ${dangerous[0]}-${dangerous[1]}. النتيجة لا تعكس الزخم الآن.`,
    };
  }

  if (shotsOn && diff(shotsOn) >= 2 && total(shotsOn) >= 3) {
    const team = winnerName(shotsOn);
    return {
      key: `shots-on-target:${winnerSide(shotsOn)}`,
      title: `${team} أقرب لهز الشباك`,
      body: `التسديدات على المرمى ${shotsOn[0]}-${shotsOn[1]}. الخطر الحقيقي صار في اتجاه واحد.`,
    };
  }

  if (possession && diff(possession) >= 20 && shotsOn) {
    const possessionTeam = winnerName(possession);
    const shotEdge = possession[0] >= possession[1] ? shotsOn[0] - shotsOn[1] : shotsOn[1] - shotsOn[0];
    if (shotEdge <= 0) {
      return {
        key: `sterile-possession:${winnerSide(possession)}`,
        title: `${possessionTeam} يسيطر بلا ضربة واضحة`,
        body: `الاستحواذ ${possession[0]}%-${possession[1]}%، لكن التسديدات على المرمى لا تخدم صاحب الكرة.`,
      };
    }
  }

  if (corners && dangerous && diff(corners) >= 3 && diff(dangerous) >= 5) {
    const team = winnerName(corners);
    const underPressure = loserName(corners);
    return {
      key: `corner-pressure:${winnerSide(corners)}`,
      title: `${team} يحاصر ${underPressure}`,
      body: `ركنيات متتالية وزخم واضح في الثلث الأخير. الدفاع تحت اختبار حقيقي.`,
    };
  }

  if (attacks && diff(attacks) >= 18 && total(attacks) >= 35) {
    const team = winnerName(attacks);
    return {
      key: `attack-volume:${winnerSide(attacks)}`,
      title: `${team} يمسك بإيقاع المباراة`,
      body: `حجم الهجمات يميل بوضوح: ${attacks[0]}-${attacks[1]}. المباراة بدأت تختار طرفاً.`,
    };
  }

  if (shotsOff && shotsOn && total(shotsOff) >= 8 && total(shotsOn) <= 1) {
    return {
      key: "poor-finishing",
      title: "محاولات كثيرة بلا دقة",
      body: `التسديد حاضر، لكن المرمى غائب: ${shotsOn[0]}-${shotsOn[1]} بين الخشبات.`,
    };
  }

  return null;
}

// ── إثراء إشعار نهاية المونديال بأرقام المباراة (قرار المنتج 2026-07-12) ──
// إشعار واحد لحظة الصافرة: النتيجة والقصة كما هي، يليها سطر إحصاءات وسطر
// الهدّافين. المونديال فقط في البداية؛ التوسّع لبقية البطولات قرار لاحق.

// الأزواج المعروضة بالأولوية — نكتفي بثلاثة كي لا يُقصّ الإشعار على iOS.
const DIGEST_STATS: Array<{ key: keyof TsLiveStats; label: string; percent?: boolean }> = [
  { key: "possession", label: "استحواذ", percent: true },
  { key: "shotsOnTarget", label: "على المرمى" },
  { key: "dangerousAttacks", label: "هجمات خطرة" },
  { key: "corners", label: "ركنيات" },
];

function buildDigestStatsLine(stats: TsLiveStats | null): string | null {
  if (!stats) return null;
  const parts: string[] = [];
  for (const { key, label, percent } of DIGEST_STATS) {
    const pair = statPair(stats, key);
    if (!pair) continue;
    const suffix = percent ? "%" : "";
    parts.push(`${label} ${pair[0]}${suffix}-${pair[1]}${suffix}`);
    if (parts.length >= 3) break;
  }
  // رقم واحد لا يحكي قصة — سطر الإحصاءات يستحق مكانه بمؤشّرين فأكثر.
  return parts.length >= 2 ? parts.join(" · ") : null;
}

function buildScorersLine(events: SplMatchEvent[]): string | null {
  const goals = events.filter((e) => e.type === "goal" && !e.label.includes("ملغ"));
  if (goals.length === 0) return null;
  const entries = goals.slice(0, 6).map((e) => {
    const tag = e.label.includes("جزاء") ? " (ج)" : e.label.includes("عكسي") ? " (عكسي)" : "";
    const minute =
      e.minute != null ? ` (د${e.minute}${e.extra ? `+${e.extra}` : ""})` : "";
    return `${e.player}${tag}${minute}`;
  });
  const suffix = goals.length > entries.length ? " …" : "";
  return `سجّل: ${entries.join(" • ")}${suffix}`;
}

/** يُثري إشعارات «انتهت المباراة» لمباريات المونديال وكأس آسيا بالإحصاءات والهدّافين — أفضل جهد. */
async function enrichWorldCupFulltimeAlerts(
  alerts: DetectedAlert[],
  matches: SplLiveBoardItem[],
): Promise<void> {
  const byId = new Map(matches.map((m) => [m.id, m]));
  for (const alert of alerts) {
    if (alert.kind !== "fulltime") continue;
    const m = byId.get(alert.fixtureId);
    if (!m || (m.competitionSlug !== "world-cup" && m.competitionSlug !== "asian-cup")) continue;

    const lines = [alert.body];
    const statsLine = buildDigestStatsLine(lastStats.get(alert.fixtureId) ?? null);
    if (statsLine) lines.push(statsLine);
    const events = await getMatchEventsOnly(alert.fixtureId).catch(() => [] as SplMatchEvent[]);
    const scorersLine = buildScorersLine(events);
    if (scorersLine) lines.push(scorersLine);
    if (lines.length === 1) continue;

    alert.body = lines.join("\n");
  }
}

async function detectStatInsightAlerts(
  matches: SplLiveBoardItem[],
  tsLive: Map<number, TsMatchLive>,
  suppressedFixtureIds: Set<number>,
): Promise<DetectedAlert[]> {
  const out: DetectedAlert[] = [];
  for (const m of matches) {
    if (!m.status.live || m.status.finished || suppressedFixtureIds.has(m.id)) continue;
    const elapsed = m.status.elapsed ?? 0;
    if (elapsed < STAT_INSIGHT_BUCKET_MINUTES) continue;
    const bucket = Math.floor(elapsed / STAT_INSIGHT_BUCKET_MINUTES);
    if (bucket <= 0) continue;

    const story = pickStatInsightStory(m, tsLive.get(m.id)?.stats ?? null);
    if (!story) continue;
    const dedupeKey = statInsightDedupeKey(story);
    if (hasSentStatInsightStory(m.id, story)) continue;
    if (!(await reserveStatInsightBucket(m.id, bucket))) continue;
    if (!(await reserveStatInsightSendGap(m.id))) continue;

    out.push({
      fixtureId: m.id,
      kind: "stat_insight",
      title: story.title,
      body: story.body,
      teamRefIds: [String(m.home.id), String(m.away.id)],
      dedupeKey,
    });
  }
  return out;
}

// ── صمود خطّ الأساس لإعادة التشغيل/النشر (Redis، أفضل جهد) ──
// خرائط التتبّع أعلاه في الذاكرة فقط، فكل نشر/إعادة تشغيل يمسحها فتُعيد الدورة
// التالية «تأسيس» المباراة الجارية بصمت وتكبت أحداثها (انطلاق/بطاقة كانت قبل
// إعادة التشغيل). نحفظها في Redis بعد كل دورة ونُحمّلها مرّةً عند الإقلاع، فتُستأنف
// الأحداث الجديدة فقط دون تكرار وبلا إغراق. القائد وحده يكتب (لا تسابق).
// v2: تغيّرت صيغة توقيع الأحداث (dedup مستقلّ عن الدقيقة للبطاقات). نتجاهل حالة v1
// القديمة فتُعيد الدورة الأولى تأسيس المباريات الجارية بصمت بدل إعادة إرسال أحداثها.
// v3: توقيع الفار صار بالفريق + سبب/نتيجة المراجعة (بلا دقيقة/ثانية) وأُضيف الهدف
// العكسي — أي تغيير لاحق في صيغة التوقيع يستلزم رفع الرقم هنا وإلا أعادت الحالة
// المحفوظة القديمة إطلاق أحداث المباراة الجارية بعد النشر.
// v4: توقيع هدف TheSports بلا لاعب (استكمال playerId كان يكرّر الإشعار)، الاتحاد
// التراكمي للتواقيع، وحارس الإرسال بنصّ الإشعار (sentAlertSigs ضمن الحالة).
const STATE_KEY = "sports_alerts:baseline:v4";
const STATE_TTL_SEC = 6 * 3600; // يكفي مباراة + استراحة
let stateHydrated = false;

async function hydrateStateOnce(): Promise<void> {
  if (stateHydrated) return;
  stateHydrated = true; // نحاول مرّة واحدة فقط حتى لو فشل (الذاكرة تكفي بعدها)
  const redis = getRedisClient();
  if (!redis) return;
  try {
    const raw = await redis.get(STATE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as {
      snapshots?: [number, MatchSnapshot][];
      eventSeen?: [number, string[]][];
      tsEventSeen?: [number, string[]][];
      sentAlertSigs?: [number, string[]][];
      lastStats?: [number, TsLiveStats][];
    };
    for (const [id, snap] of parsed.snapshots ?? []) snapshots.set(id, snap);
    for (const [id, stats] of parsed.lastStats ?? []) lastStats.set(id, stats);
    for (const [id, sigs] of parsed.eventSeen ?? []) eventSeen.set(id, new Set(sigs));
    for (const [id, sigs] of parsed.tsEventSeen ?? []) tsEventSeen.set(id, new Set(sigs));
    for (const [id, sigs] of parsed.sentAlertSigs ?? []) sentAlertSigs.set(id, new Set(sigs));
    console.log(
      `[SportsAlerts] baseline hydrated from Redis (snapshots=${snapshots.size} ts=${tsEventSeen.size})`,
    );
  } catch (err) {
    console.error("[SportsAlerts] baseline hydrate failed:", err);
  }
}

async function persistState(): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    const payload = JSON.stringify({
      snapshots: [...snapshots.entries()],
      eventSeen: [...eventSeen.entries()].map(([id, set]) => [id, [...set]]),
      tsEventSeen: [...tsEventSeen.entries()].map(([id, set]) => [id, [...set]]),
      sentAlertSigs: [...sentAlertSigs.entries()].map(([id, set]) => [id, [...set]]),
      lastStats: [...lastStats.entries()],
    });
    await redis.set(STATE_KEY, payload, {
      expiration: { type: "EX", value: STATE_TTL_SEC },
    });
  } catch (err) {
    console.error("[SportsAlerts] baseline persist failed:", err);
  }
}

// مباريات يتكفّل TheSports بأحداثها (هدف باسم اللاعب/بطاقة/فار) — فنتجاوزها في
// كاشف الهدف العام وكاشف أحداث API-Football تفاديًا للازدواج.
function detectAlerts(matches: SplLiveBoardItem[], detailedGoalFixtureIds: Set<number>): DetectedAlert[] {
  const alerts: DetectedAlert[] = [];
  const seenIds = new Set<number>();

  for (const m of matches) {
    seenIds.add(m.id);
    const prev = snapshots.get(m.id);
    // اللقطة غير متناقصة في الأهداف: لو تذبذب المصدر (TheSports يرجع ثم يتراجع
    // لـAPI-Football الأبطأ) لا تنخفض النتيجة المخزّنة، فلا يتكرّر إشعار الهدف
    // عند ارتدادها صعودًا، ولا يُطلَق هدف زائف عند الهبوط (هدف فار ملغى = لا إشعار).
    const cur: MatchSnapshot = {
      homeGoals: Math.max(m.goals.home ?? 0, prev?.homeGoals ?? 0),
      awayGoals: Math.max(m.goals.away ?? 0, prev?.awayGoals ?? 0),
      live: m.status.live,
      finished: m.status.finished,
    };
    snapshots.set(m.id, cur);

    // أول مشاهدة: خطّ أساس فقط، لا إرسال.
    if (!prev) continue;

    const teamRefIds = [String(m.home.id), String(m.away.id)];
    const matchName = `${m.home.name} ضد ${m.away.name}`;

    // انطلاق المباراة
    if (!prev.live && !prev.finished && cur.live) {
      alerts.push({
        fixtureId: m.id,
        kind: "kickoff",
        title: "🟢 انطلقت المباراة",
        body: `${matchName} · ${m.competition}`,
        teamRefIds,
      });
    }

    // هدف (تغيّر النتيجة) — أثناء اللعب فقط. حارس تصاعدي: لا نُرسل إلا بزيادة
    // مجموع الأهداف (يمنع إشعارًا زائفًا عند تراجع المصدر أو إلغاء هدف بالفار).
    // إن وصلت حادثة TheSports المفصّلة في الدورة نفسها نتجاوز التنبيه العام.
    // أمّا إن تغيّرت النتيجة ولم تصل الحادثة بعد، فنرسل فورًا ولا ننتظر اسم اللاعب.
    if (
      !detailedGoalFixtureIds.has(m.id) &&
      cur.live &&
      cur.homeGoals + cur.awayGoals > prev.homeGoals + prev.awayGoals
    ) {
      const homeScored = cur.homeGoals > prev.homeGoals;
      const scorer = homeScored ? m.home.name : m.away.name;
      const minute = m.status.elapsed != null ? ` · د${m.status.elapsed}` : "";
      const why = goalContext(m);
      alerts.push({
        fixtureId: m.id,
        kind: "goal",
        title: `⚽️ ${m.home.name} ${fmtScore(m)} ${m.away.name}`,
        body: `هدف ${scorer}${minute}${why ? ` — ${why}` : ""}`,
        teamRefIds,
        dedupeKey: `goal:${m.id}:${cur.homeGoals}-${cur.awayGoals}`,
      });
    }

    // عادت حيّة (أشواط إضافية/ترجيح بعد FT خاطفة) — يسقط أي احتجاز معلّق.
    if (!m.status.finished) pendingLevelFulltime.delete(m.id);

    // نهاية المباراة
    if (!prev.finished && cur.finished) {
      // حذر الأدوار الإقصائية: تعادل بلا ترجيح لا يُنهي مباراة إقصائية — الغالب
      // FT خاطفة قبل الأشواط الإضافية. نُبقي اللقطة «غير منتهية» فيُعاد فحص
      // التحوّل كل دورة، ولا نُعلن إلا إن صمدت «النهاية» المهلة كاملة.
      if (isSuspectLevelKnockoutEnd(m)) {
        const firstSeen = pendingLevelFulltime.get(m.id) ?? Date.now();
        pendingLevelFulltime.set(m.id, firstSeen);
        if (Date.now() - firstSeen < LEVEL_FULLTIME_HOLD_MS) {
          // «ما زالت جارية» من منظور اللقطة: يبقى التحوّل قابلًا للاكتشاف كل
          // دورة، وعودة ET لا تبدو انطلاقةً جديدة (live=false كانت ستوهم بذلك).
          cur.finished = false;
          cur.live = true;
          continue;
        }
      }
      pendingLevelFulltime.delete(m.id);
      const why = resultContext(m);
      alerts.push({
        fixtureId: m.id,
        kind: "fulltime",
        title: `🏁 انتهت المباراة · ${m.home.name} ${fmtScore(m)} ${m.away.name}`,
        body: why ? `${m.competition} · ${why}` : m.competition,
        teamRefIds,
        // بصمة معنوية: الإثراء بالإحصاءات يجعل النصّ متقلّبًا بين الدورات لو
        // تذبذب علم النهاية عند المزوّد — النهاية حدثٌ واحد لكل مباراة.
        dedupeKey: `fulltime:${m.id}`,
      });
    }
  }

  // تنظيف دوريّ للقطات مباريات لم تعد ضمن "اليوم" (مرّة كل ساعة).
  const now = Date.now();
  if (now - lastCleanup > 3_600_000) {
    lastCleanup = now;
    for (const id of snapshots.keys()) {
      if (!seenIds.has(id)) snapshots.delete(id);
    }
    for (const id of pendingLevelFulltime.keys()) {
      if (!seenIds.has(id)) pendingLevelFulltime.delete(id);
    }
  }

  return alerts;
}

/**
 * كشف أحداث البطاقات/الفار للمباريات المباشرة التي لها متابعون. نداء أحداثٍ واحد
 * لكل مباراة (fixtures/events، كاش 12ث) — ونتجاوز أيّ مباراة لا يتابعها أحد كي لا
 * نستهلك نداء API بلا داعٍ. أول رصدٍ لمباراة = خطّ أساس بلا إرسال.
 */
async function detectEventAlerts(
  matches: SplLiveBoardItem[],
  tsHandledIds: Set<number>,
): Promise<DetectedAlert[]> {
  const out: DetectedAlert[] = [];
  const allIds = new Set(matches.map((m) => m.id));
  // المباريات المتابَعة مفردةً — لا نُحصّن نداء أحداثها بمتابعة الفريق.
  const matchFollowedIds = await getFollowedMatchFixtureIds();

  for (const m of matches) {
    if (!m.status.live) continue;
    if (tsHandledIds.has(m.id)) continue; // بطاقات/فار المونديال من TheSports اللحظي
    const teamRefIds = [String(m.home.id), String(m.away.id)];
    const followers = await getTeamFollowerUserIds(teamRefIds);
    // لا متابع فريق ولا متابع مباراة → لا نداء API (توفير).
    if (followers.length === 0 && !matchFollowedIds.has(String(m.id))) continue;

    let events: SplMatchEvent[];
    try {
      events = await getMatchEventsOnly(m.id);
    } catch {
      continue;
    }

    const prev = eventSeen.get(m.id);
    const curByType = events.map((e) => ({ e, sig: eventSig(e), aliases: eventSigAliases(e) }));

    // خطّ الأساس: أول رصدٍ للمباراة يسجّل كل التواقيع بلا إرسال ولا احتجاز.
    if (!prev) {
      const base = new Set<string>();
      for (const c of curByType) for (const a of c.aliases) base.add(a);
      eventSeen.set(m.id, base);
      eventPending.delete(m.id);
      continue;
    }

    // اتحاد تراكمي لا استبدال: اختفاء حدثٍ مؤقتًا من بثّ المزوّد ثم عودته كان يمحو
    // توقيعه فيُرسَل إشعاره من جديد — التوقيع المرصود يبقى حتى نهاية المباراة.
    const nextSeen = new Set(prev);
    const prevPending = eventPending.get(m.id);
    const nextPending = new Map<string, number>();
    const nowMs = Date.now();

    const matchName = `${m.home.name} ضد ${m.away.name}`;
    for (const { e, sig, aliases } of curByType) {
      if (aliases.some((a) => prev.has(a))) continue; // سبق إرساله/تأسيسه (أي اسم بديل)

      const isCard = e.type === "yellow-card" || e.type === "red-card";
      const isVar = e.type === "var";
      // غير الكروت/الفار لا يُنتج إشعارًا هنا (الأهداف عبر اللقطة) — نسجّله ونمضي.
      if (!isCard && !isVar) {
        for (const a of aliases) nextSeen.add(a);
        continue;
      }
      if (isStaleMatchEvent(m, e.minute, e.extra ?? 0)) {
        for (const a of aliases) nextSeen.add(a);
        continue;
      }

      // نافذة التأكيد: لا نُرسِل إلا بعد أن يصمد الحدث زمنًا يتجاوز كاش الأحداث.
      // البطاقات بلا playerId: ننتظر حتى يظهر المعرّف أو تنتهي النافذة (ثم نرسل بالاسم).
      const firstSeenAt = prevPending?.get(sig);
      if (firstSeenAt == null) {
        nextPending.set(sig, nowMs);
        continue;
      }
      if (isStaleByWallClock(firstSeenAt, nowMs)) {
        for (const a of aliases) nextSeen.add(a);
        continue;
      }
      if (nowMs - firstSeenAt < EVENT_CONFIRM_MS) {
        nextPending.set(sig, firstSeenAt);
        continue;
      }
      if (isCard && e.playerId == null && nowMs - firstSeenAt < EVENT_CONFIRM_MS * 2) {
        // دورة/دورتان إضافيتان لاستكمال playerId قبل تثبيت التوقيع بالاسم.
        nextPending.set(sig, firstSeenAt);
        continue;
      }

      // صمد الحدث ما يكفي → إشعارٌ مؤكَّد، ونقله إلى «المرصودة».
      for (const a of aliases) nextSeen.add(a);
      const minute = e.minute != null ? ` · د${e.minute}${e.extra ? `+${e.extra}` : ""}` : "";
      const side = matchTeamSide(m, e.teamId);
      if (isCard) {
        const icon = e.type === "red-card" ? "🟥" : "🟨";
        const cardKind = e.type === "red-card" ? "red" : "yellow";
        out.push({
          fixtureId: m.id,
          kind: "card",
          title: `${icon} ${e.label}${e.team ? ` · ${e.team}` : ""}`,
          body: `${e.player || matchName}${minute}`,
          teamRefIds,
          dedupeKey: buildCardDedupeKey(
            m.id,
            side,
            normalizePlayerKeyCrossSource(e.playerId, e.player),
            cardKind,
            e.minute,
          ),
        });
      } else {
        // فار: «تأكيد هدف بعد المراجعة» فحص روتيني يلي كل هدف تقريبًا — الهدف نفسه
        // أُشعِر به للتوّ، فلا نُغرق المتابع بمراجعةٍ لم تغيّر شيئًا.
        if (e.label === "تأكيد هدف بعد مراجعة الفار") continue;
        // التفصيل المعرّب (إلغاء هدف/احتساب ركلة...)؛ نُسقط البادئة العامة لتفادي التكرار مع العنوان.
        const detail = e.label && e.label !== "مراجعة الفار" ? `${e.label} · ` : "";
        out.push({
          fixtureId: m.id,
          kind: "var",
          title: "🎦 مراجعة الفار",
          body: `${detail}${matchName}${minute}`,
          teamRefIds,
          dedupeKey: buildVarDedupeKey(m.id, side, e.label || ""),
        });
      }
    }

    eventSeen.set(m.id, nextSeen);
    if (nextPending.size > 0) eventPending.set(m.id, nextPending);
    else eventPending.delete(m.id);
  }

  // تنظيف دوريّ لتوقيعات مباريات لم تعد ضمن القائمة (مرّة كل ساعة).
  const now = Date.now();
  if (now - lastEventCleanup > 3_600_000) {
    lastEventCleanup = now;
    for (const id of eventSeen.keys()) {
      if (!allIds.has(id)) eventSeen.delete(id);
    }
    for (const id of eventPending.keys()) {
      if (!allIds.has(id)) eventPending.delete(id);
    }
  }

  return out;
}

/** معرّف حزمة تطبيق VARA الرياضي على iOS — مرجع توجيه الإشعارات الرياضية. */
export const SPORTS_APP_BUNDLE_ID = "com.sabq.sports";
/** حزمة debug للمحاكي/التطوير — نفس جمهور تنبيهات VARA. */
export const SPORTS_APP_DEBUG_BUNDLE_ID = "com.sabq.sports.dev";

/** حزم تطبيق سبق (الأخبار) — لا تُرسل لها إشعارات مباريات. */
const NEWS_APP_BUNDLE_IDS = new Set([
  "com.sabq.sabqorg",
  "com.sabq.smart",
]);

type PushDeviceRow = {
  token: string;
  provider: string;
  platform: string;
  bundleId: string | null;
  installationId: string | null;
};

/**
 * جهاز صالح لإشعار رياضي؟
 * - فارا إنتاج (`com.sabq.sports`) أو debug (`com.sabq.sports.dev`)
 * - توكن APNs قديم بلا bundleId: نجرّب topic الرياضة؛ توكن سبق يُرفض من Apple
 *   بـ DeviceTokenNotForTopic دون أن يصل كإشعار في تطبيق الأخبار
 * - نستبعد حزم سبق المعروفة دائماً
 */
function isSportsAppDevice(d: Pick<PushDeviceRow, "bundleId" | "provider">): boolean {
  if (d.bundleId && NEWS_APP_BUNDLE_IDS.has(d.bundleId)) return false;
  if (d.bundleId === SPORTS_APP_BUNDLE_ID || d.bundleId === SPORTS_APP_DEBUG_BUNDLE_ID) return true;
  // توكنات قديمة بلا bundleId — APNs فقط (FCM بلا تمييز حزمة قد يضرب أندرويد سبق)
  if (!d.bundleId && d.provider === "apns") return true;
  return false;
}

async function loadUserPushDevices(userId: string): Promise<PushDeviceRow[]> {
  try {
    return await db
      .select({
        token: pushDevices.deviceToken,
        provider: pushDevices.tokenProvider,
        platform: pushDevices.platform,
        bundleId: pushDevices.bundleId,
        installationId: pushDevices.installationId,
      })
      .from(pushDevices)
      .where(and(eq(pushDevices.userId, userId), eq(pushDevices.isActive, true)))
      .orderBy(desc(pushDevices.updatedAt));
  } catch (err: any) {
    // إن لم يُنفَّذ db:push بعد إضافة installation_id، لا نُسقط كل الإشعارات.
    const msg = String(err?.message ?? err);
    if (!/installation_id/i.test(msg) && !/does not exist/i.test(msg)) throw err;
    console.warn(
      `[SportsAlerts] installation_id unavailable — push without device dedupe. Run db:push. user=${userId}`,
    );
    const rows = await db
      .select({
        token: pushDevices.deviceToken,
        provider: pushDevices.tokenProvider,
        platform: pushDevices.platform,
        bundleId: pushDevices.bundleId,
      })
      .from(pushDevices)
      .where(and(eq(pushDevices.userId, userId), eq(pushDevices.isActive, true)))
      .orderBy(desc(pushDevices.updatedAt));
    return rows.map((r) => ({ ...r, installationId: null }));
  }
}

export type PushToUserDevicesOptions = {
  interruptionLevel?: "active" | "time-sensitive";
  apnsPriority?: "5" | "10";
  /**
   * مجموعة مشتركة عبر مستخدمي نفس التنبيه لمنع تكرار الإشعار على جهاز واحد
   * عندما يكون حسابان مختلفان (سبق/فارا أو جلستان) على نفس الـinstallationId.
   */
  claimedInstallations?: Set<string>;
};

/** دفع إشعار لأجهزة مستخدم واحد — حصرية لفارا (مع تسامح للتوكنات القديمة)، أفضل جهد. */
export async function pushToUserDevices(
  userId: string,
  title: string,
  body: string,
  data: Record<string, string>,
  options: PushToUserDevicesOptions = {},
): Promise<void> {
  try {
    const devices = await loadUserPushDevices(userId);
    if (devices.length === 0) return;

    // قرار المنتج 2026-07-10: لا إشعارات مباريات لتطبيق سبق (الأخبار).
    const sportsDevices = devices.filter((d) => isSportsAppDevice(d));
    if (sportsDevices.length === 0) return;

    const uniqueDevices: PushDeviceRow[] = [];
    const seenRoutes = new Set<string>();
    for (const device of sportsDevices) {
      const route = `${device.platform}:${device.provider}:${device.bundleId ?? "default"}`;
      if (seenRoutes.has(route)) continue;
      seenRoutes.add(route);
      uniqueDevices.push(device);
    }
    if (uniqueDevices.length < sportsDevices.length) {
      console.warn(
        `[SportsAlerts] collapsed ${sportsDevices.length - uniqueDevices.length} duplicate active sports token(s) for user=${userId}`,
      );
    }

    // منع التكرار على مستوى الجهاز عند توفر installationId فقط.
    const claimed = options.claimedInstallations;
    const targetDevices = uniqueDevices.filter((d) => {
      const installKey = d.installationId?.trim();
      if (!installKey || !claimed) return true;
      if (claimed.has(installKey)) {
        console.warn(
          `[SportsAlerts] skip duplicate installation=${installKey.slice(0, 8)}… user=${userId}`,
        );
        return false;
      }
      claimed.add(installKey);
      return true;
    });
    if (targetDevices.length === 0) return;

    const apnsDevices = targetDevices.filter((d) => d.provider === "apns");
    const fcmTokens = targetDevices
      .filter(
        (d) =>
          d.provider === "fcm" &&
          (d.bundleId === SPORTS_APP_BUNDLE_ID || d.bundleId === SPORTS_APP_DEBUG_BUNDLE_ID),
      )
      .map((d) => d.token);

    if (apnsDevices.length > 0 && isApnsConfigured()) {
      await Promise.all(
        apnsDevices.map(async (d) => {
          try {
            // دائماً topic فارا للتنبيهات الرياضية — حتى للتوكنات القديمة بلا bundleId.
            const topic = SPORTS_APP_BUNDLE_ID;
            const resp = await sendPushNotification(
              d.token,
              createCustomNotificationPayload(title, body, {
                ...data,
                priority: options.interruptionLevel ?? "time-sensitive",
              }),
              {
                priority: options.apnsPriority ?? "10",
                pushType: "alert",
                topic,
              },
            );
            if (!resp.success) {
              console.warn(
                `[SportsAlerts] push fail user=${userId} topic=${topic} storedBundle=${d.bundleId ?? "null"} status=${resp.statusCode ?? "-"} reason=${resp.reason ?? "-"}`,
              );
            }
          } catch (err) {
            console.warn(`[SportsAlerts] push threw user=${userId}:`, err);
          }
        }),
      );
    }

    if (fcmTokens.length > 0 && isFcmConfigured()) {
      await sendToMultipleDevices(fcmTokens, { title, body, data }).catch(() => undefined);
    }
  } catch (err) {
    console.error(`[SportsAlerts] push to user ${userId} failed:`, err);
  }
}

/** توصيل تنبيه واحد لكل متابعي الفريقين (inbox + بثّ + دفع). */
async function dispatchAlert(alert: DetectedAlert): Promise<number> {
  // متابعو الفريقين ∪ متابعو هذه المباراة مفردةً (مزالة التكرار).
  const [teamFollowers, matchFollowers] = await Promise.all([
    getTeamFollowerUserIds(alert.teamRefIds),
    getMatchFollowerUserIds([String(alert.fixtureId)]),
  ]);
  const followers = Array.from(new Set([...teamFollowers, ...matchFollowers]));
  if (followers.length === 0) return 0;
  // ترشيح المتابعين بحسب تفضيلهم لنوع هذا الحدث (بلا صفّ تفضيلات = الكل مفعّل).
  const userIds = await filterUsersByEventPref(followers, ALERT_KIND_TO_PREF[alert.kind]);
  if (userIds.length === 0) return 0;

  const deeplink = "/sports";
  const type = `sports.${alert.kind}`;
  const pushData: Record<string, string> = {
    type,
    deeplink: `sabqsports://match/${alert.fixtureId}`,
    fixtureId: String(alert.fixtureId),
  };

  await Promise.all(
    userIds.map(async (userId) => {
      try {
        await db.insert(notificationsInbox).values({
          userId,
          type,
          title: alert.title,
          body: alert.body,
          deeplink,
          read: false,
          metadata: { fixtureId: alert.fixtureId },
        });
        notificationBus.emit(userId, {
          type,
          title: alert.title,
          body: alert.body,
          deeplink,
        });
      } catch (err) {
        console.error(`[SportsAlerts] inbox/emit for user ${userId} failed:`, err);
      }
    }),
  );

  // دفع واحد لكل جهاز فعلي: نشارك claimedInstallations عبر كل المتابعين
  // حتى لا يصل نفس الهدف لحسابين على نفس الهاتف (سبق+فارا أو جلستان).
  const claimedInstallations = new Set<string>();
  for (const userId of userIds) {
    await pushToUserDevices(userId, alert.title, alert.body, pushData, {
      interruptionLevel: alert.kind === "stat_insight" ? "active" : "time-sensitive",
      apnsPriority: alert.kind === "stat_insight" ? "5" : "10",
      claimedInstallations,
    });
  }

  return userIds.length;
}

// لقطة TheSports الحيّة الكاملة (نتيجة + أحداث + إحصاءات) للمباريات المرشّحة —
// نداء detail_live واحد مكاش يخدم الكل. نُجمّعها مرّةً ثم نُعيد استخدامها في تركيب
// النتيجة وكشف الأحداث معًا (بلا مضاعفة نداءات).
//
// النطاق: المباريات في **أي بطولة مُدرَجة في TS_COMPETITION_IDS** (المونديال +
// روشن + النخبة الآسيوية + الدوريات الأوروبية الخمسة) الجارية الآن أو المقرّبة
// (3 ساعات قبل حتى 10 دقائق بعد) — كي يُسرّع الانطلاق دون حلّ جسرٍ لمباريات بعيدة.
// نمرّر معرّف بطولة TheSports المقابل ليفلتر الجسر بدقّة (تطابق فريد آمن: التباس
// المواعيد المتزامنة في نفس البطولة → null فتتراجع للأحداث من API-Football).
// detail_live حيّ فقط، فالمنتهية تتراجع تلقائيًا للمصدر الحالي. أفضل جهد: أي فشل →
// لا إدخال (تراجع صامت).
async function collectTsLive(matches: SplLiveBoardItem[]): Promise<Map<number, TsMatchLive>> {
  const out = new Map<number, TsMatchLive>();
  if (!isTheSportsConfigured()) return out;
  const now = Math.floor(Date.now() / 1000);
  await Promise.all(
    matches.map(async (m) => {
      const tsCompId = getTsCompetitionId(m.competitionSlug);
      if (!tsCompId) return; // بطولة غير مربوطة بـTheSports → المصدر الحالي
      const nearKickoff =
        !m.status.finished && m.timestamp <= now + 600 && m.timestamp >= now - 3 * 3600;
      if (!m.status.live && !nearKickoff) return;
      try {
        const ts = await getTheSportsMatchLive(m.id, m.timestamp, tsCompId);
        if (ts && (ts.live || ts.finished)) out.set(m.id, ts);
      } catch {
        /* تراجع صامت */
      }
    }),
  );
  return out;
}

// تركيب نتيجة/حالة TheSports اللحظية على مباريات المونديال قبل كشف الأحداث —
// فيُطلَق الإشعار بنفس سرعة الشاشة. مهم: لا نُحوّر كائنات كاش saudiLeagueService —
// نُرجّع نسخًا جديدة.
function applyTsOverlay(
  matches: SplLiveBoardItem[],
  tsLive: Map<number, TsMatchLive>,
): SplLiveBoardItem[] {
  if (tsLive.size === 0) return matches;
  return matches.map((m) => {
    const ts = tsLive.get(m.id);
    if (!ts) return m;
    return {
      ...m,
      goals: { home: ts.home, away: ts.away },
      // نتيجة الترجيح من TheSports أسرع من AF بدورة كاملة — بدونها يبدو حسم
      // الركلات «تعادلًا مشبوهًا» فيُحتجز إشعار النهاية بلا داعٍ حتى يلحق AF.
      penalties:
        ts.penHome != null && ts.penAway != null && (ts.penHome > 0 || ts.penAway > 0)
          ? { home: ts.penHome, away: ts.penAway }
          : m.penalties,
      status: {
        ...m.status,
        elapsed: ts.elapsed ?? m.status.elapsed,
        extra: ts.extra ?? m.status.extra,
        live: ts.live,
        finished: ts.finished || m.status.finished,
      },
    };
  });
}

const TEAM_NAME = (
  m: SplLiveBoardItem,
  team: "home" | "away" | null,
): string => (team === "home" ? m.home.name : team === "away" ? m.away.name : "");

// كشف الأحداث اللحظية من TheSports للبطولات المُدرَجة: هدف (باسم الهدّاف + الصانع)
// وبطاقة وفار — أسرع وأغنى من API-Football. الأسماء تُعرَّب عبر الكاش الدائم (أفضل
// جهد). أول رصدٍ لمباراة = خطّ أساس بلا إرسال (يتفادى إغراق متابعٍ جديد بأحداثٍ سابقة).
async function detectTsEventAlerts(
  matches: SplLiveBoardItem[],
  tsLive: Map<number, TsMatchLive>,
): Promise<DetectedAlert[]> {
  const out: DetectedAlert[] = [];
  if (tsLive.size === 0) return out;

  // تعريب كل أسماء اللاعبين في الأحداث دفعةً واحدة (كاش دائم؛ AI للجديد فقط).
  const rawNames: string[] = [];
  for (const ts of tsLive.values()) {
    for (const e of ts.events) {
      if (e.player) rawNames.push(e.player);
      if (e.assist) rawNames.push(e.assist);
    }
  }
  let tr: (n: string | null | undefined) => string = (n) => (n ? n.trim() : "");
  try {
    tr = await resolveNames(rawNames);
  } catch {
    /* أفضل جهد: نُبقي الأسماء كما وردت */
  }
  // تفضيل أسماء المزوّد العربية (language/list) عبر معرّف اللاعب عند تفعيل
  // THESPORTS_LANG؛ تتراجع لتعريب resolveNames. أفضل جهد تامّ.
  let arById: (id: string | null | undefined) => string | null = () => null;
  try {
    const ids: (string | null | undefined)[] = [];
    for (const ts of tsLive.values()) for (const e of ts.events) ids.push(e.playerId);
    arById = await resolveTsNames(TS_I18N_TYPE.player, ids);
  } catch {
    /* أفضل جهد */
  }

  for (const m of matches) {
    const ts = tsLive.get(m.id);
    if (!ts) continue;
    const teamRefIds = [String(m.home.id), String(m.away.id)];
    const matchName = `${m.home.name} ضد ${m.away.name}`;

    const prev = tsEventSeen.get(m.id);
    const curByType = ts.events.map((e) => ({
      e,
      sig: tsEventSig(e),
      aliases: tsEventSigAliases(e),
    }));

    // خطّ الأساس: أول رصدٍ للمباراة يسجّل كل التواقيع بلا إرسال ولا احتجاز.
    if (!prev) {
      const base = new Set<string>();
      for (const c of curByType) for (const a of c.aliases) base.add(a);
      tsEventSeen.set(m.id, base);
      tsEventPending.delete(m.id);
      continue;
    }

    // اتحاد تراكمي لا استبدال (نفس علّة eventSeen — الاختفاء المؤقت يعيد الإرسال).
    const nextSeen = new Set(prev);
    const prevPending = tsEventPending.get(m.id);
    const nextPending = new Map<string, number>();
    const nowMs = Date.now();

    for (const { e, sig, aliases } of curByType) {
      if (aliases.some((a) => prev.has(a))) continue; // ليس جديدًا (أي اسم بديل)

      const isCard = e.type === "yellow" || e.type === "red" || e.type === "yellow_red";
      const isVar = e.type === "var";
      const isGoal = e.type === "goal" || e.type === "penalty_goal" || e.type === "own_goal";

      if (isStaleMatchEvent(m, e.minute)) {
        for (const a of aliases) nextSeen.add(a);
        continue;
      }

      // أهداف: تُرسل فورًا (حساسة للزمن) بعد خطّ الأساس — بلا نافذة تأكيد.
      if (isGoal) {
        for (const a of aliases) nextSeen.add(a);
        const minute = e.minute ? ` · د${e.minute}` : "";
        const teamName = TEAM_NAME(m, e.team);
        const who = arById(e.playerId) ?? (e.player ? tr(e.player) : teamName || matchName);
        const score =
          e.homeScore != null && e.awayScore != null
            ? `${m.home.name} ${e.homeScore}-${e.awayScore} ${m.away.name}`
            : `${m.home.name} ${fmtScore(m)} ${m.away.name}`;
        const body =
          e.type === "own_goal"
            ? `هدف عكسي${who ? ` من ${who}` : ""}${minute}`
            : `هدف ${who}${e.type === "penalty_goal" ? " (ركلة جزاء)" : ""}${minute}${
                e.assist ? ` · صناعة ${tr(e.assist)}` : ""
              }`;
        out.push({
          fixtureId: m.id,
          kind: "goal",
          title: `⚽️ ${score}`,
          body,
          teamRefIds,
          dedupeKey: `goal:${m.id}:${e.homeScore ?? m.goals.home ?? 0}-${e.awayScore ?? m.goals.away ?? 0}`,
        });
        continue;
      }

      if (!isCard && !isVar) {
        for (const a of aliases) nextSeen.add(a);
        continue;
      }

      // فار غير حاسم: نسجّله بلا إشعار (فحص روتيني / معلّق).
      if (isVar && (e.varResult == null || !TS_VAR_DECISIVE_RESULTS.has(e.varResult))) {
        for (const a of aliases) nextSeen.add(a);
        continue;
      }

      // نافذة التأكيد (نفس EVENT_CONFIRM_MS لمسار API-Football).
      const firstSeenAt = prevPending?.get(sig);
      if (firstSeenAt == null) {
        nextPending.set(sig, nowMs);
        continue;
      }
      if (isStaleByWallClock(firstSeenAt, nowMs)) {
        for (const a of aliases) nextSeen.add(a);
        continue;
      }
      if (nowMs - firstSeenAt < EVENT_CONFIRM_MS) {
        nextPending.set(sig, firstSeenAt);
        continue;
      }
      // بطاقة بلا playerId: انتظر دورة/دورتين إضافيتين لاستكمال المعرّف.
      if (
        isCard &&
        (e.playerId == null || String(e.playerId).trim() === "") &&
        nowMs - firstSeenAt < EVENT_CONFIRM_MS * 2
      ) {
        nextPending.set(sig, firstSeenAt);
        continue;
      }

      for (const a of aliases) nextSeen.add(a);
      const minute = e.minute ? ` · د${e.minute}` : "";
      const teamName = TEAM_NAME(m, e.team);

      if (e.type === "red" || e.type === "yellow_red") {
        const who = arById(e.playerId) ?? (e.player ? tr(e.player) : "");
        out.push({
          fixtureId: m.id,
          kind: "card",
          title: `🟥 بطاقة حمراء${teamName ? ` · ${teamName}` : ""}`,
          body: `${who || matchName}${minute}`,
          teamRefIds,
          dedupeKey: buildCardDedupeKey(
            m.id,
            matchTeamSide(m, null, e.team),
            normalizePlayerKeyCrossSource(e.playerId, who || e.player),
            "red",
            e.minute,
          ),
        });
      } else if (e.type === "yellow") {
        const who = arById(e.playerId) ?? (e.player ? tr(e.player) : "");
        out.push({
          fixtureId: m.id,
          kind: "card",
          title: `🟨 بطاقة صفراء${teamName ? ` · ${teamName}` : ""}`,
          body: `${who || matchName}${minute}`,
          teamRefIds,
          dedupeKey: buildCardDedupeKey(
            m.id,
            matchTeamSide(m, null, e.team),
            normalizePlayerKeyCrossSource(e.playerId, who || e.player),
            "yellow",
            e.minute,
          ),
        });
      } else if (isVar) {
        const outcome = TS_VAR_RESULT_AR[e.varResult!] ?? "قرار بعد مراجعة الفار";
        out.push({
          fixtureId: m.id,
          kind: "var",
          title: "🎦 مراجعة الفار",
          body: `${outcome} · ${matchName}${minute}`,
          teamRefIds,
          dedupeKey: buildVarDedupeKey(
            m.id,
            matchTeamSide(m, null, e.team),
            `${e.varReason ?? ""}|${e.varResult}`,
          ),
        });
      }
    }

    tsEventSeen.set(m.id, nextSeen);
    if (nextPending.size > 0) tsEventPending.set(m.id, nextPending);
    else tsEventPending.delete(m.id);
  }

  // تنظيف دوريّ لتوقيعات مباريات لم تعد ضمن القائمة (مرّة كل ساعة).
  const now = Date.now();
  if (now - lastTsEventCleanup > 3_600_000) {
    lastTsEventCleanup = now;
    const allIds = new Set(matches.map((mm) => mm.id));
    for (const id of tsEventSeen.keys()) {
      if (!allIds.has(id)) tsEventSeen.delete(id);
    }
    for (const id of tsEventPending.keys()) {
      if (!allIds.has(id)) tsEventPending.delete(id);
    }
  }

  return out;
}

export interface SportsAlertsCycleSummary {
  matches: number;
  alerts: number;
  recipients: number;
}

/** دورة واحدة: اكتشاف الأحداث + توصيلها للمتابعين. */
export async function runSportsAlertsCycle(): Promise<SportsAlertsCycleSummary> {
  // نُحمّل خطّ الأساس المحفوظ مرّةً (بعد إعادة نشر/تشغيل) كي لا تُكبت أحداث
  // المباراة الجارية بصمت. أفضل جهد: غياب Redis = سلوك الذاكرة السابق.
  await hydrateStateOnce();
  // ندمج مباريات اليوم (كاش 60ث — تغطي المقرّرة/المنتهية) مع المباريات المباشرة
  // الآن (كاش 15ث — نتائج طازجة). بيانات المباشر تَجُبّ بيانات اليوم لنفس المباراة
  // فتُكتشف الأهداف والانطلاق خلال ~15-20ث بدل ~60ث+. (يشمل كأس العالم — id 1
  // ضمن بطولاتنا — فلا حاجة لمرسِل منفصل يُكرّر الإشعارات.)
  const [today, live] = await Promise.all([
    getGlobalTodayFixtures(),
    getGlobalLiveFixtures().catch(() => [] as SplLiveBoardItem[]),
  ]);
  const byId = new Map<number, SplLiveBoardItem>();
  for (const m of today) byId.set(m.id, m);
  for (const m of live) byId.set(m.id, m); // الأحدث يَجُبّ
  const baseMatches = [...byId.values()];
  // لقطة TheSports الحيّة الكاملة للمباريات في البطولات المُدرَجة (نتيجة + أحداث +
  // إحصاءات) — نداء واحد مكاش، نُعيد استخدامه في تركيب النتيجة وكشف الأحداث. أفضل جهد.
  const tsLive = await collectTsLive(baseMatches);
  const tsHandledIds = new Set(tsLive.keys());
  // نحتفظ بآخر إحصاءات حيّة لكل مباراة — تُستهلك في إثراء إشعار النهاية لأن
  // detail_live قد يغيب لحظة اكتشاف الصافرة.
  for (const [id, ts] of tsLive) {
    if (ts.stats) lastStats.set(id, ts.stats);
  }
  // تركيب نتيجة/حالة TheSports فيُطلَق الإشعار بنفس سرعة الشاشة.
  const matches = applyTsOverlay(baseMatches, tsLive);
  // أحداث النتيجة/الحالة (انطلاق/نهاية للكل، وهدف لغير مباريات TheSports) + بطاقات/فار
  // API-Football (لغير مباريات TheSports) + أحداث TheSports اللحظية للبطولات المُدرَجة
  // (هدف باسم الهدّاف + بطاقة + فار).
  const tsEventAlerts = await detectTsEventAlerts(matches, tsLive);
  const detailedGoalFixtureIds = new Set(
    tsEventAlerts.filter((alert) => alert.kind === "goal").map((alert) => alert.fixtureId),
  );
  const alerts = detectAlerts(matches, detailedGoalFixtureIds);
  await enrichWorldCupFulltimeAlerts(alerts, matches);
  const eventAlerts = await detectEventAlerts(matches, tsHandledIds);
  const hardAlertFixtureIds = new Set(
    [...alerts, ...eventAlerts, ...tsEventAlerts]
      .filter((alert) => alert.kind !== "kickoff" && alert.kind !== "fulltime")
      .map((alert) => alert.fixtureId),
  );
  const statInsightAlerts = await detectStatInsightAlerts(matches, tsLive, hardAlertFixtureIds);
  const allAlerts = [...alerts, ...eventAlerts, ...tsEventAlerts, ...statInsightAlerts];

  let recipients = 0;
  for (const alert of allAlerts) {
    // حارس أخير: نصّ سبق إرساله حرفيًّا لنفس المباراة لا يُرسَل ثانيةً مهما
    // تقلّبت تواقيع المزوّد (استكمال الأسماء/النتائج على دفعات).
    const sigs = sentAlertSigs.get(alert.fixtureId) ?? new Set<string>();
    const sig = alertSig(alert);
    if (sigs.has(sig)) continue;
    // بطاقة/فار: قفل Redis موحّد عبر المصدرين (TS ↔ AF) حتى مع اختلاف النص.
    if (alert.kind === "card" || alert.kind === "var") {
      const claimed = await claimAlertSlot(sig);
      if (!claimed) continue;
    }
    sigs.add(sig);
    sentAlertSigs.set(alert.fixtureId, sigs);
    recipients += await dispatchAlert(alert);
  }
  // تنظيف ساعيّ لبصمات مباريات خرجت من قائمة اليوم (لا كل دورة — الاختفاء
  // العابر للمباراة من القائمة بسبب فشل جلبٍ مؤقت يجب ألّا يمسح بصماتها).
  const nowMs = Date.now();
  if (nowMs - lastSentSigsCleanup > 3_600_000) {
    lastSentSigsCleanup = nowMs;
    for (const id of sentAlertSigs.keys()) {
      if (!byId.has(id)) sentAlertSigs.delete(id);
    }
    for (const id of lastStats.keys()) {
      if (!byId.has(id)) lastStats.delete(id);
    }
  }

  // نحفظ خطّ الأساس المُحدَّث فيصمد لإعادة النشر التالية (أفضل جهد، لا يُعيق الدورة).
  await persistState();

  return { matches: matches.length, alerts: allAlerts.length, recipients };
}
