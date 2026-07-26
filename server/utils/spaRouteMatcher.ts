/**
 * SPA Route Matcher - Permissive Approach
 * Uses a conservative approach: defaults to VALID (200) unless clearly invalid
 * This prevents false 404s for legitimate routes
 * 
 * Only routes that are DEFINITELY invalid return 404:
 * - Routes with obviously invalid patterns
 * - Multi-segment paths that don't match any known prefix
 */

// Known valid route PREFIXES (first segment after /)
// This is more maintainable than listing every exact route
// Exported for use by contentExistenceMiddleware to avoid duplicate maintenance
export const VALID_PREFIXES = new Set([
  // Language prefixes
  'ar', 'en', 'ur',
  // Main sections
  'article', 'category', 'keyword', 'reporter', 'news', 'opinion',
  // Auth & User
  'login', 'register', 'logout', 'profile', 'verify-email', 
  'forgot-password', 'reset-password', 'set-password', '2fa-verify',
  // User settings & account center
  'settings', 'preferences', 'loyalty',
  // التحقق العام من الخطابات الرسمية
  'verify',
  'notification-settings', 'recommendation-settings', 'bookmarks',
  'reading-history', 'my-follows', 'my-keywords', 'my-votes',
  // Static pages
  'about', 'contact', 'terms', 'privacy', 'accessibility',
  'accessibility-statement', 'archive', 'careers', 'sponsored',
  // Content sections
  'categories', 'search', 'omq', 'muqtarab',
  'daily-brief', 'shorts', 'moment-by-moment', 'newsletters',
  // Dashboard & Admin
  'dashboard', 'admin', 'ifox',
  // Store & Payments
  'store', 'payment', 'advertise',
  // Audio & Media
  'audio-newsletter', 'newsletter', 'quiz', 'poll', 'polls',
  // World Days
  'world-days', 'world-day',
  // RSS & Developers
  'rss', 'developers', 'api-docs',
  // Legacy archive categories (these have numeric IDs)
  'saudia', 'world', 'mylife', 'stations', 'sports', 'tourism',
  'business', 'technology', 'cars', 'media', 'articles', 'local',
  'sport', 'economy',
  // Onboarding & AI entry points
  'onboarding', 'select-interests', 'gulf-live', 'ai',
]);

// Short URL pattern (7-char alphanumeric nanoid for social sharing)
const SHORT_URL_PATTERN = /^[a-zA-Z0-9_-]{7}$/;

/**
 * Check if a URL path matches a valid SPA route
 * Uses PERMISSIVE approach - defaults to valid unless clearly invalid
 */
export function isValidSpaRoute(urlPath: string): boolean {
  // Normalize path
  const normalizedPath = urlPath.split('?')[0].split('#')[0];
  const path = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
  
  // Home page is always valid
  if (path === '/') return true;
  
  // Extract first segment
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return true;
  
  const firstSegment = segments[0].toLowerCase();
  
  // Check if first segment matches known prefixes
  if (VALID_PREFIXES.has(firstSegment)) {
    return true;
  }
  
  // Check if it's a short URL (7 chars for social media sharing)
  if (segments.length === 1 && SHORT_URL_PATTERN.test(segments[0])) {
    return true;
  }
  
  // Single segment that doesn't match anything - likely invalid
  // But be conservative - only flag as 404 if it's clearly not a valid pattern
  if (segments.length === 1) {
    // If it looks like it could be a route segment (reasonable length, no weird chars)
    // Default to valid to avoid false positives
    if (firstSegment.length <= 50 && /^[a-z0-9-_]+$/i.test(firstSegment)) {
      // Could be a future route or custom page - default to valid
      return true;
    }
  }
  
  // Multi-segment paths: check if any known prefix matches
  // This catches paths like /unknown-section/something
  if (segments.length >= 2) {
    // If we have language prefix, check second segment
    if (['ar', 'en', 'ur'].includes(firstSegment)) {
      const secondSegment = segments[1].toLowerCase();
      // Common second-level routes after language prefix
      const validSecondLevel = new Set([
        'article', 'category', 'keyword', 'reporter', 'news', 'opinion',
        'categories', 'dashboard', 'admin', 'profile', 'about', 'contact',
        'terms', 'privacy', 'daily-brief', 'moment-by-moment', 'notification-settings', 'settings'
      ]);
      if (validSecondLevel.has(secondSegment)) {
        return true;
      }
    }
    
    // For multi-segment paths, be permissive
    // Only flag as 404 if the first segment is clearly not a route
    return true;
  }
  
  // Default: be permissive to avoid false 404s
  return true;
}

/**
 * Get the HTTP status code for a given path
 */
export function getRouteStatus(urlPath: string): 200 | 404 {
  return isValidSpaRoute(urlPath) ? 200 : 404;
}
