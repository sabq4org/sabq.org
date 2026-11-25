import cron from "../leaderCron";
import { purgeExpiredWriterVoiceSamples } from "../services/writerVoiceService";

// «صوتي»: حذف التسجيل الأصلي لكاتب الرأي بعد 30 يومًا من تجهيز صوته. يوميًا 03:20 بتوقيت الرياض، على القائد فقط.
export function startWriterVoicePurgeJob() {
  cron.schedule(
    "20 3 * * *",
    async () => {
      try {
        const purged = await purgeExpiredWriterVoiceSamples();
        if (purged > 0) console.log(`[WriterVoice] purged ${purged} expired sample(s)`);
      } catch (error) {
        console.error("[WriterVoice] purge job failed:", error instanceof Error ? error.message : error);
      }
    },
    { timezone: "Asia/Riyadh" },
  );
  console.log("[WriterVoice] sample purge job started (daily 03:20 Riyadh, leader only)");
}
