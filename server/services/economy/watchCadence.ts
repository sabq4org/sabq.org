/**
 * إيقاع الاستطلاع الذكي لمصادر ساما — دالة صرفة مُختبَرة.
 * المبدأ: استطلاع خفيف في العادة، وكثيف فقط في النوافذ التي يُتوقع فيها التغيير.
 * كل الأوقات بتوقيت الرياض (UTC+3 بلا توقيت صيفي).
 */
export type WatchSource = "indicators" | "fx" | "pos_weekly" | "money_supply_weekly" | "reserve_assets_monthly" | "news";

export const WATCH_SOURCES: WatchSource[] = ["indicators", "fx", "pos_weekly", "money_supply_weekly", "reserve_assets_monthly", "news"];

/** أيام قرارات الفيدرالي 2026 (اليوم الثاني من الاجتماع) — قابلة للتجاوز بـ FOMC_DECISION_DATES=yyyy-mm-dd,… */
export const DEFAULT_FOMC_DECISION_DATES = [
  "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09",
];

export interface RiyadhTime {
  dateIso: string; // yyyy-mm-dd
  weekday: number; // 0=الأحد … 6=السبت
  hour: number;
  minute: number;
  dayOfMonth: number;
}

export function toRiyadh(now: Date): RiyadhTime {
  const t = new Date(now.getTime() + 3 * 3600 * 1000);
  return {
    dateIso: t.toISOString().slice(0, 10),
    weekday: t.getUTCDay(),
    hour: t.getUTCHours(),
    minute: t.getUTCMinutes(),
    dayOfMonth: t.getUTCDate(),
  };
}

export function fomcDecisionDates(): Set<string> {
  const env = process.env.FOMC_DECISION_DATES;
  const list = env ? env.split(",").map((s) => s.trim()).filter(Boolean) : DEFAULT_FOMC_DECISION_DATES;
  return new Set(list);
}

/** الفاصل المطلوب (بالدقائق) بين استطلاعين لهذا المصدر في هذه اللحظة. */
export function intervalMinutes(source: WatchSource, now: Date, fomc: Set<string> = fomcDecisionDates()): number {
  const r = toRiyadh(now);
  const workday = r.weekday >= 0 && r.weekday <= 4; // الأحد–الخميس
  switch (source) {
    case "indicators": {
      // ليلة قرار الفيدرالي: ساما تعلن بعد الفيدرالي بدقائق (≈21:00–23:59 بتوقيت الرياض)
      if (fomc.has(r.dateIso) && r.hour >= 20) return 1;
      // نافذة صدور التضخم/عرض النقود (منتصف الشهر ونهايته)
      const mid = r.dayOfMonth >= 13 && r.dayOfMonth <= 16;
      const end = r.dayOfMonth >= 28 || r.dayOfMonth <= 1;
      if ((mid || end) && r.hour >= 8 && r.hour <= 18) return 10;
      return 30;
    }
    case "fx":
      if (workday && r.hour >= 9 && r.hour <= 13) return 10;
      return 60;
    case "pos_weekly":
      if (r.weekday === 2 && r.hour >= 9 && r.hour <= 17) return 15; // الثلاثاء
      return 360;
    case "money_supply_weekly":
      if (r.weekday === 4 && r.hour >= 9 && r.hour <= 17) return 15; // الخميس
      return 360;
    case "reserve_assets_monthly":
      if ((r.dayOfMonth <= 8 || r.dayOfMonth >= 28) && r.hour >= 8 && r.hour <= 18) return 60;
      return 1440;
    case "news":
      return 15;
  }
}

export function isDue(source: WatchSource, now: Date, lastRun: Date | null, fomc?: Set<string>): boolean {
  if (!lastRun) return true;
  const gapMin = (now.getTime() - lastRun.getTime()) / 60_000;
  return gapMin + 0.05 >= intervalMinutes(source, now, fomc);
}

/** هل نحن في «ليلة قرار فائدة»؟ تُستخدم للافتة في الواجهة. */
export function isDecisionNight(now: Date, fomc: Set<string> = fomcDecisionDates()): boolean {
  const r = toRiyadh(now);
  return fomc.has(r.dateIso) && r.hour >= 12;
}

export function nextDecisionDate(now: Date, fomc: Set<string> = fomcDecisionDates()): string | null {
  const today = toRiyadh(now).dateIso;
  const upcoming = Array.from(fomc).filter((d) => d >= today).sort();
  return upcoming[0] ?? null;
}
