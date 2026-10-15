import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  enabled: false,
  setCalls: [] as boolean[],
  assertRadarEnabled: vi.fn(async () => {
    if (!runtime.enabled) {
      throw Object.assign(new Error("RADAR_DISABLED"), { code: "RADAR_DISABLED", reason: "paused" });
    }
  }),
  getRadarRuntimeState: vi.fn(async () => ({
    enabled: runtime.enabled,
    source: "database",
    reason: runtime.enabled ? null : "paused",
  })),
  setRadarEnabled: vi.fn(async (enabled: boolean) => {
    runtime.setCalls.push(enabled);
    runtime.enabled = enabled;
    return runtime.getRadarRuntimeState();
  }),
  isRadarDisabledError: vi.fn((error: unknown) => Boolean(error && typeof error === "object" && (error as any).code === "RADAR_DISABLED")),
}));

const executions = vi.hoisted(() => ({
  fetchSingleSource: vi.fn(),
  runRadarCycle: vi.fn(),
  transformItem: vi.fn(),
  developItem: vi.fn(),
  exportItemToArticle: vi.fn(),
}));

const auth = vi.hoisted(() => ({
  requireAuth: vi.fn((...args: any[]) => args),
  requireRole: vi.fn(() => function systemAdminMiddleware() {}),
}));

vi.mock("../../server/rbac", () => auth);
vi.mock("../../server/services/radar/runtime", () => runtime);
vi.mock("../../server/services/radar/cycle", () => ({
  DAILY_ANALYZE_CAP: 2000,
  fetchSingleSource: executions.fetchSingleSource,
  getLastCycle: vi.fn(() => null),
  runRadarCycle: executions.runRadarCycle,
}));
vi.mock("../../server/services/radar/transformer", () => ({ transformItem: executions.transformItem }));
vi.mock("../../server/services/radar/developer", () => ({ developItem: executions.developItem }));
vi.mock("../../server/services/radar/exporter", () => ({ exportItemToArticle: executions.exportItemToArticle }));
vi.mock("../../server/services/webSearchService", () => ({ isWebSearchConfigured: vi.fn(() => false) }));
vi.mock("../../server/services/radar/alerts", () => ({ isTelegramConfigured: vi.fn(() => false) }));
vi.mock("../../server/services/radar/xProvider", () => ({ detectWatchType: vi.fn(() => "keyword"), xProvidersConfigured: vi.fn(() => ({ official: false, twitterapiio: false })) }));
vi.mock("../../server/services/radar/flags", () => ({
  isClusteringEnabled: vi.fn(() => false),
  isMomentumEnabled: vi.fn(() => false),
  isRadarForceDisabled: vi.fn(() => false),
  isRelevanceEnabled: vi.fn(() => false),
}));
vi.mock("../../server/services/radar/repo", () => ({
  countActiveXWatches: vi.fn(async () => 0),
  countAnalyzedToday: vi.fn(async () => 0),
  lastAnalyzedAt: vi.fn(async () => null),
  createRule: vi.fn(),
  createSource: vi.fn(),
  deleteRule: vi.fn(),
  deleteSource: vi.fn(),
  getItem: vi.fn(async () => ({ id: "item-1", status: "analyzed" })),
  listItems: vi.fn(),
  listRules: vi.fn(),
  listSources: vi.fn(async () => []),
  radarStats: vi.fn(),
  sourceHealthSummary: vi.fn(),
  updateItem: vi.fn(),
  updateRule: vi.fn(),
  updateSource: vi.fn(),
}));

type CapturedRoute = { middleware: unknown[]; handler: (req: any, res: any) => Promise<unknown> };

function captureRoutes() {
  const routes = new Map<string, CapturedRoute>();
  const register = (method: string, path: string, handlers: unknown[]) => {
    routes.set(`${method} ${path}`, {
      middleware: handlers.slice(0, -1),
      handler: handlers.at(-1) as CapturedRoute["handler"],
    });
  };
  const app = {
    get: (path: string, ...handlers: unknown[]) => register("GET", path, handlers),
    post: (path: string, ...handlers: unknown[]) => register("POST", path, handlers),
    patch: (path: string, ...handlers: unknown[]) => register("PATCH", path, handlers),
    delete: (path: string, ...handlers: unknown[]) => register("DELETE", path, handlers),
  };
  return { routes, app };
}

function response() {
  const res: any = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

const { registerRadarRoutes } = await import("../../server/routes/radar");

describe("Radar runtime HTTP controls", () => {
  let routes: Map<string, CapturedRoute>;

  beforeEach(() => {
    runtime.enabled = false;
    runtime.setCalls.length = 0;
    runtime.assertRadarEnabled.mockClear();
    runtime.getRadarRuntimeState.mockClear();
    runtime.setRadarEnabled.mockClear();
    for (const fn of Object.values(executions)) fn.mockReset();
    const captured = captureRoutes();
    registerRadarRoutes(captured.app as any);
    routes = captured.routes;
  });

  it("uses the same auth and system-admin middleware for status read and write", () => {
    const get = routes.get("GET /api/radar/status")!;
    const patch = routes.get("PATCH /api/radar/status")!;
    expect(get.middleware[0]).toBe(auth.requireAuth);
    expect(patch.middleware[0]).toBe(auth.requireAuth);
    expect(patch.middleware[1]).toBe(get.middleware[1]);
    expect(auth.requireRole).toHaveBeenCalledWith("system_admin", "system.admin", "superadmin", "super_admin");
  });

  it("returns 503 and does not execute any active operation while paused", async () => {
    const stoppedRoutes = [
      ["POST /api/radar/run", {}],
      ["POST /api/radar/sources/:id/fetch", { params: { id: "source-1" } }],
      ["POST /api/radar/items/:id/transform", { params: { id: "item-1" } }],
      ["POST /api/radar/items/:id/develop", { params: { id: "item-1" } }],
      ["POST /api/radar/items/:id/export", { params: { id: "item-1" }, body: {} }],
    ] as const;

    for (const [key, req] of stoppedRoutes) {
      const res = response();
      await routes.get(key)!.handler(req, res);
      expect(res.status, key).toHaveBeenCalledWith(503);
      expect(res.json, key).toHaveBeenCalledWith(expect.objectContaining({
        enabled: false,
        reason: "paused",
        forceDisabled: false,
      }));
    }
    expect(executions.runRadarCycle).not.toHaveBeenCalled();
    expect(executions.fetchSingleSource).not.toHaveBeenCalled();
    expect(executions.transformItem).not.toHaveBeenCalled();
    expect(executions.developItem).not.toHaveBeenCalled();
    expect(executions.exportItemToArticle).not.toHaveBeenCalled();
  });

  it("rejects non-boolean PATCH bodies and returns the full status contract", async () => {
    const patch = routes.get("PATCH /api/radar/status")!;
    const invalidRes = response();
    await patch.handler({ body: { enabled: "true" } }, invalidRes);
    expect(invalidRes.status).toHaveBeenCalledWith(400);
    expect(runtime.setRadarEnabled).not.toHaveBeenCalled();

    runtime.enabled = true;
    const enableRes = response();
    await patch.handler({ body: { enabled: true } }, enableRes);
    expect(runtime.setRadarEnabled).toHaveBeenCalledWith(true);
    expect(enableRes.json).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      reason: null,
      runtimeSettingSource: "database",
      forceDisabled: false,
      cronEnabled: true,
      clustering: false,
      momentum: false,
      relevance: false,
      dailyAnalyzeCap: 2000,
      lastAnalyzedAt: null,
      lastCycle: null,
    }));

    const disableRes = response();
    await patch.handler({ body: { enabled: false } }, disableRes);
    expect(runtime.setRadarEnabled).toHaveBeenLastCalledWith(false);
    expect(disableRes.json).toHaveBeenCalledWith(expect.objectContaining({ enabled: false, reason: "paused", cronEnabled: false }));
  });
});
