/**
 * Allowlist of storage origins the media proxy / save-existing may reference.
 * A stored media url can come from save-existing (user-supplied), so redirecting
 * to it unconditionally would be an open redirect. Only allow our own storage
 * hosts: Cloudflare Images, GCS, the configured S3/R2 endpoint, R2 defaults,
 * and the request's own host.
 */
export function isAllowedMediaUrl(rawUrl: string, reqHost?: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    if (u.username || u.password) return false; // no user:pass@ phishing forms
    const host = u.hostname.toLowerCase();
    const allowed = new Set<string>(['imagedelivery.net', 'storage.googleapis.com']);
    for (const envVal of [process.env.S3_PUBLIC_URL, process.env.S3_ENDPOINT]) {
      if (envVal) {
        try { allowed.add(new URL(envVal).hostname.toLowerCase()); } catch { /* ignore */ }
      }
    }
    if (reqHost) allowed.add(reqHost.toLowerCase().split(':')[0]);
    for (const a of allowed) {
      if (host === a || host.endsWith('.' + a)) return true;
    }
    // R2 default endpoints
    if (host.endsWith('.r2.cloudflarestorage.com') || host.endsWith('.r2.dev')) return true;
    return false;
  } catch {
    return false;
  }
}
