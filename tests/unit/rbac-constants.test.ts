import { describe, it, expect } from "vitest";
import {
  ROLE_NAMES,
  SUPERUSER_ROLE_NAMES,
  ROLE_PERMISSIONS_MAP,
  PERMISSION_CODES,
  getPermissionsForRoles,
  resolveEffectivePermissions,
  denyPermissionsForRoles,
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

describe("content_manager — meetings.create and staff productivity revoked", () => {
  it("applies personal denies after code, DB, and dynamic grants across roles", () => {
    const effective = resolveEffectivePermissions(
      ["editor", "reporter"],
      ["articles.publish", "custom.allowed"],
      ["articles.publish"],
    );
    expect(effective).not.toContain("articles.publish");
    expect(effective).toContain("articles.view");
    expect(effective).toContain("custom.allowed");
    expect(resolveEffectivePermissions(["publisher"], ["articles.publish"], ["articles.publish"]))
      .not.toContain("articles.publish");
  });

  it("preserves the superuser contract despite personal denies", () => {
    expect(resolveEffectivePermissions(["admin"], [], ["articles.publish"]))
      .toEqual(["*"]);
  });

  it("ROLE_PERMISSIONS_MAP no longer grants meetings.create or staff.view_productivity", () => {
    const perms = ROLE_PERMISSIONS_MAP[ROLE_NAMES.CONTENT_MANAGER] || [];
    expect(perms).toContain("meetings.view");
    expect(perms).not.toContain("meetings.create");
    expect(perms).not.toContain(PERMISSION_CODES.VIEW_STAFF_PRODUCTIVITY);
  });

  it("resolveEffectivePermissions strips stale DB grants for content_manager", () => {
    const effective = resolveEffectivePermissions(
      [ROLE_NAMES.CONTENT_MANAGER],
      ["meetings.create", PERMISSION_CODES.VIEW_STAFF_PRODUCTIVITY, "articles.view"],
    );
    expect(effective).not.toContain("meetings.create");
    expect(effective).not.toContain(PERMISSION_CODES.VIEW_STAFF_PRODUCTIVITY);
    expect(effective).toContain("articles.view");
    expect(effective).toContain("meetings.view");
  });

  it("denyPermissionsForRoles leaves wildcard untouched", () => {
    expect(denyPermissionsForRoles([ROLE_NAMES.CONTENT_MANAGER], ["*"])).toEqual(["*"]);
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

  it("admin can assign anything except any system-admin-equivalent tier", () => {
    expect(canAssignRole(ROLE_NAMES.ADMIN, ROLE_NAMES.SYSTEM_ADMIN)).toBe(false);
    // The whole superuser tier is blocked, not just the literal "system_admin" —
    // else an admin could create+assign a "superadmin" role and self-escalate (audit #2).
    expect(canAssignRole(ROLE_NAMES.ADMIN, "superadmin")).toBe(false);
    expect(canAssignRole(ROLE_NAMES.ADMIN, "system.admin")).toBe(false);
    expect(canAssignRole(ROLE_NAMES.ADMIN, ROLE_NAMES.EDITOR)).toBe(true);
    expect(canAssignRole(ROLE_NAMES.ADMIN, ROLE_NAMES.ADMIN)).toBe(true);
  });

  it("non-admin roles can assign nothing", () => {
    expect(canAssignRole(ROLE_NAMES.EDITOR, ROLE_NAMES.REPORTER)).toBe(false);
    expect(canAssignRole(ROLE_NAMES.READER, ROLE_NAMES.READER)).toBe(false);
  });
});
