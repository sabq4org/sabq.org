/**
 * Cache-bust helpers for Open Graph / Twitter card images.
 *
 * Social platforms often cache the first preview they see for a URL. When an
 * article later gains (or replaces) a hero image, changing only the CDN HTML
 * is not enough — the platform must re-scrape. Versioning the og:image URL
 * makes the new scrape unambiguously different from a stale image fetch.
 */

const BRAND_OG_HINTS = ["/branding/", "/icon.png", "sabq-og-image"];

/** True for brand fallbacks that should never get a `?v=` suffix. */
export function isBrandOgFallback(url: string): boolean {
  if (!url) return true;
  return BRAND_OG_HINTS.some((hint) => url.includes(hint));
}

/**
 * Append `?v=<unixSeconds>` (or `&v=`) derived from `version` so crawlers
 * treat the image URL as fresh after an edit. No-ops for empty/brand URLs.
 */
export function withOgImageCacheBust(
  imageUrl: string,
  version?: Date | string | number | null,
): string {
  if (!imageUrl || isBrandOgFallback(imageUrl)) return imageUrl;

  let ts: number | null = null;
  if (version instanceof Date) {
    ts = version.getTime();
  } else if (typeof version === "number" && Number.isFinite(version)) {
    ts = version;
  } else if (typeof version === "string" && version.trim()) {
    const parsed = Date.parse(version);
    ts = Number.isFinite(parsed) ? parsed : null;
  }
  if (ts == null || !Number.isFinite(ts) || ts <= 0) return imageUrl;

  const v = String(Math.floor(ts / 1000));
  if (/[?&]v=\d+/.test(imageUrl)) {
    return imageUrl.replace(/([?&])v=\d+/, `$1v=${v}`);
  }
  return `${imageUrl}${imageUrl.includes("?") ? "&" : "?"}v=${v}`;
}
