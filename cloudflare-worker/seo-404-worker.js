/**
 * Sabq.org SEO-Optimized 404 Worker (Simplified Logic v2.0)
 * 
 * This Cloudflare Worker intercepts requests and returns proper HTTP 404 status codes
 * for non-existent content, solving the "Soft 404" problem caused by SPA fallback.
 * 
 * VERIFY Logic (simplified):
 * - Only verify: Short URLs (7 chars) + Content paths (/article/, /category/, etc.)
 * - Everything else: Pass directly to SPA/Origin (no verification)
 * 
 * 404 Response:
 * - Fetches custom 404 page from origin (/not-found) and returns with HTTP 404 status
 */

var CACHE_TTL = 60;
var EDGE_EXISTS_PATH = '/api/edge-exists';
var NOT_FOUND_PATH = '/not-found';
var NOT_FOUND_CACHE_TTL = 300;
var HOMEPAGE_API_PATH = '/api/homepage-lite';
var HOMEPAGE_CACHE_TTL = 60;
var PRERENDER_ENABLED = true;

var STATIC_EXTENSIONS = [
  '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2',
  '.ttf', '.eot', '.webp', '.avif', '.mp4', '.webm', '.json', '.xml', '.txt', '.map',
  '.pdf', '.zip', '.gz', '.tar', '.rar', '.7z', '.doc', '.docx', '.xls', '.xlsx'
];

var SHORT_URL_PATTERN = /^\/([a-zA-Z0-9]{5,9})$/;

var KNOWN_ROOT_WORDS = [
  'news', 'about', 'login', 'admin', 'staff', 'terms', 'ifox',
  'search', 'video', 'media', 'live', 'mirqab', 'opinion', 'audio',
  'careers', 'privacy', 'register', 'profile', 'settings', 'contact',
  'bookmarks', 'history', 'notifications', 'trending', 'latest', 'popular',
  'dashboard', 'categories', 'advertise', 'publishers', 'health', 'ready',
  'lite', 'en', 'ur', 'omq', 'ai'
];

var CONTENT_PREFIXES = [
  '/article/',
  '/opinion/',
  '/category/',
  '/reporter/',
  '/writer/',
  '/omq/'
];

function classifyRequest(pathname) {
  if (pathname.startsWith('/api/') || pathname === '/health' || pathname === '/ready') {
    return { type: 'api', shouldCheck: false };
  }

  for (var i = 0; i < STATIC_EXTENSIONS.length; i++) {
    if (pathname.endsWith(STATIC_EXTENSIONS[i])) {
      return { type: 'static', shouldCheck: false };
    }
  }

  if (pathname.startsWith('/@') || pathname.startsWith('/node_modules/') || pathname.startsWith('/assets/')) {
    return { type: 'static', shouldCheck: false };
  }

  if (SHORT_URL_PATTERN.test(pathname)) {
    var slug = pathname.slice(1).toLowerCase();
    if (KNOWN_ROOT_WORDS.indexOf(slug) !== -1) {
      return { type: 'spa', shouldCheck: false };
    }
    return { type: 'short-url', shouldCheck: true };
  }

  for (var j = 0; j < CONTENT_PREFIXES.length; j++) {
    if (pathname.startsWith(CONTENT_PREFIXES[j])) {
      return { type: 'content', shouldCheck: true };
    }
  }

  return { type: 'spa', shouldCheck: false };
}

async function checkExistence(origin, pathname) {
  var cacheKey = 'edge-exists:' + pathname;
  var cache = caches.default;
  
  var cachedResponse = await cache.match(new Request('https://cache-key/' + cacheKey));
  if (cachedResponse) {
    try {
      return await cachedResponse.json();
    } catch (e) {}
  }

  try {
    var url = new URL(EDGE_EXISTS_PATH, origin);
    url.searchParams.set('path', pathname);
    
    var response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'Cloudflare-Worker/1.0'
      }
    });

    if (!response.ok) {
      console.log('[EdgeExists] Origin returned ' + response.status + ' for ' + pathname);
      return { exists: true };
    }

    var data = await response.json();

    var cacheResponse = new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=' + CACHE_TTL
      }
    });
    await cache.put(new Request('https://cache-key/' + cacheKey), cacheResponse);

    return data;
  } catch (error) {
    console.error('[EdgeExists] Error checking ' + pathname + ':', error);
    return { exists: true };
  }
}

async function fetchCustom404Page(origin) {
  var cacheKey = 'custom-404-page';
  var cache = caches.default;
  
  var cachedResponse = await cache.match(new Request('https://cache-key/' + cacheKey));
  if (cachedResponse) {
    return cachedResponse.text();
  }

  try {
    var response = await fetch(origin + NOT_FOUND_PATH, {
      method: 'GET',
      headers: {
        'User-Agent': 'Cloudflare-Worker/1.0',
        'Accept': 'text/html'
      }
    });

    if (response.ok) {
      var html = await response.text();
      
      var cacheResponse = new Response(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=' + NOT_FOUND_CACHE_TTL
        }
      });
      await cache.put(new Request('https://cache-key/' + cacheKey), cacheResponse);
      
      return html;
    }
  } catch (error) {
    console.error('[404] Error fetching custom 404 page:', error);
  }

  return getFallback404Html();
}

function getFallback404Html() {
  return '<!DOCTYPE html>\n' +
'<html lang="ar" dir="rtl">\n' +
'<head>\n' +
'  <meta charset="UTF-8">\n' +
'  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
'  <title>404 - الصفحة غير موجودة | سبق</title>\n' +
'  <meta name="robots" content="noindex">\n' +
'  <style>\n' +
'    * { margin: 0; padding: 0; box-sizing: border-box; }\n' +
'    body {\n' +
'      font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;\n' +
'      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);\n' +
'      min-height: 100vh;\n' +
'      display: flex;\n' +
'      align-items: center;\n' +
'      justify-content: center;\n' +
'      color: #fff;\n' +
'    }\n' +
'    .container { text-align: center; padding: 2rem; }\n' +
'    h1 {\n' +
'      font-size: 8rem;\n' +
'      font-weight: bold;\n' +
'      background: linear-gradient(45deg, #e94560, #ff6b6b);\n' +
'      -webkit-background-clip: text;\n' +
'      -webkit-text-fill-color: transparent;\n' +
'      margin-bottom: 1rem;\n' +
'    }\n' +
'    h2 { font-size: 1.5rem; color: #a0a0a0; margin-bottom: 2rem; }\n' +
'    a {\n' +
'      display: inline-block;\n' +
'      padding: 1rem 2rem;\n' +
'      background: linear-gradient(45deg, #e94560, #ff6b6b);\n' +
'      color: white;\n' +
'      text-decoration: none;\n' +
'      border-radius: 50px;\n' +
'      font-weight: bold;\n' +
'      transition: transform 0.3s, box-shadow 0.3s;\n' +
'    }\n' +
'    a:hover {\n' +
'      transform: translateY(-3px);\n' +
'      box-shadow: 0 10px 20px rgba(233, 69, 96, 0.3);\n' +
'    }\n' +
'  </style>\n' +
'</head>\n' +
'<body>\n' +
'  <div class="container">\n' +
'    <h1>404</h1>\n' +
'    <h2>عذراً، الصفحة التي تبحث عنها غير موجودة</h2>\n' +
'    <a href="/">العودة للصفحة الرئيسية</a>\n' +
'  </div>\n' +
'</body>\n' +
'</html>';
}

/**
 * Pre-render: inject homepage API data into HTML so the SPA can hydrate immediately
 * without waiting for a separate API round-trip. Cached at edge for HOMEPAGE_CACHE_TTL.
 */
async function prerenderHomepage(request, origin) {
  var cache = caches.default;
  var cacheKey = new Request('https://cache-key/prerender-homepage-v2');

  var cached = await cache.match(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    var htmlResponse = await fetch(request, { cf: { cacheEverything: true } });

    if (!htmlResponse.ok) {
      return htmlResponse;
    }

    var html = await htmlResponse.text();

    var apiResponse = await fetch(origin + HOMEPAGE_API_PATH, {
      method: 'GET',
      headers: { 'User-Agent': 'Cloudflare-Worker/1.0', 'Accept': 'application/json' }
    });
    var apiData = apiResponse.ok ? await apiResponse.text() : 'null';

    var injection = '<script>window.__HOMEPAGE_DATA__=' + apiData + ';</script>';
    html = html.replace('</head>', injection + '</head>');

    var originLink = htmlResponse.headers.get('link') || '';

    var responseHeaders = {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=' + HOMEPAGE_CACHE_TTL + ', stale-while-revalidate=120',
      'X-Prerendered': 'true'
    };
    if (originLink) responseHeaders['Link'] = originLink;

    var response = new Response(html, { status: 200, headers: responseHeaders });

    var cacheHeaders = {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=' + HOMEPAGE_CACHE_TTL
    };
    if (originLink) cacheHeaders['Link'] = originLink;

    var cacheResponse = new Response(html, { status: 200, headers: cacheHeaders });
    await cache.put(cacheKey, cacheResponse);

    return response;
  } catch (error) {
    console.error('[Prerender] Error:', error);
    return fetch(request, { cf: { cacheEverything: true } });
  }
}

function prefersMarkdown(request) {
  var accept = request.headers.get('Accept') || '';
  if (accept.indexOf('text/markdown') === -1) return false;
  var mdMatch = accept.match(/text\/markdown(?:;[^,]*)?(?:\s*;\s*q=([0-9.]+))?/i);
  var htmlMatch = accept.match(/text\/html(?:;[^,]*)?(?:\s*;\s*q=([0-9.]+))?/i);
  var mdQ = mdMatch && mdMatch[1] ? parseFloat(mdMatch[1]) : (mdMatch ? 1 : 0);
  var htmlQ = htmlMatch && htmlMatch[1] ? parseFloat(htmlMatch[1]) : (htmlMatch ? 1 : 0);
  return mdQ >= htmlQ;
}

function hasAuthCookie(request) {
  var cookieHeader = request.headers.get('Cookie') || '';
  return cookieHeader.indexOf('connect.sid') !== -1 || cookieHeader.indexOf('session') !== -1;
}

/**
 * Strip Google Cloud Run's GAESA session-affinity cookie from origin responses.
 * GAESA prevents Cloudflare from caching because Set-Cookie = uncacheable.
 * Also remove no-store directives for unauthenticated HTML so Cloudflare can cache.
 */
function stripGaesaAndFixHeaders(response, isAuthenticated) {
  var setCookie = response.headers.get('set-cookie') || '';
  var needsStrip = setCookie.indexOf('GAESA') !== -1;
  var cacheControl = response.headers.get('cache-control') || '';
  var isHtml = (response.headers.get('content-type') || '').indexOf('text/html') !== -1;
  var hasSMaxAge = cacheControl.indexOf('s-maxage') !== -1;
  var hasBadDirective = cacheControl.indexOf('no-store') !== -1 || cacheControl.indexOf('no-cache') !== -1 || cacheControl.indexOf('private') !== -1;
  var needsFixCache = !isAuthenticated && isHtml && hasSMaxAge && hasBadDirective;

  if (!needsStrip && !needsFixCache) {
    return response;
  }

  var newHeaders = new Headers(response.headers);

  if (needsStrip && !isAuthenticated) {
    newHeaders.delete('set-cookie');
  }

  if (needsFixCache) {
    newHeaders.set('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=120');
    newHeaders.delete('CDN-Cache-Control');
    newHeaders.delete('Cloudflare-CDN-Cache-Control');
    newHeaders.delete('Surrogate-Control');
    newHeaders.delete('Pragma');
    newHeaders.delete('Expires');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}

async function handleRequest(request) {
  var url = new URL(request.url);
  var pathname = url.pathname;
  var isAuthenticated = hasAuthCookie(request);

  if (PRERENDER_ENABLED && pathname === '/' && !isAuthenticated && request.method === 'GET' && !prefersMarkdown(request)) {
    return prerenderHomepage(request, url.origin);
  }
  
  var classification = classifyRequest(pathname);
  
  var cfCacheOptions = isAuthenticated ? {} : { cf: { cacheEverything: true } };

  if (!classification.shouldCheck) {
    var response = await fetch(request, cfCacheOptions);
    return stripGaesaAndFixHeaders(response, isAuthenticated);
  }

  var existence = await checkExistence(url.origin, pathname);
  
  if (!existence.exists) {
    console.log('[404] Returning 404 for non-existent ' + classification.type + ': ' + pathname);
    
    var notFoundHtml = await fetchCustom404Page(url.origin);

    return new Response(notFoundHtml, {
      status: 404,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=60',
        'X-Robots-Tag': 'noindex'
      }
    });
  }

  var originResponse = await fetch(request, cfCacheOptions);
  return stripGaesaAndFixHeaders(originResponse, isAuthenticated);
}

addEventListener('fetch', function(event) {
  event.respondWith(handleWithCache(event));
});

async function handleWithCache(event) {
  var request = event.request;
  var url = new URL(request.url);
  var isAuthenticated = hasAuthCookie(request);
  var classification = classifyRequest(url.pathname);
  var isHtmlRoute = classification.type !== 'api' && classification.type !== 'static';
  var shouldCache = !isAuthenticated && request.method === 'GET' && isHtmlRoute && !prefersMarkdown(request);

  if (shouldCache) {
    var cache = caches.default;
    var cached = await cache.match(request);
    if (cached) {
      var hitHeaders = new Headers(cached.headers);
      hitHeaders.set('X-Worker-Cache', 'HIT');
      return new Response(cached.body, { status: cached.status, headers: hitHeaders });
    }
  }

  var response = await handleRequest(request);

  if (shouldCache && response.status === 200) {
    var cache = caches.default;
    event.waitUntil(cache.put(request, response.clone()));
  }

  var finalHeaders = new Headers(response.headers);
  finalHeaders.set('X-Worker-Cache', shouldCache ? 'MISS' : 'SKIP');
  return new Response(response.body, { status: response.status, headers: finalHeaders });
}
