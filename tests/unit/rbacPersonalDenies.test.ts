import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  role: "editor",
  overrides: [] as { permissionCode: string; effect: string }[],
  failOverrides: false,
  cache: new Map<string, unknown>(),
}));
vi.mock("../../server/db", () => ({ db: {
  select(fields: Record<string, unknown>) {
    const builder: any = {
      from: () => builder, where: () => builder, limit: () => builder,
      innerJoin: () => builder,
      then(resolve: (value: unknown) => unknown, reject: (error: Error) => unknown) {
        if ("effect" in fields) {
          return state.failOverrides
            ? Promise.reject(new Error("override read failed")).then(resolve, reject)
            : Promise.resolve(state.overrides).then(resolve, reject);
        }
        const rows = "role" in fields ? [{ role: state.role }]
          : "roleName" in fields ? [{ roleName: state.role }]
          : "code" in fields ? [{ code: "articles.publish" }]
          : [{ permissionCode: "articles.publish" }, { permissionCode: "tasks.view_all" }];
        return Promise.resolve(rows).then(resolve, reject);
      },
    };
    return builder;
  },
} }));
vi.mock("../../server/memoryCache", () => ({
  CACHE_TTL: {},
  memoryCache: {
    get: (key: string) => state.cache.get(key),
    set: (key: string, value: unknown) => state.cache.set(key, value),
    delete: (key: string) => state.cache.delete(key),
  },
}));
import {
  getEffectiveUserPermissions, getUserPermissions, getUserPermissionData,
  userHasPermission, invalidateUserPermissionCache,
} from "../../server/rbac";

beforeEach(() => {
  state.cache.clear(); state.role = "editor"; state.failOverrides = false;
  state.overrides = [{ permissionCode: "articles.publish", effect: "deny" }];
});
describe("personal permission deny boundary", () => {
  it("blocks code-map grants in actual middleware resolution but retains legitimate grants", async () => {
    expect(await userHasPermission("editor", "articles.publish")).toBe(false);
    expect(await userHasPermission("editor", "articles.view")).toBe(true);
    expect(await getEffectiveUserPermissions("editor")).not.toContain("articles.publish");
  });
  it("honors allow and deny overrides in legacy DB permission results", async () => {
    state.overrides.push({ permissionCode: "tasks.view_all", effect: "deny" },
      { permissionCode: "tasks.view_own", effect: "allow" });
    expect(await getUserPermissions("editor")).toEqual(["tasks.view_own"]);
  });
  it("fails closed rather than recovering code grants after an override read failure", async () => {
    state.failOverrides = true;
    await expect(getUserPermissionData("editor")).rejects.toThrow("override read failed");
    expect(await userHasPermission("editor", "articles.view")).toBe(false);
    expect(await getUserPermissions("editor")).toEqual([]);
    expect(state.cache.has("rbac:editor")).toBe(false);
  });
  it("invalidates cached grants and the account payload when a deny is added", async () => {
    state.overrides = [];
    expect(await userHasPermission("editor", "articles.publish")).toBe(true);
    state.cache.set("auth-user:editor", {});
    state.overrides = [{ permissionCode: "articles.publish", effect: "deny" }];
    invalidateUserPermissionCache("editor");
    expect(state.cache.has("auth-user:editor")).toBe(false);
    expect(await userHasPermission("editor", "articles.publish")).toBe(false);
  });
  it("retains superuser wildcard and legacy expanded-code contracts", async () => {
    state.role = "admin";
    expect(await getEffectiveUserPermissions("admin")).toEqual(["*"]);
    expect(await userHasPermission("admin", "articles.publish")).toBe(true);
    expect(await getUserPermissions("admin")).toEqual(["articles.publish"]);
  });
});
