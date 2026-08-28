/**
 * «تحرير وتوليد شامل» — منطق مشترك بين المسار العادي (JSON) والمسار المبثوث (SSE).
 *
 * ثلاثة فروع متوازية على النص الأصلي نفسه: إعادة الصياغة بأسلوب سبق (الأبطأ،
 * 20–35ث لمقال كامل)، المحتوى الذكي (عنوان فرعي/موجز/كلمات/SEO)، وعنوان النشرة.
 * المسار المبثوث يستقبل عبر onEvent: تقدم كل فرع + نص إعادة الصياغة حرفًا بحرف
 * (تشخيص 2026-08-28: الزمن طبيعي لكن الشاشة كانت جامدة طوال العملية).
 */
import { storage } from "../storage";
import { generateSmartContent, withRetry } from "../openai";
import { generateNewsletterSubtitle } from "./smartCategoryClassifier";
import { analyzeAndEditWithSabqStyle } from "../ai/contentAnalyzer";

export type EditAndGeneratePhase = "edit" | "smart" | "newsletter";

export type EditAndGenerateEvent =
  | { type: "phase"; phase: EditAndGeneratePhase; status: "done" | "failed"; ms: number }
  | { type: "delta"; text: string }
  | { type: "reset" };

export interface EditAndGeneratePayload {
  editedContent: string;
  editedLead: string;
  qualityScore: number;
  detectedCategory: string;
  hasNewsValue: boolean;
  issues: string[];
  suggestions: string[];
  mainTitle: string;
  subTitle: string;
  smartSummary: string;
  keywords: string[];
  seo: { metaTitle: string; metaDescription: string };
  newsletterSubtitle?: string;
  newsletterExcerpt?: string;
}

export async function runEditAndGenerate(input: {
  content: string;
  language?: "ar" | "en" | "ur";
  onEvent?: (event: EditAndGenerateEvent) => void;
}): Promise<EditAndGeneratePayload> {
  const { content, onEvent } = input;
  const language = input.language ?? "ar";
  const emit = (event: EditAndGenerateEvent) => {
    try {
      onEvent?.(event);
    } catch (err) {
      console.warn("[Edit+Generate] onEvent threw:", (err as Error)?.message);
    }
  };

  const allCategories = await storage.getAllCategories();
  const categoryList = allCategories.map((c) => ({ nameAr: c.nameAr, nameEn: c.nameEn || c.nameAr }));

  // إسناد الزمن لكل فرع: تشخيص 36071ms (2026-07-27) توقف عند «أبطأ الفروع
  // الثلاثة» لغياب هذا القياس. يطبع مدة كل فرع عند اكتماله (نجاحًا أو فشلًا).
  const branchStart = Date.now();
  const timed = <T>(phase: EditAndGeneratePhase, label: string, p: Promise<T>): Promise<T> =>
    p.then(
      (v) => {
        const ms = Date.now() - branchStart;
        console.log(`[Edit+Generate API] ${label} finished in ${ms}ms`);
        emit({ type: "phase", phase, status: "done", ms });
        return v;
      },
      (err) => {
        const ms = Date.now() - branchStart;
        console.log(`[Edit+Generate API] ${label} finished in ${ms}ms`);
        emit({ type: "phase", phase, status: "failed", ms });
        throw err;
      },
    );

  console.log("[Edit+Generate API] Running smart content + Sabq edit + newsletter in parallel...");
  const [generatedContent, editResult, newsletterResult] = await Promise.all([
    timed("smart", "SmartContent", withRetry(() => generateSmartContent(content, language === "en" ? "en" : "ar"), 3, "SmartContent")),
    timed(
      "edit",
      "EditContent",
      withRetry(
        () =>
          analyzeAndEditWithSabqStyle(content, language, categoryList, {
            onProgress: (ev) => emit(ev.type === "delta" ? { type: "delta", text: ev.text } : { type: "reset" }),
          }),
        3,
        "EditContent",
      ),
    ),
    timed(
      "newsletter",
      "Newsletter",
      withRetry(
        () => generateNewsletterSubtitle({ title: content.substring(0, 200), content, excerpt: undefined }),
        3,
        "Newsletter",
      ),
    ).catch((err): { subtitle: string | undefined; excerpt: string | undefined } => {
      // عنوان النشرة اختياري: فشله لا يُفشل الطلب
      console.warn("[Edit+Generate API] Newsletter generation failed (optional):", err);
      return { subtitle: undefined, excerpt: undefined };
    }),
  ]);

  console.log("[Edit+Generate API] ✅ All operations completed");
  console.log("[Edit+Generate API] Quality score:", editResult.qualityScore);
  console.log("[Edit+Generate API] Title (Claude→GPT fallback):", editResult.optimized.title || generatedContent.mainTitle);
  console.log("[Edit+Generate API] Newsletter subtitle:", newsletterResult?.subtitle || "N/A");

  return {
    editedContent: editResult.optimized.content,
    editedLead: editResult.optimized.lead,
    qualityScore: editResult.qualityScore,
    detectedCategory: editResult.detectedCategory,
    hasNewsValue: editResult.hasNewsValue,
    issues: editResult.issues,
    suggestions: editResult.suggestions,
    // العنوان من محرر الأسلوب المعتمد (Claude) — وعنوان GPT احتياطاً عند فشله
    mainTitle: editResult.optimized.title || generatedContent.mainTitle,
    subTitle: generatedContent.subTitle,
    smartSummary: generatedContent.smartSummary,
    keywords: generatedContent.keywords,
    seo: generatedContent.seo,
    newsletterSubtitle: newsletterResult.subtitle,
    newsletterExcerpt: newsletterResult.excerpt,
  };
}

/** ترجمة الخطأ إلى حالة HTTP ورسالة موحدة (مشتركة بين المسارين). */
export function editAndGenerateErrorResponse(error: unknown): {
  status: number;
  message: string;
  errorType: "rate_limit" | "timeout" | "network" | "unknown";
} {
  const e = (error ?? {}) as { status?: number; message?: string; code?: string };
  const msg = e.message || "";
  const isRateLimit = e.status === 429 || msg.includes("429") || /rate limit/i.test(msg);
  const isTimeout = /timeout/i.test(msg) || e.code === "ETIMEDOUT";
  const isNetwork = e.code === "ECONNREFUSED" || e.code === "ENOTFOUND";
  if (isRateLimit) return { status: 429, message: "تم تجاوز حد الطلبات، يرجى المحاولة بعد دقيقة", errorType: "rate_limit" };
  if (isTimeout) return { status: 504, message: "انتهت مهلة الاتصال، يرجى المحاولة مرة أخرى", errorType: "timeout" };
  if (isNetwork) return { status: 503, message: "خطأ في الاتصال بخدمة الذكاء الاصطناعي", errorType: "network" };
  return { status: 500, message: "فشل في تحرير وتوليد المحتوى", errorType: "unknown" };
}
