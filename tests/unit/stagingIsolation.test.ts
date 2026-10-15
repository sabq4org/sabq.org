import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error Pages JS is untyped
import { onRequest, proxyToApi, resolveApiOrigin, stagingAuthResponse } from "../../functions/_middleware.js";
import { stagingApiAuthStatus, stagingOutboundError } from "../../server/utils/stagingRuntime";

const token = "staging-test-token";
const stagingEnv = { STAGING_NO_INDEX: "true", STAGING_ACCESS_TOKEN: token, API_ORIGIN: "https://staging-api.example" };

describe("staging isolation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each(["/assets/app.js", "/api/articles", "/robots.txt"])("rejects unauthenticated Pages requests before routing: %s", (path) => {
    const response = stagingAuthResponse(new Request(`https://staging.sabq.org${path}`), stagingEnv);
    expect(response?.status).toBe(401);
    expect(response?.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
  });

  it("fails closed when the staging token is missing", () => {
    const response = stagingAuthResponse(new Request("https://staging.sabq.org/"), {
      STAGING_NO_INDEX: "true",
      API_ORIGIN: "https://staging-api.example",
    });
    expect(response?.status).toBe(503);
  });

  it("rejects unauthenticated onRequest before routing", async () => {
    const next = vi.fn(async () => new Response("should not run"));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await onRequest({
      request: new Request("https://staging.sabq.org/api/articles"),
      env: stagingEnv,
      next,
      waitUntil: () => {},
      functionPath: "functions/_middleware.js",
    } as any);
    expect(response.status).toBe(401);
    expect(next).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows an authenticated request through the Pages entrypoint", async () => {
    const next = vi.fn(async () => new Response("ok", { status: 200 }));
    const response = await onRequest({
      request: new Request("https://staging.sabq.org/assets/app.js", {
        headers: { Authorization: `Basic ${btoa(`sabq:${token}`)}` },
      }),
      env: stagingEnv,
      next,
      waitUntil: () => {},
      functionPath: "functions/_middleware.js",
    } as any);
    expect(response.status).toBe(200);
    expect(next).toHaveBeenCalledOnce();
  });

  it("forwards Basic Auth to the API proxy", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const auth = `Basic ${btoa(`sabq:${token}`)}`;
    await proxyToApi(
      new Request("https://staging.sabq.org/api/health", { headers: { Authorization: auth } }),
      stagingEnv.API_ORIGIN,
      0,
      undefined,
      token,
    );
    const headers = (fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Headers;
    expect(headers.get("authorization")).toBe(auth);
  });

  it("routes an authenticated API request only to the configured staging origin", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("caches", { default: { match: vi.fn().mockResolvedValue(undefined), put: vi.fn() } });
    const response = await onRequest({
      request: new Request("https://staging.sabq.org/api/articles", {
        headers: { Authorization: `Basic ${btoa(`sabq:${token}`)}` },
      }),
      env: stagingEnv,
      next: vi.fn(),
      waitUntil: () => {},
      functionPath: "functions/_middleware.js",
    } as any);
    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith(stagingEnv.API_ORIGIN))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("api.sabq.org"))).toBe(false);
  });

  it("never falls back to the production API origin in staging", () => {
    expect(() => resolveApiOrigin({ STAGING_NO_INDEX: "true" })).toThrow("API_ORIGIN is required in staging");
    expect(() => resolveApiOrigin({ STAGING_NO_INDEX: "true", API_ORIGIN: "https://api.sabq.org" })).toThrow("forbidden");
    expect(() => resolveApiOrigin({ STAGING_NO_INDEX: "true", API_ORIGIN: "https://sabqorg-production.up.railway.app" })).toThrow("forbidden");
    expect(resolveApiOrigin({})).toBe("https://api.sabq.org");
  });

  it("guards the public staging API while keeping health as the only public route", () => {
    vi.stubEnv("STAGING_NO_INDEX", "true");
    vi.stubEnv("STAGING_ACCESS_TOKEN", token);
    expect(stagingApiAuthStatus(undefined)).toBe("unauthorized");
    expect(stagingApiAuthStatus(`Basic ${btoa(`sabq:${token}`)}`)).toBe("allow");
    vi.stubEnv("STAGING_ACCESS_TOKEN", "");
    expect(stagingApiAuthStatus(undefined)).toBe("missing-config");
  });

  it("blocks external side effects by default in staging", () => {
    vi.stubEnv("STAGING_NO_INDEX", "true");
    vi.stubEnv("STAGING_ALLOW_OUTBOUND", "");
    expect(stagingOutboundError("email")?.message).toBe("STAGING_OUTBOUND_DISABLED:email");
    vi.stubEnv("STAGING_ALLOW_OUTBOUND", "true");
    expect(stagingOutboundError("email")).toBeNull();
  });
});
