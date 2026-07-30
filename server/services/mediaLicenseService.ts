import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/schema";
import {
  GMEDIA_REGISTER_URL,
  MEDIA_LICENSE_DEADLINE,
  MEDIA_LICENSE_REQUIRED_CODE,
  MEDIA_LICENSE_REQUIRED_MESSAGE,
  isInstitutionalMediaByline,
  isMediaLicenseEnforcementActive,
  resolveContentBylineUserId,
} from "@shared/mediaLicense";

export {
  GMEDIA_REGISTER_URL,
  MEDIA_LICENSE_DEADLINE,
  MEDIA_LICENSE_REQUIRED_CODE,
  MEDIA_LICENSE_REQUIRED_MESSAGE,
  isInstitutionalMediaByline,
  isMediaLicenseEnforcementActive,
  resolveContentBylineUserId,
};

/** نافذة التجديد: نحو شهرين قبل انتهاء الترخيص (٦٥ يوماً لتغطية التقويم) */
export const MEDIA_LICENSE_RENEWAL_WARN_MS = 65 * 24 * 60 * 60 * 1000;

/** approved = مرخّص | needs_correction = يحتاج تصحيحاً | pending_review = تحت المراجعة */
export type MediaLicenseReviewStatus =
  | "approved"
  | "needs_correction"
  | "pending_review";

export const MEDIA_LICENSE_REVIEW_STATUSES = [
  "approved",
  "needs_correction",
  "pending_review",
] as const;

/** يفسّر تاريخ انتهاء بصيغة YYYY-MM-DD كنهاية يوم الرياض. */
export function parseMediaLicenseExpiry(raw: string): Date | null {
  const s = String(raw || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T23:59:59+03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** رسالة رفض عند محاولة حفظ ترخيص تاريخ انتهائه ماضٍ أو غير صالح. */
export function mediaLicenseExpiryRejection(
  raw: string,
  now: Date = new Date(),
): { expiresAt: Date } | { error: string } {
  const expiresAt = parseMediaLicenseExpiry(raw);
  if (!expiresAt) {
    return { error: "تاريخ انتهاء الترخيص مطلوب (يوم/شهر/سنة)" };
  }
  if (isMediaLicenseExpired(expiresAt, now)) {
    return { error: "لا يمكن إدخال ترخيص منتهٍ — اختر تاريخ انتهاء لاحق" };
  }
  return { expiresAt };
}

/**
 * يحوّل قيمة انتهاء الترخيص إلى Date صالح، أو null إن كانت ناقصة/فاسدة.
 * التواريخ بنصف ليلة UTC (شائع من عمود date) تُفسَّر كنهاية يوم الرياض لذلك التقويم.
 */
export function resolveMediaLicenseEnd(
  expiresAt: Date | string | null | undefined,
): Date | null {
  if (!expiresAt) return null;

  if (expiresAt instanceof Date) {
    if (Number.isNaN(expiresAt.getTime())) return null;
    return normalizeLicenseEndOfDay(expiresAt);
  }

  const trimmed = String(expiresAt).trim();
  if (!trimmed) return null;

  const fromYmd = parseMediaLicenseExpiry(trimmed.slice(0, 10));
  if (fromYmd) return fromYmd;

  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return normalizeLicenseEndOfDay(d);
}

/** منتصف ليل UTC → نهاية نفس اليوم التقويمي في الرياض (حتى لا يُحسب منتهياً صباحاً). */
function normalizeLicenseEndOfDay(d: Date): Date {
  const utcH = d.getUTCHours();
  const utcM = d.getUTCMinutes();
  const utcS = d.getUTCSeconds();
  const utcMs = d.getUTCMilliseconds();
  if (utcH === 0 && utcM === 0 && utcS === 0 && utcMs === 0) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return new Date(`${y}-${m}-${day}T23:59:59+03:00`);
  }
  return d;
}

/** ناقص أو فاسد = منتهٍ — لا يُعامل كساري. */
export function isMediaLicenseExpired(
  expiresAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  const end = resolveMediaLicenseEnd(expiresAt);
  if (!end) return true;
  return end.getTime() < now.getTime();
}

export function isMediaLicenseExpiringSoon(
  expiresAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  const end = resolveMediaLicenseEnd(expiresAt);
  if (!end || end.getTime() < now.getTime()) return false;
  return end.getTime() - now.getTime() <= MEDIA_LICENSE_RENEWAL_WARN_MS;
}

/** أعلام الترخيص للقوائم (كتّاب / مراسلون) بعد التحقق من تاريخ صالح. */
export function mediaLicenseFlags(
  submitted: boolean,
  expiresAt: Date | string | null | undefined,
  now: Date = new Date(),
): {
  hasLicense: boolean;
  expired: boolean;
  expiringSoon: boolean;
  expiresAtIso: string | null;
} {
  const end = resolveMediaLicenseEnd(expiresAt);
  const expired = submitted && (!end || end.getTime() < now.getTime());
  const hasLicense = Boolean(submitted && end && end.getTime() >= now.getTime());
  return {
    hasLicense,
    expired,
    expiringSoon: hasLicense && isMediaLicenseExpiringSoon(end, now),
    expiresAtIso: end ? end.toISOString() : null,
  };
}

function parseReviewStatus(
  raw: string | null | undefined,
): MediaLicenseReviewStatus | null {
  if (
    raw === "approved" ||
    raw === "needs_correction" ||
    raw === "pending_review"
  ) {
    return raw;
  }
  return null;
}

/**
 * مصدر الحقيقة لحالة المراجعة.
 * تراث: بلا عمود status لكن بطلب تصحيح → needs_correction؛ بلا طلب وملف موجود → approved.
 */
export function resolveMediaLicenseReviewStatus(row: {
  mediaLicenseNumber?: string | null;
  mediaLicenseFileKey?: string | null;
  mediaLicenseSubmittedAt?: Date | null;
  mediaLicenseReviewStatus?: string | null;
  mediaLicenseCorrectionRequestedAt?: Date | null;
} | undefined): MediaLicenseReviewStatus | null {
  const explicit = parseReviewStatus(row?.mediaLicenseReviewStatus);
  if (explicit) return explicit;

  if (row?.mediaLicenseCorrectionRequestedAt) return "needs_correction";

  const submitted = Boolean(
    row?.mediaLicenseNumber && row?.mediaLicenseFileKey && row?.mediaLicenseSubmittedAt,
  );
  return submitted ? "approved" : null;
}

export type MediaLicenseStatus = {
  submitted: boolean;
  /** مرسل وضمن الصلاحية ومعتمد من الإدارة */
  valid: boolean;
  expired: boolean;
  /** ساري لكن يتبقّى شهران أو أقل — يجب التجديد */
  expiringSoon: boolean;
  /** الإدارة طلبت إعادة رفع الملف */
  needsCorrection: boolean;
  /** أعاد الرفع وينتظر موافقة الإدارة */
  pendingReview: boolean;
  reviewStatus: MediaLicenseReviewStatus | null;
  /** نص ملاحظة الإدارة — يظهر عند التصحيح (وأحياناً تحت المراجعة كسياق) */
  adminNote: string | null;
  licenseNumber: string | null;
  submittedAt: string | null;
  expiresAt: string | null;
  deadline: string;
  gmediaRegisterUrl: string;
  enforcementActive: boolean;
  submissionBlocked: boolean;
};

type LicenseRow = {
  mediaLicenseNumber: string | null;
  mediaLicenseFileKey: string | null;
  mediaLicenseSubmittedAt: Date | null;
  mediaLicenseExpiresAt: Date | null;
  mediaLicenseAdminNote?: string | null;
  mediaLicenseCorrectionRequestedAt?: Date | null;
  mediaLicenseReviewStatus?: string | null;
};

export function toMediaLicenseStatus(row: LicenseRow | undefined): MediaLicenseStatus {
  const submitted = Boolean(
    row?.mediaLicenseNumber && row?.mediaLicenseFileKey && row?.mediaLicenseSubmittedAt,
  );
  const reviewStatus = resolveMediaLicenseReviewStatus(row);
  const needsCorrection = reviewStatus === "needs_correction";
  const pendingReview = reviewStatus === "pending_review";
  const flags = mediaLicenseFlags(submitted, row?.mediaLicenseExpiresAt ?? null);
  const submittedAt = row?.mediaLicenseSubmittedAt;
  let submittedAtIso: string | null = null;
  if (submittedAt && !Number.isNaN(submittedAt.getTime())) {
    submittedAtIso = submittedAt.toISOString();
  }
  const enforcementActive = isMediaLicenseEnforcementActive();
  const approved = reviewStatus === "approved";
  const valid = flags.hasLicense && approved;
  const note =
    needsCorrection || pendingReview
      ? row?.mediaLicenseAdminNote?.trim() || null
      : null;
  return {
    submitted,
    valid,
    expired: flags.expired,
    expiringSoon: flags.expiringSoon && approved,
    needsCorrection,
    pendingReview,
    reviewStatus,
    adminNote: note,
    licenseNumber: submitted ? (row?.mediaLicenseNumber ?? null) : null,
    submittedAt: submittedAtIso,
    expiresAt: flags.expiresAtIso,
    deadline: MEDIA_LICENSE_DEADLINE,
    gmediaRegisterUrl: GMEDIA_REGISTER_URL,
    enforcementActive,
    submissionBlocked: enforcementActive && !valid,
  };
}

export type MediaLicenseGateResult =
  | { ok: true }
  | { ok: false; message: string; code: typeof MEDIA_LICENSE_REQUIRED_CODE };

/**
 * من ١ أغسطس: يمنع الإرسال/النشر إن كان صاحب الاسم بلا ترخيص ساري.
 * قبل المهلة دائماً ok.
 */
export async function assertMediaLicenseAllowsSubmission(
  bylineUserId: string | null | undefined,
  now: Date = new Date(),
): Promise<MediaLicenseGateResult> {
  if (!isMediaLicenseEnforcementActive(now)) return { ok: true };
  if (!bylineUserId || isInstitutionalMediaByline(bylineUserId)) return { ok: true };

  const status = await getMediaLicense(bylineUserId);
  if (status.valid) return { ok: true };

  return {
    ok: false,
    message: MEDIA_LICENSE_REQUIRED_MESSAGE,
    code: MEDIA_LICENSE_REQUIRED_CODE,
  };
}

async function selectLicenseRow(userId: string): Promise<LicenseRow | undefined> {
  const [row] = await db
    .select({
      mediaLicenseNumber: users.mediaLicenseNumber,
      mediaLicenseFileKey: users.mediaLicenseFileKey,
      mediaLicenseSubmittedAt: users.mediaLicenseSubmittedAt,
      mediaLicenseExpiresAt: users.mediaLicenseExpiresAt,
      mediaLicenseAdminNote: users.mediaLicenseAdminNote,
      mediaLicenseCorrectionRequestedAt: users.mediaLicenseCorrectionRequestedAt,
      mediaLicenseReviewStatus: users.mediaLicenseReviewStatus,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row;
}

export async function getMediaLicense(userId: string): Promise<MediaLicenseStatus> {
  return toMediaLicenseStatus(await selectLicenseRow(userId));
}

export async function saveMediaLicense(
  userId: string,
  data: { licenseNumber: string; licenseFileKey: string; expiresAt: Date },
): Promise<MediaLicenseStatus> {
  if (isMediaLicenseExpired(data.expiresAt)) {
    throw new Error("لا يمكن إدخال ترخيص منتهٍ — اختر تاريخ انتهاء لاحق");
  }

  const existing = await selectLicenseRow(userId);
  const previousStatus = resolveMediaLicenseReviewStatus(existing);
  /** بعد طلب تصحيح أو أثناء انتظار المراجعة: الرفع الجديد يدخل «تحت المراجعة» */
  const goesToPendingReview =
    previousStatus === "needs_correction" || previousStatus === "pending_review";
  const nextStatus: MediaLicenseReviewStatus = goesToPendingReview
    ? "pending_review"
    : "approved";

  const submittedAt = new Date();
  await db
    .update(users)
    .set({
      mediaLicenseNumber: data.licenseNumber,
      mediaLicenseFileKey: data.licenseFileKey,
      mediaLicenseSubmittedAt: submittedAt,
      mediaLicenseExpiresAt: data.expiresAt,
      mediaLicenseReviewStatus: nextStatus,
      // إبقاء الملاحظة كسياق أثناء المراجعة؛ تُمسَح عند الموافقة
      mediaLicenseAdminNote: goesToPendingReview
        ? existing?.mediaLicenseAdminNote ?? null
        : null,
      mediaLicenseCorrectionRequestedAt: null,
      mediaLicenseCorrectionRequestedBy: null,
    })
    .where(eq(users.id, userId));

  return toMediaLicenseStatus({
    mediaLicenseNumber: data.licenseNumber,
    mediaLicenseFileKey: data.licenseFileKey,
    mediaLicenseSubmittedAt: submittedAt,
    mediaLicenseExpiresAt: data.expiresAt,
    mediaLicenseAdminNote: goesToPendingReview
      ? existing?.mediaLicenseAdminNote ?? null
      : null,
    mediaLicenseCorrectionRequestedAt: null,
    mediaLicenseReviewStatus: nextStatus,
  });
}

/** يطلب من الكاتب/المراسل إعادة رفع ملف الترخيص مع ملاحظة واضحة. */
export async function requestMediaLicenseCorrection(
  userId: string,
  adminUserId: string,
  note: string,
): Promise<MediaLicenseStatus> {
  const trimmed = String(note || "").trim();
  if (trimmed.length < 5) {
    throw new Error("اكتب ملاحظة واضحة (٥ أحرف على الأقل) توضّح المطلوب");
  }
  if (trimmed.length > 1000) {
    throw new Error("الملاحظة طويلة جداً (الحد ١٠٠٠ حرف)");
  }

  const existing = await selectLicenseRow(userId);
  if (!existing?.mediaLicenseFileKey || !existing?.mediaLicenseSubmittedAt) {
    throw new Error("لا يوجد ملف ترخيص مرفوع لطلب تصحيحه");
  }

  const requestedAt = new Date();
  await db
    .update(users)
    .set({
      mediaLicenseAdminNote: trimmed,
      mediaLicenseCorrectionRequestedAt: requestedAt,
      mediaLicenseCorrectionRequestedBy: adminUserId,
      mediaLicenseReviewStatus: "needs_correction",
    })
    .where(eq(users.id, userId));

  return getMediaLicense(userId);
}

/** موافقة الإدارة على الملف المرفوع — يصبح مرخّصاً. */
export async function approveMediaLicense(
  userId: string,
  _adminUserId: string,
): Promise<MediaLicenseStatus> {
  const existing = await selectLicenseRow(userId);
  if (!existing?.mediaLicenseFileKey || !existing?.mediaLicenseSubmittedAt) {
    throw new Error("لا يوجد ملف ترخيص للموافقة عليه");
  }
  const status = resolveMediaLicenseReviewStatus(existing);
  if (status === "approved") {
    return toMediaLicenseStatus(existing);
  }
  if (status !== "pending_review") {
    throw new Error("لا يوجد طلب بانتظار المراجعة — انتظر إعادة رفع الملف أولاً");
  }

  await db
    .update(users)
    .set({
      mediaLicenseReviewStatus: "approved",
      mediaLicenseAdminNote: null,
      mediaLicenseCorrectionRequestedAt: null,
      mediaLicenseCorrectionRequestedBy: null,
    })
    .where(eq(users.id, userId));

  return getMediaLicense(userId);
}

/** رفض الملف بعد الاطلاع — يعيد الحالة إلى «يحتاج تصحيحاً» مع ملاحظة. */
export async function rejectMediaLicense(
  userId: string,
  adminUserId: string,
  note: string,
): Promise<MediaLicenseStatus> {
  return requestMediaLicenseCorrection(userId, adminUserId, note);
}

export async function getMediaLicenseFileKey(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ mediaLicenseFileKey: users.mediaLicenseFileKey })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.mediaLicenseFileKey ?? null;
}
