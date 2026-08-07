import Redis from "ioredis";
import { memoryCache, sseConnectionManager } from "../memoryCache";
import { purgeHomepage, purgeBreakingNews, purgeArticle } from "./cloudflarePurge";

/**
 * Feed-style keys affected by ANY article publish/unpublish/schedule/approve —
 * lists and aggregates that must show (or drop) the article. The patterns
 * deliberately omit the trailing colon so they match BOTH `name:...` and
 * `name-...` style keys (e.g. `homepage:0:0` and `homepage-lite`).
 */
const FEED_CONTENT_PATTERNS = [
  "^homepage",          // homepage-lite, homepage:..., homepage:stats:v2, homepage:totalViews
  "^breaking",          // breaking-ticker-active, breaking:...
  "^trending",          // trending-topics, trending:keywords
  "^blocks:",           // blocks:quad-categories
  "^live:",             // live:...
  "^insights:",         // insights:ai
  "^opinion:",          // opinion:list:...
  "^articles:",         // articles:list:..., articles:featured, articles:recent:..., articles:latest-footer
  "^lite-feed",         // lite-feed
  "^news-",             // news-paginated-total, news-analytics-ar/en/ur
  "^mobile:",           // mobile:sections, mobile:trending, mobile:homepage
];

/**
 * Blanket per-article patterns — legacy behavior for callers that can't name
 * the article. Wipes EVERY article's detail/comments/related/sidebar caches.
 *
 * حادثة 2026-08-06: نشر عاجل واحد كان يمسح كاش تفاصيل كل المقالات هنا في
 * اللحظة نفسها التي تصل فيها طوفة نقرات الإشعار (38 ألف جهاز)، فتتحول كل
 * النقرات إلى استعلامات DB باردة وتمتلئ البركة (pool=50/0idle/98wait).
 * المسار الافتراضي الآن موجّه: أنماط تُبنى من معرّف/سلاق المقال المكتوب فقط،
 * وبقية المقالات تحتفظ بكاشها الدافئ.
 */
const ARTICLE_BLANKET_PATTERNS = [
  "^article:",          // article:detail:<slug>, article:mobile:<id>, article:comments:<slug>, article:passport:..., article:media-assets:<id>, article:related:<slug>
  "^sidebar:",          // sidebar:<articleId> — server cache for /api/articles/:slug/sidebar (related + tags + mediaAssets)
];

const PUBLISHED_CONTENT_PATTERNS = [...FEED_CONTENT_PATTERNS, ...ARTICLE_BLANKET_PATTERNS];

function escapeRegex(token: string): string {
  return token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds the invalidation pattern list for one written article. Feed keys are
 * always included; `article:*`/`sidebar:*` keys are matched only when they
 * embed one of the article's identifying tokens (id, slug, englishSlug, old
 * slugs) — so other articles' warm caches survive the write. With no tokens,
 * falls back to the blanket per-article wipe.
 */
export function buildPublishedContentPatterns(articleTokens: string[] = []): string[] {
  const tokens = Array.from(new Set(articleTokens.filter((t): t is string => !!t && typeof t === "string")));
  if (tokens.length === 0) return PUBLISHED_CONTENT_PATTERNS;
  const alternation = tokens.map(escapeRegex).join("|");
  return [
    ...FEED_CONTENT_PATTERNS,
    `^(?:article|sidebar):.*(?:${alternation})`,
  ];
}

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
        // the originating pod already handled both globally). Newer pods send
        // the exact (possibly article-targeted) patterns; older messages
        // without them fall back to the blanket wipe.
        const remotePatterns: string[] =
          Array.isArray(msg.patterns) && msg.patterns.length > 0 && msg.patterns.every((p: unknown) => typeof p === "string")
            ? msg.patterns
            : PUBLISHED_CONTENT_PATTERNS;
        memoryCache.invalidatePatterns(remotePatterns);
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

function publishRemoteInvalidation(patterns: string[]): void {
  if (!pubClient || !pubsubReady) return;
  try {
    pubClient
      .publish(CH_CACHE_INVALIDATE, JSON.stringify({ podId: POD_ID, ts: Date.now(), patterns }))
      .catch(() => {});
  } catch {
    // ignore
  }
}

export interface InvalidatePublishedContentOptions {
  /** Article slug — when provided, also purges `/article/:slug` and `/api/articles/:slug` from Cloudflare. */
  articleSlug?: string | null;
  /** Additional slugs (english/old) to purge from Cloudflare alongside `articleSlug`. */
  extraPurgeSlugs?: Array<string | null | undefined>;
  /**
   * Identifying tokens (id + every slug) of the written article. When set,
   * `article:*`/`sidebar:*` memory keys are invalidated ONLY for this article
   * instead of the blanket wipe — other articles keep their warm caches.
   */
  articleTokens?: Array<string | null | undefined>;
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
  const { articleSlug, extraPurgeSlugs, articleTokens, isBreaking, skipCloudflare, reason } = options;

  const patterns = buildPublishedContentPatterns(
    (articleTokens ?? []).filter((t): t is string => typeof t === "string" && t.length > 0),
  );

  try {
    memoryCache.invalidatePatterns(patterns);
  } catch (e: any) {
    console.error("[ContentInvalidation] memory invalidation failed:", e?.message);
  }

  // Always bump `/api/cache-invalidation/check` pollers. `invalidatePatterns`
  // only broadcasts when this pod actually had matching keys — on a cold or
  // idle pod (common with Railway autoscale) the signal never fires and the
  // iOS home hero stays stale until a manual pull.
  try {
    sseConnectionManager.broadcast({
      type: "cache_invalidated",
      patterns: ["published-content"],
    });
  } catch (e: any) {
    console.error("[ContentInvalidation] poll-signal broadcast failed:", e?.message);
  }

  publishRemoteInvalidation(patterns);

  if (!skipCloudflare) {
    try {
      // immediate:true bypasses the 30s batch flush so the editor's change is
      // visible at the Cloudflare edge within ~1s of save. Without it, CDN
      // would keep serving the stale article HTML/JSON (sMaxAge=3600) until
      // the next scheduled flush.
      void purgeHomepage({ immediate: true });
      if (isBreaking) void purgeBreakingNews({ immediate: true });
      const purgeSlugs = new Set(
        [articleSlug, ...(extraPurgeSlugs ?? [])].filter((s): s is string => !!s),
      );
      purgeSlugs.forEach((slug) => void purgeArticle(slug, { immediate: true }));
    } catch (e: any) {
      console.error("[ContentInvalidation] cloudflare purge failed:", e?.message);
    }
  }

  if (reason) {
    console.log(`[ContentInvalidation] triggered (${reason})${articleSlug ? ` slug=${articleSlug}` : ""}${isBreaking ? " breaking" : ""}`);
  }
}

type ArticleLike = {
  id?: string | null;
  slug?: string | null;
  englishSlug?: string | null;
  newsType?: string | null;
} | null | undefined;

// ── تدفئة ما بعد النشر ──────────────────────────────────────────────────────
// الإبطال وحده يترك المفاتيح الساخنة باردة في أسوأ لحظة: طوفة نقرات إشعار
// العاجل تصل خلال ثوانٍ من النشر. نعيد ملء المفاتيح الحرجة فورًا عبر
// self-fetch (نفس نمط Cache Warmup في الإقلاع) قبل وصول الطوفة، فيجد أول
// نقر كاشًا دافئًا بدل استعلامات DB باردة. fire-and-forget — لا يؤخر النشر.
const WARM_DEBOUNCE_MS = 10_000;
const warmedRecently = new Map<string, number>();

function warmPublishedContent(article: NonNullable<ArticleLike>, isBreaking: boolean): void {
  const primarySlug = article.englishSlug || article.slug;
  if (!primarySlug) return;

  const now = Date.now();
  const last = warmedRecently.get(primarySlug);
  if (last && now - last < WARM_DEBOUNCE_MS) return;
  warmedRecently.set(primarySlug, now);
  if (warmedRecently.size > 200) {
    for (const [k, ts] of warmedRecently) {
      if (now - ts > WARM_DEBOUNCE_MS) warmedRecently.delete(k);
    }
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  const base = `http://localhost:${port}`;
  const targets = [
    `${base}/api/homepage-lite`,
    `${base}/api/articles/${encodeURIComponent(primarySlug)}`,
    // نقطة الجوال تقبل uuid أو slug؛ الرابط العميق في الإشعار يستخدم أحدهما.
    ...(article.id ? [`${base}/api/v1/articles/${encodeURIComponent(article.id)}`] : []),
    ...(isBreaking ? [`${base}/api/breaking-ticker/active`] : []),
  ];

  // مهلة قصيرة بعد الإبطال حتى تستقر أنماط المسح ثم نملأ من جديد.
  const timer = setTimeout(() => {
    for (const url of targets) {
      fetch(url, { signal: AbortSignal.timeout(8000) })
        .then((res) => {
          if (!res.ok) console.warn(`[ContentInvalidation] warm ${url} → HTTP ${res.status}`);
          return res.arrayBuffer().catch(() => undefined);
        })
        .catch((e: any) => console.warn(`[ContentInvalidation] warm ${url} failed:`, e?.message));
    }
  }, 1000);
  timer.unref?.();
}

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
    /**
     * Refill the hot caches right after invalidation (default true). Pass
     * false when the article is leaving the site (archive/unpublish/delete) —
     * warming a gone article is pointless.
     */
    warm?: boolean;
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

  const [primarySlug, ...restSlugs] = Array.from(slugs);
  invalidatePublishedContent({
    articleSlug: primarySlug,
    extraPurgeSlugs: restSlugs,
    articleTokens: [article?.id, ...slugs],
    isBreaking,
    reason,
  });

  const shouldWarm =
    opts.warm ?? !/(archive|unpublish|delete)/i.test(reason);
  if (shouldWarm && article) {
    try {
      warmPublishedContent(article, isBreaking);
    } catch (e: any) {
      console.warn("[ContentInvalidation] warm failed:", e?.message);
    }
  }
}
