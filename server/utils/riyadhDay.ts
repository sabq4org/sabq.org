/**
 * حدود «اليوم» التحريري بتوقيت الرياض.
 *
 * الخوادم على Railway تعمل بتوقيت UTC، فحساب اليوم عبر `new Date().setHours(0,0,0,0)`
 * يبدأ يوم المحرر الساعة ٣ فجراً بتوقيت الرياض ويخلط أرقام «اليوم» في اللوحات.
 * السعودية على UTC+3 ثابتاً بلا توقيت صيفي، لذا الإزاحة ثابتة.
 */
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DayRange {
  start: Date;
  end: Date;
}

export function riyadhDayRange(reference: Date = new Date()): DayRange {
  const shifted = new Date(reference.getTime() + RIYADH_OFFSET_MS);
  const midnightRiyadhAsUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  const start = new Date(midnightRiyadhAsUtc - RIYADH_OFFSET_MS);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}
