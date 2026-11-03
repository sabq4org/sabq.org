// معرّفات نموذج Gemini Flash في مكان واحد.
//
// gemini-2.5-flash مُعلن إيقافه: ابتداءً من 1 ديسمبر 2026 تُحوَّل طلباته تلقائيًا
// إلى gemini-3.5-flash-lite (فئة أدنى وبتسعيرها). المصدر:
//   https://ai.google.dev/gemini-api/docs/deprecations#gemini-2.5-flash-models
// البديل في نفس الفئة (Flash، مستقر، بلا موعد إيقاف): gemini-3.8-flash.
//
// يمكن تجاوز القيم عبر متغيرات البيئة دون تعديل الكود:
//   GEMINI_FLASH_MODEL           — النموذج الأساسي
//   GEMINI_FLASH_FALLBACK_MODEL  — نموذج احتياطي يُجرَّب مرة واحدة عند فشل الأساسي
// الاحتياطي الافتراضي gemini-2.5-flash-lite: غير مُعلن إيقافه، ويقبل نفس
// المعاملات القديمة (temperature/thinkingBudget) فيبقى صالحًا لو رفض جيل 3.x معاملًا ما.

import { ThinkingLevel, type ThinkingConfig } from "@google/genai";

export const DEFAULT_GEMINI_FLASH_MODEL = "gemini-3.8-flash";
export const DEFAULT_GEMINI_FLASH_FALLBACK_MODEL = "gemini-2.5-flash-lite";

export const GEMINI_FLASH_MODEL: string =
  process.env.GEMINI_FLASH_MODEL?.trim() || DEFAULT_GEMINI_FLASH_MODEL;

export const GEMINI_FLASH_FALLBACK_MODEL: string =
  process.env.GEMINI_FLASH_FALLBACK_MODEL?.trim() || DEFAULT_GEMINI_FLASH_FALLBACK_MODEL;

/** نماذج 2.5 تستخدم thinkingBudget؛ جيل 3.x يستخدم thinkingLevel (ولا يدعم minimal على 3.8 Flash). */
export function isLegacyThinkingModel(model: string): boolean {
  return model.startsWith("gemini-2.5");
}

/**
 * أقل قدر من التفكير لنموذج معيّن (يعادل `thinkingBudget: 0` القديم).
 */
export function minimalThinkingConfig(model: string): ThinkingConfig {
  return isLegacyThinkingModel(model) ? { thinkingBudget: 0 } : { thinkingLevel: ThinkingLevel.LOW };
}

/**
 * ينفّذ `call` بالنموذج الأساسي، وإن رمى خطأً يعيد المحاولة مرة واحدة بالنموذج الاحتياطي.
 * يُرجع النتيجة مع اسم النموذج الذي نجح فعليًا.
 */
export async function withGeminiFlashFallback<T>(
  label: string,
  call: (model: string) => Promise<T>,
  models: { primary?: string; fallback?: string } = {},
): Promise<{ result: T; model: string }> {
  const primary = models.primary ?? GEMINI_FLASH_MODEL;
  const fallback = models.fallback ?? GEMINI_FLASH_FALLBACK_MODEL;
  try {
    return { result: await call(primary), model: primary };
  } catch (primaryError) {
    if (!fallback || fallback === primary) throw primaryError;
    const msg = primaryError instanceof Error ? primaryError.message : String(primaryError);
    console.warn(`[Gemini] ${label}: ${primary} failed (${msg.slice(0, 200)}) — retrying once with ${fallback}`);
    return { result: await call(fallback), model: fallback };
  }
}
