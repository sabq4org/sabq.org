import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { onRequest } from "../../functions/_middleware.js";

class PassThroughRewriter {
  on() { return this; }
  transform(res: Response) { return res; }
}

const contextFor = (url: string, next: () => Promise<Response>, env: Record<string, string> = {}, method = "GET", userAgent = "Mozilla/5.0") => ({
  request: new Request(url, { method, headers: { "User-Agent": userAgent } }),
  env,
  next,
  waitUntil: vi.fn((promise: Promise<unknown>) => promise),
});

beforeEach(() => {
  vi.stubGlobal("HTMLRewriter", PassThroughRewriter);
  vi.stubGlobal("caches", { default: { match: vi.fn().mockResolvedValue(undefined), put: vi.fn().mockResolvedValue(undefined) } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("homepage agent discovery Link header", () => {
  it("adds the link to the SPA homepage while preserving the body and existing Link values", async () => {
    const next = vi.fn(async () => new Response("spa", {
      status: 200,
      headers: { "Content-Type": "text/html", Link: '<https://example.test>; rel="preconnect"' },
    }));
    const response = await onRequest(contextFor("https://sabq.org/", next));

    expect(await response.text()).toBe("spa");
    expect(response.headers.get("Content-Signal")).toBe("search=yes, ai-input=yes, ai-train=no");
    expect(response.headers.get("Vary")).toContain("Accept");
    expect(response.headers.get("Link")).toBe('<https://example.test>; rel="preconnect", <https://sabq.org/llms.txt>; rel="describedby"; type="text/plain"');
  });

  it("covers an SSR response and is idempotent for an existing exact link", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const target = input instanceof Request ? input.url : String(input);
      if (target.includes("slug-redirect")) return Response.json({ redirect: null });
      if (target.includes("seo-meta")) return Response.json({ semanticHtml: "<p>الرئيسية</p>", jsonLd: {} });
      return new Response('<!doctype html><html><body><main><h1>الرئيسية</h1><script type="application/ld+json">{}</script></main></body></html>', {
        status: 200,
        headers: { "Content-Type": "text/html", Link: '<https://sabq.org/llms.txt>; rel="describedby"; type="text/plain"' },
      });
    });
    vi.stubGlobal("fetch", fetcher);
    const next = vi.fn(async () => new Response("spa", { headers: { "Content-Type": "text/html" } }));
    const response = await onRequest(contextFor("https://sabq.org/", next, {
      SSR_ROUTES: "on", NEXT_ORIGIN: "https://next.example", EDGE_SEO: "on",
    }, "GET", "Mozilla/5.0 (compatible; Googlebot/2.1)"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Link")).toBe('<https://sabq.org/llms.txt>; rel="describedby"; type="text/plain"');
    expect(next).not.toHaveBeenCalled();
  });

  it("adds the link on a cached homepage hit while preserving cache and security headers", async () => {
    const cacheMatch = vi.fn(async () => new Response("cached", { status: 200, headers: {
      "Content-Type": "text/html", "Cache-Control": "private, no-cache", "X-Custom": "keep",
    } }));
    vi.stubGlobal("caches", { default: { match: cacheMatch, put: vi.fn().mockResolvedValue(undefined) } });
    const next = vi.fn(async () => new Response("origin", { status: 200, headers: { "Content-Type": "text/html" } }));
    const cached = await onRequest(contextFor("https://sabq.org/", next, { CF_PAGES_COMMIT_SHA: "abc", EDGE_SEO: "on" }));
    expect(cached.headers.get("Link")).toContain('<https://sabq.org/llms.txt>; rel="describedby"; type="text/plain"');
    expect(await cached.text()).toBe("cached");
    expect(cached.headers.get("Cache-Control")).toBe("private, no-cache, must-revalidate, max-age=0");
    expect(cached.headers.get("X-Custom")).toBe("keep");
    expect(next).not.toHaveBeenCalled();
  });

  it("adds the link to HEAD while preserving the empty body", async () => {
    const head = await onRequest(contextFor("https://sabq.org/", async () => new Response(null, { status: 200, headers: { "Content-Type": "text/html", "Cache-Control": "private, no-store" } }), {}, "HEAD"));
    expect(head.headers.get("Link")).toContain('<https://sabq.org/llms.txt>; rel="describedby"; type="text/plain"');
    expect(head.body).toBeNull();
  });

  it("excludes noncanonical, private, API, error, redirect, and non-HTML responses", async () => {
    const next = vi.fn(async () => new Response("origin", { status: 200, headers: { "Content-Type": "text/html" } }));
    const preview = await onRequest(contextFor("https://preview.pages.dev/", next));
    expect(preview.headers.get("Link")).toBeNull();
    const asset = await onRequest(contextFor("https://sabq.org/app.js", async () => new Response("js", { status: 200, headers: { "Content-Type": "text/javascript" } })));
    expect(asset.headers.get("Link")).toBeNull();
    const privatePage = await onRequest(contextFor("https://sabq.org/login", async () => new Response("login", { status: 200, headers: { "Content-Type": "text/html" } })));
    expect(privatePage.headers.get("Link")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html></html>", { status: 200, headers: { "Content-Type": "text/html" } })));
    const api = await onRequest(contextFor("https://sabq.org/api/status", async () => new Response("<html></html>", { status: 200, headers: { "Content-Type": "text/html" } })));
    expect(api.headers.get("Link")).toBeNull();
    const error = await onRequest(contextFor("https://sabq.org/", async () => new Response("error", { status: 503, headers: { "Content-Type": "text/html" } })));
    expect(error.headers.get("Link")).toBeNull();
    const json = await onRequest(contextFor("https://sabq.org/", async () => Response.json({ ok: true })));
    expect(json.headers.get("Link")).toBeNull();
    const redirect = await onRequest(contextFor("https://sabq.org/section/", next));
    expect(redirect.status).toBe(301);
    expect(redirect.headers.get("Link")).toBeNull();
  });
});
