import { attemptChunkRecoveryReload, forceDeployRecoveryReload } from "./deployRecovery";

declare const __SABQ_BUILD_ID__: string;

/**
 * Has a new deploy shipped since this bundle was built? Checks the live
 * /build-info.json against the build id baked into the running bundle. Used by
 * retryImport's last-resort path to distinguish a CONFIRMED deploy (which
 * should bypass the reload cooldown) from a transient chunk error (which the
 * cooldown should keep blocking to avoid loops). Resolves to null on any
 * network/parse failure — callers treat that as "no confirmed deploy".
 */
function detectNewDeploy(): Promise<boolean | null> {
  return fetch("/build-info.json", { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : null))
    .then((info) => {
      const live = info && typeof info.buildId === "string" ? info.buildId : "";
      if (!live) return null;
      return live !== String(__SABQ_BUILD_ID__ || "");
    })
    .catch(() => null);
}

/**
 * Detect stale-deploy / lazy-chunk failures across browsers.
 * Includes Safari's named-export poison pill: `undefined is not an object
 * (evaluating 's.PersonalizedFeed')` after a partial chunk load.
 */
export function isChunkErrorMessage(message: string | undefined | null): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("failed to fetch dynamically imported module") ||
    m.includes("importing a module script failed") ||
    m.includes("loading chunk") ||
    m.includes("loading css chunk") ||
    m.includes("chunkloaderror") ||
    m.includes("is not found") ||
    m.includes("unable to preload css") ||
    m.includes("missing export") ||
    // Stale-deploy poison on Cloudflare Pages: a rotated/missing /assets/*.js is
    // served the SPA index.html (text/html) instead of a 404, so the browser
    // refuses to run it as a module. Phrasings differ by browser but always pair
    // "mime type" with module/script/javascript — Safari: "'text/html' is not a
    // valid JavaScript MIME type"; Chrome/FF: "...responded with a MIME type of
    // 'text/html'" / "disallowed MIME type". Without this the error evades
    // detection and the user is stuck on "حدث خطأ" with no auto-recovery.
    (m.includes("mime type") &&
      (m.includes("module") || m.includes("script") || m.includes("javascript"))) ||
    m.includes("_result.default") ||
    m.includes("reading 'default'") ||
    m.includes("تعذر تحميل الصفحة") ||
    // Named lazy export undefined after stale/partial chunk (WebKit minified)
    (m.includes("undefined is not an object") && m.includes("evaluating '") && m.includes(".")) ||
    // Same poison, bracket form — a swallowed vite:preloadError resolves the
    // import with `undefined`, then lazyNamed's minified `(await t())[n]`
    // throws a message with NO dot, which the rule above misses.
    (m.includes("undefined is not an object") && m.includes("(await")) ||
    (m.includes("cannot read properties of undefined") &&
      m.includes("reading '") &&
      !m.includes("reading 'default'"))
  );
}

// Defaults tuned for Cloudflare Pages, NOT a single-origin host. After the
// frontend/backend split, a lazy chunk can 404 transiently even on the CURRENT
// build: a new Pages deployment is promoted before its content-hashed
// /assets/*.js have propagated to every edge POP, and (because _routes.json runs
// the Pages Function on /assets/*) a Function fallback under post-deploy load can
// momentarily mask an existing file. Both heal within seconds. The old 2×500ms
// (≈1s) budget surrendered to the "تعذر تحميل الصفحة" screen long before the
// chunk became reachable — the white-page-after-every-deploy report. We now
// re-fetch the SAME chunk with exponential backoff over ~20s before giving up,
// so a propagating chunk is awaited rather than treated as a permanent 404.
const RETRY_ATTEMPTS = 6;
const RETRY_BASE_DELAY_MS = 600;
const RETRY_MAX_DELAY_MS = 5000;

export function retryImport<T>(
  importFn: () => Promise<T>,
  retries = RETRY_ATTEMPTS,
  delay = RETRY_BASE_DELAY_MS,
): Promise<T> {
  return new Promise((resolve, reject) => {
    importFn()
      .then((mod) => {
        // If ANY window listener calls preventDefault() on vite:preloadError,
        // Vite's preload helper resolves the FAILED import with `undefined`
        // instead of rejecting. Normalize that to a recognizable chunk error so
        // the retry/recovery path below handles it like a normal load failure.
        if (mod == null) {
          throw new Error("Loading chunk failed: empty module namespace");
        }
        resolve(mod);
      })
      .catch((error: unknown) => {
        // Some browsers reject a failed Vite preload with `undefined` instead
        // of an Error (JAVASCRIPT-REACT-3A). Reading `error.message` then throws
        // a second TypeError and bypasses the chunk recovery path entirely.
        // Normalize every rejection before classification so the original
        // failure is retried and, if necessary, reaches the existing recovery
        // UI rather than becoming an unrelated unhandled exception.
        const normalizedError = error instanceof Error
          ? error
          : new Error(
              error == null
                ? "Loading chunk failed: import rejected without an Error"
                : String(error),
            );
        const isModuleError = isChunkErrorMessage(normalizedError.message);

        if (retries > 0 && isModuleError) {
          console.warn(`[LazyLoad] Retrying import, ${retries} attempts left...`);
          setTimeout(() => {
            // Exponential backoff capped at RETRY_MAX_DELAY_MS so a transient
            // current-build chunk 404 (Pages POP propagation / Function fallback
            // under load) is awaited for ~20s total instead of bailing on the 2nd
            // try. Genuine permanent 404s still surface — just ~20s later.
            retryImport(importFn, retries - 1, Math.min(delay * 2, RETRY_MAX_DELAY_MS))
              .then(resolve)
              .catch(reject);
          }, delay);
          return;
        }
        if (isModuleError) {
          // Before showing the error UI, check whether a new deploy shipped.
          // If the live build id differs from THIS bundle's, the failure is
          // caused by a confirmed deploy (not a transient error) — bypass the
          // 30s reload cooldown and force a cache-busted reload. This catches
          // the case polling misses (polling skipped on hidden tabs, or a
          // navigation to a deleted chunk before polling's first/next tick).
          detectNewDeploy().then((isNewDeploy) => {
            if (isNewDeploy) {
              forceDeployRecoveryReload();
              return;
            }
            // No deploy (null = couldn't tell, or false = same build) — fall
            // back to the cooldown-respecting path. If that's blocked too, the
            // user gets the manual-refresh message (the genuine 404 case).
            if (attemptChunkRecoveryReload("lazy-import")) {
              return;
            }
            reject(new Error("تعذر تحميل الصفحة. يرجى مسح ذاكرة المتصفح (Ctrl+Shift+R)"));
          });
          return;
        } else {
          reject(normalizedError);
        }
      });
  });
}
