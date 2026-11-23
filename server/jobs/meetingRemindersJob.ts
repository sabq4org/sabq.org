import cron from "../leaderCron";
import { runMeetingRemindersTick } from "../services/meetingRemindersService";

// تذكير الاجتماع بالبريد قبل نصف ساعة: كل دقيقة على القائد فقط. الدورة لا ترمي.
export function startMeetingRemindersJob() {
  cron.schedule("* * * * *", async () => {
    await runMeetingRemindersTick();
  });
  console.log("[MeetingReminders] job started (every minute, leader only)");
}
