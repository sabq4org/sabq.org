import { SABQ_NEWSPAPER_ACCOUNT_ID } from "./sabqNewspaper";

/** مهلة تقديم الترخيص المهني — من هذا اليوم يُعطَّل الإرسال بلا ترخيص ساري. */
export const MEDIA_LICENSE_DEADLINE = "2026-07-31";

/** بداية يوم المهلة بتوقيت الرياض (شامل). */
export const MEDIA_LICENSE_ENFORCEMENT_AT = "2026-07-31T00:00:00+03:00";

export const GMEDIA_REGISTER_URL =
  "https://gmedia.gov.sa/services/registering-media-professionals";

export const MEDIA_LICENSE_REQUIRED_MESSAGE =
  "يجب الحصول على ترخيص مهني ساري من هيئة تنظيم الإعلام أو تجديده قبل إرسال خبر أو مقال. سجّل أو جدّد ترخيصك عبر منصة الإعلاميين، ثم أرفقه من لوحة التحكم.";

/** تنبيه لوحة التحكم قبل/حول مهلة ٣١ يوليو لمن بلا ترخيص ساري أو بترخيص منتهٍ. */
export const MEDIA_LICENSE_DASHBOARD_WARNING =
  "ليس لديك ترخيص مهني ساري (أو ترخيصك منتهٍ). لن تتمكن من المشاركة وإرسال الأخبار أو المقالات بعد تاريخ 31 يوليو 2026. احصل على الترخيص أو جدّده وأرفقه من هنا.";

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
