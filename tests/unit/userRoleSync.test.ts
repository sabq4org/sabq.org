import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/db", () => ({ db: {} }));

import { setUserSingleRole, syncLegacyRoleFromRoleIds } from "../../server/services/userRoleSync";
import { userRoles, users } from "@shared/schema";

function fakeDb(roleRow: { id: string } | undefined) {
  const ops: string[] = [];
  const tx: any = {
    update: (table: unknown) => {
      ops.push(table === users ? "update:users" : "update:?");
      return { set: () => ({ where: () => ({ returning: async () => [{ id: "u1", role: "reader" }] }) }) };
    },
    select: () => ({ from: () => ({ where: () => ({ limit: async () => (roleRow ? [roleRow] : []) }) }) }),
    delete: (table: unknown) => {
      ops.push(table === userRoles ? "delete:user_roles" : "delete:?");
      return { where: async () => undefined };
    },
    insert: (table: unknown) => {
      ops.push(table === userRoles ? "insert:user_roles" : "insert:?");
      return { values: async (v: any) => { ops.push(`role:${v.roleId}`); } };
    },
  };
  const database: any = { transaction: vi.fn(async (fn: (t: any) => unknown) => fn(tx)) };
  return { database, ops };
}

describe("setUserSingleRole", () => {
  it("removes every previous user_roles row before assigning the new role", async () => {
    const { database, ops } = fakeDb({ id: "role-reader" });
    const user = await setUserSingleRole("u1", "reader", database);
    expect(database.transaction).toHaveBeenCalledTimes(1);
    expect(ops).toEqual(["update:users", "delete:user_roles", "insert:user_roles", "role:role-reader"]);
    expect(user).toEqual({ id: "u1", role: "reader" });
  });

  it("still clears stale rows when the role has no RBAC row", async () => {
    const { database, ops } = fakeDb(undefined);
    await setUserSingleRole("u1", "legacy_role", database);
    expect(ops).toEqual(["update:users", "delete:user_roles"]);
  });
});

describe("syncLegacyRoleFromRoleIds", () => {
  it("keeps users.role as editor when user has [reporter, editor] regardless of DB row order", async () => {
    const setPayloads: Array<{ role: string }> = [];
    const tx: any = {
      select: () => ({
        from: () => ({
          where: async () => [
            { id: "role-reporter", name: "reporter" },
            { id: "role-editor", name: "editor" },
          ],
        }),
      }),
      update: () => ({
        set: (payload: { role: string }) => {
          setPayloads.push(payload);
          return { where: async () => undefined };
        },
      }),
    };

    const result = await syncLegacyRoleFromRoleIds(tx, "u-yasser", ["role-reporter", "role-editor"]);
    expect(result).toHaveLength(2);
    expect(setPayloads).toEqual([{ role: "editor" }]);
  });
});
