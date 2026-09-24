import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

describe("Next newsletter API uses browser CSRF protection", () => {
  it("gets a session token before posting to the configured API origin", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.invalid/");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "local-csrf-token" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const { clientApiPost } = await import("../../web-next/lib/clientApi");
    const result = await clientApiPost("/api/smart-newsletter/confirm", { token: "test-token" });
    expect(fetchMock.mock.calls).toEqual([
      ["https://api.example.invalid/api/csrf-token", { credentials: "include" }],
      ["https://api.example.invalid/api/smart-newsletter/confirm", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": "local-csrf-token" },
        body: JSON.stringify({ token: "test-token" }),
      }],
    ]);
    expect(result.data).toEqual({ success: true });
  });

  it("never posts when CSRF setup fails or does not return a token", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const { clientApiPost } = await import("../../web-next/lib/clientApi");
    await expect(clientApiPost("/api/smart-newsletter/subscribe", { email: "reader@example.invalid" })).rejects.toThrow("رمز الحماية");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
