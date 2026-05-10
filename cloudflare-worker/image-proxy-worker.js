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
    
    if (response) {
      // Return cached response with HIT header
      const headers = new Headers(response.headers);
      headers.set('X-Cache-Status', 'HIT');
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
      
      // Only process image types
      if (!contentType.startsWith('image/')) {
        return new Response('Not an image', { status: 400 });
      }
      
      // Create response with caching headers
      const headers = new Headers({
        'Content-Type': contentType,
        'Cache-Control': `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`,
        'X-Cache-Status': 'MISS',
        'X-Original-URL': gcsUrl,
        'Vary': 'Accept',
        'Access-Control-Allow-Origin': '*'
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
