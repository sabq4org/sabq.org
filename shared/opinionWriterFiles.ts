// ثوابت ودوال خالصة لملفات كتّاب الرأي (PDF) — بدون اعتماد على قاعدة البيانات.

export const MAX_OPINION_WRITER_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
const PDF_MAGIC = Buffer.from("%PDF-", "ascii");

/** التحقق من أن البايتات الأولى للملف تبدأ بتوقيع PDF الحقيقي (%PDF-). */
export function isValidPdfBuffer(buffer: Buffer): boolean {
  if (!Buffer.isBuffer(buffer) || buffer.length < PDF_MAGIC.length) return false;
  return buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC);
}

/** تكوين اسم ملف آمن للتحميل بامتداد .pdf مع صيغة ASCII احتياطية وUTF-8. */
export function buildPdfContentDisposition(title: string, fallbackId: string): string {
  const cleaned = title
    .replace(/[\r\n\0/\\:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  const utf8Name = `${cleaned || `file-${fallbackId}`}.pdf`;
  const asciiBase = cleaned
    .replace(/[^\x20-\x7E]+/g, "")
    .replace(/["\\;]+/g, "")
    .trim();
  const asciiName = `${asciiBase || `sabq-file-${fallbackId.slice(0, 8)}`}.pdf`;
  const encoded = encodeURIComponent(utf8Name);
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encoded}`;
}
