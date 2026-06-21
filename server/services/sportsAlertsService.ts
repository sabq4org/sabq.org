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
  type SplLiveBoardItem,
} from "./saudiLeagueService";
import { getTeamFollowerUserIds } from "./sportsFollowsService";
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

type SportsAlertKind = "kickoff" | "goal" | "fulltime";

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

const fmtScore = (m: SplLiveBoardItem) => `${m.goals.home ?? 0}-${m.goals.away ?? 0}`;

function detectAlerts(matches: SplLiveBoardItem[]): DetectedAlert[] {
  const alerts: DetectedAlert[] = [];
  const seenIds = new Set<number>();

  for (const m of matches) {
    seenIds.add(m.id);
    const cur: MatchSnapshot = {
      homeGoals: m.goals.home ?? 0,
      awayGoals: m.goals.away ?? 0,
      live: m.status.live,
      finished: m.status.finished,
    };
    const prev = snapshots.get(m.id);
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

    // هدف (تغيّر النتيجة) — أثناء اللعب فقط
    if (cur.live && (cur.homeGoals !== prev.homeGoals || cur.awayGoals !== prev.awayGoals)) {
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
  const userIds = await getTeamFollowerUserIds(alert.teamRefIds);
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
  const matches = [...byId.values()];
  const alerts = detectAlerts(matches);

  let recipients = 0;
  for (const alert of alerts) {
    recipients += await dispatchAlert(alert);
  }

  return { matches: matches.length, alerts: alerts.length, recipients };
}
