/**
 * وظيفة تسوية توقّعات كأس العالم — كل دقيقة تفحص المباريات المنتهية وتمنح
 * الفائزين نقاطهم فور صافرة النهاية (الفحص شبه مجاني: جدول المباريات خلف كاش
 * SWR ستين ثانية + استعلامات محلية).
 *
 * نفس نمط worldCupNewsJob: الـ cron مجدول دائمًا وفحص القيادة يتم داخل كل دورة
 * — أثناء النشر يقلع الـ pod الجديد قبل موت القديم فلا يكون قائدًا لحظة الإقلاع،
 * والتسجيل المشروط بالقيادة يترك الوظيفة ميتة.
 *
 * التفعيل صريح عبر WC_PREDICTIONS_ENABLED=true.
 */
import cron from "node-cron";
import { isLeader } from "../leaderElection";
import { isWorldCupConfigured } from "../services/worldCupService";
import { settleFinishedMatches } from "../services/wcPredictionsService";

let isRunning = false;

async function tick(trigger: string): Promise<void> {
  if (!isLeader()) return;
  if (isRunning) {
    console.log("[WC Predictions Job] previous cycle still running — skipping");
    return;
  }
  isRunning = true;
  try {
    const summary = await settleFinishedMatches();
    if (summary.settled || summary.awarded || summary.errors) {
      console.log(
        `[WC Predictions Job] (${trigger}) settled=${summary.settled} awarded=${summary.awarded} errors=${summary.errors}`,
      );
    }
  } catch (error) {
    console.error("[WC Predictions Job] cycle failed:", error);
  } finally {
    isRunning = false;
  }
}

export function startWcPredictionsJob(): void {
  if (process.env.WC_PREDICTIONS_ENABLED !== "true") {
    console.log("[WC Predictions Job] disabled (WC_PREDICTIONS_ENABLED != true)");
    return;
  }
  if (!isWorldCupConfigured()) {
    console.log("[WC Predictions Job] disabled (APIFOOTBALL_KEY missing)");
    return;
  }

  cron.schedule("* * * * *", () => void tick("cron"), { timezone: "Asia/Riyadh" });
  console.log("[WC Predictions Job] 🏆 scheduled — every minute (instant winner settlement)");

  // دورة أولى بعد دقيقة من الإقلاع لتغطية ما فات أثناء التوقف
  setTimeout(() => void tick("startup"), 60 * 1000);
}
