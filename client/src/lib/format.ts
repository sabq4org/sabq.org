/**
 * ============================================================================
 * Unified number/date/time formatting for the Sabq News web app.
 * ============================================================================
 *
 * Why this file exists:
 *  - Mixed Latin (1234) and Arabic-Indic (١٢٣٤) numerals showed up on the
 *    same screen because every page called `Number.toLocaleString("ar-SA")`
 *    independently and that locale defaults to `nu-arab` (Arabic-Indic).
 *  - Some surfaces accidentally rendered the Islamic Hijri calendar because
 *    `Intl.DateTimeFormat("ar-SA", ...)` falls back to `ca-islamic` on some
 *    Node/browser builds.
 *  - Timestamps were shown in UTC because callers forgot the timezone option.
 *
 * The contract:
 *  - All numbers ALWAYS render with Latin digits (1234, not ١٢٣٤).
 *  - All dates ALWAYS render in the Gregorian calendar.
 *  - All times ALWAYS render in Asia/Riyadh.
 *
 * Don't add `toLocaleString("ar-SA")` / `toLocaleDateString("ar-SA")` calls
 * anywhere else in the codebase. Route through this file instead — that's
 * the only way the three contracts above stay enforced.
 */

const RIYADH_TZ = "Asia/Riyadh";

// Single locale we use for every formatter. `nu-latn` forces Latin numerals
// even though the locale is Arabic; `ca-gregory` forces the Gregorian
// calendar; the resulting strings (e.g. month names, "م"/"ص") are still
// Arabic where appropriate.
const AR_LATN_GREGORY = "ar-SA-u-nu-latn-ca-gregory";

// ----------------------------------------------------------------------------
// Numbers
// ----------------------------------------------------------------------------

/**
 * Format an integer/float for display with Latin digits + thousands
 * separators. Always returns Latin digits — even when the page itself is
 * Arabic — because mixing 1234 and ١٢٣٤ on the same screen reads badly and
 * stats columns become impossible to align.
 *
 * @example
 *   formatNumber(1571)     // "1,571"
 *   formatNumber(0)        // "0"
 *   formatNumber(null)     // "—"
 *   formatNumber(undefined)// "—"
 */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US").format(value);
}

/**
 * Format a number with a fixed number of decimal places. Useful for
 * percentages and ratios where you don't want "12.0000001%".
 */
export function formatDecimal(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/**
 * Format a number as a percentage. Pass the percentage VALUE (e.g. 87 for
 * 87%), not a fraction (0.87) — that pattern surprised too many callers.
 */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${formatDecimal(value, digits)}%`;
}

/**
 * Compact number ("1.2K", "3.4M") for views/likes counters where space is
 * tight. Still Latin digits.
 */
export function formatCompactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact" }).format(value);
}

// ----------------------------------------------------------------------------
// Dates + times
// ----------------------------------------------------------------------------

type DateInput = Date | string | number | null | undefined;

function toDate(input: DateInput): Date | null {
  if (input === null || input === undefined || input === "") return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Date only — Gregorian, Riyadh timezone, long month name in Arabic with
 * Latin digits.
 *
 * @example formatDate("2026-05-20T08:01:00Z") → "20 مايو 2026"
 */
export function formatDate(input: DateInput): string {
  const d = toDate(input);
  if (!d) return "—";
  return new Intl.DateTimeFormat(AR_LATN_GREGORY, {
    timeZone: RIYADH_TZ,
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
}

/** Compact "20/05/2026" — Gregorian, Riyadh, Latin. */
export function formatDateShort(input: DateInput): string {
  const d = toDate(input);
  if (!d) return "—";
  return new Intl.DateTimeFormat(AR_LATN_GREGORY, {
    timeZone: RIYADH_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Time only ("8:05 م"). Riyadh timezone, Latin digits. AM/PM in Arabic
 * because that's still what reads naturally in the UI; pass `format24=true`
 * for 24-hour clock if needed.
 */
export function formatTime(input: DateInput, options: { format24?: boolean } = {}): string {
  const d = toDate(input);
  if (!d) return "—";
  return new Intl.DateTimeFormat(AR_LATN_GREGORY, {
    timeZone: RIYADH_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: !options.format24,
  }).format(d);
}

/** Full "20 مايو 2026، 8:05 م". */
export function formatDateTime(input: DateInput): string {
  const d = toDate(input);
  if (!d) return "—";
  return new Intl.DateTimeFormat(AR_LATN_GREGORY, {
    timeZone: RIYADH_TZ,
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

/**
 * Relative time ("منذ 5 دقائق"). Built by hand because Intl.RelativeTimeFormat
 * with Arabic locale auto-inserts Arabic-Indic numerals.
 *
 * Breaks even with the timezone: relative deltas are timezone-agnostic.
 */
export function formatRelativeTime(input: DateInput): string {
  const d = toDate(input);
  if (!d) return "—";
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return "الآن";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 2) return "منذ دقيقة";
  if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 2) return "منذ ساعة";
  if (diffHour < 24) return `منذ ${diffHour} ساعة`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 2) return "أمس";
  if (diffDay < 7) return `منذ ${diffDay} أيام`;
  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek < 2) return "منذ أسبوع";
  if (diffWeek < 4) return `منذ ${diffWeek} أسابيع`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 2) return "منذ شهر";
  if (diffMonth < 12) return `منذ ${diffMonth} أشهر`;
  return formatDate(d);
}

// ----------------------------------------------------------------------------
// Legacy escape hatch
// ----------------------------------------------------------------------------

/**
 * For the rare cases where you genuinely need a non-default locale (e.g.
 * an English-version page), this exposes the unified formatter without
 * forcing the Arabic locale. Defaults to en-US to stay Latin.
 */
export function formatNumberIn(value: number | null | undefined, locale = "en-US"): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(locale).format(value);
}
