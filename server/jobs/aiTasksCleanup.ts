import cron from 'node-cron';
import { log } from "../utils/logger";
import { storage } from '../storage';
import { db } from '../db';
import { aiScheduledTasks } from '../../shared/schema';
import { eq } from 'drizzle-orm';

/**
 * Cleanup Job: Reset stuck AI tasks from "processing" to "failed"
 * 
 * Tasks can get stuck in "processing" if:
 * - Server crashes mid-execution
 * - Database update fails
 * - Worker process killed
 * 
 * This job runs every 5 minutes and marks tasks that have been 
 * in "processing" state for more than 10 minutes as "failed".
 */

const PROCESSING_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

async function cleanupStuckTasks() {
  try {
    log.info('[AI Tasks Cleanup] Checking for stuck tasks...');
    
    const stuckTasks = await db
      .select()
      .from(aiScheduledTasks)
      .where(eq(aiScheduledTasks.status, 'processing'));
    
    if (stuckTasks.length === 0) {
      return;
    }

    const now = Date.now();
    let resetCount = 0;

    for (const task of stuckTasks) {
      // Skip tasks with invalid updatedAt (race condition edge case)
      if (!task.updatedAt) {
        console.warn(`[AI Tasks Cleanup] Task ${task.id} has null updatedAt, skipping`);
        continue;
      }

      const updatedAt = new Date(task.updatedAt).getTime();
      
      // Skip if updatedAt is invalid (NaN)
      if (isNaN(updatedAt)) {
        console.warn(`[AI Tasks Cleanup] Task ${task.id} has invalid updatedAt: ${task.updatedAt}, skipping`);
        continue;
      }

      const elapsed = now - updatedAt;

      if (elapsed > PROCESSING_TIMEOUT_MS) {
        log.info(`[AI Tasks Cleanup] Marking stuck task ${task.id} as failed (stuck for ${Math.round(elapsed / 1000)}s)`);
        
        await storage.updateAiTaskExecution(task.id, {
          status: 'failed',
          errorMessage: `Task was stuck in processing state for ${Math.round(elapsed / 60000)} minutes and was automatically failed by cleanup job.`,
        });
        
        resetCount++;
      }
    }

    if (resetCount > 0) {
      log.info(`[AI Tasks Cleanup] Marked ${resetCount} stuck task(s) as failed`);
    }
  } catch (error) {
    console.error('[AI Tasks Cleanup] Cleanup job failed:', error);
  }
}

// Run cleanup every 15 minutes
export function startAiTasksCleanupJob() {
  cron.schedule('*/15 * * * *', cleanupStuckTasks);
  log.info('✅ [AI Tasks Cleanup] Cleanup job started (runs every 15 minutes)');
}
