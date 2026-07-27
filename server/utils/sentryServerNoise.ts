/**
 * فرز أحداث Sentry على الخادم.
 *
 * الخلفية (NODE-EXPRESS-A): كل حدث في تلك المجموعة هو `Error: read ECONNRESET`
 * يصل عبر `sentryErrorMiddleware`، ومكدسه بالكامل داخل express و@sentry بلا
 * إطار واحد من كودنا. معناه أن **العميل** أغلق الاتصال قبل اكتمال الرد
 * (المستخدم غادر الصفحة، أو أوقفت CDN الطلب). هذا حدث شبكة طبيعي في كل موقع،
 * لا خلل في التطبيق: لا يوجد سطر نصلحه ولا مستخدم نحميه.
 *
 * الخطر في الفلترة العمياء: `ECONNRESET` تأتي أيضًا من اتصالاتنا **الصادرة**
 * (Postgres، Redis، واجهات خارجية) — وتلك أعطال حقيقية يجب أن تظهر. لذلك
 * شرطان معًا لا واحد:
 *   1. توقيع قطع من الطرف الآخر على مقبس وارد،
 *   2. وخلوّ المكدس من أي إطار من كودنا (in_app) — فخطأ صادر من خدمة لنا
 *      يحمل دائمًا إطار الخدمة التي أطلقت الطلب.
 */

export interface ClientAbortCandidate {
  code?: string;
  syscall?: string;
  type?: string;
  message?: string;
}

/** توقيع «العميل قطع الاتصال» كما يظهر من node/express/raw-body. */
export function isClientAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const { code, syscall, type, message } = err as ClientAbortCandidate;

  if (code === "ECONNABORTED") return true;
  if (type === "request.aborted") return true;
  if (message === "request aborted") return true;
  if (code === "ECONNRESET" && syscall === "read") return true;
  if (code === "EPIPE" && (syscall === "write" || syscall === undefined)) return true;

  return false;
}

/** الشكل الأدنى من حدث Sentry الذي نحتاجه — يُبقي الوحدة قابلة للاختبار بلا SDK. */
export interface MinimalServerEvent {
  exception?: {
    values?: Array<{
      stacktrace?: { frames?: Array<{ in_app?: boolean }> } | null;
    }>;
  } | null;
}

export function hasFirstPartyFrame(event: MinimalServerEvent): boolean {
  const values = event.exception?.values;
  if (!values?.length) return false;
  return values.some((value) =>
    value.stacktrace?.frames?.some((frame) => frame?.in_app === true),
  );
}

/**
 * القرار: هل نرسل هذا الحدث؟ يُسقط قطعَ العميل فقط، وبشرط ألا يمرّ الخطأ
 * بكودنا. أي خطأ آخر — بما فيه ECONNRESET من مسبح Postgres — يمرّ كما هو.
 */
export function shouldSendServerEvent(
  event: MinimalServerEvent,
  originalException: unknown,
): boolean {
  if (!isClientAbortError(originalException)) return true;
  return hasFirstPartyFrame(event);
}
