import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { retryImport } from "./retryImport";

/** lazy() + retryImport for default-export chunks (App routes, etc.) */
export function lazyDefault<P = object>(
  loader: () => Promise<{ default: ComponentType<P> }>,
): LazyExoticComponent<ComponentType<P>> {
  return lazy(() => retryImport(loader));
}

/** lazy() + retryImport for named-export homepage sections */
export function lazyNamed<P = object>(
  loader: () => Promise<Record<string, ComponentType<P> | undefined>>,
  exportName: string,
): LazyExoticComponent<ComponentType<P>> {
  return lazy(() =>
    retryImport(async () => {
      const mod = await loader();
      // Optional-chain: a swallowed vite:preloadError resolves a failed import
      // with `undefined` — plain `mod[exportName]` would throw WebKit's
      // dot-less `(await t())[n]` TypeError before reaching the guard below.
      const component = mod?.[exportName];
      if (!component) {
        throw new Error(`Loading chunk failed: missing export ${exportName}`);
      }
      return { default: component };
    }),
  );
}
