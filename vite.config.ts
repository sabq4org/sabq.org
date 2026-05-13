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
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-dom/client'],
          'vendor-core': ['wouter', '@tanstack/react-query'],
          'vendor-ui': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-tabs',
            '@radix-ui/react-select',
            '@radix-ui/react-popover',
            '@radix-ui/react-accordion',
            '@radix-ui/react-avatar',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-label',
            '@radix-ui/react-switch',
            '@radix-ui/react-slot',
          ],
          'vendor-charts': ['recharts'],
          'vendor-editor': [
            '@tiptap/react',
            '@tiptap/starter-kit',
          ],
          'vendor-motion': ['framer-motion'],
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
