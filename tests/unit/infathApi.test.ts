import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { ZodError, z } from "zod";

const mocks = vi.hoisted(() => ({
  getPublicView: vi.fn(),
  getPreview: vi.fn(),
  listWeeks: vi.fn(),
  getWeekDetail: vi.fn(),
  createWeek: vi.fn(),
  saveAuctions: vi.fn(),
  submitWeek: vi.fn(),
  approveWeek: vi.fn(),
  returnWeek: vi.fn(),
  purgeContentSurfaces: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("../../server/services/infathService", () => ({
  InfathError: class InfathError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  ...Object.fromEntries(Object.entries(mocks).filter(([k]) => !["purgeContentSurfaces", "captureException"].includes(k))),
}));

vi.mock("../../server/services/cloudflarePurge", () => ({ purgeContentSurfaces: mocks.purgeContentSurfaces }));
vi.mock("@sentry/node", () => ({ captureException: mocks.captureException }));

function gate(allowed: string[]) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const user = req.headers["x-test-user"];
    if (!user) return res.sendStatus(401);
    const granted = String(req.headers["x-test-permission"] || "").split(",");
    if (!allowed.some((p) => granted.includes(p))) return res.sendStatus(403);
    req.user = { id: String(user) } as Express.User;
    next();
  };
}

vi.mock("../../server/rbac", () => ({
  requirePermission: (permission: string) => gate([permission]),
  requireAnyPermission: (...permissions: string[]) => gate(permissions),
}));

import router from "../../server/routes/infath";

const app = express();
app.use(express.json());
app.use(router);
const server = createServer(app);
let base = "";

const partner = { "x-test-user": "infath-1", "x-test-permission": "infath.submit", "Content-Type": "application/json" };
const editor = { "x-test-user": "editor-1", "x-test-permission": "infath.approve", "Content-Type": "application/json" };

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
});

describe("infath API", () => {
  it("serves the approved week with a short shared cache and 404 when empty", async () => {
    mocks.getPublicView.mockResolvedValueOnce({ week: { weekStart: "2026-10-25" } });
    const ok = await fetch(`${base}/api/infath?week=2026-10-25`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("public, max-age=30, s-maxage=60");
    expect(mocks.getPublicView).toHaveBeenCalledWith("2026-10-25");
    mocks.getPublicView.mockResolvedValueOnce(null);
    expect((await fetch(`${base}/api/infath`)).status).toBe(404);
  });

  it("keeps the dashboard and preview private and permission-gated", async () => {
    expect((await fetch(`${base}/api/infath/admin/weeks`)).status).toBe(401);
    expect((await fetch(`${base}/api/infath/admin/weeks`, { headers: { "x-test-user": "reader" } })).status).toBe(403);
    mocks.listWeeks.mockResolvedValue([]);
    const list = await fetch(`${base}/api/infath/admin/weeks`, { headers: partner });
    expect(list.status).toBe(200);
    expect(list.headers.get("cache-control")).toContain("no-store");
    expect((await fetch(`${base}/api/infath/admin/weeks/w1/preview`, { headers: { "x-test-user": "reader" } })).status).toBe(403);
  });

  it("lets Infath save and submit, but not approve or return", async () => {
    mocks.saveAuctions.mockResolvedValue({ id: "w1" });
    mocks.submitWeek.mockResolvedValue({ id: "w1" });
    const saved = await fetch(`${base}/api/infath/admin/weeks/w1/auctions`, { method: "PUT", headers: partner, body: JSON.stringify({ auctions: [] }) });
    expect(saved.status).toBe(200);
    expect(mocks.saveAuctions).toHaveBeenCalledWith("infath-1", "w1", { auctions: [] });
    expect((await fetch(`${base}/api/infath/admin/weeks/w1/submit`, { method: "POST", headers: partner, body: "{}" })).status).toBe(200);
    expect((await fetch(`${base}/api/infath/admin/weeks/w1/approve`, { method: "POST", headers: partner, body: "{}" })).status).toBe(403);
    expect((await fetch(`${base}/api/infath/admin/weeks/w1/return`, { method: "POST", headers: partner, body: "{}" })).status).toBe(403);
    expect(mocks.approveWeek).not.toHaveBeenCalled();
    expect(mocks.purgeContentSurfaces).not.toHaveBeenCalled();
  });

  it("approves as an editor and purges the public page", async () => {
    mocks.approveWeek.mockResolvedValue({ id: "w1", weekStart: "2026-10-25" });
    const response = await fetch(`${base}/api/infath/admin/weeks/w1/approve`, { method: "POST", headers: editor, body: JSON.stringify({ expectedUpdatedAt: null }) });
    expect(response.status).toBe(200);
    expect(mocks.approveWeek).toHaveBeenCalledWith("editor-1", "w1", { expectedUpdatedAt: null });
    expect(mocks.purgeContentSurfaces).toHaveBeenCalledWith(
      ["/infath", "/api/infath", "/infath?week=2026-10-25", "/api/infath?week=2026-10-25"],
      { immediate: true },
    );
  });

  it("returns field errors in Arabic and 409 for stale writes", async () => {
    const zod = z.object({ auctions: z.array(z.object({ date: z.string().min(99, "الصف 1: التاريخ خارج الأسبوع") })) }).safeParse({ auctions: [{ date: "x" }] });
    mocks.saveAuctions.mockRejectedValueOnce(zod.success ? new Error() : (zod.error as ZodError));
    const bad = await fetch(`${base}/api/infath/admin/weeks/w1/auctions`, { method: "PUT", headers: partner, body: "{}" });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ message: "بيانات غير صالحة", errors: { "التاريخ": ["الصف 1: التاريخ خارج الأسبوع"] } });

    const { InfathError } = await import("../../server/services/infathService");
    mocks.submitWeek.mockRejectedValueOnce(new InfathError(409, "عدّل شخص آخر"));
    const stale = await fetch(`${base}/api/infath/admin/weeks/w1/submit`, { method: "POST", headers: partner, body: "{}" });
    expect(stale.status).toBe(409);
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  it("reports unexpected failures to Sentry", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getPublicView.mockRejectedValueOnce(new Error("boom"));
    expect((await fetch(`${base}/api/infath`)).status).toBe(500);
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
