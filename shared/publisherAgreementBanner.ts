/**
 * شريط «الاتفاقية المفتوحة» في بوابة الوكالات (منطق خالص بلا واجهة).
 *
 * يظهر للباقة المفتوحة فقط حين يبقى على انتهائها 90 يومًا أو أقل، ويختفي إذا
 * وُجدت باقة لاحقة (جُددت). إغلاق العميل له يُحفظ لكل باقة ومرحلة، فيعود
 * الشريط عند بلوغ 30 يومًا ثم 7 أيام (نفس مواعيد تذكير التجديد للباقة المفتوحة).
 */

export const AGREEMENT_BANNER_MILESTONES = [90, 30, 7] as const;

export interface AgreementBannerInput {
  current: { id: string; isUnlimited: boolean; daysLeft: number | null } | null;
  upcoming: unknown | null;
}

export interface AgreementBannerState {
  daysLeft: number;
  /** أصغر مرحلة دخلتها الباقة (90 أو 30 أو 7). */
  milestone: number;
  /** اسم حفظ الإغلاق في المتصفح: لكل باقة ومرحلة. */
  dismissId: string;
}

export function agreementBannerState(input: AgreementBannerInput | null | undefined): AgreementBannerState | null {
  const current = input?.current;
  if (!current || !current.isUnlimited || input?.upcoming) return null;
  const daysLeft = current.daysLeft;
  if (daysLeft === null || !Number.isFinite(daysLeft) || daysLeft < 0) return null;
  const reached = AGREEMENT_BANNER_MILESTONES.filter((m) => daysLeft <= m);
  if (!reached.length) return null;
  const milestone = Math.min(...reached);
  return { daysLeft, milestone, dismissId: `sabq-agreement-banner:${current.id}:${milestone}` };
}

/** «90 يومًا»، «5 أيام»، «يومان»، «يوم واحد»، «اليوم». أرقام لاتينية. */
export function agreementDaysText(days: number): string {
  if (days <= 0) return "أقل من يوم";
  if (days === 1) return "يوم واحد";
  if (days === 2) return "يومان";
  if (days <= 10) return `${days} أيام`;
  return `${days} يومًا`;
}
