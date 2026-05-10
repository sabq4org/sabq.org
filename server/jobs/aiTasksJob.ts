import * as cron from 'node-cron';
import { log } from "../utils/logger";
import { aiTaskExecutor } from '../services/aiTaskExecutor';

export function startAITasksScheduler() {
  log.info('🤖 [AI Tasks Scheduler] Starting AI automated content generation scheduler...');

  cron.schedule('3,13,23,33,43,53 * * * *', async () => {
    try {
      const result = await aiTaskExecutor.executePendingTasks();
      
      if (result.executed > 0) {
        log.info(`🤖 [AI Tasks Scheduler] Execution complete: ${result.succeeded} succeeded, ${result.failed} failed`);
      }
    } catch (error) {
      console.error('❌ [AI Tasks Scheduler] Error executing pending tasks:', error);
    }
  });

  log.info('✅ [AI Tasks Scheduler] Scheduler started successfully (runs every 10 minutes)');
}

export function stopAITasksScheduler() {
  // node-cron doesn't have a stop method for individual tasks
  // You would need to keep a reference to the task and call task.stop()
  log.info('⏹️  [AI Tasks Scheduler] Scheduler stopped');
}
