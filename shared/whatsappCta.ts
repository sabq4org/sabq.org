import { z } from "zod";

/** زر تواصل واتساب داخل المقال (محرّر → عرض عام). */
export const whatsappCtaSchema = z.object({
  enabled: z.boolean(),
  /** رقم بصيغة أرقام فقط مفضّلاً E.164 بدون + (مثال: 966501234567) */
  phone: z.string().min(8).max(20),
  /** نص الزر الظاهر للقارئ */
  phrase: z.string().min(1).max(120),
  /** رسالة افتراضية تُفتح في محادثة واتساب (اختياري) */
  message: z.string().max(500).optional(),
  /** نهاية المقال أو مضمّن في موضع المؤشر داخل النص */
  placement: z.enum(["end", "inline"]).default("end"),
});

export type WhatsAppCta = z.infer<typeof whatsappCtaSchema>;

/** يقبل null لمسح الحقل عند الحفظ. */
export const whatsappCtaFieldSchema = whatsappCtaSchema.nullable().optional();

/**
 * يطبّع رقم الجوال لرابط wa.me.
 * يدعم: 05xxxxxxxx (سعودي) · +9665… · 9665… · أرقام دولية أخرى.
 */
export function normalizeWhatsAppPhone(input: string): string | null {
  if (!input || typeof input !== "string") return null;
  let digits = input.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  // محلي سعودي: 05xxxxxxxx → 9665xxxxxxxx
  if (digits.length === 10 && digits.startsWith("0")) {
    digits = `966${digits.slice(1)}`;
  }
  // 5xxxxxxxx (9 أرقام) شائع في السعودية بدون صفر
  if (digits.length === 9 && digits.startsWith("5")) {
    digits = `966${digits}`;
  }
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

export function buildWhatsAppUrl(phone: string, message?: string): string | null {
  const digits = normalizeWhatsAppPhone(phone);
  if (!digits) return null;
  const base = `https://wa.me/${digits}`;
  const text = typeof message === "string" ? message.trim() : "";
  if (!text) return base;
  return `${base}?text=${encodeURIComponent(text)}`;
}

export function formatWhatsAppPhoneDisplay(phone: string): string {
  const digits = normalizeWhatsAppPhone(phone);
  if (!digits) return phone.trim();
  if (digits.startsWith("966") && digits.length === 12) {
    return `+966 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  }
  return `+${digits}`;
}
