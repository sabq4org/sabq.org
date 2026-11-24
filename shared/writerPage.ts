// صفحة الكاتب (/author/:name): يوم الكتابة المعتاد، وموعده القادم، وكتّاب اليوم نفسه.
// منطق خالص بلا قاعدة بيانات، يستعمله writerPageService وتختبره الوحدات.

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const ARABIC_WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] as const;

/** يوم الأسبوع بتوقيت الرياض (0 الأحد … 6 السبت). */
export function riyadhWeekday(date: Date): number {
  return new Date(date.getTime() + RIYADH_OFFSET_MS).getUTCDay();
}

/**
 * يوم الكتابة المعتاد من آخر مقالات الكاتب (الأحدث أولًا، حتى 8).
 * يُعتمد حين تكون 3 مقالات على الأقل، ونصفها أو أكثر في يوم واحد؛ وإلا null.
 */
export function usualWeekday(publishedAt: readonly Date[]): number | null {
  const recent = [...publishedAt].sort((a, b) => b.getTime() - a.getTime()).slice(0, 8);
  if (recent.length < 3) return null;
  const counts = new Array(7).fill(0) as number[];
  for (const d of recent) counts[riyadhWeekday(d)] += 1;
  let best = 0;
  for (let i = 1; i < 7; i++) if (counts[i] > counts[best]) best = i;
  // تعادل في القمة يعني أنه لا يوم واضحًا
  if (counts.filter((c) => c === counts[best]).length > 1) return null;
  return counts[best] * 2 >= recent.length ? best : null;
}

/**
 * مفتاح يوم الرياض لموعده القادم: أقرب يوم بهذا الاسم بدءًا من اليوم،
 * إلا إذا نشر اليوم بالفعل فالأسبوع التالي.
 */
export function nextWritingDayKey(weekday: number, now: Date, latestPublishedAt: Date | null): string {
  const shifted = new Date(now.getTime() + RIYADH_OFFSET_MS);
  const todayKey = shifted.toISOString().slice(0, 10);
  const todayMs = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  let ahead = (weekday - shifted.getUTCDay() + 7) % 7;
  if (ahead === 0 && latestPublishedAt) {
    const latestKey = new Date(latestPublishedAt.getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
    if (latestKey === todayKey) ahead = 7;
  }
  return new Date(todayMs + ahead * DAY_MS).toISOString().slice(0, 10);
}

/** أكثر التصنيفات تكرارًا (حتى limit)، بترتيب التكرار ثم الظهور الأول. */
export function topNames(names: readonly (string | null | undefined)[], limit = 2): string[] {
  const counts = new Map<string, number>();
  for (const n of names) if (n) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([n]) => n);
}
