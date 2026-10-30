/**
 * الترجمة الآلية للنسخة الإنجليزية: كل ساعتين (الدقيقة 5، بتوقيت الرياض) يختار أهم
 * الأخبار العربية غير المحلية ويترجمها بخط زر الترجمة نفسه. القائد فقط ينفّذ.
 * الإيقاف والوضع (نشر/مسودة) من الإعداد en_auto_translate_settings، أو
 * EN_AUTO_TRANSLATE=off كمفتاح طوارئ في البيئة.
 */
import cron from "node-cron";
import { isLeader } from "../leaderElection";
import { runEnAutoTranslate } from "../services/enAutoTranslateService";

let isRunning = false;

async function tick(): Promise<void> {
  if (!isLeader() || isRunning) return;
  if ((process.env.EN_AUTO_TRANSLATE || "").trim().toLowerCase() === "off") return;
  isRunning = true;
  try {
    const result = await runEnAutoTranslate();
    if (result.status !== "done") {
      console.log(`[EN Auto Translate] ${result.status} (candidates=${result.candidates})`);
      return;
    }
    console.log(
      `[EN Auto Translate] candidates=${result.candidates} translated=${result.translated.length} skipped=${result.skipped.length}` +
        result.translated.map((t) => ` | ${t.score}: ${t.title}`).join(""),
    );
  } catch (error) {
    console.error("[EN Auto Translate] cycle failed:", error instanceof Error ? error.message : error);
  } finally {
    isRunning = false;
  }
}

export function startEnAutoTranslateJob(): void {
  cron.schedule("5 */2 * * *", () => void tick(), { timezone: "Asia/Riyadh" });
  console.log("[EN Auto Translate] 🔁 scheduled — every 2 hours at :05 Riyadh (leader only)");
}
