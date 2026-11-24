// تصنيف ملفات الكتّاب وشارة «جديد» — آمن للمتصفح (بلا Buffer).

export type WriterFileKind = "minutes" | "circular" | "document";
export const WRITER_FILE_KIND_LABEL: Record<WriterFileKind, string> = {
  minutes: "محضر",
  circular: "تعميم",
  document: "مستند",
};
export const WRITER_FILE_NEW_DAYS = 14;

/** التصنيف من العنوان: «محضر» أو «تعميم»، وما عداهما مستند. */
export function inferWriterFileKind(title: string): WriterFileKind {
  const t = title.replace(/[ً-ْ]/g, "");
  if (/محضر|محاضر/.test(t)) return "minutes";
  if (/تعميم|تعاميم/.test(t)) return "circular";
  return "document";
}

/** جديد = رُفع خلال 14 يومًا ولم يفتحه هذا الكاتب بعد. */
export function isWriterFileNew(createdAt: string, opened: boolean, now: number = Date.now()): boolean {
  if (opened) return false;
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return false;
  return now - t <= WRITER_FILE_NEW_DAYS * 24 * 60 * 60 * 1000;
}
