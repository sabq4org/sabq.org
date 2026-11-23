import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

const mocks = vi.hoisted(() => ({
  userHasPermission: vi.fn(),
  getDutyCard: vi.fn(),
  getDutyRoom: vi.fn(),
  getDutyTeam: vi.fn(),
  listDutyAlerts: vi.fn(),
  getDutyAlert: vi.fn(),
}));

vi.mock("../../server/routes/botDesk", () => ({
  requireBotDeskAuth: (req: express.Request & { botPrincipal?: unknown }, res: express.Response, next: express.NextFunction) => {
    const user = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!user) return res.status(401).json({ code: "unauthorized" });
    req.botPrincipal = { userId: user, tokenId: "t1" };
    return next();
  },
}));
vi.mock("../../server/rbac", () => ({ userHasPermission: mocks.userHasPermission }));
vi.mock("../../server/services/contentDuty/dutyMetricsService", () => ({
  getDutyCard: mocks.getDutyCard,
  getDutyRoom: mocks.getDutyRoom,
  getDutyTeam: mocks.getDutyTeam,
}));
vi.mock("../../server/services/contentDuty/dutyRosterStore", () => ({
  ContentDutyNotReadyError: class ContentDutyNotReadyError extends Error {},
}));
vi.mock("../../server/services/contentDuty/dutyBotService", () => ({
  DutyAlertsNotReadyError: class DutyAlertsNotReadyError extends Error {},
  listDutyAlerts: mocks.listDutyAlerts,
  getDutyAlert: mocks.getDutyAlert,
}));

import router from "../../server/routes/botDeskDuty";
import { DutyAlertsNotReadyError } from "../../server/services/contentDuty/dutyBotService";
import { ContentDutyNotReadyError } from "../../server/services/contentDuty/dutyRosterStore";

const app = express();
app.use(router);
const server = createServer(app);
let base: string;
const get = (path: string, user: string | null = "bot") =>
  fetch(`${base}/api/internal/bot-desk/duty${path}`, { headers: user ? { authorization: `Bearer ${user}` } : {} });

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.userHasPermission.mockResolvedValue(true);
});

describe("auth", () => {
  it("401 without a token, 403 without superuser/content_duty.monitor", async () => {
    expect((await get("/now", null)).status).toBe(401);
    mocks.userHasPermission.mockResolvedValue(false);
    const res = await get("/now");
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "forbidden", details: { required: "superuser_or_content_duty.monitor" } });
    expect(mocks.userHasPermission).toHaveBeenCalledWith("bot", "content_duty.monitor");
    expect(mocks.getDutyCard).not.toHaveBeenCalled();
  });
  it("only GET routes exist (read-only)", async () => {
    const res = await fetch(`${base}/api/internal/bot-desk/duty/alerts`, { method: "POST", headers: { authorization: "Bearer bot" } });
    expect(res.status).toBe(404);
  });
});

describe("alerts", () => {
  it("pages with after/limit and passes the cursor through", async () => {
    mocks.listDutyAlerts.mockResolvedValue({ alerts: [{ id: "12" }], nextCursor: "12", hasMore: false });
    const res = await get("/alerts?after=11&limit=5");
    expect(res.status).toBe(200);
    expect(mocks.listDutyAlerts).toHaveBeenCalledWith(11, 5);
    expect(await res.json()).toEqual({ alerts: [{ id: "12" }], nextCursor: "12", hasMore: false });
    await get("/alerts");
    expect(mocks.listDutyAlerts).toHaveBeenLastCalledWith(0, 50);
  });
  it("rejects bad query", async () => {
    expect((await get("/alerts?limit=500")).status).toBe(400);
    expect((await get("/alerts?after=-1")).status).toBe(400);
  });
  it("503 before the migration", async () => {
    mocks.listDutyAlerts.mockRejectedValue(new DutyAlertsNotReadyError());
    const res = await get("/alerts");
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "duty_alerts_not_ready" });
  });
  it("alerts/:id: 200, 404, 400", async () => {
    mocks.getDutyAlert.mockResolvedValueOnce({ id: "7" }).mockResolvedValueOnce(null);
    expect(await (await get("/alerts/7")).json()).toEqual({ alert: { id: "7" } });
    expect((await get("/alerts/8")).status).toBe(404);
    expect((await get("/alerts/abc")).status).toBe(400);
  });
});

describe("now / shifts / team", () => {
  it("now uses the lead view of getDutyCard", async () => {
    mocks.getDutyCard.mockResolvedValue({ onDuty: [] });
    expect((await get("/now")).status).toBe(200);
    expect(mocks.getDutyCard).toHaveBeenCalledWith({ userId: "bot", access: "lead" });
  });
  it("shifts/:key returns the exact shift only", async () => {
    const key = "s1:2026-11-26:u1";
    mocks.getDutyRoom.mockResolvedValueOnce({ shift: { key } }).mockResolvedValueOnce({ shift: { key: "s2:2026-11-26:u2" } });
    expect((await get(`/shifts/${encodeURIComponent(key)}`)).status).toBe(200);
    expect(mocks.getDutyRoom).toHaveBeenCalledWith({ userId: "bot", access: "lead" }, key);
    expect((await get(`/shifts/${encodeURIComponent(key)}`)).status).toBe(404);
    expect((await get("/shifts/bad-key")).status).toBe(400);
  });
  it("team, and 503 when duty tables are missing", async () => {
    mocks.getDutyTeam.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(new ContentDutyNotReadyError());
    expect((await get("/team")).status).toBe(200);
    const res = await get("/team");
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "content_duty_not_ready" });
  });
});
