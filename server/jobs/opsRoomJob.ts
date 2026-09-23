/**
 * نبضة غرفة العمليات — كل 20 ثانية على القائد فقط.
 * لا توجد قائمة انتظار خارجية: الحالة في القاعدة، والكرون يلتقط الخطوات
 * المستحقة (تبعيات اكتملت، إعادة محاولة حان وقتها، دفعة فورية لم تكتمل).
 * المطالبة ذرية في المخزن فلا تُنفَّذ خطوة مرتين حتى مع تعدد النسخ.
 */
import cron from "node-cron";
import { isLeader } from "../leaderElection";

let isRunning = false;

async function tick() {
  if (!isLeader()) return;
  if (isRunning) return;
  isRunning = true;
  try {
    const { getOpsRoomEngine, isOpsRoomPaused } = await import("../services/opsRoom");
    if (await isOpsRoomPaused()) return;
    await getOpsRoomEngine().pumpAll();
  } catch (err) {
    console.error("[Ops Room] tick failed:", err);
  } finally {
    isRunning = false;
  }
}

export function startOpsRoomJob() {
  cron.schedule("*/20 * * * * *", tick);
  console.log("[Ops Room] job started (every 20s, leader-only ticks)");
}
