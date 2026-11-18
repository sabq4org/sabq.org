// طلبات تسجيل الناشرين (الرابط العام /publisher/register) — استعلامات Drizzle
// لمسارات server/routes/publisherApplications.ts (ADR-001).
// القبول ينشئ في معاملة واحدة: مستخدمًا بدور «publisher» + سجل الناشر + ربط الطلب،
// بنفس شكل مسار الإدارة POST /api/admin/publishers، مع كلمة مرور مؤقتة
// (mustChangePassword) تُرسل لبريد الدخول بدل كلمة يختارها المتقدم.
import { and, count, desc, eq, sql } from "drizzle-orm";
import bcrypt from "bcrypt";
import { nanoid } from "nanoid";
import { db } from "../db";
import {
  publisherApplications,
  publishers,
  roles,
  userRoles,
  users,
  type InsertPublisherApplication,
  type Publisher,
  type PublisherApplication,
} from "@shared/schema";
import type { ApprovePublisherApplicationInput } from "@shared/publisherApplications";

export class PublisherApplicationError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function hasPendingPublisherApplication(loginEmail: string, email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: publisherApplications.id })
    .from(publisherApplications)
    .where(
      and(
        eq(publisherApplications.status, "pending"),
        sql`(lower(${publisherApplications.loginEmail}) = ${loginEmail.toLowerCase()} or lower(${publisherApplications.email}) = ${email.toLowerCase()})`,
      ),
    )
    .limit(1);
  return !!row;
}

export async function createPublisherApplication(
  data: InsertPublisherApplication,
): Promise<PublisherApplication> {
  const [row] = await db
    .insert(publisherApplications)
    .values({ ...data, email: data.email.toLowerCase(), loginEmail: data.loginEmail.toLowerCase() })
    .returning();
  return row;
}

export type PublisherApplicationRow = PublisherApplication & {
  loginEmailInUse: boolean;
  reviewerName: string | null;
};

const loginEmailInUse = sql<boolean>`exists (select 1 from users u where lower(u.email) = lower(${publisherApplications.loginEmail}))`;
const reviewerName = sql<string | null>`(select trim(coalesce(u.first_name,'') || ' ' || coalesce(u.last_name,'')) from users u where u.id = ${publisherApplications.reviewedBy})`;

export async function listPublisherApplications(status?: string): Promise<{
  applications: PublisherApplicationRow[];
  counts: { pending: number; approved: number; rejected: number };
}> {
  const where = status && status !== "all" ? eq(publisherApplications.status, status) : undefined;
  const applications = await db
    .select({
      application: publisherApplications,
      loginEmailInUse,
      reviewerName,
    })
    .from(publisherApplications)
    .where(where)
    .orderBy(desc(publisherApplications.createdAt))
    .limit(200);

  const statusRows = await db
    .select({ status: publisherApplications.status, n: count() })
    .from(publisherApplications)
    .groupBy(publisherApplications.status);
  const counts = { pending: 0, approved: 0, rejected: 0 };
  for (const r of statusRows) {
    if (r.status in counts) counts[r.status as keyof typeof counts] = Number(r.n);
  }

  return {
    applications: applications.map((r) => ({
      ...r.application,
      loginEmailInUse: Boolean(r.loginEmailInUse),
      reviewerName: r.reviewerName || null,
    })),
    counts,
  };
}

export async function getPublisherApplication(id: string): Promise<PublisherApplication | undefined> {
  const [row] = await db.select().from(publisherApplications).where(eq(publisherApplications.id, id));
  return row;
}

export async function approvePublisherApplication(
  id: string,
  reviewerId: string,
  settings: ApprovePublisherApplicationInput,
): Promise<{ application: PublisherApplication; publisher: Publisher; temporaryPassword: string; userId: string }> {
  const temporaryPassword = `${nanoid(4)}-${nanoid(4)}-${nanoid(4)}`;
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);

  return db.transaction(async (tx) => {
    const [application] = await tx
      .select()
      .from(publisherApplications)
      .where(eq(publisherApplications.id, id))
      .for("update");
    if (!application) throw new PublisherApplicationError(404, "الطلب غير موجود");
    if (application.status !== "pending") throw new PublisherApplicationError(400, "تمت معالجة هذا الطلب مسبقًا");

    const loginEmail = application.loginEmail.toLowerCase().trim();
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${loginEmail}`)
      .limit(1);
    if (existing) {
      throw new PublisherApplicationError(
        409,
        "بريد الدخول مستخدم لحساب آخر في سبق. اطلب من الوكالة بريدًا مختلفًا أو عالج الحساب من إدارة المستخدمين.",
      );
    }

    const [publisherRole] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.name, "publisher")).limit(1);
    if (!publisherRole) throw new PublisherApplicationError(500, "دور الناشر غير موجود في النظام");

    const userId = nanoid();
    await tx.insert(users).values({
      id: userId,
      email: loginEmail,
      passwordHash,
      firstName: application.loginFirstName,
      lastName: application.loginLastName,
      role: "publisher",
      authProvider: "local",
      isProfileComplete: true,
      status: "active",
      emailVerified: true,
      mustChangePassword: true,
    });
    await tx.insert(userRoles).values({ userId, roleId: publisherRole.id, assignedBy: reviewerId });

    const [publisher] = await tx
      .insert(publishers)
      .values({
        userId,
        agencyName: application.agencyName,
        agencyNameEn: application.agencyNameEn,
        contactPerson: application.contactPerson,
        contactPersonEn: application.contactPersonEn,
        phoneNumber: application.phoneNumber,
        email: application.email,
        logoUrl: application.logoUrl,
        commercialRegistration: application.commercialRegistration,
        taxNumber: application.taxNumber,
        address: application.address,
        isActive: settings.isActive ?? true,
        autoPublish: settings.autoPublish ?? false,
        publishingEndsAt: settings.publishingEndsAt ? new Date(`${settings.publishingEndsAt}T23:59:59+03:00`) : null,
        notes: settings.notes ?? null,
      })
      .returning();

    const [updated] = await tx
      .update(publisherApplications)
      .set({
        status: "approved",
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: settings.notes ?? null,
        createdPublisherId: publisher.id,
        createdUserId: userId,
      })
      .where(and(eq(publisherApplications.id, id), eq(publisherApplications.status, "pending")))
      .returning();
    if (!updated) throw new PublisherApplicationError(400, "تمت معالجة هذا الطلب مسبقًا");

    return { application: updated, publisher, temporaryPassword, userId };
  });
}

export async function rejectPublisherApplication(
  id: string,
  reviewerId: string,
  reason: string,
): Promise<PublisherApplication> {
  const [row] = await db
    .update(publisherApplications)
    .set({ status: "rejected", reviewedBy: reviewerId, reviewedAt: new Date(), reviewNotes: reason })
    .where(and(eq(publisherApplications.id, id), eq(publisherApplications.status, "pending")))
    .returning();
  if (!row) {
    const exists = await getPublisherApplication(id);
    throw new PublisherApplicationError(exists ? 400 : 404, exists ? "تمت معالجة هذا الطلب مسبقًا" : "الطلب غير موجود");
  }
  return row;
}
