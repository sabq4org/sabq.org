import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function providerResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("APIFOOTBALL_KEY", "test-key");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("apiFootballGet rate-limit backpressure", () => {
  it("does not retry a provider rate-limit inside the same request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(providerResponse({ errors: { rateLimit: "Too many requests" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { apiFootballGet } = await import("../../server/services/apiFootballClient");

    await expect(apiFootballGet("Test", "players", { id: 1 })).rejects.toThrow(
      "API-Football rate-limited",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails later calls immediately while the provider cooldown is open", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(providerResponse({ errors: { requests: "Daily quota exhausted" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { apiFootballGet } = await import("../../server/services/apiFootballClient");

    await expect(apiFootballGet("Test", "players", { id: 1 })).rejects.toThrow(
      "API-Football rate-limited",
    );
    await expect(apiFootballGet("Test", "teams", { id: 2 })).rejects.toThrow(
      "cooling down",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("opens the same fail-fast cooldown for HTTP 429", async () => {
    const fetchMock = vi.fn().mockResolvedValue(providerResponse({}, 429));
    vi.stubGlobal("fetch", fetchMock);
    const { apiFootballGet } = await import("../../server/services/apiFootballClient");

    await expect(apiFootballGet("Test", "fixtures", { live: "all" })).rejects.toThrow(
      "HTTP 429",
    );
    await expect(apiFootballGet("Test", "standings", { league: 307 })).rejects.toThrow(
      "cooling down",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
