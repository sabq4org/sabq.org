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
      const component = mod[exportName];
      if (!component) {
        throw new Error(`Loading chunk failed: missing export ${exportName}`);
      }
      return { default: component };
    }),
  );
}
