/**
 * إشارة «المحتوى رُسم» — تحرر طبقة الإعلانات المؤجلة في index.html.
 *
 * الصفحات عالية الزيارات (الرئيسية/القسم/المقال) تستدعيها عند جاهزية
 * بياناتها الرئيسية؛ double-rAF يضمن أن المتصفح رسم ذلك المحتوى فعليًا
 * قبل إطلاق الحدث، فلا تزاحم سكربتات الإعلانات (~1.16MB) نافذة الـLCP
 * على الجوال. بقية المسارات يغطيها المؤقت الاحتياطي في index.html.
 */
let fired = false;

export function signalContentPainted(): void {
  if (fired || typeof window === "undefined") return;
  fired = true;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event("sabq:content-painted"));
    });
  });
}
