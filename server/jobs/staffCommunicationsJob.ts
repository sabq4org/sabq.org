import { staffCommunicationsService } from "../services/staffCommunications";

let schedulerTimeout: ReturnType<typeof setTimeout> | null = null;
let schedulerStarted = false;

// Campaign times are selected with minute precision in the UI. Align the
// worker to the wall-clock minute instead of starting a drifting 10-minute
// interval, which could deliver a 23:43 campaign as late as 23:53.
const MINUTE_MS = 60 * 1000;
const CLOCK_SETTLE_MS = 250;

function scheduleNextMinuteCheck() {
  if (!schedulerStarted) return;
  const now = Date.now();
  const delay = MINUTE_MS - (now % MINUTE_MS) + CLOCK_SETTLE_MS;
  schedulerTimeout = setTimeout(() => {
    // Schedule the following tick before processing. A large recipient list
    // must not delay the next campaign; atomic campaign claiming prevents a
    // second process/instance from sending the same campaign twice.
    scheduleNextMinuteCheck();
    void processScheduledCampaigns();
  }, delay);
}

export function startStaffCommunicationsScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  console.log("[StaffComm Scheduler] 🚀 Starting staff communications scheduler...");

  // Catch anything that became due while the service was restarting, then
  // continue at second 00 of every minute.
  void processScheduledCampaigns();
  scheduleNextMinuteCheck();

  console.log("[StaffComm Scheduler] ✅ Scheduler started (aligned to every wall-clock minute)");
}

export function stopStaffCommunicationsScheduler() {
  schedulerStarted = false;
  if (schedulerTimeout) {
    clearTimeout(schedulerTimeout);
    schedulerTimeout = null;
  }
  console.log("[StaffComm Scheduler] ⏹️ Scheduler stopped");
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
