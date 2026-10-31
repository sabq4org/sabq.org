import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  countMyNews,
  filterMyNews,
  myNewsQuerySchema,
  myNewsStatus,
  sortMyNews,
} from "../../shared/mobileEditorial";

const state = vi.hoisted(() => ({
  session: { userId: "u1" } as { userId: string } | null,
  user: { id: "u1", name: "مراسل جدة", role: "reporter", twoFactorEnabled: true } as Record<string, unknown> | null,
  caps: { canReport: true, canNews: false } as Record<string, unknown>,
  board: vi.fn(),
  createEditRequest: vi.fn(),
}));

vi.mock("../../server/services/memberSessionService", () => ({ verifyMemberBearer: async () => state.session }));
vi.mock("../../server/rbac", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("../../server/services/staffAppService", () => ({
  getStaffUserAccount: async () => state.user,
  resolveStaffCapabilitiesAndRoles: async () => ({ roles: [], capabilities: state.caps }),
}));
vi.mock("../../server/services/mobileEditorialService", () => ({ getMyNewsBoard: state.board }));
vi.mock("../../server/services/articleEditRequestsService", () => ({
  createEditRequest: state.createEditRequest,
  cancelEditRequest: vi.fn(),
  getEditRequestContext: vi.fn(),
}));
vi.mock("../../server/services/staffNewsDeskService", () => ({
  StaffNewsDeskError: class extends Error {},
  getStaffNewsBoard: vi.fn(async () => ({ counts: {}, items: [] })),
  getStaffNewsPreview: vi.fn(),
  listStaffNewsCategories: vi.fn(),
  publishNewsFromDesk: vi.fn(),
  returnNewsToReporterFromDesk: vi.fn(),
  scheduleNewsFromDesk: vi.fn(),
}));

import mobileEditorialRouter from "../../server/routes/mobileEditorial";

describe("myNewsStatus", () => {
  it("matches the web reporter labels", () => {
    expect(myNewsStatus({ status: "published", reviewStatus: "pending_review" })).toBe("published");
    expect(myNewsStatus({ status: "scheduled", reviewStatus: "approved" })).toBe("scheduled");
    expect(myNewsStatus({ status: "draft", reviewStatus: "needs_changes" })).toBe("needs_changes");
    expect(myNewsStatus({ status: "draft", reviewStatus: "pending_review" })).toBe("pending");
    expect(myNewsStatus({ status: "draft", reviewStatus: null })).toBe("draft");
    expect(myNewsStatus({ status: "archived", reviewStatus: null })).toBe("archived");
  });

  it("counts, filters and sorts returned news first", () => {
    const items = [
      { id: "a", state: "published" as const, updatedAt: "2026-10-31T08:00:00Z" },
      { id: "b", state: "needs_changes" as const, updatedAt: "2026-10-30T08:00:00Z" },
      { id: "c", state: "archived" as const, updatedAt: "2026-10-31T09:00:00Z" },
      { id: "d", state: "pending" as const, updatedAt: "2026-10-31T07:00:00Z" },
    ];
    expect(countMyNews(items)).toEqual({ all: 3, pending: 1, needs_changes: 1, scheduled: 0, published: 1, draft: 0 });
    expect(filterMyNews(items, "all").map((i) => i.id)).toEqual(["a", "b", "d"]);
    expect(sortMyNews(items).map((i) => i.id)).toEqual(["b", "c", "a", "d"]);
    expect(myNewsQuerySchema.safeParse({ filter: "nope" }).success).toBe(false);
    expect(myNewsQuerySchema.parse({}).filter).toBe("all");
  });
});

describe("/api/v1/editorial", () => {
  let base = "";
  const server = createServer(express().use(express.json()).use("/api/v1/editorial", mobileEditorialRouter));

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/editorial`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
  beforeEach(() => {
    state.session = { userId: "u1" };
    state.user = { id: "u1", name: "مراسل جدة", role: "reporter", twoFactorEnabled: true };
    state.caps = { canReport: true, canNews: false };
    state.board.mockReset().mockResolvedValue({ counts: {}, editRequestsReady: true, items: [] });
    state.createEditRequest.mockReset();
  });

  const get = (path: string, token = "member-token") =>
    fetch(`${base}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

  it("rejects missing sessions and bot tokens", async () => {
    expect((await get("/me", "")).status).toBe(401);
    expect((await get("/me", "botpub_abcdefghijklmnopqrstuvwx")).status).toBe(401);
    state.session = null;
    expect((await get("/me")).status).toBe(401);
  });

  it("requires two-factor like the Desk", async () => {
    state.user = { ...state.user, twoFactorEnabled: false };
    const res = await get("/my-news");
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("two_factor_required");
    expect(state.board).not.toHaveBeenCalled();
  });

  it("serves my-news to reporters and keeps it private", async () => {
    const res = await get("/my-news?filter=published");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(state.board).toHaveBeenCalledWith({ userId: "u1", filter: "published" });
  });

  it("hides reporter routes from members without news and the supervisor board from reporters", async () => {
    state.caps = { canReport: false, canNews: false };
    expect((await get("/my-news")).status).toBe(403);
    state.caps = { canReport: true, canNews: false };
    expect((await get("/news")).status).toBe(403);
    state.caps = { canReport: false, canNews: true };
    expect((await get("/news")).status).toBe(200);
  });

  it("creates edit requests through the shared service", async () => {
    state.createEditRequest.mockResolvedValue({ ok: true, request: { id: "r1" } });
    const res = await fetch(`${base}/edit-requests`, {
      method: "POST",
      headers: { Authorization: "Bearer member-token", "Content-Type": "application/json" },
      body: JSON.stringify({ articleId: "a1", note: "عدد دور النشر تغيّر", proposed: { title: "عنوان جديد" } }),
    });
    expect(res.status).toBe(201);
    expect(state.createEditRequest).toHaveBeenCalledWith(expect.objectContaining({ articleId: "a1" }), "u1");
  });
});
