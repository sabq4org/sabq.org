import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getUserRoles: vi.fn(),
  getInactiveRoles: vi.fn(),
  getContentDutyRoster: vi.fn(),
}));

vi.mock("../../server/storage", () => ({ storage: mocks }));
vi.mock("../../server/auth", () => ({
  isAuthenticated: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.headers["x-test-user"]) return res.sendStatus(401);
    (req as express.Request & { user?: { id: string } }).user = { id: String(req.headers["x-test-user"]) };
    return next();
  },
}));
vi.mock("../../server/services/roleStatusCache", () => ({
  getInactiveRoles: mocks.getInactiveRoles,
}));
vi.mock("../../server/services/contentDutyService", () => ({
  ContentDutyConfigError: class ContentDutyConfigError extends Error {
    code = "CONTENT_DUTY_NOT_CONFIGURED";
  },
  getContentDutyRoster: mocks.getContentDutyRoster,
}));

import router from "../../server/routes/contentDuty";
import { ContentDutyConfigError } from "../../server/services/contentDutyService";

const app = express();
app.use(router);
const server = createServer(app);
let base: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/dashboard/content-duty`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getInactiveRoles.mockResolvedValue({ names: new Set(), ids: new Set() });
  mocks.getUserRoles.mockResolvedValue([]);
  mocks.getUser.mockResolvedValue({ id: "staff-1", role: "editor" });
  mocks.getContentDutyRoster.mockResolvedValue({
    managers: [{ key: "alpha", name: "محرر تجريبي", online: null, shifts: [{ days: [0], startHour: 8, endHour: 14 }] }],
  });
});

describe("GET /api/admin/dashboard/content-duty", () => {
  it("requires authentication and excludes readers", async () => {
    expect((await fetch(base)).status).toBe(401);
    mocks.getUser.mockResolvedValue({ id: "reader-1", role: "reader" });
    expect((await fetch(base, { headers: { "x-test-user": "reader-1" } })).status).toBe(403);
    expect(mocks.getContentDutyRoster).not.toHaveBeenCalled();
  });

  it.each([
    ["suspended", { id: "blocked-1", role: "editor", status: "suspended" }],
    ["deleted", { id: "blocked-2", role: "editor", status: "active", deletedAt: new Date() }],
  ])("rejects %s requesting accounts", async (_label, user) => {
    mocks.getUser.mockResolvedValue(user);
    expect((await fetch(base, { headers: { "x-test-user": user.id } })).status).toBe(403);
    expect(mocks.getContentDutyRoster).not.toHaveBeenCalled();
  });

  it("allows staff, disables caching, and returns only the public contract", async () => {
    const response = await fetch(base, { headers: { "x-test-user": "staff-1" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = await response.json();
    expect(body.managers[0]).not.toHaveProperty("userId");
  });

  it("reports an explicit unconfigured response without exposing config details", async () => {
    const error = new ContentDutyConfigError();
    mocks.getContentDutyRoster.mockRejectedValue(error);
    const response = await fetch(base, { headers: { "x-test-user": "staff-1" } });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "CONTENT_DUTY_NOT_CONFIGURED",
      message: "Content duty roster is not configured",
    });
  });
});
