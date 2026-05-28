// Persist the last successful homepage payload in the browser so a normal
// page refresh can paint real content instantly instead of a full-screen
// skeleton.
//
// Why this is needed: sabq.org HTML is served `Cache-Control: no-store`
// (intentional — avoids the "white page after deploy" when Vite chunk hashes
// change), and on the Vercel/Cloudflare path the server does NOT inline
// `__HOMEPAGE_DATA__`. So on every reload, React boots empty and blocks on
// the /api/homepage-lite round-trip → the gray-skeleton flash the user sees.
//
// We snapshot the payload to localStorage and feed it back as react-query
// placeholderData: the page renders the last-known feed immediately, then
// revalidates in the background and swaps in fresh data when it arrives.

const KEY = "sabq:homepage-lite:v1";
// Don't show a snapshot older than this — beyond it, prefer the skeleton so a
// returning visitor isn't shown badly outdated headlines before revalidation.
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

export function readHomepageCache<T = unknown>(): T | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { savedAt?: number; data?: T };
    if (!parsed || typeof parsed.savedAt !== "number") return undefined;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) return undefined;
    return parsed.data;
  } catch {
    return undefined;
  }
}

export function writeHomepageCache(data: unknown): void {
  if (data == null) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // Quota exceeded / private-mode Safari — caching is best-effort.
  }
}
