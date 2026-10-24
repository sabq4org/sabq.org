import { describe, expect, it, vi } from "vitest";
import {
  VIDEO_EDGE_MAX_BYTES,
  createVideoEdgeCache,
  videoEdgeCacheKey,
} from "../../cloudflare-worker/video-edge-cache.js";

const TWEET = "2113743264717164774";

// Stand-in for caches.default: keeps full 200 bodies and answers a Range with
// 206, as Cloudflare's cache.match does.
function memoryCache() {
  const store = new Map<string, { body: ArrayBuffer; headers: Headers }>();
  return {
    store,
    put: vi.fn(async (key: Request, res: Response) => {
      store.set(key.url, { body: await res.arrayBuffer(), headers: new Headers(res.headers) });
    }),
    match: vi.fn(async (key: Request) => {
      const entry = store.get(key.url);
      if (!entry) return undefined;
      const range = key.headers.get("range");
      if (!range) return new Response(entry.body.slice(0), { status: 200, headers: entry.headers });
      const [, from, to] = /bytes=(\d+)-(\d*)/.exec(range) || [];
      const end = to ? Number(to) : entry.body.byteLength - 1;
      const headers = new Headers(entry.headers);
      headers.set("content-range", `bytes ${from}-${end}/${entry.body.byteLength}`);
      return new Response(entry.body.slice(Number(from), end + 1), { status: 206, headers });
    }),
  };
}

const video = (bytes = 1000, headers: Record<string, string> = {}) =>
  new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { "content-type": "video/mp4", "content-length": String(bytes), ...headers },
  });

const play = (range?: string, extra: Record<string, string> = {}, method = "GET") =>
  new Request(`https://sabq.org/api/video/stream/${TWEET}`, {
    method,
    headers: { "cf-connecting-ip": "203.0.113.7", cookie: "connect.sid=s%3Aabc", ...(range ? { range } : {}), ...extra },
  });

async function run(serve: ReturnType<typeof createVideoEdgeCache>, request: Request, cache: ReturnType<typeof memoryCache>, fetchOrigin: ReturnType<typeof vi.fn>) {
  const pending: Promise<unknown>[] = [];
  const res = await serve(request, { cache, waitUntil: (p: Promise<unknown>) => pending.push(p), fetchOrigin });
  await Promise.all(pending);
  return res;
}

describe("X video edge copy", () => {
  it("relays a miss, keeps the whole file once, then answers Ranges from the copy", async () => {
    const serve = createVideoEdgeCache();
    const cache = memoryCache();
    const fetchOrigin = vi.fn(async () => video(1000));

    expect(await run(serve, play("bytes=0-"), cache, fetchOrigin)).toBeNull();
    expect(fetchOrigin).toHaveBeenCalledTimes(1);
    const fill = fetchOrigin.mock.calls[0][0] as Request;
    expect(fill.headers.has("range")).toBe(false);
    expect(fill.headers.has("cookie")).toBe(false);
    expect(fill.headers.get("cf-connecting-ip")).toBe("203.0.113.7");
    const stored = cache.store.get(videoEdgeCacheKey(play(), TWEET).url);
    expect(stored?.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(stored?.headers.get("accept-ranges")).toBe("bytes");

    const hit = await run(serve, play("bytes=100-199"), cache, fetchOrigin);
    expect(hit?.status).toBe(206);
    expect(hit?.headers.get("content-range")).toBe("bytes 100-199/1000");
    expect(hit?.headers.get("x-edge-cache")).toBe("HIT");
    expect((await hit!.arrayBuffer()).byteLength).toBe(100);
    expect(fetchOrigin).toHaveBeenCalledTimes(1);
  });

  it("starts one fill per video while plays arrive together", async () => {
    const serve = createVideoEdgeCache();
    const cache = memoryCache();
    let release: () => void = () => {};
    const fetchOrigin = vi.fn(() => new Promise<Response>((resolve) => { release = () => resolve(video()); }));
    const pending: Promise<unknown>[] = [];
    const opts = { cache, waitUntil: (p: Promise<unknown>) => pending.push(p), fetchOrigin };

    await Promise.all([serve(play("bytes=0-"), opts), serve(play("bytes=0-"), opts), serve(play(), opts)]);
    release();
    await Promise.all(pending);
    expect(fetchOrigin).toHaveBeenCalledTimes(1);
  });

  it("keeps nothing that is not a whole, plain video, and does not retry it at once", async () => {
    for (const bad of [
      () => video(1000, { "content-type": "application/json" }),
      () => video(1000, { "set-cookie": "a=b" }),
      () => video(1000, { "content-encoding": "gzip" }),
      () => new Response(new Uint8Array(10), { status: 206, headers: { "content-type": "video/mp4", "content-length": "10" } }),
      () => new Response("x", { status: 502, headers: { "content-type": "video/mp4" } }),
    ]) {
      const serve = createVideoEdgeCache();
      const cache = memoryCache();
      const fetchOrigin = vi.fn(async () => bad());
      expect(await run(serve, play(), cache, fetchOrigin)).toBeNull();
      expect(await run(serve, play(), cache, fetchOrigin)).toBeNull();
      expect(cache.put).not.toHaveBeenCalled();
      expect(fetchOrigin).toHaveBeenCalledTimes(1);
    }
  });

  it("does not keep a file above the size bound", async () => {
    const serve = createVideoEdgeCache();
    const cache = memoryCache();
    const big = new Response("x", {
      status: 200,
      headers: { "content-type": "video/mp4", "content-length": String(VIDEO_EDGE_MAX_BYTES + 1) },
    });
    const fetchOrigin = vi.fn(async () => big);
    expect(await run(serve, play(), cache, fetchOrigin)).toBeNull();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("backs off when the cache silently stores nothing", async () => {
    const serve = createVideoEdgeCache();
    const cache = memoryCache();
    cache.put.mockImplementation(async () => {});
    const fetchOrigin = vi.fn(async () => video());
    await run(serve, play(), cache, fetchOrigin);
    await run(serve, play(), cache, fetchOrigin);
    expect(fetchOrigin).toHaveBeenCalledTimes(1);
  });

  it("leaves HEAD, other paths and bad ids to the origin relay", async () => {
    const serve = createVideoEdgeCache();
    const cache = memoryCache();
    const fetchOrigin = vi.fn(async () => video());
    expect(await run(serve, play(undefined, {}, "HEAD"), cache, fetchOrigin)).toBeNull();
    expect(await run(serve, new Request("https://sabq.org/api/video/stream/abc"), cache, fetchOrigin)).toBeNull();
    expect(await run(serve, new Request("https://sabq.org/api/video/resolve"), cache, fetchOrigin)).toBeNull();
    expect(cache.match).not.toHaveBeenCalled();
    expect(fetchOrigin).not.toHaveBeenCalled();
  });

  it("keeps a reflected CORS answer apart from the Origin-less one", () => {
    const plain = videoEdgeCacheKey(play(), TWEET).url;
    const withOrigin = videoEdgeCacheKey(play(undefined, { origin: "https://sabq.org" }), TWEET).url;
    expect(plain).not.toBe(withOrigin);
    expect(new URL(plain).searchParams.get("__sabq_origin")).toBe("absent");
  });
});
