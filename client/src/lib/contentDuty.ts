import type { ContentDutyManager } from "@shared/contentDuty";

export const dutyDays = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

const riyadhClock = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Riyadh",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function riyadhDutyTime(date: Date) {
  const parts = riyadhClock.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)!.value;
  return { day: weekdays.indexOf(value("weekday")), hour: Number(value("hour")) + Number(value("minute")) / 60 };
}

export function formatDutyHour(hour: number) {
  const minutes = Math.round(hour * 60);
  return String(Math.floor(minutes / 60)).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0");
}

export interface DutySegment {
  manager: ContentDutyManager;
  start: number;
  end: number;
  endHour: number;
  carry: boolean;
  overnight: boolean;
}

export function dutySegments(managers: ContentDutyManager[], day: number): DutySegment[] {
  const previousDay = (day + 6) % 7;
  const segments: DutySegment[] = [];
  for (const manager of managers) {
    for (const { days, startHour, endHour } of manager.shifts) {
      const overnight = endHour < startHour;
      if (overnight && endHour > 0 && days.includes(previousDay)) {
        segments.push({ manager, start: 0, end: endHour, endHour, carry: true, overnight: false });
      }
      if (days.includes(day)) {
        segments.push({ manager, start: startHour, end: overnight ? 24 : endHour, endHour, carry: false, overnight });
      }
    }
  }
  return segments.sort((a, b) => a.start - b.start || a.end - b.end);
}
