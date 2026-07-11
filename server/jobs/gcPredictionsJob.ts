/**
 * وظيفة تسوية توقّعات «خليجي 27» — كل دقيقة: تُسوّي المباريات المنتهية (توزيع
 * البركة المتدرّجة + الجائزة المتراكمة + الشارات + الإشعار) وتُسوّي توقّع البطل
 * عند انتهاء النهائي.
 *
 * نفس نمط wc/ac jobs: الـ cron مجدول دائمًا وفحص القيادة داخل كل دورة. التفعيل
 * صريح عبر GC_PREDICTIONS_ENABLED.
 */
import cron from "node-cron";
import { isLeader } from "../leaderElection";
import {
  isGcPredictionsEnabled,
  settleFinishedMatches,
  settleChampionIfFinished,
} from "../services/gcPredictionsService";
import { settleMajlisDuels } from "../services/gcDuelsService";
import { awardGcMajlisChampionBadgesIfReady } from "../services/gcMajlisSocialService";
import {
  deliverGcMajlisNotifications,
  enqueueGcMajlisReminders,
} from "../services/gcMajlisNotificationsService";

let isRunning = false;

async function tick(trigger: string): Promise<void> {
  if (!isLeader()) return;
  if (isRunning) {
    console.log("[GC Predictions Job] previous cycle still running — skipping");
    return;
  }
  isRunning = true;
  try {
    const summary = await settleFinishedMatches();
    const duels = await settleMajlisDuels(summary.settledFixtureIds);
    const champion = await settleChampionIfFinished();
    let majlisChampionBadges = 0;
    let majlisChampionBadgeErrors = 0;
    try {
      majlisChampionBadges = await awardGcMajlisChampionBadgesIfReady();
    } catch (error) {
      majlisChampionBadgeErrors++;
      console.error("[GC Majlis] final champion badge award failed:", error);
    }

    // outbox التجاوز التزم ذريًا داخل تسوية المباراة؛ ما يبقى هنا هو التذكير
    // وتسليم الشبكة فقط، وفشل APNs/FCM لا يعيد أو يعطّل تسوية النقاط.
    let reminderQueued = 0;
    const overtakeQueued = summary.overtakeQueued;
    let notificationErrors = 0;
    try {
      reminderQueued = await enqueueGcMajlisReminders();
    } catch (error) {
      notificationErrors++;
      console.error("[GC Majlis Notifications] reminder enqueue failed:", error);
    }

    let delivery = { claimed: 0, sent: 0, skipped: 0, failed: 0 };
    try {
      delivery = await deliverGcMajlisNotifications();
    } catch (error) {
      notificationErrors++;
      console.error("[GC Majlis Notifications] outbox delivery failed:", error);
    }
    if (
      summary.settled || summary.awarded || summary.errors || champion.settled ||
      duels.settled || duels.refunded || duels.expired || duels.errors ||
      majlisChampionBadges || majlisChampionBadgeErrors ||
      reminderQueued || overtakeQueued || delivery.claimed || notificationErrors
    ) {
      console.log(
        `[GC Predictions Job] (${trigger}) settled=${summary.settled} awarded=${summary.awarded} errors=${summary.errors} duels=${duels.settled}/${duels.refunded}/${duels.expired} duelErrors=${duels.errors} championSettled=${champion.settled} majlisChampionBadges=${majlisChampionBadges} majlisChampionBadgeErrors=${majlisChampionBadgeErrors} majlisQueued=${reminderQueued + overtakeQueued} majlisPush=${delivery.sent}/${delivery.failed} majlisNotificationErrors=${notificationErrors}`,
      );
    }
  } catch (error) {
    console.error("[GC Predictions Job] cycle failed:", error);
  } finally {
    isRunning = false;
  }
}

export function startGcPredictionsJob(): void {
  if (!isGcPredictionsEnabled()) {
    console.log("[GC Predictions Job] disabled (GC_PREDICTIONS_ENABLED != true)");
    return;
  }

  cron.schedule("* * * * *", () => void tick("cron"), { timezone: "Asia/Riyadh" });
  console.log("[GC Predictions Job] 🏆 scheduled — every minute (tiered pari-mutuel pool settlement)");

  setTimeout(() => void tick("startup"), 60 * 1000);
}
