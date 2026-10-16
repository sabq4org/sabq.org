/**
 * ملاحظات القارئ المشتقة. تُبنى من الحقول العامة وحدها (العنوان والتاريخ والنوع)،
 * ولا تقرأ الملاحظة الداخلية rule_note بأي حال.
 */

import { hijriParts } from "./dates";
import type { SeriesKind } from "./model";

export const VISION_NOTE = "موعد العيد يثبت بالرؤية، وقد تقدّم الجهة الصرف أو تؤخره عن هذا اليوم.";
/** الإجازة المدرسية لا «صرف» فيها: الملاحظة تتكلم عن بداية الإجازة. */
export const SCHOOL_VISION_NOTE = "موعد العيد يثبت بالرؤية، وقد تتقدّم بداية الإجازة أو تتأخر عن هذا اليوم.";

/** رمضان حتى 5 شوال، و25 ذي القعدة حتى 15 ذي الحجة: نافذة العيدين التي قد يُقدَّم فيها الصرف. */
function inEidWindow(startsOn: string): boolean {
  const { month, day } = hijriParts(startsOn);
  if (month === 9) return true;
  if (month === 10) return day <= 5;
  if (month === 11) return day >= 25;
  if (month === 12) return day <= 15;
  return false;
}

export function visionNote(kind: SeriesKind, title: string, startsOn: string): string | null {
  if (/عيد الفطر|عيد الأضحى|رمضان/.test(title)) return kind === "school_holiday" ? SCHOOL_VISION_NOTE : VISION_NOTE;
  if (kind !== "school_holiday" && /^\d{4}-\d{2}-\d{2}$/.test(startsOn) && inEidWindow(startsOn)) return VISION_NOTE;
  return null;
}
