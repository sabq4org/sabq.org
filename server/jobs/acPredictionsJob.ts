/**
 * وظيفة تسوية توقّعات كأس آسيا — كل دقيقة تفحص المباريات المنتهية وتمنح كل
 * مستخدم نقاطه المهاريّة فور صافرة النهاية (الجدول خلف كاش SWR + استعلامات محلية).
 *
 * نفس نمط wcPredictionsJob: الـ cron مجدول دائمًا وفحص القيادة داخل كل دورة كي
 * لا تموت الوظيفة لحظة الإقلاع أثناء النشر. التفعيل صريح عبر AC_PREDICTIONS_ENABLED.
 */
import cron from "node-cron";
import { isLeader } from "../leaderElection";
import { isAcPredictionsEnabled, settleFinishedMatches } from "../services/acPredictionsService";

let isRunning = false;

async function tick(trigger: string): Promise<void> {
  if (!isLeader()) return;
  if (isRunning) {
    console.log("[AC Predictions Job] previous cycle still running — skipping");
    return;
  }
  isRunning = true;
  try {
    const summary = await settleFinishedMatches();
    if (summary.settled || summary.awarded || summary.errors) {
      console.log(
        `[AC Predictions Job] (${trigger}) settled=${summary.settled} awarded=${summary.awarded} errors=${summary.errors}`,
      );
    }
  } catch (error) {
    console.error("[AC Predictions Job] cycle failed:", error);
  } finally {
    isRunning = false;
  }
}

export function startAcPredictionsJob(): void {
  if (!isAcPredictionsEnabled()) {
    console.log("[AC Predictions Job] disabled (AC_PREDICTIONS_ENABLED != true or APIFOOTBALL_KEY missing)");
    return;
  }

  cron.schedule("* * * * *", () => void tick("cron"), { timezone: "Asia/Riyadh" });
  console.log("[AC Predictions Job] 🏆 scheduled — every minute (instant skill-based settlement)");

  // دورة أولى بعد دقيقة من الإقلاع لتغطية ما فات أثناء التوقّف.
  setTimeout(() => void tick("startup"), 60 * 1000);
}
