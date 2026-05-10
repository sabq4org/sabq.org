import cron from 'node-cron';
import { db } from '../db';
import { articleEditLocks } from '../../shared/schema';
import { lt } from 'drizzle-orm';

async function cleanupExpiredLocks() {
  try {
    const now = new Date();
    
    const result = await db
      .delete(articleEditLocks)
      .where(lt(articleEditLocks.expiresAt, now))
      .returning({ articleId: articleEditLocks.articleId });
    
    if (result.length > 0) {
      console.log(`[Article Edit Locks Cleanup] Removed ${result.length} expired lock(s)`);
    }
  } catch (error) {
    console.error('[Article Edit Locks Cleanup] Cleanup job failed:', error);
  }
}

export function startArticleEditLocksCleanupJob() {
  cron.schedule('*/30 * * * *', cleanupExpiredLocks);
  console.log('[Article Edit Locks Cleanup] Cleanup job started (runs every 30 minutes)');
}
