import { buildCloudflareUrl, generateResponsiveSrcSet, normalizeImageSrc, HERO_SIZES_ATTR } from "./cdnImage";

export const ARTICLE_HERO_QUALITY = 85;
export const ARTICLE_HERO_FALLBACK_WIDTH = 640;

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


export function buildHeroImagePreload(imageUrl: string | null | undefined, quality = 72, fallbackWidth = 960) {
  if (!imageUrl || imageUrl.startsWith("data:") || imageUrl.startsWith("blob:")) return undefined;
  const normalized = normalizeImageSrc(imageUrl);
  const href = buildCloudflareUrl(normalized, { width: fallbackWidth, quality }) || normalized;
  const imagesrcset = generateResponsiveSrcSet(normalized, quality);
  return { href, ...(imagesrcset ? { imagesrcset, imagesizes: HERO_SIZES_ATTR } : {}) };
}

export function buildArticleHeroPreload(article: {
  imageUrl?: string | null;
  updatedAt?: string | Date | null;
  publishedAt?: string | Date | null;
  status?: string | null;
  isVideoTemplate?: boolean | null;
}) {
  const publishedAt = article.publishedAt ? new Date(article.publishedAt).getTime() : NaN;
  if (article.status !== "published" || article.isVideoTemplate || !Number.isFinite(publishedAt) || publishedAt > Date.now()) return undefined;
  return buildHeroImagePreload(getCacheBustedImageUrl(article.imageUrl, article.updatedAt), ARTICLE_HERO_QUALITY, ARTICLE_HERO_FALLBACK_WIDTH);
}
