// إزالة الغلاف عن أخطاء PostgreSQL.
//
// المشكلة: Drizzle ORM (مع @neondatabase/serverless) يلفّ أخطاء PG داخل
// `DrizzleQueryError`، فتصبح خصائص الخطأ الأصلية (code/constraint/detail)
// على `error.cause` بدلاً من `error` نفسه. النتيجة أن الفحص المباشر
//   if (error.code === '23505')
// يفشل دائماً ويعود السلوك كأنه خطأ 500 عام.
//
// هذا الـ helper هو الطريقة الموحّدة لفك الخطأ عبر كل الـ routes.
// انظر: server/utils/safeError.ts لنمط مشابه لتغليف رسائل الخطأ الآمنة.
//
// الاستخدام:
//   const pg = extractPgError(error);
//   if (pg.code === '23505' && pg.constraint === 'users_email_unique') { ... }

export interface PgErrorInfo {
  /** true إذا كان الخطأ (أو سببه العميق) خطأ PostgreSQL. */
  isPgError: boolean;
  /** رمز خطأ PG (مثل '23505' لـ unique violation، '23503' لـ FK). */
  code?: string;
  /** اسم الـ constraint الذي انتهك (مثل 'users_email_unique'). */
  constraint?: string;
  /** تفاصيل PG الخام (قد تحتوي قيماً حسّاسة — لا تُمرّرها للعميل). */
  detail?: string;
  /** اسم الجدول المرتبط بالخطأ إن وُجد. */
  table?: string;
  /** رسالة الخطأ الأصلية (تُستخدم للتسجيل فقط). */
  message: string;
}

/**
 * يفحص سلسلة `cause` (حتى عمق 3) باحثاً عن خصائص خطأ PostgreSQL.
 * يعالج:
 *  - الأخطاء العارية من node-postgres (`error.code === '23505'` مباشرة)
 *  - `DrizzleQueryError` (الـ code على `error.cause`)
 *  - التغليف المتداخل (cause.cause) في بعض إصدارات drizzle/neon
 */
export function extractPgError(error: unknown): PgErrorInfo {
  const base: PgErrorInfo = {
    isPgError: false,
    message: error instanceof Error ? error.message : String(error),
  };

  // ابحث في السلسلة: error → cause → cause.cause → ...
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth++) {
    const node = current as Record<string, any> | null;
    if (!node || typeof node !== 'object') break;

    const code = node.code;
    // أخطاء PG دائماً تحمل رمزاً من 5 أحرف مكوناً من أرقام (مثل '23505').
    if (typeof code === 'string' && /^[0-9]{5}$/.test(code)) {
      return {
        isPgError: true,
        code,
        constraint: typeof node.constraint === 'string' ? node.constraint : undefined,
        detail: typeof node.detail === 'string' ? node.detail : undefined,
        table: typeof node.table === 'string' ? node.table : undefined,
        message: typeof node.message === 'string' ? node.message : base.message,
      };
    }

    // انزل للسبب التالي إن وُجد (Error.cause أو خاصية cause مباشرة).
    const next = (node as Error).cause ?? node.cause;
    if (next === current) break;
    current = next;
  }

  return base;
}

/** اختصار شائع: هل هذا خطأ انتهاك قيد فريد (unique violation)؟ */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const pg = extractPgError(error);
  if (pg.code !== '23505') return false;
  if (constraint) return pg.constraint === constraint;
  return true;
}
