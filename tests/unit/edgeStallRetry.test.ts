import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error Pages JS is untyped
import { fetchWithStallRetry, proxyToApi } from "../../functions/_middleware.js";

const hang = () =>
  vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init.signal!.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
  }));

afterEach(() => vi.unstubAllGlobals());

describe("origin stall retry (Cloudflare→Railway hang, 2026-09-08)", () => {
  it("aborts a stalled GET and succeeds on a fresh attempt", async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(hang())
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchWithStallRetry("https://origin.example/health", { method: "GET" }, { stallMs: 10, retries: 2 });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never retries a POST (one-shot body) and honours its deadline", async () => {
    const fetchMock = hang();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      fetchWithStallRetry("https://origin.example/api/x", { method: "POST" }, { stallMs: 10, retries: 2, deadlineMs: 20 }),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the overall deadline across attempts and gives up", async () => {
    const fetchMock = hang();
    vi.stubGlobal("fetch", fetchMock);
    const t0 = Date.now();
    await expect(
      fetchWithStallRetry("https://origin.example/health", { method: "GET" }, { stallMs: 15, retries: 2, deadlineMs: 40 }),
    ).rejects.toThrow();
    expect(Date.now() - t0).toBeLessThan(400);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it("leaves an unbounded GET unbounded on its final attempt", async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(hang())
      .mockImplementationOnce(hang())
      .mockImplementationOnce((_url: string, init: RequestInit) => {
        expect(init.signal).toBeUndefined();
        return Promise.resolve(new Response("late", { status: 200 }));
      });
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchWithStallRetry("https://origin.example/api/y", { method: "GET" }, { stallMs: 10, retries: 2 });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("propagates a real upstream error immediately without retrying", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("upstream unavailable"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      fetchWithStallRetry("https://origin.example/health", { method: "GET" }, { stallMs: 10, retries: 2 }),
    ).rejects.toThrow("upstream unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("proxyToApi routes GETs through the retry path", async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(hang())
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await proxyToApi(new Request("https://sabq.org/api/edge/home-bundle"), "https://origin.example", 5000);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 10_000);
});
