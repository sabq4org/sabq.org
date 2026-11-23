import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

const mocks = vi.hoisted(() => ({
  resolveDutyViewer: vi.fn(),
  rosteredIdsNow: vi.fn(),
  getDutyCard: vi.fn(),
  getDutyRoom: vi.fn(),
  getDutyTeam: vi.fn(),
  getDutyRoster: vi.fn(),
  createShift: vi.fn(),
  updateShift: vi.fn(),
  createException: vi.fn(),
  cancelException: vi.fn(),
  saveThresholds: vi.fn(),
  saveAlertSettings: vi.fn(),
}));

vi.mock("../../server/auth", () => ({
  isAuthenticated: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.headers["x-test-user"]) return res.sendStatus(401);
    (req as express.Request & { user?: { id: string } }).user = { id: String(req.headers["x-test-user"]) };
    return next();
  },
}));
vi.mock("../../server/services/contentDuty/dutyMetricsService", () => ({
  resolveDutyViewer: mocks.resolveDutyViewer,
  rosteredIdsNow: mocks.rosteredIdsNow,
  getDutyCard: mocks.getDutyCard,
  getDutyRoom: mocks.getDutyRoom,
  getDutyTeam: mocks.getDutyTeam,
  getDutyRoster: mocks.getDutyRoster,
}));
vi.mock("../../server/services/contentDuty/dutyRosterStore", () => {
  class ContentDutyNotReadyError extends Error {
    code = "CONTENT_DUTY_NOT_READY";
  }
  class ContentDutyInputError extends Error {}
  return {
    ContentDutyNotReadyError,
    ContentDutyInputError,
    createShift: mocks.createShift,
    updateShift: mocks.updateShift,
    createException: mocks.createException,
    cancelException: mocks.cancelException,
    saveThresholds: mocks.saveThresholds,
    saveAlertSettings: mocks.saveAlertSettings,
  };
});

import router from "../../server/routes/contentDuty";
import { ContentDutyInputError, ContentDutyNotReadyError } from "../../server/services/contentDuty/dutyRosterStore";

const app = express();
app.use(express.json());
app.use(router);
const server = createServer(app);
let base: string;

const as = (access: "lead" | "manager" | "staff" | null) => {
  mocks.resolveDutyViewer.mockResolvedValue(access ? { userId: "u1", access } : null);
};
const get = (path: string, user = "u1") => fetch(`${base}${path}`, { headers: user ? { "x-test-user": user } : {} });
const send = (method: string, path: string, body: unknown) =>
  fetch(`${base}${path}`, { method, headers: { "x-test-user": "u1", "content-type": "application/json" }, body: JSON.stringify(body) });

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
  mocks.rosteredIdsNow.mockResolvedValue(new Set());
  mocks.getDutyCard.mockResolvedValue({ onDuty: [] });
  mocks.getDutyRoom.mockResolvedValue({ access: "manager", shift: null });
  mocks.getDutyTeam.mockResolvedValue({ rows: [] });
  mocks.getDutyRoster.mockResolvedValue({ access: "staff" });
});

describe("content duty reads", () => {
  it("requires a signed-in staff account", async () => {
    expect((await get("/api/admin/dashboard/content-duty", "")).status).toBe(401);
    as(null);
    expect((await get("/api/admin/dashboard/content-duty")).status).toBe(403);
    expect(mocks.getDutyCard).not.toHaveBeenCalled();
  });

  it("serves the card to staff without caching", async () => {
    as("staff");
    const res = await get("/api/admin/dashboard/content-duty");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("keeps shift numbers away from basic staff", async () => {
    as("staff");
    expect((await get("/api/admin/content-duty/room")).status).toBe(403);
    expect((await get("/api/admin/content-duty/team")).status).toBe(403);
    expect((await get("/api/admin/content-duty/roster")).status).toBe(200);
    expect(mocks.getDutyRoom).not.toHaveBeenCalled();
    expect(mocks.getDutyTeam).not.toHaveBeenCalled();
  });

  it("passes the requested shift to the room for managers", async () => {
    as("manager");
    expect((await get("/api/admin/content-duty/room?shift=s1:2026-11-22")).status).toBe(200);
    expect(mocks.getDutyRoom).toHaveBeenCalledWith(expect.objectContaining({ access: "manager" }), "s1:2026-11-22");
  });

  it("answers 503 before the SQL file runs", async () => {
    as("manager");
    mocks.getDutyTeam.mockRejectedValue(new ContentDutyNotReadyError("missing"));
    const res = await get("/api/admin/content-duty/team");
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("CONTENT_DUTY_NOT_READY");
  });
});

describe("content duty edits", () => {
  const shift = { userId: "u2", days: [4, 5, 6], startMinute: 1200, endMinute: 120 };

  it("are for the lead only", async () => {
    as("manager");
    expect((await send("POST", "/api/admin/content-duty/shifts", shift)).status).toBe(403);
    expect((await send("POST", "/api/admin/content-duty/exceptions", { dutyDate: "2026-11-26", userId: "u2", coverUserId: null })).status).toBe(403);
    expect(mocks.createShift).not.toHaveBeenCalled();
    expect(mocks.createException).not.toHaveBeenCalled();
  });

  it("creates a shift and rejects unknown fields", async () => {
    as("lead");
    mocks.createShift.mockResolvedValue({ id: "s9" });
    const ok = await send("POST", "/api/admin/content-duty/shifts", shift);
    expect(ok.status).toBe(201);
    expect(mocks.createShift).toHaveBeenCalledWith(shift, "u1");
    expect((await send("POST", "/api/admin/content-duty/shifts", { ...shift, role: "admin" })).status).toBe(400);
  });

  it("maps invalid input from the store to 400", async () => {
    as("lead");
    mocks.createShift.mockRejectedValue(new ContentDutyInputError("البداية والنهاية متطابقتان"));
    const res = await send("POST", "/api/admin/content-duty/shifts", { ...shift, endMinute: 1200 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("CONTENT_DUTY_INVALID");
  });

  it("records a leave without cover and cancels it", async () => {
    as("lead");
    mocks.createException.mockResolvedValue({ id: "e1" });
    mocks.cancelException.mockResolvedValue(true);
    const body = { dutyDate: "2026-11-26", userId: "u2", coverUserId: null };
    expect((await send("POST", "/api/admin/content-duty/exceptions", body)).status).toBe(201);
    expect(mocks.createException).toHaveBeenCalledWith({ ...body, note: null }, "u1");
    expect((await send("POST", "/api/admin/content-duty/exceptions/e1/cancel", {})).status).toBe(200);
    mocks.cancelException.mockResolvedValue(false);
    expect((await send("POST", "/api/admin/content-duty/exceptions/nope/cancel", {})).status).toBe(404);
  });
});

describe("«عين المناوبة» alert settings", () => {
  it("saves alert settings for the lead only", async () => {
    as("manager");
    let res = await send("PUT", "/api/admin/content-duty/alert-settings", { settings: { absentMin: 45 } });
    expect(res.status).toBe(403);
    expect(mocks.saveAlertSettings).not.toHaveBeenCalled();

    as("lead");
    mocks.saveAlertSettings.mockResolvedValue({ absentMin: 45 });
    res = await send("PUT", "/api/admin/content-duty/alert-settings", { settings: { absentMin: 45 } });
    expect(res.status).toBe(200);
    expect(mocks.saveAlertSettings).toHaveBeenCalledWith({ absentMin: 45 });
    expect(await res.json()).toEqual({ settings: { absentMin: 45 } });
  });
});
