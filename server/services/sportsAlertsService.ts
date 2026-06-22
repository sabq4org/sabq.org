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
import {
  getGlobalTodayFixtures,
  getGlobalLiveFixtures,
  getMatchEventsOnly,
  type SplLiveBoardItem,
  type SplMatchEvent,
} from "./saudiLeagueService";
import { getTeamFollowerUserIds } from "./sportsFollowsService";
import { getTheSportsFastScore, isTheSportsConfigured } from "./theSportsService";
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

const eventSig = (e: SplMatchEvent): string =>
  `${e.type}|${e.minute ?? ""}|${e.extra ?? ""}|${e.teamId}|${e.player}`;

const fmtScore = (m: SplLiveBoardItem) => `${m.goals.home ?? 0}-${m.goals.away ?? 0}`;

function detectAlerts(matches: SplLiveBoardItem[]): DetectedAlert[] {
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
    const matchName = `${m.home.name} × ${m.away.name}`;

    // انطلاق المباراة
    if (!prev.live && !prev.finished && cur.live) {
      alerts.push({
        fixtureId: m.id,
        kind: "kickoff",
        title: "🔴 انطلقت المباراة",
        body: `بدأت الآن مباراة ${matchName} · ${m.competition}`,
        teamRefIds,
      });
    }

    // هدف (تغيّر النتيجة) — أثناء اللعب فقط. حارس تصاعدي: لا نُرسل إلا بزيادة
    // مجموع الأهداف (يمنع إشعارًا زائفًا عند تراجع المصدر أو إلغاء هدف بالفار).
    if (cur.live && cur.homeGoals + cur.awayGoals > prev.homeGoals + prev.awayGoals) {
      const homeScored = cur.homeGoals > prev.homeGoals;
      const scorer = homeScored ? m.home.name : m.away.name;
      const minute = m.status.elapsed != null ? ` · د.${m.status.elapsed}` : "";
      alerts.push({
        fixtureId: m.id,
        kind: "goal",
        title: `⚽ هدف لـ${scorer}`,
        body: `${m.home.name} ${fmtScore(m)} ${m.away.name}${minute}`,
        teamRefIds,
      });
    }

    // نهاية المباراة
    if (!prev.finished && cur.finished) {
      alerts.push({
        fixtureId: m.id,
        kind: "fulltime",
        title: "🏁 انتهت المباراة",
        body: `${m.home.name} ${fmtScore(m)} ${m.away.name} · ${m.competition}`,
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
async function detectEventAlerts(matches: SplLiveBoardItem[]): Promise<DetectedAlert[]> {
  const out: DetectedAlert[] = [];
  const allIds = new Set(matches.map((m) => m.id));

  for (const m of matches) {
    if (!m.status.live) continue;
    const teamRefIds = [String(m.home.id), String(m.away.id)];
    const followers = await getTeamFollowerUserIds(teamRefIds);
    if (followers.length === 0) continue; // لا متابع → لا نداء API

    let events: SplMatchEvent[];
    try {
      events = await getMatchEventsOnly(m.id);
    } catch {
      continue;
    }

    const prev = eventSeen.get(m.id);
    eventSeen.set(m.id, new Set(events.map(eventSig)));
    if (!prev) continue; // خطّ أساس فقط

    const matchName = `${m.home.name} × ${m.away.name}`;
    for (const e of events) {
      if (prev.has(eventSig(e))) continue; // ليس جديدًا
      const minute = e.minute != null ? ` · د.${e.minute}${e.extra ? `+${e.extra}` : ""}` : "";
      if (e.type === "yellow-card" || e.type === "red-card") {
        const icon = e.type === "red-card" ? "🟥" : "🟨";
        out.push({
          fixtureId: m.id,
          kind: "card",
          title: `${icon} ${e.label}`,
          body: `${e.player ? `${e.player} · ` : ""}${e.team || matchName}${minute}`,
          teamRefIds,
        });
      } else if (e.type === "var") {
        out.push({
          fixtureId: m.id,
          kind: "var",
          title: "🎦 مراجعة الفار",
          body: `${e.label} · ${matchName}${minute}`,
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
async function pushToUserDevices(
  userId: string,
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<void> {
  try {
    const devices = await db
      .select({ token: pushDevices.deviceToken, provider: pushDevices.tokenProvider })
      .from(pushDevices)
      .where(and(eq(pushDevices.userId, userId), eq(pushDevices.isActive, true)));
    if (devices.length === 0) return;

    const apnsTokens = devices.filter((d) => d.provider === "apns").map((d) => d.token);
    const fcmTokens = devices.filter((d) => d.provider === "fcm").map((d) => d.token);

    if (apnsTokens.length > 0 && isApnsConfigured()) {
      await Promise.all(
        apnsTokens.map((t) =>
          sendPushNotification(
            t,
            createCustomNotificationPayload(title, body, { ...data, priority: "time-sensitive" }),
            { priority: "10", pushType: "alert" },
          ).catch(() => undefined),
        ),
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
  const followers = await getTeamFollowerUserIds(alert.teamRefIds);
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

// تركيب نتيجة/حالة TheSports اللحظية على مباريات المونديال قبل كشف الأحداث —
// فيُطلَق إشعار الهدف/الانطلاق بنفس سرعة ما يراه المستخدم على الشاشة (~5-20ث)
// بدل تأخّر API-Football (~60ث+). أفضل جهد: أي فشل/عدم تهيئة → نُبقي قيمة المصدر
// الحالي. مهم: لا نُحوّر كائنات كاش saudiLeagueService — نُرجّع نسخًا جديدة.
//
// النطاق: مباريات المونديال الجارية الآن، أو المقرّرة التي اقترب موعدها (نافذة من
// 3 ساعات قبل البداية حتى 10 دقائق بعدها) — كي يُسرّع الانطلاق دون حلّ جسرٍ
// لمباريات بعيدة. detail_live حيّ فقط، فالمنتهية تتراجع تلقائيًا للمصدر الحالي.
async function overlayWcFastScore(matches: SplLiveBoardItem[]): Promise<SplLiveBoardItem[]> {
  if (!isTheSportsConfigured()) return matches;
  const now = Math.floor(Date.now() / 1000);
  return Promise.all(
    matches.map(async (m) => {
      if (m.competitionSlug !== "world-cup") return m;
      const nearKickoff =
        !m.status.finished && m.timestamp <= now + 600 && m.timestamp >= now - 3 * 3600;
      if (!m.status.live && !nearKickoff) return m;
      try {
        const ts = await getTheSportsFastScore(m.id, m.timestamp);
        if (!ts || (!ts.live && !ts.finished)) return m;
        return {
          ...m,
          goals: { home: ts.home, away: ts.away },
          status: {
            ...m.status,
            live: ts.live,
            finished: ts.finished || m.status.finished,
          },
        };
      } catch {
        return m;
      }
    }),
  );
}

export interface SportsAlertsCycleSummary {
  matches: number;
  alerts: number;
  recipients: number;
}

/** دورة واحدة: اكتشاف الأحداث + توصيلها للمتابعين. */
export async function runSportsAlertsCycle(): Promise<SportsAlertsCycleSummary> {
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
  // نتيجة/حالة لحظية من TheSports لمباريات المونديال (overlay) — يجعل إشعار
  // الهدف/الانطلاق بنفس سرعة الشاشة. أفضل جهد، يتراجع تلقائيًا عند عدم التهيئة.
  const matches = await overlayWcFastScore([...byId.values()]);
  // أحداث النتيجة/الحالة (انطلاق/هدف/نهاية) + أحداث البطاقات/الفار (للمباريات
  // المباشرة التي لها متابعون فقط).
  const alerts = detectAlerts(matches);
  const eventAlerts = await detectEventAlerts(matches);
  const allAlerts = [...alerts, ...eventAlerts];

  let recipients = 0;
  for (const alert of allAlerts) {
    recipients += await dispatchAlert(alert);
  }

  return { matches: matches.length, alerts: allAlerts.length, recipients };
}
