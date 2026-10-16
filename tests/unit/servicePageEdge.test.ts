import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error Pages middleware has no TypeScript declaration.
import { onRequest } from "../../functions/_middleware.js";

class PassThroughRewriter {
  on() { return this; }
  transform(res: Response) { return res; }
}

const put = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  put.mockResolvedValue(undefined);
  vi.stubGlobal("caches", { default: { match: vi.fn().mockResolvedValue(undefined), put } });
  vi.stubGlobal("HTMLRewriter", PassThroughRewriter);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("service page edge branch", () => {
  it("sends human visitors to the SPA shell instead of a standalone document", async () => {
    const next = vi.fn(async () => new Response("spa-shell", { headers: { "Content-Type": "text/html" } }));
    const response = await onRequest({
      request: new Request("https://sabq.org/services/government-salaries-date", { headers: { "User-Agent": "Mozilla/5.0" } }),
      env: { CF_PAGES_COMMIT_SHA: "abc" },
      next,
      waitUntil: vi.fn((promise: Promise<unknown>) => promise),
    });
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toBe("spa-shell");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(response.headers.get("Cache-Control") || "").toContain("no-store");
    expect(next).toHaveBeenCalled();
  });

  it("asks Next for the service page when the visitor is a crawler", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/edge/slug-redirect")) return Response.json({ redirect: null });
      if (url.includes("next.example")) {
        return new Response(
          `<!doctype html><html><body><main><h1>موعد صرف رواتب موظفي الدولة</h1><script type="application/ld+json">{}</script></main></body></html>`,
          { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
        );
      }
      return new Response("missing", { status: 404 });
    });
    vi.stubGlobal("fetch", fetcher);
    const next = vi.fn(async () => new Response("spa-shell", { headers: { "Content-Type": "text/html" } }));
    const response = await onRequest({
      request: new Request("https://sabq.org/services/government-salaries-date", { headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" } }),
      env: {
        CF_PAGES_COMMIT_SHA: "abc",
        SSR_ROUTES: "on",
        NEXT_ORIGIN: "https://next.example",
        EDGE_SEO: "on",
      },
      next,
      waitUntil: vi.fn((promise: Promise<unknown>) => promise),
    });
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("موعد صرف رواتب موظفي الدولة");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(response.headers.get("Cache-Control") || "").toContain("no-store");
    expect(fetcher.mock.calls.some((call) => String(call[0]).includes("next.example"))).toBe(true);
    expect(next).not.toHaveBeenCalled();
  });
});
