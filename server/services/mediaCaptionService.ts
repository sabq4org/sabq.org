import { analyzeImage } from "./visualAiService";
import { aiManager, AI_MODELS } from "../ai-manager";

export interface SmartCaptionResult {
  /** Concise factual alt text (accessibility + SEO) — named, no filler. */
  altText: string;
  /** Journalistic news caption shown under the image — named, contextual. */
  caption: string;
  keywords: string[];
  relevanceScore: number | null;
  qualityScore: number | null;
  contentWarnings: string[];
  hasSensitiveContent: boolean;
}

/** Pull the first {...} JSON object out of a model response (handles code fences). */
function extractJson(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { /* fall through */ }
    }
    return null;
  }
}

/**
 * "صورة جاهزة للخبر": analyze the image (vision) for relevance/quality/warnings,
 * then refine into a proper Arabic NEWS caption + concise alt text that USE the
 * article's named entities. The raw vision description is too literal for a
 * published caption ("رجل في منتصف العمر يرتدي قميصاً رمادياً...") — so we feed it
 * to a text model together with the article context to produce journalistic copy.
 * Always falls back to the vision alt text if the refinement step fails.
 */
export async function generateSmartCaption(params: {
  imageUrl: string;
  articleTitle?: string;
  articleContent?: string;
}): Promise<SmartCaptionResult> {
  const { imageUrl, articleTitle, articleContent } = params;

  const analysis = await analyzeImage({
    imageUrl,
    articleTitle,
    articleContent,
    generateAltText: true,
    detectContent: true,
    checkRelevance: !!articleTitle,
    checkQuality: true,
  });

  if (!analysis.success) {
    throw Object.assign(new Error(analysis.error || "تعذّر تحليل الصورة"), { statusCode: 502 });
  }

  // Vision-derived fallbacks.
  let caption = analysis.altTextAr || "";
  let altText = analysis.altTextAr || "";
  const keywords = analysis.tags || [];

  // Refine into news-appropriate copy. The visual facts ground the text; the
  // article context supplies the named people/events.
  try {
    const visualFacts = [
      analysis.contentDescription?.ar,
      analysis.detectedObjects?.length ? `عناصر: ${analysis.detectedObjects.join("، ")}` : "",
    ].filter(Boolean).join(" | ");

    const prompt = `أنت محرّر صور في غرفة أخبار عربية. مهمتك كتابة تعليق ونص بديل لصورة الخبر.

وصف بصري للصورة (للاستئناس فقط، قد يكون عاماً): ${visualFacts || "غير متوفر"}
عنوان الخبر: ${articleTitle || "غير متوفر"}
مقتطف من الخبر: ${(articleContent || "").slice(0, 700) || "غير متوفر"}

قواعد صارمة:
- استخدم أسماء الأشخاص/الجهات/الأحداث كما وردت في الخبر (لا تقل "رجل في منتصف العمر" إذا كان الشخص مذكوراً بالاسم).
- جملة واحدة قصيرة لكل حقل.
- ممنوع التفاصيل البصرية العامة غير المهمة (العمر التقريبي، ألوان الملابس، شعارات لا علاقة لها بالخبر).
- عربية فصيحة صحفية.

أعد JSON فقط بهذا الشكل، دون أي نص خارجه:
{"caption":"تعليق صحفي يظهر تحت الصورة","altText":"نص بديل قصير لقارئات الشاشة ومحركات البحث"}`;

    const res = await aiManager.generate(prompt, {
      ...AI_MODELS.CLAUDE_HAIKU,
      maxTokens: 400,
      temperature: 0.4,
      jsonMode: true,
      feature: "media-caption",
    });
    const parsed = extractJson(res.content || "");
    if (parsed?.caption && typeof parsed.caption === "string") caption = parsed.caption.trim();
    if (parsed?.altText && typeof parsed.altText === "string") altText = parsed.altText.trim();
  } catch (err: any) {
    console.warn("[SmartCaption] refinement failed, using vision alt text:", err?.message);
  }

  return {
    altText,
    caption,
    keywords,
    relevanceScore: analysis.relevanceScore ?? null,
    qualityScore: analysis.qualityScore ?? null,
    contentWarnings: analysis.contentWarnings || [],
    hasSensitiveContent: !!(analysis.hasSensitiveContent || analysis.hasAdultContent),
  };
}
