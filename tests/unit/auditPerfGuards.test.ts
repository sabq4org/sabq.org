// تدقيق 2026-11-10: حراس الأداء والاعتمادية.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(resolve(__dirname, "../..", rel), "utf8");

describe("view tracking keys", () => {
  const routes = read("server/routes.ts");
  const start = routes.indexOf('app.post("/api/articles/:id/view"');
  const block = routes.slice(start, routes.indexOf("\n  });\n", start));

  it("live in their own cache, not the shared content cache", () => {
    expect(start).toBeGreaterThan(-1);
    expect(block).toContain("viewTrackingCache.set(viewDedupKey");
    expect(block).not.toMatch(/(?<![A-Za-z])memoryCache\./);
  });

  it("the dedicated cache is far larger than the shared 5000-entry one", () => {
    expect(read("server/memoryCache.ts")).toMatch(/viewTrackingCache = new MemoryCache\(100_000, 'viewTracking'\)/);
  });

  it("rejects oversized ids before they become cache keys", () => {
    expect(block).toContain("articleId.length > 64");
  });
});

describe("open aggregate endpoint", () => {
  it("GET /api/categories/:slug/analytics is gone", () => {
    expect(read("server/routes.ts")).not.toContain('app.get("/api/categories/:slug/analytics"');
  });
});

describe("Cloudflare purge", () => {
  it("every purge request carries a timeout", () => {
    const src = read("server/services/cloudflarePurge.ts");
    const fetches = src.match(/await fetch\(/g)?.length ?? 0;
    const timeouts = src.match(/signal: AbortSignal\.timeout\(PURGE_REQUEST_TIMEOUT_MS\)/g)?.length ?? 0;
    expect(fetches).toBeGreaterThan(0);
    expect(timeouts).toBe(fetches);
  });
});
