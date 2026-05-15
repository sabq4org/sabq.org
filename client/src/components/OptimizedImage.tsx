import { useState, useEffect, useRef, useMemo } from "react";
import { ImageOff } from "lucide-react";
import {
  buildCloudflareUrl as sharedBuildCloudflareUrl,
  generateResponsiveSrcSet as sharedGenerateResponsiveSrcSet,
  normalizeImageSrc as sharedNormalizeImageSrc,
} from "@/lib/cdnImage";

export type ImageSize = 'thumbnail' | 'small' | 'medium' | 'large' | 'original';

interface OptimizedImageProps {
  src: string;
  alt: string;
  /** Classes applied to the image element (sizing, object-fit, transitions, etc.) */
  className?: string;
  /** Classes applied only to the wrapper div (for placeholder positioning) */
  wrapperClassName?: string;
  objectPosition?: string;
  priority?: boolean;
  aspectRatio?: string;
  fallbackGradient?: string;
  webpSrc?: string;
  blurDataUrl?: string;
  threshold?: number;
  sizes?: string;
  srcSet?: string;
  fetchPriority?: "high" | "low" | "auto";
  onLoad?: () => void;
  onError?: () => void;
  width?: number;
  height?: number;
  quality?: number;
  preferSize?: ImageSize;
}

const IMAGE_WIDTHS: Record<ImageSize, number> = {
  thumbnail: 150,
  small: 400,
  medium: 800,
  large: 1200,
  original: 0
};

// Generate CSS gradient placeholder based on dominant color or fallback
// This is lightweight and doesn't require fetching any additional resources
function generateGradientPlaceholder(src: string): string {
  // Create a subtle gradient placeholder based on src hash for consistency
  if (!src) return 'linear-gradient(135deg, hsl(var(--muted)) 0%, hsl(var(--muted-foreground)/0.1) 100%)';
  
  // Simple hash for consistent color per image
  let hash = 0;
  for (let i = 0; i < src.length; i++) {
    hash = ((hash << 5) - hash) + src.charCodeAt(i);
    hash |= 0;
  }
  
  // Generate subtle gradient based on hash
  const hue = Math.abs(hash) % 360;
  const saturation = 5 + (Math.abs(hash >> 8) % 10); // Very low saturation
  const lightness = 85 + (Math.abs(hash >> 16) % 10); // High lightness
  
  return `linear-gradient(135deg, hsl(${hue} ${saturation}% ${lightness}%) 0%, hsl(${hue} ${saturation}% ${lightness - 5}%) 100%)`;
}

// CDN helpers are shared via @/lib/cdnImage so both <OptimizedImage> and the
// legacy HTML transformer use the exact same allow-list and srcset widths.
const normalizeImageSrc = sharedNormalizeImageSrc;
const buildCloudflareUrl = sharedBuildCloudflareUrl;

// Legacy: Build optimized image URL with query parameters for server-side optimization
function buildOptimizedUrl(src: string, options?: { 
  width?: number; 
  height?: number; 
  quality?: number;
  format?: 'webp' | 'avif' | 'jpeg' | 'png';
}): string {
  if (!src) return src;
  
  // Only optimize images from public-objects (our storage)
  if (!src.includes('/public-objects/')) return src;
  
  // Already has optimization params
  if (src.includes('?w=') || src.includes('&w=')) return src;
  
  const params: string[] = [];
  if (options?.width) params.push(`w=${options.width}`);
  if (options?.height) params.push(`h=${options.height}`);
  if (options?.quality) params.push(`q=${options.quality}`);
  if (options?.format) params.push(`f=${options.format}`);
  
  if (params.length === 0) return src;
  
  const separator = src.includes('?') ? '&' : '?';
  return `${src}${separator}${params.join('&')}`;
}

const generateResponsiveSrcSet = sharedGenerateResponsiveSrcSet;

// Convert image URL using Cloudflare CDN with smart sizing
function getOptimizedUrl(src: string, options?: {
  width?: number;
  height?: number;
  quality?: number;
  preferSize?: ImageSize;
}): string {
  if (!src) return '';
  
  // Default sizes based on preferSize
  const sizeMap: Record<ImageSize, number> = {
    thumbnail: 150,
    small: 320,
    medium: 640,
    large: 960,
    original: 0
  };
  
  const width = options?.width || (options?.preferSize ? sizeMap[options.preferSize] : 640);
  const quality = options?.quality || 85;
  
  // Use Cloudflare CDN for optimization
  if (width > 0) {
    return buildCloudflareUrl(src, { width, height: options?.height, quality });
  }
  
  return src;
}

export function OptimizedImage({
  src,
  alt,
  className = "",
  wrapperClassName = "",
  objectPosition = "center 20%",
  priority = false,
  aspectRatio,
  fallbackGradient = "from-primary/10 to-accent/10",
  webpSrc,
  blurDataUrl,
  threshold = 0.1,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
  srcSet,
  fetchPriority = "auto",
  onLoad,
  onError,
  width,
  height,
  quality,
  preferSize,
}: OptimizedImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [useFallback, setUseFallback] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const containerRef = useRef<HTMLDivElement>(null);

  const normalizedSrc = useMemo(() => normalizeImageSrc(src), [src]);
  
  const optimizedSrc = useMemo(() => {
    if (webpSrc) return webpSrc;
    return getOptimizedUrl(normalizedSrc, { width, height, quality, preferSize });
  }, [normalizedSrc, webpSrc, width, height, quality, preferSize]);
  
  const isTransformed = optimizedSrc !== normalizedSrc;
  
  const autoSrcSet = useMemo(() => {
    if (srcSet) return srcSet;
    if (useFallback) return '';
    return generateResponsiveSrcSet(normalizedSrc);
  }, [normalizedSrc, srcSet, useFallback]);
  
  // Use provided blurDataUrl (base64) or generate lightweight CSS gradient
  const gradientPlaceholder = useMemo(() => generateGradientPlaceholder(src), [src]);
  const hasBlurDataUrl = !!blurDataUrl;

  useEffect(() => {
    if (priority) {
      setIsInView(true);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    // Check if IntersectionObserver is available
    if (!('IntersectionObserver' in window)) {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= threshold) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: "300px", // Increased for earlier loading
        threshold: [0, threshold, 0.5, 1],
      }
    );

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [priority, threshold]);

  // Note: Preload removed - browser handles srcset selection automatically
  // Adding preload with fixed size causes duplicate downloads on different viewports

  const handleLoad = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    if (!useFallback && isTransformed) {
      setUseFallback(true);
      return;
    }
    setHasError(true);
    setIsLoaded(true);
    onError?.();
  };

  if (hasError) {
    return (
      <div
        className={`relative flex items-center justify-center bg-gradient-to-br ${fallbackGradient} ${className} ${wrapperClassName}`}
        style={aspectRatio ? { aspectRatio } : undefined}
      >
        <ImageOff className="h-8 w-8 text-muted-foreground/30" aria-hidden="true" />
      </div>
    );
  }

  const imageStyles = {
    objectPosition,
  };

  // Build the final className for the img element, including opacity transition
  const imgClassName = `${className} transition-opacity duration-300 ${
    isLoaded ? "opacity-100" : "opacity-0"
  }`;

  return (
    <div 
      ref={containerRef} 
      className={`relative ${wrapperClassName}`}
      style={aspectRatio ? { aspectRatio } : undefined}
    >
      {/* Simple gradient placeholder - Safari-safe, no transforms or animations */}
      {!isLoaded && (
        <div 
          className="absolute inset-0 w-full h-full"
          style={{
            background: hasBlurDataUrl 
              ? `url(${blurDataUrl})` 
              : gradientPlaceholder,
            backgroundSize: 'cover',
            backgroundPosition: objectPosition,
            filter: hasBlurDataUrl ? 'blur(10px)' : 'none',
          }}
          aria-hidden="true"
        />
      )}
      
      {/* Main image with progressive loading */}
      {isInView && (
        autoSrcSet && !useFallback ? (
          <picture className="contents">
            <source 
              srcSet={autoSrcSet} 
              sizes={sizes}
            />
            <img
              src={useFallback ? normalizedSrc : (optimizedSrc || normalizedSrc)}
              alt={alt}
              className={imgClassName}
              style={imageStyles}
              loading={priority ? "eager" : "lazy"}
              {...{ fetchpriority: priority ? "high" : fetchPriority }}
              onLoad={handleLoad}
              onError={handleError}
              decoding={priority ? "sync" : "async"}
              sizes={sizes}
            />
          </picture>
        ) : (
          <img
            src={useFallback ? normalizedSrc : (optimizedSrc || normalizedSrc)}
            alt={alt}
            className={imgClassName}
            style={imageStyles}
            loading={priority ? "eager" : "lazy"}
            {...{ fetchpriority: priority ? "high" : fetchPriority }}
            onLoad={handleLoad}
            onError={handleError}
            decoding={priority ? "sync" : "async"}
            sizes={sizes}
          />
        )
      )}
    </div>
  );
}

// Export a simpler version for quick use
export function QuickImage({ 
  src, 
  alt, 
  className = "" 
}: { 
  src: string; 
  alt: string; 
  className?: string;
}) {
  return (
    <OptimizedImage
      src={src}
      alt={alt}
      className={className}
      aspectRatio="16/9"
    />
  );
}
