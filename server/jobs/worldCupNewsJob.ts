/**
 * وظيفة أخبار كأس العالم 2026 — كل دقيقة تفحص جدول المباريات وتولّد
 * ما ينقص: معاينة لكل مباراة تنطلق خلال الساعات القادمة، وتقريرًا لكل
 * مباراة انتهت للتو. منع التكرار داخل المولّد نفسه (slug حتمي لكل مادة).
 *
 * إيقاع الدقيقة مقصود ليصدر تقرير المباراة فور صافرة النهاية: الفحص شبه
 * مجاني (جدول المباريات خلف كاش SWR ستين ثانية + استعلام slug محلي)، فلا
 * يكلف أكثر من نداء مزود واحد في الدقيقة في أسوأ الأحوال.
 *
 * التفعيل صريح عبر WC_NEWS_ENABLED=true — لا تعمل تلقائيًا على أي بيئة
 * لم تطلبها، حتى لو كان APIFOOTBALL_KEY موجودًا.
 */
import cron from "node-cron";
import { isLeader } from "../leaderElection";
import { isWorldCupConfigured } from "../services/worldCupService";
import { runWorldCupNewsCycle } from "../services/worldCupNewsGenerator";

let isRunning = false;

async function tick(trigger: string): Promise<void> {
  // فحص القيادة عند كل دورة لا عند التسجيل: أثناء النشر يقلع الـ pod
  // الجديد بينما القديم ما زال ممسكًا بقفل القيادة، فالتسجيل المشروط
  // بالقيادة لحظة الإقلاع يترك الوظيفة ميتة حتى إعادة تشغيل يدوية.
  // هنا الـ cron مجدول دائمًا، والدورة تمتنع بصمت ما لم يكن هذا الـ pod
  // هو القائد — مرة واحدة عبر كل النسخ، ومحصنة ضد انتقال القيادة.
  if (!isLeader()) return;
  if (isRunning) {
    console.log("[WC News Job] previous cycle still running — skipping");
    return;
  }
  isRunning = true;
  try {
    const summary = await runWorldCupNewsCycle();
    if (summary.previews || summary.reports || summary.arabRoundups || summary.errors) {
      console.log(
        `[WC News Job] (${trigger}) previews=${summary.previews} reports=${summary.reports} arabRoundups=${summary.arabRoundups} skipped=${summary.skipped} errors=${summary.errors}`
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

  cron.schedule("* * * * *", () => void tick("cron"), { timezone: "Asia/Riyadh" });
  console.log("[WC News Job] 📰 scheduled — every minute (instant post-match reports)");

  // دورة أولى بعد دقيقة من الإقلاع لتغطية ما فات أثناء التوقف
  setTimeout(() => void tick("startup"), 60 * 1000);
}
