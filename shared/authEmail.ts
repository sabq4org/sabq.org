/**
 * قاعدة البريد الاصطناعي لحسابات الدخول بالجوال — مشتركة بين الخادم والواجهات.
 *
 * تاريخيًا كان دخول الجوال ينشئ `p<digits>@phone.sabq.org` لأن عمود email كان
 * إلزاميًا. التسجيل الجديد لم يعد يولّد هذه العناوين، لكن الحسابات القديمة
 * ما تزال تحملها؛ كل عرض أو إرسال بريد يجب أن يعاملها كـ«بريد غير مضاف»،
 * لا كبريد حقيقي ولا موثق.
 */

export const SYNTHETIC_PHONE_EMAIL_DOMAIN = "@phone.sabq.org";

/** بريد اصطناعي لحسابات الدخول بالجوال — ليس بريد المستخدم الحقيقي. */
export function isSyntheticPhoneEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase().endsWith(SYNTHETIC_PHONE_EMAIL_DOMAIN);
}

/** هل يملك المستخدم بريدًا حقيقيًا قابلًا للعرض والمراسلة؟ */
export function hasRealEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.trim()) && !isSyntheticPhoneEmail(email);
}
