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

export function retryImport<T>(importFn: () => Promise<T>, retries = 2, delay = 500): Promise<T> {
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
      .catch((error: Error) => {
        const isModuleError = isChunkErrorMessage(error.message);

        if (retries > 0 && isModuleError) {
          console.warn(`[LazyLoad] Retrying import, ${retries} attempts left...`);
          setTimeout(() => {
            retryImport(importFn, retries - 1, delay)
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
          reject(error);
        }
      });
  });
}
