/**
 * Build-version detection. Vite injects `__SABQ_BUILD_ID__` at compile time
 * (vite.config.ts → define) and writes the same value into
 * /build-info.json at the site root. The running client periodically polls
 * the JSON file: when its `buildId` no longer matches the embedded one,
 * we know a deploy happened while the user still has the tab open — perfect
 * moment to prompt a refresh BEFORE they hit a ChunkLoadError white page.
 */

declare const __SABQ_BUILD_ID__: string;

const FALLBACK_BUILD_ID = "dev";

export const CURRENT_BUILD_ID: string =
  typeof __SABQ_BUILD_ID__ !== "undefined" ? __SABQ_BUILD_ID__ : FALLBACK_BUILD_ID;

export async function fetchRemoteBuildId(): Promise<string | null> {
  try {
    // ?_t= forces a unique URL so neither browser nor edge cache can serve
    // a stale build-info.json. `cache: 'no-store'` is belt-and-suspenders.
    const url = `/build-info.json?_t=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { buildId?: string };
    return typeof data?.buildId === "string" ? data.buildId : null;
  } catch {
    return null;
  }
}
