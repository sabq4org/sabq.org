import { getCacheBustedImageUrl, getArticleDisplayImageUrl } from "@shared/articleHeroPreload";
export { getCacheBustedImageUrl, getArticleDisplayImageUrl };
import { legacyObjectPosition, readImageFocus, type ImageFocusData } from "@shared/imageFocus";

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
  const focus = readImageFocus(article);

  if (!focus) {
    return defaultPosition;
  }

  // مربع الكاشف، أو نقطة 50/50 التي كان الكاشف القديم يخمّنها لمعظم الصور:
  // الموضع المشترك من shared/imageFocus.ts (الثلث العلوي عند غياب نقطة موثوقة).
  // للقص الدقيق حسب الإطار مرّر `focus` إلى OptimizedImage بدل هذا الموضع الثابت.
  return legacyObjectPosition(focus);
}

/** بيانات التركيز الكاملة (مع المربع) لتمريرها إلى OptimizedImage عبر `focus`. */
export function getImageFocus(article: any): ImageFocusData | null {
  return readImageFocus(article);
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


