/**
 * Auto Image Generation Routes
 */

import { Router, Request, Response } from "express";
import { isAuthenticated } from "../auth";
import { requireRole, requirePermission, requireAuth } from "../rbac";
import { PERMISSION_CODES } from "@shared/rbac-constants";
import {
  autoGenerateImage,
  shouldAutoGenerateImage,
  getAutoGenerationSettings,
  updateAutoGenerationSettings
} from "../services/autoImageGenerationService";

const router = Router();

// رسائل عربية لكل سبب فشل — كان المحرر يرى ردّ 400 خامًا بالإنجليزية حتى حين كان
// السبب نفاد رصيد مزوّد الصور. لا 429/502/503/504 هنا: apiRequest في الواجهة
// يستبدل بها رسالة عامة فتضيع رسالتنا.
const AUTO_IMAGE_FAILURES: Record<string, { status: number; message: string }> = {
  DISABLED: { status: 400, message: "التوليد التلقائي للصور معطّل من الإعدادات." },
  ARTICLE_TYPE_NOT_ENABLED: { status: 400, message: "التوليد التلقائي غير مفعّل لهذا النوع من المحتوى في الإعدادات." },
  CATEGORY_SKIPPED: { status: 400, message: "هذا التصنيف مستثنى من التوليد التلقائي في الإعدادات." },
  MONTHLY_LIMIT_REACHED: { status: 400, message: "بلغ التوليد التلقائي حدّه الشهري المحدد في الإعدادات." },
  QUOTA_EXCEEDED: {
    status: 402,
    message: "تعذّر توليد الصورة: نفد رصيد خدمة توليد الصور (Google Gemini). يلزم شحن الرصيد من حساب الفوترة ثم إعادة المحاولة.",
  },
  AUTH_ERROR: { status: 500, message: "تعذّر توليد الصورة: مفتاح خدمة توليد الصور غير صالح أو منتهٍ. راجع إعدادات المفتاح." },
  RATE_LIMITED: { status: 500, message: "خدمة توليد الصور مشغولة حاليًا. أعد المحاولة بعد دقيقة." },
  CONTENT_FILTER: { status: 422, message: "رفضت خدمة التوليد هذا الطلب لأسباب تتعلق بسياسة المحتوى. عدّل العنوان أو اختر نمطًا آخر." },
};
const AUTO_IMAGE_GENERIC_FAILURE = { status: 500, message: "تعذّر توليد الصورة بسبب خطأ في خدمة التوليد. أعد المحاولة لاحقًا." };

/**
 * POST /api/auto-image/generate
 * Manually trigger auto image generation for an article
 * Requires: visual_ai.generate_image permission
 */
router.post("/generate", requireAuth, requirePermission(PERMISSION_CODES.ARTICLES_GENERATE_IMAGES), async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const {
      articleId,
      title,
      content,
      excerpt,
      category,
      language = "ar",
      articleType = "news",
      forceGeneration = false,
      styleSlug
    } = req.body;

    if (!articleId || !title) {
      return res.status(400).json({
        error: "articleId and title are required",
        message: "احفظ الخبر بعنوان أولًا ثم أعد توليد الصورة."
      });
    }

    console.log(`[Auto Image API] Generating for article: ${articleId}`);

    const result = await autoGenerateImage({
      articleId,
      title,
      content,
      excerpt,
      category,
      language,
      articleType,
      forceGeneration,
      // اختيار المحرر لهذه التوليدة فقط — يتقدم على نمط الإعدادات
      styleSlug: typeof styleSlug === "string" ? styleSlug.slice(0, 50) : undefined
    }, userId);

    if (!result.success) {
      const failure = (result.errorCode && AUTO_IMAGE_FAILURES[result.errorCode]) || AUTO_IMAGE_GENERIC_FAILURE;
      // رسائل nanoBanana العربية (رفض المحتوى، ردّ بلا صورة) أدق من الرسالة العامة
      const message =
        failure === AUTO_IMAGE_GENERIC_FAILURE && /[\u0600-\u06FF]/.test(result.error || "")
          ? result.error!
          : failure.message;
      return res.status(failure.status).json({ ...result, message });
    }

    res.json(result);

  } catch (error: any) {
    console.error("[Auto Image API] Generation error:", error);
    res.status(500).json({ 
      error: error.message || "Internal server error" 
    });
  }
});

/**
 * GET /api/auto-image/check/:articleId
 * Check if an article needs auto-generated image
 */
router.get("/check/:articleId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { articleId } = req.params;

    const needsImage = await shouldAutoGenerateImage(articleId);

    res.json({
      articleId,
      needsImage
    });

  } catch (error: any) {
    console.error("[Auto Image API] Check error:", error);
    res.status(500).json({ 
      error: error.message || "Internal server error" 
    });
  }
});

/**
 * GET /api/auto-image/settings
 * Get auto generation settings
 */
router.get("/settings", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const settings = await getAutoGenerationSettings();
    res.json(settings);

  } catch (error: any) {
    console.error("[Auto Image API] Get settings error:", error);
    res.status(500).json({ 
      error: error.message || "Internal server error" 
    });
  }
});

/**
 * PUT /api/auto-image/settings
 * Update auto generation settings (admin only)
 */
router.put("/settings", isAuthenticated, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const updates = req.body;

    const validKeys = [
      "enabled",
      "articleTypes", 
      "skipCategories",
      "defaultStyle",
      "newsStyle",
      "articleStyle",
      "provider",
      "autoPublish",
      "generateOnSave",
      "imagePromptTemplate",
      "maxMonthlyGenerations"
    ];

    const sanitizedUpdates: Record<string, any> = {};
    for (const key of validKeys) {
      if (key in updates) {
        if (key === "enabled" || key === "autoPublish" || key === "generateOnSave") {
          sanitizedUpdates[key] = Boolean(updates[key]);
        } else if (key === "articleTypes" || key === "skipCategories") {
          if (Array.isArray(updates[key])) {
            sanitizedUpdates[key] = updates[key].filter((item: any) => typeof item === "string");
          }
        } else if (key === "maxMonthlyGenerations") {
          const value = parseInt(updates[key]);
          if (!isNaN(value) && value >= 0) {
            sanitizedUpdates[key] = value;
          }
        } else if (typeof updates[key] === "string") {
          sanitizedUpdates[key] = updates[key];
        }
      }
    }

    const newSettings = await updateAutoGenerationSettings(sanitizedUpdates);

    res.json({
      success: true,
      message: "Settings updated successfully",
      settings: newSettings
    });

  } catch (error: any) {
    console.error("[Auto Image API] Update settings error:", error);
    res.status(500).json({ 
      error: error.message || "Internal server error" 
    });
  }
});

export default router;
