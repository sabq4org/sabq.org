/** تصنيف المواعيد في لوحة «مواعيدك». منطق صافٍ حتى يُختبر بلا واجهة. */

import { daysPhrase, diffIsoDays } from "./dates";

type BucketRow = {
  startsOn: string;
  endsOn: string | null;
  status: string;
  certainty: string;
  published: boolean;
};

export type DashboardBucket = "attention" | "upcoming" | "past";

function lastDay(row: BucketRow): string {
  return row.endsOn && row.endsOn > row.startsOn ? row.endsOn : row.startsOn;
}

export function isPublicOccurrence(row: BucketRow): boolean {
  return row.published && row.status === "scheduled" && row.certainty !== "unverified";
}

/**
 * عدد الأيام منذ مرور موعد مجدول غير ظاهر للجمهور، أو null.
 * الملغى والمستبدل لا يُعدّان متأخرين.
 */
export function overdueDays(row: BucketRow, today: string): number | null {
  if (row.status !== "scheduled" || isPublicOccurrence(row)) return null;
  const days = diffIsoDays(lastDay(row), today);
  return days > 0 ? days : null;
}

/** المتأخر يبقى في «تحتاج إجراء» حتى يُحسم، ولا يدخل «المنتهية». */
export function dashboardBucket(row: BucketRow, today: string): DashboardBucket {
  // الملغى والمستبدل محسومان: بعد أن يبدأ موعدهما لا يبقيان في «تحتاج إجراء» ولو امتد مداهما.
  if (row.status !== "scheduled" && row.startsOn < today) return "past";
  if (lastDay(row) >= today) return isPublicOccurrence(row) ? "upcoming" : "attention";
  return overdueDays(row, today) !== null ? "attention" : "past";
}

export function overdueLabel(days: number): string {
  return `متأخر ${daysPhrase(days, "اليوم").replace(/^بعد /, "")}`;
}
