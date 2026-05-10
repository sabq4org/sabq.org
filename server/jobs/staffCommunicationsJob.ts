import { staffCommunicationsService } from "../services/staffCommunications";

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

export function startStaffCommunicationsScheduler() {
  console.log("[StaffComm Scheduler] 🚀 Starting staff communications scheduler...");
  
  const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
  
  // Run initial check
  processScheduledCampaigns();
  
  // Start interval for periodic checks
  schedulerInterval = setInterval(async () => {
    await processScheduledCampaigns();
  }, CHECK_INTERVAL_MS);
  
  console.log("[StaffComm Scheduler] ✅ Scheduler started (checks every 10 minutes)");
}

export function stopStaffCommunicationsScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[StaffComm Scheduler] ⏹️ Scheduler stopped");
  }
}

async function processScheduledCampaigns() {
  try {
    const result = await staffCommunicationsService.processScheduledCampaigns();
    
    if (result.processed > 0) {
      console.log(`[StaffComm Scheduler] Processed ${result.processed} campaign(s): ${result.sent} emails sent, ${result.failed} failed`);
    }
  } catch (error) {
    console.error("[StaffComm Scheduler] Error processing scheduled campaigns:", error);
  }
}
