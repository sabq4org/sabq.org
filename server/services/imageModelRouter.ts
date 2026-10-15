/**
 * Image Model Router & Intent Engine — محرك التوجيه الذكي لنماذج الصور
 *
 * يقوم بتحليل النية البصرية وتصنيف الخبر لاختيار وتوجيه التوليد إلى النموذج الأمثل:
 * - الإنفوجرافيك والبيانات: Recraft v3 / Vector Engine
 * - الواقعية الصحفية والميدانية: FLUX.1.1 Pro / Gemini 3 Pro Image
 * - مقالات الرأي والأعمدة: Recraft Illustration / Editorial Metaphor
 * - البانرات والأخبار العاجلة: Gemini 3.1 Flash Image
 * مع مسار حراسة وسلسلة أمان موثوقة (Graceful Fallback Chain).
 */

import {
  type ImageTaskIntent,
  suggestOptimalModel,
  DEFAULT_IMAGE_MODEL,
  LEGACY_IMAGE_MODEL,
  GLOBAL_IMAGE_GUARDS,
} from "@shared/imageStyles";
import { generateImage, type ImageGenerationRequest, type ImageGenerationResult } from "./nanoBananaService";

export { suggestOptimalModel } from "@shared/imageStyles";

export interface RoutedImageRequest extends ImageGenerationRequest {
  intent?: ImageTaskIntent;
  styleSlug?: string;
  category?: string;
  articleType?: string;
  sourceContext?: {
    title?: string;
    summary?: string;
    dataPoints?: string[];
  };
}

export interface RoutedImageResult extends ImageGenerationResult {
  detectedIntent: ImageTaskIntent;
  modelUsed: string;
  modelReasonAr: string;
  fallbackTriggered?: boolean;
}

/**
 * كشف النية البصرية تلقائياً من المضمون والتصنيف والنوع
 */
export function detectImageIntent(
  prompt: string,
  category?: string,
  articleType?: string
): ImageTaskIntent {
  const p = (prompt || "").toLowerCase();
  const c = (category || "").toLowerCase();
  const t = (articleType || "").toLowerCase();

  // 1. إنفوجرافيك وبيانات
  if (
    p.includes("انفوجرافيك") ||
    p.includes("إنفوجرافيك") ||
    p.includes("infographic") ||
    p.includes("إحصائية") ||
    p.includes("إحصاء") ||
    p.includes("رسم بياني") ||
    p.includes("مخطط") ||
    c.includes("اقتصاد") ||
    c.includes("مال") ||
    c.includes("أرقام")
  ) {
    return "infographic";
  }

  // 2. مقال رأي / رسم توضيحي فني
  if (
    t === "opinion" ||
    t === "column" ||
    c.includes("رأي") ||
    c.includes("كتاب") ||
    p.includes("توضيحي") ||
    p.includes("رمزية") ||
    p.includes("تعبيري")
  ) {
    return "opinion_art";
  }

  // 3. خبر عاجل / بانر
  if (p.includes("عاجل") || p.includes("خبر مميز") || p.includes("breaking") || c.includes("عاجل")) {
    return "breaking_banner";
  }

  // 4. صورة واقعية صحفية (الافتراضي للأخبار)
  return "photo";
}

/**
 * بناء برومبت مخصص فائق الدقة حسب النية البصرية والنموذج
 */
export function buildIntentOptimizedPrompt(
  intent: ImageTaskIntent,
  basePrompt: string,
  category?: string,
  dataPoints?: string[]
): { prompt: string; negativePrompt: string } {
  const cleanedContent = basePrompt.trim();

  switch (intent) {
    case "infographic": {
      const dataStr = dataPoints && dataPoints.length > 0
        ? `\nKey Data Aspects:\n${dataPoints.map((dp, i) => `- Metric ${i + 1}: ${dp}`).join("\n")}`
        : "";
      return {
        prompt: [
          `Professional journalistic data infographic layout representing: ${cleanedContent}`,
          dataStr,
          `Style requirements: modern flat vector design, clean data blocks, clear visual hierarchy, corporate color scheme (navy blue, emerald green, slate grey), elegant minimalist charts and iconography, high contrast, clean solid background.`,
          GLOBAL_IMAGE_GUARDS,
        ].filter(Boolean).join("\n\n"),
        negativePrompt:
          "photorealistic human face, photography, 3d render, messy pseudo-letters, distorted text, blurry charts, childish clip-art, crowded composition",
      };
    }

    case "opinion_art": {
      return {
        prompt: [
          `Conceptual editorial illustration for a thought piece: ${cleanedContent}`,
          `Style requirements: sophisticated contemporary editorial art, thoughtful visual metaphor, elegant limited color palette, polished magazine aesthetic, refined subtle textures, clean composition, artistic depth.`,
          GLOBAL_IMAGE_GUARDS,
        ].join("\n\n"),
        negativePrompt:
          "photorealistic snapshot, cheap vector art, childish cartoon, garish saturated colors, low resolution, messy details",
      };
    }

    case "breaking_banner": {
      return {
        prompt: [
          `Abstract minimalist news background backdrop for: ${cleanedContent}`,
          `Style requirements: sleek dark editorial gradient with subtle dynamic geometric light accents, clean uncluttered space, professional broadcast news graphics aesthetic, smooth subtle lighting.`,
          GLOBAL_IMAGE_GUARDS,
        ].join("\n\n"),
        negativePrompt:
          "text, typography, logos, busy patterns, low quality, harsh noise",
      };
    }

    case "photo":
    default: {
      return {
        prompt: [
          `Photojournalism editorial documentary photography of: ${cleanedContent}`,
          `Style requirements: natural authentic lighting, professional DSLR camera shot, realistic depth of field, real-world textures, balanced composition, culturally authentic and respectful, credible news visual.`,
          GLOBAL_IMAGE_GUARDS,
        ].join("\n\n"),
        negativePrompt:
          "CGI, 3D render, cartoon, anime, illustration, plastic looking skin, distorted hands, oversaturated, text, watermark",
      };
    }
  }
}

/**
 * تنفيذ التوليد مع التوجيه الذكي وسلسلة الأمان والـ Fallback
 */
export async function generateWithSmartRouter(
  request: RoutedImageRequest
): Promise<RoutedImageResult> {
  const intent = request.intent || detectImageIntent(request.prompt, request.category, request.articleType);
  const suggestion = suggestOptimalModel(intent, request.styleSlug, request.category);
  const targetModel = request.model?.trim() || suggestion.model;

  // تجهيز البرومبت المتخصص إن لم يكن برومبت مركب مسبقاً
  const { prompt: optimizedPrompt, negativePrompt: optimizedNeg } = buildIntentOptimizedPrompt(
    intent,
    request.prompt,
    request.category,
    request.sourceContext?.dataPoints
  );

  const combinedNegative = [request.negativePrompt, optimizedNeg].filter(Boolean).join(", ");

  const genRequest: ImageGenerationRequest = {
    ...request,
    prompt: request.styleSlug ? request.prompt : optimizedPrompt,
    negativePrompt: combinedNegative || undefined,
    model: targetModel,
    aspectRatio: request.aspectRatio || "16:9",
    imageSize: request.imageSize || "2K",
    enableSearchGrounding: request.enableSearchGrounding ?? (intent === "photo"),
    enableThinking: request.enableThinking ?? true,
  };

  try {
    const result = await generateImage(genRequest);
    return {
      ...result,
      detectedIntent: intent,
      modelUsed: result.metadata?.model || targetModel,
      modelReasonAr: suggestion.reasonAr,
      fallbackTriggered: false,
    };
  } catch (primaryError) {
    console.warn(`[ImageRouter] Primary model (${targetModel}) failed, attempting fallback:`, primaryError);

    // محاولة البديل السريع
    try {
      const fallbackModel = targetModel !== DEFAULT_IMAGE_MODEL ? DEFAULT_IMAGE_MODEL : LEGACY_IMAGE_MODEL;
      const fallbackResult = await generateImage({
        ...genRequest,
        model: fallbackModel,
      });

      return {
        ...fallbackResult,
        detectedIntent: intent,
        modelUsed: fallbackResult.metadata?.model || fallbackModel,
        modelReasonAr: `${suggestion.reasonAr} (تم التوليد عبر المحرك الاحتياطي السريع)`,
        fallbackTriggered: true,
      };
    } catch (fallbackError: any) {
      console.error("[ImageRouter] All fallback chains failed:", fallbackError);
      return {
        success: false,
        generationTime: 0,
        detectedIntent: intent,
        modelUsed: targetModel,
        modelReasonAr: suggestion.reasonAr,
        error: fallbackError?.message || "فشل توليد الصورة عبر كافة المزودات",
        fallbackTriggered: true,
      };
    }
  }
}

export default {
  detectImageIntent,
  buildIntentOptimizedPrompt,
  generateWithSmartRouter,
};
