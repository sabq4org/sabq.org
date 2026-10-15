/**
 * «نشرة سَبْق» المجدولة: كل 5 دقائق يفحص إن حان موعد (7 و13 و21 بتوقيت الرياض)
 * فيكتب مسودة واحدة للموعد. لا يولّد صوتاً ولا ينشر؛ ذلك بعد اعتماد المحرر.
 * الجدولة معطّلة افتراضياً وتُفعَّل من صفحة النشرة في لوحة التحكم.
 */
import { isLeader } from "../leaderElection";
import { runScheduledBulletin } from "../services/audioBulletinService";

const INTERVAL_MS = 5 * 60_000;

let timer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

async function tick(): Promise<void> {
  if (!isLeader() || isRunning) return;
  isRunning = true;
  try {
    const result = await runScheduledBulletin();
    if (result === "created") console.log("[AudioBulletin Job] scheduled draft written; waiting for an editor");
  } catch (error) {
    console.error("[AudioBulletin Job] cycle failed:", error instanceof Error ? error.message : error);
  } finally {
    isRunning = false;
  }
}

export function startAudioBulletinJob(): void {
  if (timer) return;
  timer = setInterval(() => void tick(), INTERVAL_MS);
  console.log("[AudioBulletin Job] 🔁 scheduled — every 5 min (drafts at 07:00, 13:00, 21:00 Riyadh when enabled)");
}
