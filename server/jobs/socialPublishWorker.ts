// عامل النشر الاجتماعي المجدول — يلتقط منشورات X المستحقة وينشرها
// مرة واحدة بالضبط:
// - cron كل دقيقة، والتسجيل غير مشروط بالقيادة؛ isLeader() يُفحص داخل كل
//   دورة (نمط kingsCupNewsJob) حتى لا يموت العامل بعد failover.
// - المطالبة عبر FOR UPDATE SKIP LOCKED (claimDueScheduledPosts) — قائدان
//   بالخطأ لا يلتقطان نفس الصف.
// - استرداد أقفال processing القديمة (تحطم replica) كل دورة.
// - الفشل المؤقت يعيد الصف scheduled حتى استنفاد MAX_PUBLISH_ATTEMPTS.
import cron, { type ScheduledTask } from "node-cron";
import { isLeader } from "../leaderElection";
import {
  claimDueScheduledPosts,
  publishClaimedPost,
  recoverStaleProcessingPosts,
} from "../services/socialPublishing/socialPublishingService";

const LOG_PREFIX = "[SocialPublishWorker]";
const BATCH_SIZE = 5;

let isRunning = false;
let task: ScheduledTask | null = null;

export async function runSocialPublishCycle(trigger: string): Promise<void> {
  if (!isLeader()) return;
  if (isRunning) {
    console.log(`${LOG_PREFIX} دورة سابقة ما زالت تعمل — تخطٍ (${trigger})`);
    return;
  }
  isRunning = true;
  try {
    const recovered = await recoverStaleProcessingPosts();
    if (recovered > 0) {
      console.warn(`${LOG_PREFIX} استرداد ${recovered} منشور من قفل قديم`);
    }
    const claimed = await claimDueScheduledPosts(BATCH_SIZE);
    if (claimed.length === 0) return;
    console.log(`${LOG_PREFIX} التقاط ${claimed.length} منشور مستحق (${trigger})`);
    for (const post of claimed) {
      // تسلسلي عمداً — دفعات صغيرة، ونحترم حدود X بدل التوازي
      await publishClaimedPost(post);
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} فشلت الدورة:`, error);
  } finally {
    isRunning = false;
  }
}

export function startSocialPublishWorker(): void {
  if (task) return;
  task = cron.schedule("* * * * *", () => void runSocialPublishCycle("cron"), {
    timezone: "Asia/Riyadh",
  });
  console.log(`${LOG_PREFIX} ✅ مجدول كل دقيقة (فحص القيادة داخل الدورة)`);
}

export function stopSocialPublishWorker(): void {
  if (task) {
    task.stop();
    task = null;
  }
}
