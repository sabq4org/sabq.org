/**
 * جوب الأسماء الرياضية الموحّدة — شبكة أمان الترجمة الآلية.
 *
 * كل ساعة يلتقط الصفوف المعلّقة (pending) في sports_name_translations —
 * أسماء ظهرت في مسارات حساسة للزمن (skipAi) وفشل ملؤها بالخلفية، أو فشل
 * الـAI فيها سابقًا — ويترجمها دفعةً ثم يسجّل مؤشر التغطية. يعمل على القائد
 * فقط (يُفحص داخل كل دورة — نفس نمط sportsAlertsJob).
 *
 * الوتيرة ساعة لأن الملء بالخلفية داخل الطلبات يتكفّل بالأغلبية لحظيًا؛ الجوب
 * يلتقط البقايا فقط، وثقله الفعلي نداء AI واحد مجمّع في أسوأ الأحوال.
 * لا مفتاح تفعيل خاص — يكفي ENABLE_BACKGROUND_WORKERS العام؛ وبلا
 * OPENAI_API_KEY يخرج فورًا دون أثر.
 */
import { isLeader } from "../leaderElection";
import { processPendingSportsNames } from "../services/sportsNamesService";

const INTERVAL_MS = 60 * 60_000;

let timer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

async function tick(trigger: string): Promise<void> {
  if (!isLeader()) return;
  if (isRunning) return;
  isRunning = true;
  try {
    const { translated, remaining } = await processPendingSportsNames(300);
    if (translated > 0 || remaining > 0) {
      console.log(`[SportsNames Job] (${trigger}) translated=${translated} pendingRemaining=${remaining}`);
    }
  } catch (error) {
    console.error("[SportsNames Job] cycle failed:", error);
  } finally {
    isRunning = false;
  }
}

export function startSportsNamesJob(): void {
  if (timer) return;
  timer = setInterval(() => void tick("interval"), INTERVAL_MS);
  console.log("[SportsNames Job] 🔁 scheduled — hourly (pending sports name translations)");
  // دورة أولى بعد دقيقتين من الإقلاع — تلتقط ما تراكم أثناء النشر
  setTimeout(() => void tick("startup"), 2 * 60_000);
}
