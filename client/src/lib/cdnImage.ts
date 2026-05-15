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
    return src.replace(/\/[^/]+$/, '/public');
  }

  if (src.startsWith('data:') || src.startsWith('blob:')) return src;

  let imagePath = src;
  if (src.startsWith('http')) {
    try {
      const url = new URL(src);
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
  } else {
    params.push('fit=scale-down');
  }

  return `/cdn-cgi/image/${params.join(',')}${imagePath}`;
}

export const RESPONSIVE_WIDTHS = [320, 640, 960, 1280, 1920] as const;

export function generateResponsiveSrcSet(src: string, quality: number = 85): string {
  if (!src) return '';

  if (src.includes('imagedelivery.net')) return '';
  if (src.startsWith('http') && !ALLOWED_EXTERNAL_HOSTS.some(host => src.includes(host))) return '';
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
