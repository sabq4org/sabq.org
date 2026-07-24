/**
 * Redirect-target validation for any endpoint that stores a caller-supplied URL
 * and later navigates a browser to it (short links, newsletter click tracking).
 *
 * Two separate problems this closes:
 *  - Open redirect: an attacker-chosen destination reached through a sabq.org
 *    URL borrows the newsroom's reputation for phishing, and search/social
 *    treat the hop as first-party.
 *  - `javascript:` XSS: `z.string().url()` accepts ANY scheme, because it just
 *    calls `new URL()`. `javascript:alert(1)//` is a perfectly valid URL, and
 *    rendering it into an `<a href>` on sabq.org runs script on our origin.
 *
 * Deliberately an allowlist: the set of destinations Sabq actually links to is
 * small and known, so anything else is a bug or an attack.
 */

const ALLOWED_SUFFIXES = ["sabq.org", "sabq.news"];

/** Dev/preview hosts — never allowed once NODE_ENV is production. */
const DEV_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0"]);

export function isSafeRedirectUrl(raw: string | null | undefined): boolean {
  if (!raw || typeof raw !== "string") return false;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }

  // Scheme first: this is what stops `javascript:`, `data:`, `vbscript:`.
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;

  const host = url.hostname.toLowerCase();

  if (process.env.NODE_ENV !== "production" && DEV_HOSTS.has(host)) return true;

  // Suffix match must be on a label boundary, or `evil-sabq.org` and
  // `sabq.org.attacker.com` would both pass.
  return ALLOWED_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

/** Returns the URL when it is a safe destination, otherwise null. */
export function safeRedirectUrlOrNull(raw: string | null | undefined): string | null {
  return isSafeRedirectUrl(raw) ? (raw as string) : null;
}
