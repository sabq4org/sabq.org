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
      forceGeneration = false
    } = req.body;

    if (!articleId || !title) {
      return res.status(400).json({ 
        error: "articleId and title are required" 
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
      forceGeneration
    }, userId);

    if (!result.success) {
      return res.status(400).json(result);
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
