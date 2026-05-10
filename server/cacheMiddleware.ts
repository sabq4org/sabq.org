import { Request, Response, NextFunction } from 'express';

export interface CacheOptions {
  maxAge?: number;           // Browser cache TTL (seconds)
  sMaxAge?: number;          // Edge/CDN cache TTL (Cloudflare) - defaults to maxAge * 2
  public?: boolean;
  immutable?: boolean;
  staleWhileRevalidate?: number;
}

export function cacheControl(options: CacheOptions = {}) {
  const {
    maxAge = 300,
    public: isPublic = true,
    immutable = false,
    staleWhileRevalidate = 0,
  } = options;
  
  // Edge cache (s-maxage) defaults to 2x browser cache for Cloudflare optimization
  const sMaxAge = options.sMaxAge ?? maxAge * 2;

  return (req: Request, res: Response, next: NextFunction) => {
    // Build the Cache-Control header value
    let cacheControlValue: string;
    
    // For CDN caching with no browser cache:
    // Use s-maxage for Cloudflare edge caching, max-age=0 forces browser revalidation
    if (maxAge === 0 && isPublic && sMaxAge > 0) {
      const directives = [
        'public',
        'max-age=0',
        `s-maxage=${sMaxAge}`,
      ];
      if (staleWhileRevalidate > 0) {
        directives.push(`stale-while-revalidate=${staleWhileRevalidate}`);
      }
      cacheControlValue = directives.join(', ');
    } else {
      const directives: string[] = [];

      if (isPublic) {
        directives.push('public');
      } else {
        directives.push('private');
      }

      directives.push(`max-age=${maxAge}`);
      
      // s-maxage for CDN/Edge caching (Cloudflare)
      if (isPublic && sMaxAge > 0) {
        directives.push(`s-maxage=${sMaxAge}`);
      }

      if (immutable) {
        directives.push('immutable');
      }

      if (staleWhileRevalidate > 0) {
        directives.push(`stale-while-revalidate=${staleWhileRevalidate}`);
      }
      
      cacheControlValue = directives.join(', ');
    }
    
    // Override writeHead to set Cache-Control header at the very last moment
    // This runs AFTER all middleware including session have set their headers
    const originalWriteHead = res.writeHead.bind(res);
    res.writeHead = function(statusCode: number, reasonOrHeaders?: string | any, headers?: any) {
      // Handle different writeHead signatures:
      // writeHead(statusCode)
      // writeHead(statusCode, headers)
      // writeHead(statusCode, reasonPhrase, headers)
      let headersArg = headers;
      if (typeof reasonOrHeaders === 'object') {
        headersArg = reasonOrHeaders;
        reasonOrHeaders = undefined;
      }
      
      // Remove Cache-Control from headers argument if present
      if (headersArg) {
        delete headersArg['Cache-Control'];
        delete headersArg['cache-control'];
      }
      
      // Remove any existing Cache-Control header first, then set ours
      res.removeHeader('Cache-Control');
      res.removeHeader('cache-control');
      res.setHeader('Cache-Control', cacheControlValue);
      res.setHeader('Vary', 'Accept-Encoding');
      
      // Call original with cleaned arguments
      if (reasonOrHeaders !== undefined) {
        return originalWriteHead(statusCode, reasonOrHeaders, headersArg);
      } else if (headersArg !== undefined) {
        return originalWriteHead(statusCode, headersArg);
      } else {
        return originalWriteHead(statusCode);
      }
    } as typeof res.writeHead;
    
    next();
  };
}

export function noCache() {
  return (_req: Request, res: Response, next: NextFunction) => {
    const originalWriteHead = res.writeHead.bind(res);
    res.writeHead = function(statusCode: number, ...args: any[]) {
      res.removeHeader('Cache-Control');
      res.removeHeader('cache-control');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      return originalWriteHead(statusCode, ...args);
    } as typeof res.writeHead;
    next();
  };
}

export function withETag(req: Request, res: Response, data: any, etag: string) {
  const clientETag = req.headers['if-none-match'];
  
  if (clientETag === etag) {
    res.status(304).end();
    return true;
  }
  
  res.setHeader('ETag', etag);
  return false;
}

// Cache durations optimized for Cloudflare CDN + Autoscale
// Autoscale has cold starts, so we rely more on edge caching (s-maxage)
// and stale-while-revalidate to serve content while origin warms up
export const CACHE_DURATIONS = {
  NONE: 0,
  // Breaking news & real-time content (30s browser, 60s edge)
  REALTIME: 30,
  // Homepage feeds, latest news (2min browser, 4min edge)
  SHORT: 120,
  // Article pages, category feeds (5min browser, 10min edge)
  MEDIUM: 300,
  // Categories list, settings (1hr browser, 2hr edge)
  LONG: 3600,
  // Static content, old articles (24hr browser, 48hr edge)
  VERY_LONG: 86400,
  // Images, assets (1 year, immutable)
  PERMANENT: 31536000,
} as const;

// Autoscale-optimized cache preset for critical endpoints
// Uses aggressive edge caching with stale-while-revalidate for cold start resilience
// IMPORTANT: These settings are crucial for Autoscale performance - Cloudflare CDN
// caches responses at edge, reducing load on origin servers during cold starts
export const AUTOSCALE_CACHE = {
  // Homepage - edge cache 60s with generous stale-while-revalidate for cold start resilience
  // Cloudflare serves stale content instantly while revalidating from origin in background
  HOMEPAGE: { maxAge: 0, sMaxAge: 60, staleWhileRevalidate: 120 },
  // API feeds - moderate browser cache (1 min), longer edge cache (10 min)
  FEEDS: { maxAge: 60, sMaxAge: 600, staleWhileRevalidate: 600 },
  // Article pages - moderate caching (2 min browser, 15 min edge)
  ARTICLE: { maxAge: 120, sMaxAge: 900, staleWhileRevalidate: 600 },
  // Static lists (categories, etc) - long caching with stale-while-revalidate for cold starts
  STATIC: { maxAge: 3600, sMaxAge: 14400, staleWhileRevalidate: 7200 },
  // Dashboard stats - edge cache only, no browser cache (5 min edge)
  DASHBOARD: { maxAge: 0, sMaxAge: 300, staleWhileRevalidate: 600 },
} as const;

// Private cache for authenticated dashboard endpoints
// Uses browser-only caching (no CDN) with stale-while-revalidate for smooth UX
// IMPORTANT: Private cache means Cloudflare won't cache (user-specific data)
export const PRIVATE_CACHE = {
  // Dashboard stats - 1 min browser cache, serve stale for 2 min while refreshing
  DASHBOARD_STATS: { maxAge: 60, staleWhileRevalidate: 120, public: false },
  // Lists (articles, users) - 30s cache, stale for 1 min
  DASHBOARD_LISTS: { maxAge: 30, staleWhileRevalidate: 60, public: false },
  // KPIs and metrics - 2 min cache, stale for 3 min
  DASHBOARD_METRICS: { maxAge: 120, staleWhileRevalidate: 180, public: false },
} as const;
