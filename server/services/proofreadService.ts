/**
 * خدمة التدقيق اللغوي للمحرر (النص + العنوان) — عبر بوابة الذكاء الموحدة.
 *
 * لماذا البوابة بدل استدعاء OpenAI الخام؟ (تشخيص 2026-08-28)
 * كان مسارا /api/ai/proofread و /api/ai/proofread-title ينشئان `new OpenAI()` مباشرة:
 * مهلة SDK الافتراضية 10 دقائق × محاولتان داخليتان × 3 محاولات withRetry، وبلا أي
 * بديل عند تعثر gpt-5.1. في نافذة تدهور OpenAI (27 أغسطس، 3 ساعات) صار تدقيق
 * عنوان من 500 حرف يأخذ 45–68 ثانية بينما الخادم سليم تمامًا.
 * البوابة تعطينا: مهلة قصيرة صريحة، سلسلة بدائل (Haiku → Gemini Flash)، قاطع دائرة،
 * وتسجيلًا في ai_usage_logs حتى يظهر المسار في لوحة الاستخدام.
 */
import { aiGateway } from "../ai/gateway";

export const PROOFREAD_FEATURE_KEY = "proofread";

/** مهلة كل محاولة على نموذج واحد — التدقيق الطبيعي 1.5–3 ثوانٍ، فـ25ث سقف سخي. */
const PROOFREAD_TIMEOUT_MS = 25_000;
const MAX_CONTENT_CHARS = 8000;
const MAX_TITLE_CHARS = 500;
const MAX_ISSUES = 50;

export interface ProofreadIssue {
  original: string;
  suggestion: string;
  type?: string;
  explanation?: string;
}

export interface ProofreadTitleResult {
  original: string;
  suggestion: string;
  hasIssues: boolean;
  notes: Array<{ type?: string; explanation?: string }>;
}

const CONTENT_SYSTEM_PROMPT = `أنت مدقق إملائي صارم للنصوص العربية الصحفية. مهمتك الوحيدة هي اكتشاف الأخطاء الإملائية الحقيقية فقط.

✅ اقبل فقط هذه الأنواع من الأخطاء:
- حروف خاطئة (حذف/إضافة/قلب حرف يغيّر الكلمة فعلياً مثل: "اللذي" بدل "الذي").
- همزات خاطئة (مثل: "أبتدأ" بدل "ابتدأ"، "هؤلائ" بدل "هؤلاء").
- خلط بين التاء المربوطة (ة) والتاء المفتوحة (ت).
- خلط بين الألف المقصورة (ى) والياء (ي).
- خلط بين الهاء (ه) والتاء المربوطة (ة) في نهاية الكلمة.

❌ ارفض رفضاً قاطعاً (لا تُرجِعها أبداً كأخطاء):
- علامات التشكيل (فتحة، ضمة، كسرة، شدة، سكون، تنوين). إن كان الفرق الوحيد بين الكلمتين تشكيل، اعتبر الكلمة صحيحة.
- علامات الترقيم (الفواصل، النقاط، علامات الاستفهام، الأقواس، علامات التنصيص).
- المسافات الزائدة أو الناقصة.
- النحو والإعراب والقواعد الإنشائية.
- الأسلوب وإعادة الصياغة.
- أسماء الأعلام، الأماكن، الكلمات الأجنبية، الأسماء التجارية، الاختصارات.
- الكلمات الصحيحة لكنها غير شائعة.

قاعدة ذهبية: إن كان الفرق بين "original" و "suggestion" مجرد تشكيل أو علامة ترقيم أو مسافة، فلا تُرجِعها. إن لم تكن متأكداً 100% من الخطأ، اتركها.

أعد JSON بهذا الشكل بالضبط:
{ "issues": [ { "original": "الكلمة الخاطئة كما وردت في النص بدون تشكيل", "suggestion": "الكلمة الصحيحة بدون تشكيل", "type": "إملائي", "explanation": "سبب موجز جداً" } ] }

إن لم تجد أي خطأ إملائي حقيقي، أعد: { "issues": [] }`;

const TITLE_SYSTEM_PROMPT = `أنت مدقق لغوي محترف لعناوين الأخبار العربية. مهمتك تصحيح العنوان مع الحفاظ على معناه الأصلي تماماً.

✅ صحّح فقط:
- الأخطاء الإملائية (همزات، تاء مربوطة/مفتوحة، ألف مقصورة/ياء، حروف خاطئة).
- الأخطاء النحوية الواضحة (رفع/نصب/جر، تطابق المذكر والمؤنث، تطابق المفرد والجمع).
- علامات الترقيم الضرورية (إضافة فاصلة بين جملتين متعاطفتين، حذف نقطة من نهاية العنوان).
- المسافات الزائدة أو الناقصة.
- الأخطاء الأسلوبية الفجّة فقط (تكرار غير مبرر، ركاكة واضحة).

❌ لا تغيّر:
- معنى العنوان أو فكرته الأساسية.
- أسماء الأعلام، الأماكن، المؤسسات، الكلمات الأجنبية، الأسماء التجارية.
- الأرقام والإحصائيات.
- علامات التشكيل (لا تُضِف ولا تحذف).
- ترتيب الكلمات إلا إذا كان النحو خاطئاً.

أعد JSON بهذا الشكل بالضبط:
{ "suggestion": "العنوان بعد التصحيح", "hasIssues": true/false, "notes": [ { "type": "إملائي|نحوي|ترقيم|أسلوبي", "explanation": "وصف موجز للتصحيح" } ] }

إن كان العنوان سليماً تماماً، أعد suggestion مطابقاً للأصل وhasIssues=false وnotes=[].`;

/** إزالة التشكيل والتطويل وعلامات الاتجاه الخفية وتوحيد المسافات. */
export function normalizeArabic(t: string): string {
  return t
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "") // تشكيل + تطويل
    .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, "") // zero-width / bidi
    .replace(/\s+/g, " ")
    .trim();
}

/** مثل normalizeArabic مع إسقاط علامات الترقيم الشائعة (لفرز اقتراحات النص). */
function normalizeForIssue(t: string): string {
  return normalizeArabic(t.replace(/[.,،;؛:!؟?\(\)\[\]"'«»“”]/g, ""));
}

export function stripHtmlToText(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    // بعض النماذج تغلّف JSON بأسوار كود رغم jsonMode — نزيلها قبل التحليل.
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

/**
 * ترشيح اقتراحات النموذج: إسقاط الفروق التافهة (تشكيل/ترقيم/مسافات فقط)، والاقتراحات
 * التي لا يوجد أصلها في النص، والمكررات. منطق مشترك بين الويب والموبايل.
 */
export function filterProofreadIssues(issues: unknown, cleanText: string): ProofreadIssue[] {
  const list = Array.isArray(issues) ? (issues as ProofreadIssue[]) : [];
  const seen = new Set<string>();
  return list
    .filter((i) => i && typeof i.original === "string" && typeof i.suggestion === "string")
    .filter((i) => i.original.trim() !== i.suggestion.trim())
    .filter((i) => normalizeForIssue(i.original) !== normalizeForIssue(i.suggestion))
    .filter((i) => normalizeForIssue(i.original).length >= 2)
    .filter((i) => cleanText.includes(i.original))
    .filter((i) => {
      const key = `${i.original}→${i.suggestion}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_ISSUES);
}

export async function proofreadContent(content: string, userId?: string): Promise<{ issues: ProofreadIssue[] }> {
  const cleanText = stripHtmlToText(content);
  if (cleanText.length < 10) return { issues: [] };
  const truncated = cleanText.length > MAX_CONTENT_CHARS ? cleanText.substring(0, MAX_CONTENT_CHARS) : cleanText;

  const response = await aiGateway.complete({
    feature: PROOFREAD_FEATURE_KEY,
    userId,
    timeoutMs: PROOFREAD_TIMEOUT_MS,
    messages: [
      { role: "system", content: CONTENT_SYSTEM_PROMPT },
      { role: "user", content: `دقّق هذا النص إملائياً فقط دون تعديل المعنى:\n\n${truncated}` },
    ],
    options: { jsonMode: true, maxTokens: 2048 },
  });

  const parsed = safeJsonParse<{ issues?: unknown }>(response.content || "", { issues: [] });
  return { issues: filterProofreadIssues(parsed.issues, cleanText) };
}

export async function proofreadTitle(title: string, userId?: string): Promise<ProofreadTitleResult> {
  const cleanTitle = title.replace(/\s+/g, " ").trim();
  if (cleanTitle.length < 3) {
    return { original: cleanTitle, suggestion: cleanTitle, hasIssues: false, notes: [] };
  }
  const truncated = cleanTitle.length > MAX_TITLE_CHARS ? cleanTitle.substring(0, MAX_TITLE_CHARS) : cleanTitle;

  const response = await aiGateway.complete({
    feature: PROOFREAD_FEATURE_KEY,
    userId,
    timeoutMs: PROOFREAD_TIMEOUT_MS,
    messages: [
      { role: "system", content: TITLE_SYSTEM_PROMPT },
      { role: "user", content: `دقّق هذا العنوان لغوياً:\n\n${truncated}` },
    ],
    options: { jsonMode: true, maxTokens: 1024 },
  });

  const parsed = safeJsonParse<{ suggestion?: unknown; hasIssues?: unknown; notes?: unknown }>(
    response.content || "",
    {},
  );
  const suggestion = (typeof parsed.suggestion === "string" ? parsed.suggestion : cleanTitle).trim();
  const isSame = suggestion.length === 0 || normalizeArabic(suggestion) === normalizeArabic(cleanTitle);
  const notes = Array.isArray(parsed.notes)
    ? (parsed.notes as Array<{ type?: string; explanation?: string }>)
        .filter((n) => n && typeof n.explanation === "string")
        .slice(0, 10)
    : [];

  return {
    original: cleanTitle,
    suggestion: isSame ? cleanTitle : suggestion,
    hasIssues: !isSame,
    notes: isSame ? [] : notes,
  };
}

/** ترجمة خطأ البوابة إلى حالة HTTP ورسالة عربية موحدة لمساري الويب والموبايل. */
export function proofreadErrorResponse(error: unknown): { status: number; message: string } {
  const code = (error as { code?: string } | null)?.code;
  const httpStatus = (error as { status?: number } | null)?.status;
  const msg = String((error as { message?: string } | null)?.message || "");
  if (code === "RATE_LIMITED" || code === "QUOTA_EXCEEDED" || httpStatus === 429 || msg.includes("429")) {
    return { status: 429, message: "تم تجاوز حد الطلبات، يرجى المحاولة بعد قليل" };
  }
  if (code === "TIMEOUT" || code === "NO_MODEL_AVAILABLE") {
    return { status: 504, message: "خدمة التدقيق بطيئة حالياً، يرجى المحاولة بعد لحظات" };
  }
  return { status: 500, message: "تعذّر التدقيق اللغوي" };
}
