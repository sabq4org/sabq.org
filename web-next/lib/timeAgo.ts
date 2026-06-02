/**
 * Lightweight Arabic relative-time formatter for the SSR surfaces. Mirrors the
 * "منذ ..." labels the SPA renders via date-fns/arSA, without pulling date-fns
 * into the Next bundle. Server-rendered, so it reflects build/revalidate time.
 */
export function timeAgoAr(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));

  const min = Math.floor(diffSec / 60);
  const hr = Math.floor(diffSec / 3600);
  const day = Math.floor(diffSec / 86400);

  if (diffSec < 60) return "الآن";
  if (min < 60) return min === 1 ? "منذ دقيقة" : min === 2 ? "منذ دقيقتين" : min <= 10 ? `منذ ${min} دقائق` : `منذ ${min} دقيقة`;
  if (hr < 24) return hr === 1 ? "منذ ساعة" : hr === 2 ? "منذ ساعتين" : hr <= 10 ? `منذ ${hr} ساعات` : `منذ ${hr} ساعة`;
  if (day < 30) return day === 1 ? "منذ يوم" : day === 2 ? "منذ يومين" : day <= 10 ? `منذ ${day} أيام` : `منذ ${day} يوماً`;

  const month = Math.floor(day / 30);
  if (month < 12) return month === 1 ? "منذ شهر" : month === 2 ? "منذ شهرين" : month <= 10 ? `منذ ${month} أشهر` : `منذ ${month} شهراً`;

  const year = Math.floor(day / 365);
  return year === 1 ? "منذ سنة" : year === 2 ? "منذ سنتين" : `منذ ${year} سنوات`;
}

/** New if published within the last 30 minutes (mirrors NewsArticleCard). */
export function isNewArticle(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return false;
  return (Date.now() - then) / 60000 <= 30;
}
