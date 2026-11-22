/**
 * المنطقة الزمنية لعرض الأوقات في الويب.
 *
 * التخزين يبقى بالتوقيت العالمي كما هو؛ هذا الملف يقرر فقط بأي منطقة تُعرض
 * الأوقات:
 *  - صفحات القراء: بتوقيت جهاز القارئ (قارئ في القاهرة يرى وقت القاهرة).
 *  - صفحات العمل (لوحة التحكم): تبقى بتوقيت الرياض، لأن حقول الجدولة
 *    والاجتماعات والمناوبات تُدخل بتوقيت الرياض والمحررون معتادون عليه.
 *
 * التحويل يتم في المتصفح وقت العرض، فلا يدخل في HTML المخزن على الحافة.
 */

export const RIYADH_TIME_ZONE = "Asia/Riyadh";

/** بادئات مسارات العمل التي تبقى أوقاتها بتوقيت الرياض. */
const STAFF_PATH_PREFIXES = ["/dashboard", "/admin", "/en/dashboard", "/ur/dashboard"];

export function isStaffPath(pathname: string): boolean {
  return STAFF_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** منطقة جهاز القارئ، والرياض عند تعذر معرفتها (مثل بيئة الخادم). */
export function readerTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && isValidTimeZone(tz)) return tz;
  } catch {
    // نعود للرياض
  }
  return RIYADH_TIME_ZONE;
}

/**
 * المنطقة التي تُعرض بها الأوقات في الصفحة الحالية.
 * يُقرأ المسار عند كل استدعاء لأن التطبيق صفحة واحدة يتنقل بلا إعادة تحميل.
 */
export function displayTimeZone(pathname?: string): string {
  const path =
    pathname ?? (typeof window !== "undefined" ? window.location.pathname : "");
  if (!path || isStaffPath(path)) return RIYADH_TIME_ZONE;
  return readerTimeZone();
}
