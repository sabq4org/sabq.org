import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: undefined as { id: string; role: string } | undefined,
  permissions: [] as string[],
  findBlock: vi.fn(),
  lockDraft: vi.fn(),
  unlockDraft: vi.fn(),
  reachedHandler: vi.fn(),
}));

vi.mock("../../server/rbac", () => ({
  getEffectiveUserPermissions: async () => state.permissions,
  requireAuth: (req: { user?: unknown }, res: { status: (n: number) => { json: (b: unknown) => void } }, next: () => void) =>
    req.user ? next() : res.status(401).json({ message: "Unauthorized" }),
}));
vi.mock("../../server/services/draftLockService", () => ({
  findDraftLockBlock: state.findBlock,
  lockDraft: state.lockDraft,
  unlockDraft: state.unlockDraft,
  getDraftLock: vi.fn(),
  draftLockSummary: vi.fn(),
}));

import router from "../../server/routes/articleDraftLock";

const blocked = {
  status: 409 as const,
  body: { success: false, code: "DRAFT_LOCKED", message: "مقفلة", error: "مقفلة", draftLock: { locked: true }, articleIds: ["a1"] },
};

describe("draft lock guard on the web API", () => {
  let server: Server;
  let origin: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { (req as { user?: unknown }).user = state.user; next(); });
    app.use(router);
    // يمثل مسارات routes.ts المسجلة بعد الحارس
    app.all("*", (req, res) => { state.reachedHandler(req.method, req.path); res.json({ ok: true }); });
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });
  beforeEach(() => {
    state.user = { id: "colleague", role: "editor" };
    state.permissions = ["articles.edit_any"];
    state.findBlock.mockReset().mockResolvedValue(null);
    state.lockDraft.mockReset();
    state.unlockDraft.mockReset();
    state.reachedHandler.mockReset();
  });

  it("stops a colleague's publish before it reaches the route", async () => {
    state.findBlock.mockResolvedValue(blocked);
    const res = await fetch(`${origin}/api/admin/articles/a1/publish`, { method: "POST" });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "DRAFT_LOCKED" });
    expect(state.findBlock).toHaveBeenCalledWith(["a1"], "colleague");
    expect(state.reachedHandler).not.toHaveBeenCalled();
  });

  it("checks every id of a bulk archive", async () => {
    state.findBlock.mockResolvedValue(blocked);
    const res = await fetch(`${origin}/api/admin/articles/bulk-archive`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ articleIds: ["a1", "a2"] }),
    });
    expect(res.status).toBe(409);
    expect(state.findBlock).toHaveBeenCalledWith(["a1", "a2"], "colleague");
  });

  it("lets the write through when no lock blocks it, and never checks reads", async () => {
    const save = await fetch(`${origin}/api/admin/articles/a1`, { method: "PATCH" });
    expect(save.status).toBe(200);
    expect(state.reachedHandler).toHaveBeenCalledWith("PATCH", "/api/admin/articles/a1");
    state.findBlock.mockClear();
    await fetch(`${origin}/api/admin/articles/a1`);
    expect(state.findBlock).not.toHaveBeenCalled();
  });

  it("leaves unauthenticated writes to the route's own 401", async () => {
    state.user = undefined;
    await fetch(`${origin}/api/admin/articles/a1`, { method: "DELETE" });
    expect(state.findBlock).not.toHaveBeenCalled();
    expect(state.reachedHandler).toHaveBeenCalled();
  });

  it("passes the note and the override reason to the service", async () => {
    state.lockDraft.mockResolvedValue({ ok: true, state: { locked: true, isOwner: true } });
    const lock = await fetch(`${origin}/api/admin/articles/a1/draft-lock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note: "ننتظر الأرقام" }),
    });
    expect(lock.status).toBe(200);
    expect(state.lockDraft).toHaveBeenCalledWith(expect.objectContaining({ articleId: "a1", userId: "colleague", note: "ننتظر الأرقام" }));

    state.permissions = ["*"];
    state.unlockDraft.mockResolvedValue({ ok: false, status: 400, code: "reason_required", message: "اكتب سبب فك القفل" });
    const unlock = await fetch(`${origin}/api/admin/articles/a1/draft-lock`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "" }),
    });
    expect(unlock.status).toBe(400);
    expect(state.unlockDraft).toHaveBeenCalledWith(expect.objectContaining({ permissions: ["*"], reason: "" }));
    expect(state.reachedHandler).not.toHaveBeenCalled();
  });
});
