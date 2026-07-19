const CLOUDFLARE_ALLOWED_PATHS = [
  '/uploads/',
  '/media/',
  '/images/',
  '/assets/',
];

const CLOUDFLARE_BLOCKED_PATHS = [
  '/api/',
  '/cdn-cgi/',
  '/_next/',
  '/public-objects/',
];

const ALLOWED_EXTERNAL_HOSTS = ['sabq.org'];
const NEWS_IMAGES_R2_HOSTS = ['media.sabq.org'];

const NEWS_IMAGES_R2_WIDTHS = [480, 960, 1600] as const;

function isNewsImagesR2Url(url: URL): boolean {
  return NEWS_IMAGES_R2_HOSTS.includes(url.hostname.toLowerCase()) &&
    /^\/news\/\d{4}\/\d{2}\/[a-f0-9-]+\/w\d+\.webp$/i.test(url.pathname);
}

function availableNewsImagesR2Widths(url: URL): number[] {
  const deliveredWidth = Number(url.pathname.match(/\/w(\d+)\.webp$/i)?.[1]);
  if (!Number.isFinite(deliveredWidth) || deliveredWidth <= 0) return [];
  return Array.from(new Set([
    ...NEWS_IMAGES_R2_WIDTHS.filter((width) => width < deliveredWidth),
    deliveredWidth,
  ])).sort((a, b) => a - b);
}

function buildNewsImagesR2Variant(url: URL, requestedWidth?: number): string {
  if (!requestedWidth || !isNewsImagesR2Url(url)) return url.toString();
  const availableWidths = availableNewsImagesR2Widths(url);
  const variantWidth =
    availableWidths.find((width) => width >= requestedWidth) ||
    availableWidths[availableWidths.length - 1];
  if (!variantWidth) return url.toString();
  url.pathname = url.pathname.replace(/\/w\d+\.webp$/i, `/w${variantWidth}.webp`);
  return url.toString();
}

export function normalizeImageSrc(src: string): string {
  if (!src) return src;
  if (src.startsWith('/public-objects/')) {
    return '/api/public-media/public/' + src.replace('/public-objects/', '');
  }
  return src;
}

export interface CloudflareUrlOptions {
  width?: number;
  height?: number;
  quality?: number;
}

export function buildCloudflareUrl(src: string, options?: CloudflareUrlOptions): string {
  if (!src) return src;

  if (src.includes('/cdn-cgi/image/')) return src;

  if (src.includes('imagedelivery.net')) {
    // Use flexible variants for full-quality delivery.
    // Format: /w=WIDTH,q=QUALITY,fit=scale-down
    // Falls back to /public if flexible variants aren't enabled.
    const parts: string[] = [];
    if (options?.width) parts.push(`w=${options.width}`);
    if (options?.height) parts.push(`h=${options.height}`);
    parts.push(`q=${options?.quality || 90}`);
    if (options?.width && options?.height) {
      parts.push('fit=cover');
      parts.push('gravity=auto');
    } else {
      parts.push('fit=scale-down');
    }
    return src.replace(/\/[^/]+$/, `/${parts.join(',')}`);
  }

  if (src.startsWith('data:') || src.startsWith('blob:')) return src;

  let imagePath = src;
  if (src.startsWith('http')) {
    try {
      const url = new URL(src);
      if (isNewsImagesR2Url(url)) {
        return buildNewsImagesR2Variant(url, options?.width);
      }
      const isAllowedHost = ALLOWED_EXTERNAL_HOSTS.some(host => url.hostname.endsWith(host));
      if (!isAllowedHost) return src;
      imagePath = url.pathname + url.search;
    } catch {
      return src;
    }
  }

  if (CLOUDFLARE_BLOCKED_PATHS.some(blocked => imagePath.includes(blocked))) {
    return src;
  }

  const isAllowedPath = CLOUDFLARE_ALLOWED_PATHS.some(allowed => imagePath.includes(allowed));
  if (!isAllowedPath) return src;

  const params: string[] = [];
  if (options?.width) params.push(`width=${options.width}`);
  if (options?.height) params.push(`height=${options.height}`);
  params.push(`quality=${options?.quality || 85}`);
  params.push('format=auto');

  if (options?.width && options?.height) {
    params.push('fit=cover');
    params.push('gravity=auto');
  } else {
    params.push('fit=scale-down');
  }

  return `/cdn-cgi/image/${params.join(',')}${imagePath}`;
}

export const RESPONSIVE_WIDTHS = [320, 640, 960, 1280, 1920] as const;

export function generateResponsiveSrcSet(src: string, quality: number = 85): string {
  if (!src) return '';

  try {
    const r2Url = new URL(src);
    if (isNewsImagesR2Url(r2Url)) {
      return availableNewsImagesR2Widths(r2Url).map((width) => {
        const variant = new URL(r2Url.toString());
        variant.pathname = variant.pathname.replace(/\/w\d+\.webp$/i, `/w${width}.webp`);
        return `${variant.toString()} ${width}w`;
      }).join(', ');
    }
  } catch {
    // Relative paths continue through the existing Cloudflare Image Resizing path.
  }

  if (src.startsWith('http') && !src.includes('imagedelivery.net') && !ALLOWED_EXTERNAL_HOSTS.some(host => src.includes(host))) return '';
  if (src.startsWith('data:') || src.startsWith('blob:')) return '';

  const entries = RESPONSIVE_WIDTHS.map(w => {
    const transformed = buildCloudflareUrl(src, { width: w, quality });
    return { url: transformed, w };
  });

  const allSame = entries.every(e => e.url === src);
  if (allSame) return '';

  return entries.map(e => `${e.url} ${e.w}w`).join(', ');
}

export const HERO_SIZES_ATTR = '(max-width: 640px) 100vw, (max-width: 1024px) 80vw, 720px';
