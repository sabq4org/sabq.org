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

type RoleWriteDb = Pick<typeof db, "transaction">;

/**
 * يجعل `role` دور المستخدم الوحيد: يحدّث `users.role` ويستبدل صفوف `user_roles`
 * بصف هذا الدور داخل معاملة واحدة. الإضافة وحدها (`assignRbacRoleByName`) كانت
 * تُبقي صف `admin` أو `editor` القديم، فيبقى المخفَّض مشرفًا فعليًا لأن RBAC
 * يقرأ `user_roles` أولًا.
 */
export async function setUserSingleRole(
  userId: string,
  role: string,
  database: RoleWriteDb = db,
): Promise<typeof users.$inferSelect> {
  return database.transaction(async (tx) => {
    const [user] = await tx.update(users).set({ role }).where(eq(users.id, userId)).returning();
    const [rbacRole] = await tx.select().from(roles).where(eq(roles.name, role)).limit(1);
    await tx.delete(userRoles).where(eq(userRoles.userId, userId));
    if (rbacRole) {
      await tx.insert(userRoles).values({ id: nanoid(), userId, roleId: rbacRole.id });
    }
    return user;
  });
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
