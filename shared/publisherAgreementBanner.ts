/**
 * شريط «الاتفاقية المفتوحة» في بوابة الوكالات (منطق خالص بلا واجهة).
 *
 * يظهر للباقة المفتوحة فقط حين يبقى على انتهائها 90 يومًا أو أقل، ويختفي إذا
 * وُجدت باقة لاحقة (جُددت). إغلاق العميل له يُحفظ لكل باقة ومرحلة، فيعود
 * الشريط عند بلوغ 30 يومًا ثم 7 أيام (نفس مواعيد تذكير التجديد للباقة المفتوحة).
 *
 * الباقة المحدودة: الشريط نفسه حسب الرصيد المتبقي بالنسبة إلى حجم الباقة،
 * يظهر عند 20% ثم يعود عند 10% ثم عند آخر خبر، ويبقى حين ينفد الرصيد.
 */

export const AGREEMENT_BANNER_MILESTONES = [90, 30, 7] as const;

export interface AgreementBannerInput {
  current: {
    id: string;
    isUnlimited: boolean;
    daysLeft: number | null;
    totalCredits?: number | null;
    remainingCredits?: number | null;
  } | null;
  upcoming: unknown | null;
}

/** نسب الرصيد المتبقي التي يظهر عندها شريط الباقة المحدودة. */
export const CREDIT_BANNER_RATIOS = [0.2, 0.1] as const;

export type AgreementBannerState =
  | {
      kind: "days";
      daysLeft: number;
      /** أصغر مرحلة دخلتها الباقة (90 أو 30 أو 7). */
      milestone: number;
      dismissId: string;
    }
  | {
      kind: "credits";
      remaining: number;
      total: number;
      /** أصغر عتبة دخلها الرصيد (عدد أخبار): 20% ثم 10% ثم 1 ثم 0. */
      milestone: number;
      dismissId: string;
    };

/** عتبات الرصيد بعدد الأخبار لباقة حجمها total، من الأكبر للأصغر وبلا تكرار. */
export function creditBannerThresholds(total: number): number[] {
  const fromRatios = CREDIT_BANNER_RATIOS.map((r) => Math.max(1, Math.round(total * r)));
  return Array.from(new Set([...fromRatios, 1, 0])).sort((a, b) => b - a);
}

function creditBannerState(
  current: NonNullable<AgreementBannerInput["current"]>,
): Extract<AgreementBannerState, { kind: "credits" }> | null {
  const total = Number(current.totalCredits);
  const remaining = Number(current.remainingCredits);
  if (!Number.isFinite(total) || !Number.isFinite(remaining) || total <= 0) return null;
  const left = Math.max(0, remaining);
  const reached = creditBannerThresholds(total).filter((t) => left <= t);
  if (!reached.length) return null;
  const milestone = Math.min(...reached);
  return {
    kind: "credits",
    remaining: left,
    total,
    milestone,
    dismissId: `sabq-agreement-banner:${current.id}:credits-${milestone}`,
  };
}

export function agreementBannerState(input: AgreementBannerInput | null | undefined): AgreementBannerState | null {
  const current = input?.current;
  if (!current) return null;
  if (!current.isUnlimited) {
    const credits = creditBannerState(current);
    // جُددت الباقة: يختفي التنبيه، إلا إن نفد الرصيد فعلًا قبل بدء الباقة اللاحقة
    if (credits && input?.upcoming && credits.remaining > 0) return null;
    return credits;
  }
  if (input?.upcoming) return null;
  const daysLeft = current.daysLeft;
  if (daysLeft === null || !Number.isFinite(daysLeft) || daysLeft < 0) return null;
  const reached = AGREEMENT_BANNER_MILESTONES.filter((m) => daysLeft <= m);
  if (!reached.length) return null;
  const milestone = Math.min(...reached);
  return { kind: "days", daysLeft, milestone, dismissId: `sabq-agreement-banner:${current.id}:${milestone}` };
}

/** «90 يومًا»، «5 أيام»، «يومان»، «يوم واحد»، «اليوم». أرقام لاتينية. */
export function agreementDaysText(days: number): string {
  if (days <= 0) return "أقل من يوم";
  if (days === 1) return "يوم واحد";
  if (days === 2) return "يومان";
  if (days <= 10) return `${days} أيام`;
  return `${days} يومًا`;
}

/** «خبر واحد»، «خبران»، «5 أخبار»، «40 خبرًا». أرقام لاتينية. */
export function agreementCreditsText(n: number): string {
  if (n === 1) return "خبر واحد";
  if (n === 2) return "خبران";
  if (n >= 3 && n <= 10) return `${n} أخبار`;
  return `${n} خبرًا`;
}
