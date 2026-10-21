import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  acceptsMarkdown,
  applyPublicContentHeaders,
  onRequest,
  shouldApplyPublicContentHeaders,
} from "../../functions/_middleware.js";

const match = vi.fn();
const fetcher = vi.fn();
const put = vi.fn();
const del = vi.fn();
class PassThroughRewriter {
  on() { return this; }
  transform(res: Response) { return res; }
}

beforeEach(() => {
  vi.clearAllMocks();
  match.mockResolvedValue(undefined);
  put.mockResolvedValue(undefined);
  del.mockResolvedValue(undefined);
  vi.stubGlobal("caches", { default: { match, put, delete: del } });
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("HTMLRewriter", PassThroughRewriter);
});

describe("AI readiness at the Pages edge", () => {
  it.each([
    ["text/markdown", true],
    ["text/markdown;q=0.9, text/html;q=0.8", true],
    ["text/markdown;q=0.5, text/*;q=0.8, */*;q=0.1", false],
    ["*/*;q=0.9, text/*;q=0.8, text/markdown;q=0.7", false],
    ["*/*", false],
    ["text/*", false],
    ["*/*;q=0.9, text/html;q=1", false],
    ["text/markdown;q=0, text/html", false],
    ["text/markdown;q=0.5, text/html;q=1", false],
    ["text/html", false],
  ])("parses Markdown negotiation %s", (accept, expected) => {
    expect(acceptsMarkdown(accept)).toBe(expected);
  });

  it("adds Content-Signal and Vary: Accept to public HTML", async () => {
    const body = "<!doctype html><html><body>خبر</body></html>";
    const response = applyPublicContentHeaders(new Response(body, {
      headers: { "Content-Type": "text/html; charset=utf-8", Vary: "User-Agent" },
    }));

    expect(await response.text()).toBe(body);
    expect(response.headers.get("Content-Signal")).toBe("search=yes, ai-input=yes, ai-train=no");
    expect(response.headers.get("Vary")).toBe("User-Agent, Accept");
  });

  it("adds the signal on a normal public HTML fallback", async () => {
    const next = vi.fn(async () => new Response("<html><body>fallback</body></html>", {
      headers: { "Content-Type": "text/html" },
    }));
    const response = await onRequest({
      waitUntil: vi.fn(),
      request: new Request("https://sabq.org/about", { method: "GET" }),
      env: { EDGE_SEO: "off" },
      next,
    });

    expect(response.headers.get("Content-Signal")).toBe("search=yes, ai-input=yes, ai-train=no");
    expect(response.headers.get("Vary")).toContain("Accept");
  });

  it("adds the signal on an edge HTML cache hit", async () => {
    match.mockResolvedValue(new Response("<html><body>cached</body></html>", {
      headers: { "Content-Type": "text/html" },
    }));
    const response = await onRequest({
      waitUntil: vi.fn(),
      request: new Request("https://sabq.org/about", { method: "GET" }),
      env: { EDGE_SEO: "on", CF_PAGES_COMMIT_SHA: "test" },
      next: vi.fn(),
    });

    expect(response.headers.get("Content-Signal")).toBe("search=yes, ai-input=yes, ai-train=no");
    expect(response.headers.get("x-edge-cache")).toBe("HIT");
  });

  it.each(["ChatGPT-User/1.0", "Claude-User", "Perplexity-User/1.0"])(
    "routes %s through SSR",
    async (userAgent) => {
      const html = "<html><head><script type=\"application/ld+json\">{\"@type\":\"NewsArticle\"}</script></head><body><h1>خبر</h1></body></html>";
      fetcher.mockImplementation((target) => String(target).includes("slug-redirect")
        ? Promise.resolve(Response.json({}))
        : Promise.resolve(new Response(html, { headers: { "Content-Type": "text/html" } })));
      const next = vi.fn();
      const response = await onRequest({
        waitUntil: vi.fn(),
        request: new Request("https://sabq.org/article/story", { headers: { "User-Agent": userAgent } }),
        env: { SSR_ROUTES: "on", EDGE_SEO: "on", NEXT_ORIGIN: "https://next.sabq.org" },
        next,
      });

      expect(response.status).toBe(200);
      expect(await response.text()).toBe(html);
      expect(fetcher).toHaveBeenCalledWith("https://next.sabq.org/article/story", expect.objectContaining({ method: "GET" }));
      expect(response.headers.get("Content-Signal")).toBe("search=yes, ai-input=yes, ai-train=no");
      expect(next).not.toHaveBeenCalled();
    },
  );

  it("routes an explicit Markdown request through SSR and isolates its cache variant", async () => {
    const html = "<html><head><script type=\"application/ld+json\">{\"@type\":\"NewsArticle\"}</script></head><body><h1>خبر</h1></body></html>";
    fetcher.mockImplementation((target) => String(target).includes("slug-redirect")
      ? Promise.resolve(Response.json({}))
      : Promise.resolve(new Response(html, { headers: { "Content-Type": "text/html" } })));
    const next = vi.fn();
    const response = await onRequest({
      waitUntil: vi.fn(),
      request: new Request("https://sabq.org/article/story", {
        headers: { Accept: "text/markdown", "User-Agent": "Mozilla/5.0" },
      }),
      env: { SSR_ROUTES: "on", EDGE_SEO: "on", NEXT_ORIGIN: "https://next.sabq.org", CF_PAGES_COMMIT_SHA: "test" },
      next,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Signal")).toBe("search=yes, ai-input=yes, ai-train=no");
    expect(response.headers.get("Vary")).toContain("Accept");
    expect(fetcher).toHaveBeenCalledWith("https://next.sabq.org/article/story", expect.objectContaining({ method: "GET" }));
    expect(match.mock.calls[0]?.[0]?.url).toContain("__v=m");
  });

  it("does not add public signaling to noindex or noncanonical HTML", () => {
    const html = new Response("<html></html>", { headers: { "Content-Type": "text/html" } });
    expect(shouldApplyPublicContentHeaders("/login", "sabq.org", html)).toBe(false);
    expect(shouldApplyPublicContentHeaders("/article/story", "www.sabq.org", html)).toBe(false);
    expect(shouldApplyPublicContentHeaders("/article/story", "sabq.org", new Response("<html></html>", {
      status: 503,
      headers: { "Content-Type": "text/html" },
    }))).toBe(false);
    expect(shouldApplyPublicContentHeaders("/article/story", "sabq.org", html, new Request("https://sabq.org/article/story", {
      headers: { Cookie: "connect.sid=private" },
    }))).toBe(false);
  });

  it("keeps auth, noindex, HEAD, and error boundaries behavioral", async () => {
    const html = "<html><body>boundary</body></html>";
    const next = vi.fn(async () => new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    }));
    const authenticated = await onRequest({
      waitUntil: vi.fn(),
      request: new Request("https://sabq.org/article/story", {
        headers: { "User-Agent": "ChatGPT-User", Cookie: "connect.sid=private" },
      }),
      env: { SSR_ROUTES: "on", EDGE_SEO: "off", NEXT_ORIGIN: "https://next.sabq.org" },
      next,
    });
    expect(authenticated.headers.get("Content-Signal")).toBeNull();
    expect(next).toHaveBeenCalled();

    const noindex = await onRequest({
      waitUntil: vi.fn(),
      request: new Request("https://sabq.org/login"),
      env: { EDGE_SEO: "off" },
      next: vi.fn(async () => new Response(html, {
        headers: { "Content-Type": "text/html", "X-Robots-Tag": "noindex, follow" },
      })),
    });
    expect(noindex.headers.get("Content-Signal")).toBeNull();

    const head = await onRequest({
      waitUntil: vi.fn(),
      request: new Request("https://sabq.org/about", { method: "HEAD" }),
      env: { EDGE_SEO: "off" },
      next: vi.fn(async () => new Response(null, { headers: { "Content-Type": "text/html" } })),
    });
    expect(head.headers.get("Content-Signal")).toBe("search=yes, ai-input=yes, ai-train=no");
    expect(head.body).toBeNull();

    const error = await onRequest({
      waitUntil: vi.fn(),
      request: new Request("https://sabq.org/about"),
      env: { EDGE_SEO: "off" },
      next: vi.fn(async () => new Response(html, { status: 503, headers: { "Content-Type": "text/html" } })),
    });
    expect(error.headers.get("Content-Signal")).toBeNull();
  });

  it("propagates resolved SEO noindex to X-Robots-Tag on the injected fallback", async () => {
    fetcher.mockImplementation((target) => {
      if (String(target).includes("slug-redirect")) return Promise.resolve(Response.json({}));
      return Promise.resolve(Response.json({ title: "غير موجود", robots: "noindex, follow" }));
    });
    const response = await onRequest({
      waitUntil: vi.fn(),
      request: new Request("https://sabq.org/article/missing"),
      env: { EDGE_SEO: "on" },
      next: vi.fn(async () => new Response("<html><head></head><body><div id=\"root\"></div></body></html>", {
        headers: { "Content-Type": "text/html" },
      })),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, follow");
    expect(response.headers.get("Content-Signal")).toBeNull();
    expect(response.headers.get("CDN-Cache-Control")).toContain("no-store");
  });
});
