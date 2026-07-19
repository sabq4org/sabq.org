/**
 * مرساة ساعة المباراة الموحّدة (clockStartEpoch) — سلطة واحدة لكل الأسطح.
 *
 * «الدقيقة m» عند المزوّدين تعني أن اللعب جارٍ *داخل* الدقيقة m (ساعة البث تعرض
 * m-1:xx)، فالإرساء الصحيح = الآن − (m−1)×60. من هذه المرساة يشتق كل سطح
 * (بطاقة «مبارياتي»، مركز المباراة، Live Activity على شاشة القفل) عدّادًا ذاتيًّا
 * متطابقًا إلى الثانية — بدل أن يحسب كل طرف دقيقته على هواه فتتباعد الأرقام.
 *
 * التثبيت: المرساة تُعاد حسابها من لقطة المزوّد في كل نداء، ولحظة انقلاب الدقيقة
 * تختلف بين المصادر فتتزحزح المرساة بضع ثوانٍ صعودًا وهبوطًا («يسبق ثم يرتدّ»).
 * نثبّتها لكل مباراة ما دام الفرق ضمن التسامح (75ث)؛ إعادة الإرساء فقط عند فارق
 * كبير = شوط جديد/تصحيح حقيقي. الخريطة في الذاكرة (لكل عملية): عامل Live Activity
 * ومسارات REST والموجز على نفس النسخة يتشاركونها فيتطابقون حرفيًّا.
 *
 * لا يستورد db — آمن للاستيراد من أي مسار أو خدمة.
 */

export interface MatchClockStatus {
  code: string;
  elapsed: number | null;
  extra: number | null;
  live: boolean;
  finished: boolean;
}

/** أكواد توقّف الساعة (استراحة/فاصل/ترجيح/إيقاف) — نفس قائمة iOS حرفيًّا. */
const CLOCK_PAUSED_CODES = new Set(["HT", "BT", "P", "PEN", "BREAK", "INT", "SUSP", "HALF_TIME"]);

export const ANCHOR_DRIFT_TOLERANCE_SEC = 75;

export function isMatchClockRunning(status: MatchClockStatus): boolean {
  if (!status.live || status.finished) return false;
  if (!status.elapsed || status.elapsed <= 0) return false;
  return !CLOCK_PAUSED_CODES.has(String(status.code || "").toUpperCase());
}

/** مرساة خام من لقطة الحالة — null والساعة متوقّفة (قبل البدء/استراحة/ترجيح). */
export function computeClockStartEpoch(status: MatchClockStatus): number | null {
  if (!isMatchClockRunning(status)) return null;
  const playedMinutes = (status.elapsed ?? 0) + (status.extra ?? 0);
  if (playedMinutes < 1) return null;
  return Math.floor(Date.now() / 1000) - (playedMinutes - 1) * 60;
}

interface AnchorEntry {
  epoch: number;
  touchedAt: number;
}

const anchors = new Map<number, AnchorEntry>();
const SWEEP_INTERVAL_MS = 30 * 60 * 1000;
const SWEEP_MAX_AGE_MS = 6 * 3600 * 1000;
let lastSweepAt = 0;

/** تنظيف دوري خفيف: مباريات اختفت دون «انتهت» (تأجيل/انقطاع مزوّد) لا تتراكم. */
function sweepStaleAnchors(now: number): void {
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;
  for (const [key, entry] of anchors) {
    if (now - entry.touchedAt > SWEEP_MAX_AGE_MS) anchors.delete(key);
  }
}

/**
 * يثبّت مرساة مرشّحة: يعيد المخزّنة ما دام الفرق < التسامح، وإلا يعتمد الجديدة.
 * مرشّح null (ساعة متوقّفة) يمسح المخزّنة — الشوط التالي يُرسي من جديد.
 */
export function stabilizeClockStartEpoch(fixtureId: number, candidate: number | null): number | null {
  const now = Date.now();
  sweepStaleAnchors(now);
  if (candidate == null) {
    anchors.delete(fixtureId);
    return null;
  }
  const stored = anchors.get(fixtureId);
  if (stored && Math.abs(stored.epoch - candidate) < ANCHOR_DRIFT_TOLERANCE_SEC) {
    stored.touchedAt = now;
    return stored.epoch;
  }
  anchors.set(fixtureId, { epoch: candidate, touchedAt: now });
  return candidate;
}

export function clearClockAnchor(fixtureId: number): void {
  anchors.delete(fixtureId);
}

/** الاختصار المعتاد: احسب من الحالة ثم ثبّت — للاستجابات REST وموجز SSE. */
export function clockStartEpochFor(fixtureId: number, status: MatchClockStatus): number | null {
  return stabilizeClockStartEpoch(fixtureId, computeClockStartEpoch(status));
}
