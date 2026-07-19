/**
 * SSRF guard for server-side image fetches.
 *
 * Any route that fetch()es a URL supplied (directly or indirectly) by a user
 * must run it through assertSafeImageUrl() first. Without this, an authenticated
 * user can point the server at internal services or the cloud metadata endpoint
 * (http://169.254.169.254/) and exfiltrate credentials (security audit S-02).
 *
 * Strategy: strict host allowlist (the media CDNs we actually serve from) plus
 * an IP-literal/private-range rejection as defense-in-depth in case the
 * allowlist is ever widened. https-only.
 */

// Static hosts we knowingly serve media from.
const STATIC_ALLOWED_HOSTS = [
  "imagedelivery.net",        // Cloudflare Images CDN
  "storage.googleapis.com",   // GCS public objects (legacy)
];

// Suffixes whose subdomains are all trusted (the production site + its R2/CDN).
const STATIC_ALLOWED_SUFFIXES = [
  ".sabq.org",
  ".r2.dev",                  // Cloudflare R2 public dev hosts
];

function hostFromEnvUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Build the runtime allowlist from static hosts + any media hosts configured
 * via env (R2/S3 public URLs, Cloudflare account hash host, prod domain).
 */
function allowedHosts(): Set<string> {
  const hosts = new Set<string>(STATIC_ALLOWED_HOSTS);
  for (const envVar of [
    process.env.NEWS_IMAGES_R2_PUBLIC_URL,
    process.env.R2_PUBLIC_URL,
    process.env.S3_PUBLIC_URL,
    process.env.S3_ENDPOINT,
    process.env.DOMAIN,
  ]) {
    const h = hostFromEnvUrl(envVar);
    if (h) hosts.add(h);
  }
  return hosts;
}

/**
 * Reject IP literals that resolve to private / loopback / link-local / reserved
 * ranges. Hostnames are not resolved here (the allowlist already blocks
 * arbitrary hostnames); this only catches direct-IP allowlist bypasses.
 */
function isBlockedIpLiteral(hostname: string): boolean {
  // IPv6 loopback / unspecified / link-local / unique-local
  if (hostname === "::1" || hostname === "::" ) return true;
  if (/^\[?fe80:/i.test(hostname) || /^\[?f[cd][0-9a-f]{2}:/i.test(hostname)) return true;

  // IPv4 dotted-quad
  const m = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10) return true;                       // 10.0.0.0/8
  if (a === 127) return true;                      // 127.0.0.0/8 loopback
  if (a === 0) return true;                        // 0.0.0.0/8
  if (a === 169 && b === 254) return true;         // 169.254.0.0/16 link-local (cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true;         // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  return false;
}

/**
 * Throws if the URL is not a safe, allowlisted https image source.
 * Returns the parsed URL string (normalized) on success.
 */
export function assertSafeImageUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("رابط الصورة غير صالح");
  }

  if (url.protocol !== "https:") {
    throw new Error("رابط الصورة يجب أن يكون https");
  }

  const hostname = url.hostname.toLowerCase();

  if (isBlockedIpLiteral(hostname)) {
    throw new Error("نطاق الصورة غير مسموح");
  }

  const allowed = allowedHosts();
  const isAllowed =
    allowed.has(hostname) ||
    STATIC_ALLOWED_SUFFIXES.some(suffix => hostname.endsWith(suffix));

  if (!isAllowed) {
    throw new Error(`نطاق الصورة غير مسموح: ${hostname}`);
  }

  return url.toString();
}

export function isSafeImageUrl(rawUrl: string): boolean {
  try {
    assertSafeImageUrl(rawUrl);
    return true;
  } catch {
    return false;
  }
}
