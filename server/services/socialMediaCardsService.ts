/**
 * Social Media Cards Generation Service
 * Generates platform-optimized visual cards for social sharing
 * Powered by Gemini 3 Pro Visual AI
 */

import { generateNewsImage } from "./visualAiService";
import { db } from "../db";
import { socialMediaCards } from "@shared/schema";
import { eq } from "drizzle-orm";

// ============================================
// PLATFORM SPECIFICATIONS
// ============================================

interface PlatformSpecs {
  dimensions: { width: number; height: number };
  aspectRatio: string;
  features: string[];
  maxTextLength: {
    headline: number;
    description: number;
  };
}

const PLATFORM_SPECS: Record<string, PlatformSpecs> = {
  twitter: {
    dimensions: { width: 1200, height: 675 },
    aspectRatio: "16:9",
    features: ["large_image", "summary_card"],
    maxTextLength: {
      headline: 70,
      description: 200
    }
  },
  facebook: {
    dimensions: { width: 1200, height: 630 },
    aspectRatio: "1.91:1",
    features: ["og_image", "link_preview"],
    maxTextLength: {
      headline: 65,
      description: 155
    }
  },
  instagram: {
    dimensions: { width: 1080, height: 1080 },
    aspectRatio: "1:1",
    features: ["square_post", "story_ready"],
    maxTextLength: {
      headline: 50,
      description: 125
    }
  },
  whatsapp: {
    dimensions: { width: 1280, height: 720 },
    aspectRatio: "16:9",
    features: ["link_preview", "large_thumbnail"],
    maxTextLength: {
      headline: 60,
      description: 120
    }
  },
  linkedin: {
    dimensions: { width: 1200, height: 627 },
    aspectRatio: "1.91:1",
    features: ["professional", "article_card"],
    maxTextLength: {
      headline: 70,
      description: 160
    }
  }
};

// ============================================
// CARD TEMPLATES
// ============================================

interface CardTemplate {
  id: string;
  name: string;
  nameAr: string;
  style: string;
  layouts: {
    headline: { position: string; size: string; weight: string };
    description: { position: string; size: string; };
    branding: { position: string; size: string; };
    overlay: { type: string; opacity: number; };
  };
  colors: {
    primary: string;
    secondary: string;
    text: string;
    background: string;
  };
}

const CARD_TEMPLATES: CardTemplate[] = [
  {
    id: "breaking_news",
    name: "Breaking News",
    nameAr: "عاجل",
    style: "urgent",
    layouts: {
      headline: { position: "center-top", size: "extra-large", weight: "bold" },
      description: { position: "center-middle", size: "medium" },
      branding: { position: "bottom-right", size: "small" },
      overlay: { type: "gradient", opacity: 0.8 }
    },
    colors: {
      primary: "#FF0000",
      secondary: "#000000",
      text: "#FFFFFF",
      background: "#1A1A1A"
    }
  },
  {
    id: "feature_story",
    name: "Feature Story",
    nameAr: "قصة مميزة",
    style: "elegant",
    layouts: {
      headline: { position: "bottom-left", size: "large", weight: "semibold" },
      description: { position: "bottom-left", size: "small" },
      branding: { position: "top-left", size: "medium" },
      overlay: { type: "solid", opacity: 0.6 }
    },
    colors: {
      primary: "#0066CC",
      secondary: "#FFFFFF",
      text: "#FFFFFF",
      background: "#003366"
    }
  },
  {
    id: "minimal",
    name: "Minimal",
    nameAr: "بسيط",
    style: "clean",
    layouts: {
      headline: { position: "center", size: "large", weight: "medium" },
      description: { position: "center-bottom", size: "small" },
      branding: { position: "top-center", size: "small" },
      overlay: { type: "blur", opacity: 0.4 }
    },
    colors: {
      primary: "#333333",
      secondary: "#666666",
      text: "#000000",
      background: "#FFFFFF"
    }
  },
  {
    id: "vibrant",
    name: "Vibrant",
    nameAr: "حيوي",
    style: "colorful",
    layouts: {
      headline: { position: "top-left", size: "large", weight: "bold" },
      description: { position: "middle-left", size: "medium" },
      branding: { position: "bottom-center", size: "medium" },
      overlay: { type: "gradient", opacity: 0.7 }
    },
    colors: {
      primary: "#FF6B35",
      secondary: "#F72585",
      text: "#FFFFFF",
      background: "#4361EE"
    }
  }
];

// ============================================
// SOCIAL MEDIA CARD GENERATION
// ============================================

export interface SocialCardRequest {
  articleId: string;
  articleTitle: string;
  articleSummary?: string;
  category: string;
  language: "ar" | "en" | "ur";
  platform: "twitter" | "facebook" | "instagram" | "whatsapp" | "linkedin" | "all";
  template?: string;
  customBranding?: {
    logo?: string;
    watermark?: string;
    tagline?: string;
  };
}

export interface SocialCardResult {
  success: boolean;
  cards?: Array<{
    platform: string;
    imageUrl: string;
    thumbnailUrl: string;
    dimensions: { width: number; height: number };
    template: string;
  }>;
  processingTime?: number;
  cost?: number;
  error?: string;
}

/**
 * Generate social media cards for an article
 */
export async function generateSocialMediaCards(
  request: SocialCardRequest,
  userId: string
): Promise<SocialCardResult> {
  const startTime = Date.now();
  
  try {
    console.log(`[Social Cards] Generating for article: ${request.articleId}`);
    
    // Determine which platforms to generate for
    const platforms = request.platform === "all" 
      ? Object.keys(PLATFORM_SPECS)
      : [request.platform];
    
    const generatedCards = [];
    let totalCost = 0;
    
    // Generate card for each platform
    for (const platform of platforms) {
      const spec = PLATFORM_SPECS[platform];
      const template = CARD_TEMPLATES.find(t => t.id === request.template) || CARD_TEMPLATES[0];
      
      console.log(`[Social Cards] Generating ${platform} card...`);
      
      // Build platform-specific prompt
      const prompt = buildSocialCardPrompt({
        ...request,
        platform,
        spec,
        template
      });
      
      // Generate image using Visual AI with timeout
      const imageGenerationPromise = generateNewsImage({
        articleTitle: request.articleTitle,
        articleSummary: createPlatformOptimizedText(
          request.articleSummary || request.articleTitle,
          spec.maxTextLength.description
        ),
        category: request.category,
        language: request.language,
        style: getStyleForTemplate(template),
        mood: getMoodForCategory(request.category)
      });
      
      // Add 30 second timeout for each platform
      const timeoutPromise = new Promise<any>((_, reject) => {
        setTimeout(() => reject(new Error(`Timeout generating ${platform} card`)), 30000);
      });
      
      let result;
      try {
        result = await Promise.race([imageGenerationPromise, timeoutPromise]);
      } catch (timeoutError) {
        console.error(`[Social Cards] Timeout or error for ${platform}:`, timeoutError);
        continue; // Skip this platform and try the next one
      }
      
      if (result.success && result.imageUrl) {
        // Save to database
        const [savedCard] = await db.insert(socialMediaCards).values({
          articleId: request.articleId,
          userId,
          platform,
          cardType: "social",
          template: template.id,
          language: request.language,
          imageUrl: result.imageUrl,
          thumbnailUrl: result.thumbnailUrl,
          headline: createPlatformOptimizedText(
            request.articleTitle,
            spec.maxTextLength.headline
          ),
          subheadline: request.articleSummary,
          dimensions: spec.dimensions,
          generationTime: result.generationTime,
          cost: result.cost,
          status: "completed"
        }).returning();
        
        generatedCards.push({
          platform,
          imageUrl: result.imageUrl,
          thumbnailUrl: result.thumbnailUrl || result.imageUrl,
          dimensions: spec.dimensions,
          template: template.id,
          cardId: savedCard.id
        });
        
        totalCost += result.cost || 0;
      }
    }
    
    const processingTime = Date.now() - startTime;
    console.log(`[Social Cards] Generated ${generatedCards.length} cards in ${processingTime}ms`);
    
    // Return success if at least one card was generated
    if (generatedCards.length > 0) {
      return {
        success: true,
        cards: generatedCards,
        processingTime,
        cost: totalCost
      };
    }
    
    // If no cards were generated, return error
    return {
      success: false,
      processingTime,
      error: `Failed to generate cards for all platforms. Please try again.`
    };
    
  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    console.error("[Social Cards] Generation failed:", error);
    
    return {
      success: false,
      processingTime,
      error: error.message || "Social card generation failed"
    };
  }
}

// ============================================
// BATCH GENERATION
// ============================================

/**
 * Generate all social media cards for multiple articles
 */
export async function batchGenerateSocialCards(
  articleIds: string[],
  userId: string
): Promise<{
  success: boolean;
  generated: number;
  failed: number;
  results: Array<{ articleId: string; success: boolean; error?: string }>;
}> {
  console.log(`[Social Cards] Batch generating for ${articleIds.length} articles`);
  
  const results = [];
  let generated = 0;
  let failed = 0;
  
  for (const articleId of articleIds) {
    try {
      // Get article details (simplified for now)
      // In production, fetch from database
      const article = {
        id: articleId,
        title: "Article Title",
        summary: "Article Summary",
        category: "news",
        language: "ar" as const
      };
      
      const result = await generateSocialMediaCards({
        articleId,
        articleTitle: article.title,
        articleSummary: article.summary,
        category: article.category,
        language: article.language,
        platform: "all"
      }, userId);
      
      if (result.success) {
        generated++;
        results.push({ articleId, success: true });
      } else {
        failed++;
        results.push({ articleId, success: false, error: result.error });
      }
      
    } catch (error: any) {
      failed++;
      results.push({ 
        articleId, 
        success: false, 
        error: error.message || "Unknown error" 
      });
    }
  }
  
  return {
    success: failed === 0,
    generated,
    failed,
    results
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Build platform-specific prompt
 */
function buildSocialCardPrompt(params: any): string {
  const { platform, spec, template, articleTitle, language } = params;
  
  return `
Create a social media card optimized for ${platform}:
Platform: ${platform}
Dimensions: ${spec.dimensions.width}x${spec.dimensions.height}
Aspect Ratio: ${spec.aspectRatio}
Template: ${template.name}
Style: ${template.style}

Article: ${articleTitle}
Language: ${language}

Requirements:
- Professional news design
- Platform-optimized layout
- Clear text hierarchy
- Brand consistency
- High visual impact
- No text overlays (will be added separately)
- ${spec.features.join(", ")}

Color Scheme:
- Primary: ${template.colors.primary}
- Secondary: ${template.colors.secondary}
- Background: ${template.colors.background}
`;
}

/**
 * Optimize text for platform character limits
 */
function createPlatformOptimizedText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  
  // Smart truncation - try to break at word boundary
  const truncated = text.substring(0, maxLength - 3);
  const lastSpace = truncated.lastIndexOf(" ");
  
  if (lastSpace > maxLength * 0.8) {
    return truncated.substring(0, lastSpace) + "...";
  }
  
  return truncated + "...";
}

/**
 * Get style based on template
 */
function getStyleForTemplate(template: CardTemplate): "photorealistic" | "illustration" | "abstract" | "infographic" {
  const styleMap: Record<string, any> = {
    "breaking_news": "photorealistic",
    "feature_story": "illustration",
    "minimal": "abstract",
    "vibrant": "illustration"
  };
  
  return styleMap[template.id] || "photorealistic";
}

/**
 * Get mood based on category
 */
function getMoodForCategory(category: string): "breaking" | "neutral" | "positive" | "serious" | "dramatic" {
  const moodMap: Record<string, any> = {
    "urgent": "breaking",
    "politics": "serious",
    "sports": "positive",
    "economy": "serious",
    "technology": "neutral",
    "entertainment": "positive",
    "crime": "dramatic"
  };
  
  return moodMap[category] || "neutral";
}

// ============================================
// CARD ANALYTICS
// ============================================

/**
 * Track card performance
 */
export async function trackCardPerformance(
  cardId: string,
  metrics: {
    shares?: number;
    clicks?: number;
    impressions?: number;
    engagement?: number;
  }
): Promise<void> {
  try {
    const card = await db.query.socialMediaCards.findFirst({
      where: eq(socialMediaCards.id, cardId)
    });
    
    if (card) {
      await db.update(socialMediaCards)
        .set({
          shareCount: (card.shareCount || 0) + (metrics.shares || 0),
          downloadCount: (card.downloadCount || 0) + (metrics.clicks || 0),
          engagementScore: (card.engagementScore || 0) + ((metrics.engagement || 0) / 100)
        })
        .where(eq(socialMediaCards.id, cardId));
    }
  } catch (error) {
    console.error("[Social Cards] Failed to track performance:", error);
  }
}

// ============================================
// TEMPLATE RECOMMENDATIONS
// ============================================

/**
 * Recommend best template based on content
 */
export function recommendTemplate(
  category: string,
  mood: string,
  language: string
): CardTemplate {
  // Smart template selection logic
  if (category === "urgent" || mood === "breaking") {
    return CARD_TEMPLATES.find(t => t.id === "breaking_news")!;
  }
  
  if (category === "feature" || category === "analysis") {
    return CARD_TEMPLATES.find(t => t.id === "feature_story")!;
  }
  
  if (mood === "positive" || category === "entertainment") {
    return CARD_TEMPLATES.find(t => t.id === "vibrant")!;
  }
  
  // Default to minimal for professional look
  return CARD_TEMPLATES.find(t => t.id === "minimal")!;
}

// Export all functions
export default {
  generateSocialMediaCards,
  batchGenerateSocialCards,
  trackCardPerformance,
  recommendTemplate,
  PLATFORM_SPECS,
  CARD_TEMPLATES
};