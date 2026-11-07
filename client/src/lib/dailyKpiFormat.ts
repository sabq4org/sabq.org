/**
 * تنسيق بطاقات «مؤشرات الأداء اليومي اللحظية» في داشبورد غرفة الأخبار.
 */

/** أقل رقم لأمس تُعرض معه نسبة تغيّر؛ تحته تُعرض قيمة أمس نفسها لأن النسبة تضلّل. */
export const MIN_COMPARE_BASE = 20;

export type KpiComparison =
  | { kind: "percent"; value: number }
  | { kind: "yesterday"; value: number };

export function kpiComparison(current: number, previous: number | undefined): KpiComparison | undefined {
  if (previous === undefined || !Number.isFinite(previous) || !Number.isFinite(current)) return undefined;
  if (previous < MIN_COMPARE_BASE) return { kind: "yesterday", value: previous };
  return { kind: "percent", value: Math.round(((current - previous) / previous) * 100) };
}

/** مدة القراءة في سطر واحد: «1:27 د» أو «45 ث». */
export function formatReadDuration(seconds: number | undefined | null): string {
  const total = Math.round(Number(seconds) || 0);
  if (total <= 0) return "غير متاح";
  if (total < 60) return `${total} ث`;
  const mins = Math.floor(total / 60);
  const rem = total % 60;
  return `${mins}:${String(rem).padStart(2, "0")} د`;
}
