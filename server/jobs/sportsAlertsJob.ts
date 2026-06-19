/**
 * جوب التنبيهات الرياضية الذكية (المرحلة 3ب).
 *
 * كل دقيقة يقارن حالة مباريات اليوم بآخر لقطة ويُرسل أحداثها (انطلاق/هدف/نهاية)
 * لمتابعي الفِرق. يعمل على القائد فقط (يُفحص داخل كل دورة لا عند التسجيل — أثناء
 * النشر يقلع الـ pod الجديد بينما القديم ممسك بقفل القيادة؛ نفس نمط radarJob).
 *
 * التفعيل صريح عبر SPORTS_ALERTS_ENABLED=true — لا يعمل قبل تطبيق المخطط
 * (npm run db:push على staging) واختبار التوصيل.
 */
import cron from "node-cron";
import { isLeader } from "../leaderElection";
import { runSportsAlertsCycle } from "../services/sportsAlertsService";

let isRunning = false;

async function tick(trigger: string): Promise<void> {
  if (!isLeader()) return;
  if (isRunning) {
    console.log("[SportsAlerts Job] previous cycle still running — skipping");
    return;
  }
  isRunning = true;
  try {
    const summary = await runSportsAlertsCycle();
    if (summary.alerts > 0) {
      console.log(
        `[SportsAlerts Job] (${trigger}) matches=${summary.matches} alerts=${summary.alerts} recipients=${summary.recipients}`,
      );
    }
  } catch (error) {
    console.error("[SportsAlerts Job] cycle failed:", error);
  } finally {
    isRunning = false;
  }
}

export function startSportsAlertsJob(): void {
  if (process.env.SPORTS_ALERTS_ENABLED !== "true") {
    console.log("[SportsAlerts Job] disabled (SPORTS_ALERTS_ENABLED != true)");
    return;
  }

  cron.schedule("* * * * *", () => void tick("cron"), { timezone: "Asia/Riyadh" });
  console.log("[SportsAlerts Job] ⚽ scheduled — every minute (followers' teams only)");

  // دورة أولى بعد 30 ثانية لتأسيس خطّ الأساس مبكرًا.
  setTimeout(() => void tick("startup"), 30 * 1000);
}
