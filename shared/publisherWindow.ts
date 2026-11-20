/**
 * نافذة نشر الوكالة تتبع باقتها (2026-11-20): نهاية النافذة الفعلية = أبعد تاريخ
 * انتهاء بين باقاتها السارية (المفعّلة وغير المنتهية، ومنها باقة تجديد لم تبدأ بعد).
 * لا يُرجع إلى `publishers.publishing_ends_at` المخزّن إلا حين لا توجد باقة سارية
 * بتاريخ انتهاء، فلا تتعارض النافذة مع الباقة كما كان (باقة حتى 2027 ونافذة حتى 2026).
 */
export interface WindowPackage {
  isActive: boolean | null;
  expiryDate: Date | string | null;
}

export function effectivePublishingEndsAt(
  stored: Date | string | null | undefined,
  packages: readonly WindowPackage[],
  now: Date = new Date(),
): Date | null {
  let latest: Date | null = null;
  for (const pkg of packages) {
    if (!pkg.isActive || !pkg.expiryDate) continue;
    const expiry = new Date(pkg.expiryDate);
    if (Number.isNaN(expiry.getTime()) || expiry.getTime() < now.getTime()) continue;
    if (!latest || expiry.getTime() > latest.getTime()) latest = expiry;
  }
  if (latest) return latest;
  return stored ? new Date(stored) : null;
}
