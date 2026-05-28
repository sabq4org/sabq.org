import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

// Unique per-build identifier. Embedded into the bundle as a compile-time
// constant AND emitted as /build-info.json so the running client can poll
// for a deploy and prompt a refresh — eliminates "blank page after deploy"
// for users who keep the tab open across releases.
const SABQ_BUILD_ID = String(Date.now());

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    {
      name: "sabq-build-info",
      apply: "build",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "build-info.json",
          source: JSON.stringify({
            buildId: SABQ_BUILD_ID,
            builtAt: new Date().toISOString(),
          }),
        });
      },
    },
    // Replit-specific plugins — only on Replit AND in dev. Vercel builds
    // and local non-Replit envs skip them. Set DISABLE_REPLIT_PLUGINS=true
    // to force-disable even on Replit.
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined &&
    process.env.DISABLE_REPLIT_PLUGINS !== "true"
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  define: {
    __SABQ_BUILD_ID__: JSON.stringify(SABQ_BUILD_ID),
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Function form (not the object form) so react/react-dom reliably
        // land in vendor-react. The old object form left vendor-react nearly
        // empty (175 B) — react-dom got hoisted into the entry chunk, bloating
        // it to ~249KB on every page.
        //
        // Radix UI is intentionally NOT grouped into a single 'vendor-ui'
        // chunk anymore. A manual chunk forces a modulepreload on EVERY page,
        // which pushed all ~261KB of Radix into the critical path even on
        // article pages that use only a couple of primitives. Letting Vite
        // split Radix per-usage means each route downloads just what it needs
        // (same lesson as 'vendor-charts'/recharts above).
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules\/(react|react-dom|scheduler|use-sync-external-store)\//.test(id)) {
            return 'vendor-react';
          }
          if (/node_modules\/(wouter|@tanstack\/react-query)\//.test(id)) {
            return 'vendor-core';
          }
          if (/node_modules\/(@tiptap|prosemirror)/.test(id)) {
            return 'vendor-editor';
          }
          if (/node_modules\/framer-motion\//.test(id)) {
            return 'vendor-motion';
          }
          // Everything else (incl. Radix UI, recharts): Vite auto-splits so
          // chunks load only with the routes that import them.
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 500,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
