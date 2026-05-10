/**
 * Auto Image Generation Service
 * Automatically generates AI images for articles without hero images
 */

import { generateNewsImage } from "./visualAiService";
import { db } from "../db";
import { articles, mediaFiles, systemSettings } from "@shared/schema";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

const SETTINGS_KEY = "auto_image_generation_settings";

interface AutoImageSettings {
  enabled: boolean;
  articleTypes: string[];
  skipCategories: string[];
  defaultStyle: string;
  provider: string;
  autoPublish: boolean;
  generateOnSave: boolean;
  imagePromptTemplate?: string;
  maxMonthlyGenerations?: number;
  currentMonthGenerations?: number;
  lastResetMonth?: number;
}

const DEFAULT_SETTINGS: AutoImageSettings = {
  enabled: false,
  articleTypes: ["news", "analysis"],
  skipCategories: [],
  defaultStyle: "photorealistic",
  provider: "nano-banana",
  autoPublish: false,
  generateOnSave: false,
  imagePromptTemplate: "",
  maxMonthlyGenerations: 100,
  currentMonthGenerations: 0,
  lastResetMonth: new Date().getMonth()
};

const AI_DISCLAIMER = {
  ar: "صورة تم إنشاؤها بواسطة الذكاء الاصطناعي",
  en: "AI-Generated Image",
  ur: "مصنوعی ذہانت سے تیار کردہ تصویر"
};

export interface AutoImageGenerationRequest {
  articleId: string;
  title: string;
  content?: string;
  excerpt?: string;
  category?: string;
  language: "ar" | "en" | "ur";
  articleType?: string;
  forceGeneration?: boolean;
}

export interface AutoImageGenerationResult {
  success: boolean;
  imageUrl?: string;
  altText?: string;
  mediaFileId?: string;
  message?: string;
  error?: string;
}

/**
 * Get auto generation settings from database
 */
export async function getAutoGenerationSettings(): Promise<AutoImageSettings> {
  try {
    const [setting] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, SETTINGS_KEY));
    
    if (setting?.value) {
      const savedSettings = setting.value as AutoImageSettings;
      
      const currentMonth = new Date().getMonth();
      if (savedSettings.lastResetMonth !== currentMonth) {
        savedSettings.currentMonthGenerations = 0;
        savedSettings.lastResetMonth = currentMonth;
        await saveAutoGenerationSettings(savedSettings);
      }
      
      return { ...DEFAULT_SETTINGS, ...savedSettings };
    }
    
    return DEFAULT_SETTINGS;
  } catch (error) {
    console.error("[Auto Image] Error loading settings:", error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save auto generation settings to database
 */
async function saveAutoGenerationSettings(settings: AutoImageSettings): Promise<void> {
  try {
    const existing = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, SETTINGS_KEY));

    if (existing.length > 0) {
      await db
        .update(systemSettings)
        .set({ 
          value: settings as any, 
          updatedAt: new Date() 
        })
        .where(eq(systemSettings.key, SETTINGS_KEY));
    } else {
      await db
        .insert(systemSettings)
        .values({ 
          key: SETTINGS_KEY, 
          value: settings as any, 
          category: "ai",
          isPublic: false
        });
    }
    
    console.log("[Auto Image] Settings saved to database");
  } catch (error) {
    console.error("[Auto Image] Error saving settings:", error);
    throw error;
  }
}

/**
 * Update auto generation settings
 */
export async function updateAutoGenerationSettings(updates: Partial<AutoImageSettings>): Promise<AutoImageSettings> {
  const currentSettings = await getAutoGenerationSettings();
  const newSettings = { ...currentSettings, ...updates };
  await saveAutoGenerationSettings(newSettings);
  return newSettings;
}

/**
 * Increment generation count
 */
async function incrementGenerationCount(): Promise<void> {
  const settings = await getAutoGenerationSettings();
  settings.currentMonthGenerations = (settings.currentMonthGenerations || 0) + 1;
  await saveAutoGenerationSettings(settings);
}

/**
 * Check if generation limit reached
 */
async function isGenerationLimitReached(): Promise<boolean> {
  const settings = await getAutoGenerationSettings();
  if (!settings.maxMonthlyGenerations) return false;
  return (settings.currentMonthGenerations || 0) >= settings.maxMonthlyGenerations;
}

/**
 * Automatically generate image for article if needed
 */
export async function autoGenerateImage(
  request: AutoImageGenerationRequest,
  userId: string
): Promise<AutoImageGenerationResult> {
  try {
    const settings = await getAutoGenerationSettings();
    
    if (!settings.enabled && !request.forceGeneration) {
      return {
        success: false,
        message: "Auto image generation is disabled"
      };
    }
    
    if (!request.forceGeneration && 
        request.articleType && 
        !settings.articleTypes.includes(request.articleType)) {
      return {
        success: false,
        message: `Auto generation not enabled for ${request.articleType} articles`
      };
    }
    
    if (!request.forceGeneration && 
        request.category && 
        settings.skipCategories.includes(request.category)) {
      return {
        success: false,
        message: `Auto generation skipped for category ${request.category}`
      };
    }
    
    if (!request.forceGeneration && await isGenerationLimitReached()) {
      return {
        success: false,
        message: "Monthly generation limit reached"
      };
    }
    
    console.log(`[Auto Image] Generating for article: ${request.articleId}`);
    
    const smartPrompt = generateSmartPrompt(request, settings);
    
    const generationResult = await generateNewsImage({
      articleTitle: request.title,
      articleSummary: request.excerpt || extractSummary(request.content || ""),
      category: request.category || "عام",
      language: request.language,
      style: settings.defaultStyle as any,
      mood: "neutral"
    });
    
    if (!generationResult.success || !generationResult.imageUrl) {
      return {
        success: false,
        error: generationResult.error || "Image generation failed"
      };
    }
    
    const altText = createAltTextWithDisclaimer(
      request.title,
      request.language
    );
    
    const [savedMedia] = await db.insert(mediaFiles).values({
      fileName: `auto-generated-${request.articleId}-${Date.now()}.png`,
      originalName: `${request.title.substring(0, 50)}.png`,
      url: generationResult.imageUrl,
      thumbnailUrl: generationResult.thumbnailUrl,
      type: "image",
      mimeType: "image/png",
      size: 0,
      title: request.title,
      description: `Auto-generated image for: ${request.title}`,
      altText: altText,
      caption: AI_DISCLAIMER[request.language],
      keywords: extractKeywords(request.title),
      isAiGenerated: true,
      aiGenerationModel: settings.provider,
      aiGenerationPrompt: smartPrompt,
      category: "articles",
      usedIn: [request.articleId],
      usageCount: 1,
      uploadedBy: userId
    }).returning();
    
    await db.update(articles)
      .set({ 
        imageUrl: generationResult.imageUrl,
        thumbnailUrl: generationResult.thumbnailUrl || generationResult.imageUrl, // Also set thumbnail
        isAiGeneratedImage: true,
        aiImageModel: settings.provider,
        aiImagePrompt: smartPrompt,
        updatedAt: new Date()
      })
      .where(eq(articles.id, request.articleId));
    
    await incrementGenerationCount();
    
    console.log(`[Auto Image] Successfully generated for article: ${request.articleId}`);
    
    return {
      success: true,
      imageUrl: generationResult.imageUrl,
      altText: altText,
      mediaFileId: savedMedia.id,
      message: "Image generated successfully"
    };
    
  } catch (error: any) {
    console.error("[Auto Image] Generation failed:", error);
    return {
      success: false,
      error: error.message || "Auto image generation failed"
    };
  }
}

/**
 * Generate smart prompt based on article content
 */
function generateSmartPrompt(request: AutoImageGenerationRequest, settings: AutoImageSettings): string {
  const { title, content, excerpt, category, language } = request;
  
  if (settings.imagePromptTemplate) {
    return settings.imagePromptTemplate
      .replace(/{title}/g, title)
      .replace(/{category}/g, category || "عام")
      .replace(/{excerpt}/g, excerpt || "");
  }
  
  let prompt = `Professional news image for article titled: "${title}"`;
  
  if (category) {
    prompt += `\nCategory: ${category}`;
  }
  
  if (excerpt) {
    prompt += `\nSummary: ${excerpt}`;
  } else if (content) {
    const keyPoints = extractKeyPoints(content);
    if (keyPoints.length > 0) {
      prompt += `\nKey points: ${keyPoints.join(", ")}`;
    }
  }
  
  prompt += `
Style requirements:
- Professional journalism quality
- Culturally appropriate for ${language === "ar" ? "Arabic" : language === "ur" ? "Urdu" : "English"} audience
- Modern, clean composition
- No text or watermarks
- Suitable for news publication
- Visually engaging and relevant to the topic`;
  
  return prompt;
}

/**
 * Extract summary from content (first 200 characters)
 */
function extractSummary(content: string): string {
  const cleanContent = content
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  
  return cleanContent.substring(0, 200) + (cleanContent.length > 200 ? "..." : "");
}

/**
 * Extract key points from content
 */
function extractKeyPoints(content: string): string[] {
  const cleanContent = content
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  
  const sentences = cleanContent.split(/[.!?]/).filter(s => s.trim().length > 20);
  
  return sentences.slice(0, 3).map(s => s.trim());
}

/**
 * Extract keywords from title
 */
function extractKeywords(title: string): string[] {
  const stopWords = [
    "في", "من", "إلى", "على", "مع", "عن", "بعد", "قبل", "أن", "هذا", "هذه",
    "the", "a", "an", "in", "on", "at", "to", "from", "with", "for", "and", "or"
  ];
  
  const words = title.split(/\s+/)
    .filter(word => word.length > 2)
    .filter(word => !stopWords.includes(word.toLowerCase()))
    .slice(0, 5);
  
  return words;
}

/**
 * Create alt text with AI disclaimer
 */
function createAltTextWithDisclaimer(
  title: string,
  language: "ar" | "en" | "ur"
): string {
  const disclaimer = AI_DISCLAIMER[language];
  return `${title} - ${disclaimer}`;
}

/**
 * Check if article needs auto-generated image
 */
export async function shouldAutoGenerateImage(articleId: string): Promise<boolean> {
  const settings = await getAutoGenerationSettings();
  
  if (!settings.enabled) {
    return false;
  }
  
  const article = await db.query.articles.findFirst({
    where: eq(articles.id, articleId)
  });
  
  if (!article) {
    return false;
  }
  
  if (article.imageUrl) {
    return false;
  }
  
  if (!settings.articleTypes.includes(article.articleType)) {
    return false;
  }
  
  return true;
}

export default {
  autoGenerateImage,
  shouldAutoGenerateImage,
  getAutoGenerationSettings,
  updateAutoGenerationSettings
};
