/**
 * Nano Banana Pro API Routes
 * Handles AI image generation using Gemini 3 Pro Image
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "../db";
import { aiImageGenerations, insertAiImageGenerationSchema, mediaFiles } from "../../shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import {
  generateAndUploadImage,
  type ImageGenerationRequest
} from "../services/nanoBananaService";
import { z } from "zod";
import { requireAuth, requireAnyPermission } from "../rbac";
import { PERMISSION_CODES } from "@shared/rbac-constants";
import { composeImagePrompt } from "@shared/imageStyles";
import {
  getImageStyleSettings,
  resolveGenerationStyle,
} from "../services/imageStyleService";
import { resolveImageModel } from "@shared/imageStyles";
import { EDITORIAL_IMAGE_FEATURE_KEY } from "@shared/editorialImages";
import { parseLimit, parseOffset } from "../utils/pagination";

// Request body schema (excludes userId - taken from session)
const generateImageRequestSchema = insertAiImageGenerationSchema.omit({ 
  userId: true,
  status: true,
  imageUrl: true,
  thumbnailUrl: true,
  generationTime: true,
  cost: true,
  errorMessage: true,
  metadata: true,
}).extend({
  // Optional text overlay for "خبر مميز" template
  overlayText: z.string().optional(),
  overlayOptions: z.object({
    fontSize: z.number().optional(),
    fontColor: z.string().optional(),
    backgroundColor: z.string().optional(),
    position: z.enum(["center", "top", "bottom"]).optional(),
  }).optional(),
  // نمط توليد من السجلّ المركزي: عند وجوده يُركَّب البرومبت النهائي في الخادم
  // (prompt المرسل = وصف المضمون فقط). غيابه = السلوك القديم حرفيًا.
  styleSlug: z.string().trim().max(50).optional(),
  // تصنيف الخبر (slug أو اسم) لمطابقة التوجيه السياقي داخل النمط
  category: z.string().trim().max(80).optional(),
  // نية التوليد البصري (إنفوجرافيك / واقعية / مقال رأي / بانر)
  intent: z.enum(["infographic", "photo", "opinion_art", "breaking_banner", "custom"]).optional(),
  dataPoints: z.array(z.string()).optional(),
});

const router = Router();
// The separate GPT editor tool shares the table, but not this history/API.
const legacyImageFilter = sql`coalesce(${aiImageGenerations.metadata}->>'featureKey', '') <> ${EDITORIAL_IMAGE_FEATURE_KEY}`;

// ============================================================
// NANO BANANA PRO IMAGE GENERATION ROUTES
// ============================================================

/**
 * POST /api/nano-banana/generate
 * Generate image using Nano Banana (مع نمط اختياري من السجلّ المركزي)
 *
 * الصلاحية: توليد صور المقالات أو رفع للوسائط (تغطي محرري المقالات ومكتبة الوسائط) —
 * كانت requireAuth فقط، ما فتح توليدًا غير محدود لأي مستخدم مسجّل.
 */
router.post(
  "/generate",
  requireAuth,
  requireAnyPermission(
    PERMISSION_CODES.ARTICLES_GENERATE_IMAGES,
    PERMISSION_CODES.MEDIA_UPLOAD
  ),
  async (req: Request, res: Response) => {
  try {
    const user = req.user as any;

    // Validate request body (userId comes from session, includes overlay options)
    // DEBUG: Log raw request body to trace overlayText
    console.log(`[API DEBUG] Raw request body keys:`, Object.keys(req.body));
    console.log(`[API DEBUG] overlayText in req.body:`, req.body.overlayText ? `"${req.body.overlayText.substring(0, 50)}..."` : "undefined");
    const validatedData = generateImageRequestSchema.parse(req.body);

    console.log(`[API] Image generation request from user ${user.id}`);
    if (validatedData.overlayText) {
      console.log(`[API] Text overlay requested: "${validatedData.overlayText.substring(0, 50)}..."`);
    }

    // حسم النمط والنموذج من السجلّ المركزي:
    // - مع styleSlug: البرومبت المرسل هو «المضمون» ويُركَّب النهائي هنا في الخادم.
    // - بدونه: السلوك القديم كما هو، مع تطبيق النموذج الافتراضي من الإعدادات فقط.
    let finalPrompt = validatedData.prompt;
    let finalNegativePrompt = validatedData.negativePrompt || undefined;
    let resolvedModel: string;
    let styleMeta: { styleSlug?: string; variantSlug?: string } = {};

    if (validatedData.styleSlug) {
      const { style, variant, model } = await resolveGenerationStyle(
        validatedData.styleSlug,
        validatedData.category,
        validatedData.model
      );
      const composed = composeImagePrompt({
        style,
        variant,
        content: validatedData.prompt,
      });
      finalPrompt = composed.prompt;
      finalNegativePrompt =
        [validatedData.negativePrompt, composed.negativePrompt]
          .filter(Boolean)
          .join(", ") || undefined;
      resolvedModel = model;
      styleMeta = { styleSlug: style.slug, variantSlug: variant?.slug };
    } else {
      const { suggestOptimalModel, detectImageIntent, buildIntentOptimizedPrompt } = await import(
        "../services/imageModelRouter"
      );
      const detectedIntent = validatedData.intent || detectImageIntent(validatedData.prompt, validatedData.category);
      const suggested = suggestOptimalModel(detectedIntent, null, validatedData.category);
      resolvedModel = validatedData.model?.trim() || suggested.model;
      
      if (detectedIntent === "infographic" && validatedData.dataPoints?.length) {
        const optimized = buildIntentOptimizedPrompt(
          detectedIntent,
          validatedData.prompt,
          validatedData.category,
          validatedData.dataPoints
        );
        finalPrompt = optimized.prompt;
        finalNegativePrompt = [validatedData.negativePrompt, optimized.negativePrompt].filter(Boolean).join(", ");
      } else {
        const settings = await getImageStyleSettings();
        resolvedModel = resolveImageModel(settings, null, validatedData.model || suggested.model);
      }
    }

    // Create pending record
    const [record] = await db
      .insert(aiImageGenerations)
      .values({
        userId: user.id,
        articleId: validatedData.articleId,
        prompt: finalPrompt,
        negativePrompt: finalNegativePrompt,
        model: resolvedModel,
        aspectRatio: validatedData.aspectRatio || "16:9",
        imageSize: validatedData.imageSize || "2K",
        numImages: validatedData.numImages || 1,
        status: "processing",
        enableSearchGrounding: validatedData.enableSearchGrounding || false,
        enableThinking: validatedData.enableThinking !== false,
        referenceImages: validatedData.referenceImages as any,
        brandingConfig: validatedData.brandingConfig as any,
      })
      .returning();

    // Generate image with optional text overlay
    const generationRequest = {
      prompt: finalPrompt,
      negativePrompt: finalNegativePrompt,
      model: resolvedModel,
      aspectRatio: validatedData.aspectRatio as any,
      imageSize: validatedData.imageSize as any,
      numImages: validatedData.numImages,
      enableSearchGrounding: validatedData.enableSearchGrounding,
      enableThinking: validatedData.enableThinking !== false,
      referenceImages: validatedData.referenceImages,
      brandingConfig: validatedData.brandingConfig as any,
      // Text overlay options for "خبر مميز" template (from validated data)
      overlayText: validatedData.overlayText,
      overlayOptions: validatedData.overlayOptions,
    };

    const result = await generateAndUploadImage(generationRequest, user.id);

    // Update record
    await db
      .update(aiImageGenerations)
      .set({
        status: result.success ? "completed" : "failed",
        imageUrl: result.imageUrl,
        thumbnailUrl: result.thumbnailUrl,
        generationTime: result.generationTime,
        cost: result.cost,
        metadata: { ...(result.metadata || {}), ...styleMeta } as any,
        errorMessage: result.error,
        updatedAt: new Date(),
      })
      .where(eq(aiImageGenerations.id, record.id));

    if (!result.success) {
      return res.status(500).json({
        message: "فشل توليد الصورة",
        error: result.error,
        generationId: record.id,
      });
    }

    // Return success
    res.json({
      message: "تم توليد الصورة بنجاح",
      generationId: record.id,
      imageUrl: result.imageUrl,
      thumbnailUrl: result.thumbnailUrl,
      generationTime: result.generationTime,
      cost: result.cost,
      metadata: { ...(result.metadata || {}), ...styleMeta },
      styleSlug: styleMeta.styleSlug,
    });
  } catch (error: any) {
    console.error("[API] Image generation error:", error);
    
    if (error.name === "ZodError") {
      return res.status(400).json({
        message: "بيانات غير صحيحة",
        errors: error.errors,
      });
    }
    
    res.status(500).json({
      message: "خطأ في توليد الصورة",
      error: error.message,
    });
  }
});

/**
 * GET /api/nano-banana/generations
 * Get all image generations for current user
 */
router.get("/generations", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { limit = 20, offset = 0, status, articleId } = req.query;
    
    let query = db
      .select()
      .from(aiImageGenerations)
      .where(and(eq(aiImageGenerations.userId, user.id), legacyImageFilter))
      .$dynamic();
    
    if (status) {
      query = query.where(
        and(
          and(eq(aiImageGenerations.userId, user.id), legacyImageFilter),
          eq(aiImageGenerations.status, status as string)
        )
      );
    }
    
    if (articleId) {
      query = query.where(
        and(
          and(eq(aiImageGenerations.userId, user.id), legacyImageFilter),
          eq(aiImageGenerations.articleId, articleId as string)
        )
      );
    }
    
    const generations = await query
      .orderBy(desc(aiImageGenerations.createdAt))
      .limit(parseLimit(limit, 20, 200))
      .offset(parseOffset(offset));
    
    res.json({
      generations,
      count: generations.length,
    });
  } catch (error: any) {
    console.error("[API] Get generations error:", error);
    res.status(500).json({
      message: "خطأ في جلب الصور المولدة",
      error: error.message,
    });
  }
});

/**
 * GET /api/nano-banana/generations/:id
 * Get specific generation by ID
 */
router.get("/generations/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { id } = req.params;
    
    const [generation] = await db
      .select()
      .from(aiImageGenerations)
      .where(
        and(
          eq(aiImageGenerations.id, id),
          and(eq(aiImageGenerations.userId, user.id), legacyImageFilter)
        )
      )
      .limit(1);
    
    if (!generation) {
      return res.status(404).json({ message: "الصورة غير موجودة" });
    }
    
    res.json(generation);
  } catch (error: any) {
    console.error("[API] Get generation error:", error);
    res.status(500).json({
      message: "خطأ في جلب الصورة",
      error: error.message,
    });
  }
});

/**
 * DELETE /api/nano-banana/generations/:id
 * Delete a generation
 */
router.delete("/generations/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { id } = req.params;
    
    // Check ownership
    const [generation] = await db
      .select()
      .from(aiImageGenerations)
      .where(
        and(
          eq(aiImageGenerations.id, id),
          and(eq(aiImageGenerations.userId, user.id), legacyImageFilter)
        )
      )
      .limit(1);
    
    if (!generation) {
      return res.status(404).json({ message: "الصورة غير موجودة" });
    }
    
    // Delete
    await db
      .delete(aiImageGenerations)
      .where(eq(aiImageGenerations.id, id));
    
    res.json({ message: "تم حذف الصورة بنجاح" });
  } catch (error: any) {
    console.error("[API] Delete generation error:", error);
    res.status(500).json({
      message: "خطأ في حذف الصورة",
      error: error.message,
    });
  }
});

/**
 * GET /api/nano-banana/stats
 * Get generation statistics for current user
 */
router.get("/stats", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    
    const allGenerations = await db
      .select()
      .from(aiImageGenerations)
      .where(and(eq(aiImageGenerations.userId, user.id), legacyImageFilter));
    
    const stats = {
      total: allGenerations.length,
      completed: allGenerations.filter(g => g.status === "completed").length,
      failed: allGenerations.filter(g => g.status === "failed").length,
      processing: allGenerations.filter(g => g.status === "processing").length,
      totalCost: allGenerations
        .filter(g => g.cost)
        .reduce((sum, g) => sum + (g.cost || 0), 0),
      avgGenerationTime: allGenerations.length > 0
        ? Math.round(
            allGenerations
              .filter(g => g.generationTime)
              .reduce((sum, g) => sum + (g.generationTime || 0), 0) / 
            allGenerations.filter(g => g.generationTime).length
          )
        : 0,
    };
    
    res.json(stats);
  } catch (error: any) {
    console.error("[API] Get stats error:", error);
    res.status(500).json({
      message: "خطأ في جلب الإحصائيات",
      error: error.message,
    });
  }
});

/**
 * POST /api/nano-banana/generations/:id/save-to-library
 * Save AI generated image to media library
 */
router.post("/generations/:id/save-to-library", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { id } = req.params;
    
    // Check if generation exists and belongs to user
    const [generation] = await db
      .select()
      .from(aiImageGenerations)
      .where(
        and(
          eq(aiImageGenerations.id, id),
          and(eq(aiImageGenerations.userId, user.id), legacyImageFilter)
        )
      )
      .limit(1);
    
    if (!generation) {
      return res.status(404).json({ message: "الصورة غير موجودة" });
    }
    
    // Check if generation is completed
    if (generation.status !== "completed") {
      return res.status(400).json({ 
        message: "لا يمكن حفظ صورة غير مكتملة",
        status: generation.status,
      });
    }
    
    // Check if imageUrl exists
    if (!generation.imageUrl) {
      return res.status(400).json({ message: "رابط الصورة غير موجود" });
    }
    
    // Check if already saved to media library using mediaFileId
    if (generation.mediaFileId) {
      return res.status(400).json({ 
        message: "الصورة موجودة بالفعل في مكتبة الوسائط",
        mediaFileId: generation.mediaFileId,
      });
    }
    
    // Extract filename from URL
    const urlParts = generation.imageUrl.split("/");
    const fileName = urlParts[urlParts.length - 1] || `ai-generated-${id}.png`;
    
    // Create title from prompt (first 100 chars)
    const title = generation.prompt.length > 100 
      ? generation.prompt.substring(0, 100) + "..."
      : generation.prompt;
    
    // Save to media library
    const [mediaFile] = await db
      .insert(mediaFiles)
      .values({
        fileName: fileName,
        originalName: `AI Generated - ${new Date().toISOString().split('T')[0]}`,
        url: generation.imageUrl,
        thumbnailUrl: generation.thumbnailUrl || generation.imageUrl,
        type: "image",
        mimeType: "image/png",
        size: 0, // We don't have size info from AI generation
        title: title,
        description: generation.prompt,
        altText: title,
        keywords: [], // Could be extracted from prompt if needed
        isAiGenerated: true,
        aiGenerationModel: generation.model,
        aiGenerationPrompt: generation.prompt,
        category: "ai-generated",
        uploadedBy: user.id,
      })
      .returning();
    
    // Update aiImageGenerations record with mediaFileId
    await db
      .update(aiImageGenerations)
      .set({
        mediaFileId: mediaFile.id,
        updatedAt: new Date(),
      })
      .where(eq(aiImageGenerations.id, id));
    
    console.log(`[API] Saved AI image ${id} to media library as ${mediaFile.id}`);
    
    res.json({
      message: "تم حفظ الصورة في مكتبة الوسائط بنجاح",
      mediaFileId: mediaFile.id,
      mediaFile: mediaFile,
    });
  } catch (error: any) {
    console.error("[API] Save to library error:", error);
    res.status(500).json({
      message: "خطأ في حفظ الصورة إلى مكتبة الوسائط",
      error: error.message,
    });
  }
});

export default router;
