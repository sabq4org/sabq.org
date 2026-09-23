import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import { createServer } from "node:http";
import { seoProjectionCacheMiddleware } from "../../server/middleware/seoProjectionCache";
import { bumpSeoCacheGeneration } from "../../server/services/seoCacheInvalidation";

async function withServer(handler: (base: string, count: () => number) => Promise<void>) {
  const app = express();
  let calls = 0;
  app.use(seoProjectionCacheMiddleware);
  app.get("/api/articles/:slug/seo-bundle", async (_req, res) => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 30));
    res.json({ calls });
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server did not bind");
  try {
    await handler(`http://127.0.0.1:${address.port}`, () => calls);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

afterEach(() => bumpSeoCacheGeneration("test-isolation"));

describe("SEO projection cache", () => {
  it("caches successful projections and coalesces concurrent misses", async () => {
    await withServer(async (base, count) => {
      const responses = await Promise.all([
        fetch(`${base}/api/articles/cache-test/seo-bundle`),
        fetch(`${base}/api/articles/cache-test/seo-bundle`),
      ]);
      expect(responses[0].status).toBe(200);
      expect(responses[1].status).toBe(200);
      expect(count()).toBe(1);
      expect((await fetch(`${base}/api/articles/cache-test/seo-bundle`)).status).toBe(200);
      expect(count()).toBe(1);
    });
  });

  it("returns no-store 503 when publication invalidates an in-flight projection", async () => {
    await withServer(async (base, count) => {
      const pending = fetch(`${base}/api/articles/invalidation-test/seo-bundle`);
      setTimeout(() => bumpSeoCacheGeneration("test-publish"), 10);
      const response = await pending;
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(count()).toBe(1);
    });
  });
});
