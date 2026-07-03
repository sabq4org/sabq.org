/**
 * وظيفة تسوية توقّعات دوري روشن — كل دقيقة تفحص المباريات المنتهية وتمنح
 * الفائزين نقاطهم فور صافرة النهاية (نفس محرّك المونديال). توقّعات الموسم
 * (البطل/الهدّاف) تُسوّى مرّة عند اكتمال الموسم — آمنة لإعادة التشغيل عبر
 * settledAt + dedup الولاء.
 *
 * نفس نمط wcPredictionsJob: الكرون مجدول دائمًا وفحص القيادة داخل كل دورة
 * (تسجيل مشروط بالقيادة أثناء النشر = وظيفة ميتة).
 *
 * التفعيل صريح عبر RSL_PREDICTIONS_ENABLED=true (بعد زراعة جداول rsl_*).
 */
import cron from "node-cron";
import { isLeader } from "../leaderElection";
import { isSaudiLeagueConfigured } from "../services/saudiLeagueService";
import { settleFinishedMatches } from "../services/rslPredictionsService";
import { settleRslLong } from "../services/rslLongPredictionsService";

let isRunning = false;

async function tick(trigger: string): Promise<void> {
  if (!isLeader()) return;
  if (isRunning) {
    console.log("[RSL Predictions Job] previous cycle still running — skipping");
    return;
  }
  isRunning = true;
  try {
    const summary = await settleFinishedMatches();
    if (summary.settled || summary.awarded || summary.errors) {
      console.log(
        `[RSL Predictions Job] (${trigger}) settled=${summary.settled} awarded=${summary.awarded} errors=${summary.errors}`,
      );
    }
    const long = await settleRslLong();
    if (long.championSettled || long.scorerSettled) {
      console.log(
        `[RSL Predictions Job] (${trigger}) long: champion=${long.championWinners} scorer=${long.scorerWinners}`,
      );
    }
  } catch (error) {
    console.error("[RSL Predictions Job] cycle failed:", error);
  } finally {
    isRunning = false;
  }
}

export function startRslPredictionsJob(): void {
  if (process.env.RSL_PREDICTIONS_ENABLED !== "true") {
    console.log("[RSL Predictions Job] disabled (RSL_PREDICTIONS_ENABLED != true)");
    return;
  }
  if (!isSaudiLeagueConfigured()) {
    console.log("[RSL Predictions Job] disabled (Saudi league not configured)");
    return;
  }

  cron.schedule("* * * * *", () => void tick("cron"), { timezone: "Asia/Riyadh" });
  console.log("[RSL Predictions Job] 🏆 scheduled — every minute (instant winner settlement)");

  // دورة أولى بعد دقيقة من الإقلاع لتغطية ما فات أثناء التوقف
  setTimeout(() => void tick("startup"), 60 * 1000);
}
