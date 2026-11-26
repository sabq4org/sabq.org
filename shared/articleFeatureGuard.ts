/**
 * «خبر مميز» يضبطه من يملك صلاحية تمييز المقالات فقط.
 * زر التمييز في «إدارة الأخبار» محمي بها، أما الإنشاء والحفظ من المحرر فكانا
 * يقبلان isFeatured من أي مستخدم، فتحمل مسودة المراسل «مميز» وتنتقل مع النشر.
 */
export const ARTICLE_FEATURE_PERMISSION = "articles.feature";

export function canFeatureArticles(permissions: readonly string[] | null | undefined): boolean {
  if (!Array.isArray(permissions)) return false;
  return permissions.includes("*") || permissions.includes(ARTICLE_FEATURE_PERMISSION);
}

/** يحذف isFeatured من جسم الطلب لمن لا يملك الصلاحية؛ فتبقى القيمة المخزنة كما هي (أو الافتراضي false عند الإنشاء). */
export function dropUnauthorizedFeature<T extends Record<string, unknown>>(
  body: T,
  permissions: readonly string[] | null | undefined,
): T {
  if (!body || typeof body !== "object" || !("isFeatured" in body)) return body;
  if (canFeatureArticles(permissions)) return body;
  const { isFeatured: _ignored, ...rest } = body;
  return rest as T;
}
