/**
 * Thumbnail Generation Service
 * يقوم بإنشاء صور مصغرة بنسبة 16:9 للأخبار
 */

import sharp from 'sharp';
import { storage } from '../storage';
import { db } from '../db';
import { articles } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';
import fetch from 'node-fetch';
import path from 'path';

interface FocalPoint {
  x: number;
  y: number;
}

interface ThumbnailOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
  focalPoint?: FocalPoint | null;
}

const DEFAULT_OPTIONS: ThumbnailOptions = {
  width: 640,  // عرض افتراضي للصورة المصغرة
  height: 360, // ارتفاع لنسبة 16:9
  quality: 85,
  format: 'jpeg'
};

/**
 * Convert relative paths to absolute URLs
 */
function normalizeImageUrl(url: string): string {
  // If it's already a full URL, return as-is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  
  // If it's a relative path starting with /, convert to absolute URL
  if (url.startsWith('/')) {
    // Use FRONTEND_URL or REPLIT_DEV_DOMAIN for Replit environment
    // Fallback to localhost for local development
    let baseUrl = 'http://localhost:5000';
    
    if (process.env.FRONTEND_URL) {
      baseUrl = process.env.FRONTEND_URL;
    } else if (process.env.REPLIT_DEV_DOMAIN) {
      baseUrl = `https://${process.env.REPLIT_DEV_DOMAIN}`;
    } else if (process.env.NODE_ENV === 'production' && process.env.DOMAIN) {
      baseUrl = `https://${process.env.DOMAIN}`;
    }
    
    return `${baseUrl}${url}`;
  }
  
  // If it's a gs:// URL, we can't fetch it directly - it should have been converted already
  if (url.startsWith('gs://')) {
    throw new Error('gs:// URLs must be converted to public URLs before thumbnail generation');
  }
  
  return url;
}

/**
 * Validate URL for security (prevent SSRF)
 */
function isValidImageUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    
    // Allow only HTTPS and HTTP protocols
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      return false;
    }
    
    // Build list of trusted domains dynamically
    const trustedDomains = [
      'storage.googleapis.com',
      'imagedelivery.net', // Cloudflare Images CDN
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      'replit.dev', // Replit domains
      'repl.co',
    ];
    
    // Add configured domains
    if (process.env.DOMAIN) {
      trustedDomains.push(process.env.DOMAIN);
    }
    if (process.env.REPLIT_DEV_DOMAIN) {
      trustedDomains.push(process.env.REPLIT_DEV_DOMAIN);
    }
    
    // Add additional trusted domains
    trustedDomains.push('sabq.org', 'sabq.org');
    
    const hostname = parsedUrl.hostname.toLowerCase();
    
    // Check if hostname is in trusted domains or is a subdomain
    const isTrusted = trustedDomains.some(domain => 
      hostname === domain || hostname.endsWith(`.${domain}`)
    );
    
    if (!isTrusted) {
      console.warn(`[Thumbnail Service] Untrusted domain: ${hostname}`);
    }
    
    return isTrusted;
  } catch {
    return false;
  }
}

/**
 * Read image directly from Object Storage if it's a local path
 */
async function readImageFromStorage(url: string): Promise<Buffer | null> {
  try {
    // Check if it's a /public-objects/ or /uploads/ path
    if (url.startsWith('/public-objects/') || url.startsWith('/uploads/')) {
      const { objectStorageClient, getBucketConfig } = await import('../objectStorage');
      const { bucketName, publicPrefix } = getBucketConfig();
      
      let filePath: string;
      if (url.startsWith('/public-objects/')) {
        // /public-objects/uploads/... -> public/uploads/...
        filePath = publicPrefix + url.replace('/public-objects/', '/');
      } else {
        // /uploads/... -> public/uploads/...
        filePath = publicPrefix + url;
      }
      
      console.log(`[Thumbnail Service] Reading from GCS: ${bucketName}/${filePath}`);
      
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(filePath);
      
      const [exists] = await file.exists();
      if (!exists) {
        console.error(`[Thumbnail Service] File not found in GCS: ${filePath}`);
        return null;
      }
      
      const [buffer] = await file.download();
      console.log(`[Thumbnail Service] Downloaded ${buffer.length} bytes from GCS`);
      return buffer;
    }
    return null;
  } catch (error: any) {
    console.error('[Thumbnail Service] Error reading from storage:', error.message);
    return null;
  }
}

/**
 * Generate thumbnail from image URL
 * يقوم بتوليد صورة مصغرة من رابط الصورة
 */
export async function generateThumbnail(
  imageUrl: string,
  options: ThumbnailOptions = {}
): Promise<string> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  
  // Normalize URL (convert relative paths to absolute URLs)
  const normalizedUrl = normalizeImageUrl(imageUrl);
  console.log(`[Thumbnail Service] Original URL: ${imageUrl}`);
  console.log(`[Thumbnail Service] Normalized URL: ${normalizedUrl}`);
  
  // Validate URL for security
  if (!isValidImageUrl(normalizedUrl)) {
    throw new Error('Invalid or untrusted image URL');
  }
  
  try {
    console.log(`[Thumbnail Service] Generating thumbnail for: ${normalizedUrl}`);
    
    let buffer: Buffer;
    
    // Try to read directly from Object Storage first for local paths
    const storageBuffer = await readImageFromStorage(imageUrl);
    if (storageBuffer) {
      buffer = storageBuffer;
      console.log(`[Thumbnail Service] Using direct GCS read for: ${imageUrl}`);
    } else {
      // Fallback to HTTP fetch for external URLs
      console.log(`[Thumbnail Service] Fetching via HTTP: ${normalizedUrl}`);
      
      // Download the image with timeout and size limits
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(normalizedUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Sabq-Thumbnail-Service/1.0'
        }
      });
      
      clearTimeout(timeout);
      
      if (!response.ok) {
        console.error(`[Thumbnail Service] HTTP fetch failed: ${response.status} ${response.statusText}`);
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      
      // Check content type
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.startsWith('image/')) {
        throw new Error('Invalid content type: must be an image');
      }
      
      // Check content length (max 10MB)
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
        throw new Error('Image too large: maximum size is 10MB');
      }
      
      buffer = await response.buffer();
    }
    
    // Additional size check after download
    if (buffer.length > 10 * 1024 * 1024) {
      throw new Error('Image too large: maximum size is 10MB');
    }
    
    // Process image with sharp to create thumbnail
    // Use focal point for intelligent cropping instead of always centering
    let sharpPosition: string = 'center';
    
    if (config.focalPoint && typeof config.focalPoint.x === 'number' && typeof config.focalPoint.y === 'number') {
      const fpX = Math.max(0, Math.min(100, config.focalPoint.x));
      const fpY = Math.max(0, Math.min(100, config.focalPoint.y));
      
      // Sharp uses strategy names for basic positions, but for precise focal points
      // we need to use the extract-based approach: resize then extract the region
      // around the focal point
      const metadata = await sharp(buffer).metadata();
      if (metadata.width && metadata.height && config.width && config.height) {
        const targetW = config.width;
        const targetH = config.height;
        const srcW = metadata.width;
        const srcH = metadata.height;
        
        // Calculate scale factor (same as object-fit: cover)
        const scale = Math.max(targetW / srcW, targetH / srcH);
        const scaledW = Math.round(srcW * scale);
        const scaledH = Math.round(srcH * scale);
        
        // Calculate the focal point position in the scaled image
        const focalXPx = Math.round((fpX / 100) * scaledW);
        const focalYPx = Math.round((fpY / 100) * scaledH);
        
        // Calculate extract region centered on the focal point
        let extractLeft = Math.round(focalXPx - targetW / 2);
        let extractTop = Math.round(focalYPx - targetH / 2);
        
        // Clamp to image bounds
        extractLeft = Math.max(0, Math.min(scaledW - targetW, extractLeft));
        extractTop = Math.max(0, Math.min(scaledH - targetH, extractTop));
        
        console.log(`[Thumbnail Service] Focal point crop: fp=(${fpX}%,${fpY}%), scaled=${scaledW}x${scaledH}, extract=(${extractLeft},${extractTop})`);
        
        const thumbnail = await sharp(buffer)
          .resize(scaledW, scaledH, { fit: 'fill' })
          .extract({ left: extractLeft, top: extractTop, width: targetW, height: targetH })
          .toFormat(config.format as keyof sharp.FormatEnum, { quality: config.quality })
          .toBuffer();
        
        const timestamp = Date.now();
        const filename = `thumbnail_${timestamp}_${config.width}x${config.height}.${config.format}`;
        const thumbnailUrl = await uploadThumbnailToStorage(thumbnail, filename);
        
        console.log(`[Thumbnail Service] Thumbnail generated with focal point: ${thumbnailUrl}`);
        return thumbnailUrl;
      }
    }
    
    const thumbnail = await sharp(buffer)
      .resize(config.width, config.height, {
        fit: 'cover',
        position: sharpPosition
      })
      .toFormat(config.format as keyof sharp.FormatEnum, { quality: config.quality })
      .toBuffer();
    
    // Generate unique filename for thumbnail
    const timestamp = Date.now();
    const filename = `thumbnail_${timestamp}_${config.width}x${config.height}.${config.format}`;
    
    // Upload to storage (assuming GCS is configured)
    const thumbnailUrl = await uploadThumbnailToStorage(thumbnail, filename);
    
    console.log(`[Thumbnail Service] Thumbnail generated successfully: ${thumbnailUrl}`);
    return thumbnailUrl;
    
  } catch (error: any) {
    console.error('[Thumbnail Service] Error generating thumbnail:', error);
    throw new Error(`Thumbnail generation failed: ${error.message}`);
  }
}

/**
 * Upload thumbnail to storage service using configured object storage
 * Uses getBucketConfig() for reliable bucket resolution
 */
async function uploadThumbnailToStorage(
  buffer: Buffer,
  filename: string
): Promise<string> {
  // Import the centralized bucket config helper
  const { objectStorageClient, getBucketConfig } = await import('../objectStorage');
  
  // Get the correct bucket configuration (prioritizes DEFAULT_OBJECT_STORAGE_BUCKET_ID)
  const { bucketName, publicPrefix } = getBucketConfig();
  
  console.log(`[Thumbnail Service] Using bucket: ${bucketName}, prefix: ${publicPrefix}`);
  
  const bucket = objectStorageClient.bucket(bucketName);
  // Store in prefix/thumbnails/filename (e.g., "public/thumbnails/thumbnail_123.jpeg")
  const thumbnailPath = `${publicPrefix}/thumbnails/${filename}`;
  const file = bucket.file(thumbnailPath);
  
  // Determine content type from filename
  const ext = filename.split('.').pop()?.toLowerCase() || 'jpeg';
  const contentType = ext === 'webp' ? 'image/webp' : ext === 'png' ? 'image/png' : 'image/jpeg';
  
  await file.save(buffer, {
    metadata: {
      contentType,
      cacheControl: 'public, max-age=31536000, immutable'
    }
  });
  
  console.log(`[Thumbnail Service] Thumbnail uploaded to GCS: ${thumbnailPath}`);
  
  // Return public-objects URL matching the path structure
  // The /public-objects endpoint searches under PUBLIC_OBJECT_SEARCH_PATHS
  return `/public-objects/thumbnails/${filename}`;
}

/**
 * Save thumbnail to local storage (for development)
 */
async function saveToLocalStorage(
  buffer: Buffer,
  filename: string
): Promise<string> {
  const fs = await import('fs/promises');
  const uploadDir = path.join(process.cwd(), 'uploads', 'thumbnails');
  
  // Ensure directory exists
  await fs.mkdir(uploadDir, { recursive: true });
  
  // Save file
  const filepath = path.join(uploadDir, filename);
  await fs.writeFile(filepath, buffer);
  
  // Return local URL
  return `/uploads/thumbnails/${filename}`;
}

/**
 * Generate and save thumbnail for article
 * يقوم بتوليد وحفظ الصورة المصغرة للمقال
 */
export async function generateArticleThumbnail(
  articleId: string,
  imageUrl: string,
  options: ThumbnailOptions = {}
): Promise<string> {
  try {
    // Look up article's focal point from database if not already provided
    if (!options.focalPoint) {
      try {
        const [article] = await db
          .select({ imageFocalPoint: articles.imageFocalPoint })
          .from(articles)
          .where(eq(articles.id, articleId))
          .limit(1);
        
        if (article?.imageFocalPoint) {
          const fp = typeof article.imageFocalPoint === 'string'
            ? JSON.parse(article.imageFocalPoint as string)
            : article.imageFocalPoint;
          if (fp && typeof fp.x === 'number' && typeof fp.y === 'number') {
            options.focalPoint = { x: fp.x, y: fp.y };
            console.log(`[Thumbnail Service] Using focal point from DB for article ${articleId}: (${fp.x}%, ${fp.y}%)`);
          }
        }
      } catch (fpError) {
        console.warn(`[Thumbnail Service] Could not load focal point for article ${articleId}:`, fpError);
      }
    }
    
    const thumbnailUrl = await generateThumbnail(imageUrl, options);
    
    await db
      .update(articles)
      .set({ thumbnailUrl })
      .where(eq(articles.id, articleId));
    
    console.log(`[Thumbnail Service] Article ${articleId} thumbnail updated`);
    return thumbnailUrl;
    
  } catch (error: any) {
    console.error(`[Thumbnail Service] Failed to generate article thumbnail:`, error);
    throw error;
  }
}

/**
 * Batch generate thumbnails for articles without them
 */
export async function generateMissingThumbnails(limit: number = 10): Promise<void> {
  try {
    // Use SQL to filter articles that need thumbnails directly in the database
    // This avoids loading all articles into memory
    const { and, isNotNull, isNull, sql } = await import('drizzle-orm');
    
    // Find articles with images but no thumbnails, limited to batch size
    const articlesNeedingThumbnails = await db
      .select()
      .from(articles)
      .where(
        and(
          eq(articles.status, 'published'),
          isNotNull(articles.imageUrl),
          isNull(articles.thumbnailUrl)
        )
      )
      .limit(limit);
    
    console.log(`[Thumbnail Service] Processing batch of ${articlesNeedingThumbnails.length} articles needing thumbnails`);
    
    // Process thumbnails in parallel with concurrency limit
    const pLimit = (await import('p-limit')).default;
    const concurrencyLimit = pLimit(3); // Process 3 at a time
    
    const promises = articlesNeedingThumbnails.map(article => 
      concurrencyLimit(async () => {
        if (article.imageUrl) {
          try {
            // Pass focal point directly since we already have the article data
            const options: ThumbnailOptions = {};
            if (article.imageFocalPoint) {
              const fp = typeof article.imageFocalPoint === 'string'
                ? JSON.parse(article.imageFocalPoint as string)
                : article.imageFocalPoint;
              if (fp && typeof fp.x === 'number' && typeof fp.y === 'number') {
                options.focalPoint = { x: fp.x, y: fp.y };
              }
            }
            await generateArticleThumbnail(article.id, article.imageUrl, options);
            console.log(`[Thumbnail Service] Generated thumbnail for article: ${article.id}`);
          } catch (error) {
            console.error(`[Thumbnail Service] Failed for article ${article.id}:`, error);
          }
        }
      })
    );
    
    await Promise.all(promises);
    
    console.log('[Thumbnail Service] Batch thumbnail generation completed');
    
    // Check if there are more articles to process
    const remainingCount = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(articles)
      .where(
        and(
          eq(articles.status, 'published'),
          isNotNull(articles.imageUrl),
          isNull(articles.thumbnailUrl)
        )
      );
    
    if (remainingCount[0]?.count > 0) {
      console.log(`[Thumbnail Service] ${remainingCount[0].count} articles still need thumbnails`);
    }
    
  } catch (error: any) {
    console.error('[Thumbnail Service] Batch generation failed:', error);
  }
}

/**
 * Regenerate thumbnails stored locally to GCS
 * يعيد توليد المصغرات المحفوظة محلياً إلى GCS
 */
export async function regenerateLocalThumbnails(limit: number = 20): Promise<{
  processed: number;
  success: number;
  failed: number;
  remaining: number;
}> {
  try {
    const { and, like, sql } = await import('drizzle-orm');
    
    // Find articles with local thumbnails (/uploads/...)
    const articlesWithLocalThumbnails = await db
      .select({
        id: articles.id,
        thumbnailUrl: articles.thumbnailUrl,
        imageUrl: articles.imageUrl
      })
      .from(articles)
      .where(
        and(
          eq(articles.status, 'published'),
          like(articles.thumbnailUrl, '/uploads/%')
        )
      )
      .limit(limit);
    
    console.log(`[Thumbnail Service] Found ${articlesWithLocalThumbnails.length} articles with local thumbnails to regenerate`);
    
    let successCount = 0;
    let failedCount = 0;
    
    // Process thumbnails in parallel with concurrency limit
    const pLimit = (await import('p-limit')).default;
    const concurrencyLimit = pLimit(3);
    
    const promises = articlesWithLocalThumbnails.map(article => 
      concurrencyLimit(async () => {
        if (article.imageUrl) {
          try {
            await generateArticleThumbnail(article.id, article.imageUrl);
            console.log(`[Thumbnail Service] Regenerated thumbnail for article: ${article.id}`);
            successCount++;
          } catch (error) {
            console.error(`[Thumbnail Service] Failed to regenerate for article ${article.id}:`, error);
            failedCount++;
          }
        } else {
          failedCount++;
        }
      })
    );
    
    await Promise.all(promises);
    
    // Get remaining count
    const remainingResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(articles)
      .where(
        and(
          eq(articles.status, 'published'),
          like(articles.thumbnailUrl, '/uploads/%')
        )
      );
    
    const remaining = remainingResult[0]?.count || 0;
    
    console.log(`[Thumbnail Service] Regeneration complete: ${successCount} success, ${failedCount} failed, ${remaining} remaining`);
    
    return {
      processed: articlesWithLocalThumbnails.length,
      success: successCount,
      failed: failedCount,
      remaining
    };
    
  } catch (error: any) {
    console.error('[Thumbnail Service] Regeneration failed:', error);
    throw error;
  }
}

/**
 * Regenerate thumbnails for articles that have focal points
 * يعيد توليد المصغرات للمقالات التي لديها نقاط تركيز لتجنب قطع الوجوه
 */
export async function regenerateFocalPointThumbnails(limit: number = 50): Promise<{
  processed: number;
  success: number;
  failed: number;
  remaining: number;
}> {
  try {
    const { and, isNotNull, sql } = await import('drizzle-orm');
    
    const articlesWithFocalPoints = await db
      .select({
        id: articles.id,
        thumbnailUrl: articles.thumbnailUrl,
        imageUrl: articles.imageUrl,
        imageFocalPoint: articles.imageFocalPoint,
      })
      .from(articles)
      .where(
        and(
          eq(articles.status, 'published'),
          isNotNull(articles.imageUrl),
          isNotNull(articles.thumbnailUrl),
          isNotNull(articles.imageFocalPoint)
        )
      )
      .orderBy(desc(articles.publishedAt))
      .limit(limit);
    
    console.log(`[Thumbnail Service] Found ${articlesWithFocalPoints.length} articles with focal points to regenerate`);
    
    let successCount = 0;
    let failedCount = 0;
    
    const pLimit = (await import('p-limit')).default;
    const concurrencyLimit = pLimit(3);
    
    const promises = articlesWithFocalPoints.map(article => 
      concurrencyLimit(async () => {
        if (article.imageUrl) {
          try {
            const options: ThumbnailOptions = {};
            if (article.imageFocalPoint) {
              const fp = typeof article.imageFocalPoint === 'string'
                ? JSON.parse(article.imageFocalPoint as string)
                : article.imageFocalPoint;
              if (fp && typeof fp.x === 'number' && typeof fp.y === 'number') {
                options.focalPoint = { x: fp.x, y: fp.y };
              }
            }
            await generateArticleThumbnail(article.id, article.imageUrl, options);
            console.log(`[Thumbnail Service] Regenerated focal-point thumbnail for article: ${article.id} (fp: ${options.focalPoint?.x}%, ${options.focalPoint?.y}%)`);
            successCount++;
          } catch (error) {
            console.error(`[Thumbnail Service] Failed to regenerate for article ${article.id}:`, error);
            failedCount++;
          }
        } else {
          failedCount++;
        }
      })
    );
    
    await Promise.all(promises);
    
    const remainingResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(articles)
      .where(
        and(
          eq(articles.status, 'published'),
          isNotNull(articles.imageUrl),
          isNotNull(articles.thumbnailUrl),
          isNotNull(articles.imageFocalPoint)
        )
      );
    
    const remaining = (remainingResult[0]?.count || 0) - successCount;
    
    console.log(`[Thumbnail Service] Focal point regeneration complete: ${successCount} success, ${failedCount} failed, ${remaining} remaining`);
    
    return {
      processed: articlesWithFocalPoints.length,
      success: successCount,
      failed: failedCount,
      remaining: Math.max(0, remaining)
    };
    
  } catch (error: any) {
    console.error('[Thumbnail Service] Focal point regeneration failed:', error);
    throw error;
  }
}

/**
 * Generate optimized thumbnails for different sizes
 * يقوم بإنشاء صور مصغرة محسنة لأحجام مختلفة
 */
export async function generateResponsiveThumbnails(
  imageUrl: string,
  articleId?: string
): Promise<{
  small: string;   // 320x180
  medium: string;  // 640x360
  large: string;   // 1280x720
}> {
  const sizes = {
    small: { width: 320, height: 180 },
    medium: { width: 640, height: 360 },
    large: { width: 1280, height: 720 }
  };
  
  const thumbnails: any = {};
  
  for (const [size, dimensions] of Object.entries(sizes)) {
    try {
      thumbnails[size] = await generateThumbnail(imageUrl, dimensions);
    } catch (error) {
      console.error(`[Thumbnail Service] Failed to generate ${size} thumbnail:`, error);
      thumbnails[size] = imageUrl; // Fallback to original
    }
  }
  
  // If articleId provided, save the medium size as default
  if (articleId) {
    await db
      .update(articles)
      .set({ thumbnailUrl: thumbnails.medium })
      .where(eq(articles.id, articleId));
  }
  
  return thumbnails;
}