import { SABQ_NEWSPAPER_ACCOUNT_ID } from "./sabqNewspaper";

/** آخر يوم لمهلة تقديم الترخيص المهني (شامل حتى نهاية اليوم بتوقيت الرياض). */
export const MEDIA_LICENSE_DEADLINE = "2026-07-31";

/** بداية التعطيل الفعلي للإرسال بلا ترخيص ساري — منتصف ليل 1 أغسطس بتوقيت الرياض. */
export const MEDIA_LICENSE_ENFORCEMENT_AT = "2026-08-01T00:00:00+03:00";

export const GMEDIA_REGISTER_URL =
  "https://gmedia.gov.sa/services/registering-media-professionals";

export const MEDIA_LICENSE_REQUIRED_MESSAGE =
  "يجب الحصول على ترخيص مهني ساري من هيئة تنظيم الإعلام أو تجديده قبل إرسال خبر أو مقال. سجّل أو جدّد ترخيصك عبر منصة الإعلاميين، ثم أرفقه من لوحة التحكم.";

/** تنبيه لوحة التحكم لمن لم يرفق ترخيصاً مهنياً بعد (المهلة التنظيمية انتهت في 31 يوليو 2026). */
export const MEDIA_LICENSE_DASHBOARD_WARNING =
  "أرفق ترخيصك المهني الساري من هيئة تنظيم الإعلام لتتمكن من إرسال المقالات والأخبار.";

/** ترخيص مرفوع لكن تاريخه انتهى. */
export const MEDIA_LICENSE_EXPIRED_WARNING =
  "انتهى ترخيصك المهني. جدّده عبر منصة الإعلاميين ثم أرفق الترخيص الجديد لتتمكن من الإرسال.";

/** الإدارة طلبت إعادة رفع الملف. */
export const MEDIA_LICENSE_NEEDS_CORRECTION_WARNING =
  "ملف ترخيصك المهني يحتاج تصحيحاً. أعد رفعه لتتمكن من الإرسال.";

/** تنبيه عند رفع الترخيص وبانتظار موافقة مسؤول النظام. */
export const MEDIA_LICENSE_PENDING_REVIEW_WARNING =
  "ترخيصك المهني بانتظار موافقة مسؤول النظام بعد الاطلاع على الملف. لن تتمكن من إنشاء خبر أو مقال حتى تتم الموافقة.";

export const MEDIA_LICENSE_REQUIRED_CODE = "MEDIA_LICENSE_REQUIRED";

/** رسالة واحدة تصف ما يلزم الكاتب/المراسل فعله بحسب حالة ترخيصه (أولوية: مراجعة ← تصحيح ← منتهٍ ← بلا ترخيص). */
export function mediaLicenseActionMessage(state: {
  pendingReview?: boolean;
  needsCorrection?: boolean;
  expired?: boolean;
}): string {
  if (state.pendingReview) return MEDIA_LICENSE_PENDING_REVIEW_WARNING;
  if (state.needsCorrection) return MEDIA_LICENSE_NEEDS_CORRECTION_WARNING;
  if (state.expired) return MEDIA_LICENSE_EXPIRED_WARNING;
  return MEDIA_LICENSE_DASHBOARD_WARNING;
}

export function isMediaLicenseEnforcementActive(now: Date = new Date()): boolean {
  return now.getTime() >= new Date(MEDIA_LICENSE_ENFORCEMENT_AT).getTime();
}

/** حسابات مؤسسية (مثل «صحيفة سبق») لا تخضع لبوابة الترخيص الشخصي. */
export function isInstitutionalMediaByline(userId: string | null | undefined): boolean {
  return Boolean(userId && userId === SABQ_NEWSPAPER_ACCOUNT_ID);
}

/** كاتب/مراسل الظاهر على المحتوى. */
export function resolveContentBylineUserId(input: {
  articleType?: string | null;
  authorId?: string | null;
  reporterId?: string | null;
  opinionAuthorId?: string | null;
}): string | null {
  const type = (input.articleType || "").toLowerCase();
  if (type === "opinion" || type === "column") {
    return input.opinionAuthorId || input.authorId || null;
  }
  return input.reporterId || input.authorId || null;
}
