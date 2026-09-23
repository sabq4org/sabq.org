import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import { createServer } from "node:http";
import { seoProjectionCacheMiddleware } from "../../server/middleware/seoProjectionCache";
import { bumpSeoCacheGeneration } from "../../server/services/seoCacheInvalidation";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withServer(
  handler: (base: string, count: () => number) => Promise<void>,
  routeDelay: () => Promise<void> = () => sleep(30),
) {
  const app = express();
  let calls = 0;
  app.use(seoProjectionCacheMiddleware);
  app.get("/api/articles/:slug/seo-bundle", async (_req, res) => {
    calls += 1;
    await routeDelay();
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
    // Deterministic instead of timer-based: the route handler signals once it
    // has entered (so the middleware has already registered the in-flight
    // promise), we bump the generation synchronously, then let the handler
    // resolve. This avoids racing a 10ms "invalidate" timer against a 30ms
    // "handler" timer, which can flip order under CI load and made the test
    // flaky regardless of the middleware's actual behavior.
    let handlerEntered!: () => void;
    const entered = new Promise<void>((resolve) => {
      handlerEntered = resolve;
    });
    let releaseHandler!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseHandler = resolve;
    });

    await withServer(async (base, count) => {
      const pending = fetch(`${base}/api/articles/invalidation-test/seo-bundle`);
      await entered;
      bumpSeoCacheGeneration("test-publish");
      releaseHandler();
      const response = await pending;
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(count()).toBe(1);
    }, async () => {
      handlerEntered();
      await gate;
    });
  });
});
