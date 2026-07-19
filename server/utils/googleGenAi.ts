// Wrapper مركزي لإنشاء عملاء GoogleGenAI مع كتم تحذير المفاتيح المزدوجة.
//
// المشكلة: dependency `@google/genai` يطبع عند إنشاء العميل:
//   console.warn('Both GOOGLE_API_KEY and GEMINI_API_KEY are set. Using GOOGLE_API_KEY.')
// في كل مرة يُستدعى فيها `new GoogleGenAI({...})`. عندنا 7 مواقع تنشئ
// العميل عند الإقلاع، فتظهر الرسالة 5 مرات في سجل الإنتاج مُصنّفة كـ error
// (لأن الـ log collector الخارجي يصنّف أي مخرج على stderr كـ error).
//
// هذا التحذير بلا معنى في حالتنا: نمرر `apiKey` صراحةً في كل المواقع، فلا
// يعتمد الـ SDK على متغيرات البيئة أصلاً. الواجهة أدناه تكتم الرسالة المعيّنة
// فقط (لا كتم `console.warn` عام) ثم ترجع العميل كسلوكه الطبيعي تمامًا.

import { GoogleGenAI, type GoogleGenAIOptions } from "@google/genai";

// النص الحرفي للتحذير كما يُطبع من `@google/genai`. نطابقه جزئيًا لاستيعاب
// أي تفاوت بسيط في الصياغة بين إصدارات الحزمة.
const DUAL_KEY_WARNING = /Both GOOGLE_API_KEY and GEMINI_API_KEY are set/i;

/**
 * ينشئ `GoogleGenAI` مع كتم تحذير تضارب المفاتيح المزدوجة فقط.
 * السلوك الكامل للمكتبة محفوظ — فقط الرسالة المعيّنة تُسكَت.
 *
 * الاستخدام (بديل مباشر لـ `new GoogleGenAI(options)`):
 *   const ai = createGoogleGenAI({ apiKey });
 */
export function createGoogleGenAI(options: GoogleGenAIOptions): GoogleGenAI {
  const originalWarn = console.warn;
  // لا نستخدم arrow function كي نحافظ على `this` الأصلي لـ console.
  console.warn = function suppressedDualKeyWarn(...args: unknown[]): void {
    const text = args.length === 1 && typeof args[0] === "string"
      ? args[0]
      : args.map((a) => (typeof a === "string" ? a : "")).join(" ");
    if (DUAL_KEY_WARNING.test(text)) return; // اكتم الرسالة المعيّنة فقط
    return (originalWarn as (...a: unknown[]) => void).apply(console, args as unknown[]);
  };
  try {
    return new GoogleGenAI(options);
  } finally {
    // أعد `console.warn` فور انتهاء الإنشاء — لا نكتم أي رسائل لاحقة.
    console.warn = originalWarn;
  }
}

// إعادة تصدير الأنواع/الكلاس الشائعة لراحة الاستيراد من مكان واحد.
export { GoogleGenAI, Modality } from "@google/genai";
export type { GoogleGenAIOptions } from "@google/genai";
