/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HUDHUD_PUBLISHABLE_KEY?: string;
  readonly VITE_HUDHUD_MAP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Injected at build time by vite.config.ts (`define`). Used by
 * @/lib/buildVersion to detect deploys while the tab is still open.
 */
declare const __SABQ_BUILD_ID__: string;
