/**
 * محرّك تسعير توقّعات «خليجي 27» — بركة متدرّجة مشتركة (pari-mutuel).
 *
 * لكل مباراة بركة أساسها 1000 نقطة (+ أي جائزة متراكمة)، تُقسَّم 50/30/20 على
 * ثلاث طبقات وتُوزَّع بالتساوي على فائزي كل طبقة:
 *   🎯 النتيجة الدقيقة (exact)   → 50%
 *   📏 الفارق الصحيح   (margin)  → 30%
 *   ✅ النتيجة الصحيحة (outcome) → 20%
 *
 * حماية «النتيجة المقلوبة»: نحسب الفائز بإشارة (home − away) لا بقيمتها المطلقة،
 * وإصابة الفارق تتطلّب تطابق الفرق المُوقَّع. فمن يتوقّع 2-1 والنتيجة 1-2 يقع في
 * طبقة «خطأ» = صفر (انظر scoreTier + الاختبار الذهني في الأسفل).
 *
 * وحدة نقيّة: لا db ولا API — تُختبر وتُعاد بسهولة.
 */

export type GcTier = "exact" | "margin" | "outcome" | "none";

export interface GcTierResult {
  tier: GcTier;
  outcomeHit: boolean;
  marginHit: boolean;
  exactHit: boolean;
}

const signOutcome = (home: number, away: number): -1 | 0 | 1 =>
  home > away ? 1 : home < away ? -1 : 0;

/**
 * طبقة التوقّع مقابل النتيجة النهائية.
 *
 * أمثلة (للتأكيد على حماية النتيجة المقلوبة):
 *   2-1 ضد 2-1 → exact
 *   2-1 ضد 3-2 → margin (نفس الفائز ونفس الفارق +1)
 *   2-1 ضد 1-0 → outcome (نفس الفائز، فارق مختلف)
 *   2-1 ضد 1-2 → none  (الفائز معكوس — لا مكافأة)  ✅ الحماية
 *   1-1 ضد 2-2 → margin (تعادل + فارق 0)
 */
export function scoreTier(
  predHome: number,
  predAway: number,
  finalHome: number,
  finalAway: number,
): GcTierResult {
  const exactHit = predHome === finalHome && predAway === finalAway;
  const sameOutcome = signOutcome(predHome, predAway) === signOutcome(finalHome, finalAway);
  const sameMargin = predHome - predAway === finalHome - finalAway; // مُوقَّع
  const marginHit = !exactHit && sameOutcome && sameMargin;
  const outcomeHit = sameOutcome; // النتيجة صحيحة (تشمل exact/margin)

  const tier: GcTier = exactHit ? "exact" : marginHit ? "margin" : outcomeHit ? "outcome" : "none";
  return { tier, outcomeHit, marginHit, exactHit };
}

export const POOL_SPLIT = { exact: 0.5, margin: 0.3, outcome: 0.2 } as const;

export interface PoolDistribution {
  /** نصيب الفائز الواحد في كل طبقة (نقاط صحيحة). */
  shareExact: number;
  shareMargin: number;
  shareOutcome: number;
  /** إجمالي الموزَّع فعليًّا لكل طبقة. */
  paidExact: number;
  paidMargin: number;
  paidOutcome: number;
  /** ما لم يُوزَّع (طبقات بلا فائزين + بواقي القسمة) — يتراكم للمباراة التالية. */
  carryOut: number;
}

/**
 * يوزّع البركة المتاحة (الأساس + الجائزة المتراكمة) على الطبقات الثلاث.
 * كل طبقة تأخذ حصّتها (50/30/20) وتُقسَّم بالتساوي (قسمة صحيحة) على فائزيها؛
 * البواقي والطبقات الخالية تذهب إلى carryOut (تتراكم) — لا تضيع نقطة.
 */
export function distributePool(
  available: number,
  winners: { exact: number; margin: number; outcome: number },
): PoolDistribution {
  const poolExact = Math.floor(available * POOL_SPLIT.exact);
  const poolMargin = Math.floor(available * POOL_SPLIT.margin);
  const poolOutcome = available - poolExact - poolMargin; // الباقي للطبقة الأخيرة (حفظ المجموع)

  const tier = (pool: number, count: number): { share: number; paid: number; carry: number } => {
    if (count <= 0) return { share: 0, paid: 0, carry: pool };
    const share = Math.floor(pool / count);
    const paid = share * count;
    return { share, paid, carry: pool - paid };
  };

  const e = tier(poolExact, winners.exact);
  const m = tier(poolMargin, winners.margin);
  const o = tier(poolOutcome, winners.outcome);

  return {
    shareExact: e.share,
    shareMargin: m.share,
    shareOutcome: o.share,
    paidExact: e.paid,
    paidMargin: m.paid,
    paidOutcome: o.paid,
    carryOut: e.carry + m.carry + o.carry,
  };
}

/** نصيب الطبقة لمستخدم معيّن. */
export function shareForTier(dist: PoolDistribution, tier: GcTier): number {
  if (tier === "exact") return dist.shareExact;
  if (tier === "margin") return dist.shareMargin;
  if (tier === "outcome") return dist.shareOutcome;
  return 0;
}
