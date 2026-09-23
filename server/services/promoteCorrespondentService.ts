// ترقية عضوية قارئ إلى مراسل — يزامن users.role + user_roles + سجل staff.
import { count, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../db";
import { articles, correspondentApplications, roles, staff, userRoles, users } from "@shared/schema";
import { isReaderLikeRole } from "@shared/effectiveRoles";
import { getUserRoleNames, invalidateUserPermissionCache } from "../rbac";
import { invalidateAllUserSessions, invalidateUserSessionCache } from "../auth";
import { storage } from "../storage";

export type CorrespondentCandidate = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string | null;
  status: string | null;
  emailVerified: boolean | null;
  rbacRoles: string[];
  effectiveRoles: string[];
  articleCount: number;
  staffType: string | null;
  applicationStatus: string | null;
};

function normalizeEmails(emails: string[]): string[] {
  return [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

export async function findCorrespondentCandidates(opts: {
  emails?: string[];
  name?: string;
}): Promise<CorrespondentCandidate[]> {
  const emails = normalizeEmails(opts.emails ?? []);
  const name = opts.name?.trim() ?? "";
  if (emails.length === 0 && !name) return [];

  const matchers = [];
  if (emails.length > 0) {
    matchers.push(sql`lower(${users.email}) in (${sql.join(emails.map((e) => sql`${e}`), sql`, `)})`);
  }
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    matchers.push(
      or(
        sql`concat_ws(' ', ${users.firstName}, ${users.lastName}) ilike ${`%${name}%`}`,
        ...parts.flatMap((part) => [
          ilike(users.firstName, `%${part}%`),
          ilike(users.lastName, `%${part}%`),
        ]),
      ),
    );
  }

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      status: users.status,
      emailVerified: users.emailVerified,
    })
    .from(users)
    .where(or(...matchers))
    .limit(25);

  const results: CorrespondentCandidate[] = [];
  for (const row of rows) {
    const [rbacRows, [staffRow], [articleCount], [application]] = await Promise.all([
      db
        .select({ name: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(userRoles.userId, row.id)),
      db
        .select({ staffType: staff.staffType })
        .from(staff)
        .where(eq(staff.userId, row.id))
        .limit(1),
      db
        .select({ count: count() })
        .from(articles)
        .where(eq(articles.reporterId, row.id)),
      row.email
        ? db
            .select({ status: correspondentApplications.status })
            .from(correspondentApplications)
            .where(sql`lower(${correspondentApplications.email}) = ${row.email.toLowerCase()}`)
            .limit(1)
        : Promise.resolve([] as { status: string }[]),
    ]);

    const rbacRoles = rbacRows.map((r) => r.name);
    results.push({
      ...row,
      rbacRoles,
      effectiveRoles: await getUserRoleNames(row.id),
      articleCount: Number(articleCount?.count ?? 0),
      staffType: staffRow?.staffType ?? null,
      applicationStatus: application?.status ?? null,
    });
  }
  return results;
}

export async function promoteUserToReporter(
  userId: string,
  actorId: string,
): Promise<{ userId: string; alreadyReporter: boolean; role: string }> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    throw new Error("المستخدم غير موجود");
  }
  if (user.status === "deleted") {
    throw new Error("لا يمكن ترقية عضوية محذوفة");
  }

  const currentRoles = await getUserRoleNames(userId);
  const alreadyReporter = currentRoles.includes("reporter") && user.role === "reporter";

  const [reporterRole] = await db.select().from(roles).where(eq(roles.name, "reporter")).limit(1);
  if (!reporterRole) {
    throw new Error("دور المراسل غير موجود في جدول الأدوار — شغّل seed-rbac");
  }

  if (isReaderLikeRole(user.role)) {
    await db
      .update(users)
      .set({ role: "reporter", status: "active" })
      .where(eq(users.id, userId));
  }

  await db
    .insert(userRoles)
    .values({
      userId,
      roleId: reporterRole.id,
      assignedBy: actorId.startsWith("script-") ? null : actorId,
    })
    .onConflictDoNothing();

  await storage.ensureReporterStaffRecord(userId);
  invalidateUserPermissionCache(userId);
  invalidateUserSessionCache(userId);
  await invalidateAllUserSessions(userId);

  return {
    userId,
    alreadyReporter,
    role: isReaderLikeRole(user.role) ? "reporter" : user.role || "reporter",
  };
}
