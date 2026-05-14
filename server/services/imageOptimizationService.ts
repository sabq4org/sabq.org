/**
 * Image Optimization Service
 * خدمة تحسين الصور - تحويل إلى WebP وإنشاء أحجام متعددة
 * 
 * Features:
 * - On-the-fly WebP conversion
 * - Responsive image sizes (srcset)
 * - Smart caching with GCS
 * - Lazy loading blur placeholders
 */

import sharp from 'sharp';
import { ObjectStorageService, objectStorageClient } from '../objectStorage';
import crypto from 'crypto';

const objectStorageService = new ObjectStorageService();

// Responsive breakpoints for srcset
export const IMAGE_SIZES = {
  xs: 160,    // Tiny thumbnails
  sm: 320,    // Small mobile
  md: 640,    // Medium / tablet
  lg: 960,    // Large tablet / desktop
  xl: 1280,   // Large desktop
  xxl: 1920,  // Full HD
} as const;

export type ImageSize = keyof typeof IMAGE_SIZES;

interface OptimizedImageResult {
  buffer: Buffer;
  contentType: string;
  width: number;
  height: number;
  size: number;
}

interface ImageOptimizationOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'webp' | 'avif' | 'jpeg' | 'png';
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
}

/**
 * Generate cache key for optimized image
 */
function generateCacheKey(
  originalPath: string,
  options: ImageOptimizationOptions
): string {
  const optionsStr = JSON.stringify(options);
  const hash = crypto.createHash('md5')
    .update(`${originalPath}:${optionsStr}`)
    .digest('hex')
    .substring(0, 8);
  
  const ext = options.format || 'webp';
  const width = options.width || 'auto';
  
  // Extract base filename
  const baseName = originalPath.split('/').pop()?.replace(/\.[^.]+$/, '') || 'image';
  
  return `optimized/${baseName}_${width}w_${hash}.${ext}`;
}

/**
 * Check if optimized version exists in cache
 */
async function getCachedOptimizedImage(cachePath: string): Promise<Buffer | null> {
  try {
    const file = await objectStorageService.searchPublicObject(cachePath);
    if (!file) return null;
    
    const [exists] = await file.exists();
    if (!exists) return null;
    
    const [buffer] = await file.download();
    return buffer;
  } catch {
    return null;
  }
}

/**
 * Save optimized image to cache
 */
async function cacheOptimizedImage(
  cachePath: string,
  buffer: Buffer,
  contentType: string
): Promise<void> {
  try {
    await objectStorageService.uploadFile(
      cachePath,
      buffer,
      contentType,
      'public'
    );
    console.log(`[Image Optimization] Cached: ${cachePath}`);
  } catch (error) {
    console.error(`[Image Optimization] Failed to cache:`, error);
  }
}

/**
 * Optimize image with given options
 */
export async function optimizeImage(
  inputBuffer: Buffer,
  options: ImageOptimizationOptions = {}
): Promise<OptimizedImageResult> {
  const {
    width,
    height,
    quality = 80,
    format = 'webp',
    fit = 'cover'
  } = options;

  let pipeline = sharp(inputBuffer);
  
  // Resize if dimensions specified
  if (width || height) {
    pipeline = pipeline.resize(width, height, {
      fit,
      position: 'center',
      withoutEnlargement: true
    });
  }
  
  // Convert to target format
  switch (format) {
    case 'webp':
      pipeline = pipeline.webp({ 
        quality, 
        effort: 4,
        smartSubsample: true 
      });
      break;
    case 'avif':
      pipeline = pipeline.avif({ 
        quality, 
        effort: 4 
      });
      break;
    case 'jpeg':
      pipeline = pipeline.jpeg({ 
        quality, 
        progressive: true,
        mozjpeg: true 
      });
      break;
    case 'png':
      pipeline = pipeline.png({ 
        compressionLevel: 9,
        progressive: true 
      });
      break;
  }
  
  const outputBuffer = await pipeline.toBuffer();
  const metadata = await sharp(outputBuffer).metadata();
  
  return {
    buffer: outputBuffer,
    contentType: `image/${format}`,
    width: metadata.width || 0,
    height: metadata.height || 0,
    size: outputBuffer.length
  };
}

/**
 * Get optimized image from original path
 * Checks cache first, generates if not found
 */
export async function getOptimizedImage(
  originalPath: string,
  options: ImageOptimizationOptions = {}
): Promise<OptimizedImageResult | null> {
  try {
    // Generate cache key
    const cachePath = generateCacheKey(originalPath, options);
    
    // Check cache first
    const cachedBuffer = await getCachedOptimizedImage(cachePath);
    if (cachedBuffer) {
      console.log(`[Image Optimization] Cache hit: ${cachePath}`);
      const metadata = await sharp(cachedBuffer).metadata();
      return {
        buffer: cachedBuffer,
        contentType: `image/${options.format || 'webp'}`,
        width: metadata.width || 0,
        height: metadata.height || 0,
        size: cachedBuffer.length
      };
    }
    
    // Get original image
    const file = await objectStorageService.searchPublicObject(originalPath);
    if (!file) {
      console.error(`[Image Optimization] Original not found: ${originalPath}`);
      return null;
    }
    
    const [originalBuffer] = await file.download();
    
    // Optimize
    const result = await optimizeImage(originalBuffer, options);
    
    // Cache asynchronously (don't wait)
    cacheOptimizedImage(cachePath, result.buffer, result.contentType);
    
    console.log(`[Image Optimization] Optimized: ${originalPath} -> ${result.width}x${result.height} (${Math.round(result.size/1024)}KB)`);
    
    return result;
  } catch (error) {
    console.error(`[Image Optimization] Error:`, error);
    return null;
  }
}

/**
 * Generate responsive srcset URLs for an image
 */
export function generateSrcSet(
  imagePath: string,
  sizes: ImageSize[] = ['sm', 'md', 'lg', 'xl']
): string {
  return sizes
    .map(size => {
      const width = IMAGE_SIZES[size];
      return `/api/images/optimize?path=${encodeURIComponent(imagePath)}&w=${width}&f=webp ${width}w`;
    })
    .join(', ');
}

/**
 * Generate blur placeholder data URL
 */
export async function generateBlurPlaceholder(
  inputBuffer: Buffer
): Promise<string> {
  const blurBuffer = await sharp(inputBuffer)
    .resize(20, null, { fit: 'inside' })
    .blur(2)
    .webp({ quality: 20 })
    .toBuffer();
  
  return `data:image/webp;base64,${blurBuffer.toString('base64')}`;
}

/**
 * Batch optimize images for an article
 */
export async function optimizeArticleImages(
  imageUrl: string
): Promise<{
  original: string;
  webp: string;
  thumbnail: string;
  srcset: string;
  blurPlaceholder?: string;
}> {
  try {
    // Normalize path
    const imagePath = imageUrl.replace(/^\/public-objects\//, '');
    
    // Get original
    const file = await objectStorageService.searchPublicObject(imagePath);
    if (!file) {
      return {
        original: imageUrl,
        webp: imageUrl,
        thumbnail: imageUrl,
        srcset: imageUrl
      };
    }
    
    const [originalBuffer] = await file.download();
    
    // Generate optimized versions
    const webpResult = await optimizeImage(originalBuffer, { format: 'webp', quality: 85 });
    const thumbnailResult = await optimizeImage(originalBuffer, { 
      format: 'webp', 
      width: 640, 
      height: 360, 
      quality: 80 
    });
    
    // Generate blur placeholder
    const blurPlaceholder = await generateBlurPlaceholder(originalBuffer);
    
    // Upload optimized versions
    const baseName = imagePath.split('/').pop()?.replace(/\.[^.]+$/, '') || 'image';
    const timestamp = Date.now();
    
    await objectStorageService.uploadFile(
      `optimized/${baseName}_${timestamp}.webp`,
      webpResult.buffer,
      'image/webp',
      'public'
    );
    
    await objectStorageService.uploadFile(
      `optimized/${baseName}_${timestamp}_thumb.webp`,
      thumbnailResult.buffer,
      'image/webp',
      'public'
    );
    
    return {
      original: imageUrl,
      webp: `/public-objects/optimized/${baseName}_${timestamp}.webp`,
      thumbnail: `/public-objects/optimized/${baseName}_${timestamp}_thumb.webp`,
      srcset: generateSrcSet(imagePath),
      blurPlaceholder
    };
  } catch (error) {
    console.error(`[Image Optimization] Article image optimization failed:`, error);
    return {
      original: imageUrl,
      webp: imageUrl,
      thumbnail: imageUrl,
      srcset: imageUrl
    };
  }
}

/**
 * Check if browser supports WebP based on Accept header
 */
export function supportsWebP(acceptHeader: string | undefined): boolean {
  return acceptHeader?.includes('image/webp') ?? false;
}

/**
 * Check if browser supports AVIF based on Accept header
 */
export function supportsAVIF(acceptHeader: string | undefined): boolean {
  return acceptHeader?.includes('image/avif') ?? false;
}

/**
 * Get best format based on browser support
 */
export function getBestFormat(acceptHeader: string | undefined): 'avif' | 'webp' | 'jpeg' {
  if (supportsAVIF(acceptHeader)) return 'avif';
  if (supportsWebP(acceptHeader)) return 'webp';
  return 'jpeg';
}

/**
 * Generate optimized image for Lite Swipe feed
 * Creates a 1080px WebP image optimized for mobile viewing
 */
export async function generateLiteOptimizedImage(
  imageUrl: string
): Promise<string | null> {
  try {
    if (!imageUrl) return null;
    
    // Normalize path - handle both /public-objects/ URLs and direct paths
    let imagePath = imageUrl;
    if (imageUrl.includes('/public-objects/')) {
      imagePath = imageUrl.replace(/^\/public-objects\//, '');
    }
    
    // Get original image
    const file = await objectStorageService.searchPublicObject(imagePath);
    if (!file) {
      console.error(`[Lite Image] Original not found: ${imagePath}`);
      return null;
    }
    
    const [originalBuffer] = await file.download();
    
    // Optimize for Lite: 1080px width, WebP, quality 70
    const result = await optimizeImage(originalBuffer, {
      width: 1080,
      format: 'webp',
      quality: 70,
      fit: 'cover'
    });
    
    // Generate unique filename
    const baseName = imagePath.split('/').pop()?.replace(/\.[^.]+$/, '') || 'image';
    const timestamp = Date.now();
    const liteImagePath = `lite/${baseName}_${timestamp}_lite.webp`;
    
    // Upload to object storage
    await objectStorageService.uploadFile(
      liteImagePath,
      result.buffer,
      'image/webp',
      'public'
    );
    
    const publicUrl = `/public-objects/${liteImagePath}`;
    console.log(`[Lite Image] Generated: ${publicUrl} (${Math.round(result.size/1024)}KB)`);
    
    return publicUrl;
  } catch (error) {
    console.error(`[Lite Image] Optimization failed:`, error);
    return null;
  }
}

export default {
  optimizeImage,
  getOptimizedImage,
  generateSrcSet,
  generateBlurPlaceholder,
  optimizeArticleImages,
  generateLiteOptimizedImage,
  supportsWebP,
  supportsAVIF,
  getBestFormat,
  IMAGE_SIZES
};
