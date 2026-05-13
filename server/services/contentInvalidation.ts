import Redis from "ioredis";
import { memoryCache } from "../memoryCache";
import { purgeHomepage, purgeBreakingNews, purgeArticle } from "./cloudflarePurge";

/**
 * Patterns that match every cache key affected when an article is published,
 * unpublished, scheduled, or approved. The patterns deliberately omit the
 * trailing colon so they match BOTH `name:...` and `name-...` style keys
 * (e.g. `homepage:0:0` and `homepage-lite`).
 */
const PUBLISHED_CONTENT_PATTERNS = [
  "^homepage",          // homepage-lite, homepage:..., homepage:stats:v2, homepage:totalViews
  "^breaking",          // breaking-ticker-active, breaking:...
  "^trending",          // trending-topics, trending:keywords
  "^blocks:",           // blocks:quad-categories
  "^live:",             // live:...
  "^insights:",         // insights:ai
  "^opinion:",          // opinion:list:...
  "^articles:",         // articles:list:..., articles:featured, articles:recent:..., articles:latest-footer
  "^article:",          // article:detail:<slug>, article:id:<id>, article:passport:<lang>:<slug>:*, article:media-assets:<id>:<locale>, article:related:..., article:sidebar:...
  "^lite-feed",         // lite-feed
  "^news-",             // news-paginated-total, news-analytics-ar/en/ur
  "^mobile:",           // mobile:sections, mobile:trending, mobile:homepage
];

const CH_CACHE_INVALIDATE = "cache-invalidation:published";
const POD_ID = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

let pubClient: Redis | null = null;
let subClient: Redis | null = null;
let pubsubReady = false;

function initPubSub(): void {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn("[ContentInvalidation] REDIS_URL not set — running in single-pod mode (no cross-instance cache sync)");
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
    pubClient = new Redis(url, opts);
    subClient = new Redis(url, opts);

    pubClient.on("error", (err) => {
      console.error("[ContentInvalidation] pub redis error:", err.message);
    });
    subClient.on("error", (err) => {
      console.error("[ContentInvalidation] sub redis error:", err.message);
    });

    subClient.on("ready", () => {
      subClient?.subscribe(CH_CACHE_INVALIDATE, (err) => {
        if (err) {
          console.error("[ContentInvalidation] subscribe failed:", err.message);
          return;
        }
        pubsubReady = true;
        console.log("[ContentInvalidation] ✅ Redis pub/sub ready (pod:", POD_ID, ")");
      });
    });

    subClient.on("message", (channel, raw) => {
      if (channel !== CH_CACHE_INVALIDATE) return;
      try {
        const msg = JSON.parse(raw);
        if (msg.podId === POD_ID) return; // ignore our own echoes

        // Apply local-only invalidation (no re-broadcast, no Cloudflare —
        // the originating pod already handled both globally).
        memoryCache.invalidatePatterns(PUBLISHED_CONTENT_PATTERNS);
        console.log("[ContentInvalidation] ⟲ Applied remote invalidation from pod", msg.podId);
      } catch (e: any) {
        console.error("[ContentInvalidation] pubsub msg parse error:", e?.message);
      }
    });
  } catch (e: any) {
    console.error("[ContentInvalidation] pub/sub init failed:", e?.message);
    pubClient = null;
    subClient = null;
  }
}
initPubSub();

function publishRemoteInvalidation(): void {
  if (!pubClient || !pubsubReady) return;
  try {
    pubClient
      .publish(CH_CACHE_INVALIDATE, JSON.stringify({ podId: POD_ID, ts: Date.now() }))
      .catch(() => {});
  } catch {
    // ignore
  }
}

export interface InvalidatePublishedContentOptions {
  /** Article slug — when provided, also purges `/article/:slug` and `/api/articles/:slug` from Cloudflare. */
  articleSlug?: string | null;
  /** True for breaking-news content — additionally purges the breaking-ticker endpoint. */
  isBreaking?: boolean;
  /** Skip Cloudflare purge (e.g. for unpublish where we want only memory invalidation). */
  skipCloudflare?: boolean;
  /** Optional context tag for logs. */
  reason?: string;
}

/**
 * Unified invalidation entry point used by every code path that publishes,
 * unpublishes, schedules, or approves an article. It:
 *  1. Clears the local in-memory + SWR caches for all feed-style keys.
 *     (`memoryCache.invalidatePatterns` also calls `sseConnectionManager.broadcast`,
 *     which bumps `_lastCacheInvalidation` so the polling client refetches.)
 *  2. Tells every other pod to do the same via Redis pub/sub.
 *  3. Purges the Cloudflare edge cache for the homepage (and the article, if a
 *     slug is provided, and the breaking ticker if applicable).
 *
 * Safe to call from any context — never throws.
 */
export function invalidatePublishedContent(
  options: InvalidatePublishedContentOptions = {},
): void {
  const { articleSlug, isBreaking, skipCloudflare, reason } = options;

  try {
    memoryCache.invalidatePatterns(PUBLISHED_CONTENT_PATTERNS);
  } catch (e: any) {
    console.error("[ContentInvalidation] memory invalidation failed:", e?.message);
  }

  publishRemoteInvalidation();

  if (!skipCloudflare) {
    try {
      // immediate:true bypasses the 30s batch flush so the editor's change is
      // visible at the Cloudflare edge within ~1s of save. Without it, CDN
      // would keep serving the stale article HTML/JSON (sMaxAge=3600) until
      // the next scheduled flush.
      void purgeHomepage({ immediate: true });
      if (isBreaking) void purgeBreakingNews({ immediate: true });
      if (articleSlug) void purgeArticle(articleSlug, { immediate: true });
    } catch (e: any) {
      console.error("[ContentInvalidation] cloudflare purge failed:", e?.message);
    }
  }

  if (reason) {
    console.log(`[ContentInvalidation] triggered (${reason})${articleSlug ? ` slug=${articleSlug}` : ""}${isBreaking ? " breaking" : ""}`);
  }
}

type ArticleLike = {
  slug?: string | null;
  englishSlug?: string | null;
  newsType?: string | null;
} | null | undefined;

/**
 * Convenience wrapper for the common "an article was just written" path.
 * Reads slug + englishSlug + newsType off the article row so callers don't
 * have to spell them out, and also purges the old slug(s) if the rename
 * changed them.
 *
 * Why we purge BOTH `slug` AND `englishSlug`: after `slugRedirect` middleware
 * 301s Arabic slugs to `/article/<englishSlug>`, browsers/CDN cache the JSON
 * at `/api/articles/<englishSlug>` — NOT `/api/articles/<slug>`. If we only
 * purge by `slug`, the edge keeps serving stale JSON (incl. old imageUrl)
 * for sMaxAge=3600s. Reported symptom: image visibly stale ~35min after
 * editing even though listings updated immediately.
 *
 * Use this instead of calling invalidatePublishedContent() with just a
 * reason string — without articleSlug, the article URL never gets purged
 * from Cloudflare and stays stale at the edge for sMaxAge=3600s.
 */
export function invalidateArticleWrite(
  article: ArticleLike,
  opts: {
    reason?: string;
    oldSlug?: string | null;
    oldEnglishSlug?: string | null;
  } = {},
): void {
  const reason = opts.reason ?? "article-write";
  const isBreaking = article?.newsType === "breaking";

  const slugs = new Set<string>();
  if (article?.slug) slugs.add(article.slug);
  if (article?.englishSlug) slugs.add(article.englishSlug);
  if (opts.oldSlug) slugs.add(opts.oldSlug);
  if (opts.oldEnglishSlug) slugs.add(opts.oldEnglishSlug);

  if (slugs.size === 0) {
    invalidatePublishedContent({ isBreaking, reason });
    return;
  }

  Array.from(slugs).forEach((slug) => {
    invalidatePublishedContent({ articleSlug: slug, isBreaking, reason });
  });
}
