import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import apiOriginWorker from "../../cloudflare-worker/api-origin-worker.js";
import {
  SUMMARY_AUDIO_MAX_BYTES,
  summaryAudioCacheKey,
  summaryAudioPolicy,
} from "../../cloudflare-worker/public-audio-edge-cache.js";

const AUDIO_PATH = "/api/articles/%D8%B3%D8%A8%D9%82/summary-audio?tts=tafqit-v2";
const clip = (size = 64) => new Uint8Array(size).map((_, i) => i % 251);

const audioResponse = (body: Uint8Array = clip(), headers: Record<string, string> = {}) =>
  new Response(body, {
    status: 200,
    headers: {
      "content-type": "audio/wav",
      "content-length": String(body.byteLength),
      "cache-control": "private, no-store",
      "cdn-cache-control": "no-store",
      "x-tts-provider": "humain",
      "x-sabq-article-published": "1",
      ...headers,
    },
  });

const request = (path: string, init?: RequestInit) =>
  new Request(`https://api.sabq.org${path}`, {
    ...init,
    headers: { "cf-connecting-ip": "203.0.113.10", ...(init?.headers || {}) },
  });

const bytes = async (response: Response) => new Uint8Array(await response.arrayBuffer());

describe("api-origin-worker summary audio edge cache", () => {
  const store = new Map<string, Response>();
  const cache = {
    match: vi.fn(async (key: Request) => store.get(key.url)?.clone()),
    put: vi.fn(async (key: Request, response: Response) => { store.set(key.url, response.clone()); }),
    delete: vi.fn(async (key: Request) => store.delete(key.url)),
  };
  const env = { EDGE_PROXY_SHARED_SECRET: "test-secret", API_ORIGIN: "https://render.example" };
  let pending: Promise<unknown>[] = [];
  const ctx = { waitUntil: (promise: Promise<unknown>) => { pending.push(promise); } };
  const run = async (req: Request) => {
    const response = await apiOriginWorker.fetch(req, env, ctx);
    await Promise.all(pending);
    pending = [];
    return response;
  };

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("caches", { default: cache });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("serves repeat anonymous plays from the edge with the same bytes and provider", async () => {
    const body = clip(4096);
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(audioResponse(body)));
    vi.stubGlobal("fetch", fetchMock);

    const first = await run(request(AUDIO_PATH));
    const second = await run(request(AUDIO_PATH));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const signed = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(signed.get("x-sabq-proxy-signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(first.headers.get("x-edge-cache")).toBe("MISS");
    expect(second.headers.get("x-edge-cache")).toBe("HIT");
    expect(second.status).toBe(200);
    expect(second.headers.get("x-tts-provider")).toBe("humain");
    expect(await bytes(first)).toEqual(body);
    expect(await bytes(second)).toEqual(body);
    const storedKey = new URL((cache.put.mock.calls[0][0] as Request).url);
    expect(storedKey.hostname).toBe("api.sabq.org");
    expect(storedKey.searchParams.has("__sabq_edge_host")).toBe(false);
    const stored = cache.put.mock.calls[0][1] as Response;
    expect(stored.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=600");
    expect(stored.headers.get("cdn-cache-control")).toBe("public, max-age=600");
    expect(stored.headers.has("x-edge-cache")).toBe(false);
  });

  it("answers a Range request on a hit with the whole clip, as the origin does", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(audioResponse())));
    await run(request(AUDIO_PATH));
    const ranged = await run(request(AUDIO_PATH, { headers: { range: "bytes=0-1" } }));
    expect(ranged.status).toBe(200);
    expect(ranged.headers.get("x-edge-cache")).toBe("HIT");
    expect(new Headers((cache.match.mock.calls[1][0] as Request).headers).has("range")).toBe(false);
  });

  it("keys on the whole sorted query and the request Origin", () => {
    const key = (path: string, headers: Record<string, string> = {}) =>
      summaryAudioCacheKey(request(path, { headers })).url;
    expect(key("/api/articles/a/summary-audio?v=1&tts=x")).toBe(key("/api/articles/a/summary-audio?tts=x&v=1"));
    expect(key("/api/articles/a/summary-audio?tts=x")).not.toBe(key("/api/articles/a/summary-audio?tts=y"));
    expect(key("/api/articles/a/summary-audio")).not.toBe(key("/api/articles/b/summary-audio"));
    expect(key("/api/articles/a/summary-audio", { origin: "https://a.example" }))
      .not.toBe(key("/api/articles/a/summary-audio"));
    expect(new URL(key("/api/articles/a/summary-audio?__sabq_origin=present:https://evil.example")).searchParams
      .getAll("__sabq_origin")).toEqual(["absent"]);
  });

  it("never shares identity, fresh or non-GET requests", () => {
    const policy = (path: string, init?: RequestInit) => summaryAudioPolicy(request(path, init));
    expect(policy(AUDIO_PATH)).not.toBeNull();
    expect(policy(AUDIO_PATH, { headers: { cookie: "__cf_bm=abc" } })).not.toBeNull();
    expect(policy(AUDIO_PATH, { headers: { cookie: "connect.sid=s%3Aabc" } })).toBeNull();
    expect(policy(AUDIO_PATH, { headers: { authorization: "Bearer t" } })).toBeNull();
    expect(policy(AUDIO_PATH, { headers: { "x-session-id": "s" } })).toBeNull();
    expect(policy(AUDIO_PATH, { headers: { "cache-control": "no-cache" } })).toBeNull();
    expect(policy(`${AUDIO_PATH}&_nc=1`)).toBeNull();
    expect(policy(`${AUDIO_PATH}&_t=1`)).toBeNull();
    expect(policy(AUDIO_PATH, { method: "HEAD" })).toBeNull();
    expect(policy("/api/articles/a/summary-audio/extra")).toBeNull();
    expect(policy("/api/muqtarab/topics/1/summary-audio")).toBeNull();
  });

  it("passes identity requests straight to the origin every time", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(audioResponse()));
    vi.stubGlobal("fetch", fetchMock);
    const init = { headers: { cookie: "connect.sid=s%3Aabc" } };
    const first = await run(request(AUDIO_PATH, init));
    await run(request(AUDIO_PATH, init));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(cache.match).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
    expect(first.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each([
    ["a JSON error", () => new Response(JSON.stringify({ message: "x" }), {
      status: 200, headers: { "content-type": "application/json", "content-length": "15" } })],
    ["a 404", () => new Response("{}", { status: 404, headers: { "content-type": "audio/wav", "content-length": "2" } })],
    ["Set-Cookie", () => audioResponse(clip(), { "set-cookie": "sid=1" })],
    ["a compressed body", () => audioResponse(clip(), { "content-encoding": "gzip" })],
    ["Vary: Cookie", () => audioResponse(clip(), { vary: "Origin, Cookie" })],
    ["a foreign CORS origin", () => audioResponse(clip(), { "access-control-allow-origin": "https://other.example" })],
    ["no Content-Length", () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(clip()); controller.close(); },
    }), { status: 200, headers: { "content-type": "audio/wav" } })],
    ["an oversized clip", () => audioResponse(clip(SUMMARY_AUDIO_MAX_BYTES + 1))],
    ["a clip the guard did not confirm published", () => audioResponse(clip(), { "x-sabq-article-published": "" })],
  ])("does not store %s and passes it through", async (_label, make) => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(make()));
    vi.stubGlobal("fetch", fetchMock);
    const first = await run(request(AUDIO_PATH));
    await run(request(AUDIO_PATH));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(cache.put).not.toHaveBeenCalled();
    expect(first.headers.has("x-edge-cache")).toBe(false);
    expect(first.status).toBe(make().status);
  });

  it("refuses a cut transfer instead of storing or playing it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(audioResponse(clip(50), { "content-length": "100" })));
    const response = await run(request(AUDIO_PATH));
    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("drops a stored entry that no longer looks like shareable audio", async () => {
    const key = summaryAudioCacheKey(request(AUDIO_PATH));
    store.set(key.url, new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(audioResponse())));
    const response = await run(request(AUDIO_PATH));
    expect(response.headers.get("x-edge-cache")).toBe("MISS");
    expect(cache.delete).toHaveBeenCalledTimes(1);
  });

  it("leaves other article routes to the plain proxy", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(audioResponse()));
    vi.stubGlobal("fetch", fetchMock);
    await run(request("/api/articles/a"));
    await run(request("/api/articles/a"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(cache.match).not.toHaveBeenCalled();
  });
});
