/**
 * غرفة المناوبة بتوقيت جهاز من يفتحها.
 *
 * الجدول يُحفظ ويُحسب على الخادم بتوقيت الرياض (أيام ودقائق من منتصف ليل الرياض).
 * هنا نحوّل للعرض والإدخال فقط: زميل في القاهرة يرى ورديته ويعدّلها بساعة القاهرة،
 * ومن في الرياض يرى الأرقام نفسها كما كانت.
 *
 * دوال نقية تأخذ المنطقة صراحة لتُختبر؛ المكوّنات تمرر displayTimeZone().
 */

import { addDays } from "@shared/contentDuty";

const MINUTE = 60_000;
const DAY_MIN = 1440;
const RIYADH_OFFSET_MIN = 180;

/** فرق منطقة ما عن UTC بالدقائق عند لحظة معيّنة (القاهرة شتاءً = 120). */
export function zoneOffsetMinutes(timeZone: string, at: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  const floored = Math.floor(at / MINUTE) * MINUTE;
  return Math.round((asUtc - floored) / MINUTE);
}

/** كم دقيقة تتأخر ساعة الجهاز عن الرياض أو تتقدم (القاهرة شتاءً = ‎-60). */
export function minutesFromRiyadh(timeZone: string, at: number): number {
  return zoneOffsetMinutes(timeZone, at) - RIYADH_OFFSET_MIN;
}

/** «HH:mm» بتوقيت المنطقة وبأرقام لاتينية. */
export function dutyClock(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));
}

/** YYYY-MM-DD بتوقيت المنطقة. */
export function dutyDateKey(ms: number, timeZone: string): string {
  return new Date(ms + zoneOffsetMinutes(timeZone, ms) * MINUTE).toISOString().slice(0, 10);
}

/** الدقيقة من منتصف الليل بتوقيت المنطقة. */
export function dutyMinuteOfDay(ms: number, timeZone: string): number {
  const local = ms + zoneOffsetMinutes(timeZone, ms) * MINUTE;
  return Math.floor((((local % 86_400_000) + 86_400_000) % 86_400_000) / MINUTE);
}

export interface DutyRuleTimes {
  days: number[];
  startMinute: number;
  /** 1..1440؛ ‏<= البداية تعني أنها تنتهي في اليوم التالي */
  endMinute: number;
}

/** يزيح قاعدة وردية بعدد دقائق، ويحرّك أيامها إن عبرت البداية منتصف الليل. */
export function shiftRule(rule: DutyRuleTimes, deltaMin: number): DutyRuleTimes {
  if (deltaMin === 0) return { days: [...rule.days], startMinute: rule.startMinute, endMinute: rule.endMinute };
  const rawStart = rule.startMinute + deltaMin;
  const dayShift = Math.floor(rawStart / DAY_MIN);
  const startMinute = ((rawStart % DAY_MIN) + DAY_MIN) % DAY_MIN;
  const endMinute = ((((rule.endMinute + deltaMin - 1) % DAY_MIN) + DAY_MIN) % DAY_MIN) + 1;
  const days = Array.from(new Set(rule.days.map((d) => (((d + dayShift) % 7) + 7) % 7))).sort((a, b) => a - b);
  return { days, startMinute, endMinute };
}

export interface DutyDayPiece {
  dutyDate: string;
  startMinute: number;
  endMinute: number;
}

/**
 * يعيد توزيع قطع أسبوع الرياض على أيام الجهاز: كل قطعة تُزاح بالفرق ثم تُقسم عند منتصف الليل.
 * ما يخرج عن الأسبوع المعروض يُسقط.
 */
export function shiftWeekPieces<T extends DutyDayPiece>(pieces: readonly T[], weekStart: string, deltaMin: number): T[] {
  if (deltaMin === 0) return pieces.slice();
  const weekStartMs = Date.parse(`${weekStart}T00:00:00Z`);
  const out: T[] = [];
  for (const piece of pieces) {
    const dayIndex = Math.round((Date.parse(`${piece.dutyDate}T00:00:00Z`) - weekStartMs) / 86_400_000);
    let a = dayIndex * DAY_MIN + piece.startMinute + deltaMin;
    const b = dayIndex * DAY_MIN + piece.endMinute + deltaMin;
    a = Math.max(a, 0);
    const limit = Math.min(b, 7 * DAY_MIN);
    while (a < limit) {
      const day = Math.floor(a / DAY_MIN);
      const dayEnd = Math.min(limit, (day + 1) * DAY_MIN);
      out.push({ ...piece, dutyDate: addDays(weekStart, day), startMinute: a - day * DAY_MIN, endMinute: dayEnd - day * DAY_MIN });
      a = dayEnd;
    }
  }
  return out;
}
