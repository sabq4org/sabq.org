import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error Plain ESM Pages Function.
import { fetchSsrHtml } from "../../functions/_middleware.js";

describe("SSR response recovery", () => {
  afterEach(() => vi.unstubAllGlobals());
  const request = new Request("https://sabq.org/article/example");

  it("returns a complete render and preserves response metadata", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>خبر</html>", { headers: { "Content-Type": "text/html", "X-Render": "ok" } })));
    const response = await fetchSsrHtml(request, "https://ssr.example");
    expect(await response.text()).toBe("<html>خبر</html>");
    expect(response.headers.get("X-Render")).toBe("ok");
  });

  it("preserves an actual 404 instead of turning it into an indexable fallback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Missing", { status: 404 })));
    expect((await fetchSsrHtml(request, "https://ssr.example")).status).toBe(404);
  });

  it.each([502, 503])("rejects transient %i so the caller can recover", async status => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Unavailable", { status })));
    await expect(fetchSsrHtml(request, "https://ssr.example")).rejects.toThrow("SSR unavailable");
  });

  it("rejects an interrupted HTML stream before delivering a 200", async () => {
    const stream = new ReadableStream({ start(controller) { controller.error(new Error("Connection lost")); } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream, { headers: { "Content-Type": "text/html" } })));
    await expect(fetchSsrHtml(request, "https://ssr.example")).rejects.toThrow("Connection lost");
  });

  it("bounds the upstream wait", async () => {
    vi.stubGlobal("fetch", vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
    })));
    await expect(fetchSsrHtml(request, "https://ssr.example", 10)).rejects.toThrow();
  });
});
