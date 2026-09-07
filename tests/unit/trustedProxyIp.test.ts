import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "node:http";
import { getRealIp, originGate, verifiedProxyIp } from "../../server/utils/trustedProxyIp";
import { cachedJson, proxyToApi, signProxyRequest } from "../../functions/_middleware.js";

const secret = "test-edge-secret";
const now = 1_788_570_000_000;

function makeRequest(at = now, overrides: Record<string, unknown> = {}) {
  const ip = "198.51.100.7";
  const timestamp = String(at);
  const method = "POST";
  const originalUrl = "/api/v1/auth/login?source=web";
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}\n${method}\n${originalUrl}\n${ip}`)
    .digest("hex");
  return {
    method,
    originalUrl,
    ip: "203.0.113.9",
    headers: {
      "x-sabq-client-ip": ip,
      "x-sabq-proxy-timestamp": timestamp,
      "x-sabq-proxy-signature": signature,
      ...overrides,
    },
  };
}

describe("trusted edge IP", () => {
  afterEach(() => vi.restoreAllMocks());
  it("accepts a fresh signature bound to method, path, query, and IP", () => {
    expect(verifiedProxyIp(makeRequest(), secret, now, true)).toBe("198.51.100.7");
  });

  it("rejects expired, altered, and malformed signatures", () => {
    expect(verifiedProxyIp(makeRequest(), secret, now + 60_001, true)).toBeUndefined();
    expect(verifiedProxyIp({ ...makeRequest(), originalUrl: "/api/other" }, secret, now, true)).toBeUndefined();
    expect(verifiedProxyIp({ ...makeRequest(), method: "GET" }, secret, now, true)).toBeUndefined();
    expect(verifiedProxyIp(makeRequest(now, { "x-sabq-client-ip": "not-an-ip" }), secret, now, true)).toBeUndefined();
  });

  it("ignores unsigned custom forwarding headers and arbitrary Bearer values", () => {
    const request = {
      ip: "203.0.113.9",
      socket: { remoteAddress: "203.0.113.10" },
      headers: {
        authorization: "Bearer attacker-changes-this-per-request",
        "x-sabq-client-ip": "1.2.3.4",
        "true-client-ip": "1.2.3.4",
        "cf-connecting-ip": "1.2.3.4",
        "x-forwarded-for": "1.2.3.4",
      },
    };
    expect(getRealIp(request)).toBe("203.0.113.9");
    expect(getRealIp({ ...request, headers: { ...request.headers, authorization: "Bearer another-value" } })).toBe("203.0.113.9");
  });

  it("fails safe when the shared secret is missing", () => {
    expect(verifiedProxyIp(makeRequest(), undefined, now, true)).toBeUndefined();
    expect(verifiedProxyIp(makeRequest(), secret, now)).toBeUndefined();
    expect(getRealIp({ ...makeRequest(), ip: "203.0.113.9" })).toBe("203.0.113.9");
  });

  it("verifies a Pages signature generated for the target API URL", async () => {
    const request = new Request("https://sabq.org/api/login?next=%2F", {
      method: "POST",
      headers: {
        "cf-connecting-ip": "198.51.100.7",
        "X-Sabq-Client-IP": "203.0.113.77",
      },
    });
    const headers = await signProxyRequest(request, "https://api.sabq.org/api/login?next=%2F", secret);
    expect(headers.get("X-Sabq-Client-IP")).toBe("198.51.100.7");
    expect(headers.get("X-Sabq-Proxy-Signature")).toMatch(/^[a-f0-9]{64}$/);
    expect(
      verifiedProxyIp(
        { method: "POST", originalUrl: "/api/login?next=%2F", headers: Object.fromEntries(headers.entries()) },
        secret,
        Date.now(),
        true,
      ),
    ).toBe("198.51.100.7");
  });

  it("forwards a streaming write body and propagates upstream errors", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"ok":true}'));
        controller.close();
      },
    });
    const request = new Request("https://sabq.org/api/webhooks/test", {
      method: "POST",
      body,
      duplex: "half",
      headers: { "content-type": "application/json", "cf-connecting-ip": "198.51.100.7" },
    } as RequestInit);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));
    await expect(proxyToApi(request, "https://api.sabq.org", 0, secret)).resolves.toBeInstanceOf(Response);
    const forwarded = fetchMock.mock.calls[0]?.[0] as string;
    expect(forwarded).toBe("https://api.sabq.org/api/webhooks/test");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(await new Response(init.body).text()).toBe('{"ok":true}');

    fetchMock.mockRejectedValueOnce(new Error("upstream unavailable"));
    await expect(proxyToApi(new Request("https://sabq.org/api/health"), "https://api.sabq.org"))
      .rejects.toThrow("upstream unavailable");
  });

  it("gates unsigned API requests while leaving health and valid signatures available", () => {
    const previous = { accept: process.env.EDGE_PROXY_IP_ACCEPT, gate: process.env.EDGE_PROXY_GATE_REQUIRED, secret: process.env.EDGE_PROXY_SHARED_SECRET };
    process.env.EDGE_PROXY_IP_ACCEPT = "on";
    process.env.EDGE_PROXY_GATE_REQUIRED = "on";
    process.env.EDGE_PROXY_SHARED_SECRET = secret;
    const next = vi.fn();
    const status = vi.fn(() => ({ json: vi.fn() }));
    originGate({ url: "/api/v1/auth/login", headers: {} }, { status }, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();

    const healthNext = vi.fn();
    originGate({ url: "/health", headers: {} }, { status }, healthNext);
    expect(healthNext).toHaveBeenCalledOnce();

    const validNext = vi.fn();
    const validBase = makeRequest(Date.now());
    const valid = { ...validBase, url: validBase.originalUrl };
    originGate(valid, { status }, validNext);
    expect(validNext).toHaveBeenCalledOnce();

    process.env.EDGE_PROXY_SHARED_SECRET = "";
    const missingSecretStatus = vi.fn(() => ({ json: vi.fn() }));
    originGate({ url: "/api/v1/auth/login", headers: {} }, { status: missingSecretStatus }, vi.fn());
    expect(missingSecretStatus).toHaveBeenCalledWith(503);
    if (previous.accept === undefined) delete process.env.EDGE_PROXY_IP_ACCEPT; else process.env.EDGE_PROXY_IP_ACCEPT = previous.accept;
    if (previous.gate === undefined) delete process.env.EDGE_PROXY_GATE_REQUIRED; else process.env.EDGE_PROXY_GATE_REQUIRED = previous.gate;
    if (previous.secret === undefined) delete process.env.EDGE_PROXY_SHARED_SECRET; else process.env.EDGE_PROXY_SHARED_SECRET = previous.secret;
  });

  it("enforces the gate over HTTP, including case-insensitive API paths and queries", async () => {
    const previous = { accept: process.env.EDGE_PROXY_IP_ACCEPT, gate: process.env.EDGE_PROXY_GATE_REQUIRED, secret: process.env.EDGE_PROXY_SHARED_SECRET };
    process.env.EDGE_PROXY_IP_ACCEPT = "on";
    process.env.EDGE_PROXY_GATE_REQUIRED = "on";
    process.env.EDGE_PROXY_SHARED_SECRET = secret;
    const app = express();
    app.use(originGate);
    app.get("/api/test", (_req, res) => res.status(204).end());
    app.get("/health", (_req, res) => res.status(200).send("ok"));
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");
    const base = `http://127.0.0.1:${address.port}`;
    try {
      expect((await fetch(`${base}/API/test?x=1`)).status).toBe(403);
      expect((await fetch(`${base}/api%2Ftest`)).status).toBe(403);
      expect((await fetch(`${base}/api//test`)).status).toBe(403);
      const signedRequest = new Request("https://sabq.org/API/test?x=1", { headers: { "cf-connecting-ip": "198.51.100.7" } });
      const signed = await signProxyRequest(signedRequest, "https://api.sabq.org/API/test?x=1", secret);
      expect((await fetch(`${base}/API/test?x=1`, { headers: signed })).status).toBe(204);
      expect((await fetch(`${base}/health`)).status).toBe(200);
      process.env.EDGE_PROXY_SHARED_SECRET = "";
      expect((await fetch(`${base}/api/test`)).status).toBe(503);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      if (previous.accept === undefined) delete process.env.EDGE_PROXY_IP_ACCEPT; else process.env.EDGE_PROXY_IP_ACCEPT = previous.accept;
      if (previous.gate === undefined) delete process.env.EDGE_PROXY_GATE_REQUIRED; else process.env.EDGE_PROXY_GATE_REQUIRED = previous.gate;
      if (previous.secret === undefined) delete process.env.EDGE_PROXY_SHARED_SECRET; else process.env.EDGE_PROXY_SHARED_SECRET = previous.secret;
    }
  });

  it("signs HEAD metadata requests as GET without forwarding credentials", async () => {
    const originalCaches = (globalThis as any).caches;
    const originalFetch = globalThis.fetch;
    const put = vi.fn().mockResolvedValue(undefined);
    (globalThis as any).caches = { default: { match: vi.fn().mockResolvedValue(undefined), put } };
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { headers: { "content-type": "application/json" } }));
    globalThis.fetch = fetchMock as typeof fetch;
    try {
      const source = new Request("https://sabq.org/article/foo", {
        method: "HEAD",
        headers: {
          "cf-connecting-ip": "198.51.100.7",
          cookie: "session=secret",
          authorization: "Bearer secret",
        },
      });
      await expect(cachedJson("https://api.sabq.org/api/edge/seo-meta?path=%2Ffoo", 10, { waitUntil: vi.fn() }, source, secret))
        .resolves.toEqual({ ok: true });
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
      const headers = new Headers(init.headers);
      expect(headers.get("cookie")).toBeNull();
      expect(headers.get("authorization")).toBeNull();
      expect(verifiedProxyIp({ method: "GET", originalUrl: "/api/edge/seo-meta?path=%2Ffoo", headers: Object.fromEntries(headers) }, secret, Date.now(), true))
        .toBe("198.51.100.7");
      expect(verifiedProxyIp({ method: "HEAD", originalUrl: "/api/edge/seo-meta?path=%2Ffoo", headers: Object.fromEntries(headers) }, secret, Date.now(), true))
        .toBeUndefined();
    } finally {
      (globalThis as any).caches = originalCaches;
      globalThis.fetch = originalFetch;
    }
  });
});
