/**
 * تبويبات مركز مباراة البوابة — يطابق نافذة VARA (iOS/Android):
 * الغيابات للمباراة القادمة البعيدة، التشكيلة قرب الصافرة، الأحداث بعد الانطلاق.
 */
export function defaultMatchCenterTab(
  isUpcoming: boolean,
  msToKickoff = Number.POSITIVE_INFINITY,
): "absences" | "lineups" | "events" {
  if (!isUpcoming) return "events";
  if (msToKickoff <= 15 * 60_000) return "lineups";
  return "absences";
}

/** نافذة انتظار التشكيلة: نُظهر التبويب بحالة فارغة بدل إخفائه قبيل الانطلاق. */
export function isAwaitingLineups(opts: {
  finished: boolean;
  officialXiReady: boolean;
  hasExpected: boolean;
  msToKickoff: number;
}): boolean {
  if (opts.finished || opts.officialXiReady || opts.hasExpected) return false;
  return opts.msToKickoff <= 2 * 3600_000 && opts.msToKickoff > -3 * 3600_000;
}
