import { getCacheBustedImageUrl } from "@shared/articleHeroPreload";
export { getCacheBustedImageUrl };

/**
 * Image utility functions for cache busting and URL handling
 */

/**
 * Get optimized image URL with optional resizing parameters for GCS
 * 
 * @param imageUrl - The original image URL
 * @param options - Resize options
 * @returns Optimized image URL
 */
export function getOptimizedImageUrl(
  imageUrl: string | null | undefined,
  options?: {
    width?: number;
    height?: number;
    quality?: number;
    updatedAt?: string | Date | null;
  }
): string {
  if (!imageUrl) return '';
  
  let url = imageUrl;
  
  // Add cache busting if updatedAt provided
  if (options?.updatedAt) {
    url = getCacheBustedImageUrl(url, options.updatedAt);
  }
  
  return url;
}

/**
 * Focal point type definition
 */
export interface FocalPoint {
  x: number;
  y: number;
}

/**
 * Get focal point from article object
 * Handles both camelCase (imageFocalPoint) and snake_case (image_focal_point) formats
 * 
 * @param article - Article object that may contain focal point data
 * @returns FocalPoint object or null if not available
 */
export function getFocalPoint(article: any): FocalPoint | null {
  if (!article) return null;
  
  const focalPoint = article.imageFocalPoint ?? article.image_focal_point;
  
  if (!focalPoint || typeof focalPoint.x !== 'number' || typeof focalPoint.y !== 'number') {
    return null;
  }
  
  return focalPoint;
}

/**
 * Convert focal point to CSS object-position value
 * 
 * @param article - Article object or focal point object
 * @param defaultPosition - Default position if no focal point (default: 'center')
 * @returns CSS object-position string (e.g., "30% 70%")
 */
export function getObjectPosition(article: any, defaultPosition: string = 'center'): string {
  const focalPoint = getFocalPoint(article);
  
  if (!focalPoint) {
    return defaultPosition;
  }
  
  const x = Math.max(0, Math.min(100, focalPoint.x));
  const y = Math.max(0, Math.min(100, focalPoint.y));
  
  return `${x}% ${y}%`;
}

/**
 * Get focal point as CSS style object for background-position
 * 
 * @param article - Article object
 * @param defaultPosition - Default position if no focal point
 * @returns CSS style object with backgroundPosition
 */
export function getFocalPointStyle(article: any, defaultPosition: string = 'center'): React.CSSProperties {
  const position = getObjectPosition(article, defaultPosition);
  return {
    backgroundPosition: position,
    objectPosition: position,
  };
}

/**
 * Resolves the display image URL for an article, properly prioritizing:
 * 1. Explicit imageUrl
 * 2. Explicit videoThumbnailUrl (for video articles)
 * 3. Auto-derived video thumbnail from YouTube / Dailymotion if videoUrl exists
 * 4. thumbnailUrl
 * 5. infographicBannerUrl
 */
export function getArticleDisplayImageUrl(article: any): string | null {
  if (!article) return null;
  
  if (typeof article.imageUrl === 'string' && article.imageUrl.trim()) {
    return article.imageUrl.trim();
  }
  if (typeof article.videoThumbnailUrl === 'string' && article.videoThumbnailUrl.trim()) {
    return article.videoThumbnailUrl.trim();
  }
  if (typeof article.thumbnailUrl === 'string' && article.thumbnailUrl.trim()) {
    return article.thumbnailUrl.trim();
  }
  if (typeof article.infographicBannerUrl === 'string' && article.infographicBannerUrl.trim()) {
    return article.infographicBannerUrl.trim();
  }
  
  // If videoUrl is provided, auto-extract thumbnail for YouTube / Dailymotion
  const vUrl = article.videoUrl || article.video_url;
  if (typeof vUrl === 'string' && vUrl.trim()) {
    const trimmed = vUrl.trim();
    // YouTube
    const ytMatch = trimmed.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/\s]{11})/i);
    if (ytMatch && ytMatch[1]) {
      return `https://img.youtube.com/vi/${ytMatch[1]}/maxresdefault.jpg`;
    }
    // Dailymotion
    const dmMatch = trimmed.match(/(?:dailymotion\.com\/video\/|dai\.ly\/|dailymotion\.com\/embed\/video\/)([^_\n?#\/]+)/i);
    if (dmMatch && dmMatch[1]) {
      return `https://www.dailymotion.com/thumbnail/video/${dmMatch[1]}`;
    }
  }
  
  return null;
}

