import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests only — Playwright owns e2e/ (*.spec.ts); Vitest owns
// tests/unit/ (*.test.ts). The two globs never overlap.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@": path.resolve(import.meta.dirname, "client/src"),
    },
  },
});
