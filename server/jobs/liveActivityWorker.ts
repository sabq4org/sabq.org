/**
 * عامل النشاط المباشر (iOS Live Activity push-to-update).
 *
 * كل ~10 ثوانٍ يدفع تحديثات شاشة القفل للمباريات التي لها أنشطة مباشرة فعّالة
 * عبر APNs (apns-push-type: liveactivity)، فتتحدّث النتيجة/الشوط دون فتح
 * التطبيق. يعمل على القائد فقط (يُفحص داخل كل دورة — نفس نمط sportsAlertsJob).
 *
 * يعمل تلقائيًا مع ENABLE_BACKGROUND_WORKERS؛ للتعطيل: LIVE_ACTIVITY_PUSH_ENABLED=false.
 * الدورة نفسها تتخطّى العمل فورًا حين لا توجد توكنات فعّالة (استعلام مفهرس رخيص).
 */
import { isLeader } from "../leaderElection";
import { runLiveActivityCycle } from "../services/liveActivityService";

const INTERVAL_MS = 10_000;

let timer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

async function tick(): Promise<void> {
  if (!isLeader()) return;
  if (isRunning) return;
  isRunning = true;
  try {
    const summary = await runLiveActivityCycle();
    if (summary.pushes > 0 || summary.ended > 0) {
      console.log(
        `[LiveActivity Worker] fixtures=${summary.fixtures} pushes=${summary.pushes} ended=${summary.ended}`,
      );
    }
  } catch (error) {
    console.error("[LiveActivity Worker] cycle failed:", error);
  } finally {
    isRunning = false;
  }
}

export function startLiveActivityWorker(): void {
  if (process.env.LIVE_ACTIVITY_PUSH_ENABLED === "false") {
    console.log("[LiveActivity Worker] disabled (LIVE_ACTIVITY_PUSH_ENABLED=false)");
    return;
  }
  if (timer) return;
  timer = setInterval(() => void tick(), INTERVAL_MS);
  console.log("[LiveActivity Worker] 📲 started — every 10s (leader only)");
}
