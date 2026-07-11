// Single source of truth for SPA paths that must never be indexed by search
// engines and must never be cached on shared/CDN edges.
//
// Used by:
//   - server/seoInjector.ts          → emits robots=noindex + Cache-Control: private, no-store
//   - server/index.ts (dev assert)   → fails loudly if any noindex route ever ships a public Cache-Control
//
// Keep this list in sync with the routes that render private/authenticated UI
// (dashboards, admin, profile, search, auth flows, payment, onboarding, etc.).

export const NOINDEX_EXACT: ReadonlySet<string> = new Set<string>([
  '/search', '/en/search', '/ur/search',
  '/login', '/register', '/logout',
  '/verify-email', '/forgot-password', '/reset-password', '/set-password', '/2fa-verify',
  '/select-interests',
  '/profile', '/bookmarks', '/reading-history',
  '/my-follows', '/my-keywords', '/my-votes',
  '/notification-settings', '/recommendation-settings',
  '/en/profile', '/en/notification-settings',
  '/ur/profile',
]);

export const NOINDEX_PREFIXES: readonly string[] = [
  '/dashboard',
  '/admin',
  '/ifox',
  '/onboarding',
  '/payment',
  '/en/dashboard',
  '/ur/dashboard',
  // مجالس التوقعات تحمل دعوات وواجهات عضوية شخصية؛ تبقى قابلة للمشاركة لكن
  // لا تُفهرس ولا تُخزّن كغلاف HTML مشترك على الحافة.
  '/gulf-cup/majlis',
  // مسارات البوابة الرياضية التجريبية القديمة — تُحوَّل الآن إلى /sports المعتمد،
  // وتبقى noindex حتى لا تُفهرس النسخ المكرّرة. (البوابة المعتمدة /sports مفهرسة.)
  '/sports2',
  '/sports3',
  '/sports4',
  '/sports5',
];

export function isNoindexPath(pathname: string): boolean {
  // Normalize trailing slash (except root) so `/search/` matches `/search`.
  // Without this, the public Cache-Control default would leak on the
  // trailing-slash variant of every exact-match noindex route.
  const normalized =
    pathname.length > 1 && pathname.endsWith('/')
      ? pathname.slice(0, -1)
      : pathname;
  if (NOINDEX_EXACT.has(normalized)) return true;
  for (const prefix of NOINDEX_PREFIXES) {
    if (normalized === prefix || normalized.startsWith(prefix + '/')) return true;
  }
  return false;
}
