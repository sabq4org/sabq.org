/**
 * Cloudflare Worker: Image Proxy for Google Cloud Storage
 * 
 * This worker proxies images from Google Cloud Storage through Cloudflare,
 * enabling Polish (WebP/AVIF conversion) and CDN caching for better performance.
 * 
 * Usage:
 * Instead of: https://storage.googleapis.com/sabq-news-photos/images/photo.jpg
 * Use: https://sabq.org/cdn-img/sabq-news-photos/images/photo.jpg
 * 
 * Benefits:
 * - Polish applies WebP/AVIF compression automatically
 * - Images are cached at Cloudflare edge (faster for users)
 * - Reduced bandwidth costs from GCS
 */

const GCS_ORIGINS = [
  'storage.googleapis.com',
  'storage.cloud.google.com'
];

// الصور النقطية فقط: SVG (وأي نوع غير مدرج) يُقدَّم من أصل sabq.org فيُنفّذ
// سكربتًا بصلاحيات الموقع، والمسار يقبل أي حاوية GCS يحددها الرابط.
const RASTER_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
]);

export function isServableImageType(contentType) {
  const base = String(contentType || '').split(';')[0].trim().toLowerCase();
  return RASTER_TYPES.has(base);
}

const SAFETY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; sandbox",
};

// Cache settings
const CACHE_TTL = 60 * 60 * 24 * 30; // 30 days
const STALE_WHILE_REVALIDATE = 60 * 60 * 24 * 7; // 7 days

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Only handle /cdn-img/* paths
    if (!url.pathname.startsWith('/cdn-img/')) {
      return fetch(request);
    }
    
    // Extract the GCS path from the URL
    // /cdn-img/bucket-name/path/to/image.jpg -> storage.googleapis.com/bucket-name/path/to/image.jpg
    const gcsPath = url.pathname.replace('/cdn-img/', '');
    
    if (!gcsPath) {
      return new Response('Missing image path', { status: 400 });
    }
    
    // Construct the GCS URL
    const gcsUrl = `https://storage.googleapis.com/${gcsPath}`;
    
    // Check cache first
    const cacheKey = new Request(url.toString(), request);
    const cache = caches.default;
    
    let response = await cache.match(cacheKey);
    
    if (response && !isServableImageType(response.headers.get('Content-Type'))) {
      // نسخة خُزِّنت قبل هذا الفحص (مثل SVG): لا تُقدَّم وتُحذف.
      ctx.waitUntil(cache.delete(cacheKey));
      return new Response('Unsupported image type', { status: 415, headers: { 'Cache-Control': 'no-store', ...SAFETY_HEADERS } });
    }

    if (response) {
      // Return cached response with HIT header
      const headers = new Headers(response.headers);
      headers.set('X-Cache-Status', 'HIT');
      for (const [name, value] of Object.entries(SAFETY_HEADERS)) headers.set(name, value);
      return new Response(response.body, {
        status: response.status,
        headers: headers
      });
    }
    
    // Fetch from GCS
    try {
      const gcsResponse = await fetch(gcsUrl, {
        headers: {
          'Accept': request.headers.get('Accept') || 'image/*',
          'User-Agent': 'Cloudflare-Worker-ImageProxy/1.0'
        },
        cf: {
          // Enable Polish for image optimization
          polish: 'lossy',
          // Enable WebP conversion
          image: {
            format: 'auto'
          },
          // Cache at edge
          cacheTtl: CACHE_TTL,
          cacheEverything: true
        }
      });
      
      if (!gcsResponse.ok) {
        return new Response(`Image not found: ${gcsPath}`, { 
          status: gcsResponse.status,
          headers: {
            'Content-Type': 'text/plain',
            'Cache-Control': 'no-store'
          }
        });
      }
      
      // Get content type
      const contentType = gcsResponse.headers.get('Content-Type') || 'image/jpeg';
      
      // Only raster image types (no SVG / HTML / unknown)
      if (!isServableImageType(contentType)) {
        return new Response('Unsupported image type', { status: 415, headers: { 'Cache-Control': 'no-store', ...SAFETY_HEADERS } });
      }
      
      // Create response with caching headers
      const headers = new Headers({
        'Content-Type': contentType,
        'Cache-Control': `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`,
        'X-Cache-Status': 'MISS',
        'X-Original-URL': gcsUrl,
        'Vary': 'Accept',
        'Access-Control-Allow-Origin': '*',
        ...SAFETY_HEADERS,
      });
      
      // Copy ETag if present
      if (gcsResponse.headers.get('ETag')) {
        headers.set('ETag', gcsResponse.headers.get('ETag'));
      }
      
      response = new Response(gcsResponse.body, {
        status: 200,
        headers: headers
      });
      
      // Store in cache (don't await - fire and forget)
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      
      return response;
      
    } catch (error) {
      console.error('Image proxy error:', error);
      return new Response(`Error fetching image: ${error.message}`, { 
        status: 500,
        headers: {
          'Content-Type': 'text/plain',
          'Cache-Control': 'no-store'
        }
      });
    }
  }
};
