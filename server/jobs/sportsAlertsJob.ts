/**
 * جوب التنبيهات الرياضية الذكية (المرحلة 3ب).
 *
 * كل 20 ثانية يقارن حالة المباريات (اليوم + المباشر الطازج) بآخر لقطة ويُرسل
 * أحداثها (انطلاق/هدف/نهاية) لمتابعي الفِرق. يعمل على القائد فقط (يُفحص داخل
 * كل دورة لا عند التسجيل — أثناء النشر يقلع الـ pod الجديد بينما القديم ممسك
 * بقفل القيادة؛ نفس نمط radarJob).
 *
 * الوتيرة 20ث (بدل دقيقة سابقًا) لتقليل تأخّر إشعارات الهدف/الانطلاق؛ بيانات
 * المباراة محميّة بـ SWR (live 15ث) فلا ضغط زائد على API-Football.
 *
 * التفعيل صريح عبر SPORTS_ALERTS_ENABLED=true — لا يعمل قبل تطبيق المخطط
 * (npm run db:push على staging) واختبار التوصيل.
 */
import { isLeader } from "../leaderElection";
import { runSportsAlertsCycle } from "../services/sportsAlertsService";

const INTERVAL_MS = 20_000;

let timer: ReturnType<typeof setInterval> | null = null;
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
  if (timer) return;

  timer = setInterval(() => void tick("interval"), INTERVAL_MS);
  console.log("[SportsAlerts Job] ⚽ scheduled — every 20s (followers' teams only)");

  // دورة أولى بعد 15 ثانية لتأسيس خطّ الأساس مبكرًا.
  setTimeout(() => void tick("startup"), 15 * 1000);
}
