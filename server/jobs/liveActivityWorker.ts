/**
 * عامل النشاط المباشر (iOS Live Activity push-to-update).
 *
 * كل ~5 ثوانٍ يدفع تحديثات شاشة القفل للمباريات التي لها أنشطة مباشرة فعّالة
 * عبر APNs (apns-push-type: liveactivity)، فتتحدّث النتيجة/الشوط دون فتح
 * التطبيق. يعمل على القائد فقط (يُفحص داخل كل دورة — نفس نمط sportsAlertsJob).
 *
 * يعمل تلقائيًا مع ENABLE_BACKGROUND_WORKERS؛ للتعطيل: LIVE_ACTIVITY_PUSH_ENABLED=false.
 * الدورة نفسها تتخطّى العمل فورًا حين لا توجد توكنات فعّالة (استعلام مفهرس رخيص).
 */
import { isLeader } from "../leaderElection";
import { runLiveActivityCycle } from "../services/liveActivityService";

// دورة متكيّفة: 2ث حين توجد مباريات لها أنشطة فعّالة (لتسليم الهدف خلال ثوانٍ)،
// و5ث عند الخمول (لا توكنات) لتقليل الضغط. setTimeout متسلسل بدل setInterval ثابت.
const FAST_MS = 2_000;
const IDLE_MS = 5_000;

let timer: ReturnType<typeof setTimeout> | null = null;
let isRunning = false;
let stopped = false;

async function tick(): Promise<void> {
  let nextMs = IDLE_MS;
  if (isLeader() && !isRunning) {
    isRunning = true;
    try {
      const summary = await runLiveActivityCycle();
      // وجود مباريات بأنشطة فعّالة = سياق مباراة جارية → سرّع الدورة.
      if (summary.fixtures > 0) nextMs = FAST_MS;
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
  if (!stopped) timer = setTimeout(() => void tick(), nextMs);
}

export function startLiveActivityWorker(): void {
  if (process.env.LIVE_ACTIVITY_PUSH_ENABLED === "false") {
    console.log("[LiveActivity Worker] disabled (LIVE_ACTIVITY_PUSH_ENABLED=false)");
    return;
  }
  if (timer) return;
  stopped = false;
  timer = setTimeout(() => void tick(), FAST_MS);
  console.log("[LiveActivity Worker] 📲 started — adaptive 2s live / 5s idle (leader only)");
}
