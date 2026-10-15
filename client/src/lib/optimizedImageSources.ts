// Pure URL resolution behind <OptimizedImage>. Kept React-free so unit tests
// can assert that edge preloads (shared/articleHeroPreload.ts) request the
// exact bytes the component renders — any drift downloads the LCP image twice.
import { buildCloudflareUrl, generateResponsiveSrcSet } from "@shared/cdnImage";

export type ImageSize = 'thumbnail' | 'small' | 'medium' | 'large' | 'original';

const PREFER_SIZE_WIDTHS: Record<ImageSize, number> = {
  thumbnail: 150,
  small: 320,
  medium: 640,
  large: 960,
  original: 0,
};

export interface OptimizedSrcOptions {
  width?: number;
  height?: number;
  quality?: number;
  preferSize?: ImageSize;
  aspectRatio?: string;
}

/** The <img src> for an already-normalized source (webpSrc handled by caller). */
export function getOptimizedImageSrc(normalizedSrc: string, options: OptimizedSrcOptions = {}): string {
  if (!normalizedSrc) return '';
  const { width, quality, preferSize, aspectRatio } = options;
  const baseWidth = width || (preferSize ? PREFER_SIZE_WIDTHS[preferSize] : 640);
  let height = options.height;
  if (!height && aspectRatio && typeof aspectRatio === 'string' && aspectRatio.includes('/')) {
    const [w, h] = aspectRatio.split('/').map(Number);
    if (w > 0 && h > 0 && baseWidth > 0) {
      height = Math.round((baseWidth * h) / w);
    }
  }
  if (baseWidth > 0) {
    return buildCloudflareUrl(normalizedSrc, { width: baseWidth, height, quality: quality || 85 });
  }
  return normalizedSrc;
}

/** The <source srcset> candidates (quality threaded through, default 85). */
export function getOptimizedImageSrcSet(normalizedSrc: string, quality?: number): string {
  return generateResponsiveSrcSet(normalizedSrc, quality);
}
