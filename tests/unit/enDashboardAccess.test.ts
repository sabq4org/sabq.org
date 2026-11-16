import { describe, expect, it } from "vitest";
import { canReadEnDashboardStats } from "@shared/enDashboardAccess";

describe("canReadEnDashboardStats", () => {
  it("lets superuser accounts in (they got 403 before)", () => {
    expect(canReadEnDashboardStats("system_admin", [])).toBe(true);
    expect(canReadEnDashboardStats("superadmin", [])).toBe(true);
    expect(canReadEnDashboardStats("reader", ["system_admin"])).toBe(true);
  });
  it("keeps the old roles", () => {
    for (const r of ["admin", "editor", "reporter"]) expect(canReadEnDashboardStats(r, [])).toBe(true);
  });
  it("accepts any non-reader RBAC role, like the Arabic dashboard", () => {
    expect(canReadEnDashboardStats("reader", ["chief_editor"])).toBe(true);
    expect(canReadEnDashboardStats(null, ["custom_desk"])).toBe(true);
  });
  it("refuses readers", () => {
    expect(canReadEnDashboardStats("reader", [])).toBe(false);
    expect(canReadEnDashboardStats("reader", ["reader"])).toBe(false);
    expect(canReadEnDashboardStats(undefined, [])).toBe(false);
  });
});
