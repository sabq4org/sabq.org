import cron from "../leaderCron";
import { runDutyAlertsTick } from "../services/contentDuty/dutyAlertsEngine";

// «عين المناوبة»: كل دقيقة على القائد فقط. runDutyAlertsTick لا يرمي، والجدول الغائب يُتخطى بهدوء.
export function startDutyAlertsJob() {
  cron.schedule("* * * * *", async () => {
    await runDutyAlertsTick();
  });
  console.log("[DutyAlerts] job started (every minute, leader only)");
}
