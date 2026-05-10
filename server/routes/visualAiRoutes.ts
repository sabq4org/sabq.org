/**
 * Visual AI Routes - Image Analysis & Smart Generation APIs
 */

import { Router, Request, Response } from "express";
import { db } from "../db";
import { 
  imageAnalysis, 
  socialMediaCards, 
  visualRecommendations, 
  storyCards,
  visualAiAnalyzeRequestSchema,
  visualAiSocialCardsRequestSchema,
  visualAiTrackPerformanceRequestSchema,
  visualAiRecommendationDecisionSchema
} from "@shared/schema";
import { 
  analyzeImage, 
  generateNewsImage,
  type ImageAnalysisRequest,
  type NewsImageGenerationRequest 
} from "../services/visualAiService";
import { 
  generateSocialMediaCards,
  trackCardPerformance,
  type SocialCardRequest
} from "../services/socialMediaCardsService";
import { eq, desc, and, sql } from "drizzle-orm";
import { isAuthenticated } from "../auth";
import { requirePermission, requireAuth } from "../rbac";
import { PERMISSION_CODES } from "@shared/rbac-constants";
import { z } from "zod";

const router = Router();

// ============================================
// IMAGE ANALYSIS ENDPOINTS
// ============================================

/**
 * POST /api/visual-ai/analyze
 * Analyze an image for quality, content, and generate Alt text
 */
router.post("/analyze", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    
    // Validate request body with Zod
    const parseResult = visualAiAnalyzeRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ 
        error: "بيانات غير صالحة",
        details: parseResult.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      });
    }
    
    const {
      imageUrl,
      articleId,
      articleTitle,
      articleContent,
      checkQuality,
      generateAltText,
      detectContent,
      checkRelevance
    } = parseResult.data;

    console.log(`[Visual AI API] Analyzing image for user ${userId}`);

    // Perform AI analysis
    const analysisResult = await analyzeImage({
      imageUrl,
      articleTitle,
      articleContent,
      checkQuality,
      generateAltText,
      detectContent,
      checkRelevance
    });

    if (!analysisResult.success) {
      return res.status(500).json({ 
        error: analysisResult.error || "Analysis failed" 
      });
    }

    // Save analysis to database
    const [savedAnalysis] = await db.insert(imageAnalysis).values({
      imageUrl,
      articleId: articleId || null,
      userId,
      qualityScore: analysisResult.qualityScore,
      qualityMetrics: analysisResult.qualityMetrics || null,
      contentDescription: analysisResult.contentDescription || null,
      detectedObjects: analysisResult.detectedObjects || null,
      dominantColors: analysisResult.dominantColors || null,
      tags: analysisResult.tags || null,
      altTextAr: analysisResult.altTextAr,
      altTextEn: analysisResult.altTextEn,
      altTextUr: analysisResult.altTextUr,
      hasAdultContent: analysisResult.hasAdultContent || false,
      hasSensitiveContent: analysisResult.hasSensitiveContent || false,
      contentWarnings: analysisResult.contentWarnings || null,
      relevanceScore: analysisResult.relevanceScore,
      matchingSuggestions: analysisResult.matchingSuggestions || null,
      processingTime: analysisResult.processingTime,
      cost: analysisResult.cost,
      status: "completed"
    }).returning();

    console.log(`[Visual AI API] Analysis saved: ${savedAnalysis.id}`);

    res.json({
      success: true,
      analysis: savedAnalysis,
      result: analysisResult
    });

  } catch (error: any) {
    console.error("[Visual AI API] Analysis error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

/**
 * GET /api/visual-ai/analysis/:id
 * Get analysis by ID
 */
router.get("/analysis/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const analysis = await db.query.imageAnalysis.findFirst({
      where: eq(imageAnalysis.id, id)
    });

    if (!analysis) {
      return res.status(404).json({ error: "Analysis not found" });
    }

    res.json(analysis);

  } catch (error: any) {
    console.error("[Visual AI API] Get analysis error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

/**
 * GET /api/visual-ai/analysis/article/:articleId
 * Get analyses for an article
 */
router.get("/analysis/article/:articleId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { articleId } = req.params;

    const analyses = await db.query.imageAnalysis.findMany({
      where: eq(imageAnalysis.articleId, articleId),
      orderBy: [desc(imageAnalysis.createdAt)]
    });

    res.json(analyses);

  } catch (error: any) {
    console.error("[Visual AI API] Get article analyses error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// ============================================
// SMART NEWS IMAGE GENERATION
// ============================================

/**
 * POST /api/visual-ai/generate-news-image
 * Generate a smart news image based on article content
 * Requires: visual_ai.generate_image permission
 */
router.post("/generate-news-image", requireAuth, requirePermission(PERMISSION_CODES.ARTICLES_GENERATE_IMAGES), async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const {
      articleId,
      articleTitle,
      articleSummary,
      category,
      language,
      style,
      mood
    }: NewsImageGenerationRequest & { articleId: string } = req.body;

    if (!articleTitle || !category || !language) {
      return res.status(400).json({ 
        error: "articleTitle, category, and language are required" 
      });
    }

    console.log(`[Visual AI API] Generating news image for: ${articleTitle}`);

    // Generate AI image
    const generationResult = await generateNewsImage({
      articleTitle,
      articleSummary,
      category,
      language,
      style,
      mood
    });

    if (!generationResult.success || !generationResult.imageUrl) {
      return res.status(500).json({ 
        error: generationResult.error || "Generation failed - no image URL" 
      });
    }

    // Save to social_media_cards table
    const [savedCard] = await db.insert(socialMediaCards).values({
      articleId,
      userId,
      platform: "all",
      cardType: "standard",
      template: "news_image",
      language,
      imageUrl: generationResult.imageUrl,
      thumbnailUrl: generationResult.thumbnailUrl || generationResult.imageUrl,
      headline: articleTitle,
      generationTime: generationResult.generationTime,
      cost: generationResult.cost,
      status: "completed"
    }).returning();

    console.log(`[Visual AI API] News image saved: ${savedCard.id}`);

    res.json({
      success: true,
      card: savedCard,
      result: generationResult
    });

  } catch (error: any) {
    console.error("[Visual AI API] News image generation error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// ============================================
// SOCIAL MEDIA CARDS
// ============================================

/**
 * POST /api/visual-ai/generate-social-cards
 * Generate optimized social media cards for all platforms
 */
router.post("/generate-social-cards", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const {
      articleId,
      articleTitle,
      articleSummary,
      category,
      language,
      platform = "all",
      template
    }: SocialCardRequest = req.body;

    if (!articleId || !articleTitle || !category || !language) {
      return res.status(400).json({ 
        error: "articleId, articleTitle, category, and language are required" 
      });
    }

    console.log(`[Visual AI API] Generating social cards for: ${articleTitle}`);

    // Generate cards for specified platforms
    const result = await generateSocialMediaCards({
      articleId,
      articleTitle,
      articleSummary,
      category,
      language,
      platform,
      template
    }, userId);

    if (!result.success) {
      return res.status(500).json({ 
        error: result.error || "Social cards generation failed" 
      });
    }

    console.log(`[Visual AI API] Generated ${result.cards?.length} social cards`);

    res.json({
      success: true,
      cards: result.cards,
      processingTime: result.processingTime,
      cost: result.cost
    });

  } catch (error: any) {
    console.error("[Visual AI API] Social cards generation error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

/**
 * GET /api/visual-ai/social-cards/article/:articleId
 * Get social media cards for an article
 */
router.get("/social-cards/article/:articleId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { articleId } = req.params;

    const cards = await db.query.socialMediaCards.findMany({
      where: eq(socialMediaCards.articleId, articleId),
      orderBy: [desc(socialMediaCards.createdAt)]
    });

    res.json(cards);

  } catch (error: any) {
    console.error("[Visual AI API] Get social cards error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

/**
 * POST /api/visual-ai/social-cards/:id/track-download
 * Track social card download
 */
router.post("/social-cards/:id/track-download", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await db.update(socialMediaCards)
      .set({ 
        downloadCount: sql`${socialMediaCards.downloadCount} + 1`
      })
      .where(eq(socialMediaCards.id, id));

    res.json({ success: true });

  } catch (error: any) {
    console.error("[Visual AI API] Track download error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// ============================================
// VISUAL RECOMMENDATIONS
// ============================================

/**
 * GET /api/visual-ai/recommendations/article/:articleId
 * Get visual recommendations for an article
 */
router.get("/recommendations/article/:articleId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { articleId } = req.params;

    const recommendations = await db.query.visualRecommendations.findMany({
      where: and(
        eq(visualRecommendations.articleId, articleId),
        eq(visualRecommendations.status, "pending")
      ),
      orderBy: [desc(visualRecommendations.priority), desc(visualRecommendations.createdAt)]
    });

    res.json(recommendations);

  } catch (error: any) {
    console.error("[Visual AI API] Get recommendations error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

/**
 * POST /api/visual-ai/recommendations/:id/accept
 * Accept a visual recommendation
 */
router.post("/recommendations/:id/accept", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await db.update(visualRecommendations)
      .set({ 
        status: "accepted",
        appliedAt: new Date()
      })
      .where(eq(visualRecommendations.id, id));

    res.json({ success: true });

  } catch (error: any) {
    console.error("[Visual AI API] Accept recommendation error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

/**
 * POST /api/visual-ai/recommendations/:id/reject
 * Reject a visual recommendation
 */
router.post("/recommendations/:id/reject", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    await db.update(visualRecommendations)
      .set({ 
        status: "rejected",
        rejectedReason: reason || "User rejected"
      })
      .where(eq(visualRecommendations.id, id));

    res.json({ success: true });

  } catch (error: any) {
    console.error("[Visual AI API] Reject recommendation error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// ============================================
// STORY CARDS
// ============================================

/**
 * GET /api/visual-ai/story-cards/article/:articleId
 * Get story cards for an article
 */
router.get("/story-cards/article/:articleId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { articleId } = req.params;

    const stories = await db.query.storyCards.findMany({
      where: eq(storyCards.articleId, articleId),
      orderBy: [desc(storyCards.createdAt)]
    });

    res.json(stories);

  } catch (error: any) {
    console.error("[Visual AI API] Get story cards error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

export default router;
