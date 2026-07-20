import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/schema";

/** مهلة تقديم الترخيص المهني لأول مرة (نهاية يوليو 2026). */
export const MEDIA_LICENSE_DEADLINE = "2026-07-31";

export const GMEDIA_REGISTER_URL =
  "https://gmedia.gov.sa/services/registering-media-professionals";

/** نافذة التجديد: نحو شهرين قبل انتهاء الترخيص (٦٥ يوماً لتغطية التقويم) */
export const MEDIA_LICENSE_RENEWAL_WARN_MS = 65 * 24 * 60 * 60 * 1000;

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

function resolveLicenseEnd(
  expiresAt: Date | string | null | undefined,
): Date | null {
  if (!expiresAt) return null;
  if (expiresAt instanceof Date) {
    return Number.isNaN(expiresAt.getTime()) ? null : expiresAt;
  }
  return parseMediaLicenseExpiry(expiresAt.slice(0, 10)) ?? (() => {
    const d = new Date(expiresAt);
    return Number.isNaN(d.getTime()) ? null : d;
  })();
}

export function isMediaLicenseExpired(
  expiresAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  const end = resolveLicenseEnd(expiresAt);
  if (!end) return false;
  return end.getTime() < now.getTime();
}

export function isMediaLicenseExpiringSoon(
  expiresAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  const end = resolveLicenseEnd(expiresAt);
  if (!end || end.getTime() < now.getTime()) return false;
  return end.getTime() - now.getTime() <= MEDIA_LICENSE_RENEWAL_WARN_MS;
}

export type MediaLicenseStatus = {
  submitted: boolean;
  /** مرسل وضمن الصلاحية */
  valid: boolean;
  expired: boolean;
  /** ساري لكن يتبقّى شهران أو أقل — يجب التجديد */
  expiringSoon: boolean;
  licenseNumber: string | null;
  submittedAt: string | null;
  expiresAt: string | null;
  deadline: string;
  gmediaRegisterUrl: string;
};

export function toMediaLicenseStatus(row: {
  mediaLicenseNumber: string | null;
  mediaLicenseFileKey: string | null;
  mediaLicenseSubmittedAt: Date | null;
  mediaLicenseExpiresAt: Date | null;
} | undefined): MediaLicenseStatus {
  const submitted = Boolean(
    row?.mediaLicenseNumber && row?.mediaLicenseFileKey && row?.mediaLicenseSubmittedAt,
  );
  const expiresAt = row?.mediaLicenseExpiresAt ?? null;
  const expired = submitted && (!expiresAt || isMediaLicenseExpired(expiresAt));
  const valid = submitted && Boolean(expiresAt) && !isMediaLicenseExpired(expiresAt);
  return {
    submitted,
    valid,
    expired,
    expiringSoon: valid && isMediaLicenseExpiringSoon(expiresAt),
    licenseNumber: submitted ? (row?.mediaLicenseNumber ?? null) : null,
    submittedAt: row?.mediaLicenseSubmittedAt?.toISOString() ?? null,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    deadline: MEDIA_LICENSE_DEADLINE,
    gmediaRegisterUrl: GMEDIA_REGISTER_URL,
  };
}

export async function getMediaLicense(userId: string): Promise<MediaLicenseStatus> {
  const [row] = await db
    .select({
      mediaLicenseNumber: users.mediaLicenseNumber,
      mediaLicenseFileKey: users.mediaLicenseFileKey,
      mediaLicenseSubmittedAt: users.mediaLicenseSubmittedAt,
      mediaLicenseExpiresAt: users.mediaLicenseExpiresAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return toMediaLicenseStatus(row);
}

export async function saveMediaLicense(
  userId: string,
  data: { licenseNumber: string; licenseFileKey: string; expiresAt: Date },
): Promise<MediaLicenseStatus> {
  if (isMediaLicenseExpired(data.expiresAt)) {
    throw new Error("لا يمكن إدخال ترخيص منتهٍ — اختر تاريخ انتهاء لاحق");
  }
  const submittedAt = new Date();
  await db
    .update(users)
    .set({
      mediaLicenseNumber: data.licenseNumber,
      mediaLicenseFileKey: data.licenseFileKey,
      mediaLicenseSubmittedAt: submittedAt,
      mediaLicenseExpiresAt: data.expiresAt,
    })
    .where(eq(users.id, userId));

  return toMediaLicenseStatus({
    mediaLicenseNumber: data.licenseNumber,
    mediaLicenseFileKey: data.licenseFileKey,
    mediaLicenseSubmittedAt: submittedAt,
    mediaLicenseExpiresAt: data.expiresAt,
  });
}

export async function getMediaLicenseFileKey(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ mediaLicenseFileKey: users.mediaLicenseFileKey })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.mediaLicenseFileKey ?? null;
}
