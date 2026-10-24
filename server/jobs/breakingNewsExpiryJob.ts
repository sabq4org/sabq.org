import cron from '../leaderCron';
import { expireStaleBreakingArticles } from '../services/breakingNewsService';

async function expireBreakingNews() {
  try {
    const { ar, en, ur } = await expireStaleBreakingArticles();
    const total = ar.length + en.length + ur.length;
    if (total > 0) {
      console.log(
        `[Breaking News Expiry] Demoted ${total} breaking article(s) to regular (ar=${ar.length}, en=${en.length}, ur=${ur.length})`,
      );
    }
  } catch (error) {
    console.error('[Breaking News Expiry] Job failed:', error);
  }
}

export function startBreakingNewsExpiryJob() {
  cron.schedule('*/5 * * * *', expireBreakingNews);
  console.log('[Breaking News Expiry] Job started (runs every 5 minutes, max age 3 hours)');
}
