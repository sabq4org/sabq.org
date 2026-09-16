// مزامنة users.role مع user_roles حتى لا يظهر المنسوب قارئاً.
import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db";
import { roles, userRoles, users } from "@shared/schema";
import { mergeRoleSignals, primaryRoleKey } from "@shared/effectiveRoles";

type RoleTx = {
  select: typeof db.select;
  update: typeof db.update;
};

export async function assignRbacRoleByName(userId: string, role: string): Promise<void> {
  const [rbacRole] = await db.select().from(roles).where(eq(roles.name, role)).limit(1);
  if (!rbacRole) return;
  await db.insert(userRoles).values({ id: nanoid(), userId, roleId: rbacRole.id }).onConflictDoNothing();
}

export async function resolvePrimaryRoleName(
  tx: RoleTx,
  roleIds: string[] | undefined,
): Promise<string> {
  if (!roleIds?.length) return "reader";
  const assigned = await tx.select({ name: roles.name }).from(roles).where(inArray(roles.id, roleIds));
  return primaryRoleKey(mergeRoleSignals(assigned.map((r) => r.name)));
}

export async function syncLegacyRoleFromRoleIds(
  tx: RoleTx,
  userId: string,
  roleIds: string[],
): Promise<Array<{ id: string; name: string }>> {
  const newRoles = roleIds.length > 0
    ? await tx.select({ id: roles.id, name: roles.name }).from(roles).where(inArray(roles.id, roleIds))
    : [];
  await tx.update(users).set({ role: primaryRoleKey(mergeRoleSignals(newRoles.map((r) => r.name))) }).where(eq(users.id, userId));
  return newRoles;
}
