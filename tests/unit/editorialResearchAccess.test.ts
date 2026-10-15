import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ roles: [] as string[] }));
vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/memoryCache", () => ({
  memoryCache: { get: () => ({ roles: state.roles, isSuperuser: true, permissions: ["*"] }) },
  CACHE_TTL: {},
}));
import { requireRole } from "../../server/rbac";
import { EDITORIAL_RESEARCH_ROLES } from "../../shared/editorialResearch";

describe("editorial research uses the actual RBAC role gate", () => {
  it.each(["editor", "admin", "reader", "reporter", "chief_editor", ...EDITORIAL_RESEARCH_ROLES])("checks exact role %s regardless of wildcard permissions or cached superuser status", async role => {
    state.roles = [role];
    const req = { isAuthenticated: () => true, user: { id: "test-admin" } } as unknown as Request;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await requireRole(...EDITORIAL_RESEARCH_ROLES)(req, res as unknown as Response, next);
      if ((EDITORIAL_RESEARCH_ROLES as readonly string[]).includes(role)) {
        expect(next).toHaveBeenCalledOnce();
        expect(res.status).not.toHaveBeenCalled();
      } else {
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
      }
    } finally { log.mockRestore(); }
  });
});
