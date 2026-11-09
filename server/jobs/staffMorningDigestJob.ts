/**
 * ملخص الصباح لتطبيق «مكتب سبق»: كل يوم 08:00 بتوقيت الرياض، إشعار واحد لكل
 * عضو بما ينتظر قراره. القائد فقط؛ والتكرار ممنوع أيضًا في الخدمة (حجز يوم
 * الرياض لكل عضو في system_settings). الإيقاف: STAFF_MORNING_DIGEST=off.
 */
import cron, { type ScheduledTask } from "node-cron";
import { isLeader } from "../leaderElection";
import { isStaffMorningDigestEnabled, runMorningDigest } from "../services/staffMorningDigestService";

let task: ScheduledTask | null = null;

async function tick(): Promise<void> {
  if (!isStaffMorningDigestEnabled() || !isLeader()) return;
  try {
    await runMorningDigest(new Date());
  } catch (error) {
    console.error("[StaffMorningDigest Job] run failed:", error instanceof Error ? error.message : error);
  }
}

export function startStaffMorningDigestJob(): void {
  if (task) return;
  if (!isStaffMorningDigestEnabled()) {
    console.log("[StaffMorningDigest Job] disabled (STAFF_MORNING_DIGEST=off)");
    return;
  }
  task = cron.schedule("0 8 * * *", () => void tick(), { timezone: "Asia/Riyadh" });
  console.log("[StaffMorningDigest Job] scheduled — daily 08:00 Asia/Riyadh");
}

export function stopStaffMorningDigestJob(): void {
  task?.stop();
  task = null;
}
