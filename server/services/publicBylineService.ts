// الصفة والسيرة العامة للكاتب والمراسل (جدول staff).
// القارئ يرى تحت الاسم staff.titleAr، وفي صفحة الكاتب staff.bioAr، عبر
// /api/reporters/:slug في الويب وiOS وأندرويد. هذا الملف يربط بها:
// - «النبذة العربية» في «ملفي وخدماتي» بعد اعتماد المحرر للملف.
// - صفحة كاتب عامة لكاتب الرأي عند قبول طلبه (كما للمراسل).
// - تحديث العرض فورًا بعد أي تعديل (كاش الذاكرة في كل النسخ + حافة Cloudflare).
import { eq } from "drizzle-orm";
import { db } from "../db";
import { staff, staffProfiles, type Staff } from "@shared/schema";
import { getUserRoleNames } from "../rbac";
import { invalidateMemoryPatternsAcrossPods } from "./contentInvalidation";
import { purgeContentSurfaces } from "./cloudflarePurge";
import {
  normalizePublicBio,
  pickPublicStaffType,
  reporterProfileCachePatterns,
  type PublicStaffType,
} from "@shared/publicByline";

export type { PublicStaffType };


/** يُظهر تعديل الصفة/السيرة فورًا: كاش كل النسخ + حافة Cloudflare. لا يرمي. */
export async function refreshPublicStaffProfile(userId: string): Promise<void> {
  try {
    const [row] = await db
      .select({ slug: staff.slug })
      .from(staff)
      .where(eq(staff.userId, userId))
      .limit(1);
    invalidateMemoryPatternsAcrossPods(reporterProfileCachePatterns([row?.slug, userId]));
    if (row?.slug) {
      const slug = encodeURIComponent(row.slug);
      void purgeContentSurfaces([`/api/reporters/${slug}`, `/api/en/reporters/${slug}`], { immediate: true });
    }
  } catch (error: unknown) {
    console.error("[PublicByline] refresh failed:", error instanceof Error ? error.message : error);
  }
}

/**
 * يضمن صفحة كاتب عامة (صف في staff). يعيد الصف الموجود كما هو.
 * إنشاء الصف يعيد استخدام منطق المراسل (slug فريد، نسخ النبذة والصورة الحالية)
 * ثم يضبط النوع، فلا يتغير ما يراه القارئ تحت الاسم لحظة الإنشاء.
 */
export async function ensurePublicStaffRecord(
  userId: string,
  staffType: PublicStaffType,
): Promise<{ staff: Staff; created: boolean }> {
  const [existing] = await db.select().from(staff).where(eq(staff.userId, userId)).limit(1);
  if (existing) return { staff: existing, created: false };

  const { storage } = await import("../storage");
  let record = await storage.ensureReporterStaffRecord(userId);
  if (record.staffType !== staffType) {
    const [updated] = await db
      .update(staff)
      .set({ staffType, updatedAt: new Date() })
      .where(eq(staff.id, record.id))
      .returning();
    if (updated) record = updated;
  }
  return { staff: record, created: true };
}

export type SyncApprovedBioResult =
  | { synced: true; slug: string }
  | { synced: false; reason: "empty_bio" | "not_public_role" | "unchanged" };

/**
 * بعد اعتماد ملف المنسوب: «النبذة العربية» المعتمدة تصبح السيرة العامة.
 * لا يمس من ليس كاتبًا أو مراسلًا وليست له صفحة عامة (المحررون والإداريون).
 */
export async function syncApprovedStaffBioToPublicProfile(userId: string): Promise<SyncApprovedBioResult> {
  const [profile] = await db
    .select({ bioAr: staffProfiles.bioAr })
    .from(staffProfiles)
    .where(eq(staffProfiles.userId, userId))
    .limit(1);
  const bioAr = normalizePublicBio(profile?.bioAr);
  if (!bioAr) return { synced: false, reason: "empty_bio" };

  let [record] = await db.select().from(staff).where(eq(staff.userId, userId)).limit(1);
  if (!record) {
    const staffType = pickPublicStaffType(await getUserRoleNames(userId));
    if (!staffType) return { synced: false, reason: "not_public_role" };
    record = (await ensurePublicStaffRecord(userId, staffType)).staff;
  }

  if ((record.bioAr ?? "").trim() === bioAr) return { synced: false, reason: "unchanged" };

  await db.update(staff).set({ bioAr, updatedAt: new Date() }).where(eq(staff.id, record.id));
  await refreshPublicStaffProfile(userId);
  return { synced: true, slug: record.slug };
}
