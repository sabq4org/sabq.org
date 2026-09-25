// روابط الأقسام العامة تستخدم englishSlug (مثل /category/VrlEcMg) في الترويسة
// والـ canonical، بينما مسارات API القديمة كانت تطابق slug فقط فتعيد 404
// للزائر. slug يُفضَّل عند التطابق حتى لا يتغير أي رابط قديم يعمل اليوم.
export function findCategoryBySlugOrEnglishSlug<T extends { slug: string; englishSlug?: string | null }>(
  list: readonly T[],
  value: string,
): T | undefined {
  return list.find((c) => c.slug === value) ?? list.find((c) => !!c.englishSlug && c.englishSlug === value);
}
