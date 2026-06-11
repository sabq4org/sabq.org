// Deploy-recovery guard — makes edge-caching the SPA shell safe.
//
// Background: `functions/_middleware.js` now serves indexable content pages
// from the Cloudflare edge cache (P1 archiving fix: fast TTFB for Googlebot).
// The classic risk of caching an SPA shell is the "white page after deploy":
// an open tab — or a stale edge copy — holds build A's index.html, which
// references hashed chunks like `/assets/index-<hashA>.js`. After build B
// deploys, Cloudflare Pages no longer serves build A's hashed files, so the
// next lazy `import()` 404s and the page breaks.
//
// This guard listens for that exact failure (Vite's `vite:preloadError`, plus
// dynamic-import rejections) and recovers with a single CACHE-BUSTING reload:
// a one-off `?_dr=<ts>` query makes the request miss the stale edge entry and
// fetch the CURRENT shell + assets from origin. A short cooldown in
// sessionStorage prevents reload loops if the failure is not deploy-related.

import { isChunkErrorMessage } from "./retryImport";

const RELOAD_FLAG = "sabq:deploy-reload-at";
const RELOAD_COOLDOWN_MS = 30_000;
const CACHE_BUST_PARAM = "_dr";

const DYNAMIC_IMPORT_FAILURE_RE =
  /(dynamically imported module|Importing a module script failed|Failed to fetch dynamically imported|error loading dynamically imported module|Loading chunk \d+ failed|Loading CSS chunk)/i;

function recentlyReloaded(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_FLAG) || 0);
    return Number.isFinite(last) && Date.now() - last < RELOAD_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function markReloaded(): void {
  try {
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  } catch {
    /* sessionStorage unavailable (private mode / SSR) — best effort only */
  }
}

/**
 * Attempt a single cache-busting reload to recover from a chunk-load failure.
 * Returns `true` if a reload was triggered, `false` if blocked by the cooldown
 * (we already reloaded recently → the failure is likely genuine, so the caller
 * should surface a manual-refresh message instead of looping).
 *
 * Exported so App.tsx's `retryImport` and the route ErrorBoundary share ONE
 * cooldown + ONE recovery strategy with the window-level listeners below — a
 * single transient chunk failure can then surface through any of those paths
 * (import rejection, vite:preloadError, or a React.lazy render error like
 * Safari's "undefined is not an object (evaluating 'f._result.default')")
 * without ever triggering more than one reload.
 */
export function attemptChunkRecoveryReload(reason: string): boolean {
  if (recentlyReloaded()) {
    console.error(
      `[deployRecovery] Reloaded within the last ${RELOAD_COOLDOWN_MS}ms; ` +
        `not looping (reason=${reason}). The failing chunk is likely a genuine ` +
        `404, not a stale deploy.`,
    );
    return false;
  }
  markReloaded();
  console.warn(
    `[deployRecovery] Stale build detected (${reason}); reloading to fetch the latest deploy.`,
  );
  try {
    const url = new URL(window.location.href);
    // One-off cache-buster so the reload misses any stale edge-cached shell and
    // pulls the current build. It's transient (replaced on the next normal nav)
    // and never seen by crawlers (this only runs on a real chunk failure).
    url.searchParams.set(CACHE_BUST_PARAM, String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
  return true;
}

function reloadOnce(reason: string): void {
  attemptChunkRecoveryReload(reason);
}

/** User-initiated hard refresh — bypasses the auto-reload cooldown. */
export function forceDeployRecoveryReload(): void {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set(CACHE_BUST_PARAM, String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}

let installed = false;

export function installDeployRecovery(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  // Strip a leftover cache-buster from the address bar after a successful
  // recovery reload so the canonical URL is restored without another reload.
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has(CACHE_BUST_PARAM)) {
      url.searchParams.delete(CACHE_BUST_PARAM);
      window.history.replaceState(window.history.state, "", url.toString());
    }
  } catch {
    /* ignore */
  }

  // Vite fires this on the window when a preloaded/lazy chunk fails to load —
  // the canonical "shell points at a rotated hash" signal.
  window.addEventListener("vite:preloadError", (event) => {
    // Only swallow the error when we actually reload. preventDefault() makes
    // Vite's preload helper RESOLVE the failed import with `undefined` instead
    // of rejecting — so calling it while the cooldown blocks the reload poisons
    // every lazy chunk that fails in the next 30s: the caller gets `undefined`,
    // WebKit throws the dot-less "undefined is not an object (evaluating
    // '(await t())[n]')", and retryImport never gets a rejection to retry.
    if (attemptChunkRecoveryReload("vite:preloadError")) {
      event.preventDefault?.();
    }
  });

  // Belt-and-suspenders: dynamic import() rejections that aren't surfaced as
  // vite:preloadError (older browsers, non-preload code paths).
  window.addEventListener("unhandledrejection", (event) => {
    const reason = (event as PromiseRejectionEvent).reason;
    const msg = String((reason && (reason.message ?? reason)) || "");
    if (DYNAMIC_IMPORT_FAILURE_RE.test(msg) || isChunkErrorMessage(msg)) {
      reloadOnce("dynamic-import-failure");
    }
  });
}
