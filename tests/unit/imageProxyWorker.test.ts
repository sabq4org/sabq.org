import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { isServableImageType } from "../../cloudflare-worker/image-proxy-worker.js";

const store = new Map<string, Response>();
(globalThis as any).caches = {
  default: {
    match: async (req: Request) => store.get(req.url)?.clone(),
    put: async (req: Request, res: Response) => void store.set(req.url, res),
    delete: async (req: Request) => store.delete(req.url),
  },
};
const ctx = { waitUntil: (p: Promise<unknown>) => void p };

afterEach(() => {
  store.clear();
  vi.unstubAllGlobals();
});

describe("image-proxy worker (sabq.org/cdn-img/*)", () => {
  it("only treats raster image types as servable", () => {
    expect(isServableImageType("image/jpeg")).toBe(true);
    expect(isServableImageType("image/webp; charset=binary")).toBe(true);
    expect(isServableImageType("image/svg+xml")).toBe(false);
    expect(isServableImageType("text/html")).toBe(false);
    expect(isServableImageType(null)).toBe(false);
  });

  it("refuses an SVG from an attacker bucket instead of serving it on sabq.org", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>', {
        headers: { "Content-Type": "image/svg+xml" },
      })));
    const res = await worker.fetch(new Request("https://sabq.org/cdn-img/evil-bucket/x.svg"), {}, ctx);
    expect(res.status).toBe(415);
    expect(await res.text()).not.toContain("<svg");
    expect(store.size).toBe(0);
  });

  it("does not serve an SVG that was cached before the fix", async () => {
    const url = "https://sabq.org/cdn-img/evil-bucket/old.svg";
    store.set(url, new Response("<svg/>", { headers: { "Content-Type": "image/svg+xml" } }));
    const res = await worker.fetch(new Request(url), {}, ctx);
    expect(res.status).toBe(415);
    expect(store.has(url)).toBe(false);
  });

  it("still proxies JPEGs with nosniff and a sandbox CSP", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("jpegbytes", { headers: { "Content-Type": "image/jpeg" } })));
    const res = await worker.fetch(new Request("https://sabq.org/cdn-img/sabq-news-photos/a.jpg"), {}, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Security-Policy")).toContain("sandbox");
  });
});
