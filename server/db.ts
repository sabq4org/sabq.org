// Reference: javascript_database blueprint
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle, type NeonDatabase } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;
neonConfig.pipelineConnect = "password";
neonConfig.coalesceWrites = true;
neonConfig.useSecureWebSocket = true;

// Graceful database connection with error handling
let pool: Pool;
let db: NeonDatabase<typeof schema>;
let _dbConnected = false;
let _dbLastError: string | null = null;
let _reconnectTimer: ReturnType<typeof setInterval> | null = null;

function getDatabaseUrl(): string | undefined {
  return process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
}

function initPool(databaseUrl: string): void {
  const isExternalNeon = !!process.env.NEON_DATABASE_URL;
  console.log(`[DB] Initializing connection (${isExternalNeon ? 'External Neon' : 'Replit DB'})...`);
  
  pool = new Pool({ 
    connectionString: databaseUrl,
    max: 15,
    min: 0,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: true,
    maxUses: 5000,
  });
  
  pool.on('error', (err) => {
    console.error('[Pool] Unexpected client error:', err.message);
    _dbConnected = false;
    _dbLastError = err.message;
    startReconnectLoop();
  });

  db = drizzle({ client: pool, schema });
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
  try {
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_articles_published_status ON articles (published_at DESC) WHERE status = 'published'`);
    console.log('[DB] Published status index ensured');
  } catch (err: any) {
    console.warn('[DB] Published status index creation skipped:', err.message);
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
  console.log(`[DB] Pool config: max=15, min=0, idleTimeout=30s, connTimeout=10s, allowExitOnIdle=true (Safe: 15x3pods=45<80 Neon limit)`);
  
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

// Pool stats helper for debugging
export function getPoolStats() {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
}

export { pool, db };
