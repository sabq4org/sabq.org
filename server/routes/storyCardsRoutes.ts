import { Request, Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth";
import { storyCardsService } from "../services/storyCardsService";

// Validation schemas
const generateStoryCardsSchema = z.object({
  articleId: z.string(),
  title: z.string(),
  content: z.string(),
  options: z.object({
    category: z.string().optional(),
    imageUrl: z.string().url().optional(),
    author: z.string().optional(),
    maxSlides: z.number().int().min(3).max(10).optional(),
    aspectRatio: z.enum(["9:16", "1:1", "16:9"]).optional(),
    language: z.enum(["ar", "en", "ur"]).optional(),
  }).optional(),
});

const updateStoryCardSchema = z.object({
  title: z.string().optional(),
  slides: z.array(z.any()).optional(),
  status: z.string().optional(),
  isPublished: z.boolean().optional(),
});

/**
 * Generate story cards for an article
 */
export const generateStoryCards = [
  isAuthenticated,
  async (req: Request, res: Response) => {
    try {
      // Validate request body
      const validation = generateStoryCardsSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: "Invalid request data",
          details: validation.error.errors,
        });
      }

      const { articleId, title, content, options } = validation.data;
      const userId = (req as any).user?.id || "system";

      // Generate story cards
      const storyData = await storyCardsService.generateStoryCards(
        articleId,
        title,
        content,
        {
          ...options,
          language: options?.language || "ar",
        }
      );

      return res.json({
        message: "Story cards generated successfully",
        data: storyData,
      });
    } catch (error) {
      console.error("Error generating story cards:", error);
      return res.status(500).json({
        error: "Failed to generate story cards",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
];

/**
 * Generate Instagram carousel
 */
export const generateInstagramCarousel = [
  isAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const { articleId, title, content, category } = req.body;

      if (!articleId || !title || !content) {
        return res.status(400).json({
          error: "Missing required fields: articleId, title, content",
        });
      }

      const storyData = await storyCardsService.generateInstagramCarousel(
        articleId,
        title,
        content,
        { category }
      );

      return res.json({
        message: "Instagram carousel generated successfully",
        data: storyData,
      });
    } catch (error) {
      console.error("Error generating Instagram carousel:", error);
      return res.status(500).json({
        error: "Failed to generate Instagram carousel",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
];

/**
 * Generate LinkedIn document
 */
export const generateLinkedInDocument = [
  isAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const { articleId, title, content, category } = req.body;

      if (!articleId || !title || !content) {
        return res.status(400).json({
          error: "Missing required fields: articleId, title, content",
        });
      }

      const storyData = await storyCardsService.generateLinkedInDocument(
        articleId,
        title,
        content,
        { category }
      );

      return res.json({
        message: "LinkedIn document generated successfully",
        data: storyData,
      });
    } catch (error) {
      console.error("Error generating LinkedIn document:", error);
      return res.status(500).json({
        error: "Failed to generate LinkedIn document",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
];

/**
 * Get story cards by article ID
 */
export const getStoryCardsByArticle = [
  isAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const { articleId } = req.params;

      if (!articleId) {
        return res.status(400).json({
          error: "Article ID is required",
        });
      }

      const cards = await storyCardsService.getStoryCardsByArticle(articleId);

      return res.json({
        data: cards,
      });
    } catch (error) {
      console.error("Error fetching story cards:", error);
      return res.status(500).json({
        error: "Failed to fetch story cards",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
];

/**
 * Update story card
 */
export const updateStoryCard = [
  isAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const { cardId } = req.params;
      
      // Validate request body
      const validation = updateStoryCardSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: "Invalid update data",
          details: validation.error.errors,
        });
      }

      await storyCardsService.updateStoryCard(cardId, validation.data);

      return res.json({
        message: "Story card updated successfully",
      });
    } catch (error) {
      console.error("Error updating story card:", error);
      return res.status(500).json({
        error: "Failed to update story card",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
];

/**
 * Delete story card
 */
export const deleteStoryCard = [
  isAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const { cardId } = req.params;

      if (!cardId) {
        return res.status(400).json({
          error: "Card ID is required",
        });
      }

      await storyCardsService.deleteStoryCard(cardId);

      return res.json({
        message: "Story card deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting story card:", error);
      return res.status(500).json({
        error: "Failed to delete story card",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
];

// Export router configuration
export const storyCardsRouter = {
  post: {
    "/generate": generateStoryCards,
    "/instagram-carousel": generateInstagramCarousel,
    "/linkedin-document": generateLinkedInDocument,
  },
  get: {
    "/article/:articleId": getStoryCardsByArticle,
  },
  patch: {
    "/:cardId": updateStoryCard,
  },
  delete: {
    "/:cardId": deleteStoryCard,
  },
};