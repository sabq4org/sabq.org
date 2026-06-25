/**
 * نموذج قوة المنتخبات واحتمالات المباريات لكأس آسيا 2027 — قلب «المساعد الذكي»
 * في نظام التوقّعات.
 *
 * الفكرة: لكل منتخب تقييم قوة أوّلي (Elo-like) مبني على مستواه القارّي قبل
 * انطلاق البطولة، ثم يُمزَج لحظيًّا بفورمته الفعلية في دور المجموعات (نقاط/مباراة
 * + فارق أهداف/مباراة) فيصحّح النموذج نفسه مع تقدّم النتائج. من فرق التقييم نشتقّ
 * احتمالات (فوز/تعادل/خسارة) عبر منحنى لوجستي + توزيع تعادل يبلغ ذروته في
 * المباريات المتكافئة. هذه الاحتمالات تُعرَض للمستخدم، وتُسعِّر «جرأة» توقّعه:
 * إصابة نتيجة بعيدة الاحتمال تضاعف نقاطه.
 *
 * لا يستورد db ولا API — دالة نقيّة تأخذ التقييمات + صفوف الترتيب الممرَّرة.
 */
import { SAUDI_TEAM_ID } from "./worldCupNames";
import type { AcStandingRow } from "./asianCupService";

/**
 * تقييم القوة الأوّلي حسب معرّف API-Football (راجع asianCupNames.AC_TEAM_AR).
 * أرقام تقريبية تعكس المستوى القارّي 2026 (حامل اللقب قطر، الرباعي الكبير
 * اليابان/إيران/كوريا/أستراليا في القمة، والمضيف السعودية يليهم). تقدير مبدئي
 * فقط — الفورمة الحيّة تعدّله بمجرد أن تُلعب المباريات.
 */
export const AC_BASE_RATING: Record<number, number> = {
  12: 1815,   // اليابان
  22: 1788,   // إيران
  17: 1772,   // كوريا الجنوبية
  20: 1752,   // أستراليا
  23: 1722,   // السعودية (المضيف)
  1569: 1712, // قطر (حامل اللقب مرّتين)
  1568: 1686, // أوزبكستان
  1548: 1654, // الأردن (وصيف 2023)
  1567: 1650, // العراق
  1563: 1612, // الإمارات
  1552: 1566, // عُمان
  1566: 1560, // الصين
  1542: 1558, // فيتنام
  1564: 1556, // تايلاند
  1547: 1540, // البحرين
  1565: 1532, // سوريا
  1536: 1520, // طاجيكستان
  1562: 1508, // فلسطين
  1554: 1500, // قيرغيزستان
  1561: 1496, // كوريا الشمالية
  1571: 1486, // إندونيسيا
  1570: 1474, // الكويت
  1546: 1438, // سنغافورة
  1550: 1402, // اليمن
};

/** منتخب غير مُقيَّم (لم يُحدَّث القاموس بعد) — متوسط هادئ. */
const DEFAULT_RATING = 1520;

/** أفضلية أرض ومناصرين للمضيف (السعودية) عند لعبه — تُضاف لتقييمه فقط. */
const HOST_ADVANTAGE = 35;

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

export function baseRating(teamId: number): number {
  return AC_BASE_RATING[teamId] ?? DEFAULT_RATING;
}

/**
 * التقييم الفعّال = الأساسي + تعديل الفورمة من الترتيب (إن لُعبت مباريات).
 * كل نقطة/مباراة فوق المعدّل 1.5 تزيد ~40، وكل هدف فارق/مباراة يزيد ~12،
 * بحدّ ±120 كي لا تطغى بداية قويّة على المستوى الحقيقي.
 */
export function effectiveRating(teamId: number, row?: AcStandingRow | null): number {
  const base = baseRating(teamId);
  if (!row || row.played <= 0) return base;
  const ppg = row.points / row.played;            // 0..3
  const gdpg = clamp(row.goalsDiff / row.played, -3, 3);
  const formAdj = clamp((ppg - 1.5) * 40 + gdpg * 12, -120, 120);
  return base + formAdj;
}

export interface MatchProbabilities {
  /** احتمالات تُجمَع تقريبًا على 1 (كسور). */
  home: number;
  draw: number;
  away: number;
  /** التقييمان الفعّالان بعد الفورمة وأفضلية المضيف — للشفافية/التصحيح. */
  ratingHome: number;
  ratingAway: number;
}

export interface ProbabilityInput {
  homeId: number;
  awayId: number;
  homeRow?: AcStandingRow | null;
  awayRow?: AcStandingRow | null;
}

/**
 * احتمالات (فوز المضيف للأرض/تعادل/فوز الضيف) من فرق التقييم.
 *
 *   We = 1 / (1 + 10^(-Δ/400))          الحصّة المتوقَّعة لصاحب الأرض (نمط Elo)
 *   pDraw = 0.30·(1 − 2·|We − 0.5|)     يبلغ ذروته في التكافؤ، ويتلاشى في الفوارق
 *   pHome = (1 − pDraw)·We , pAway = (1 − pDraw)·(1 − We)
 *
 * المجموع = 1 بالبناء. تُضاف أفضلية المضيف لتقييم السعودية فقط (كل المباريات
 * على أرضها لكن الأفضلية تُحسب حين تلعب هي).
 */
export function computeMatchProbabilities(input: ProbabilityInput): MatchProbabilities {
  const rh = effectiveRating(input.homeId, input.homeRow) +
    (input.homeId === SAUDI_TEAM_ID ? HOST_ADVANTAGE : 0);
  const ra = effectiveRating(input.awayId, input.awayRow) +
    (input.awayId === SAUDI_TEAM_ID ? HOST_ADVANTAGE : 0);

  const dr = rh - ra;
  const we = 1 / (1 + Math.pow(10, -dr / 400));
  const pDraw = clamp(0.30 * (1 - 2 * Math.abs(we - 0.5)), 0.06, 0.34);
  const pHome = (1 - pDraw) * we;
  const pAway = (1 - pDraw) * (1 - we);
  return { home: pHome, draw: pDraw, away: pAway, ratingHome: rh, ratingAway: ra };
}

/** أقرب توزيع نِسَب مئوية صحيحة يجمع 100 بالضبط (Largest-Remainder). */
export function toWholePercents(p: MatchProbabilities): { home: number; draw: number; away: number } {
  const raw = [p.home * 100, p.draw * 100, p.away * 100];
  const floor = raw.map((x) => Math.floor(x));
  let remainder = 100 - floor.reduce((a, b) => a + b, 0);
  const order = raw
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floor];
  for (const { i } of order) {
    if (remainder <= 0) break;
    out[i]++;
    remainder--;
  }
  return { home: out[0], draw: out[1], away: out[2] };
}

export type Outcome = "home" | "draw" | "away";

/** نتيجة المباراة من الأهداف. */
export function outcomeOf(home: number, away: number): Outcome {
  if (home > away) return "home";
  if (home < away) return "away";
  return "draw";
}

/**
 * مضاعِف الجرأة من احتمال النتيجة المختارة (كسر 0..1):
 *   B = clamp(0.40 / p, 0.5, 3.0)
 * توقّع متوسط (p≈0.40) ⇒ ×1، مفاجأة (p≈0.20) ⇒ ×2، صدمة (p≤0.13) ⇒ ×3،
 * ومرشّح ثقيل (p≥0.80) ⇒ ×0.5. يكافئ الإصابة الجريئة ويقلّل أجر «المضمون».
 */
export function boldnessMultiplier(probOfPickedOutcome: number): number {
  const p = clamp(probOfPickedOutcome, 0.02, 0.98);
  return clamp(Math.round((0.40 / p) * 100) / 100, 0.5, 3.0);
}

/**
 * مضاعِف السلسلة من عدد الإصابات المتتالية (نتيجة صحيحة) قبل هذه المباراة:
 *   ≥7 ⇒ ×1.5 · ≥5 ⇒ ×1.25 · ≥3 ⇒ ×1.1 · غير ذلك ×1.
 */
export function streakMultiplier(priorStreak: number): number {
  if (priorStreak >= 7) return 1.5;
  if (priorStreak >= 5) return 1.25;
  if (priorStreak >= 3) return 1.1;
  return 1;
}

// نقاط الطبقات — تراكميّة: النتيجة الصحيحة أساس، الفارق الصحيح إضافة، النتيجة
// المطابقة قمّة (مجموع 30 قبل المضاعِفات).
export const TIER_POINTS = { outcome: 10, margin: 8, exact: 12 } as const;

export interface ScoreBreakdown {
  outcomeHit: boolean;
  marginHit: boolean;
  exactHit: boolean;
  tierPoints: number;     // مجموع نقاط الطبقات قبل المضاعِفات
  boldness: number;       // مضاعِف (1.0..3.0)
  streak: number;         // مضاعِف (1.0..1.5)
  points: number;         // الإجمالي النهائي بعد المضاعِفات (صحيح)
}

/**
 * احتساب نقاط توقّع واحد مقابل النتيجة النهائية — نقيّ وقابل للتكرار.
 * المضاعِفات تُطبَّق على مجموع الطبقات. لا نقاط إن أُخطئت النتيجة.
 */
export function scorePrediction(
  predHome: number,
  predAway: number,
  finalHome: number,
  finalAway: number,
  probOfPickedOutcome: number,
  priorStreak: number,
): ScoreBreakdown {
  const outcomeHit = outcomeOf(predHome, predAway) === outcomeOf(finalHome, finalAway);
  const marginHit = outcomeHit && predHome - predAway === finalHome - finalAway;
  const exactHit = predHome === finalHome && predAway === finalAway;

  const tierPoints = outcomeHit
    ? TIER_POINTS.outcome + (marginHit ? TIER_POINTS.margin : 0) + (exactHit ? TIER_POINTS.exact : 0)
    : 0;

  const boldness = boldnessMultiplier(probOfPickedOutcome);
  const streak = streakMultiplier(priorStreak);
  const points = tierPoints > 0 ? Math.max(1, Math.round(tierPoints * boldness * streak)) : 0;

  return { outcomeHit, marginHit, exactHit, tierPoints, boldness, streak, points };
}
