// Reference: javascript_database blueprint
//
// Database driver is selected at boot via the DB_DRIVER env var:
//   - "neon" (default, Replit-safe): @neondatabase/serverless over Neon's
//     wsproxy WebSocket. Required by Replit's bundled DB and any Neon-hosted
//     PG. Will hang against non-Neon PostgreSQL because the WebSocket
//     endpoint doesn't exist — use "pg" for those cases.
//   - "pg": standard node-postgres TCP. Works against any PostgreSQL
//     including Railway PG, AWS RDS, self-hosted, etc.
//
// Both drivers expose the same surface (pool.query, drizzle queries) so the
// rest of the codebase doesn't need to know which one is active.
import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { drizzle as drizzleNeon, type NeonDatabase } from 'drizzle-orm/neon-serverless';
import { Pool as PgPool } from 'pg';
import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import ws from "ws";
import { sql } from "drizzle-orm";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;
neonConfig.pipelineConnect = "password";
neonConfig.coalesceWrites = true;
neonConfig.useSecureWebSocket = true;

const DB_DRIVER = (process.env.DB_DRIVER || 'neon').toLowerCase();

// Graceful database connection with error handling. Pool/db typed as any so
// the same module can hold either NeonPool/NeonDatabase or PgPool/NodePgDatabase
// without leaking driver-specific types to consumers (Drizzle's query API is
// identical for both).
let pool: any;
let db: NeonDatabase<typeof schema> | NodePgDatabase<typeof schema>;
let _dbConnected = false;
let _dbLastError: string | null = null;
let _reconnectTimer: ReturnType<typeof setInterval> | null = null;

function getDatabaseUrl(): string | undefined {
  return process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
}

function initPool(databaseUrl: string): void {
  const poolConfig = {
    connectionString: databaseUrl,
    max: 15,
    min: 0,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: true,
    maxUses: 5000,
  };

  if (DB_DRIVER === 'pg') {
    console.log('[DB] Initializing connection (Standard PG via node-postgres) — Railway / generic PostgreSQL...');
    pool = new PgPool(poolConfig);
    pool.on('error', (err: any) => {
      console.error('[Pool] Unexpected client error:', err.message);
      _dbConnected = false;
      _dbLastError = err.message;
      startReconnectLoop();
    });
    db = drizzlePg(pool, { schema });
  } else {
    const isExternalNeon = !!process.env.NEON_DATABASE_URL;
    console.log(`[DB] Initializing connection (${isExternalNeon ? 'External Neon' : 'Replit DB'} via @neondatabase/serverless)...`);
    pool = new NeonPool(poolConfig);
    pool.on('error', (err: any) => {
      console.error('[Pool] Unexpected client error:', err.message);
      _dbConnected = false;
      _dbLastError = err.message;
      startReconnectLoop();
    });
    db = drizzleNeon({ client: pool, schema });
  }
}

async function verifyConnection(): Promise<boolean> {
  try {
    if (!pool) return false;
    const start = Date.now();
    await pool.query('SELECT 1');
    const elapsed = Date.now() - start;
    _dbConnected = true;
    _dbLastError = null;
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DB] Connection verified (${elapsed}ms)`);
    }
    return true;
  } catch (error: any) {
    _dbConnected = false;
    _dbLastError = error.message || 'Unknown error';
    console.error(`[DB] Connection verification failed: ${_dbLastError}`);
    return false;
  }
}

let _dbMaintenanceDone = false;

async function runStartupMaintenance(): Promise<void> {
  if (_dbMaintenanceDone) return;
  _dbMaintenanceDone = true;
  if (process.env.SKIP_DB_MAINTENANCE === 'true') {
    console.log('[DB] Startup maintenance skipped (SKIP_DB_MAINTENANCE=true) — read-only mode for safety');
    return;
  }
  try {
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_articles_homepage_order ON articles (status, hide_from_homepage, display_order DESC, published_at DESC)`);
    console.log('[DB] Homepage order index ensured');
  } catch (err: any) {
    console.warn('[DB] Homepage order index creation skipped:', err.message);
  }
  try {
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_articles_breaking ON articles (status, hide_from_homepage, news_type, published_at DESC)`);
    console.log('[DB] Breaking news index ensured');
  } catch (err: any) {
    console.warn('[DB] Breaking news index creation skipped:', err.message);
  }
  try {
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_articles_paginated ON articles (status, hide_from_homepage, published_at DESC) WHERE (article_type IS NULL OR article_type != 'opinion') AND (source IS NULL OR source != 'ai')`);
    console.log('[DB] Paginated news index ensured');
  } catch (err: any) {
    console.warn('[DB] Paginated news index creation skipped:', err.message);
  }
  try {
    await pool.query(`SET statement_timeout = '15s'`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_articles_search_vector ON articles USING gin(search_vector) WHERE status = 'published'`);
    console.log('[DB] Search GIN index ensured');
  } catch (err: any) {
    console.warn('[DB] Search GIN index creation skipped:', err.message);
  } finally {
    try { await pool.query(`SET statement_timeout = '0'`); } catch {}
  }
  // Trigram index backing the /api/search title fallback (lower(title) LIKE
  // '%q%'). Without it, numeric/no-FTS-match queries (e.g. "4220449") force a
  // full seq scan and hit the 3s timeout. gin_trgm_ops serves leading-wildcard
  // ILIKE. Built on lower(title) to match the query's lower(a.title) predicate.
  try {
    await pool.query(`SET statement_timeout = '20s'`);
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_articles_title_trgm ON articles USING gin(lower(title) gin_trgm_ops) WHERE status = 'published'`);
    console.log('[DB] Title trigram index ensured');
  } catch (err: any) {
    console.warn('[DB] Title trigram index creation skipped:', err.message);
  } finally {
    try { await pool.query(`SET statement_timeout = '0'`); } catch {}
  }
  try {
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_articles_published_status ON articles (published_at DESC) WHERE status = 'published'`);
    console.log('[DB] Published status index ensured');
  } catch (err: any) {
    console.warn('[DB] Published status index creation skipped:', err.message);
  }
  // GIN index backing the /api/keyword/:kw SEO-keywords fallback. The exact-match
  // fast path queries (seo -> 'keywords') @> to_jsonb('kw'); jsonb_path_ops is the
  // smallest opclass that serves @> containment. Without it that fallback runs a
  // full jsonb_array_elements_text scan over every published article (~3.5s).
  try {
    await pool.query(`SET statement_timeout = '20s'`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_articles_seo_keywords_gin ON articles USING gin((seo -> 'keywords') jsonb_path_ops) WHERE status = 'published'`);
    console.log('[DB] SEO keywords GIN index ensured');
  } catch (err: any) {
    console.warn('[DB] SEO keywords GIN index creation skipped:', err.message);
  } finally {
    try { await pool.query(`SET statement_timeout = '0'`); } catch {}
  }
  try {
    await pool.query(`
      DELETE FROM reading_history 
      WHERE id NOT IN (
        SELECT DISTINCT ON (user_id, article_id) id 
        FROM reading_history 
        ORDER BY user_id, article_id, read_at DESC
      )
    `);
    console.log('[DB] Reading history duplicates cleaned');
  } catch (err: any) {
    console.warn('[DB] Reading history dedup skipped:', err.message);
  }
  setTimeout(async () => {
    try {
      await pool.query('ANALYZE articles');
      console.log('[DB] ANALYZE articles completed - query planner stats updated');
    } catch (err: any) {
      console.warn('[DB] ANALYZE articles skipped:', err.message);
    }
  }, 30000);
  // VACUUM to remove dead tuples from bulk search_vector UPDATE (runs once after 2 min)
  setTimeout(async () => {
    try {
      await pool.query('VACUUM articles');
      console.log('[DB] VACUUM articles completed - dead tuples removed');
    } catch (err: any) {
      console.warn('[DB] VACUUM articles skipped:', err.message);
    }
  }, 120000);
}

function startReconnectLoop(): void {
  if (_reconnectTimer) return;
  
  console.warn('[DB] Starting reconnection loop (every 10s)...');
  _reconnectTimer = setInterval(async () => {
    console.log('[DB] Attempting reconnection...');
    
    try {
      const connected = await verifyConnection();
      if (connected) {
        console.log('[DB] Reconnection successful');
        stopReconnectLoop();
        runStartupMaintenance();
      }
    } catch (error: any) {
      console.error(`[DB] Reconnection attempt failed: ${error.message}`);
    }
  }, 10000);
  _reconnectTimer.unref();
}

function stopReconnectLoop(): void {
  if (_reconnectTimer) {
    clearInterval(_reconnectTimer);
    _reconnectTimer = null;
    console.log('[DB] Reconnection loop stopped');
  }
}

try {
  const databaseUrl = getDatabaseUrl();
  
  if (!databaseUrl) {
    console.error("[DB] No database URL configured. Database features will be unavailable.");
    console.error("Please set NEON_DATABASE_URL (external) or DATABASE_URL in your deployment settings.");
    throw new Error("Database URL must be set. Did you forget to provision a database?");
  }

  initPool(databaseUrl);
  
  console.log("[DB] Pool initialized");
  console.log(`[DB] Pool config: max=15, min=0, idleTimeout=30s, connTimeout=10s, allowExitOnIdle=true (driver=${DB_DRIVER})`);
  
  const monitorInterval = process.env.NODE_ENV === 'production' ? 300000 : 60000;
  const monitorTimer = setInterval(() => {
    const stats = {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    };
    
    if (stats.waiting > 0 || stats.idle === 0) {
      console.warn(`[Pool Monitor] Connections: total=${stats.total}, idle=${stats.idle}, waiting=${stats.waiting}`);
    } else if (process.env.NODE_ENV !== 'production') {
      console.log(`[Pool Monitor] Connections: total=${stats.total}, idle=${stats.idle}, waiting=${stats.waiting}`);
    }
  }, monitorInterval);
  monitorTimer.unref();
  
  console.log('[DB] Keep-alive disabled to allow Neon auto-suspend (cost optimization)');
  
  verifyConnection().then(async (connected) => {
    if (!connected) {
      startReconnectLoop();
    } else {
      runStartupMaintenance();
    }
  });
  
} catch (error: any) {
  console.error("[DB] Initialization error:", error.message);
  console.error("Please set NEON_DATABASE_URL or DATABASE_URL and restart.");
  
  if (process.env.NODE_ENV === 'production') {
    console.error("[PRODUCTION] Server will start without DB to serve static pages. API calls will return 503.");
    startReconnectLoop();
  } else {
    console.error("[DEV] Server cannot start without a valid database connection.");
    throw error;
  }
}

export function isDatabaseAvailable(): boolean {
  return pool !== undefined && db !== undefined && _dbConnected;
}

export function getDatabaseStatus(): { connected: boolean; lastError: string | null; reconnecting: boolean } {
  return {
    connected: _dbConnected,
    lastError: _dbLastError,
    reconnecting: _reconnectTimer !== null,
  };
}

// Slow query threshold in milliseconds
const SLOW_QUERY_THRESHOLD = 500;

// Helper function to wrap queries with timing and logging
export async function timedQuery<T>(
  queryName: string,
  queryFn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await queryFn();
    const elapsed = Date.now() - start;
    
    if (elapsed > SLOW_QUERY_THRESHOLD) {
      console.warn(`🐢 [Slow Query] ${queryName}: ${elapsed}ms (threshold: ${SLOW_QUERY_THRESHOLD}ms)`);
    } else if (process.env.NODE_ENV !== 'production' && elapsed > 100) {
      console.log(`⏱️ [Query] ${queryName}: ${elapsed}ms`);
    }
    
    return result;
  } catch (error) {
    const elapsed = Date.now() - start;
    console.error(`❌ [Query Error] ${queryName}: ${elapsed}ms`, error);
    throw error;
  }
}

// Run a read query bounded by a real Postgres statement_timeout so a slow query
// is CANCELLED server-side (releasing its pool connection) rather than lingering.
// The JS-side Promise.race some callers use only abandons the JS promise — the
// underlying DB query keeps running and holds one of the 15 pool connections
// until it finishes on its own. Under load that starves the pool and stalls
// unrelated light writes (e.g. POST /view). Wrapping the query in a short
// transaction with SET LOCAL statement_timeout makes PG abort it on time.
export async function executeWithStatementTimeout<T = any>(
  query: any,
  timeoutMs: number,
): Promise<T> {
  const ms = Math.max(100, Math.floor(timeoutMs));
  return (db as any).transaction(async (tx: any) => {
    await tx.execute(sql.raw(`SET LOCAL statement_timeout = ${ms}`));
    return (await tx.execute(query)) as T;
  });
}

// Pool stats helper for debugging
export function getPoolStats() {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
}

export { pool, db };
