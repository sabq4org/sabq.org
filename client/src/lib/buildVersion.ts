// Proactive deploy detection — closes the last gap in post-deploy recovery.
//
// Background: the SPA shell (`index.html`) references content-addressed chunks
// (`/assets/index-<hash>.js`). After a deploy, the previous build's chunks are
// gone. We already have reactive recovery (deployRecovery.ts listens for
// `vite:preloadError` / lazy-import failures and reloads once with a cache
// buster), and a clean 404 for missing `/assets/*` (functions/_middleware.js).
//
// This module adds the PROACTIVE layer: poll `/build-info.json` (emitted by the
// `sabq-build-info` Vite plugin, served `no-store`) on a slow cadence. When a
// new build is detected while the tab is open, reload to the fresh deploy
// BEFORE the user navigates to a route whose chunk no longer exists — turning a
// broken page into a transparent refresh.
//
// Design notes:
//   - `__SABQ_BUILD_ID__` is a compile-time constant baked into THIS bundle, so
//     it captures the build the running tab was booted from.
//   - Poll is lightweight (tiny JSON), skips on hidden tabs, and is silent on
//     network errors (we'll just try again next tick).
//   - Reload reuses deployRecovery's cache-buster, but BYPASSES the cooldown
//     via forceDeployRecoveryReload when a build-id mismatch is confirmed — a
//     confirmed deploy is never a false positive, so the cooldown (which exists
//     to prevent reload loops on transient chunk errors) must not block it.
//     Long-lived tabs across a deploy depend on this to self-heal.

import { forceDeployRecoveryReload } from "./deployRecovery";

declare const __SABQ_BUILD_ID__: string;

const POLL_INTERVAL_MS = 60_000; // 1 minute — light on the user and the origin.
const BOOT_BUILD_ID = String(__SABQ_BUILD_ID__ || "");
const PROBE_URL = "/build-info.json";

let timer: ReturnType<typeof setInterval> | null = null;
let stopped = false;

async function checkForNewBuild(): Promise<void> {
  if (stopped || typeof document === "undefined") return;
  // Skip while the tab is hidden: no point refreshing a page nobody is looking
  // at. The next visible tick will catch the new build.
  if (document.visibilityState === "hidden") return;

  try {
    const res = await fetch(PROBE_URL, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return;
    const data = (await res.json()) as { buildId?: string };
    const latest = String(data?.buildId || "");
    // Only reload on a DIFFERENT, non-empty build id. An equal id means we're
    // still on the current deploy; an empty one means the probe was malformed.
    if (latest && latest !== BOOT_BUILD_ID) {
      // This is a CONFIRMED deploy (build id mismatch), not a guessed chunk
      // failure — so we bypass attemptChunkRecoveryReload's 30s cooldown by
      // calling forceDeployRecoveryReload directly. Without this, a long-lived
      // tab that survives across a deploy gets stuck: polling detects the new
      // build but the cooldown (already tripped by an earlier reactive
      // vite:preloadError) blocks the reload, and the user is left on a broken
      // page. A confirmed build-id change is never a false positive, so there's
      // no loop risk here (polling runs at most once per minute, visible only).
      forceDeployRecoveryReload();
    }
  } catch {
    // Network/parse failure — stay quiet and retry on the next interval.
  }
}

/**
 * Start polling `/build-info.json` for a new deploy. When one is detected, the
 * tab reloads to the current build via deployRecovery (cache-busted, cooled
 * down). Safe to call once at boot; idempotent. Production only.
 */
export function startBuildVersionPolling(): void {
  if (timer || typeof window === "undefined") return;
  // Don't bother if there's no build id baked in (e.g. a misconfigured build).
  if (!BOOT_BUILD_ID) return;

  // First check after a short delay (avoid a boot-time thundering herd), then
  // on the steady cadence. Visibilitychange triggers an immediate re-check so
  // a tab returning from the background picks up a deploy without waiting.
  timer = setInterval(checkForNewBuild, POLL_INTERVAL_MS);
  window.setTimeout(checkForNewBuild, 15_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkForNewBuild();
  });
}

/** Stop polling (e.g. for tests). */
export function stopBuildVersionPolling(): void {
  stopped = true;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
