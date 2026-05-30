/**
 * IndexNow Service
 *
 * Notifies search engines immediately when a new article is published.
 * IndexNow is supported by Bing, Yandex, Naver (and Bing relays some signal
 * to Google, but Google does NOT consume IndexNow directly for indexing).
 *
 * NOTE: There is intentionally NO Google "sitemap ping" here. Google
 * deprecated and removed the `https://www.google.com/ping?sitemap=` endpoint
 * in June 2023 — it now 404s and does nothing. Relying on it gave false
 * confidence that Google was being notified. The real Google levers are:
 *   - submitting the sitemap in Search Console, and
 *   - URL Inspection → Request Indexing for new URLs,
 *   - Google News Publisher Center for fast Top-stories inclusion.
 * (The Google Indexing API only supports JobPosting/BroadcastEvent, NOT news
 * articles, so it is also not used here.)
 *
 * Key file is served publicly at /{key}.txt — this is how search engines
 * verify domain ownership (not a secret, just a unique token).
 */

export const BASE_URL = 'https://sabq.org';

// The IndexNow key — read from env or fall back to built-in default.
// To rotate the key: set INDEXNOW_KEY env var and re-deploy.
export const INDEXNOW_KEY: string =
  process.env.INDEXNOW_KEY || 'sabq2026f4a8b2d3e1c7a9f5b0d6e2c4';

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
export async function pingIndexNow(canonicalSlug: string): Promise<void> {
  const articleUrl = `${BASE_URL}/article/${encodeURIComponent(canonicalSlug)}`;
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
 * Immediate-indexing notification after an article is published.
 * Currently IndexNow only (Bing/Yandex/Naver). See the file header for why
 * the Google sitemap ping was removed and what to use for Google instead.
 *
 * Call this fire-and-forget after any article is published. Pass the
 * CANONICAL slug (englishSlug) so the submitted URL does not 301-redirect.
 * Example:
 *   notifySearchEngines(article.englishSlug || article.slug).catch(() => {});
 */
export async function notifySearchEngines(canonicalSlug: string): Promise<void> {
  await pingIndexNow(canonicalSlug);
}
