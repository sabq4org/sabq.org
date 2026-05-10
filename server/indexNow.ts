/**
 * IndexNow + Google Sitemap Ping Service
 *
 * Notifies search engines immediately when a new article is published.
 * IndexNow is supported by Bing, Yandex, Naver, and (via Bing) Google.
 * Google direct ping is done via /ping?sitemap= endpoint.
 *
 * Key file is served publicly at /{key}.txt — this is how search engines
 * verify domain ownership (not a secret, just a unique token).
 */

export const BASE_URL = 'https://sabq.org';

// The IndexNow key — read from env or fall back to built-in default.
// To rotate the key: set INDEXNOW_KEY env var and re-deploy.
export const INDEXNOW_KEY: string =
  process.env.INDEXNOW_KEY || 'sabq2026f4a8b2d3e1c7a9f5b0d6e2c4';

const SITEMAP_NEWS_URL = `${BASE_URL}/sitemap-news.xml`;

/**
 * Ping IndexNow API to request immediate indexing of an article.
 * Fire-and-forget — errors are logged but never re-thrown.
 */
export async function pingIndexNow(slug: string): Promise<void> {
  const articleUrl = `${BASE_URL}/article/${encodeURIComponent(slug)}`;
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
 * Ping Google to re-fetch the News Sitemap after a new article is published.
 * Fire-and-forget — errors are logged but never re-thrown.
 */
export async function pingGoogleSitemap(): Promise<void> {
  const pingUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(SITEMAP_NEWS_URL)}`;
  try {
    const res = await fetch(pingUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
    });
    console.log(`[Google Ping] ✅ News sitemap pinged (HTTP ${res.status})`);
  } catch (err) {
    console.error('[Google Ping] ❌ Failed to ping Google sitemap:', err);
  }
}

/**
 * Full immediate-indexing pipeline:
 *   1. IndexNow (Bing/Yandex/Naver)
 *   2. Google sitemap ping
 *
 * Call this fire-and-forget after any article is published.
 * Example:
 *   notifySearchEngines(article.slug).catch(() => {});
 */
export async function notifySearchEngines(slug: string): Promise<void> {
  await pingIndexNow(slug);
  await pingGoogleSitemap();
}
