import { defineConfig } from "vitest/config";
import path from "node:path";

// Kept separate from the client unit-test aliases: web-next and the client
// intentionally use the same @ prefix for different source roots.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/web-next/articleViewSeoRender.test.ts"],
  },
  resolve: {
    alias: {
      "@/components": path.resolve(import.meta.dirname, "web-next/components"),
      "@/lib": path.resolve(import.meta.dirname, "web-next/lib"),
      react: path.resolve(import.meta.dirname, "node_modules/react"),
      "react-dom/server": path.resolve(import.meta.dirname, "node_modules/react-dom/server.node.js"),
    },
  },
});
