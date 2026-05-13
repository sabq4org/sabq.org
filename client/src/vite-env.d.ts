/// <reference types="vite/client" />

/**
 * Injected at build time by vite.config.ts (`define`). Used by
 * @/lib/buildVersion to detect deploys while the tab is still open.
 */
declare const __SABQ_BUILD_ID__: string;
