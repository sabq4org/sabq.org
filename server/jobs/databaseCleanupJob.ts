import cron from '../leaderCron';
import { log } from "../utils/logger";
import { db, pool } from '../db';
import { sql } from 'drizzle-orm';

const LOG_PREFIX = '[DB Cleanup]';

async function cleanupExpiredSessions(): Promise<number> {
  try {
    const result = await db.execute(sql`
      DELETE FROM sessions WHERE expire < NOW()
    `);
    return result.rowCount || 0;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to cleanup expired sessions:`, error);
    return 0;
  }
}

async function batchDelete(
  table: string,
  dateColumn: string,
  interval: string,
  batchSize = 10000
): Promise<number> {
  let totalDeleted = 0;
  let batchDeleted = 0;
  const maxIterations = 200;
  let iteration = 0;
  do {
    try {
      const result = await db.execute(
        sql.raw(`
          DELETE FROM ${table}
          WHERE ctid IN (
            SELECT ctid FROM ${table}
            WHERE ${dateColumn} < NOW() - INTERVAL '${interval}'
            LIMIT ${batchSize}
          )
        `)
      );
      batchDeleted = result.rowCount || 0;
      totalDeleted += batchDeleted;
      iteration++;
    } catch (error) {
      console.error(`${LOG_PREFIX} Batch delete error on ${table}:`, error);
      break;
    }
  } while (batchDeleted > 0 && iteration < maxIterations);
  return totalDeleted;
}

async function vacuumTables(): Promise<void> {
  const tables = [
    'sessions',
    'notifications_inbox',
    'email_webhook_logs',
    'short_link_clicks',
    'activity_logs',
    'behavior_logs',
    'article_ip_views',
  ];
  const client = await pool.connect();
  try {
    for (const table of tables) {
      try {
        await client.query(`VACUUM ANALYZE ${table}`);
      } catch (err) {
        console.error(`${LOG_PREFIX} VACUUM failed for ${table}:`, err);
      }
    }
    log.info(`${LOG_PREFIX} VACUUM ANALYZE completed for ${tables.length} tables`);
  } finally {
    client.release();
  }
}

async function runDatabaseCleanup(): Promise<void> {
  const start = Date.now();
  log.info(`${LOG_PREFIX} Starting daily database cleanup...`);

  const sessionsDeleted = await cleanupExpiredSessions();
  log.info(`${LOG_PREFIX} Expired sessions: ${sessionsDeleted} deleted`);

  const notificationsDeleted = await batchDelete('notifications_inbox', 'created_at', '30 days');
  log.info(`${LOG_PREFIX} Old notifications (>30d): ${notificationsDeleted} deleted`);

  const emailLogsDeleted = await batchDelete('email_webhook_logs', 'received_at', '30 days');
  log.info(`${LOG_PREFIX} Old email webhook logs (>30d): ${emailLogsDeleted} deleted`);

  const clicksDeleted = await batchDelete('short_link_clicks', 'clicked_at', '180 days');
  log.info(`${LOG_PREFIX} Old short link clicks (>180d): ${clicksDeleted} deleted`);

  const activityDeleted = await batchDelete('activity_logs', 'created_at', '90 days');
  log.info(`${LOG_PREFIX} Old activity logs (>90d): ${activityDeleted} deleted`);

  const behaviorDeleted = await batchDelete('behavior_logs', 'created_at', '90 days');
  log.info(`${LOG_PREFIX} Old behavior logs (>90d): ${behaviorDeleted} deleted`);

  // عدّادات المشاهدة لكل IP تخدم منع التلاعب قصير الأمد فقط — صف لم يُرَ منذ
  // 90 يومًا لا قيمة له، وبدون هذا البند كان الجدول ينمو بلا حد (1.9GB في
  // 40 يومًا وقت تدقيق 2026-07-25).
  const ipViewsDeleted = await batchDelete('article_ip_views', 'last_seen', '90 days');
  log.info(`${LOG_PREFIX} Old article IP views (>90d): ${ipViewsDeleted} deleted`);

  // سقف زمني لإحصاءات المقالات اليومية — المستهلكون يقرؤون 30-365 يومًا فقط.
  const dailyStatsDeleted = await batchDelete('article_daily_stats', 'date', '400 days');
  log.info(`${LOG_PREFIX} Old article daily stats (>400d): ${dailyStatsDeleted} deleted`);

  // رموز التحقق/الاستعادة لم تكن تُنظَّف إطلاقًا فتراكمت بلا حد (F-14) — احذف
  // المنتهية منذ أكثر من يوم (صلاحيتها 24س/30د أصلًا). وجلسات الموبايل
  // المنتهية منذ أكثر من 7 أيام (نافذة تدقيق قصيرة).
  const evTokensDeleted = await batchDelete('email_verification_tokens', 'expires_at', '1 day');
  log.info(`${LOG_PREFIX} Expired email verification tokens (>1d): ${evTokensDeleted} deleted`);

  const prTokensDeleted = await batchDelete('password_reset_tokens', 'expires_at', '1 day');
  log.info(`${LOG_PREFIX} Expired password reset tokens (>1d): ${prTokensDeleted} deleted`);

  const memberSessionsDeleted = await batchDelete('app_member_sessions', 'expires_at', '7 days');
  log.info(`${LOG_PREFIX} Expired mobile sessions (>7d): ${memberSessionsDeleted} deleted`);

  await vacuumTables();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  log.info(`${LOG_PREFIX} Daily cleanup complete in ${elapsed}s`);
}

export function startDatabaseCleanupJob(): void {
  cron.schedule('0 3 * * *', async () => {
    await runDatabaseCleanup();
  });
  log.info(`${LOG_PREFIX} Scheduled daily cleanup at 3:00 AM (sessions, notifications 30d, email logs 30d, clicks 180d, activity/behavior 90d, ip-views 90d, daily-stats 400d, auth tokens 1d, mobile sessions 7d)`);
}

export { runDatabaseCleanup, cleanupExpiredSessions };
