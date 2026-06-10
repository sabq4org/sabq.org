import { describe, it, expect } from "vitest";
import type { Request, Response } from "express";
import {
  cacheControl,
  noCache,
  withETag,
  AUTOSCALE_CACHE,
  PRIVATE_CACHE,
} from "../../server/cacheMiddleware";

// Minimal ServerResponse stand-in: header names are case-insensitive (like
// Node), and writeHead is bind-able so the middleware's late-override works.
function makeRes() {
  const headers = new Map<string, string>();
  let statusCode = 0;
  let ended = false;
  const res = {
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
    },
    removeHeader(name: string) {
      headers.delete(name.toLowerCase());
    },
    getHeader(name: string) {
      return headers.get(name.toLowerCase());
    },
    writeHead(code: number) {
      statusCode = code;
      return res;
    },
    status(code: number) {
      statusCode = code;
      return res;
    },
    end() {
      ended = true;
      return res;
    },
  };
  return {
    res: res as unknown as Response,
    header: (n: string) => headers.get(n.toLowerCase()),
    getStatus: () => statusCode,
    wasEnded: () => ended,
  };
}

function runCacheControl(options?: Parameters<typeof cacheControl>[0]) {
  const h = makeRes();
  cacheControl(options)({} as Request, h.res, () => {});
  // Header is applied at writeHead time (after session middleware etc.)
  (h.res as unknown as { writeHead: (c: number) => void }).writeHead(200);
  return h;
}

describe("cacheControl — header construction", () => {
  it("defaults: public, max-age=300, s-maxage=600 (edge = 2x browser)", () => {
    const h = runCacheControl();
    expect(h.header("Cache-Control")).toBe("public, max-age=300, s-maxage=600");
  });

  it("AUTOSCALE HOMEPAGE preset: edge-only caching with SWR", () => {
    const h = runCacheControl({ ...AUTOSCALE_CACHE.HOMEPAGE });
    expect(h.header("Cache-Control")).toBe(
      "public, max-age=0, s-maxage=60, stale-while-revalidate=120",
    );
  });

  it("PRIVATE_CACHE preset: private, browser-only, never s-maxage", () => {
    const h = runCacheControl({ ...PRIVATE_CACHE.DASHBOARD_STATS });
    expect(h.header("Cache-Control")).toBe(
      "private, max-age=60, stale-while-revalidate=120",
    );
    expect(h.header("Cache-Control")).not.toContain("s-maxage");
  });

  it("immutable assets include the immutable directive", () => {
    const h = runCacheControl({ maxAge: 31536000, immutable: true });
    expect(h.header("Cache-Control")).toContain("immutable");
  });

  it("KNOWN FOOTGUN (documented, do not 'fix' silently): {maxAge:0, sMaxAge:0} emits public, not private", () => {
    // See memory/per-user-data-shared-cache-trap: callers wanting a truly
    // private response must pass public:false — zeroing both ages still
    // yields a PUBLIC header. This test pins the current behavior so any
    // change to it is deliberate and reviewed.
    const h = runCacheControl({ maxAge: 0, sMaxAge: 0 });
    expect(h.header("Cache-Control")).toBe("public, max-age=0");
  });

  it("overrides any Cache-Control set earlier in the chain", () => {
    const h = makeRes();
    cacheControl({ maxAge: 60 })({} as Request, h.res, () => {});
    h.res.setHeader("Cache-Control", "no-store"); // e.g. set by another layer
    (h.res as unknown as { writeHead: (c: number) => void }).writeHead(200);
    expect(h.header("Cache-Control")).toBe("public, max-age=60, s-maxage=120");
  });

  it("always ships Vary and the Vercel opaque-cache kill switch", () => {
    const h = runCacheControl();
    expect(h.header("Vary")).toBe("Accept-Encoding");
    expect(h.header("Vercel-CDN-Cache-Control")).toBe("no-store");
  });
});

describe("noCache", () => {
  it("emits the full no-store trio", () => {
    const h = makeRes();
    noCache()({} as Request, h.res, () => {});
    (h.res as unknown as { writeHead: (c: number) => void }).writeHead(200);
    expect(h.header("Cache-Control")).toBe("no-cache, no-store, must-revalidate");
    expect(h.header("Pragma")).toBe("no-cache");
    expect(h.header("Expires")).toBe("0");
  });
});

describe("withETag", () => {
  it("returns 304 and true when If-None-Match matches", () => {
    const h = makeRes();
    const req = { headers: { "if-none-match": 'W/"abc"' } } as unknown as Request;
    const handled = withETag(req, h.res, { x: 1 }, 'W/"abc"');
    expect(handled).toBe(true);
    expect(h.getStatus()).toBe(304);
    expect(h.wasEnded()).toBe(true);
  });

  it("sets the ETag and returns false on mismatch", () => {
    const h = makeRes();
    const req = { headers: {} } as unknown as Request;
    const handled = withETag(req, h.res, { x: 1 }, 'W/"abc"');
    expect(handled).toBe(false);
    expect(h.header("ETag")).toBe('W/"abc"');
  });
});
