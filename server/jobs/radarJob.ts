/**
 * وظيفة رادار سبق الذكي — كل دقيقة تشغّل دورة الرادار: جلب المصادر التي حان
 * موعدها (فترة لكل مصدر، فالدقيقة مجرد نبض فحص رخيص)، تحليل الجديد، تنبيهات
 * العاجل، وتحويل تحريري تلقائي لعالي القيمة.
 *
 * التفعيل صريح عبر RADAR_ENABLED=true — لا تعمل تلقائيًا على أي بيئة لم تطلبها.
 */
import cron from "node-cron";
import { isLeader } from "../leaderElection";
import { runRadarCycle } from "../services/radar/cycle";

let isRunning = false;

async function tick(trigger: string): Promise<void> {
  // فحص القيادة عند كل دورة لا عند التسجيل: أثناء النشر يقلع الـ pod الجديد
  // بينما القديم ما زال ممسكًا بقفل القيادة — نفس نمط worldCupNewsJob (PR #207).
  if (!isLeader()) return;
  if (isRunning) {
    console.log("[Radar Job] previous cycle still running — skipping");
    return;
  }
  isRunning = true;
  try {
    const summary = await runRadarCycle();
    if (summary.newItems || summary.analyzed || summary.autoDrafts || summary.errors) {
      console.log(
        `[Radar Job] (${trigger}) sources=${summary.sourcesFetched} new=${summary.newItems} analyzed=${summary.analyzed} alerts=${summary.alertsSent} autoDrafts=${summary.autoDrafts} errors=${summary.errors}`
      );
    }
  } catch (error) {
    console.error("[Radar Job] cycle failed:", error);
  } finally {
    isRunning = false;
  }
}

export function startRadarJob(): void {
  if (process.env.RADAR_ENABLED !== "true") {
    console.log("[Radar Job] disabled (RADAR_ENABLED != true)");
    return;
  }

  cron.schedule("* * * * *", () => void tick("cron"), { timezone: "Asia/Riyadh" });
  console.log("[Radar Job] 📡 scheduled — every minute (per-source intervals inside)");

  // دورة أولى بعد 45 ثانية من الإقلاع لتغطية ما فات أثناء التوقف
  setTimeout(() => void tick("startup"), 45 * 1000);
}
