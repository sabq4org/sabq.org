/**
 * وظيفة تسوية توقّعات الكؤوس المحلية (كأس الملك + كأس السوبر) — كل دقيقة تفحص
 * المباريات المنتهية لكل بطولة مُفعَّلة وتمنح الفائزين نقاطهم فور صافرة النهاية
 * (نفس محرّك المونديال/روشن المُعمّم).
 *
 * نفس نمط rslPredictionsJob: الكرون مجدول دائمًا وفحص القيادة داخل كل دورة.
 * كل بطولة خلف علمها المستقل (KINGS_CUP_PREDICTIONS_ENABLED /
 * SUPER_CUP_PREDICTIONS_ENABLED) — تُتخطّى المعطّلة داخل الدورة.
 */
import cron from "node-cron";
import { isLeader } from "../leaderElection";
import { isSaudiLeagueConfigured } from "../services/saudiLeagueService";
import { settleFinishedMatches } from "../services/cupPredictionsService";
import { CUP_PREDICTION_CONFIGS } from "../routes/cupPredictions";

let isRunning = false;

async function tick(trigger: string): Promise<void> {
  if (!isLeader()) return;
  if (isRunning) {
    console.log("[Cup Predictions Job] previous cycle still running — skipping");
    return;
  }
  isRunning = true;
  try {
    for (const cfg of CUP_PREDICTION_CONFIGS) {
      if (process.env[cfg.flagEnv] !== "true") continue;
      try {
        const summary = await settleFinishedMatches(cfg.slug);
        if (summary.settled || summary.awarded || summary.errors) {
          console.log(
            `[Cup Predictions Job] (${trigger}) ${cfg.slug}: settled=${summary.settled} awarded=${summary.awarded} errors=${summary.errors}`,
          );
        }
      } catch (error) {
        console.error(`[Cup Predictions Job] ${cfg.slug} cycle failed:`, error);
      }
    }
  } finally {
    isRunning = false;
  }
}

export function startCupPredictionsJob(): void {
  const anyEnabled = CUP_PREDICTION_CONFIGS.some((c) => process.env[c.flagEnv] === "true");
  if (!anyEnabled) {
    console.log("[Cup Predictions Job] disabled (no cup prediction flag enabled)");
    return;
  }
  if (!isSaudiLeagueConfigured()) {
    console.log("[Cup Predictions Job] disabled (Saudi league not configured)");
    return;
  }

  cron.schedule("* * * * *", () => void tick("cron"), { timezone: "Asia/Riyadh" });
  console.log("[Cup Predictions Job] 🏆 scheduled — every minute (kings-cup + super-cup)");

  // دورة أولى بعد دقيقة من الإقلاع لتغطية ما فات أثناء التوقف
  setTimeout(() => void tick("startup"), 60 * 1000);
}
