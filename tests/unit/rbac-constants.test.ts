import { describe, it, expect } from "vitest";
import {
  ROLE_NAMES,
  SUPERUSER_ROLE_NAMES,
  ROLE_PERMISSIONS_MAP,
  PERMISSION_CODES,
  getPermissionsForRoles,
  canAssignRole,
} from "@shared/rbac-constants";

// The wildcard contract is load-bearing: /api/auth/user returns the array
// computed here, and useAuth + the three nav-filter hooks short-circuit on
// permissions.includes("*"). Expanding "*" into PERMISSION_CODES would
// silently drop dozens of frontend-only codes (roles.view, ads.manage, ...)
// and blank the admin sidebar — see CLAUDE.md "RBAC has two layers".
describe("getPermissionsForRoles — wildcard contract", () => {
  it("returns the literal ['*'] for admin (never expanded)", () => {
    expect(getPermissionsForRoles(["admin"])).toEqual(["*"]);
  });

  it("returns the literal ['*'] for system_admin", () => {
    expect(getPermissionsForRoles(["system_admin"])).toEqual(["*"]);
  });

  it("short-circuits to ['*'] when any role in the list is a wildcard role", () => {
    expect(getPermissionsForRoles(["editor", "admin", "reporter"])).toEqual(["*"]);
  });

  it("unions non-wildcard roles without duplicates", () => {
    const perms = getPermissionsForRoles(["editor", "reporter"]);
    expect(perms).not.toContain("*");
    expect(perms).toContain(PERMISSION_CODES.ARTICLES_VIEW);
    expect(new Set(perms).size).toBe(perms.length);
  });

  it("returns [] for unknown roles and for an empty list", () => {
    expect(getPermissionsForRoles(["no_such_role"])).toEqual([]);
    expect(getPermissionsForRoles([])).toEqual([]);
  });
});

describe("SUPERUSER_ROLE_NAMES — must stay in sync with seed data (audit H5)", () => {
  it("contains exactly the four known superuser role strings", () => {
    expect([...SUPERUSER_ROLE_NAMES].sort()).toEqual(
      ["admin", "superadmin", "system_admin", "system.admin"].sort(),
    );
  });

  it("admin and system_admin map to exactly ['*'] in ROLE_PERMISSIONS_MAP", () => {
    expect(ROLE_PERMISSIONS_MAP[ROLE_NAMES.ADMIN]).toEqual(["*"]);
    expect(ROLE_PERMISSIONS_MAP[ROLE_NAMES.SYSTEM_ADMIN]).toEqual(["*"]);
  });
});

describe("canAssignRole", () => {
  it("system_admin can assign any role, including system_admin", () => {
    expect(canAssignRole(ROLE_NAMES.SYSTEM_ADMIN, ROLE_NAMES.SYSTEM_ADMIN)).toBe(true);
    expect(canAssignRole(ROLE_NAMES.SYSTEM_ADMIN, ROLE_NAMES.READER)).toBe(true);
  });

  it("admin can assign anything except system_admin", () => {
    expect(canAssignRole(ROLE_NAMES.ADMIN, ROLE_NAMES.SYSTEM_ADMIN)).toBe(false);
    expect(canAssignRole(ROLE_NAMES.ADMIN, ROLE_NAMES.EDITOR)).toBe(true);
    expect(canAssignRole(ROLE_NAMES.ADMIN, ROLE_NAMES.ADMIN)).toBe(true);
  });

  it("non-admin roles can assign nothing", () => {
    expect(canAssignRole(ROLE_NAMES.EDITOR, ROLE_NAMES.REPORTER)).toBe(false);
    expect(canAssignRole(ROLE_NAMES.READER, ROLE_NAMES.READER)).toBe(false);
  });
});
