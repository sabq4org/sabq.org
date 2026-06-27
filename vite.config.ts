import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

// Unique per-build identifier. Embedded into the bundle as a compile-time
// constant AND emitted as /build-info.json so the running client can poll
// for a deploy and prompt a refresh — eliminates "blank page after deploy"
// for users who keep the tab open across releases.
const SABQ_BUILD_ID = String(Date.now());

// Optional append-only asset CDN (structural fix for "white page after every
// deploy"). When ASSET_CDN_URL is set at BUILD time (e.g.
// "https://cdn.sabq.org"), every content-hashed /assets/* URL is emitted as an
// ABSOLUTE url on that host instead of a Pages-relative path. Pair it with the
// post-build upload step (scripts/upload-assets-to-r2.mjs) that pushes
// dist/public/assets/* into an R2 bucket WITHOUT ever deleting old files.
// Because filenames are content-hashed, the bucket accumulates EVERY build's
// chunks, so a chunk URL never 404s — neither for an open tab on the previous
// build nor for a fresh tab hitting a POP mid-propagation. Unset (the default)
// keeps the current Pages-relative behavior, so this is safe to merge inert and
// flip on once cdn.sabq.org + R2 CORS are wired (see docs).
const ASSET_CDN_URL = (process.env.ASSET_CDN_URL || "").replace(/\/+$/, "");

export default defineConfig({
  // Only rewrites bundle-emitted asset URLs (js/css/fonts/images) — root/public
  // paths (index.html, /build-info.json, /favicon.ico) stay on the origin so the
  // deploy-detection probe and the SPA shell are still served (no-store) by
  // Cloudflare Pages. Inert unless ASSET_CDN_URL is set.
  ...(ASSET_CDN_URL
    ? {
        experimental: {
          renderBuiltUrl(filename: string) {
            return `${ASSET_CDN_URL}/${filename}`;
          },
        },
      }
    : {}),
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
      // Inject the build id as a <meta> tag so the inline safety-net script in
      // index.html can read it (it can't see the `define`d __SABQ_BUILD_ID__
      // constant — that's only available inside the bundled JS). The script
      // compares this meta against /build-info.json on every HTML load: if they
      // differ, the browser is holding a STALE index.html (e.g. iOS Safari disk
      // cache) that points at deleted chunks, and it self-heals with a
      // cache-busted reload BEFORE the entry chunk is even requested.
      transformIndexHtml(html) {
        const meta = `<meta name="sabq-build-id" content="${SABQ_BUILD_ID}">`;
        return html.replace("<head>", `<head>\n    ${meta}`);
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
  esbuild: {
    // Strip noisy debug logging from PRODUCTION bundles only (minification
    // drops these pure-annotated calls). Dev keeps every log (no minify in
    // dev). console.error / console.warn are preserved on purpose so genuine
    // failures stay visible. Prevents future debug logs from leaking to the
    // browser console regardless of stray console.log calls in source.
    pure: ["console.log", "console.debug", "console.info"],
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
