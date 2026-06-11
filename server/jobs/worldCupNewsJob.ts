/**
 * وظيفة أخبار كأس العالم 2026 — كل 10 دقائق تفحص جدول المباريات وتولّد
 * ما ينقص: معاينة لكل مباراة تنطلق خلال الساعات القادمة، وتقريرًا لكل
 * مباراة انتهت للتو. منع التكرار داخل المولّد نفسه (slug حتمي لكل مادة).
 *
 * التفعيل صريح عبر WC_NEWS_ENABLED=true — لا تعمل تلقائيًا على أي بيئة
 * لم تطلبها، حتى لو كان APIFOOTBALL_KEY موجودًا.
 */
import cron from "node-cron";
import { isWorldCupConfigured } from "../services/worldCupService";
import { runWorldCupNewsCycle } from "../services/worldCupNewsGenerator";

let isRunning = false;

async function tick(trigger: string): Promise<void> {
  if (isRunning) {
    console.log("[WC News Job] previous cycle still running — skipping");
    return;
  }
  isRunning = true;
  try {
    const summary = await runWorldCupNewsCycle();
    if (summary.previews || summary.reports || summary.errors) {
      console.log(
        `[WC News Job] (${trigger}) previews=${summary.previews} reports=${summary.reports} skipped=${summary.skipped} errors=${summary.errors}`
      );
    }
  } catch (error) {
    console.error("[WC News Job] cycle failed:", error);
  } finally {
    isRunning = false;
  }
}

export function startWorldCupNewsJob(): void {
  if (process.env.WC_NEWS_ENABLED !== "true") {
    console.log("[WC News Job] disabled (WC_NEWS_ENABLED != true)");
    return;
  }
  if (!isWorldCupConfigured()) {
    console.log("[WC News Job] disabled (APIFOOTBALL_KEY missing)");
    return;
  }

  cron.schedule("*/10 * * * *", () => void tick("cron"), { timezone: "Asia/Riyadh" });
  console.log("[WC News Job] 📰 scheduled — every 10 minutes");

  // دورة أولى بعد دقيقة من الإقلاع لتغطية ما فات أثناء التوقف
  setTimeout(() => void tick("startup"), 60 * 1000);
}
