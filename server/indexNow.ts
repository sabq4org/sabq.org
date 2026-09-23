/**
 * IndexNow Service
 *
 * Notifies search engines immediately when a new article is published.
 * IndexNow is supported by Bing, Yandex, Naver (and Bing relays some signal
 * to Google, but Google does NOT consume IndexNow directly for indexing).
 *
 * NOTE: There is intentionally NO Google "sitemap ping" here. Google
 * deprecated and removed the `https://www.google.com/ping?sitemap=` endpoint
 * in June 2023 — it now 404s and does nothing.
 *
 * Key file is served publicly at /{key}.txt — this is how search engines
 * verify domain ownership (not a secret, just a unique token).
 */

export const BASE_URL = 'https://sabq.org';

// The IndexNow key — env-only (no built-in default; hardcoded fallbacks were
// removed in the 2026-06-10 audit). When unset, pings are skipped with a
// warning and the /{key}.txt verification route is not registered.
export const INDEXNOW_KEY: string = process.env.INDEXNOW_KEY || '';

if (!INDEXNOW_KEY) {
  console.warn(
    '[IndexNow] INDEXNOW_KEY is not set — IndexNow pings are disabled. ' +
    'Set it to re-enable immediate search-engine notification.',
  );
}

/**
 * Ping IndexNow API to request immediate indexing of an article.
 * Fire-and-forget — errors are logged but never re-thrown.
 *
 * IMPORTANT: pass the CANONICAL slug (englishSlug), not the Arabic slug.
 * The Arabic slug 301-redirects to /article/<englishSlug> (see
 * server/middleware/slugRedirect.ts), and submitting a redirecting URL to
 * IndexNow wastes the signal — Bing/Yandex have to follow the hop and may
 * skip it. Always submit the final canonical URL.
 */
export async function pingIndexNow(
  canonicalSlug: string,
  locale: 'ar' | 'en' | 'ur' = 'ar',
): Promise<void> {
  if (!INDEXNOW_KEY) return;
  const prefix =
    locale === 'en' ? '/en/article' : locale === 'ur' ? '/ur/article' : '/article';
  const articleUrl = `${BASE_URL}${prefix}/${encodeURIComponent(canonicalSlug)}`;
  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: 'sabq.org',
        key: INDEXNOW_KEY,
        keyLocation: `${BASE_URL}/${INDEXNOW_KEY}.txt`,
        urlList: [articleUrl],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    // 200 = OK, 202 = Accepted (both mean success)
    if (res.ok || res.status === 202) {
      console.log(`[IndexNow] ✅ Pinged successfully: ${articleUrl} (HTTP ${res.status})`);
    } else {
      const body = await res.text().catch(() => '');
      console.warn(`[IndexNow] ⚠️ Unexpected response ${res.status} for ${articleUrl}: ${body.slice(0, 200)}`);
    }
  } catch (err) {
    console.error(`[IndexNow] ❌ Failed to ping ${articleUrl}:`, err);
  }
}

/**
 * Notification after an article is published. IndexNow is supported by
 * Bing/Yandex/Naver. Google does not accept generic news URLs through its
 * Indexing API, so this path intentionally does not invoke that API.
 *
 * Call this fire-and-forget after any article is published. Pass the
 * CANONICAL slug (englishSlug) so the submitted URL does not 301-redirect.
 * Example:
 *   notifySearchEngines(article.englishSlug || article.slug).catch(() => {});
 */
export async function notifySearchEngines(
  canonicalSlug: string,
  locale: 'ar' | 'en' | 'ur' = 'ar',
): Promise<void> {
  await pingIndexNow(canonicalSlug, locale);
}
