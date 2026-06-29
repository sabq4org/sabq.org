/**
 * وظيفة تسوية توقّعات «خليجي 27» — كل دقيقة: تُسوّي المباريات المنتهية (توزيع
 * البركة المتدرّجة + الجائزة المتراكمة + الشارات + الإشعار) وتُسوّي توقّع البطل
 * عند انتهاء النهائي.
 *
 * نفس نمط wc/ac jobs: الـ cron مجدول دائمًا وفحص القيادة داخل كل دورة. التفعيل
 * صريح عبر GC_PREDICTIONS_ENABLED.
 */
import cron from "node-cron";
import { isLeader } from "../leaderElection";
import {
  isGcPredictionsEnabled,
  settleFinishedMatches,
  settleChampionIfFinished,
} from "../services/gcPredictionsService";

let isRunning = false;

async function tick(trigger: string): Promise<void> {
  if (!isLeader()) return;
  if (isRunning) {
    console.log("[GC Predictions Job] previous cycle still running — skipping");
    return;
  }
  isRunning = true;
  try {
    const summary = await settleFinishedMatches();
    const champion = await settleChampionIfFinished();
    if (summary.settled || summary.awarded || summary.errors || champion.settled) {
      console.log(
        `[GC Predictions Job] (${trigger}) settled=${summary.settled} awarded=${summary.awarded} errors=${summary.errors} championSettled=${champion.settled}`,
      );
    }
  } catch (error) {
    console.error("[GC Predictions Job] cycle failed:", error);
  } finally {
    isRunning = false;
  }
}

export function startGcPredictionsJob(): void {
  if (!isGcPredictionsEnabled()) {
    console.log("[GC Predictions Job] disabled (GC_PREDICTIONS_ENABLED != true)");
    return;
  }

  cron.schedule("* * * * *", () => void tick("cron"), { timezone: "Asia/Riyadh" });
  console.log("[GC Predictions Job] 🏆 scheduled — every minute (tiered pari-mutuel pool settlement)");

  setTimeout(() => void tick("startup"), 60 * 1000);
}
