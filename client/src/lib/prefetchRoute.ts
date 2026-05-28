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
