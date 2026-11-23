import cron from "../leaderCron";
import { runSeoWeeklyJob } from "../services/seoWeeklyService";

// تقرير البحث الأسبوعي: كل أحد 9:00 صباحًا بتوقيت الرياض، على القائد فقط. الدورة لا ترمي،
// ولا تكرر التقرير أو البريد لنفس الفترة.
export function startSeoWeeklyJob() {
  cron.schedule("0 9 * * 0", async () => {
    await runSeoWeeklyJob();
  }, { timezone: "Asia/Riyadh" });
  console.log("[SeoWeekly] job started (Sundays 09:00 Riyadh, leader only)");
}
