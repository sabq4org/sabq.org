import { attemptChunkRecoveryReload } from "./deployRecovery";

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
    m.includes("_result.default") ||
    m.includes("reading 'default'") ||
    m.includes("تعذر تحميل الصفحة") ||
    // Named lazy export undefined after stale/partial chunk (WebKit minified)
    (m.includes("undefined is not an object") && m.includes("evaluating '") && m.includes(".")) ||
    (m.includes("cannot read properties of undefined") &&
      m.includes("reading '") &&
      !m.includes("reading 'default'"))
  );
}

export function retryImport<T>(importFn: () => Promise<T>, retries = 2, delay = 500): Promise<T> {
  return new Promise((resolve, reject) => {
    importFn()
      .then(resolve)
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
          if (attemptChunkRecoveryReload("lazy-import")) {
            return;
          }
          reject(new Error("تعذر تحميل الصفحة. يرجى مسح ذاكرة المتصفح (Ctrl+Shift+R)"));
        } else {
          reject(error);
        }
      });
  });
}
