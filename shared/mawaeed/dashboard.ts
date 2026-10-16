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

/** زر «تأكيد» لا يُعيد نشر موعد ملغى أو مستبدل؛ يُعاد إلى «مجدول» من التعديل أولاً. */
export function confirmBlockedReason(row: Pick<BucketRow, "status">): string | null {
  if (row.status === "cancelled") return "الموعد ملغى. أعده إلى «مجدول» من التعديل قبل تأكيده.";
  if (row.status === "superseded") return "الموعد مستبدل بآخر. أعده إلى «مجدول» من التعديل قبل تأكيده.";
  return null;
}

/** تعارض كتابة: الصف تغيّر منذ فتحه المحرر. ختم فارغ من العميل = لا فحص (عملاء أقدم). */
export function isStaleWrite(expectedUpdatedAt: string | null | undefined, currentUpdatedAt: string | null | undefined): boolean {
  if (!expectedUpdatedAt || !currentUpdatedAt) return false;
  const expected = Date.parse(expectedUpdatedAt);
  const current = Date.parse(currentUpdatedAt);
  if (!Number.isFinite(expected) || !Number.isFinite(current)) return false;
  return expected !== current;
}

export const STALE_WRITE_MESSAGE = "عدّل زميل هذا الموعد بعد أن فتحته. أعد تحميل الصفحة ثم كرّر تعديلك.";

/** أسماء الحقول للمحرر عند رفض الإدخال (400). */
export const OCCURRENCE_FIELD_LABELS: Record<string, string> = {
  seriesId: "القسم",
  titleAr: "العنوان",
  startsOn: "تاريخ البداية",
  endsOn: "تاريخ النهاية",
  sourceUrl: "رابط المصدر",
  sourceTitle: "اسم المصدر",
  certainty: "درجة التأكد",
  status: "الحالة",
  published: "النشر",
  regionGroup: "المنطقة",
  hijriLabel: "التاريخ الهجري",
  publicNote: "ملاحظة القارئ",
  ruleNote: "الملاحظة الداخلية",
  expectedUpdatedAt: "ختم التعديل",
};

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
