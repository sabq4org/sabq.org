import cron from "../leaderCron";
import { pruneStaffActivity } from "../services/contentDuty/dutyMetricsService";

// «غرفة المناوبة»: دقائق النشاط تُحفظ 90 يومًا فقط.
export function startStaffActivityCleanupJob() {
  cron.schedule("40 3 * * *", async () => {
    try {
      await pruneStaffActivity(90);
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code !== "42P01") console.error("[ContentDuty] activity cleanup failed");
    }
  });
}
