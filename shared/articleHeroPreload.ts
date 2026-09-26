import { buildCloudflareUrl, generateResponsiveSrcSet, normalizeImageSrc, HERO_SIZES_ATTR, DEFAULT_IMAGE_SIZES_ATTR } from "./cdnImage";

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


export function buildHeroImagePreload(imageUrl: string | null | undefined, quality = 72, fallbackWidth = 960, sizes: string = HERO_SIZES_ATTR) {
  if (!imageUrl || imageUrl.startsWith("data:") || imageUrl.startsWith("blob:")) return undefined;
  const normalized = normalizeImageSrc(imageUrl);
  const href = buildCloudflareUrl(normalized, { width: fallbackWidth, quality }) || normalized;
  const imagesrcset = generateResponsiveSrcSet(normalized, quality);
  return { href, ...(imagesrcset ? { imagesrcset, imagesizes: sizes } : {}) };
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

/**
 * Resolves the display image URL for an article, properly prioritizing:
 * 1. Explicit imageUrl
 * 2. Explicit videoThumbnailUrl (for video articles)
 * 3. Auto-derived video thumbnail from YouTube / Dailymotion if videoUrl exists
 * 4. thumbnailUrl
 * 5. infographicBannerUrl
 */
export interface ArticleImageFields {
  imageUrl?: string | null;
  videoThumbnailUrl?: string | null;
  thumbnailUrl?: string | null;
  infographicBannerUrl?: string | null;
  videoUrl?: string | null;
  video_url?: string | null;
  featuredImage?: string | null;
  updatedAt?: string | Date | null;
}

// Moved from client/src/lib/imageUtils.ts (re-exported there) so the edge
// category-card preload resolves the same source image the card renders.
export function getArticleDisplayImageUrl(article: ArticleImageFields | null | undefined): string | null {
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

/**
 * The exact `src` <ArticleMedia> hands to <OptimizedImage> (NewsArticleCard
 * grid/list/compact). Shared with the edge category-card preload.
 */
export function getArticleCardImageSrc(article: ArticleImageFields): string {
  return getCacheBustedImageUrl(getArticleDisplayImageUrl(article) || article.featuredImage, article.updatedAt);
}

// <ArticleMedia variant="grid"> → <OptimizedImage preferSize="medium"> with no
// quality/sizes props: img src width 640, quality 85, default sizes attr.
export const CARD_GRID_IMAGE_WIDTH = 640;
export const CARD_IMAGE_QUALITY = 85;

/** Preload for the priority grid card (CategoryPage index 0). */
export function buildCardImagePreload(article: ArticleImageFields) {
  return buildHeroImagePreload(getArticleCardImageSrc(article), CARD_IMAGE_QUALITY, CARD_GRID_IMAGE_WIDTH, DEFAULT_IMAGE_SIZES_ATTR);
}

/** Days kept by CategoryLandingPage's default timeRange ("30days"). */
export const CATEGORY_LANDING_DEFAULT_DAYS = 30;

/**
 * Mirrors CategoryLandingPage's default view (timeRange "30days", sort
 * "newest") over the /api/categories/:slug/articles rows, in API order: keep
 * rows published within the window, then a stable publishedAt-desc sort.
 * Returns the row rendered at index 0 (the priority card), if any.
 */
export function pickCategoryLandingLead<T extends { publishedAt?: string | Date | null }>(rows: T[], now: number = Date.now()): T | undefined {
  const cutoff = now - CATEGORY_LANDING_DEFAULT_DAYS * 24 * 60 * 60 * 1000;
  let lead: T | undefined;
  let leadTime = -Infinity;
  for (const row of rows) {
    if (!row.publishedAt) continue;
    const t = new Date(row.publishedAt).getTime();
    // Strict ">" keeps the first row on ties — Array.prototype.sort is stable.
    if (t >= cutoff && t > leadTime) { lead = row; leadTime = t; }
  }
  return lead;
}
