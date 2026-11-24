// «قبل الإرسال» في محرر كاتب الرأي (المرحلة 4): قائمة إرشادية تبيّن ما ينقص
// المقال قبل إرساله للمراجعة. منطق خالص بلا React حتى يُختبر وحده.
// القائمة إرشادية: لا تمنع الإرسال بنفسها؛ المنع الحقيقي (اليوم الأسبوعي، مقال
// قيد المراجعة) يبقى في المحرر والخادم كما هو.

/** طول العنوان الذي يظهر كاملًا في بطاقة التطبيق دون قص. */
export const WRITER_TITLE_APP_LIMIT = 90;
/** أقل عدد كلمات نقترحه لمقال رأي مكتمل. */
export const WRITER_SUGGESTED_MIN_WORDS = 300;
/** سرعة القراءة المستخدمة في المحرر (كلمة في الدقيقة). */
export const WRITER_READING_WPM = 200;

export type WriterReadinessId = "title" | "image" | "text" | "slot";

export type WriterReadinessItem = {
  id: WriterReadinessId;
  label: string;
  detail: string;
  ok: boolean;
  /** بند يمنع الإرسال فعلًا (اليوم الأسبوعي). البقية إرشاد. */
  blocking: boolean;
  /** فعل اختياري يظهر رابطًا بجانب البند. */
  action?: "pick-day";
};

export type WriterReadinessInput = {
  title: string;
  hasImage: boolean;
  words: number;
  /** الكاتب لم يحدد يومه الأسبوعي بعد ويستطيع اختياره بنفسه. */
  slotMissing: boolean;
  /** نص اليوم المحدد إن وجد، مثل «الثلاثاء 9:00 ص». */
  slotLabel?: string | null;
};

const WEEKDAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] as const;

export function readingMinutes(words: number): number {
  return words > 0 ? Math.max(1, Math.ceil(words / WRITER_READING_WPM)) : 0;
}

/** «الثلاثاء 9:00 ص» من رقم اليوم ووقت HH:MM (بتوقيت الرياض كما يخزّنه الخادم). */
export function formatWriterSlot(weekday: number | null | undefined, publishTime: string | null | undefined): string | null {
  if (weekday == null || weekday < 0 || weekday > 6) return null;
  const day = WEEKDAYS_AR[weekday];
  const match = /^(\d{1,2}):(\d{2})/.exec(publishTime ?? "");
  if (!match) return day;
  const h24 = Number(match[1]);
  const suffix = h24 < 12 ? "ص" : "م";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${day} ${h12}:${match[2]} ${suffix}`;
}

export function buildWriterReadiness(input: WriterReadinessInput): WriterReadinessItem[] {
  const titleLength = input.title.trim().length;
  const titleItem: WriterReadinessItem =
    titleLength === 0
      ? { id: "title", label: "العنوان", detail: "اكتب عنوانًا لمقالك", ok: false, blocking: false }
      : titleLength > WRITER_TITLE_APP_LIMIT
        ? {
            id: "title",
            label: "العنوان",
            detail: `${titleLength} حرفًا، قد يُقص في التطبيق (الأنسب ${WRITER_TITLE_APP_LIMIT} أو أقل)`,
            ok: false,
            blocking: false,
          }
        : { id: "title", label: "العنوان", detail: `${titleLength} حرفًا، يظهر كاملًا في التطبيق`, ok: true, blocking: false };

  const imageItem: WriterReadinessItem = input.hasImage
    ? { id: "image", label: "صورة المقال", detail: "مرفوعة", ok: true, blocking: false }
    : { id: "image", label: "صورة المقال", detail: "اختيارية، وتساعد المقال على الظهور", ok: false, blocking: false };

  const minutes = readingMinutes(input.words);
  const textItem: WriterReadinessItem =
    input.words >= WRITER_SUGGESTED_MIN_WORDS
      ? { id: "text", label: "النص", detail: `${input.words} كلمة، ${minutes} د قراءة`, ok: true, blocking: false }
      : {
          id: "text",
          label: "النص",
          detail:
            input.words === 0
              ? `ابدأ الكتابة (نقترح ${WRITER_SUGGESTED_MIN_WORDS} كلمة على الأقل)`
              : `${input.words} كلمة، نقترح ${WRITER_SUGGESTED_MIN_WORDS} على الأقل`,
          ok: false,
          blocking: false,
        };

  const slotItem: WriterReadinessItem = input.slotMissing
    ? { id: "slot", label: "يومك الأسبوعي", detail: "مطلوب قبل الإرسال", ok: false, blocking: true, action: "pick-day" }
    : {
        id: "slot",
        label: "يومك الأسبوعي",
        detail: input.slotLabel ? input.slotLabel : "محدد",
        ok: true,
        blocking: false,
      };

  return [titleItem, imageItem, textItem, slotItem];
}

export function summarizeWriterReadiness(items: WriterReadinessItem[]): {
  done: number;
  total: number;
  /** أول بند ناقص: المانع أولًا ثم الإرشادي. */
  firstMissing: WriterReadinessItem | null;
} {
  const done = items.filter((item) => item.ok).length;
  const missing = items.filter((item) => !item.ok);
  const firstMissing = missing.find((item) => item.blocking) ?? missing[0] ?? null;
  return { done, total: items.length, firstMissing };
}

/**
 * يستخرج من ملاحظة المحرر مقطعًا مقتبسًا بين «» أو "" يوجد حرفيًا في نص المقال،
 * ليُظهر المحرر للكاتب الفقرة المقصودة. يعيد أطول مقطع مطابق (8 أحرف فأكثر).
 */
export function findQuotedPassage(notes: string | null | undefined, plainText: string): string | null {
  if (!notes || !plainText) return null;
  const haystack = normalizeForMatch(plainText);
  const candidates: string[] = [];
  const pattern = /«([^»]{8,400})»|"([^"]{8,400})"|“([^”]{8,400})”/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(notes)) !== null) {
    const quote = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (quote.length >= 8 && haystack.includes(normalizeForMatch(quote))) candidates.push(quote);
  }
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.length - a.length)[0];
}

export function normalizeForMatch(text: string): string {
  return text
    .replace(/[ً-ْـ]/g, "") // تشكيل وتطويل
    .replace(/\s+/g, " ")
    .trim();
}
