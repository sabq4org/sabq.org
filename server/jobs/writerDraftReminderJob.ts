import cron from "../leaderCron";
import { runWriterDraftReminderTick } from "../services/writerDraftReminderService";

// تذكير كاتب الرأي بمسودة لم تُرسل بعد 24 ساعة: كل ساعة (الدقيقة 17) على القائد فقط. الدورة لا ترمي.
export function startWriterDraftReminderJob() {
  cron.schedule("17 * * * *", async () => {
    await runWriterDraftReminderTick();
  });
  console.log("[WriterDraftReminder] job started (hourly, leader only)");
}
