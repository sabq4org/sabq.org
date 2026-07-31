import memoizee from 'memoizee';
import type { Response } from 'express';
import Redis from 'ioredis';
import { isEnglishSports } from './services/sportsLang';

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
  // سجل ثابت بكل النسخ الحيّة — يتيح لقياس الموارد ([Runtime]) طباعة حجم كل
  // كاش بالاسم دون أن يعرف بوجودها مسبقًا. أُضيف لاصطياد تسرّب الذاكرة
  // 2026-07-25 (heap تضاعف ×3 بينما fd/sockets/pool ثابتة): كاش يحمل قيمًا
  // كبيرة تحت سقفه قد يفسّر مئات الميغابايت.
  static readonly _instances: MemoryCache[] = [];

  private cache: Map<string, CacheEntry<any>> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly maxEntries: number;
  private readonly name: string;
  private lastEvictionLogAt = 0;

  constructor(maxEntries: number = 5000, name: string = 'memoryCache') {
    this.maxEntries = maxEntries;
    this.name = name;
    this.startCleanup();
    MemoryCache._instances.push(this);
  }

  /** لقطة حجم لهذا الكاش — للقياس فقط. */
  sizeInfo(): { name: string; size: number; max: number } {
    return { name: this.name, size: this.cache.size, max: this.maxEntries };
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
    poisonInflightCacheKey(key);
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

    poisonInflightCacheFetches((k) => regex.test(k));
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
    
    poisonInflightCacheFetches((k) => regexes.some((r) => r.test(k)));

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
    poisonInflightCacheFetches((k) => k.startsWith(prefix));
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
    poisonInflightCacheFetches(() => true);
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

// ============================================================================
// حواجز single-flight ضد الوعود المسمومة (حادثة VARA 2026-07-31)
// ============================================================================
// وعد جلب علّق بلا اكتمال — لا نجاح ولا فشل (استعلام DB بلا مهلة أثناء تعثّر
// عابر) — بقي في خريطة inflight إلى الأبد، فصار كل طلب جديد ينضم إليه:
// تعليق أبدي لمفاتيح spl:today/spl:live:all/pro-league حتى إعادة النشر،
// وكرونا SportsAlerts/Sports Intel عالقان («previous cycle still running»).
// الحاجزان المتكاملان:
//   1. سقف انتظار المستدعي (SWR_FETCH_DEADLINE_MS): الطلب يرفض بعده فيتحول
//      إلى 502 سريع بدل احتجاز المقبس بلا نهاية — الجلب الأصلي لا يُلغى،
//      فإن نجح متأخرًا ملأ الكاش للطلبات التالية.
//   2. عمر أقصى للوعد الجاري (SWR_INFLIGHT_MAX_AGE_MS ≥ الأول): بعده يُعدّ
//      الوعد مسمومًا ويُسقَط من الخريطة، فيبدأ الطالبُ التالي جلبًا جديدًا
//      بدل الانضمام لوعد ميت — تعافٍ ذاتي بلا redeploy.
function cacheEnvMs(name: string, fallback: number): number {
  const value = Number.parseInt((process.env[name] || "").trim(), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
const FETCH_WAIT_DEADLINE_MS = cacheEnvMs("SWR_FETCH_DEADLINE_MS", 20_000);
const INFLIGHT_MAX_AGE_MS = cacheEnvMs("SWR_INFLIGHT_MAX_AGE_MS", 45_000);

/** ينتظر الوعد حتى السقف ثم يرفض — دون إلغاء الجلب الأصلي (يظل يملأ الكاش). */
function awaitWithDeadline<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`[Cache] fetch wait exceeded ${FETCH_WAIT_DEADLINE_MS}ms for ${label}`));
    }, FETCH_WAIT_DEADLINE_MS);
    timer.unref?.();
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

// ============================================================================
// single-flight لـ withCache
// ============================================================================
// حادث 2026-07-28: عند بثّ خبر عاجل يُمسح الكاش أولًا ثم يصل ٣٨ ألف جهاز خلال
// ثوانٍ على مفتاح واحد بارد. بلا دمج، كل طلب متزامن كان ينفّذ getArticleBySlug
// الثقيل بشكل مستقل فتمتلئ بركة القاعدة (max=50) ويتحول البطء إلى الموقع كله.
// swrCache فيه هذه الآلية منذ البداية، لكن مسار المقال وأربعين مستدعيًا آخر
// (seoInjector، socialCrawler) يمرّون من هنا. نضعها في withCache بدل نقل
// المفاتيح إلى swrCache: الأخير مثبَّت عند سقفه (5000) ويُخلي باستمرار، بينما
// memoryCache حول 1500 من 5000 — فالنقل كان سيزيد الطفح لا ينقصه.
const inflightCacheFetches = new Map<string, { promise: Promise<any>; at: number }>();

// مفاتيح أُبطلت أثناء جلب جارٍ: نتيجة ذلك الجلب قُرئت قبل الإبطال فلا يجوز
// تخزينها بعده، وإلا بقي المحتوى القديم حيًّا طوال TTL رغم التعديل. الإبطال
// وحده لا يكفي لأن الجلب لم يكن في الكاش أصلًا ليُحذف منه.
const poisonedCacheKeys = new Set<string>();

/** تُستدعى من MemoryCache عند إبطال بنمط أو ببادئة أو مسح كامل. */
function poisonInflightCacheFetches(matches: (key: string) => boolean): void {
  for (const key of Array.from(inflightCacheFetches.keys())) {
    if (matches(key)) {
      inflightCacheFetches.delete(key);
      poisonedCacheKeys.add(key);
    }
  }
}

/** نسخة المفتاح الواحد — delete() تُستدعى في مسارات ساخنة فلا نمشّط الخريطة. */
function poisonInflightCacheKey(key: string): void {
  if (inflightCacheFetches.delete(key)) poisonedCacheKeys.add(key);
}

export function withCache<T>(
  cacheKey: string,
  ttl: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = memoryCache.get<T>(cacheKey);
  if (cached !== null) {
    return Promise.resolve(cached);
  }

  // جلب واحد فقط جارٍ لكل مفتاح؛ المتنافسون عليه ينتظرون نفس الوعد — ما دام
  // حيًّا: وعد تجاوز عمره السقف دون أن يكتمل مسموم (جلبه علّق بلا مهلة)،
  // فيُسقَط ليبدأ هذا الطالب جلبًا جديدًا بدل الانضمام لوعد ميت.
  const inflight = inflightCacheFetches.get(cacheKey);
  if (inflight) {
    if (Date.now() - inflight.at <= INFLIGHT_MAX_AGE_MS) {
      return awaitWithDeadline(inflight.promise as Promise<T>, cacheKey);
    }
    inflightCacheFetches.delete(cacheKey);
    console.warn(`[Cache] dropped a stuck in-flight fetch (>${INFLIGHT_MAX_AGE_MS}ms) for ${cacheKey}`);
  }

  const promise = fetcher().then((data) => {
    // إن أُبطل المفتاح أثناء الجلب فالنتيجة قديمة — تُسلَّم للمنتظرين ولا تُخزَّن.
    if (poisonedCacheKeys.delete(cacheKey)) return data;
    memoryCache.set(cacheKey, data, ttl);
    return data;
  });

  inflightCacheFetches.set(cacheKey, { promise, at: Date.now() });
  // then(cleanup, cleanup) لا finally: الأخيرة تولّد وعدًا مرفوضًا غير معالَج
  // عند فشل الجلب. الفشل لا يلوّث الكاش — لا set في مسار الرفض.
  const cleanup = () => {
    if (inflightCacheFetches.get(cacheKey)?.promise === promise) {
      inflightCacheFetches.delete(cacheKey);
    }
    poisonedCacheKeys.delete(cacheKey);
  };
  promise.then(cleanup, cleanup);

  return awaitWithDeadline(promise, cacheKey);
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
  static readonly _instances: StaleWhileRevalidateCache[] = [];

  private cache: Map<string, SWRCacheEntry<any>> = new Map();
  // علامة تحديث جارٍ (مفتاح → زمن البدء). بطابع زمني لأن تحديثًا خلفيًا علّق
  // بلا اكتمال كان يُبقي العلم مرفوعًا للأبد فلا يبدأ أي تحديث لاحق أبدًا.
  private refreshing: Map<string, number> = new Map();
  // single-flight: وعد الجلب الجاري لكل مفتاح (+ زمن بدئه). المتنافسون على
  // نفس المفتاح ينتظرون نفس الوعد بدل الاستقصاء ثم بدء جلب مكرر بعد 6 ثوانٍ.
  // العمر يحدّ التسمم: وعد لم يكتمل بعد السقف يُسقَط (حادثة 2026-07-31).
  private inflight: Map<string, { promise: Promise<any>; at: number }> = new Map();
  private readonly maxEntries: number;
  private readonly name: string;
  private lastEvictionLogAt = 0;

  constructor(maxEntries: number = 5000, name: string = 'swrCache') {
    this.maxEntries = maxEntries;
    this.name = name;
    StaleWhileRevalidateCache._instances.push(this);
  }

  /** لقطة حجم لهذا الكاش (يشمل الوعود المعلّقة) — للقياس فقط. */
  sizeInfo(): { name: string; size: number; max: number; inflight: number } {
    return { name: this.name, size: this.cache.size, max: this.maxEntries, inflight: this.inflight.size };
  }

  get<T>(key: string): { data: T | null; isStale: boolean; shouldRefresh: boolean } {
    const entry = this.cache.get(key);
    if (!entry) {
      return { data: null, isStale: false, shouldRefresh: true };
    }

    const age = Date.now() - entry.timestamp;
    const isFresh = age <= entry.ttl;
    const isStale = age <= entry.ttl + entry.staleWhileRevalidate;
    const shouldRefresh = !isFresh && !this.isRefreshing(key);

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
        this.inflight.delete(key);
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
      this.inflight.delete(key);
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
    this.refreshing.set(key, Date.now());
  }

  clearRefreshing(key: string): void {
    this.refreshing.delete(key);
  }

  /** علامة معمّرة (تحديث علّق بلا اكتمال) تُعدّ ساقطة — فلا تمنع تحديثًا جديدًا. */
  isRefreshing(key: string): boolean {
    const at = this.refreshing.get(key);
    if (at === undefined) return false;
    if (Date.now() - at > INFLIGHT_MAX_AGE_MS) {
      this.refreshing.delete(key);
      return false;
    }
    return true;
  }

  /**
   * الوعد المشترك للجلب الجاري لهذا المفتاح — إن وُجد وما زال حيًّا — وإلا null.
   * وعد تجاوز عمره السقف دون اكتمال مسموم (حادثة 2026-07-31: جلب علّق بلا
   * مهلة فظل كل طلب جديد ينضم إليه للأبد) — يُسقَط ليبدأ الطالب جلبًا جديدًا.
   */
  getInflight<T>(key: string): Promise<T> | null {
    const entry = this.inflight.get(key);
    if (!entry) return null;
    if (Date.now() - entry.at > INFLIGHT_MAX_AGE_MS) {
      this.inflight.delete(key);
      this.refreshing.delete(key);
      console.warn(`[Cache] ${this.name}: dropped a stuck in-flight fetch (>${INFLIGHT_MAX_AGE_MS}ms) for ${key}`);
      return null;
    }
    return entry.promise as Promise<T>;
  }

  /**
   * يسجّل وعد جلب جارٍ للمفتاح ويحذفه تلقائيًا عند اكتماله (نجاحًا أو فشلًا).
   * نستخدم then(cleanup, cleanup) لا finally حتى لا تولّد سلسلة التنظيف رفضًا
   * غير معالج (unhandled rejection) عند فشل الجلب.
   */
  trackInflight<T>(key: string, promise: Promise<T>): Promise<T> {
    this.inflight.set(key, { promise, at: Date.now() });
    const cleanup = () => {
      if (this.inflight.get(key)?.promise === promise) this.inflight.delete(key);
    };
    promise.then(cleanup, cleanup);
    return promise;
  }

  invalidatePattern(pattern: string): number {
    const regex = new RegExp(pattern);
    let count = 0;
    for (const key of Array.from(this.cache.keys())) {
      if (regex.test(key)) {
        this.cache.delete(key);
        this.refreshing.delete(key);
        this.inflight.delete(key);
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
        this.inflight.delete(key);
        count++;
      }
    }
    return count;
  }
}

export const swrCache = new StaleWhileRevalidateCache();

/**
 * أحجام كل الكاشات الحيّة مرتّبة تنازليًا — يستهلكها قياس الموارد لطباعة
 * أكبرها في سطر [Runtime]. كاش يقترب حجمه من سقفه ويحمل قيمًا كبيرة هو أول
 * المشتبهين في تسرّب الذاكرة.
 */
export function cacheSizes(): { name: string; size: number; max: number; inflight?: number }[] {
  const out: { name: string; size: number; max: number; inflight?: number }[] = [];
  for (const c of MemoryCache._instances) out.push(c.sizeInfo());
  for (const c of StaleWhileRevalidateCache._instances) out.push(c.sizeInfo());
  return out.sort((a, b) => b.size - a.size);
}

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
  // فصل كاش بوابة الرياضة بالإنجليزية: لاحقة ":en" تُضاف فقط داخل سياق لغة
  // إنجليزية (يضبطه middleware في مسارات /api/sports). العربية والكرون وبقية
  // التطبيق تبقى مفاتيحها كما هي تمامًا — توافق رجعي كامل، بلا تبريد كاش.
  if (isEnglishSports()) cacheKey = `${cacheKey}:en`;

  // single-flight: جلب واحد فقط جارٍ لكل مفتاح، وكل المتنافسين عليه ينتظرون
  // نفس الوعد. سابقًا كان المنتظرون يستقصون isRefreshing حتى 6 ثوانٍ ثم
  // يستسلمون ويبدؤون جلبًا مكررًا — مضخّم thundering-herd تحت طوابير rate-limit
  // عند المزوّد. الرفض يصل لكل المنتظرين ولا يلوّث الكاش (لا set عند الفشل).
  const startFetch = (logLabel: string): Promise<T> => {
    swrCache.markRefreshing(cacheKey);
    const promise = (async () => {
      try {
        const data = await fetcher();
        swrCache.set(cacheKey, data, ttl, staleWhileRevalidate);
        return data;
      } catch (err) {
        console.error(`[SWR] ${logLabel} fetch failed for ${cacheKey}:`, err);
        swrCache.clearRefreshing(cacheKey);
        throw err;
      }
    })();
    return swrCache.trackInflight(cacheKey, promise);
  };

  // Explicit force-refresh (e.g. the native iOS pull-to-refresh, which sends a
  // cache-buster query param + `Cache-Control: no-cache`). Recompute past the
  // cache so a just-published/featured carousel item shows on the FIRST pull
  // instead of waiting out the TTL. Critically this also fixes the autoscale
  // case: a publish only clears the SWR copy on the pod that handled it, so
  // pull-to-refresh routed to another pod kept getting the stale homepage for
  // up to CACHE_TTL.HOMEPAGE (10 min) — the reported "must kill & relaunch the
  // app" bug. Concurrent force-refreshes are coalesced via the shared in-flight
  // promise so a burst of pulls never stampedes the DB.
  if (forceFresh) {
    const inflight = swrCache.getInflight<T>(cacheKey);
    if (inflight) return awaitWithDeadline(inflight, cacheKey);
    return awaitWithDeadline(startFetch('Force-fresh'), cacheKey);
  }

  const cached = swrCache.get<T>(cacheKey);

  // Fresh cache hit - return immediately
  if (cached.data !== null && !cached.isStale) {
    return cached.data;
  }

  // Stale data exists - return it and refresh in background
  if (cached.data !== null && cached.isStale) {
    if (cached.shouldRefresh) {
      // Background refresh - don't await. يُسجَّل الوعد أيضًا حتى يتشاركه أي
      // طلب لاحق (forceFresh أو مفتاح أُخلِي من الكاش أثناء التحديث).
      startFetch('Background')
        .then(() => {
          console.log(`[SWR] Background refresh completed: ${cacheKey}`);
        })
        .catch(() => {
          // الخطأ سُجّل داخل startFetch — لا شيء إضافي هنا.
        });
    }
    return cached.data;
  }

  // No cache - must fetch. نتشارك الوعد الجاري إن وُجد، وإلا نبدأ الجلب الوحيد.
  // المستدعي مقيّد بسقف انتظار: يرفض بعده (502 سريع بدل احتجاز المقبس) بينما
  // الجلب نفسه يستمر بالخلفية ويملأ الكاش إن نجح متأخرًا.
  const inflight = swrCache.getInflight<T>(cacheKey);
  if (inflight) return awaitWithDeadline(inflight, cacheKey);
  return awaitWithDeadline(startFetch('Initial'), cacheKey);
}
