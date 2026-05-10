/**
 * AI Smart Thumbnail Service
 * يستخدم Gemini AI لإنشاء صور مصغرة احترافية بنسبة 16:9
 * الصور تُحفظ بشكل دائم في Object Storage
 */

import { GoogleGenAI, Modality } from '@google/genai';
import pRetry from 'p-retry';
import { db } from '../db';
import { articles } from '@shared/schema';
import { eq } from 'drizzle-orm';
import fetch from 'node-fetch';
import { ObjectStorageService } from '../objectStorage';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error('[AI Smart Thumbnail] ⚠️ GEMINI_API_KEY not configured');
}

const geminiClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

interface SmartThumbnailOptions {
  imageUrl: string;
  articleTitle?: string;
  articleExcerpt?: string;
  style?: 'professional' | 'vibrant' | 'minimal' | 'news' | 'modern';
  aspectRatio?: '16:9' | '4:3' | '1:1';
  imageSize?: '2K' | '4K';
}

interface SmartThumbnailResult {
  thumbnailUrl: string;
  prompt: string;
  model: string;
  generationTime: number;
  cost: number;
}

/**
 * Check if error is rate limit error
 */
function isRateLimitError(error: any): boolean {
  const errorMessage = error?.message?.toLowerCase() || '';
  return errorMessage.includes('rate limit') || 
         errorMessage.includes('quota') ||
         errorMessage.includes('429');
}

/**
 * Upload thumbnail to Replit Object Storage (persistent)
 * استخدام Object Storage الدائم بدلاً من المجلد المؤقت
 */
async function uploadToStorage(
  buffer: Buffer,
  filename: string
): Promise<string> {
  try {
    const objectStorage = new ObjectStorageService();
    
    // Upload to public directory for accessibility
    const path = `ai-thumbnails/${filename}`;
    const result = await objectStorage.uploadFile(
      path,
      buffer,
      'image/jpeg',
      'public'
    );
    
    console.log(`[AI Smart Thumbnail] ✅ Uploaded to Object Storage: ${result.path}`);
    
    // Return path that serves through /public-objects/ route
    return `/public-objects/${path}`;
  } catch (error: any) {
    console.error(`[AI Smart Thumbnail] Object Storage upload failed:`, error.message);
    
    // Fallback to local storage (temporary - will warn)
    console.warn(`[AI Smart Thumbnail] ⚠️ Falling back to temporary local storage - files may be lost!`);
    const fs = await import('fs/promises');
    const pathModule = await import('path');
    const uploadDir = pathModule.join(process.cwd(), 'uploads', 'ai-thumbnails');
    
    await fs.mkdir(uploadDir, { recursive: true });
    
    const filepath = pathModule.join(uploadDir, filename);
    await fs.writeFile(filepath, buffer);
    
    return `/uploads/ai-thumbnails/${filename}`;
  }
}

/**
 * Analyze original image and generate description
 */
async function analyzeImage(imageUrl: string): Promise<string> {
  try {
    console.log(`[AI Smart Thumbnail] Analyzing image: ${imageUrl}`);
    
    // Fetch the image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    
    const buffer = await response.buffer();
    const base64Image = buffer.toString('base64');
    
    // Use Gemini to analyze the image
    const analysisResponse = await pRetry(
      async () => {
        try {
          return await geminiClient.models.generateContent({
            model: 'gemini-3-pro',
            contents: [{
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: base64Image
                  }
                },
                {
                  text: `Analyze this image and provide a detailed description focusing on:
1. Main subject and composition
2. Key visual elements and colors
3. Mood and atmosphere
4. Important details that should be preserved

Provide only the description, no other text.`
                }
              ]
            }]
          });
        } catch (error: any) {
          if (isRateLimitError(error)) {
            throw error;
          }
          const abortError: any = new Error(error.message);
          abortError.name = 'AbortError';
          throw abortError;
        }
      },
      {
        retries: 3,
        minTimeout: 2000,
        maxTimeout: 15000,
        factor: 2
      }
    );
    
    // Extract description
    const description = analysisResponse.candidates?.[0]?.content?.parts
      ?.find((part: any) => part.text)?.text || 'professional news image';
    
    console.log(`[AI Smart Thumbnail] Image description: ${description.substring(0, 100)}...`);
    return description;
    
  } catch (error: any) {
    console.error('[AI Smart Thumbnail] Image analysis failed:', error.message);
    return 'professional news image with clear composition and strong visual impact';
  }
}

/**
 * Generate AI Smart Thumbnail
 */
export async function generateSmartThumbnail(
  options: SmartThumbnailOptions
): Promise<SmartThumbnailResult> {
  const startTime = Date.now();
  
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }
  
  const {
    imageUrl,
    articleTitle,
    articleExcerpt,
    style = 'news',
    aspectRatio = '16:9',
    imageSize = '2K'
  } = options;
  
  console.log(`[AI Smart Thumbnail] Starting generation for: ${articleTitle || 'untitled'}`);
  
  // Step 1: Analyze the original image
  const imageDescription = await analyzeImage(imageUrl);
  
  // Step 2: Build generation prompt
  const stylePrompts = {
    professional: 'professional news photography style, clean composition, high-quality photojournalism',
    vibrant: 'vibrant colors, dynamic composition, eye-catching visual impact, energetic mood',
    minimal: 'minimal design, clean lines, focused subject, modern aesthetic',
    news: 'professional news style, clear focal point, informative composition, journalistic quality',
    modern: 'modern editorial style, contemporary design, sophisticated composition'
  };
  
  const prompt = `Create a professional 16:9 news thumbnail based on this description:

${imageDescription}

${articleTitle ? `Article title: ${articleTitle}` : ''}
${articleExcerpt ? `Context: ${articleExcerpt.substring(0, 200)}` : ''}

Style: ${stylePrompts[style]}

Requirements:
- 16:9 aspect ratio optimized for news cards
- Clear focal point and strong composition
- High visual impact suitable for thumbnails
- Professional news photography quality
- Preserve the essence and key elements of the original
- Suitable for Arabic news platform (RTL context)
- No text or watermarks in the image

Create a compelling thumbnail that captures attention while maintaining journalistic integrity.`;
  
  console.log(`[AI Smart Thumbnail] Generated prompt: ${prompt.substring(0, 150)}...`);
  
  // Step 3: Generate image using Gemini
  const response = await pRetry(
    async () => {
      try {
        return await geminiClient.models.generateContent({
          model: 'gemini-3-pro-image-preview',
          contents: [{
            role: 'user',
            parts: [{ text: prompt }]
          }],
          config: {
            responseModalities: [Modality.IMAGE],
            imageConfig: {
              aspectRatio,
              imageSize
            }
          }
        });
      } catch (error: any) {
        console.error(`[AI Smart Thumbnail] Generation error:`, error);
        if (isRateLimitError(error)) {
          throw error;
        }
        const abortError: any = new Error(error.message);
        abortError.name = 'AbortError';
        throw abortError;
      }
    },
    {
      retries: 5,
      minTimeout: 3000,
      maxTimeout: 30000,
      factor: 2,
      onFailedAttempt: (error) => {
        console.log(`[AI Smart Thumbnail] Attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left.`);
      }
    }
  );
  
  // Step 4: Extract image data (multiple fallback methods)
  let imageBase64: string | null = null;
  let mimeType = 'image/jpeg';
  const candidate = response.candidates?.[0];
  
  // Method 1: Check candidates[0].content.parts for inlineData
  if (candidate?.content?.parts) {
    const imagePart = candidate.content.parts.find((part: any) => part.inlineData);
    if (imagePart?.inlineData?.data) {
      console.log(`[AI Smart Thumbnail] ✅ Found image in candidates[0].content.parts.inlineData`);
      imageBase64 = imagePart.inlineData.data;
      mimeType = imagePart.inlineData.mimeType || 'image/jpeg';
    }
  }
  
  // Method 2: Check direct parts array
  if (!imageBase64 && (response as any).parts) {
    const imagePart = (response as any).parts.find((part: any) => part.inlineData);
    if (imagePart?.inlineData?.data) {
      console.log(`[AI Smart Thumbnail] ✅ Found image in response.parts.inlineData`);
      imageBase64 = imagePart.inlineData.data;
      mimeType = imagePart.inlineData.mimeType || 'image/jpeg';
    }
  }
  
  // Method 3: Check if response itself has image data
  if (!imageBase64 && (response as any).data) {
    console.log(`[AI Smart Thumbnail] ✅ Found image in response.data`);
    imageBase64 = (response as any).data;
  }
  
  // Method 4: Check text response for base64 (sometimes models return it as text)
  if (!imageBase64 && candidate?.content?.parts) {
    const textPart = candidate.content.parts.find((part: any) => part.text);
    if (textPart?.text && textPart.text.includes('base64')) {
      console.log(`[AI Smart Thumbnail] ⚠️ Found potential base64 in text response`);
      const base64Match = textPart.text.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/);
      if (base64Match) {
        imageBase64 = base64Match[1];
        console.log(`[AI Smart Thumbnail] ✅ Extracted base64 from text response`);
      }
    }
  }
  
  // Method 5: Check if image is in candidate.content.image
  if (!imageBase64 && candidate && (candidate.content as any)?.image) {
    console.log(`[AI Smart Thumbnail] ✅ Found image in candidate.content.image`);
    const contentImage = (candidate.content as any).image;
    if (typeof contentImage === 'string') {
      imageBase64 = contentImage;
    } else if (contentImage.data) {
      imageBase64 = contentImage.data;
      mimeType = contentImage.mimeType || 'image/jpeg';
    }
  }
  
  // Method 6: Check all parts for any image-related data
  if (!imageBase64 && candidate?.content?.parts) {
    for (const part of candidate.content.parts) {
      const anyPart = part as any;
      if (anyPart.image || anyPart.imageData || anyPart.generatedImage) {
        const imageField = anyPart.image || anyPart.imageData || anyPart.generatedImage;
        if (typeof imageField === 'string') {
          console.log(`[AI Smart Thumbnail] ✅ Found image in part.image/imageData/generatedImage`);
          imageBase64 = imageField;
          break;
        } else if (imageField.data) {
          console.log(`[AI Smart Thumbnail] ✅ Found image in part.image.data`);
          imageBase64 = imageField.data;
          mimeType = imageField.mimeType || 'image/jpeg';
          break;
        }
      }
    }
  }
  
  if (!imageBase64) {
    console.error(`[AI Smart Thumbnail] ❌ No image data found after all extraction methods.`);
    console.error(`[AI Smart Thumbnail] Full response (first 3000 chars):`, JSON.stringify(response, null, 2).substring(0, 3000));
    throw new Error('Failed to generate thumbnail - no image data in response');
  }
  
  // Step 5: Upload to storage
  const buffer = Buffer.from(imageBase64, 'base64');
  const timestamp = Date.now();
  const filename = `smart_thumbnail_${timestamp}.jpg`;
  
  const thumbnailUrl = await uploadToStorage(buffer, filename);
  
  const generationTime = Math.round((Date.now() - startTime) / 1000);
  const cost = imageSize === '4K' ? 0.24 : 0.134;
  
  console.log(`[AI Smart Thumbnail] ✅ Generated successfully in ${generationTime}s`);
  console.log(`[AI Smart Thumbnail] URL: ${thumbnailUrl}`);
  
  return {
    thumbnailUrl,
    prompt,
    model: 'gemini-3-pro-image-preview',
    generationTime,
    cost
  };
}

/**
 * Generate smart thumbnail for an article
 * Supports both saved articles (via articleId) and unsaved articles (via direct title/excerpt)
 * 
 * @param articleId - Article ID (required for backward compatibility)
 * @param imageUrl - Source image URL
 * @param options - Optional parameters including title, excerpt, style
 */
export async function generateArticleSmartThumbnail(
  articleId: string,
  imageUrl: string,
  options: {
    title?: string;
    excerpt?: string;
    style?: 'professional' | 'vibrant' | 'minimal' | 'news' | 'modern';
    aspectRatio?: '16:9' | '4:3' | '1:1';
    imageSize?: '2K' | '4K';
  } = {}
): Promise<string> {
  try {
    const { title: optionTitle, excerpt: optionExcerpt, ...thumbnailOptions } = options;
    
    let title = optionTitle;
    let excerpt = optionExcerpt;
    
    // If title not provided (undefined or null), fetch from database
    // Empty strings are considered valid data
    if ((title === undefined || title === null) && articleId) {
      console.log(`[AI Smart Thumbnail] Fetching article details for ID: ${articleId}`);
      const article = await db
        .select()
        .from(articles)
        .where(eq(articles.id, articleId))
        .limit(1);
      
      if (!article || article.length === 0) {
        throw new Error('Article not found');
      }
      
      const articleData = article[0];
      title = articleData.title;
      // Only use DB excerpt if excerpt was not provided (undefined/null)
      // If excerpt is empty string, keep it (drafts can have empty excerpts)
      if (excerpt === undefined || excerpt === null) {
        excerpt = articleData.excerpt || undefined;
      }
    }
    
    console.log(`[AI Smart Thumbnail] Generating thumbnail with title: "${title?.substring(0, 50)}..."`);
    
    // Generate smart thumbnail
    const result = await generateSmartThumbnail({
      imageUrl,
      articleTitle: title,
      articleExcerpt: excerpt,
      ...thumbnailOptions
    });
    
    // Update article in database only if articleId is provided
    if (articleId) {
      await db
        .update(articles)
        .set({
          thumbnailUrl: result.thumbnailUrl,
          isAiGeneratedThumbnail: true,
          aiThumbnailModel: result.model,
          aiThumbnailPrompt: result.prompt
        })
        .where(eq(articles.id, articleId));
      
      console.log(`[AI Smart Thumbnail] Article ${articleId} updated with smart thumbnail`);
    } else {
      console.log(`[AI Smart Thumbnail] Generated thumbnail for unsaved article (no database update)`);
    }
    
    return result.thumbnailUrl;
    
  } catch (error: any) {
    console.error(`[AI Smart Thumbnail] Failed:`, error);
    throw error;
  }
}
