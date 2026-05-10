/**
 * Cloudflare Image Resizing Service
 * يستخدم Cloudflare لتغيير حجم الصور تلقائياً بدون تخزين إضافي
 * https://developers.cloudflare.com/images/transform-images/transform-via-url/
 */

export interface CloudflareImageOptions {
  width?: number;
  height?: number;
  fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad';
  quality?: number;
  format?: 'auto' | 'webp' | 'avif' | 'jpeg' | 'png';
  gravity?: 'auto' | 'center' | 'top' | 'bottom' | 'left' | 'right';
}

const DEFAULT_THUMBNAIL_OPTIONS: CloudflareImageOptions = {
  width: 640,
  height: 360,
  fit: 'cover',
  quality: 80,
  format: 'auto',
  gravity: 'auto'
};

const DEFAULT_CARD_OPTIONS: CloudflareImageOptions = {
  width: 400,
  height: 225,
  fit: 'cover',
  quality: 75,
  format: 'auto',
  gravity: 'auto'
};

const DEFAULT_HERO_OPTIONS: CloudflareImageOptions = {
  width: 1200,
  height: 675,
  fit: 'cover',
  quality: 85,
  format: 'auto',
  gravity: 'auto'
};

/**
 * Generate Cloudflare Image Resizing URL
 * @param imageUrl - Original image URL (can be relative or absolute)
 * @param options - Resize options
 * @returns Cloudflare-optimized image URL
 */
export function getCloudflareImageUrl(
  imageUrl: string | null | undefined,
  options: CloudflareImageOptions = DEFAULT_THUMBNAIL_OPTIONS
): string | null {
  if (!imageUrl) return null;
  
  // Skip if already a Cloudflare resized URL
  if (imageUrl.includes('/cdn-cgi/image/')) {
    return imageUrl;
  }
  
  // Skip external URLs (not on our domain)
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    try {
      const url = new URL(imageUrl);
      const ourDomains = ['sabq.org', 'www.sabq.org', 'replit.dev', 'repl.co'];
      const isOurDomain = ourDomains.some(d => url.hostname.endsWith(d));
      
      if (!isOurDomain) {
        // For external images, return as-is (can't use Cloudflare resizing)
        return imageUrl;
      }
      
      // Extract path from absolute URL on our domain
      imageUrl = url.pathname;
    } catch {
      return imageUrl;
    }
  }
  
  // Build Cloudflare options string
  const optionParts: string[] = [];
  
  if (options.width) optionParts.push(`width=${options.width}`);
  if (options.height) optionParts.push(`height=${options.height}`);
  if (options.fit) optionParts.push(`fit=${options.fit}`);
  if (options.quality) optionParts.push(`quality=${options.quality}`);
  if (options.format) optionParts.push(`format=${options.format}`);
  if (options.gravity) optionParts.push(`gravity=${options.gravity}`);
  
  const optionsString = optionParts.join(',');
  
  // Ensure path starts with /
  const imagePath = imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`;
  
  // Return relative URL (works in both dev and prod via Cloudflare)
  return `/cdn-cgi/image/${optionsString}${imagePath}`;
}

/**
 * Get thumbnail URL
 * NOTE: Cloudflare Image Resizing is disabled on this account
 * Using imageUrl directly as fallback
 */
export function getThumbnailUrl(
  imageUrl: string | null | undefined,
  existingThumbnailUrl?: string | null
): string | null {
  // If existing thumbnail is already Cloudflare, use it
  if (existingThumbnailUrl?.includes('/cdn-cgi/image/')) {
    return existingThumbnailUrl;
  }
  
  // If existing thumbnail exists and is valid (not a broken GCS URL), use it
  if (existingThumbnailUrl && !existingThumbnailUrl.includes('undefined')) {
    return existingThumbnailUrl;
  }
  
  // Fallback to imageUrl directly (Cloudflare Image Resizing not enabled)
  return imageUrl || null;
}

/**
 * Get card-sized image URL (smaller than thumbnail)
 */
export function getCardImageUrl(imageUrl: string | null | undefined): string | null {
  return getCloudflareImageUrl(imageUrl, DEFAULT_CARD_OPTIONS);
}

/**
 * Get hero-sized image URL (larger, high quality)
 */
export function getHeroImageUrl(imageUrl: string | null | undefined): string | null {
  return getCloudflareImageUrl(imageUrl, DEFAULT_HERO_OPTIONS);
}

/**
 * Transform article object to use Cloudflare image URLs
 * This can be used to patch API responses
 */
export function transformArticleImages<T extends {
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
}>(article: T): T {
  if (!article.imageUrl) return article;
  
  return {
    ...article,
    thumbnailUrl: getThumbnailUrl(article.imageUrl, article.thumbnailUrl)
  };
}

/**
 * Transform array of articles
 */
export function transformArticlesImages<T extends {
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
}>(articles: T[]): T[] {
  return articles.map(transformArticleImages);
}

export const cloudflareImageSizes = {
  thumbnail: DEFAULT_THUMBNAIL_OPTIONS,
  card: DEFAULT_CARD_OPTIONS,
  hero: DEFAULT_HERO_OPTIONS
};
