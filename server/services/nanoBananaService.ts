/**
 * Nano Banana Pro Image Generation Service
 * Uses Google Gemini 3 Pro Image (gemini-3-pro-image-preview) for AI image generation
 */

import { GoogleGenAI, Modality } from "@google/genai";
import { ObjectStorageService } from "../objectStorage";
import pRetry from "p-retry";

// Validate required environment variables - Try both possible key names
const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
if (!apiKey) {
  console.error("[Nano Banana Pro] CRITICAL: GEMINI_API_KEY or AI_INTEGRATIONS_GEMINI_API_KEY is not set!");
  console.error("[Nano Banana Pro] Image generation will fail without valid API key");
} else {
  console.log("[Nano Banana Pro] API key configured successfully");
}

// Initialize Gemini client with custom API key
const geminiClient = new GoogleGenAI({
  apiKey: apiKey || "missing-api-key",
});

// Initialize Object Storage Service
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

export interface ImageGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: "1:1" | "16:9" | "4:3" | "9:16" | "21:9" | "3:4";
  imageSize?: "1K" | "2K" | "4K";
  numImages?: number;
  enableSearchGrounding?: boolean;
  enableThinking?: boolean;
  referenceImages?: string[]; // Base64 or URLs
  brandingConfig?: {
    logoUrl?: string;
    watermarkText?: string;
    primaryColor?: string;
    secondaryColor?: string;
  };
  // Text overlay options for "خبر مميز" template
  overlayText?: string;
  overlayOptions?: {
    fontSize?: number;
    fontColor?: string;
    backgroundColor?: string;
    position?: 'center' | 'bottom' | 'top';
  };
}

export interface ImageGenerationResult {
  success: boolean;
  imageUrl?: string;
  thumbnailUrl?: string;
  imageData?: string; // Base64
  generationTime: number;
  cost?: number;
  metadata?: any;
  error?: string;
}

/**
 * Generate image using Nano Banana Pro (Gemini 3 Pro Image)
 */
export async function generateImage(
  request: ImageGenerationRequest
): Promise<ImageGenerationResult> {
  const startTime = Date.now();
  
  try {
    console.log(`[Nano Banana Pro] Generating image with prompt: "${request.prompt.substring(0, 100)}..."`);
    
    // Build the generation request
    const contents: any[] = [{
      role: "user",
      parts: []
    }];
    
    // Add main prompt
    contents[0].parts.push({ text: request.prompt });
    
    // Add negative prompt if provided
    if (request.negativePrompt) {
      contents[0].parts.push({ 
        text: `Avoid: ${request.negativePrompt}` 
      });
    }
    
    // Add reference images if provided (max 14)
    if (request.referenceImages && request.referenceImages.length > 0) {
      const referencesToUse = request.referenceImages.slice(0, 14);
      for (const refImage of referencesToUse) {
        // Assume base64 or fetch from URL
        if (refImage.startsWith('data:')) {
          // Extract base64 data
          const matches = refImage.match(/^data:([^;]+);base64,(.+)$/);
          if (matches) {
            contents[0].parts.push({
              inlineData: {
                mimeType: matches[1],
                data: matches[2]
              }
            });
          }
        }
      }
    }
    
    // Configure generation settings
    const config: any = {
      responseModalities: [Modality.IMAGE],
      imageConfig: {
        aspectRatio: request.aspectRatio || "16:9",
        imageSize: request.imageSize || "2K",
        numImages: request.numImages || 1
      }
    };
    
    // Add Google Search grounding if enabled
    if (request.enableSearchGrounding) {
      config.tools = [{ google_search: {} }];
    }
    
    // Generate with retry logic
    const response = await pRetry(
      async () => {
        try {
          return await geminiClient.models.generateContent({
            model: "gemini-3-pro-image-preview", // Nano Banana Pro
            contents,
            config
          });
        } catch (error: any) {
          console.error(`[Nano Banana Pro] Generation error:`, error);
          if (isRateLimitError(error)) {
            throw error; // Retry
          }
          // Don't retry non-rate-limit errors
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
          console.log(`[Nano Banana Pro] Attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left.`);
        }
      }
    );
    
    const generationTime = Math.round((Date.now() - startTime) / 1000);
    
    // Log full response structure for debugging
    console.log(`[Nano Banana Pro] Response structure:`, JSON.stringify({
      hasResponse: !!response,
      hasCandidates: !!response.candidates,
      candidatesLength: response.candidates?.length,
      responseKeys: Object.keys(response || {}),
      candidateKeys: response.candidates?.[0] ? Object.keys(response.candidates[0]) : null,
      candidateContentKeys: response.candidates?.[0]?.content ? Object.keys(response.candidates[0].content) : null,
      partsCount: response.candidates?.[0]?.content?.parts?.length,
      firstPartKeys: response.candidates?.[0]?.content?.parts?.[0] ? Object.keys(response.candidates[0].content.parts[0]) : null
    }, null, 2));
    
    // Log candidate content structure
    if (response.candidates?.[0]?.content) {
      console.log(`[Nano Banana Pro] Candidate content:`, JSON.stringify(response.candidates[0].content, null, 2).substring(0, 1000));
    }
    
    // Try multiple extraction methods
    let imageBase64: string | null = null;
    let mimeType = "image/png";
    
    // Method 1: Check candidates[0].content.parts for inlineData
    const candidate = response.candidates?.[0];
    if (candidate?.content?.parts) {
      const imagePart = candidate.content.parts.find((part: any) => part.inlineData);
      if (imagePart?.inlineData?.data) {
        console.log(`[Nano Banana Pro] ✅ Found image in candidates[0].content.parts.inlineData`);
        imageBase64 = imagePart.inlineData.data;
        mimeType = imagePart.inlineData.mimeType || "image/png";
      }
    }
    
    // Method 2: Check direct parts array
    if (!imageBase64 && (response as any).parts) {
      const imagePart = (response as any).parts.find((part: any) => part.inlineData);
      if (imagePart?.inlineData?.data) {
        console.log(`[Nano Banana Pro] ✅ Found image in response.parts.inlineData`);
        imageBase64 = imagePart.inlineData.data;
        mimeType = imagePart.inlineData.mimeType || "image/png";
      }
    }
    
    // Method 3: Check if response itself has image data
    if (!imageBase64 && (response as any).data) {
      console.log(`[Nano Banana Pro] ✅ Found image in response.data`);
      imageBase64 = (response as any).data;
    }
    
    // Method 4: Check text response for base64 (sometimes models return it as text)
    if (!imageBase64 && candidate?.content?.parts) {
      const textPart = candidate.content.parts.find((part: any) => part.text);
      if (textPart?.text && textPart.text.includes('base64')) {
        console.log(`[Nano Banana Pro] ⚠️ Found potential base64 in text response`);
        // Try to extract base64 from text
        const base64Match = textPart.text.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/);
        if (base64Match) {
          imageBase64 = base64Match[1];
          console.log(`[Nano Banana Pro] ✅ Extracted base64 from text response`);
        }
      }
    }
    
    // Method 5: Check if image is in candidate.content.image
    if (!imageBase64 && candidate && (candidate.content as any)?.image) {
      console.log(`[Nano Banana Pro] ✅ Found image in candidate.content.image`);
      const contentImage = (candidate.content as any).image;
      if (typeof contentImage === 'string') {
        imageBase64 = contentImage;
      } else if (contentImage.data) {
        imageBase64 = contentImage.data;
        mimeType = contentImage.mimeType || "image/png";
      }
    }
    
    // Method 6: Check all parts for any image-related data
    if (!imageBase64 && candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        const anyPart = part as any;
        // Check for any property that might contain image data
        if (anyPart.image || anyPart.imageData || anyPart.generatedImage) {
          const imageField = anyPart.image || anyPart.imageData || anyPart.generatedImage;
          if (typeof imageField === 'string') {
            console.log(`[Nano Banana Pro] ✅ Found image in part.image/imageData/generatedImage`);
            imageBase64 = imageField;
            break;
          } else if (imageField.data) {
            console.log(`[Nano Banana Pro] ✅ Found image in part.image.data`);
            imageBase64 = imageField.data;
            mimeType = imageField.mimeType || "image/png";
            break;
          }
        }
      }
    }
    
    if (!imageBase64) {
      console.error(`[Nano Banana Pro] ❌ No image data found after all extraction methods.`);
      console.error(`[Nano Banana Pro] Full response (first 3000 chars):`, JSON.stringify(response, null, 2).substring(0, 3000));
      
      // Print all parts for debugging
      if (candidate?.content?.parts) {
        console.error(`[Nano Banana Pro] Parts details:`, candidate.content.parts.map((part: any, idx: number) => ({
          index: idx,
          keys: Object.keys(part),
          hasInlineData: !!part.inlineData,
          hasText: !!part.text,
          hasImage: !!(part.image || part.imageData || part.generatedImage),
          partPreview: JSON.stringify(part).substring(0, 200)
        })));
      }
      
      // Extract finish reason for better error messages
      const finishReason = candidate?.finishReason || (response as any).finishReason;
      const blockReason = (response as any).promptFeedback?.blockReason;
      const safetyRatings = candidate?.safetyRatings || (response as any).promptFeedback?.safetyRatings;
      
      console.error(`[Nano Banana Pro] Finish reason: ${finishReason}`);
      console.error(`[Nano Banana Pro] Block reason: ${blockReason}`);
      if (safetyRatings) {
        console.error(`[Nano Banana Pro] Safety ratings:`, JSON.stringify(safetyRatings, null, 2));
      }
      
      // Generate user-friendly error message in Arabic
      let errorMessage = "تعذر إنشاء الصورة";
      
      if (blockReason === 'SAFETY' || finishReason === 'SAFETY') {
        errorMessage = "تم رفض الطلب لأسباب تتعلق بسياسة المحتوى. حاول تعديل الوصف";
      } else if (finishReason === 'RECITATION') {
        errorMessage = "تعذر إنشاء الصورة لأن الطلب قد يحتوي على محتوى محمي بحقوق النشر";
      } else if (finishReason === 'OTHER' || finishReason === 'STOP') {
        errorMessage = "لم يتمكن النموذج من إنشاء صورة لهذا الطلب. جرب وصفاً مختلفاً";
      } else if (!candidate?.content?.parts || candidate.content.parts.length === 0) {
        errorMessage = "لم يُرجع النموذج أي محتوى. قد يكون الطلب غير مناسب لتوليد الصور أو أن الخدمة مشغولة";
      }
      
      throw new Error(errorMessage);
    }
    
    console.log(`[Nano Banana Pro] ✅ Image generated successfully in ${generationTime}s (${imageBase64.length} bytes)`);
    
    // Calculate estimated cost (based on Nov 2025 pricing)
    const costPerImage = request.imageSize === "4K" ? 0.24 : 0.134;
    const totalCost = costPerImage * (request.numImages || 1);
    
    return {
      success: true,
      imageData: imageBase64,
      generationTime,
      cost: totalCost,
      metadata: {
        model: "gemini-3-pro-image-preview",
        aspectRatio: request.aspectRatio,
        imageSize: request.imageSize,
        thinking: request.enableThinking,
        searchGrounding: request.enableSearchGrounding
      }
    };
  } catch (error: any) {
    const generationTime = Math.round((Date.now() - startTime) / 1000);
    console.error(`[Nano Banana Pro] Generation failed after ${generationTime}s:`, error);
    
    return {
      success: false,
      generationTime,
      error: error.message || "Image generation failed"
    };
  }
}

/**
 * Upload generated image to Google Cloud Storage using Replit's Object Storage
 * Optimizes images by converting to WebP and generating thumbnails
 */
export async function uploadImageToStorage(
  imageBase64: string,
  fileName: string,
  mimeType: string = "image/png"
): Promise<{ url: string; thumbnailUrl?: string; blurDataUrl?: string }> {
  try {
    const sharp = (await import('sharp')).default;
    
    // Convert base64 to buffer
    const originalBuffer = Buffer.from(imageBase64, 'base64');
    
    // Get image metadata
    const metadata = await sharp(originalBuffer).metadata();
    console.log(`[Nano Banana Pro] Original image: ${metadata.width}x${metadata.height}, format: ${metadata.format}`);
    
    // Generate base filename without extension
    const baseName = fileName.replace(/\.(png|jpg|jpeg|webp)$/i, '');
    const timestamp = Date.now();
    const uniqueBase = `${baseName}_${timestamp}`;
    
    // Convert to WebP with smart compression (maintains quality, reduces size by ~30-50%)
    const webpBuffer = await sharp(originalBuffer)
      .webp({ 
        quality: 85,
        effort: 6,
        smartSubsample: true
      })
      .toBuffer();
    
    // Generate thumbnail (640x360 for 16:9 ratio)
    const thumbnailBuffer = await sharp(originalBuffer)
      .resize(640, 360, { fit: 'cover', position: 'center' })
      .webp({ quality: 80 })
      .toBuffer();
    
    // Generate tiny blur placeholder (20px wide, very low quality)
    const blurBuffer = await sharp(originalBuffer)
      .resize(20, 11, { fit: 'cover' })
      .blur(2)
      .webp({ quality: 20 })
      .toBuffer();
    const blurDataUrl = `data:image/webp;base64,${blurBuffer.toString('base64')}`;
    
    console.log(`[Nano Banana Pro] Compression: ${originalBuffer.length} -> ${webpBuffer.length} bytes (${Math.round((1 - webpBuffer.length/originalBuffer.length) * 100)}% reduction)`);
    
    // Create distinct filenames for each asset
    const mainFileName = `${uniqueBase}.webp`;
    const thumbFileName = `${uniqueBase}_thumb.webp`;
    
    // Upload main WebP image
    const mainPath = `ai-generated/${mainFileName}`;
    const mainResult = await objectStorageService.uploadFile(
      mainPath,
      webpBuffer,
      "image/webp",
      "public"
    );
    
    // Upload thumbnail
    const thumbPath = `ai-generated/${thumbFileName}`;
    const thumbResult = await objectStorageService.uploadFile(
      thumbPath,
      thumbnailBuffer,
      "image/webp",
      "public"
    );
    
    // Extract object path from the full path for API URL format
    // mainResult.path format: /bucket-name/public/ai-generated/file.webp
    // We need just the part after the bucket name: public/ai-generated/file.webp
    const bucketMatch = mainResult.path.match(/^\/?[^/]+\/(.+)$/);
    const objectPath = bucketMatch ? bucketMatch[1] : `public/${mainPath}`;
    
    // Return URL format that works for both SPA and social crawlers
    // Format: /api/public-media/{objectPath} - bucket is resolved internally
    const publicUrl = `/api/public-media/${objectPath}`;
    const thumbBucketMatch = thumbResult.path.match(/^\/?[^/]+\/(.+)$/);
    const thumbObjectPath = thumbBucketMatch ? thumbBucketMatch[1] : `public/${thumbPath}`;
    const thumbnailUrl = `/api/public-media/${thumbObjectPath}`;
    
    console.log(`[Nano Banana Pro] Optimized image uploaded: ${publicUrl}`);
    console.log(`[Nano Banana Pro] Thumbnail uploaded: ${thumbnailUrl}`);
    
    return {
      url: publicUrl,
      thumbnailUrl,
      blurDataUrl
    };
  } catch (error: any) {
    console.error(`[Nano Banana Pro] Upload/optimization failed:`, error);
    
    // Fallback: Upload without optimization - preserve original format
    try {
      const imageBuffer = Buffer.from(imageBase64, 'base64');
      const timestamp = Date.now();
      const baseName = fileName.replace(/\.(png|jpg|jpeg|webp)$/i, '');
      const ext = fileName.match(/\.(png|jpg|jpeg|webp)$/i)?.[1] || 'png';
      const fallbackFileName = `${baseName}_${timestamp}.${ext}`;
      const filePath = `ai-generated/${fallbackFileName}`;
      const result = await objectStorageService.uploadFile(filePath, imageBuffer, mimeType, "public");
      
      // Extract object path from the full path for API URL format
      // Format: /bucket-name/public/ai-generated/file.ext -> public/ai-generated/file.ext
      const bucketMatch = result.path.match(/^\/?[^/]+\/(.+)$/);
      const objectPath = bucketMatch ? bucketMatch[1] : `public/${filePath}`;
      const publicUrl = `/api/public-media/${objectPath}`;
      
      return { url: publicUrl, thumbnailUrl: publicUrl };
    } catch (fallbackError: any) {
      throw new Error(`Failed to upload image: ${fallbackError.message}`);
    }
  }
}

/**
 * Overlay Arabic text on image using sharp and pure SVG text/tspan elements
 * Used for "خبر مميز" template to add headline text
 * Compatible with librsvg (used by sharp) - no foreignObject
 * Uses iterative font sizing to guarantee text fits within bounds
 */
export async function overlayArabicText(
  imageBase64: string,
  text: string,
  options: {
    fontSize?: number;
    fontColor?: string;
    backgroundColor?: string;
    position?: 'center' | 'bottom' | 'top';
    padding?: number;
  } = {}
): Promise<string> {
  const sharp = (await import('sharp')).default;
  const fs = await import('fs/promises');
  const path = await import('path');
  
  const {
    fontColor = '#FFFFFF',
    position = 'bottom',
    padding = 60
  } = options;
  
  try {
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width || 1920;
    const height = metadata.height || 1080;
    
    console.log(`[Nano Banana Pro] Overlaying Arabic text on ${width}x${height} image`);
    
    // Try Cairo Bold first (better Arabic display font), then Noto Sans
    let fontBase64 = '';
    let fontFamily = 'sans-serif';
    
    const cairoPath = path.join(process.cwd(), 'server/fonts/Cairo-Bold.ttf');
    const notoPath = path.join(process.cwd(), 'server/fonts/NotoSansArabic-Bold.ttf');
    
    try {
      const fontBuffer = await fs.readFile(cairoPath);
      fontBase64 = fontBuffer.toString('base64');
      fontFamily = 'CairoBold';
      console.log('[Nano Banana Pro] Using Cairo Bold font (premium Arabic)');
    } catch {
      try {
        const fontBuffer = await fs.readFile(notoPath);
        fontBase64 = fontBuffer.toString('base64');
        fontFamily = 'NotoSansArabic';
        console.log('[Nano Banana Pro] Using Noto Sans Arabic font');
      } catch {
        console.warn('[Nano Banana Pro] No Arabic font found');
      }
    }
    
    // Professional layout - wider side margins for elegance
    const sidePadding = Math.round(width * 0.06);
    const availableWidth = width - (sidePadding * 2);
    const maxTextAreaHeight = Math.min(height * 0.38, 420);
    
    // Typography: larger fonts for headlines
    const charWidthMultiplier = 0.62;
    const maxLines = 3;
    const startingFontSize = options.fontSize || Math.min(Math.round(width / 11), 115);
    const minFontSize = 38;
    
    // Helper function to wrap text into lines given a max chars per line
    const wrapText = (words: string[], maxCharsPerLine: number): string[] => {
      const lines: string[] = [];
      let currentLine = '';
      
      for (const word of words) {
        // Handle very long words by breaking them into chunks
        let safeWord = word;
        if (word.length > maxCharsPerLine) {
          // Break long word into chunks that fit, preserving Arabic reading order
          const chunks: string[] = [];
          let remaining = word;
          while (remaining.length > 0) {
            const chunkSize = Math.min(remaining.length, maxCharsPerLine - 2);
            chunks.push(remaining.substring(0, chunkSize));
            remaining = remaining.substring(chunkSize);
          }
          // Process first chunk as the word, add rest as separate "words"
          safeWord = chunks[0];
          // Add remaining chunks to be processed later
          for (let i = 1; i < chunks.length; i++) {
            words.push(chunks[i]);
          }
        }
        
        const testLine = currentLine ? `${currentLine} ${safeWord}` : safeWord;
        if (testLine.length > maxCharsPerLine && currentLine) {
          lines.push(currentLine);
          currentLine = safeWord;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) {
        lines.push(currentLine);
      }
      return lines;
    };
    
    // Helper function to check if layout fits
    const calculateLayout = (fontSize: number): { fits: boolean; lines: string[]; textAreaHeight: number; lineHeight: number } => {
      const charsPerLine = Math.floor(availableWidth / (fontSize * charWidthMultiplier));
      const words = text.trim().split(/\s+/);
      let lines = wrapText(words, charsPerLine);
      
      // Limit to max lines
      if (lines.length > maxLines) {
        lines = lines.slice(0, maxLines);
        // Truncate last line with ellipsis if needed
        const lastLine = lines[maxLines - 1];
        if (lastLine.length > charsPerLine - 2) {
          lines[maxLines - 1] = lastLine.substring(0, charsPerLine - 2) + '…';
        }
      }
      
      const lineHeight = fontSize * 1.4;
      const textBlockHeight = lines.length * lineHeight;
      const textAreaHeight = textBlockHeight + (padding * 0.8);
      
      // Check if fits within bounds
      const fits = textAreaHeight <= maxTextAreaHeight;
      
      return { fits, lines, textAreaHeight, lineHeight };
    };
    
    // Iteratively find the best font size that fits
    let fontSize = startingFontSize;
    let layout = calculateLayout(fontSize);
    
    // Shrink font until it fits or we hit minimum
    while (!layout.fits && fontSize > minFontSize) {
      fontSize = Math.round(fontSize * 0.9);
      layout = calculateLayout(fontSize);
    }
    
    // Final safety check - force minimum if still doesn't fit
    if (!layout.fits) {
      fontSize = minFontSize;
      layout = calculateLayout(fontSize);
      // Hard truncate to 3 lines if still doesn't fit
      if (!layout.fits && layout.lines.length > 3) {
        layout.lines = layout.lines.slice(0, 3);
        layout.textAreaHeight = 3 * layout.lineHeight + (padding * 0.8);
      }
    }
    
    const { lines, textAreaHeight, lineHeight } = layout;
    
    console.log(`[Nano Banana Pro] Final layout: fontSize=${fontSize}px, lines=${lines.length}, textAreaHeight=${textAreaHeight.toFixed(0)}px (max=${maxTextAreaHeight.toFixed(0)}px)`);
    
    // Calculate vertical position based on option
    // Clamp textAreaHeight to ensure it never exceeds maxTextAreaHeight
    const clampedTextAreaHeight = Math.min(textAreaHeight, maxTextAreaHeight);
    
    let textY = (height - clampedTextAreaHeight) / 2; // center
    if (position === 'top') {
      textY = padding;
    } else if (position === 'bottom') {
      textY = height - clampedTextAreaHeight - padding;
    }
    
    // Hard clamp to ensure text box stays within image bounds
    textY = Math.max(0, Math.min(textY, height - clampedTextAreaHeight));
    
    // Generate tspan elements for each line with proper positioning
    const centerX = width / 2;
    const firstLineY = textY + padding + fontSize * 0.9;
    
    const tspanElements = lines.map((line, index) => {
      return `<tspan x="${centerX}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`;
    }).join('\n        ');
    
    // Professional glassmorphism styling
    const cornerRadius = Math.round(Math.min(24, width / 70));
    const bgX = sidePadding;
    const bgWidth = width - (sidePadding * 2);
    
    // Create SVG with premium glassmorphism design
    const svgText = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    ${fontBase64 ? `<style>
      @font-face {
        font-family: '${fontFamily}';
        src: url(data:font/truetype;base64,${fontBase64}) format('truetype');
        font-weight: bold;
      }
    </style>` : ''}
    
    <!-- Premium glassmorphism gradient -->
    <linearGradient id="glassGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:rgb(15, 23, 42);stop-opacity:0.94" />
      <stop offset="100%" style="stop-color:rgb(30, 41, 59);stop-opacity:0.97" />
    </linearGradient>
    
    <!-- Inner cyan glow for modern effect -->
    <radialGradient id="innerGlow" cx="50%" cy="0%" r="90%" fx="50%" fy="0%">
      <stop offset="0%" style="stop-color:rgb(56, 189, 248);stop-opacity:0.12" />
      <stop offset="100%" style="stop-color:rgb(56, 189, 248);stop-opacity:0" />
    </radialGradient>
    
    <!-- Multi-layer text shadow for premium depth -->
    <filter id="textShadow" x="-15%" y="-15%" width="130%" height="145%">
      <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="rgba(0,0,0,0.65)"/>
      <feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="rgba(0,0,0,0.35)"/>
    </filter>
  </defs>
  
  <!-- Main glassmorphism panel -->
  <rect 
    x="${bgX}" 
    y="${textY}" 
    width="${bgWidth}" 
    height="${clampedTextAreaHeight}" 
    rx="${cornerRadius}" 
    ry="${cornerRadius}"
    fill="url(#glassGradient)"
  />
  
  <!-- Inner glow overlay -->
  <rect 
    x="${bgX}" 
    y="${textY}" 
    width="${bgWidth}" 
    height="${clampedTextAreaHeight}" 
    rx="${cornerRadius}" 
    ry="${cornerRadius}"
    fill="url(#innerGlow)"
  />
  
  <!-- Subtle glass border -->
  <rect 
    x="${bgX}" 
    y="${textY}" 
    width="${bgWidth}" 
    height="${clampedTextAreaHeight}" 
    rx="${cornerRadius}" 
    ry="${cornerRadius}"
    fill="none"
    stroke="rgba(148, 163, 184, 0.3)"
    stroke-width="1.5"
  />
  
  <!-- Top accent line (cyan/blue) -->
  <rect 
    x="${bgX + cornerRadius}" 
    y="${textY}" 
    width="${bgWidth - (cornerRadius * 2)}" 
    height="4" 
    fill="rgba(56, 189, 248, 0.75)"
    rx="2"
  />
  
  <!-- Arabic headline text with premium styling -->
  <text 
    x="${centerX}" 
    y="${firstLineY}"
    text-anchor="middle"
    fill="${fontColor}"
    font-family="'${fontFamily}', 'Cairo', 'Noto Sans Arabic', sans-serif"
    font-size="${fontSize}"
    font-weight="bold"
    direction="rtl"
    filter="url(#textShadow)"
    letter-spacing="-0.01em"
  >
        ${tspanElements}
  </text>
</svg>`;
    
    // Composite the SVG over the image
    const resultBuffer = await sharp(imageBuffer)
      .composite([{
        input: Buffer.from(svgText),
        top: 0,
        left: 0,
      }])
      .png()
      .toBuffer();
    
    console.log(`[Nano Banana Pro] Text overlay completed successfully (fontSize: ${fontSize}px, lines: ${lines.length})`);
    
    return resultBuffer.toString('base64');
  } catch (error: any) {
    console.error(`[Nano Banana Pro] Text overlay failed:`, error);
    // Return original image if overlay fails
    return imageBase64;
  }
}

// Helper to escape XML special characters
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate and upload image in one operation
 * Supports optional text overlay for "خبر مميز" template
 */
export async function generateAndUploadImage(
  request: ImageGenerationRequest,
  userId: string
): Promise<ImageGenerationResult> {
  const result = await generateImage(request);
  
  if (!result.success || !result.imageData) {
    return result;
  }
  
  try {
    let finalImageData = result.imageData;
    
    // Apply text overlay if requested
    if (request.overlayText && request.overlayText.trim()) {
      console.log(`[Nano Banana Pro] Applying text overlay: "${request.overlayText.substring(0, 50)}..."`);
      finalImageData = await overlayArabicText(
        result.imageData,
        request.overlayText,
        request.overlayOptions
      );
    }
    
    // Generate unique filename
    const timestamp = Date.now();
    const fileName = `${userId}_${timestamp}.png`;
    
    // Upload to storage
    const { url, thumbnailUrl } = await uploadImageToStorage(
      finalImageData,
      fileName,
      "image/png"
    );
    
    return {
      ...result,
      imageUrl: url,
      thumbnailUrl,
      imageData: undefined // Remove base64 to save space
    };
  } catch (error: any) {
    console.error(`[Nano Banana Pro] Upload failed:`, error);
    return {
      ...result,
      error: `Image generated but upload failed: ${error.message}`
    };
  }
}
