/**
 * متى يُقبل رمز SMS عاملًا ثانيًا أثناء الدخول (pending2FAUserId)؟
 * - الحساب المضبوط على تطبيق المصادقة وحده لا يُستبدل عامله برسالة SMS.
 * - إذا كان العامل الأول هو رمز الجوال نفسه، فـSMS ثانية إلى الرقم ذاته
 *   ليست عاملًا ثانيًا؛ يلزم TOTP أو رمز احتياط.
 */
export type FirstFactor = "password" | "phone" | "oauth";

export function smsSecondFactorAllowed(
  twoFactorMethod: string | null | undefined,
  firstFactor: FirstFactor | string | null | undefined,
): boolean {
  if (firstFactor === "phone") return false;
  return twoFactorMethod === "sms" || twoFactorMethod === "both";
}
