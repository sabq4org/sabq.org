import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isEdgeRateLimited,
  proxyToApiWithFallback,
  resolveFallbackOrigin,
  // @ts-expect-error Pages JS is untyped
} from "../../functions/_middleware.js";

const PRIMARY = "https://sabqorg-production.up.railway.app";
const FALLBACK = "https://api.sabq.org";

// Railway's edge (hikari) answers this itself: plain text, no request id.
const edge429 = () =>
  new Response("rate limited", {
    status: 429,
    headers: { "content-type": "text/plain; charset=utf-8", "x-railway-edge": "cdg1" },
  });

// Our own express-rate-limit answer always passes through the container.
const app429 = () =>
  new Response(JSON.stringify({ message: "Too many requests" }), {
    status: 429,
    headers: { "content-type": "application/json", "x-railway-request-id": "abc123" },
  });

const calledOrigins = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.map((c) => new URL(String(c[0])).origin);

afterEach(() => vi.unstubAllGlobals());

describe("Railway edge 429 detection (incident 2026-09-17)", () => {
  it("flags a 429 without x-railway-request-id as an edge block", () => {
    expect(isEdgeRateLimited(edge429())).toBe(true);
  });

  it("does not flag the app's own 429 or any other status", () => {
    expect(isEdgeRateLimited(app429())).toBe(false);
    expect(isEdgeRateLimited(new Response("ok", { status: 200 }))).toBe(false);
    expect(isEdgeRateLimited(new Response("x", { status: 503 }))).toBe(false);
  });
});

describe("resolveFallbackOrigin", () => {
  it("detours the direct Railway origin through api.sabq.org by default", () => {
    expect(resolveFallbackOrigin(PRIMARY, {})).toBe(FALLBACK);
  });

  it("detours api.sabq.org through the direct Railway origin", () => {
    expect(resolveFallbackOrigin(FALLBACK, {})).toBe(PRIMARY);
  });

  it("honours API_FALLBACK_ORIGIN and strips trailing slashes", () => {
    expect(resolveFallbackOrigin(PRIMARY, { API_FALLBACK_ORIGIN: "https://alt.example/" })).toBe(
      "https://alt.example",
    );
  });

  it("returns null when disabled, misconfigured, or equal to the primary", () => {
    expect(resolveFallbackOrigin(PRIMARY, { API_FALLBACK_ORIGIN: "off" })).toBeNull();
    expect(resolveFallbackOrigin(PRIMARY, { API_FALLBACK_ORIGIN: "not a url" })).toBeNull();
    expect(resolveFallbackOrigin(PRIMARY, { API_FALLBACK_ORIGIN: `${PRIMARY}/` })).toBeNull();
  });
});

describe("proxyToApiWithFallback", () => {
  it("retries a GET through the fallback origin after an edge 429", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(edge429())
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await proxyToApiWithFallback(
      new Request("https://sabq.org/api/homepage-lite"),
      PRIMARY,
      FALLBACK,
      5000,
    );
    expect(res.status).toBe(200);
    expect(calledOrigins(fetchMock)).toEqual([PRIMARY, FALLBACK]);
  });

  it("returns the primary edge 429 when the fallback is blocked too", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(edge429()).mockResolvedValueOnce(edge429());
    vi.stubGlobal("fetch", fetchMock);
    const res = await proxyToApiWithFallback(
      new Request("https://sabq.org/api/articles?limit=1"),
      PRIMARY,
      FALLBACK,
    );
    expect(res.status).toBe(429);
    expect(isEdgeRateLimited(res)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns the primary edge 429 when the fallback throws", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(edge429())
      .mockRejectedValueOnce(new Error("fallback unreachable"));
    vi.stubGlobal("fetch", fetchMock);
    const res = await proxyToApiWithFallback(new Request("https://sabq.org/api/x"), PRIMARY, FALLBACK);
    expect(res.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never detours the app's own 429 (real per-client throttling)", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(app429());
    vi.stubGlobal("fetch", fetchMock);
    const res = await proxyToApiWithFallback(new Request("https://sabq.org/api/x"), PRIMARY, FALLBACK);
    expect(res.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never replays a POST", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(edge429());
    vi.stubGlobal("fetch", fetchMock);
    const res = await proxyToApiWithFallback(
      new Request("https://sabq.org/api/auth/login", { method: "POST", body: "{}" }),
      PRIMARY,
      FALLBACK,
    );
    expect(res.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does nothing extra without a fallback origin", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(edge429());
    vi.stubGlobal("fetch", fetchMock);
    const res = await proxyToApiWithFallback(new Request("https://sabq.org/api/x"), PRIMARY, null);
    expect(res.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("passes a healthy response straight through", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await proxyToApiWithFallback(new Request("https://sabq.org/api/x"), PRIMARY, FALLBACK);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
