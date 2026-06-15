import memoizee from 'memoizee';
import type { Response } from 'express';
import Redis from 'ioredis';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export interface SseBroadcastPayload {
  type: string;
  patterns?: string[];
  [key: string]: unknown;
}

// ---- Redis pub/sub bridge for cross-pod SSE broadcasts ----
// Every pod that calls `sseConnectionManager.broadcast(...)` publishes the
// payload here so other pods can: (a) write to their own connected SSE
// clients, and (b) bump their local cache-invalidation polling timestamp.
const SSE_BROADCAST_CHANNEL = 'sse-broadcast:invalidate';
const SSE_BROADCAST_POD_ID = `${process.pid}-${Date.now()}-${Math.random()
  .toString(36)
  .slice(2, 7)}`;

let _sseBroadcastPub: Redis | null = null;
let _sseBroadcastSub: Redis | null = null;
let _sseBroadcastPubReady = false;

// SSE Connection Manager for cache invalidation broadcasts
// Enhanced with heartbeat timeout to clean up stale connections
class SSEConnectionManager {
  private connections: Map<Response, { lastActivity: number; userId?: string }> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private broadcastListeners: Set<(data: SseBroadcastPayload, fromRemotePod: boolean) => void> = new Set();
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private readonly CONNECTION_TIMEOUT = 120000; // 2 minutes - connections without activity are pruned
  private readonly MAX_CONNECTIONS_PER_USER = 3; // Limit SSE connections per user

  constructor() {
    this.startHeartbeat();
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      let prunedCount = 0;
      
      for (const [res, meta] of Array.from(this.connections.entries())) {
        // Prune stale connections
        if (now - meta.lastActivity > this.CONNECTION_TIMEOUT) {
          try {
            res.end();
          } catch (e) {
            // Connection already closed
          }
          this.connections.delete(res);
          prunedCount++;
          continue;
        }
        
        // Send heartbeat to active connections and refresh activity timestamp
        try {
          res.write(`:heartbeat\n\n`);
          // Refresh activity on successful heartbeat
          meta.lastActivity = now;
        } catch (e) {
          // Connection is dead, remove it
          this.connections.delete(res);
          prunedCount++;
        }
      }
      
      if (prunedCount > 0) {
        console.log(`[SSE] Pruned ${prunedCount} stale connections (active: ${this.connections.size})`);
      }
    }, this.HEARTBEAT_INTERVAL);
    
    this.heartbeatInterval.unref();
  }

  addConnection(res: Response, userId?: string): boolean {
    if (this.connections.size + _externalSseCount >= MAX_TOTAL_SSE) {
      console.log(`[SSE] Global SSE limit reached (${MAX_TOTAL_SSE}), rejecting new connection`);
      return false;
    }

    if (userId) {
      const userConnections = Array.from(this.connections.entries())
        .filter(([_, meta]) => meta.userId === userId);
      
      if (userConnections.length >= this.MAX_CONNECTIONS_PER_USER) {
        const oldest = userConnections.sort((a, b) => a[1].lastActivity - b[1].lastActivity)[0];
        if (oldest) {
          try {
            oldest[0].end();
          } catch (e) {}
          this.connections.delete(oldest[0]);
          console.log(`[SSE] Closed oldest connection for user ${userId} (max reached)`);
        }
      }
    }
    
    this.connections.set(res, { lastActivity: Date.now(), userId });
    console.log(`[SSE] Client connected (total: ${this.connections.size})`);
    return true;
  }

  removeConnection(res: Response): void {
    this.connections.delete(res);
    console.log(`[SSE] Client disconnected (total: ${this.connections.size})`);
  }

  // Update activity timestamp when client sends data or heartbeat response
  updateActivity(res: Response): void {
    const meta = this.connections.get(res);
    if (meta) {
      meta.lastActivity = Date.now();
    }
  }

  /**
   * Broadcast a payload to every locally-connected SSE client AND publish it
   * to Redis so other pods relay it to their own clients. Safe to call from
   * any code path — pub/sub failures are swallowed so callers don't have to
   * special-case the no-Redis development environment.
   */
  broadcast(data: SseBroadcastPayload): void {
    this._deliverLocally(data, false);
    this._publishToRedis(data);
  }

  /**
   * Subscribe to every broadcast (local OR cross-pod). Used by the cache
   * invalidation polling endpoint to bump its `lastUpdate` timestamp.
   * Returns an unsubscribe function.
   */
  onBroadcast(handler: (data: SseBroadcastPayload, fromRemotePod: boolean) => void): () => void {
    this.broadcastListeners.add(handler);
    return () => {
      this.broadcastListeners.delete(handler);
    };
  }

  /** @internal — used by the Redis subscriber when a remote pod broadcasts. */
  _deliverLocally(data: SseBroadcastPayload, fromRemotePod: boolean): void {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    for (const [res] of Array.from(this.connections.entries())) {
      try {
        res.write(message);
      } catch (e) {
        // Connection might be closed
        this.connections.delete(res);
      }
    }
    for (const handler of Array.from(this.broadcastListeners)) {
      try {
        handler(data, fromRemotePod);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[SSE] broadcast listener error:', msg);
      }
    }
  }

  private _publishToRedis(data: SseBroadcastPayload): void {
    if (!_sseBroadcastPub || !_sseBroadcastPubReady) return;
    try {
      _sseBroadcastPub
        .publish(
          SSE_BROADCAST_CHANNEL,
          JSON.stringify({ podId: SSE_BROADCAST_POD_ID, data }),
        )
        .catch(() => {});
    } catch {
      // ignore — publishing is best-effort
    }
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  destroy(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    for (const [res] of Array.from(this.connections.entries())) {
      try {
        res.end();
      } catch (e) {}
    }
    this.connections.clear();
  }
}

export const sseConnectionManager = new SSEConnectionManager();

// Initialise the cross-pod publisher/subscriber once the manager exists so the
// subscriber callback can call back into it. Mirrors the editorPresence /
// contentInvalidation pattern: separate connections, self-echo guard via
// SSE_BROADCAST_POD_ID, best-effort with REDIS_URL absent.
(function initSseBroadcastPubSub() {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn(
      '[SSE Broadcast] REDIS_URL not set — running in single-pod mode (broadcasts will not cross instances)',
    );
    return;
  }
  try {
    const opts = {
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        if (times > 5) return null;
        return Math.min(times * 200, 2000);
      },
      enableReadyCheck: false,
      connectTimeout: 5000,
      lazyConnect: false,
    };
    _sseBroadcastPub = new Redis(url, opts);
    _sseBroadcastSub = new Redis(url, opts);

    _sseBroadcastPub.on('error', (err) => {
      console.error('[SSE Broadcast] pub redis error:', err.message);
    });
    _sseBroadcastSub.on('error', (err) => {
      console.error('[SSE Broadcast] sub redis error:', err.message);
    });

    _sseBroadcastPub.on('ready', () => {
      _sseBroadcastPubReady = true;
    });

    _sseBroadcastSub.on('ready', () => {
      _sseBroadcastSub?.subscribe(SSE_BROADCAST_CHANNEL, (err) => {
        if (err) {
          console.error('[SSE Broadcast] subscribe failed:', err.message);
          return;
        }
        console.log(
          '[SSE Broadcast] ✅ Redis pub/sub ready (pod:',
          SSE_BROADCAST_POD_ID,
          ')',
        );
      });
    });

    _sseBroadcastSub.on('message', (channel, raw) => {
      if (channel !== SSE_BROADCAST_CHANNEL) return;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!isSseBroadcastEnvelope(parsed)) return;
        if (parsed.podId === SSE_BROADCAST_POD_ID) return; // ignore our own echoes
        sseConnectionManager._deliverLocally(parsed.data, true);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[SSE Broadcast] pubsub msg parse error:', msg);
      }
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[SSE Broadcast] pub/sub init failed:', msg);
    _sseBroadcastPub = null;
    _sseBroadcastSub = null;
  }
})();

interface SseBroadcastEnvelope {
  podId: string;
  data: SseBroadcastPayload;
}

function isSseBroadcastEnvelope(value: unknown): value is SseBroadcastEnvelope {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.podId !== 'string') return false;
  const data = v.data;
  if (!data || typeof data !== 'object') return false;
  if (typeof (data as Record<string, unknown>).type !== 'string') return false;
  return true;
}

let _externalSseCount = 0;
const MAX_TOTAL_SSE = 200;

export function canAcceptExternalSse(): boolean {
  const total = sseConnectionManager.getConnectionCount() + _externalSseCount;
  return total < MAX_TOTAL_SSE;
}

export function trackExternalSse(delta: 1 | -1): void {
  _externalSseCount = Math.max(0, _externalSseCount + delta);
}

export function getTotalSseCount(): number {
  return sseConnectionManager.getConnectionCount() + _externalSseCount;
}

export class MemoryCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly maxEntries: number;
  private readonly name: string;
  private lastEvictionLogAt = 0;

  constructor(maxEntries: number = 5000, name: string = 'memoryCache') {
    this.maxEntries = maxEntries;
    this.name = name;
    this.startCleanup();
  }

  private startCleanup() {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const entries = Array.from(this.cache.entries());
      for (const [key, entry] of entries) {
        if (now - entry.timestamp > entry.ttl) {
          this.cache.delete(key);
        }
      }
    }, 60000);
    // Never keep the process alive just for cache cleanup (also lets
    // test runners exit cleanly).
    this.cleanupInterval.unref?.();
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs: number = 60000): void {
    if (!this.cache.has(key) && this.cache.size >= this.maxEntries) {
      this.evictForSpace();
    }
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    });
  }

  // Audit M1.1 (2026-06-10): the cache previously grew without bound — a
  // flood of unique keys inside one TTL window (e.g. per-slug or per-query
  // cache keys under crawler traffic) could OOM the pod. This is a safety
  // valve, not an LRU: expired entries go first, then the oldest by
  // creation time, in a batch so the O(n log n) sort amortizes.
  private evictForSpace(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
    if (this.cache.size < this.maxEntries) return;

    const overshoot = this.cache.size - this.maxEntries + 1;
    const batch = Math.max(overshoot, Math.ceil(this.maxEntries * 0.02));
    const oldest = Array.from(this.cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .slice(0, batch);
    for (const [key] of oldest) {
      this.cache.delete(key);
    }

    if (now - this.lastEvictionLogAt > 60_000) {
      this.lastEvictionLogAt = now;
      console.warn(
        `[Cache] ${this.name} hit the ${this.maxEntries}-entry cap — evicted ${oldest.length} oldest entries. ` +
          `If this repeats, some caller is generating unbounded cache keys.`,
      );
    }
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  // Invalidate cache patterns and broadcast to all SSE clients
  invalidatePattern(pattern: string, broadcast: boolean = false): void {
    const regex = new RegExp(pattern);
    const keys = Array.from(this.cache.keys());
    let invalidatedCount = 0;
    
    for (const key of keys) {
      if (regex.test(key)) {
        this.cache.delete(key);
        invalidatedCount++;
      }
    }

    invalidatedCount += swrCache.invalidatePattern(pattern);
    
    if (broadcast && invalidatedCount > 0) {
      const patternName = pattern.replace('^', '').replace(':', '');
      sseConnectionManager.broadcast({
        type: 'cache_invalidated',
        patterns: [patternName],
      });
    }
  }

  // Invalidate multiple patterns and broadcast once
  invalidatePatterns(patterns: string[]): void {
    if (patterns.length === 0) return;
    
    const regexes = patterns.map(p => new RegExp(p));
    const patternHits = new Set<number>();
    
    // Single pass over all keys — O(n * m) in theory but n >> m typically
    // and we avoid re-creating Array.from(keys) for each pattern
    for (const key of Array.from(this.cache.keys())) {
      for (let i = 0; i < regexes.length; i++) {
        if (regexes[i].test(key)) {
          this.cache.delete(key);
          patternHits.add(i);
          break;
        }
      }
    }
    
    // Invalidate SWR cache too
    for (let i = 0; i < patterns.length; i++) {
      if (swrCache.invalidatePattern(patterns[i]) > 0) {
        patternHits.add(i);
      }
    }
    
    // Broadcast once with all invalidated patterns
    if (patternHits.size > 0) {
      const invalidatedPatterns = Array.from(patternHits).map(i => 
        patterns[i].replace('^', '').replace(':', '')
      );
      sseConnectionManager.broadcast({
        type: 'cache_invalidated',
        patterns: invalidatedPatterns,
      });
      console.log(`[Cache] Invalidated and broadcast: ${invalidatedPatterns.join(', ')}`);
    }
  }

  invalidateByPrefix(prefix: string, broadcast: boolean = false): void {
    let invalidatedCount = 0;
    for (const key of Array.from(this.cache.keys())) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        invalidatedCount++;
      }
    }
    invalidatedCount += swrCache.invalidateByPrefix(prefix);
    
    if (broadcast && invalidatedCount > 0) {
      sseConnectionManager.broadcast({
        type: 'cache_invalidated',
        patterns: [prefix],
      });
    }
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cache.clear();
  }
}

export const memoryCache = new MemoryCache();

export const CACHE_TTL = {
  SHORT: 2 * 60 * 1000,        // 2 minutes - for frequently changing data
  MEDIUM: 5 * 60 * 1000,       // 5 minutes - default for most endpoints
  LONG: 15 * 60 * 1000,        // 15 minutes - for stable content
  VERY_LONG: 60 * 60 * 1000,   // 1 hour - for static/rarely changing data
  HOMEPAGE: 10 * 60 * 1000,    // 10 minutes - optimized for homepage (invalidated on publish)
  SMART_BLOCKS: 2 * 60 * 1000, // 2 minutes - for smart block queries
} as const;

export function withCache<T>(
  cacheKey: string,
  ttl: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = memoryCache.get<T>(cacheKey);
  if (cached !== null) {
    return Promise.resolve(cached);
  }

  return fetcher().then((data) => {
    memoryCache.set(cacheKey, data, ttl);
    return data;
  });
}

export function createCachedFetcher<TArgs extends any[], TResult>(
  fetcher: (...args: TArgs) => Promise<TResult>,
  options: {
    maxAge?: number;
    normalizer?: (...args: TArgs) => string;
    primitive?: boolean;
  } = {}
) {
  const { maxAge = 60000, normalizer, primitive = true } = options;
  
  return memoizee(fetcher, {
    promise: true,
    maxAge,
    normalizer: normalizer ? (args: TArgs) => normalizer(...args) : undefined,
    primitive,
  });
}

// =====================================================
// HIGH-TRAFFIC OPTIMIZATION: Stale-While-Revalidate
// =====================================================
// Prevents "thundering herd" when cache expires under 2200+ visitors
// - Serves stale data immediately while refreshing in background
// - Only ONE request triggers the refresh (deduplication)
// - New data is served to subsequent requests once refresh completes

interface SWRCacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  staleWhileRevalidate: number;
}

export class StaleWhileRevalidateCache {
  private cache: Map<string, SWRCacheEntry<any>> = new Map();
  private refreshing: Set<string> = new Set(); // Track in-flight refreshes
  private readonly maxEntries: number;
  private lastEvictionLogAt = 0;

  constructor(maxEntries: number = 5000) {
    this.maxEntries = maxEntries;
  }

  get<T>(key: string): { data: T | null; isStale: boolean; shouldRefresh: boolean } {
    const entry = this.cache.get(key);
    if (!entry) {
      return { data: null, isStale: false, shouldRefresh: true };
    }

    const age = Date.now() - entry.timestamp;
    const isFresh = age <= entry.ttl;
    const isStale = age <= entry.ttl + entry.staleWhileRevalidate;
    const shouldRefresh = !isFresh && !this.refreshing.has(key);

    if (!isStale) {
      // Data is completely expired (beyond stale-while-revalidate window)
      this.cache.delete(key);
      return { data: null, isStale: false, shouldRefresh: true };
    }

    return { 
      data: entry.data as T, 
      isStale: !isFresh,
      shouldRefresh 
    };
  }

  set<T>(key: string, data: T, ttlMs: number, staleWhileRevalidateMs: number = ttlMs): void {
    if (!this.cache.has(key) && this.cache.size >= this.maxEntries) {
      this.evictForSpace();
    }
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
      staleWhileRevalidate: staleWhileRevalidateMs,
    });
    this.refreshing.delete(key);
  }

  // Audit M1.1 (2026-06-10): unlike MemoryCache, this class has NO periodic
  // sweep — fully-expired entries are only removed when their own key is
  // read again, so unique keys that are never re-read accumulated forever.
  // Same safety valve as MemoryCache.evictForSpace: expired first, then
  // oldest-by-creation in a batch.
  private evictForSpace(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > entry.ttl + entry.staleWhileRevalidate) {
        this.cache.delete(key);
        this.refreshing.delete(key);
      }
    }
    if (this.cache.size < this.maxEntries) return;

    const overshoot = this.cache.size - this.maxEntries + 1;
    const batch = Math.max(overshoot, Math.ceil(this.maxEntries * 0.02));
    const oldest = Array.from(this.cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .slice(0, batch);
    for (const [key] of oldest) {
      this.cache.delete(key);
      this.refreshing.delete(key);
    }

    if (now - this.lastEvictionLogAt > 60_000) {
      this.lastEvictionLogAt = now;
      console.warn(
        `[Cache] swrCache hit the ${this.maxEntries}-entry cap — evicted ${oldest.length} oldest entries. ` +
          `If this repeats, some caller is generating unbounded cache keys.`,
      );
    }
  }

  markRefreshing(key: string): void {
    this.refreshing.add(key);
  }

  clearRefreshing(key: string): void {
    this.refreshing.delete(key);
  }

  isRefreshing(key: string): boolean {
    return this.refreshing.has(key);
  }

  invalidatePattern(pattern: string): number {
    const regex = new RegExp(pattern);
    let count = 0;
    for (const key of Array.from(this.cache.keys())) {
      if (regex.test(key)) {
        this.cache.delete(key);
        this.refreshing.delete(key);
        count++;
      }
    }
    return count;
  }

  invalidateByPrefix(prefix: string): number {
    let count = 0;
    for (const key of Array.from(this.cache.keys())) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        this.refreshing.delete(key);
        count++;
      }
    }
    return count;
  }
}

export const swrCache = new StaleWhileRevalidateCache();

/**
 * Stale-While-Revalidate cache wrapper for high-traffic endpoints
 * 
 * Usage:
 * ```typescript
 * const data = await withSWR(
 *   'homepage-lite',
 *   CACHE_TTL.HOMEPAGE,      // 3 minutes fresh
 *   CACHE_TTL.HOMEPAGE * 2,  // 6 minutes stale-while-revalidate
 *   async () => fetchHomepageData()
 * );
 * ```
 */
export async function withSWR<T>(
  cacheKey: string,
  ttl: number,
  staleWhileRevalidate: number,
  fetcher: () => Promise<T>,
  forceFresh: boolean = false
): Promise<T> {
  // Explicit force-refresh (e.g. the native iOS pull-to-refresh, which sends a
  // cache-buster query param + `Cache-Control: no-cache`). Recompute past the
  // cache so a just-published/featured carousel item shows on the FIRST pull
  // instead of waiting out the TTL. Critically this also fixes the autoscale
  // case: a publish only clears the SWR copy on the pod that handled it, so
  // pull-to-refresh routed to another pod kept getting the stale homepage for
  // up to CACHE_TTL.HOMEPAGE (10 min) — the reported "must kill & relaunch the
  // app" bug. Concurrent force-refreshes are coalesced via the refreshing flag
  // so a burst of pulls never stampedes the DB.
  if (forceFresh) {
    if (swrCache.isRefreshing(cacheKey)) {
      for (let attempt = 0; attempt < 30; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 200));
        if (!swrCache.isRefreshing(cacheKey)) break;
      }
      const after = swrCache.get<T>(cacheKey);
      if (after.data !== null && !after.isStale) return after.data;
    }
    swrCache.markRefreshing(cacheKey);
    try {
      const data = await fetcher();
      swrCache.set(cacheKey, data, ttl, staleWhileRevalidate);
      return data;
    } catch (err) {
      console.error(`[SWR] Force-fresh fetch failed for ${cacheKey}:`, err);
      swrCache.clearRefreshing(cacheKey);
      throw err;
    }
  }

  const cached = swrCache.get<T>(cacheKey);

  // Fresh cache hit - return immediately
  if (cached.data !== null && !cached.isStale) {
    return cached.data;
  }

  // Stale data exists - return it and refresh in background
  if (cached.data !== null && cached.isStale) {
    if (cached.shouldRefresh) {
      swrCache.markRefreshing(cacheKey);
      // Background refresh - don't await
      fetcher()
        .then((newData) => {
          swrCache.set(cacheKey, newData, ttl, staleWhileRevalidate);
          console.log(`[SWR] Background refresh completed: ${cacheKey}`);
        })
        .catch((err) => {
          console.error(`[SWR] Background refresh failed: ${cacheKey}`, err);
          swrCache.clearRefreshing(cacheKey);
        });
    }
    return cached.data;
  }

  // No cache - must fetch synchronously
  // But prevent thundering herd by only allowing one fetch
  if (swrCache.isRefreshing(cacheKey)) {
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 200));
      const retryCache = swrCache.get<T>(cacheKey);
      if (retryCache.data !== null) {
        return retryCache.data;
      }
      if (!swrCache.isRefreshing(cacheKey)) break;
    }
    const finalCheck = swrCache.get<T>(cacheKey);
    if (finalCheck.data !== null) return finalCheck.data;
  }

  swrCache.markRefreshing(cacheKey);
  try {
    const data = await fetcher();
    swrCache.set(cacheKey, data, ttl, staleWhileRevalidate);
    return data;
  } catch (err) {
    console.error(`[SWR] Fetch failed for ${cacheKey}:`, err);
    swrCache.clearRefreshing(cacheKey);
    throw err;
  }
}
