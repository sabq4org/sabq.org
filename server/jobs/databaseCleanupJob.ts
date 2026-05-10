import cron from 'node-cron';
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

  await vacuumTables();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  log.info(`${LOG_PREFIX} Daily cleanup complete in ${elapsed}s`);
}

export function startDatabaseCleanupJob(): void {
  cron.schedule('0 3 * * *', async () => {
    await runDatabaseCleanup();
  });
  log.info(`${LOG_PREFIX} Scheduled daily cleanup at 3:00 AM (sessions, notifications 30d, email logs 30d, clicks 180d, activity/behavior 90d)`);
}

export { runDatabaseCleanup, cleanupExpiredSessions };
