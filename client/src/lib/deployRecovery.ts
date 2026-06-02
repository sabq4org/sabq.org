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

function reloadOnce(reason: string): void {
  if (recentlyReloaded()) {
    console.error(
      `[deployRecovery] Reloaded within the last ${RELOAD_COOLDOWN_MS}ms; ` +
        `not looping (reason=${reason}). The failing chunk is likely a genuine ` +
        `404, not a stale deploy.`,
    );
    return;
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
    event.preventDefault?.();
    reloadOnce("vite:preloadError");
  });

  // Belt-and-suspenders: dynamic import() rejections that aren't surfaced as
  // vite:preloadError (older browsers, non-preload code paths).
  window.addEventListener("unhandledrejection", (event) => {
    const reason = (event as PromiseRejectionEvent).reason;
    const msg = String((reason && (reason.message ?? reason)) || "");
    if (DYNAMIC_IMPORT_FAILURE_RE.test(msg)) {
      reloadOnce("dynamic-import-failure");
    }
  });
}
