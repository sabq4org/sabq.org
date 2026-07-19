// خدمة طلبات المراسلين — استعلامات Drizzle لمسارات server/routes/correspondentApplications.ts
// (ADR-001: لا وصول لقاعدة البيانات من وحدات المسارات الجديدة).
// نُقلت من server/storage.ts أثناء إعادة هيكلة الخدمة 2026-07-18.
import { and, count, desc, eq, sql } from "drizzle-orm";
import bcrypt from "bcrypt";
import { nanoid } from "nanoid";
import { db } from "../db";
import {
  correspondentApplications,
  roles,
  userRoles,
  users,
  type CorrespondentApplication,
  type CorrespondentApplicationWithDetails,
  type InsertCorrespondentApplication,
  type User,
} from "@shared/schema";

// Only plain reader-type accounts may be auto-upgraded on approval. A
// staff/admin account with the same email must be handled manually — silently
// rewriting its role (and password) would be a privilege change no one
// reviewed.
const UPGRADEABLE_ROLES = ["reader", "user", "subscriber"];

export async function createCorrespondentApplication(
  data: InsertCorrespondentApplication,
): Promise<CorrespondentApplication> {
  // Normalize email so the approval-time lookup (which matches against the
  // lowercased users.email) always finds an existing reader account. Without
  // this, a capitalization/whitespace difference creates a duplicate user row.
  const normalized = { ...data, email: data.email?.toLowerCase().trim() };
  const [application] = await db.insert(correspondentApplications).values(normalized).returning();
  return application;
}

export async function hasPendingCorrespondentApplication(email: string): Promise<boolean> {
  const normalized = email.toLowerCase().trim();
  const [existing] = await db
    .select({ id: correspondentApplications.id })
    .from(correspondentApplications)
    .where(
      and(
        sql`lower(${correspondentApplications.email}) = ${normalized}`,
        eq(correspondentApplications.status, "pending"),
      ),
    )
    .limit(1);
  return !!existing;
}

export async function listCorrespondentApplications(
  status?: string,
  page: number = 1,
  limit: number = 10,
): Promise<{
  applications: CorrespondentApplicationWithDetails[];
  total: number;
  counts: { pending: number; approved: number; rejected: number; total: number };
}> {
  const offset = (page - 1) * limit;
  const whereClause =
    status && status !== "all" ? eq(correspondentApplications.status, status) : undefined;

  const [countResult] = await db
    .select({ count: count() })
    .from(correspondentApplications)
    .where(whereClause);
  const total = countResult?.count || 0;

  // Global per-status counts (unfiltered) so dashboard stat cards reflect the
  // whole dataset, not just the current page.
  const statusRows = await db
    .select({ status: correspondentApplications.status, count: count() })
    .from(correspondentApplications)
    .groupBy(correspondentApplications.status);
  const counts = { pending: 0, approved: 0, rejected: 0, total: 0 };
  for (const row of statusRows) {
    counts.total += row.count;
    if (row.status === "pending") counts.pending = row.count;
    else if (row.status === "approved") counts.approved = row.count;
    else if (row.status === "rejected") counts.rejected = row.count;
  }

  const applications = await db
    .select({
      id: correspondentApplications.id,
      arabicName: correspondentApplications.arabicName,
      englishName: correspondentApplications.englishName,
      email: correspondentApplications.email,
      phone: correspondentApplications.phone,
      jobTitle: correspondentApplications.jobTitle,
      bio: correspondentApplications.bio,
      city: correspondentApplications.city,
      profilePhotoUrl: correspondentApplications.profilePhotoUrl,
      nationalId: correspondentApplications.nationalId,
      region: correspondentApplications.region,
      licenseNumber: correspondentApplications.licenseNumber,
      licenseExpiresAt: correspondentApplications.licenseExpiresAt,
      licenseFileKey: correspondentApplications.licenseFileKey,
      cvFileKey: correspondentApplications.cvFileKey,
      specializations: correspondentApplications.specializations,
      portfolioLinks: correspondentApplications.portfolioLinks,
      yearsOfExperience: correspondentApplications.yearsOfExperience,
      currentEmployer: correspondentApplications.currentEmployer,
      consentAt: correspondentApplications.consentAt,
      status: correspondentApplications.status,
      reviewedBy: correspondentApplications.reviewedBy,
      reviewedAt: correspondentApplications.reviewedAt,
      reviewNotes: correspondentApplications.reviewNotes,
      createdUserId: correspondentApplications.createdUserId,
      createdAt: correspondentApplications.createdAt,
      // Scalar subquery (not a join) so a duplicate users row can never fan
      // out application rows.
      existingUserRole: sql<string | null>`(select u.role from users u where lower(u.email) = lower(${correspondentApplications.email}) limit 1)`,
    })
    .from(correspondentApplications)
    .where(whereClause)
    .orderBy(desc(correspondentApplications.createdAt))
    .limit(limit)
    .offset(offset);

  return { applications, total, counts };
}

export async function getCorrespondentApplicationById(
  id: string,
): Promise<CorrespondentApplicationWithDetails | undefined> {
  const [application] = await db
    .select()
    .from(correspondentApplications)
    .where(eq(correspondentApplications.id, id));
  if (!application) return undefined;

  let reviewer = null;
  if (application.reviewedBy) {
    const [reviewerData] = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, application.reviewedBy));
    reviewer = reviewerData || null;
  }

  const [existingAccount] = await db
    .select({ role: users.role })
    .from(users)
    .where(sql`lower(${users.email}) = ${application.email.toLowerCase().trim()}`)
    .limit(1);

  return { ...application, reviewer, existingUserRole: existingAccount?.role ?? null };
}

async function assignReporterRbacRole(userId: string, reviewerId: string): Promise<void> {
  const [reporterRole] = await db.select().from(roles).where(eq(roles.name, "reporter"));
  if (reporterRole) {
    await db
      .insert(userRoles)
      .values({ userId, roleId: reporterRole.id, assignedBy: reviewerId })
      .onConflictDoNothing();
  }
}

export async function approveCorrespondentApplication(
  id: string,
  reviewerId: string,
  notes?: string,
): Promise<{
  application: CorrespondentApplication;
  user: User;
  temporaryPassword: string;
  existingAccountUpgraded: boolean;
}> {
  const [application] = await db
    .select()
    .from(correspondentApplications)
    .where(eq(correspondentApplications.id, id));
  if (!application) throw new Error("Application not found");
  if (application.status !== "pending") throw new Error("Application already processed");

  // Match case-insensitively: registration/login lowercase the email, so a
  // case/whitespace difference here would otherwise miss the existing reader
  // and create a duplicate user row with the same email.
  const applicantEmail = application.email.toLowerCase().trim();
  const [existingUser] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${applicantEmail}`);

  let finalUser: User;
  const temporaryPassword = nanoid(12);
  const hashedPassword = await bcrypt.hash(temporaryPassword, 12);

  if (existingUser) {
    if (!UPGRADEABLE_ROLES.includes((existingUser.role || "reader").toLowerCase())) {
      throw new Error("Existing staff account");
    }

    // Upgrade the reader account in place: the membership becomes a
    // correspondent account (history preserved, no duplicate user row). A
    // fresh temporary password is issued so the approval email always carries
    // working credentials — reader accounts may be Google-only (no password).
    const [updatedUser] = await db
      .update(users)
      .set({
        role: "reporter",
        jobTitle: application.jobTitle || existingUser.jobTitle,
        bio: application.bio || existingUser.bio,
        city: application.city || existingUser.city,
        profileImageUrl: application.profilePhotoUrl || existingUser.profileImageUrl,
        isProfileComplete: true,
        status: "active",
        passwordHash: hashedPassword,
        mustChangePassword: true,
      })
      .where(eq(users.id, existingUser.id))
      .returning();
    finalUser = updatedUser;
  } else {
    const [newUser] = await db
      .insert(users)
      .values({
        id: nanoid(),
        email: applicantEmail,
        firstName: application.arabicName.split(" ")[0] || application.arabicName,
        lastName: application.arabicName.split(" ").slice(1).join(" ") || "",
        profileImageUrl: application.profilePhotoUrl,
        status: "active",
        passwordHash: hashedPassword,
        emailVerified: true,
        role: "reporter",
        jobTitle: application.jobTitle,
        bio: application.bio,
        isProfileComplete: true,
        mustChangePassword: true,
      })
      .returning();
    finalUser = newUser;
  }

  await assignReporterRbacRole(finalUser.id, reviewerId);

  const [updatedApplication] = await db
    .update(correspondentApplications)
    .set({
      status: "approved",
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      reviewNotes: notes,
      createdUserId: finalUser.id,
    })
    .where(eq(correspondentApplications.id, id))
    .returning();

  return {
    application: updatedApplication,
    user: finalUser,
    temporaryPassword,
    existingAccountUpgraded: !!existingUser,
  };
}

export async function rejectCorrespondentApplication(
  id: string,
  reviewerId: string,
  reason: string,
): Promise<CorrespondentApplication> {
  const [application] = await db
    .update(correspondentApplications)
    .set({
      status: "rejected",
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      reviewNotes: reason,
    })
    .where(eq(correspondentApplications.id, id))
    .returning();

  if (!application) throw new Error("Application not found");
  return application;
}
