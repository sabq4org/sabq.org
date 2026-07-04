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
 *   - اللقطة في الذاكرة كافية: الجوب يعمل على القائد فقط (leader election)، وفقدانها
 *     عند إعادة التشغيل يعيد ضبط الأساس بلا تكرار إشعارات سابقة.
 *   - فشل التوصيل لمستخدم لا يكسر بقيّة الدورة (محصّن بـ try/catch).
 */
import { and, eq } from "drizzle-orm";
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

type SportsAlertKind = "kickoff" | "goal" | "fulltime" | "card" | "var";

// تحويل نوع الحدث إلى مفتاح التفضيل المقابل (لترشيح المستلمين).
const ALERT_KIND_TO_PREF: Record<SportsAlertKind, SportsAlertEventKey> = {
  kickoff: "kickoff",
  goal: "goals",
  fulltime: "fulltime",
  card: "cards",
  var: "varReview",
};

interface DetectedAlert {
  fixtureId: number;
  kind: SportsAlertKind;
  title: string;
  body: string;
  teamRefIds: string[]; // معرّفات الفريقين (نص) لجلب المتابعين
}

// لقطة آخر حالة لكل مباراة (id → snapshot). تُمسح ضمنيًّا بانتهاء اليوم لأن
// مباريات اليوم تتغيّر؛ نُنظّف المفاتيح القديمة دوريًّا لتفادي التضخّم.
const snapshots = new Map<number, MatchSnapshot>();
let lastCleanup = 0;

// توقيعات أحداث الكروت/الفار المُرسَلة لكل مباراة (id → set of signatures). أول
// رصدٍ لمباراة يؤسّس خطّ الأساس بلا إرسال (يتفادى إغراق متابعٍ جديد بكروت سابقة).
const eventSeen = new Map<number, Set<string>>();
let lastEventCleanup = 0;

const eventSig = (e: SplMatchEvent): string => {
  // البطاقات: لاعب واحد ≤ بطاقة واحدة من كل نوع → نتجاهل الدقيقة المتذبذبة لمنع تكرار الإشعار.
  if (e.type === "yellow-card" || e.type === "red-card") {
    return `${e.type}|${e.teamId}|${e.player}`;
  }
  // الفار: المزوّد يعدّل الدقيقة ويملأ اسم اللاعب لاحقًا → توقيع بالفريق والتفصيل
  // فقط كي لا يُرسَل إشعار المراجعة نفسها مرّتين.
  if (e.type === "var") {
    return `var|${e.teamId}|${e.label}`;
  }
  return `${e.type}|${e.minute ?? ""}|${e.extra ?? ""}|${e.teamId}|${e.player}`;
};

// توقيعات أحداث TheSports المُرسَلة لكل مباراة مونديال (منفصلة عن توقيعات
// API-Football كي لا تتصادم عند تبدّل المصدر). أول رصدٍ = خطّ أساس بلا إرسال.
const tsEventSeen = new Map<number, Set<string>>();
let lastTsEventCleanup = 0;

// حارس الإرسال الأخير: بصمة نصّ الإشعار نفسه لكل مباراة — مهما تقلّبت تواقيع
// المزوّد أعلاه، إشعارٌ بعنوان+نصّ سبق إرسالهما حرفيًّا لنفس المباراة لا يخرج ثانيةً.
const sentAlertSigs = new Map<number, Set<string>>();
let lastSentSigsCleanup = 0;
const alertSig = (a: DetectedAlert): string => `${a.kind}|${a.title}|${a.body}`;

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
  const who = e.playerId ?? e.player ?? e.inPlayer ?? "";
  if (e.type === "yellow" || e.type === "red" || e.type === "yellow_red") {
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
  return `${e.rawType}|${e.minute}|${e.second ?? ""}|${e.team ?? ""}|${who}`;
};

const fmtScore = (m: SplLiveBoardItem) => `${m.goals.home ?? 0}-${m.goals.away ?? 0}`;

// «تنبيه ذكي» = الحدث + لماذا يهمّ. نحسب سياق النتيجة حتمياً من المباراة نفسها
// (بلا نداء API ولا LLM في المسار الحسّاس — التزاماً بضوابط كلفة/كمون المحرّك):
// حسم متأخّر، فوز عريض، تعادل مثير... جملةٌ قصيرة تُضاف لجسم الإشعار.
function resultContext(m: SplLiveBoardItem): string | null {
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
    };
    for (const [id, snap] of parsed.snapshots ?? []) snapshots.set(id, snap);
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
function detectAlerts(matches: SplLiveBoardItem[], tsHandledIds: Set<number>): DetectedAlert[] {
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
    // نتجاوز مباريات TheSports — أحداثها تُرسِل الهدف باسم اللاعب (أدقّ وأغنى).
    if (
      !tsHandledIds.has(m.id) &&
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
      });
    }

    // نهاية المباراة
    if (!prev.finished && cur.finished) {
      const why = resultContext(m);
      alerts.push({
        fixtureId: m.id,
        kind: "fulltime",
        title: `🏁 انتهت المباراة · ${m.home.name} ${fmtScore(m)} ${m.away.name}`,
        body: why ? `${m.competition} · ${why}` : m.competition,
        teamRefIds,
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
    // اتحاد تراكمي لا استبدال: اختفاء حدث مؤقتًا من بثّ المزوّد ثم عودته كان
    // يمحو توقيعه فيُرسَل إشعاره من جديد — التوقيع المرصود يبقى حتى نهاية المباراة.
    const curSigs = new Set(events.map(eventSig));
    eventSeen.set(m.id, prev ? new Set([...prev, ...curSigs]) : curSigs);
    if (!prev) continue; // خطّ أساس فقط

    const matchName = `${m.home.name} ضد ${m.away.name}`;
    for (const e of events) {
      if (prev.has(eventSig(e))) continue; // ليس جديدًا
      const minute = e.minute != null ? ` · د${e.minute}${e.extra ? `+${e.extra}` : ""}` : "";
      if (e.type === "yellow-card" || e.type === "red-card") {
        const icon = e.type === "red-card" ? "🟥" : "🟨";
        out.push({
          fixtureId: m.id,
          kind: "card",
          title: `${icon} ${e.label}${e.team ? ` · ${e.team}` : ""}`,
          body: `${e.player || matchName}${minute}`,
          teamRefIds,
        });
      } else if (e.type === "var") {
        // «تأكيد هدف بعد المراجعة» فحص روتيني يلي كل هدف تقريبًا — الهدف نفسه
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
        });
      }
    }
  }

  // تنظيف دوريّ لتوقيعات مباريات لم تعد ضمن القائمة (مرّة كل ساعة).
  const now = Date.now();
  if (now - lastEventCleanup > 3_600_000) {
    lastEventCleanup = now;
    for (const id of eventSeen.keys()) {
      if (!allIds.has(id)) eventSeen.delete(id);
    }
  }

  return out;
}

/** دفع إشعار لأجهزة مستخدم واحد (APNs + FCM) — أفضل جهد، لا يرمي. */
export async function pushToUserDevices(
  userId: string,
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<void> {
  try {
    const devices = await db
      .select({
        token: pushDevices.deviceToken,
        provider: pushDevices.tokenProvider,
        bundleId: pushDevices.bundleId,
      })
      .from(pushDevices)
      .where(and(eq(pushDevices.userId, userId), eq(pushDevices.isActive, true)));
    if (devices.length === 0) return;

    const apnsDevices = devices.filter((d) => d.provider === "apns");
    const fcmTokens = devices.filter((d) => d.provider === "fcm").map((d) => d.token);

    if (apnsDevices.length > 0 && isApnsConfigured()) {
      await Promise.all(
        // apns-topic لكل جهاز حسب تطبيقه (الرياضة com.sabq.sports، الأخبار الافتراضي).
        apnsDevices.map(async (d) => {
          try {
            const resp = await sendPushNotification(
              d.token,
              createCustomNotificationPayload(title, body, { ...data, priority: "time-sensitive" }),
              { priority: "10", pushType: "alert", topic: d.bundleId ?? undefined },
            );
            // تشخيص: نطبع نتيجة كل دفعة (نجاح/فشل + السبب) لكشف الرفض الصامت
            // (BadDeviceToken/DeviceTokenNotForTopic) الذي يمنع وصول إشعارات الرياضة.
            if (!resp.success) {
              console.warn(
                `[SportsAlerts] push fail user=${userId} topic=${d.bundleId ?? "default"} status=${resp.statusCode ?? "-"} reason=${resp.reason ?? "-"}`,
              );
            }
          } catch (err) {
            console.warn(`[SportsAlerts] push threw user=${userId} topic=${d.bundleId ?? "default"}:`, err);
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
    deeplink: `sabq://match/${alert.fixtureId}`,
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
      await pushToUserDevices(userId, alert.title, alert.body, pushData);
    }),
  );

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
      status: {
        ...m.status,
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
    // اتحاد تراكمي لا استبدال (نفس علّة eventSeen — الاختفاء المؤقت يعيد الإرسال).
    const curSigs = new Set(ts.events.map(tsEventSig));
    tsEventSeen.set(m.id, prev ? new Set([...prev, ...curSigs]) : curSigs);
    if (!prev) continue; // خطّ أساس فقط

    for (const e of ts.events) {
      if (prev.has(tsEventSig(e))) continue; // ليس جديدًا
      const minute = e.minute ? ` · د${e.minute}` : "";
      const teamName = TEAM_NAME(m, e.team);

      if (e.type === "goal" || e.type === "penalty_goal" || e.type === "own_goal") {
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
        });
      } else if (e.type === "red" || e.type === "yellow_red") {
        const who = arById(e.playerId) ?? (e.player ? tr(e.player) : "");
        out.push({
          fixtureId: m.id,
          kind: "card",
          title: `🟥 بطاقة حمراء${teamName ? ` · ${teamName}` : ""}`,
          body: `${who || matchName}${minute}`,
          teamRefIds,
        });
      } else if (e.type === "yellow") {
        const who = arById(e.playerId) ?? (e.player ? tr(e.player) : "");
        out.push({
          fixtureId: m.id,
          kind: "card",
          title: `🟨 بطاقة صفراء${teamName ? ` · ${teamName}` : ""}`,
          body: `${who || matchName}${minute}`,
          teamRefIds,
        });
      } else if (e.type === "var") {
        // إشعار فقط عند قرارٍ حاسم (إلغاء/احتساب/تغيير). المزوّد يرسل حادثة VAR
        // أيضًا للفحص الروتيني الذي يلي كل هدف (تأكيد) وللمراجعة المعلّقة (0) —
        // وكانت هذه مصدر إشعار «مراجعة الفار» الزائف في كل مباراة.
        if (e.varResult == null || !TS_VAR_DECISIVE_RESULTS.has(e.varResult)) continue;
        const outcome = TS_VAR_RESULT_AR[e.varResult] ?? "قرار بعد مراجعة الفار";
        out.push({
          fixtureId: m.id,
          kind: "var",
          title: "🎦 مراجعة الفار",
          body: `${outcome} · ${matchName}${minute}`,
          teamRefIds,
        });
      }
    }
  }

  // تنظيف دوريّ لتوقيعات مباريات لم تعد ضمن القائمة (مرّة كل ساعة).
  const now = Date.now();
  if (now - lastTsEventCleanup > 3_600_000) {
    lastTsEventCleanup = now;
    const allIds = new Set(matches.map((mm) => mm.id));
    for (const id of tsEventSeen.keys()) {
      if (!allIds.has(id)) tsEventSeen.delete(id);
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
  // تركيب نتيجة/حالة TheSports فيُطلَق الإشعار بنفس سرعة الشاشة.
  const matches = applyTsOverlay(baseMatches, tsLive);
  // أحداث النتيجة/الحالة (انطلاق/نهاية للكل، وهدف لغير مباريات TheSports) + بطاقات/فار
  // API-Football (لغير مباريات TheSports) + أحداث TheSports اللحظية للبطولات المُدرَجة
  // (هدف باسم الهدّاف + بطاقة + فار).
  const alerts = detectAlerts(matches, tsHandledIds);
  const eventAlerts = await detectEventAlerts(matches, tsHandledIds);
  const tsEventAlerts = await detectTsEventAlerts(matches, tsLive);
  const allAlerts = [...alerts, ...eventAlerts, ...tsEventAlerts];

  let recipients = 0;
  for (const alert of allAlerts) {
    // حارس أخير: نصّ سبق إرساله حرفيًّا لنفس المباراة لا يُرسَل ثانيةً مهما
    // تقلّبت تواقيع المزوّد (استكمال الأسماء/النتائج على دفعات).
    const sigs = sentAlertSigs.get(alert.fixtureId) ?? new Set<string>();
    const sig = alertSig(alert);
    if (sigs.has(sig)) continue;
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
  }

  // نحفظ خطّ الأساس المُحدَّث فيصمد لإعادة النشر التالية (أفضل جهد، لا يُعيق الدورة).
  await persistState();

  return { matches: matches.length, alerts: allAlerts.length, recipients };
}
