/**
 * حسابات اليوم والعدّاد والهجري بتوقيت الرياض وتقويم أم القرى.
 * التاريخ المخزّن يوم مدني (YYYY-MM-DD). التحويل الهجري للعرض فقط.
 */

import { MAWAEED_TIMEZONE } from "./model";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function riyadhDateISO(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MAWAEED_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function diffIsoDays(fromIso: string, toIso: string): number {
  const from = isoToUtcDay(fromIso);
  const to = isoToUtcDay(toIso);
  return Math.round((to - from) / 86_400_000);
}

function isoToUtcDay(iso: string): number {
  const match = ISO_DATE.exec(iso);
  if (!match) throw new Error(`invalid date: ${iso}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** منتصف ليل الرياض ليوم مدني، بالميلي ثانية. */
export function riyadhMidnightMs(iso: string): number {
  const match = ISO_DATE.exec(iso);
  if (!match) throw new Error(`invalid date: ${iso}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), -3, 0, 0, 0);
}

export function daysPhrase(calendarDays: number, todayLabel: string): string {
  if (calendarDays <= 0) return todayLabel;
  if (calendarDays === 1) return "بعد يوم واحد";
  if (calendarDays === 2) return "بعد يومين";
  if (calendarDays <= 10) return `بعد ${calendarDays} أيام`;
  return `بعد ${calendarDays} يوماً`;
}

export function hoursPhrase(hours: number): string {
  if (hours <= 0) return "";
  if (hours === 1) return "وساعة";
  if (hours === 2) return "وساعتان";
  if (hours <= 10) return `و${hours} ساعات`;
  return `و${hours} ساعة`;
}

/**
 * العدّاد الحي: أيام وساعات متبقية حتى منتصف ليل بداية الموعد بتوقيت الرياض.
 * النص الثابت بلا جافاسكربت يستخدم فرق الأيام التقويمي (أي جزء من اليوم يُحسب يوماً).
 */
export function liveCountdown(now: Date, startsOn: string, todayLabel: string): {
  calendarDays: number;
  days: number;
  hours: number;
  staticText: string;
  liveText: string;
} {
  const today = riyadhDateISO(now);
  const calendarDays = diffIsoDays(today, startsOn);
  const staticText = daysPhrase(calendarDays, todayLabel);
  if (calendarDays <= 0) {
    return { calendarDays, days: 0, hours: 0, staticText, liveText: todayLabel };
  }
  const ms = riyadhMidnightMs(startsOn) - now.getTime();
  const totalHours = Math.max(0, Math.floor(ms / 3_600_000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  let liveText: string;
  if (days <= 0) {
    liveText = hoursPhrase(hours).replace(/^و/, "بعد ") || "بعد أقل من ساعة";
    if (!liveText.startsWith("بعد")) liveText = `بعد ${liveText}`;
  } else if (hours <= 0) {
    liveText = daysPhrase(days, todayLabel);
  } else {
    const dayPart = daysPhrase(days, todayLabel).replace(/^بعد /, "");
    liveText = `بعد ${dayPart} ${hoursPhrase(hours)}`;
  }
  return { calendarDays, days, hours, staticText, liveText };
}

const HIJRI_MONTHS: Record<number, string> = {
  1: "محرم",
  2: "صفر",
  3: "ربيع الأول",
  4: "ربيع الآخر",
  5: "جمادى الأولى",
  6: "جمادى الآخرة",
  7: "رجب",
  8: "شعبان",
  9: "رمضان",
  10: "شوال",
  11: "ذو القعدة",
  12: "ذو الحجة",
};

export type HijriParts = { year: number; month: number; day: number };

/** أم القرى عبر Intl، ليوم مدني مخزّن (يُقرأ عند ظهر الرياض حتى لا ينزلق اليوم). */
export function hijriParts(isoDate: string): HijriParts {
  const instant = new Date(`${isoDate}T12:00:00+03:00`);
  const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
    timeZone: MAWAEED_TIMEZONE,
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).formatToParts(instant);
  const num = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: num("year"), month: num("month"), day: num("day") };
}

export function formatHijri(isoDate: string, override?: string | null): string {
  if (override && override.trim()) return override.trim();
  const { year, month, day } = hijriParts(isoDate);
  const monthName = HIJRI_MONTHS[month] ?? String(month);
  return `${day} ${monthName} ${year}هـ`;
}

export function formatGregorian(isoDate: string): { weekday: string; day: string; month: string; year: string; label: string } {
  const instant = new Date(`${isoDate}T12:00:00+03:00`);
  const parts = new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    timeZone: MAWAEED_TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = get("weekday");
  const day = get("day");
  const month = get("month");
  const year = get("year");
  return { weekday, day, month, year, label: `${weekday} ${day} ${month} ${year}` };
}

export function formatRiyadhDayLabel(instantIso: string): string {
  const date = new Date(instantIso);
  if (Number.isNaN(date.getTime())) return instantIso;
  return formatGregorian(riyadhDateISO(date)).label;
}
