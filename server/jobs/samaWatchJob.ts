/**
 * رصد البنك المركزي السعودي — يعمل كل دقيقة على القائد فقط، والإيقاع الفعلي لكل
 * مصدر تحدده watchCadence (خفيف عادةً، كثيف في نوافذ الصدور وليلة قرار الفائدة).
 * التعطيل: SAMA_ENABLED=false.
 */
import cron from "node-cron";
import { isLeader } from "../leaderElection";
import { runSamaWatchCycle } from "../services/economy/samaWatch";

let isRunning = false;

async function tick(trigger: string): Promise<void> {
  if (!isLeader()) return;
  if (isRunning) return;
  isRunning = true;
  try {
    const r = await runSamaWatchCycle();
    if (r.ran.length && (r.changes || Object.keys(r.errors).length)) {
      console.log(`[SAMA Watch] ${trigger}: ran=${r.ran.join(",")} changes=${r.changes} errors=${JSON.stringify(r.errors)}`);
    }
  } catch (e) {
    console.error("[SAMA Watch] cycle failed:", (e as Error).message);
  } finally {
    isRunning = false;
  }
}

export function startSamaWatchJob(): void {
  if (process.env.SAMA_ENABLED === "false") {
    console.log("[SAMA Watch] disabled (SAMA_ENABLED=false)");
    return;
  }
  cron.schedule("* * * * *", () => void tick("cron"), { timezone: "Asia/Riyadh" });
  setTimeout(() => void tick("startup"), 45 * 1000);
  console.log("[SAMA Watch] scheduled (every minute, leader only)");
}
