import cron from "../leaderCron";
import {
  runPublisherDailyAlerts,
  sendPublisherMonthlyReports,
} from "../services/publisherPortalService";

const LOG_PREFIX = "[PublisherAlerts]";

/**
 * حماية إيراد الناشرين:
 *  - يومياً 09:00 بتوقيت الرياض: تنبيهات الرصيد المنخفض/المنتهي،
 *    الباقات التي تنتهي خلال أسبوع، ونوافذ النشر التي توشك/انتهت
 *    (بريد لصندوق الوكالة + جرس اللوحة لكل أعضائها، بمنع تكرار).
 *  - مطلع كل شهر 08:00: التقرير الشهري لكل وكالة نشطة (كشف نشر ورصيد).
 *
 * تعمل على القائد فقط (تُسجَّل داخل بوابة isLeader في server/index.ts).
 */
export function startPublisherAlertsJob() {
  console.log(`${LOG_PREFIX} 🚀 Starting publisher alerts scheduler...`);

  cron.schedule("0 9 * * *", async () => {
    try {
      const result = await runPublisherDailyAlerts();
      console.log(`${LOG_PREFIX} ✅ Daily alerts done — checked ${result.publishersChecked} publishers, sent ${result.alertsSent} alerts`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Daily alerts failed:`, error);
    }
  }, { timezone: "Asia/Riyadh" });

  cron.schedule("0 8 1 * *", async () => {
    try {
      const result = await sendPublisherMonthlyReports();
      console.log(`${LOG_PREFIX} ✅ Monthly reports done — sent ${result.reportsSent}`);
    } catch (error) {
      console.error(`${LOG_PREFIX} Monthly reports failed:`, error);
    }
  }, { timezone: "Asia/Riyadh" });

  console.log(`${LOG_PREFIX} ✅ Schedulers started (daily 09:00, monthly 1st 08:00 Riyadh)`);
}
