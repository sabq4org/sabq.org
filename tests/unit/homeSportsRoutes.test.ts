import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  overview: vi.fn(), fixtures: vi.fn(), settings: vi.fn(), today: vi.fn(), cooldown: vi.fn(),
  manual: vi.fn(), configured: vi.fn(),
}));
vi.mock("../../server/services/kingsCupService", () => ({
  getKcOverview: mocks.overview, getKcFixtures: mocks.fixtures,
  isKingsCupConfigured: mocks.configured, manualKcChampion: mocks.manual,
}));
vi.mock("../../server/services/tournamentBlockSettings", () => ({
  getTournamentBlockSettings: mocks.settings, isBlockHidden: (s: { hidden: boolean }) => s.hidden,
}));
vi.mock("../../server/services/apiFootballClient", () => ({ getApiFootballRetryAfterMs: mocks.cooldown }));
vi.mock("../../server/services/saudiLeagueService", () => ({
  getGlobalTodayFixtures: mocks.today, overlayLiveBoardList: async (rows: unknown[]) => rows,
  isSaudiLeagueConfigured: () => true, startCompetitionsMetaWarmer: () => {},
}));
vi.mock("../../server/services/sportsOgImage", () => ({}));
vi.mock("../../server/services/sportmonksService", () => ({}));
vi.mock("../../server/services/theSportsService", () => ({}));
vi.mock("../../server/services/worldCupNameTranslator", () => ({}));
vi.mock("../../server/services/sportsFollowsService", () => ({}));
vi.mock("../../server/services/sportsSummaryService", () => ({}));
vi.mock("../../server/rbac", () => ({ requireAuth: () => {} }));

beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks(); vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-05T12:00:00Z"));
  mocks.cooldown.mockReturnValue(0); mocks.configured.mockReturnValue(true);
  mocks.overview.mockResolvedValue({ live: [], nextMatch: null, champion: null });
  mocks.fixtures.mockResolvedValue([]); mocks.today.mockResolvedValue([]);
  mocks.settings.mockResolvedValue({ hidden: false });
});
afterEach(() => vi.useRealTimers());

async function handler(path: string) {
  const handlers = new Map<string, Function>();
  const app = { get: (p: string, ...fns: Function[]) => handlers.set(p, fns.at(-1)!), post: () => {}, put: () => {}, delete: () => {}, patch: () => {}, use: () => {} };
  if (path.includes("kings-cup")) {
    const { registerKingsCupRoutes } = await import("../../server/routes/kingsCup");
    registerKingsCupRoutes(app as never);
  } else {
    const { registerSportsRoutes } = await import("../../server/routes/sports");
    registerSportsRoutes(app as never);
  }
  return async (query: Record<string, string>) => {
    const result = { status: 200, body: {} as any, headers: {} as Record<string, string> };
    const res = { status: (n: number) => { result.status = n; return res; }, set: (k: string, v: string) => { result.headers[k] = v; return res; }, json: (body: unknown) => { result.body = body; return res; } };
    await handlers.get(path)!({ query, headers: {} }, res);
    return result;
  };
}

it("KC fallback reads current hide and manual champion settings; old clients retain their contract", async () => {
  const request = await handler("/api/kings-cup/overview");
  const first = await request({ resilient: "1" });
  expect(first.status).toBe(200); expect(first.body.freshness.state).toBe("fresh");
  mocks.cooldown.mockReturnValue(30_000);
  mocks.settings.mockResolvedValue({ hidden: true, manualChampionTeamId: 42 });
  mocks.manual.mockReturnValue({ team: { id: 42 }, source: "manual" });
  const stale = await request({ resilient: "1" });
  expect(stale.body).toMatchObject({ blockHidden: true, champion: { team: { id: 42 } }, freshness: { state: "stale", updatedAt: first.body.freshness.updatedAt } });
  expect(stale.headers["Cache-Control"]).toBe("no-store");
  expect(mocks.overview).toHaveBeenCalledTimes(1); expect(mocks.settings).toHaveBeenCalledTimes(2);
  const legacy = await request({}); expect(legacy.status).toBe(200);
  expect(legacy.body).not.toHaveProperty("freshness"); expect(mocks.overview).toHaveBeenCalledTimes(2);
});

it("cold KC failure returns 503 with retry timing and does not cache a false empty success", async () => {
  const request = await handler("/api/kings-cup/overview");
  mocks.overview.mockRejectedValue(new Error("429"));
  for (let i = 0; i < 10; i++) {
    const result = await request({ resilient: "1" });
    expect(result.status).toBe(503); expect(result.headers["Retry-After"]).toBe("15");
    expect(result.headers["Cache-Control"]).toBe("no-store");
  }
  expect(mocks.overview).toHaveBeenCalledTimes(1);
});

it("today uses the opt-in snapshot, isolates dates, and preserves the default payload", async () => {
  const request = await handler("/api/sports/today");
  const first = await request({ resilient: "1", date: "2026-09-05" });
  expect(first.body).toMatchObject({ configured: true, date: "2026-09-05", today: [], freshness: { state: "fresh" } });
  mocks.cooldown.mockReturnValue(30_000);
  const stale = await request({ resilient: "1", date: "2026-09-05" });
  expect(stale.body.freshness.state).toBe("stale"); expect(mocks.today).toHaveBeenCalledTimes(1);
  const otherDate = await request({ resilient: "1", date: "2026-09-06" });
  expect(otherDate.status).toBe(503); expect(otherDate.headers["Retry-After"]).toBe("30");
  const legacy = await request({ date: "2026-09-05" });
  expect(legacy.body).toEqual({ configured: true, date: "2026-09-05", today: [] });
});

it("disabled Kings Cup stays explicitly unconfigured without fetching the provider", async () => {
  mocks.configured.mockReturnValue(false);
  const request = await handler("/api/kings-cup/overview");
  expect((await request({ resilient: "1" })).body).toMatchObject({ configured: false });
  expect((await request({ resilient: "1" })).status).toBe(200);
  expect((await request({})).status).toBe(503);
  expect(mocks.overview).not.toHaveBeenCalled();
});
