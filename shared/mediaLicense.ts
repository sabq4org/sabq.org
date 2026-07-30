import { SABQ_NEWSPAPER_ACCOUNT_ID } from "./sabqNewspaper";

/** آخر يوم لمهلة تقديم الترخيص المهني (شامل حتى نهاية اليوم بتوقيت الرياض). */
export const MEDIA_LICENSE_DEADLINE = "2026-07-31";

/** بداية التعطيل الفعلي للإرسال بلا ترخيص ساري — منتصف ليل 1 أغسطس بتوقيت الرياض. */
export const MEDIA_LICENSE_ENFORCEMENT_AT = "2026-08-01T00:00:00+03:00";

export const GMEDIA_REGISTER_URL =
  "https://gmedia.gov.sa/services/registering-media-professionals";

export const MEDIA_LICENSE_REQUIRED_MESSAGE =
  "يجب الحصول على ترخيص مهني ساري من هيئة تنظيم الإعلام أو تجديده قبل إرسال خبر أو مقال. سجّل أو جدّد ترخيصك عبر منصة الإعلاميين، ثم أرفقه من لوحة التحكم.";

/** تنبيه لوحة التحكم لمن بلا ترخيص ساري أو ترخيص يحتاج تحديثاً. */
export const MEDIA_LICENSE_DASHBOARD_WARNING =
  "مهلة استكمال الترخيص المهني تنتهي بنهاية 31 يوليو. ابتداءً من 1 أغسطس لن تتمكنوا من النشر إذا لم يكن لديكم ترخيص ساري أو كان بحاجة لتحديث.";

export const MEDIA_LICENSE_REQUIRED_CODE = "MEDIA_LICENSE_REQUIRED";

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
