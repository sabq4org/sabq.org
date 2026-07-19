/**
 * جوب تنبيهات الانتقالات (سعودية + عالمية بارزة).
 *
 * كل ~10 دقائق يقارن الصفقات المؤكّدة بآخر أساس معروف ويبثّ الجديدة لمن فعّل
 * المفتاح المناسب (transfersSaudi/transfersGlobal). يعمل على القائد فقط (يُفحص
 * داخل كل دورة — نفس نمط sportsAlertsJob: أثناء النشر يقلع الـ pod الجديد بينما
 * القديم ممسك بقفل القيادة).
 *
 * الوتيرة 10د لأن الانتقالات تتحرّك في نوافذ (لا ثوانٍ)، وبيانات المصدرين خلف
 * SWR (روشن ساعة، العالمي أقصر) فلا ضغط إضافي على المزوّدين.
 *
 * التفعيل صريح عبر SPORTS_TRANSFER_ALERTS_ENABLED=true — لا يعمل قبل تطبيق
 * المخطط (npm run db:push على staging) واختبار التوصيل.
 */
import { isLeader } from "../leaderElection";
import { runTransferAlertsCycle } from "../services/transferAlertsService";
import { runWithSportsPriority } from "../services/sportsRequestContext";

const INTERVAL_MS = 10 * 60_000;

let timer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

async function tick(trigger: string): Promise<void> {
  if (!isLeader()) return;
  if (isRunning) {
    console.log("[TransferAlerts Job] previous cycle still running — skipping");
    return;
  }
  isRunning = true;
  try {
    const summary = await runTransferAlertsCycle();
    if (summary.saudiNew > 0 || summary.globalNew > 0) {
      console.log(
        `[TransferAlerts Job] (${trigger}) saudiNew=${summary.saudiNew} globalNew=${summary.globalNew} recipients=${summary.recipients}`,
      );
    }
  } catch (error) {
    console.error("[TransferAlerts Job] cycle failed:", error);
  } finally {
    isRunning = false;
  }
}

export function startTransferAlertsJob(): void {
  if (process.env.SPORTS_TRANSFER_ALERTS_ENABLED !== "true") {
    console.log("[TransferAlerts Job] disabled (SPORTS_TRANSFER_ALERTS_ENABLED != true)");
    return;
  }
  if (timer) return;

  timer = setInterval(() => void runWithSportsPriority("background", () => tick("interval")), INTERVAL_MS);
  console.log("[TransferAlerts Job] 🔁 scheduled — every 10m (confirmed transfers)");

  // دورة أولى بعد 20 ثانية لتأسيس خطّ الأساس مبكرًا (بلا إرسال).
  setTimeout(() => void runWithSportsPriority("background", () => tick("startup")), 20_000);
}
