// Lightweight route-chunk prefetching.
//
// The app is heavily code-split (~250 lazy routes). That keeps the initial
// download small, but the trade-off is a "spinner on every navigation" feel:
// clicking a headline blocks on downloading that route's JS chunk.
//
// These helpers warm the chunk ahead of the click — on link hover/touch, or
// during browser idle time after the homepage settles. We call the SAME
// dynamic import specifier used by the lazy() wrappers in App.tsx, so Vite
// emits one chunk and the browser cache dedupes the request: prefetch +
// later real navigation share the exact same module.

import { queryClient } from "@/lib/queryClient";

const inFlight = new Set<string>();

function prefetchOnce(key: string, importer: () => Promise<unknown>): void {
  if (inFlight.has(key)) return;
  inFlight.add(key);
  // Fire-and-forget. On failure, drop the key so a later attempt can retry.
  importer().catch(() => {
    inFlight.delete(key);
  });
}

/** Warm the Arabic article detail chunk — the dominant homepage → click path. */
export function prefetchArticleDetail(): void {
  prefetchOnce("article", () => import("@/pages/ArticleDetail"));
}

/** Warm the category page chunk (category pills / nav). */
export function prefetchCategoryPage(): void {
  prefetchOnce("category", () => import("@/pages/CategoryPage"));
}

/**
 * Warm the below-the-fold homepage section chunks during idle time. Each
 * section in Home.tsx is its own lazy() chunk that today only starts
 * downloading once the user scrolls near it, producing a per-section skeleton
 * flash on slower mobile networks. Prefetching here means the JS is already in
 * cache by the time the section scrolls in — only the data fetch remains.
 *
 * The specifiers MUST match the lazy() wrappers in Home.tsx so Vite dedupes
 * them onto the same chunk. Desktop-only sections (the heavy Leaflet map plus
 * the Trending Topics / Trending Keywords panels) are gated behind
 * `includeDesktopOnly` because they aren't rendered on mobile at all.
 */
export function prefetchHomeSections({ includeDesktopOnly = true }: { includeDesktopOnly?: boolean } = {}): void {
  prefetchOnce("home-smart-summary", () => import("@/components/SmartSummaryBlock"));
  prefetchOnce("home-ai-insights", () => import("@/components/AIInsightsBlock"));
  prefetchOnce("home-quad-categories", () => import("@/components/QuadCategoriesBlock"));
  prefetchOnce("home-trending-week", () => import("@/components/TrendingWeekSection"));
  prefetchOnce("home-muqtarab", () => import("@/components/MuqtarabTopicsShowcase"));
  prefetchOnce("home-opinion", () => import("@/components/OpinionArticlesBlock"));
  prefetchOnce("home-continue-reading", () => import("@/components/ContinueReadingWidget"));
  if (includeDesktopOnly) {
    prefetchOnce("home-trending-topics", () => import("@/components/TrendingTopics"));
    prefetchOnce("home-trending-keywords", () => import("@/components/TrendingKeywords"));
    prefetchOnce("home-news-map", () => import("@/components/NewsMap"));
  }
}

/**
 * Warm BOTH the article-detail chunk AND the article's data into the
 * react-query cache. Call on link hover/touch with the same slug the URL
 * uses ({englishSlug || slug}). The query key matches ArticleDetail's own
 * useQuery(["/api/articles", slug]) so the click finds cached data and
 * renders immediately instead of showing a loading state while the API
 * round-trips. The default query fn (getQueryFn) derives the URL from the
 * key, so no fetcher needs to be passed here.
 */
export function prefetchArticle(slug: string | undefined | null): void {
  prefetchArticleDetail();
  if (!slug) return;
  const key = `article-data:${slug}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);
  queryClient
    .prefetchQuery({ queryKey: ["/api/articles", slug] })
    .catch(() => inFlight.delete(key));
}

/**
 * Schedule a prefetch during browser idle time, so it never competes with the
 * critical render. Falls back to a short timeout where requestIdleCallback is
 * unavailable (Safari < 17). Returns a cleanup function.
 */
export function prefetchWhenIdle(fn: () => void, timeoutMs = 2000): () => void {
  const ric = (window as any).requestIdleCallback as
    | ((cb: () => void, opts?: { timeout: number }) => number)
    | undefined;

  if (ric) {
    const handle = ric(fn, { timeout: timeoutMs });
    return () => (window as any).cancelIdleCallback?.(handle);
  }

  const t = setTimeout(fn, timeoutMs);
  return () => clearTimeout(t);
}
