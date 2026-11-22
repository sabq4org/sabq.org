/**
 * المنطقة الزمنية لعرض الأوقات في الويب.
 *
 * التخزين يبقى بالتوقيت العالمي كما هو؛ العرض بتوقيت جهاز المستخدم في موقع
 * القراء ولوحة التحكم معًا (قارئ أو محرر في القاهرة يرى وقت القاهرة).
 * عند تعذر معرفة منطقة الجهاز نعود للرياض.
 *
 * يبقى بتوقيت الرياض عمدًا ما يمثّل قاعدة أو تاريخًا تقويميًا لا لحظة:
 * ورديات المناوبة، فتحات النشرة الصوتية، مواعيد كتّاب الرأي الأسبوعية،
 * تواريخ الباقات والتراخيص، صفحات الرياضة، وسطر «تحديث» المحفوظ في نص الخبر.
 *
 * التحويل يتم في المتصفح وقت العرض، فلا يدخل في HTML المخزن على الحافة.
 */

export const RIYADH_TIME_ZONE = "Asia/Riyadh";

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** منطقة جهاز المستخدم، والرياض عند تعذر معرفتها. */
export function displayTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && isValidTimeZone(tz)) return tz;
  } catch {
    // نعود للرياض
  }
  return RIYADH_TIME_ZONE;
}
