// نصوص تنبيه «مقال رأي جديد» (الويب وتطبيق الديسك وبريد البوت) — دوال نقية بلا قاعدة بيانات.

const ARABIC_WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] as const;
const ARABIC_MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
] as const;

/** الرياض UTC+3 دائماً (بلا توقيت صيفي). */
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

export const OPINION_DRAFT_NO_SLOT_LINE = "بلا موعد ثابت";

/** «الخميس 30 أكتوبر 09:00 (الرياض)» بأرقام لاتينية. */
export function formatOpinionSlotRiyadh(date: Date): string {
  const shifted = new Date(date.getTime() + RIYADH_OFFSET_MS);
  const weekday = ARABIC_WEEKDAYS[shifted.getUTCDay()];
  const day = shifted.getUTCDate();
  const month = ARABIC_MONTHS[shifted.getUTCMonth()];
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${weekday} ${day} ${month} ${hh}:${mm} (الرياض)`;
}

/** «موعده الثابت: …» أو «بلا موعد ثابت». يقبل ISO أو Date أو null. */
export function buildOpinionDraftSlotLine(nextSlot: string | Date | null | undefined): string {
  if (!nextSlot) return OPINION_DRAFT_NO_SLOT_LINE;
  const date = nextSlot instanceof Date ? nextSlot : new Date(nextSlot);
  if (Number.isNaN(date.getTime())) return OPINION_DRAFT_NO_SLOT_LINE;
  return `موعده الثابت: ${formatOpinionSlotRiyadh(date)}`;
}

export function buildOpinionDraftNotice(input: {
  authorName: string | null | undefined;
  articleTitle: string | null | undefined;
  nextSlot: string | Date | null | undefined;
}): { title: string; body: string; slotLine: string } {
  const authorName = input.authorName?.trim() || "كاتب رأي";
  const articleTitle = (input.articleTitle || "").replace(/\s+/g, " ").trim() || "مقال رأي";
  const slotLine = buildOpinionDraftSlotLine(input.nextSlot);
  return {
    title: `مقال رأي جديد: ${authorName}`,
    body: `«${articleTitle}» — ${slotLine}`,
    slotLine,
  };
}
