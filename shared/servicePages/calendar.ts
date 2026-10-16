/**
 * ملف تقويم يُبنى من مواعيد الصفحة المنشورة. لا يُخزَّن.
 * الأيام كلها مدنية (VALUE=DATE) بلا إزاحة توقيت.
 */

import type { ServicePageModel } from "./present";

export function buildServiceCalendar(
  model: Pick<ServicePageModel, "id" | "h1" | "canonical" | "dateModified" | "rows"> & Partial<Pick<ServicePageModel, "region">>,
): string | null {
  const events = model.rows.filter((row) => !row.isPast);
  if (events.length === 0) return null;
  const stamp = icsStamp(model.dateModified);
  // معرّف مستقل لكل منطقة حتى لا يستبدل تقويمُ مكة أحداثَ تقويم الرياض عند استيراد الاثنين.
  const uidScope = model.region && model.region !== "riyadh" ? `${model.id}-${model.region}` : model.id;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sabq//ServiceDates//AR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    fold(`X-WR-CALNAME:${icsText(model.h1)}`),
  ];
  for (const row of events) {
    const start = row.startsOn.replace(/-/g, "");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uidScope}-${row.startsOn}@sabq.org`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${nextDate(row.startsOn)}`,
      fold(`SUMMARY:${icsText(`${model.h1} — ${row.title}`)}`),
      fold(`DESCRIPTION:${icsText(`${row.certaintyLabel}. ${row.hijriLabel}. ${model.canonical}`)}`),
      fold(`URL:${model.canonical}`),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

function icsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function icsStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "20260927T000000Z";
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function nextDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10).replace(/-/g, "");
}

/** طيّ السطر عند 75 بايتًا حسب RFC 5545. */
function fold(line: string): string {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char);
    const limit = parts.length === 0 ? 75 : 74;
    if (bytes + size > limit && current) {
      parts.push(current);
      current = ` ${char}`;
      bytes = 1 + size;
    } else {
      current += char;
      bytes += size;
    }
  }
  if (current) parts.push(current);
  return parts.join("\r\n");
}
