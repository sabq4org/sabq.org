/**
 * Native Ads Daily Budget Reset Job
 * يعيد تعيين حالة استنفاذ الميزانية اليومية للإعلانات عند منتصف الليل بتوقيت السعودية
 */

import cron from "node-cron";
import { db } from "../db";
import { nativeAds, nativeAdDailySpend } from "@shared/schema";
import { isNotNull, eq, and, sql, lt } from "drizzle-orm";

let isResetting = false;

/**
 * إعادة تعيين حالة استنفاذ الميزانية اليومية لجميع الإعلانات
 * Reset daily budget exhaustion status for all native ads
 */
export async function resetNativeAdsDailyBudget() {
  if (isResetting) {
    console.log('[NativeAds Daily Reset] ⏭️ Skipping - already resetting');
    return;
  }
  
  isResetting = true;
  try {
    console.log('[NativeAds Daily Reset] 🔄 Starting daily budget reset...');
    
    const now = new Date();
    
    // Get today's date in Saudi Arabia timezone (UTC+3)
    const saudiOffset = 3 * 60 * 60 * 1000;
    const saudiTime = new Date(now.getTime() + saudiOffset);
    const today = saudiTime.toISOString().split('T')[0];
    
    // Reset dailyBudgetExhaustedAt on all ads that had budget exhausted
    const adsResult = await db
      .update(nativeAds)
      .set({
        dailyBudgetExhaustedAt: null,
        updatedAt: now,
      })
      .where(isNotNull(nativeAds.dailyBudgetExhaustedAt));
    
    // Reset capped status for records from previous days (before today)
    // spendDate is stored as 'YYYY-MM-DD' text, so string comparison works for dates
    // We only reset isCapped, not the spend counters - those are historical data for reporting
    const spendResult = await db
      .update(nativeAdDailySpend)
      .set({ 
        isCapped: false,
        updatedAt: now 
      })
      .where(and(
        eq(nativeAdDailySpend.isCapped, true),
        lt(nativeAdDailySpend.spendDate, today)
      ));
    
    console.log('[NativeAds Daily Reset] ✅ Daily budget reset complete', {
      timestamp: now.toISOString(),
      saudiDate: today,
      adsReset: adsResult.rowCount || 0,
      spendRecordsReset: spendResult.rowCount || 0,
    });
  } catch (error) {
    console.error('[NativeAds Daily Reset] ❌ Error resetting daily budget:', error);
  } finally {
    isResetting = false;
  }
}

/**
 * تشغيل job عند منتصف الليل بتوقيت السعودية كل يوم
 * Start job that runs at midnight Saudi time every day (21:00 UTC = 00:00 UTC+3)
 */
export function startNativeAdsDailyResetJob() {
  // Run at 21:00 UTC which is 00:00 Saudi time (UTC+3)
  // Cron pattern: "minute hour day month weekday"
  const job = cron.schedule("0 21 * * *", async () => {
    await resetNativeAdsDailyBudget();
  });

  console.log('[NativeAds Daily Reset Job] ⏰ Job scheduled (every day at midnight Saudi time)');

  return job;
}
