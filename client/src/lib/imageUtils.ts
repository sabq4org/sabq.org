/**
 * Image utility functions for cache busting and URL handling
 */

/**
 * Adds cache busting parameter to image URL based on update timestamp
 * This ensures browsers fetch fresh images when content is updated
 * 
 * @param imageUrl - The original image URL
 * @param updatedAt - The timestamp when the image/content was last updated
 * @returns URL with cache busting parameter
 */
export function getCacheBustedImageUrl(
  imageUrl: string | null | undefined,
  updatedAt?: string | Date | null
): string {
  if (!imageUrl) return '';
  
  // Don't add cache busting to data URLs or blob URLs
  if (imageUrl.startsWith('data:') || imageUrl.startsWith('blob:')) {
    return imageUrl;
  }
  
  // Generate version based on updatedAt or current time
  let version: string;
  if (updatedAt) {
    const date = typeof updatedAt === 'string' ? new Date(updatedAt) : updatedAt;
    version = Math.floor(date.getTime() / 1000).toString(36); // Convert to base36 for shorter URL
  } else {
    // If no updatedAt, use a daily cache (changes once per day)
    version = Math.floor(Date.now() / 86400000).toString(36);
  }
  
  // Check if URL already has query parameters
  const separator = imageUrl.includes('?') ? '&' : '?';
  
  return `${imageUrl}${separator}v=${version}`;
}

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
export function getObjectPosition(article: any, defaultPosition: string = 'center 20%'): string {
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
export function getFocalPointStyle(article: any, defaultPosition: string = 'center 20%'): React.CSSProperties {
  const position = getObjectPosition(article, defaultPosition);
  return {
    backgroundPosition: position,
    objectPosition: position,
  };
}
