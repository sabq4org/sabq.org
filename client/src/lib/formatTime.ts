/**
 * Unified time formatting utility for Sabq News Platform
 * All timestamps are stored in UTC and displayed in Riyadh timezone (UTC+3)
 */

const RIYADH_TIMEZONE = 'Asia/Riyadh';

/**
 * Format a timestamp for display, converting from UTC to Riyadh timezone
 */
export function formatArticleTimestamp(
  publishedAt: string | Date | null | undefined,
  options: {
    format?: 'relative' | 'absolute' | 'both';
    locale?: 'ar' | 'en';
  } = {}
): string {
  const { format = 'relative', locale = 'ar' } = options;

  if (!publishedAt) {
    return locale === 'ar' ? 'غير محدد' : 'Unknown';
  }

  try {
    const date = new Date(publishedAt);
    if (isNaN(date.getTime())) {
      return locale === 'ar' ? 'تاريخ غير صالح' : 'Invalid date';
    }

    if (format === 'absolute') {
      return formatAbsolute(date, locale);
    } else if (format === 'both') {
      return `${formatRelative(date, locale)} (${formatAbsolute(date, locale)})`;
    }
    return formatRelative(date, locale);
  } catch {
    return locale === 'ar' ? 'خطأ في التاريخ' : 'Date error';
  }
}

/**
 * Format relative time (e.g., "منذ 5 دقائق")
 * Compare UTC timestamps directly - no timezone conversion needed for relative time
 * The difference between two points in time is the same regardless of timezone
 */
function formatRelative(date: Date, locale: 'ar' | 'en'): string {
  // Compare UTC timestamps directly - relative time is timezone-agnostic
  const now = Date.now();
  const then = date.getTime();
  
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);

  if (locale === 'ar') {
    if (diffSec < 60) return 'الآن';
    if (diffMin < 2) return 'منذ دقيقة';
    if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
    if (diffHour < 2) return 'منذ ساعة';
    if (diffHour < 24) return `منذ ${diffHour} ساعة`;
    if (diffDay < 2) return 'منذ يوم';
    if (diffDay < 7) return `منذ ${diffDay} أيام`;
    if (diffWeek < 2) return 'منذ أسبوع';
    if (diffWeek < 4) return `منذ ${diffWeek} أسابيع`;
    if (diffMonth < 2) return 'منذ شهر';
    if (diffMonth < 12) return `منذ ${diffMonth} أشهر`;
    return formatAbsolute(date, locale);
  } else {
    if (diffSec < 60) return 'Just now';
    if (diffMin < 2) return '1 minute ago';
    if (diffMin < 60) return `${diffMin} minutes ago`;
    if (diffHour < 2) return '1 hour ago';
    if (diffHour < 24) return `${diffHour} hours ago`;
    if (diffDay < 2) return 'Yesterday';
    if (diffDay < 7) return `${diffDay} days ago`;
    if (diffWeek < 2) return '1 week ago';
    if (diffWeek < 4) return `${diffWeek} weeks ago`;
    if (diffMonth < 2) return '1 month ago';
    if (diffMonth < 12) return `${diffMonth} months ago`;
    return formatAbsolute(date, locale);
  }
}

/**
 * Format absolute time in Riyadh timezone
 */
function formatAbsolute(date: Date, locale: 'ar' | 'en'): string {
  try {
    const formatter = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-US', {
      timeZone: RIYADH_TIMEZONE,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    return formatter.format(date);
  } catch {
    return date.toLocaleString();
  }
}

/**
 * Get Riyadh timezone date for display
 */
export function getRiyadhDate(date: Date | string): Date {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Date(d.toLocaleString('en-US', { timeZone: RIYADH_TIMEZONE }));
}

/**
 * Format time only (e.g., "10:30 ص")
 */
export function formatTimeOnly(
  publishedAt: string | Date | null | undefined,
  locale: 'ar' | 'en' = 'ar'
): string {
  if (!publishedAt) return '';

  try {
    const date = new Date(publishedAt);
    if (isNaN(date.getTime())) return '';

    const formatter = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-US', {
      timeZone: RIYADH_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    return formatter.format(date);
  } catch {
    return '';
  }
}

/**
 * Format date only in Gregorian calendar with Western numerals (e.g., "15 يناير 2025")
 */
export function formatDateOnly(
  publishedAt: string | Date | null | undefined,
  locale: 'ar' | 'en' = 'ar'
): string {
  if (!publishedAt) return '';

  try {
    const date = new Date(publishedAt);
    if (isNaN(date.getTime())) return '';

    const formatter = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-US', {
      timeZone: RIYADH_TIMEZONE,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    return formatter.format(date);
  } catch {
    return '';
  }
}
