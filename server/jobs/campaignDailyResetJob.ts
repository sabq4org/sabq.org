/**
 * Campaign Daily Reset Job
 * يعيد تعيين عداد الظهورات اليومية للحملات الإعلانية عند منتصف الليل
 */

import cron from "node-cron";
import { db } from "../db";
import { campaigns } from "@shared/schema";
import { eq, and, gt } from "drizzle-orm";

let isResetting = false;

/**
 * إعادة تعيين عداد الظهورات اليومية لجميع الحملات النشطة
 */
export async function resetDailyImpressionsBudget() {
  if (isResetting) {
    console.log('[Campaign Daily Reset] ⏭️ Skipping - already resetting');
    return;
  }
  
  isResetting = true;
  try {
    console.log('[Campaign Daily Reset] 🔄 Starting daily reset...');
    
    const now = new Date();
    
    // Reset spentToday to 0 for all campaigns where spentToday > 0
    const result = await db
      .update(campaigns)
      .set({
        spentToday: 0,
        lastResetDate: now,
        updatedAt: now,
      })
      .where(gt(campaigns.spentToday, 0));
    
    console.log('[Campaign Daily Reset] ✅ Daily impressions reset complete', {
      timestamp: now.toISOString(),
      affectedCampaigns: result.rowCount || 0,
    });
  } catch (error) {
    console.error('[Campaign Daily Reset] ❌ Error resetting daily impressions:', error);
  } finally {
    isResetting = false;
  }
}

/**
 * تشغيل job عند منتصف الليل كل يوم (00:00)
 * Start job that runs at midnight every day (00:00)
 */
export function startCampaignDailyResetJob() {
  // Run at midnight every day (00:00)
  // Cron pattern: "minute hour day month weekday"
  // "0 0 * * *" = at 00:00 (midnight) every day
  const job = cron.schedule("0 0 * * *", async () => {
    await resetDailyImpressionsBudget();
  });

  console.log('[Campaign Daily Reset Job] ⏰ Job scheduled (every day at midnight)');

  return job;
}
