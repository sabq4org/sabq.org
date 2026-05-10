/**
 * Visual AI Service - Image Analysis & Smart Generation
 * Uses Google Gemini 3 Pro Image (gemini-3-pro-image-preview) for:
 * - Image quality analysis
 * - Content detection & description
 * - Multilingual Alt text generation (Arabic, English, Urdu)
 * - Smart visual recommendations
 */

import { GoogleGenAI } from "@google/genai";
import { ObjectStorageService } from "../objectStorage";
import pRetry from "p-retry";
import https from "https";
import http from "http";

// Initialize Gemini client with API key
const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
if (!apiKey) {
  console.error("[Visual AI] CRITICAL: GEMINI_API_KEY or AI_INTEGRATIONS_GEMINI_API_KEY is not set!");
} else {
  console.log("[Visual AI] API key configured successfully");
}

const geminiClient = new GoogleGenAI({
  apiKey: apiKey || "missing-api-key",
});

const objectStorageService = new ObjectStorageService();

// Helper to check rate limit errors
function isRateLimitError(error: any): boolean {
  const errorMsg = error?.message || String(error);
  return (
    errorMsg.includes("429") ||
    errorMsg.includes("RATELIMIT_EXCEEDED") ||
    errorMsg.toLowerCase().includes("quota") ||
    errorMsg.toLowerCase().includes("rate limit")
  );
}

// ============================================
// IMAGE ANALYSIS
// ============================================

export interface ImageAnalysisRequest {
  imageUrl: string;
  articleTitle?: string; // For relevance checking
  articleContent?: string; // For relevance checking
  checkQuality?: boolean;
  generateAltText?: boolean;
  detectContent?: boolean;
  checkRelevance?: boolean;
}

export interface ImageAnalysisResult {
  success: boolean;
  
  // Quality metrics
  qualityScore?: number; // 0-100
  qualityMetrics?: {
    resolution: string; // e.g., "1920x1080"
    sharpness: string; // excellent, good, fair, poor
    lighting: string; // excellent, good, fair, poor
    composition: string; // excellent, good, fair, poor
    issues?: string[]; // Array of detected issues
  };
  
  // Content detection
  contentDescription?: {
    ar: string;
    en: string;
    ur: string;
  };
  detectedObjects?: string[]; // Array of detected objects/people/places
  dominantColors?: string[]; // Array of hex colors
  tags?: string[]; // Auto-generated tags
  
  // Alt text (multilingual)
  altTextAr?: string;
  altTextEn?: string;
  altTextUr?: string;
  
  // Content warnings
  hasAdultContent?: boolean;
  hasSensitiveContent?: boolean;
  contentWarnings?: string[];
  
  // Relevance to article
  relevanceScore?: number; // 0-100
  matchingSuggestions?: string[]; // Better image suggestions
  
  // Metadata
  processingTime?: number; // milliseconds
  cost?: number;
  error?: string;
}

/**
 * Download image from URL to base64
 */
async function downloadImageToBase64(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    
    client.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download image: ${response.statusCode}`));
        return;
      }
      
      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const base64 = buffer.toString('base64');
        resolve(base64);
      });
      response.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Analyze image using Gemini 3 Pro Image
 */
export async function analyzeImage(request: ImageAnalysisRequest): Promise<ImageAnalysisResult> {
  const startTime = Date.now();
  
  try {
    console.log(`[Visual AI] Analyzing image: ${request.imageUrl}`);
    
    // Download image to base64
    const imageBase64 = await downloadImageToBase64(request.imageUrl);
    console.log(`[Visual AI] Image downloaded, size: ${imageBase64.length} bytes`);
    
    // Build comprehensive analysis prompt
    const promptParts: string[] = [];
    
    if (request.checkQuality) {
      promptParts.push(`
تحليل جودة الصورة (Quality Analysis):
- قيّم الدقة والوضوح (Resolution & Sharpness): ممتاز/جيد/مقبول/ضعيف
- قيّم الإضاءة (Lighting): ممتاز/جيد/مقبول/ضعيف
- قيّم التكوين والتأطير (Composition): ممتاز/جيد/مقبول/ضعيف
- اذكر أي مشاكل في الجودة
- أعط درجة إجمالية من 0-100
      `);
    }
    
    if (request.detectContent) {
      promptParts.push(`
اكتشاف المحتوى (Content Detection):
- اذكر جميع الأشياء/الأشخاص/الأماكن الظاهرة في الصورة
- حدد الألوان السائدة (hex codes)
- اقترح tags وصفية للصورة
- حدد إذا كان هناك محتوى حساس أو غير مناسب
      `);
    }
    
    if (request.generateAltText) {
      promptParts.push(`
توليد Alt Text بثلاث لغات:
- عربي: وصف دقيق ومختصر للصورة (25-50 كلمة)
- English: Precise and concise description (25-50 words)
- اردو: ایک درست اور مختصر تفصیل (25-50 الفاظ)
      `);
    }
    
    if (request.checkRelevance && request.articleTitle) {
      promptParts.push(`
تحليل مطابقة الصورة للمقال:
عنوان المقال: ${request.articleTitle}
${request.articleContent ? `محتوى المقال: ${request.articleContent.substring(0, 500)}...` : ''}
- قيّم مدى ملائمة الصورة للمقال (0-100)
- اقترح نوع صور أفضل إن كانت الصورة غير مناسبة
      `);
    }
    
    const fullPrompt = `
قم بتحليل هذه الصورة بشكل شامل واحترافي:

${promptParts.join('\n\n')}

أجب بصيغة JSON التالية بالضبط:
{
  "qualityScore": 85,
  "qualityMetrics": {
    "resolution": "1920x1080",
    "sharpness": "excellent",
    "lighting": "good",
    "composition": "excellent",
    "issues": ["slight blur in background"]
  },
  "contentDescription": {
    "ar": "وصف بالعربية...",
    "en": "Description in English...",
    "ur": "اردو میں تفصیل..."
  },
  "detectedObjects": ["person", "building", "car"],
  "dominantColors": ["#FF5733", "#3498DB"],
  "tags": ["technology", "innovation", "news"],
  "altTextAr": "نص بديل بالعربية...",
  "altTextEn": "Alt text in English...",
  "altTextUr": "متبادل متن اردو میں...",
  "hasAdultContent": false,
  "hasSensitiveContent": false,
  "contentWarnings": [],
  "relevanceScore": 90,
  "matchingSuggestions": ["Use image with more focus on technology"]
}

ملاحظة: اجب بـ JSON فقط بدون أي نص إضافي.
`;
    
    // Call Gemini 3 Pro Image with retry logic
    const response = await pRetry(
      async () => {
        try {
          return await geminiClient.models.generateContent({
            model: "gemini-3-pro-image-preview",
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: fullPrompt
                  },
                  {
                    inlineData: {
                      data: imageBase64,
                      mimeType: "image/jpeg"
                    }
                  }
                ]
              }
            ],
            config: {
              temperature: 0.2, // Low temperature for more consistent JSON
              maxOutputTokens: 2048,
            }
          });
        } catch (error: any) {
          console.error(`[Visual AI] Analysis error:`, error);
          if (isRateLimitError(error)) {
            throw error; // Retry
          }
          const abortError: any = new Error(error.message);
          abortError.name = 'AbortError';
          throw abortError;
        }
      },
      {
        retries: 3,
        minTimeout: 2000,
        maxTimeout: 10000,
        factor: 2,
        onFailedAttempt: (error) => {
          console.log(`[Visual AI] Attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left.`);
        }
      }
    );
    
    const processingTime = Date.now() - startTime;
    
    // Extract text response
    const candidate = response.candidates?.[0];
    const textPart = candidate?.content?.parts?.find((part: any) => part.text);
    
    if (!textPart?.text) {
      console.error(`[Visual AI] No text response from Gemini`);
      return {
        success: false,
        processingTime,
        error: "No response from AI model"
      };
    }
    
    // Parse JSON response
    let analysisData: any;
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonText = textPart.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      analysisData = JSON.parse(jsonText);
    } catch (error) {
      console.error(`[Visual AI] Failed to parse JSON response:`, textPart.text);
      return {
        success: false,
        processingTime,
        error: "Failed to parse AI response"
      };
    }
    
    console.log(`[Visual AI] Analysis completed in ${processingTime}ms`);
    
    // Calculate cost (Gemini 3 Pro Image pricing - estimated)
    const cost = 0.02; // $0.02 per image analysis
    
    return {
      success: true,
      ...analysisData,
      processingTime,
      cost
    };
    
  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    console.error(`[Visual AI] Analysis failed:`, error);
    
    return {
      success: false,
      processingTime,
      error: error.message || "Image analysis failed"
    };
  }
}

// ============================================
// SMART NEWS IMAGE GENERATION
// ============================================

export interface NewsImageGenerationRequest {
  articleTitle: string;
  articleSummary?: string;
  category: string;
  language: "ar" | "en" | "ur";
  style?: "photorealistic" | "illustration" | "abstract" | "infographic";
  mood?: "breaking" | "neutral" | "positive" | "serious" | "dramatic";
}

export interface NewsImageGenerationResult {
  success: boolean;
  imageUrl?: string;
  thumbnailUrl?: string;
  blurDataUrl?: string;
  generationTime?: number;
  cost?: number;
  error?: string;
}

/**
 * Generate smart news image based on article content
 */
export async function generateNewsImage(request: NewsImageGenerationRequest): Promise<NewsImageGenerationResult> {
  const startTime = Date.now();
  
  try {
    console.log(`[Visual AI] Generating news image for: ${request.articleTitle}`);
    
    // Build smart prompt based on article
    const styleGuide: Record<string, string> = {
      photorealistic: "professional photojournalism style, high quality, realistic",
      illustration: "modern digital illustration, clean and professional",
      abstract: "abstract artistic representation, contemporary design",
      infographic: "infographic style, data visualization, modern design"
    };
    
    const moodGuide: Record<string, string> = {
      breaking: "dramatic, urgent, attention-grabbing",
      neutral: "balanced, professional, informative",
      positive: "uplifting, bright, optimistic",
      serious: "serious tone, professional, authoritative",
      dramatic: "high contrast, dramatic lighting, impactful"
    };
    
    const style = request.style || "photorealistic";
    const mood = request.mood || "neutral";
    
    const languageContext = request.language === "ar" ? "Arabic news context" :
                           request.language === "ur" ? "Urdu news context" :
                           "English news context";
    
    const prompt = `
Create a professional news image for this article:
Title: ${request.articleTitle}
${request.articleSummary ? `Summary: ${request.articleSummary}` : ''}
Category: ${request.category}
Language: ${languageContext}

Style: ${styleGuide[style]}
Mood: ${moodGuide[mood]}

CRITICAL REQUIREMENTS:
- ABSOLUTELY NO TEXT, LETTERS, WORDS, NUMBERS, CHARACTERS, OR TYPOGRAPHY OF ANY KIND IN THE IMAGE
- NO Arabic text, NO English text, NO text in any language whatsoever
- NO watermarks, NO logos, NO signs with writing, NO banners with text
- NO newspapers, books, or any objects containing visible text
- The image must be 100% text-free and purely visual
- High quality, suitable for news publication
- Culturally appropriate for ${languageContext}
- Professional and credible
- 16:9 aspect ratio
- Focus on visual storytelling through imagery only
- Clean, modern composition with no textual elements
`;
    
    // Use Nano Banana Pro service (reuse existing service)
    const { generateImage } = await import("./nanoBananaService");
    
    const result = await generateImage({
      prompt,
      aspectRatio: "16:9",
      imageSize: "2K",
      numImages: 1,
      enableSearchGrounding: true, // Use Google Search for factual accuracy
      enableThinking: true
    });
    
    const generationTime = Date.now() - startTime;
    
    if (!result.success || !result.imageData) {
      return {
        success: false,
        generationTime,
        error: result.error || "Image generation failed"
      };
    }
    
    // Upload to GCS with WebP optimization and thumbnail generation
    const fileName = `news-${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
    const { uploadImageToStorage } = await import("./nanoBananaService");
    const uploaded = await uploadImageToStorage(result.imageData, fileName);
    
    console.log(`[Visual AI] News image generated and optimized in ${generationTime}ms`);
    
    return {
      success: true,
      imageUrl: uploaded.url,
      thumbnailUrl: uploaded.thumbnailUrl,
      blurDataUrl: uploaded.blurDataUrl,
      generationTime,
      cost: result.cost
    };
    
  } catch (error: any) {
    const generationTime = Date.now() - startTime;
    console.error(`[Visual AI] News image generation failed:`, error);
    
    return {
      success: false,
      generationTime,
      error: error.message || "News image generation failed"
    };
  }
}

// Export all functions
export default {
  analyzeImage,
  generateNewsImage
};
