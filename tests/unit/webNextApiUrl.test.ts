import { afterEach, describe, expect, it, vi } from "vitest";
import { serverApiFetch } from "../../web-next/lib/apiUrl";

describe("web-next signed API fetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.EDGE_PROXY_SHARED_SECRET;
    delete process.env.EDGE_PROXY_GATE_REQUIRED;
  });

  it("uses the fixed service identity and never request input", async () => {
    process.env.EDGE_PROXY_SHARED_SECRET = "test-secret";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));
    await serverApiFetch("/api/edge/home-bundle?x=1", { method: "GET" });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("X-Sabq-Client-IP")).toBe("127.0.0.1");
    expect(headers.get("X-Sabq-Proxy-Signature")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed for SSR when the gate is required but the secret is absent", async () => {
    process.env.EDGE_PROXY_GATE_REQUIRED = "on";
    await expect(serverApiFetch("/api/edge/home-bundle")).rejects.toThrow("EDGE_PROXY_SHARED_SECRET");
  });
});
