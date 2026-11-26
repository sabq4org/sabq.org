/**
 * «خبر مميز» يغيّره من يملك صلاحية تمييز المقالات فقط.
 * زر التمييز في «إدارة الأخبار» محمي بها، أما الإنشاء والحفظ من المحرر فكانا
 * يقبلان isFeatured من أي مستخدم، فتحمل مسودة المراسل «مميز» وتنتقل مع النشر.
 */
export const ARTICLE_FEATURE_PERMISSION = "articles.feature";
export const ARTICLE_FEATURE_FORBIDDEN_CODE = "FEATURE_FORBIDDEN";

export function canFeatureArticles(permissions: readonly string[] | null | undefined): boolean {
  if (!Array.isArray(permissions)) return false;
  return permissions.includes("*") || permissions.includes(ARTICLE_FEATURE_PERMISSION);
}

export type FeatureFieldResult<T> =
  | { ok: true; body: T }
  | { ok: false; httpStatus: 403; code: typeof ARTICLE_FEATURE_FORBIDDEN_CODE; message: string };

/**
 * لمن لا يملك الصلاحية: إرسال القيمة الحالية نفسها (حفظ عادي لا يغيّر التمييز) يُحذف
 * من الطلب، ومحاولة تغييرها تُرفض بـ403 صريح بدل إسقاطها بصمت (REVIEW.md A4).
 * `current` هي القيمة المخزنة؛ عند الإنشاء false.
 */
export function resolveFeatureField<T extends Record<string, unknown>>(
  body: T,
  permissions: readonly string[] | null | undefined,
  current: boolean | null | undefined,
): FeatureFieldResult<T> {
  if (!body || typeof body !== "object" || !("isFeatured" in body)) return { ok: true, body };
  if (canFeatureArticles(permissions)) return { ok: true, body };
  const { isFeatured, ...rest } = body;
  if (isFeatured === undefined || Boolean(isFeatured) === Boolean(current)) return { ok: true, body: rest as T };
  return {
    ok: false,
    httpStatus: 403,
    code: ARTICLE_FEATURE_FORBIDDEN_CODE,
    message: "لا تملك صلاحية تمييز الخبر",
  };
}
