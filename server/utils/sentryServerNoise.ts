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
  if (typeof message === "string" && message.toLowerCase() === "request aborted") return true;
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

/**
 * Request fields which must never be copied into an error event.  This is
 * intentionally applied to arbitrary nested event data as well: integrations
 * and route-specific capture code may put the same values in `extra`, tags,
 * or contexts rather than under `request`.
 */
const SENSITIVE_FIELD_NAMES = new Set([
  "auth",
  "authorization",
  "apikey",
  "api-key",
  "xapikey",
  "cookie",
  "cookies",
  "set-cookie",
  "token",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "password",
  "secret",
  "oauthcode",
  "authcode",
  "oauthstate",
  "csrfstate",
  "privatekey",
  "email",
  "phone",
  "phonenumber",
  "username",
  "userid",
  "ip",
  "ipaddress",
]);

function isSensitiveFieldName(name: string): boolean {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return SENSITIVE_FIELD_NAMES.has(name.toLowerCase()) ||
    SENSITIVE_FIELD_NAMES.has(normalized) ||
    normalized.startsWith("password") ||
    normalized.startsWith("secret") ||
    normalized.startsWith("token") ||
    normalized.endsWith("password") ||
    normalized.endsWith("secret") ||
    normalized.endsWith("token");
}

function stripUrlQuery(url: unknown): unknown {
  if (typeof url !== "string") return url;
  const query = url.search(/[?#]/);
  return query === -1 ? url : url.slice(0, query);
}

function cloneWithoutSensitiveFields(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((entry) => cloneWithoutSensitiveFields(entry, seen));
  }

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (
      isSensitiveFieldName(key) ||
      new Set([
        "query",
        "httpquery",
        "querystring",
        "queryparams",
        "body",
        "requestbody",
        "httpbody",
        "formdata",
        "payload",
      ]).has(normalizedKey)
    ) continue;
    if (["url", "requesturl", "httpurl"].includes(normalizedKey) && typeof entry === "string") {
      output[key] = stripUrlQuery(entry);
    } else {
      output[key] = cloneWithoutSensitiveFields(entry, seen);
    }
  }
  return output;
}

/**
 * Return a copy safe for Sentry. Request bodies, cookies, query parameters,
 * and credential-bearing headers are omitted rather than replaced with a
 * placeholder, so the values cannot be serialized by a later SDK processor.
 * The original event is not mutated.
 */
export function sanitizeServerEvent<T>(event: T): T {
  if (!event || typeof event !== "object") return event;

  const sanitized = cloneWithoutSensitiveFields(event, new WeakSet<object>()) as Record<string, unknown>;
  delete sanitized.user;
  const request = (event as { request?: unknown }).request;
  if (request && typeof request === "object" && !Array.isArray(request)) {
    const safeRequest: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(request)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey === "method") {
        safeRequest.method = value;
      } else if (lowerKey === "url") {
        safeRequest[key] = stripUrlQuery(value);
      } else if (lowerKey === "headers" && value && typeof value === "object") {
        const safeHeaders: Record<string, unknown> = {};
        for (const [header, headerValue] of Object.entries(value)) {
          if (["content-type", "user-agent", "accept"].includes(header.toLowerCase())) {
            safeHeaders[header] = headerValue;
          }
        }
        safeRequest[key] = safeHeaders;
      }
    }
    sanitized.request = safeRequest;
  }

  return sanitized as T;
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
