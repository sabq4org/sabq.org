import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

vi.mock("../../server/db", () => ({ db: {} }));

const session = { current: null as null | { userId: string } };
vi.mock("../../server/services/memberSessionService", () => ({
  verifyMemberBearer: vi.fn(async () => session.current),
}));

const svc = {
  listInbox: vi.fn(async () => ({ items: [], unread: 2, hasMore: false })),
  countUnread: vi.fn(async () => 2),
  markRead: vi.fn(async () => true),
  markAllRead: vi.fn(async () => undefined),
  deleteItem: vi.fn(async () => false),
  getPrefs: vi.fn(async () => ({ dailyDigest: false })),
  updatePrefs: vi.fn(async (_u: string, p: object) => p),
};
vi.mock("../../server/services/readerInboxService", async (orig) => {
  const real = await orig<typeof import("../../server/services/readerInboxService")>();
  return { ...svc, parsePrefsPatch: real.parsePrefsPatch };
});

let server: Server;
let base = "";
beforeAll(async () => {
  const router = (await import("../../server/routes/readerInboxMobile")).default;
  const app = express();
  app.use(express.json());
  app.use(router);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server?.close());
beforeEach(() => {
  session.current = { userId: "u1" };
  vi.clearAllMocks();
});

const send = (method: string, path: string, body?: unknown) =>
  fetch(base + path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("v1 reader inbox", () => {
  it("يرفض بلا جلسة ولا يلمس الخدمة", async () => {
    session.current = null;
    const res = await send("GET", "/api/v1/inbox");
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(svc.listInbox).not.toHaveBeenCalled();
  });

  it("يقصّ limit وoffset إلى الحدود", async () => {
    await send("GET", "/api/v1/inbox?limit=999&offset=-5");
    expect(svc.listInbox).toHaveBeenCalledWith("u1", 100, 0);
  });

  it("read-all لا تُفهم معرّفًا", async () => {
    expect((await send("POST", "/api/v1/inbox/read-all")).status).toBe(200);
    expect(svc.markAllRead).toHaveBeenCalledWith("u1");
    expect(svc.markRead).not.toHaveBeenCalled();
  });

  it("حذف إشعار غير موجود أو لغيره يرجّع 404", async () => {
    expect((await send("DELETE", "/api/v1/inbox/x")).status).toBe(404);
    expect(svc.deleteItem).toHaveBeenCalledWith("u1", "x");
  });

  it("التفضيلات: يقبل الحقول المعروفة ويرفض الباقي", async () => {
    const ok = await send("PATCH", "/api/v1/inbox/preferences", { dailyDigest: true, quietHoursStart: "22:30" });
    expect(ok.status).toBe(200);
    expect(svc.updatePrefs).toHaveBeenCalledWith("u1", { dailyDigest: true, quietHoursStart: "22:30" });

    for (const bad of [{}, { dailyDigest: "yes" }, { quietHoursEnd: "25:00" }, { quietHoursStart: null }, { breaking: false }]) {
      expect((await send("PATCH", "/api/v1/inbox/preferences", bad)).status).toBe(400);
    }
  });
});
