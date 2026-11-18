// تسجيل الناشرين من الرابط العام: قواعد التحقق المشتركة بين النموذج والخادم.
import { z } from "zod";

export const PUBLISHER_LOGO_MAX_BYTES = 10 * 1024 * 1024;
export const PUBLISHER_LOGO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const PUBLISHER_LOGO_ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), trimmed(max).optional());

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "البريد الإلكتروني غير صحيح");

export const publisherApplicationSchema = z.object({
  agencyName: trimmed(160).min(2, "اسم الوكالة بالعربية مطلوب"),
  agencyNameEn: optionalText(160),
  contactPerson: trimmed(120).min(2, "اسم الشخص المسؤول مطلوب"),
  contactPersonEn: optionalText(120),
  email,
  phoneNumber: trimmed(30).regex(/^\+?[0-9\s\-()]{8,20}$/, "رقم الجوال غير صحيح"),
  commercialRegistration: optionalText(40),
  taxNumber: optionalText(40),
  address: optionalText(500),
  loginFirstName: trimmed(60).min(1, "الاسم الأول مطلوب"),
  loginLastName: trimmed(60).min(1, "اسم العائلة مطلوب"),
  loginEmail: email,
  consent: z.preprocess((v) => v === true || v === "true", z.literal(true, { message: "يجب الإقرار بصحة البيانات والموافقة على معالجتها" })),
});

export type PublisherApplicationInput = z.infer<typeof publisherApplicationSchema>;

/** فحص الشعار قبل الرفع (النوع والحجم) — يُستخدم في المتصفح والخادم. */
export function publisherLogoProblem(file: { type: string; size: number } | null | undefined): string | null {
  if (!file) return "شعار الوكالة مطلوب";
  if (!(PUBLISHER_LOGO_TYPES as readonly string[]).includes(file.type)) {
    return "الشعار يجب أن يكون صورة JPG أو PNG أو WebP";
  }
  if (file.size > PUBLISHER_LOGO_MAX_BYTES) {
    return `الملف أكبر من 10 ميجا (${(file.size / 1024 / 1024).toFixed(1)} ميجا). صغّر حجمه أو اختر ملفًا آخر.`;
  }
  if (file.size === 0) return "ملف الشعار فارغ";
  return null;
}

export const approvePublisherApplicationSchema = z.object({
  publishingEndsAt: z
    .preprocess((v) => (v === "" || v === null ? undefined : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  autoPublish: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
  notes: optionalText(2000),
});

export type ApprovePublisherApplicationInput = z.infer<typeof approvePublisherApplicationSchema>;

/** رقم قصير يُعرض للمتقدم: PUB-XXXX من بداية المعرف. */
export function publisherApplicationRef(id: string): string {
  return `PUB-${id.replace(/-/g, "").slice(0, 4).toUpperCase()}`;
}
