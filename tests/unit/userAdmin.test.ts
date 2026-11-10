import { describe, expect, it } from "vitest";
import { resolveEffectivePermissions, denyPermissionsForRoles } from "../../shared/rbac-constants";
import {
  canTransitionRoleStatus,
  describeSteps,
  isProtectedRoleName,
  publishLevelOf,
  resolveUserPermissions,
  userAdminSaveSchema,
  type ResolveInput,
} from "../../shared/userAdmin";

const rolePermissions: Record<string, string[]> = {
  editor: ["articles.create", "articles.edit_own", "articles.edit_any", "articles.publish", "articles.schedule"],
  reporter: ["articles.create", "articles.edit_own", "articles.publish"], // منحة قديمة في DB يجب أن يحجبها DENY map
  comments_moderator: ["comments.approve"],
  opinion_author: ["opinion.create", "opinion.submit_review"],
};

function input(over: Partial<ResolveInput>): ResolveInput {
  return { legacyRole: "reader", assignedRoles: [], inactiveRoles: new Set(), rolePermissions, overrides: [], ...over };
}

/** الحساب كما يجريه server/rbac.ts حرفيًا (loadEffectivePermData + getUserPermissionData) قبل حالة الدور. */
function rbacReference(i: ResolveInput): Set<string> {
  const rbacNames = i.assignedRoles;
  const allRoles = rbacNames.length ? rbacNames : [i.legacyRole || "reader"];
  const db = new Set<string>();
  for (const r of rbacNames) for (const c of i.rolePermissions[r] || []) db.add(c);
  for (const o of i.overrides) o.effect === "allow" ? db.add(o.code) : db.delete(o.code);
  const roleNames = Array.from(new Set([...(i.legacyRole ? [i.legacyRole] : []), ...rbacNames]));
  const perms = denyPermissionsForRoles(roleNames, Array.from(db));
  return new Set(resolveEffectivePermissions(allRoles, perms, i.overrides.filter((o) => o.effect === "deny").map((o) => o.code)));
}

describe("resolveUserPermissions", () => {
  const cases: Array<[string, Partial<ResolveInput>]> = [
    ["editor", { legacyRole: "editor", assignedRoles: ["editor"] }],
    ["reporter with stale DB publish", { legacyRole: "reporter", assignedRoles: ["reporter"] }],
    ["multi role", { legacyRole: "editor", assignedRoles: ["editor", "comments_moderator"] }],
    ["legacy-only role", { legacyRole: "reporter", assignedRoles: [] }],
    ["overrides", { legacyRole: "editor", assignedRoles: ["editor"], overrides: [{ code: "articles.publish", effect: "deny" }, { code: "articles.ai_generate", effect: "allow" }] }],
    ["opinion author allow publish", { legacyRole: "opinion_author", assignedRoles: ["opinion_author"], overrides: [{ code: "articles.publish", effect: "allow" }] }],
  ];
  it.each(cases)("matches the rbac.ts computation: %s", (_name, over) => {
    const i = input(over);
    expect(resolveUserPermissions(i).permissions).toEqual(rbacReference(i));
  });

  it("treats admin and system_admin as superusers", () => {
    expect(resolveUserPermissions(input({ legacyRole: "admin", assignedRoles: ["admin"] })).isSuperuser).toBe(true);
    expect(resolveUserPermissions(input({ legacyRole: "reader", assignedRoles: ["system_admin"] })).isSuperuser).toBe(true);
  });

  it("drops a disabled role's permissions but keeps the assignment visible", () => {
    const r = resolveUserPermissions(input({ legacyRole: "editor", assignedRoles: ["editor", "comments_moderator"], inactiveRoles: new Set(["editor"]) }));
    expect(r.permissions.has("articles.publish")).toBe(false);
    expect(r.permissions.has("comments.approve")).toBe(true);
    expect(r.suspendedRoles).toEqual(["editor"]);
  });

  it("does not fall back to a disabled legacy role", () => {
    const r = resolveUserPermissions(input({ legacyRole: "editor", assignedRoles: ["editor"], inactiveRoles: new Set(["editor"]) }));
    expect(r.activeRoles).toEqual(["reader"]);
    expect(r.permissions.has("articles.create")).toBe(false);
  });
});

describe("describeSteps", () => {
  it("marks reporter publish as permanently locked, even with an allow override", () => {
    const steps = describeSteps(input({ legacyRole: "reporter", assignedRoles: ["reporter"], overrides: [{ code: "articles.publish", effect: "allow" }] }));
    const publish = steps.find((s) => s.code === "articles.publish")!;
    expect(publish.granted).toBe(false);
    expect(publish.lockedBy).toEqual(["reporter"]);
    expect(publish.override).toBe("allow");
  });

  it("does not lock a step another assigned role grants in code", () => {
    const steps = describeSteps(input({ legacyRole: "editor", assignedRoles: ["editor", "reporter"] }));
    const publish = steps.find((s) => s.code === "articles.publish")!;
    expect(publish.granted).toBe(true);
    expect(publish.lockedBy).toEqual([]);
    expect(publish.viaRoles).toContain("editor");
  });

  it("reports a personal deny as the reason a role grant is off", () => {
    const steps = describeSteps(input({ legacyRole: "editor", assignedRoles: ["editor"], overrides: [{ code: "articles.publish", effect: "deny" }] }));
    const publish = steps.find((s) => s.code === "articles.publish")!;
    expect(publish.granted).toBe(false);
    expect(publish.override).toBe("deny");
    expect(publish.viaRoles).toContain("editor");
  });
});

describe("publishLevelOf", () => {
  it("ranks users by the highest editorial step", () => {
    expect(publishLevelOf(resolveUserPermissions(input({ legacyRole: "admin", assignedRoles: ["admin"] })))).toBe("all");
    expect(publishLevelOf(resolveUserPermissions(input({ legacyRole: "editor", assignedRoles: ["editor"] })))).toBe("publishes");
    expect(publishLevelOf(resolveUserPermissions(input({ legacyRole: "reporter", assignedRoles: ["reporter"] })))).toBe("submits");
    expect(publishLevelOf(resolveUserPermissions(input({ legacyRole: "reader", assignedRoles: [] })))).toBe("none");
  });
});

describe("role status rules", () => {
  it("protects the superuser roles", () => {
    expect(isProtectedRoleName("admin")).toBe(true);
    expect(isProtectedRoleName("system_admin")).toBe(true);
    expect(isProtectedRoleName("editor")).toBe(false);
  });

  it("only lets an archived role come back as disabled", () => {
    expect(canTransitionRoleStatus("archived", "active")).toBe(false);
    expect(canTransitionRoleStatus("archived", "disabled")).toBe(true);
    expect(canTransitionRoleStatus("active", "active")).toBe(false);
    expect(canTransitionRoleStatus("closed", "disabled")).toBe(true);
  });
});

describe("userAdminSaveSchema", () => {
  it("requires a version and validates Saudi mobile numbers", () => {
    expect(userAdminSaveSchema.safeParse({ profile: {} }).success).toBe(false);
    expect(userAdminSaveSchema.safeParse({ expectedVersion: "abcdefgh12", profile: { phoneNumber: "05512" } }).success).toBe(false);
    expect(userAdminSaveSchema.safeParse({ expectedVersion: "abcdefgh12", profile: { phoneNumber: "0551234567" } }).success).toBe(true);
  });

  it("requires a reason for suspension and rejects unknown keys", () => {
    expect(userAdminSaveSchema.safeParse({ expectedVersion: "abcdefgh12", status: { action: "suspended", days: 7 } }).success).toBe(false);
    expect(userAdminSaveSchema.safeParse({ expectedVersion: "abcdefgh12", status: { action: "suspended", days: 7, reason: "مراجعة إدارية" } }).success).toBe(true);
    expect(userAdminSaveSchema.safeParse({ expectedVersion: "abcdefgh12", role: "admin" }).success).toBe(false);
  });
});
