/**
 * وظيفة أخبار كأس خادم الحرمين الشريفين — كل دقيقة تفحص جدول المباريات وتولّد
 * ما ينقص: معاينة لكل مباراة تنطلق قريبًا، وتقريرًا لكل مباراة انتهت للتو.
 * منع التكرار داخل المولّد نفسه (slug حتمي kc-preview/kc-report-{fixtureId}).
 *
 * التفعيل صريح عبر KC_NEWS_ENABLED=true — لا تعمل تلقائيًا على أي بيئة لم
 * تطلبها حتى لو كان APIFOOTBALL_KEY موجودًا. فحص القيادة داخل كل دورة (نفس
 * نمط worldCupNewsJob) ليصمد أمام انتقال القيادة أثناء النشر.
 */
import cron from "node-cron";
import { isLeader } from "../leaderElection";
import { isKingsCupConfigured } from "../services/kingsCupService";
import { runKingsCupNewsCycle } from "../services/kingsCupNewsGenerator";

let isRunning = false;

async function tick(trigger: string): Promise<void> {
  if (!isLeader()) return;
  if (isRunning) {
    console.log("[KC News Job] previous cycle still running — skipping");
    return;
  }
  isRunning = true;
  try {
    const summary = await runKingsCupNewsCycle();
    if (summary.previews || summary.reports || summary.errors) {
      console.log(
        `[KC News Job] (${trigger}) previews=${summary.previews} reports=${summary.reports} skipped=${summary.skipped} errors=${summary.errors}`,
      );
    }
  } catch (error) {
    console.error("[KC News Job] cycle failed:", error);
  } finally {
    isRunning = false;
  }
}

export function startKingsCupNewsJob(): void {
  if (process.env.KC_NEWS_ENABLED !== "true") {
    console.log("[KC News Job] disabled (KC_NEWS_ENABLED != true)");
    return;
  }
  if (!isKingsCupConfigured()) {
    console.log("[KC News Job] disabled (APIFOOTBALL_KEY missing)");
    return;
  }

  cron.schedule("* * * * *", () => void tick("cron"), { timezone: "Asia/Riyadh" });
  console.log("[KC News Job] 📰 scheduled — every minute (instant post-match reports)");

  // دورة أولى بعد دقيقة من الإقلاع لتغطية ما فات أثناء التوقف
  setTimeout(() => void tick("startup"), 60 * 1000);
}
