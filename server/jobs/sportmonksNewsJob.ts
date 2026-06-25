/**
 * وظيفة استيراد أخبار SportMonks التحريرية كمسودّات — كل 30 دقيقة تجلب
 * معاينات المباريات القادمة وتقارير آخر 24 ساعة، وتولّد مسودّة عربية لكل
 * مباراة لم تُستورد بعد (بسقف لكل دورة). مسودّات فقط — المحرّر ينشر بنقرة.
 *
 * إيقاع نصف ساعة (لا دقيقة) لأن مادة SportMonks تتحدّث ببطء وكل توليد يستهلك
 * النموذج؛ والاستيراد اليدوي من اللوحة متاح دائمًا للحالات العاجلة.
 *
 * التفعيل صريح عبر WC_NEWS_ENABLED=true (نفس علم محرّك المونديال — لا علم
 * جديد) + توكن SportMonks مهيأ. لا تعمل تلقائيًا على بيئة لم تطلبها.
 *
 * ملاحظة تعايش: محرّك المونديال (worldCupNewsJob) يولّد معاينة/تقريرًا من
 * API-Football بـ slug نطاق wc26-*، وهذه الوظيفة تولّد مسودّة من SportMonks
 * بـ slug نطاق smwc26-* — نطاقان مستقلّان فلا يتصادمان، لكن قد تظهر مادتان
 * لنفس المباراة (واحدة منشورة من المحرّك، وأخرى مسودّة هنا). يُضبط ذلك بإطفاء
 * النشر التلقائي للمحرّك (WC_NEWS_AUTOPUBLISH=false) إن رغب المحرّر بمراجعة كل شيء.
 */
import cron from "node-cron";
import { isLeader } from "../leaderElection";
import { isSportmonksConfigured } from "../services/sportmonksService";
import { runSportmonksNewsCycle } from "../services/sportmonksNewsService";

let isRunning = false;

async function tick(trigger: string): Promise<void> {
  // فحص القيادة عند كل دورة لا عند التسجيل (نفس منطق محرّك المونديال —
  // محصّن ضد انتقال القيادة أثناء النشر).
  if (!isLeader()) return;
  if (isRunning) {
    console.log("[SM News Job] previous cycle still running — skipping");
    return;
  }
  isRunning = true;
  try {
    const summary = await runSportmonksNewsCycle();
    if (summary.generated || summary.errors) {
      console.log(
        `[SM News Job] (${trigger}) generated=${summary.generated} skipped=${summary.skipped} errors=${summary.errors}`
      );
    }
  } catch (error) {
    console.error("[SM News Job] cycle failed:", error);
  } finally {
    isRunning = false;
  }
}

export function startSportmonksNewsJob(): void {
  if (process.env.WC_NEWS_ENABLED !== "true") {
    console.log("[SM News Job] disabled (WC_NEWS_ENABLED != true)");
    return;
  }
  if (!isSportmonksConfigured()) {
    console.log("[SM News Job] disabled (SPORTMONKS_API_TOKEN missing)");
    return;
  }

  // الدقيقة 7 و37 من كل ساعة (إزاحة عن وظائف أخرى لتوزيع الحمل)
  cron.schedule("7,37 * * * *", () => void tick("cron"), { timezone: "Asia/Riyadh" });
  console.log("[SM News Job] 📰 scheduled — every 30 minutes (SportMonks drafts)");

  // دورة أولى بعد 90 ثانية من الإقلاع لتغطية ما فات
  setTimeout(() => void tick("startup"), 90 * 1000);
}
