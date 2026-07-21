// ----------------------------------------------------------------------------
// ملف المنسوب الموحّد — خدمة البيانات (ADR-001: كل استعلامات Drizzle هنا)
//
// المبادئ المعتمدة من المالك (2026-07-21):
//   • الهوية الوطنية لكل المنسوبين، مشفّرة AES-256-GCM، ولا تُكشف إلا
//     لصلاحية staff_documents.view (admin + دور الموارد البشرية)
//   • الرقم الوظيفي تسلسلي بسيط SBQ-0001
//   • كتّاب الرأي منسوبون كاملون
//   • جسر توافق: حقول البطاقة الصحفية/الترخيص تُزامَن إلى أعمدة users
//     القديمة عند الكتابة كي لا يتعطل إصدار بطاقة Wallet أثناء الانتقال
// ----------------------------------------------------------------------------

import crypto from "crypto";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  staffDepartments,
  staffJobTitles,
  staffProfiles,
  users,
  userRoles,
  roles,
  type StaffProfile,
} from "@shared/schema";

// ────────────────────────────────────────────────────────────────────
// تشفير الهوية الوطنية — AES-256-GCM بمفتاح مشتق من STAFF_PII_SECRET
// (وإلا SESSION_SECRET كاحتياط). الصيغة: v1:<iv>:<tag>:<ciphertext> b64.
// ────────────────────────────────────────────────────────────────────

function piiKey(): Buffer | null {
  const secret = process.env.STAFF_PII_SECRET || process.env.SESSION_SECRET;
  if (!secret) return null;
  return crypto.createHash("sha256").update(`sabq-staff-pii:${secret}`).digest();
}

export function encryptNationalId(plain: string): { encrypted: string; last4: string } {
  const key = piiKey();
  if (!key) {
    throw new Error("STAFF_PII_SECRET غير مضبوط — لا يمكن حفظ الهوية الوطنية");
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encrypted: `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`,
    last4: plain.slice(-4),
  };
}

export function decryptNationalId(encrypted: string): string | null {
  const key = piiKey();
  if (!key) return null;
  try {
    const [version, ivB64, tagB64, ctB64] = encrypted.split(":");
    if (version !== "v1") return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────
// مصفوفة الإلزام — «ملزم للجميع» + إضافات حسب نوع العلاقة.
// تُعرض في الفورم وتُحسب منها نسبة الاكتمال والنواقص.
// ────────────────────────────────────────────────────────────────────

export const EMPLOYMENT_TYPES = [
  { value: "employee", labelAr: "موظف" },
  { value: "collaborator", labelAr: "متعاون" },
  { value: "field_reporter", labelAr: "مراسل ميداني" },
  { value: "opinion_writer", labelAr: "كاتب رأي" },
] as const;

type FieldRule = { key: string; labelAr: string };

const REQUIRED_BASE: FieldRule[] = [
  { key: "firstName", labelAr: "الاسم الأول" },
  { key: "lastName", labelAr: "اسم العائلة" },
  { key: "phoneNumber", labelAr: "رقم الجوال" },
  { key: "nationalId", labelAr: "الهوية الوطنية / الإقامة" },
  { key: "officialPhotoUrl", labelAr: "الصورة الرسمية" },
  { key: "jobTitleId", labelAr: "المسمى الوظيفي" },
  { key: "departmentId", labelAr: "الإدارة" },
  { key: "employmentType", labelAr: "نوع العلاقة" },
  { key: "joinedAt", labelAr: "تاريخ الالتحاق" },
  { key: "emergencyContactName", labelAr: "اسم جهة الطوارئ" },
  { key: "emergencyContactPhone", labelAr: "جوال جهة الطوارئ" },
];

const REQUIRED_BY_TYPE: Record<string, FieldRule[]> = {
  field_reporter: [
    { key: "workRegion", labelAr: "المنطقة / مقر العمل" },
    { key: "mediaLicenseNumber", labelAr: "رقم الترخيص المهني" },
    { key: "mediaLicenseExpiresAt", labelAr: "انتهاء الترخيص المهني" },
  ],
  opinion_writer: [
    { key: "mediaLicenseNumber", labelAr: "رقم الترخيص المهني" },
    { key: "mediaLicenseExpiresAt", labelAr: "انتهاء الترخيص المهني" },
  ],
  employee: [],
  collaborator: [],
};

export function requiredFieldsFor(employmentType: string | null | undefined): FieldRule[] {
  return [...REQUIRED_BASE, ...(REQUIRED_BY_TYPE[employmentType ?? ""] ?? [])];
}

function computeCompletion(
  profile: Partial<StaffProfile>,
  user: { firstName: string | null; lastName: string | null; phoneNumber: string | null },
): { percent: number; missing: FieldRule[] } {
  const rules = requiredFieldsFor(profile.employmentType);
  const has = (key: string): boolean => {
    switch (key) {
      case "firstName": return Boolean(user.firstName?.trim());
      case "lastName": return Boolean(user.lastName?.trim());
      case "phoneNumber": return Boolean(user.phoneNumber?.trim() || profile.officialPhone?.trim());
      case "nationalId": return Boolean(profile.nationalIdEncrypted);
      default: {
        const value = (profile as Record<string, unknown>)[key];
        return value !== null && value !== undefined && String(value).trim() !== "";
      }
    }
  };
  const missing = rules.filter((r) => !has(r.key));
  const percent = Math.round(((rules.length - missing.length) / rules.length) * 100);
  return { percent, missing };
}

// ────────────────────────────────────────────────────────────────────
// القوائم الموحدة — تُبذر افتراضيات عند أول استخدام والإدارة تضيف عليها
// ────────────────────────────────────────────────────────────────────

const DEFAULT_DEPARTMENTS = [
  "الإدارة العليا", "هيئة التحرير", "المراسلون", "الأخبار المحلية", "الرياضة",
  "الاقتصاد", "كتّاب الرأي", "التقنية والتطوير", "التسويق والإعلانات", "الموارد البشرية",
];

const DEFAULT_JOB_TITLES = [
  "رئيس التحرير", "مدير التحرير", "سكرتير التحرير", "محرر", "محرر أول",
  "مراسل صحفي", "مراسل ميداني", "كاتب رأي", "مصور صحفي", "مدير إدارة",
  "أخصائي موارد بشرية", "مطور", "مصمم",
];

async function ensureLookupsSeeded(): Promise<void> {
  const [{ count: deptCount }] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(staffDepartments);
  if (Number(deptCount) === 0) {
    await db.insert(staffDepartments)
      .values(DEFAULT_DEPARTMENTS.map((nameAr, i) => ({ nameAr, sortOrder: i })))
      .onConflictDoNothing();
  }
  const [{ count: titleCount }] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(staffJobTitles);
  if (Number(titleCount) === 0) {
    await db.insert(staffJobTitles)
      .values(DEFAULT_JOB_TITLES.map((nameAr, i) => ({ nameAr, sortOrder: i })))
      .onConflictDoNothing();
  }
}

export async function getLookups() {
  await ensureLookupsSeeded();
  const [departments, jobTitles] = await Promise.all([
    db.select().from(staffDepartments).where(eq(staffDepartments.isActive, true)).orderBy(asc(staffDepartments.sortOrder), asc(staffDepartments.nameAr)),
    db.select().from(staffJobTitles).where(eq(staffJobTitles.isActive, true)).orderBy(asc(staffJobTitles.sortOrder), asc(staffJobTitles.nameAr)),
  ]);
  return {
    departments,
    jobTitles,
    employmentTypes: EMPLOYMENT_TYPES,
    requiredFields: {
      base: REQUIRED_BASE,
      byType: REQUIRED_BY_TYPE,
    },
  };
}

export async function addDepartment(nameAr: string, nameEn?: string) {
  const [row] = await db.insert(staffDepartments).values({ nameAr: nameAr.trim(), nameEn }).onConflictDoNothing().returning();
  return row ?? null;
}

export async function addJobTitle(nameAr: string, nameEn?: string) {
  const [row] = await db.insert(staffJobTitles).values({ nameAr: nameAr.trim(), nameEn }).onConflictDoNothing().returning();
  return row ?? null;
}

// ────────────────────────────────────────────────────────────────────
// الرقم الوظيفي SBQ-0001 — تسلسلي تحت قفل استشاري ضد التوازي
// ────────────────────────────────────────────────────────────────────

async function generateEmployeeNumber(tx: typeof db): Promise<string> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('staff-employee-number'))`);
  const [row] = await tx
    .select({ max: sql<string | null>`MAX(${staffProfiles.employeeNumber})` })
    .from(staffProfiles);
  const current = row?.max ? parseInt(row.max.replace(/\D/g, ""), 10) : 0;
  return `SBQ-${String(current + 1).padStart(4, "0")}`;
}

// ────────────────────────────────────────────────────────────────────
// الأدوار المعتبرة «منسوبين» — للقائمة وللترحيل
// ────────────────────────────────────────────────────────────────────

export const STAFF_ROLE_NAMES = [
  "admin", "system_admin", "superadmin", "system.admin",
  "editor", "content_manager", "reporter", "comments_moderator",
  "opinion_author", "angle_writer", "hr",
];

export async function listStaff(params: {
  q?: string;
  departmentId?: string;
  employmentType?: string;
} = {}) {
  await ensureLookupsSeeded();

  // منسوب = له ملف، أو دوره القديم/RBAC ضمن أدوار المنسوبين
  const rbacStaffUserIds = db
    .select({ id: userRoles.userId })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(inArray(roles.name, STAFF_ROLE_NAMES));

  const conditions = [
    sql`${users.deletedAt} IS NULL`,
    or(
      inArray(users.role, STAFF_ROLE_NAMES),
      sql`${users.id} IN ${rbacStaffUserIds}`,
      sql`${staffProfiles.id} IS NOT NULL`,
    )!,
  ];
  if (params.q?.trim()) {
    const q = `%${params.q.trim()}%`;
    conditions.push(
      or(
        ilike(users.firstName, q),
        ilike(users.lastName, q),
        ilike(users.email, q),
        ilike(staffProfiles.employeeNumber, q),
      )!,
    );
  }
  if (params.departmentId) conditions.push(eq(staffProfiles.departmentId, params.departmentId));
  if (params.employmentType) conditions.push(eq(staffProfiles.employmentType, params.employmentType));

  const rows = await db
    .select({
      userId: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      profileImageUrl: users.profileImageUrl,
      legacyRole: users.role,
      employeeNumber: staffProfiles.employeeNumber,
      employmentType: staffProfiles.employmentType,
      completionPercent: staffProfiles.completionPercent,
      officialPhotoUrl: staffProfiles.officialPhotoUrl,
      departmentName: staffDepartments.nameAr,
      jobTitleName: staffJobTitles.nameAr,
      hasProfile: sql<boolean>`${staffProfiles.id} IS NOT NULL`,
      pressCardValidUntil: staffProfiles.pressCardValidUntil,
      mediaLicenseExpiresAt: staffProfiles.mediaLicenseExpiresAt,
    })
    .from(users)
    .leftJoin(staffProfiles, eq(staffProfiles.userId, users.id))
    .leftJoin(staffDepartments, eq(staffDepartments.id, staffProfiles.departmentId))
    .leftJoin(staffJobTitles, eq(staffJobTitles.id, staffProfiles.jobTitleId))
    .where(and(...conditions))
    .orderBy(desc(sql`${staffProfiles.id} IS NOT NULL`), asc(users.firstName))
    .limit(500);

  return rows;
}

// ────────────────────────────────────────────────────────────────────
// جلب ملف واحد (بلا الهوية الصريحة — last4 فقط)
// ────────────────────────────────────────────────────────────────────

export async function getStaffProfile(userId: string) {
  const [row] = await db
    .select()
    .from(users)
    .leftJoin(staffProfiles, eq(staffProfiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return null;

  const user = row.users;
  const profile = row.staff_profiles;
  const { nationalIdEncrypted: _omit, ...safeProfile } = profile ?? ({} as StaffProfile);

  return {
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      firstNameEn: user.firstNameEn,
      lastNameEn: user.lastNameEn,
      email: user.email,
      phoneNumber: user.phoneNumber,
      profileImageUrl: user.profileImageUrl,
      bio: user.bio,
      role: user.role,
    },
    profile: profile ? { ...safeProfile, hasNationalId: Boolean(profile.nationalIdEncrypted) } : null,
    requiredFields: requiredFieldsFor(profile?.employmentType),
  };
}

/** كشف الهوية الوطنية — لصلاحية staff_documents.view فقط؛ يُسجَّل الطلب. */
export async function revealNationalId(userId: string, actorId: string): Promise<string | null> {
  const [profile] = await db
    .select({ enc: staffProfiles.nationalIdEncrypted })
    .from(staffProfiles)
    .where(eq(staffProfiles.userId, userId))
    .limit(1);
  if (!profile?.enc) return null;
  console.log(`[StaffProfiles][AUDIT] national-id revealed for user=${userId} by actor=${actorId}`);
  return decryptNationalId(profile.enc);
}

// ────────────────────────────────────────────────────────────────────
// إنشاء/تحديث الملف + جسر التوافق مع أعمدة users القديمة
// ────────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────────
// وثائق المنسوب — مفاتيح التخزين الخاص (نفس بنية وثائق المراسلين)
// ────────────────────────────────────────────────────────────────────

export const STAFF_DOC_KINDS = {
  cv: "cvFileKey",
  nationalId: "nationalIdFileKey",
  contract: "contractFileKey",
  license: "mediaLicenseFileKey",
} as const;

export type StaffDocKind = keyof typeof STAFF_DOC_KINDS;

export async function setStaffDocumentKey(userId: string, kind: StaffDocKind, fileKey: string, actorId: string) {
  const column = STAFF_DOC_KINDS[kind];
  return await db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: staffProfiles.id }).from(staffProfiles).where(eq(staffProfiles.userId, userId)).limit(1);
    if (!existing) {
      const employeeNumber = await generateEmployeeNumber(tx as unknown as typeof db);
      await tx.insert(staffProfiles).values({ userId, employeeNumber, [column]: fileKey, updatedBy: actorId });
    } else {
      await tx.update(staffProfiles).set({ [column]: fileKey, updatedBy: actorId, updatedAt: new Date() }).where(eq(staffProfiles.userId, userId));
    }
    return { success: true as const };
  });
}

export async function getStaffDocumentKey(userId: string, kind: StaffDocKind): Promise<string | null> {
  const [row] = await db.select().from(staffProfiles).where(eq(staffProfiles.userId, userId)).limit(1);
  if (!row) return null;
  return (row as Record<string, unknown>)[STAFF_DOC_KINDS[kind]] as string | null;
}

export type StaffProfilePatch = Partial<{
  nationalId: string;
  nationality: string;
  officialBirthDate: string;
  officialPhotoUrl: string;
  jobTitleId: string;
  departmentId: string;
  employmentType: string;
  joinedAt: string;
  managerUserId: string;
  workRegion: string;
  pressIdNumber: string;
  pressCardValidUntil: string;
  mediaLicenseNumber: string;
  mediaLicenseExpiresAt: string;
  officialPhone: string;
  officialEmail: string;
  emergencyContactName: string;
  emergencyContactRelation: string;
  emergencyContactPhone: string;
  bloodType: string;
  bioAr: string;
  bioEn: string;
  specializations: string[];
  socialX: string;
  socialLinkedin: string;
  personalWebsite: string;
  yearsOfExperience: number;
  previousEmployers: string;
  notes: string;
}>;

const DATE_KEYS = new Set(["officialBirthDate", "joinedAt", "pressCardValidUntil", "mediaLicenseExpiresAt"]);

export async function upsertStaffProfile(userId: string, patch: StaffProfilePatch, actorId: string) {
  return await db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return { success: false as const, message: "المستخدم غير موجود" };

    const [existing] = await tx.select().from(staffProfiles).where(eq(staffProfiles.userId, userId)).limit(1);

    const values: Record<string, unknown> = { updatedBy: actorId, updatedAt: new Date() };
    for (const [key, raw] of Object.entries(patch)) {
      if (raw === undefined) continue;
      if (key === "nationalId") {
        const plain = String(raw).trim();
        if (plain) {
          const { encrypted, last4 } = encryptNationalId(plain);
          values.nationalIdEncrypted = encrypted;
          values.nationalIdLast4 = last4;
        }
        continue;
      }
      if (DATE_KEYS.has(key)) {
        values[key] = raw ? new Date(String(raw)) : null;
        continue;
      }
      values[key] = raw === "" ? null : raw;
    }

    let profile: StaffProfile;
    if (existing) {
      const [updated] = await tx
        .update(staffProfiles)
        .set(values)
        .where(eq(staffProfiles.userId, userId))
        .returning();
      profile = updated;
    } else {
      const employeeNumber = await generateEmployeeNumber(tx as unknown as typeof db);
      const [created] = await tx
        .insert(staffProfiles)
        .values({ userId, employeeNumber, ...values })
        .returning();
      profile = created;
    }

    // نسبة الاكتمال والنواقص
    const { percent, missing } = computeCompletion(profile, user);
    const [finalProfile] = await tx
      .update(staffProfiles)
      .set({ completionPercent: percent, missingFields: missing.map((m) => m.key) })
      .where(eq(staffProfiles.userId, userId))
      .returning();

    // جسر التوافق: بطاقة Wallet الصحفية تقرأ من users حتى اكتمال الهجرة
    const legacySync: Record<string, unknown> = {};
    if (patch.pressIdNumber !== undefined) {
      legacySync.pressIdNumber = patch.pressIdNumber || null;
      legacySync.hasPressCard = Boolean(patch.pressIdNumber);
    }
    if (patch.pressCardValidUntil !== undefined) {
      legacySync.cardValidUntil = patch.pressCardValidUntil ? new Date(patch.pressCardValidUntil) : null;
    }
    if (patch.mediaLicenseNumber !== undefined) legacySync.mediaLicenseNumber = patch.mediaLicenseNumber || null;
    if (patch.mediaLicenseExpiresAt !== undefined) {
      legacySync.mediaLicenseExpiresAt = patch.mediaLicenseExpiresAt ? new Date(patch.mediaLicenseExpiresAt) : null;
    }
    if (patch.jobTitleId !== undefined && patch.jobTitleId) {
      const [title] = await tx.select().from(staffJobTitles).where(eq(staffJobTitles.id, patch.jobTitleId)).limit(1);
      if (title) legacySync.jobTitle = title.nameAr;
    }
    if (patch.departmentId !== undefined && patch.departmentId) {
      const [dept] = await tx.select().from(staffDepartments).where(eq(staffDepartments.id, patch.departmentId)).limit(1);
      if (dept) legacySync.department = dept.nameAr;
    }
    if (Object.keys(legacySync).length > 0) {
      await tx.update(users).set(legacySync).where(eq(users.id, userId));
    }

    return {
      success: true as const,
      profile: { ...finalProfile, nationalIdEncrypted: undefined, hasNationalId: Boolean(finalProfile.nationalIdEncrypted) },
      completionPercent: percent,
      missingFields: missing,
    };
  });
}
