import { useEffect, useState } from "react";
import { CURRENT_BUILD_ID, fetchRemoteBuildId } from "@/lib/buildVersion";

/**
 * Polls /build-info.json for a different buildId than the one embedded at
 * compile time. Returns `true` once a new build is detected. Polling stops
 * the moment we know an update is available — the UI takes over from there.
 *
 * Also checks on tab focus / visibility change, so users who alt-tab back
 * after hours of inactivity get notified immediately instead of waiting
 * for the next interval tick.
 */
const POLL_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
const INITIAL_DELAY_MS = 60 * 1000;     // 60 seconds — don't hammer on first load

export function useBuildVersionCheck(): boolean {
  const [hasUpdate, setHasUpdate] = useState(false);

  useEffect(() => {
    // Skip polling in dev — no /build-info.json file is emitted.
    if (CURRENT_BUILD_ID === "dev") return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    async function check() {
      if (stopped) return;
      const remoteId = await fetchRemoteBuildId();
      if (stopped) return;
      if (remoteId && remoteId !== CURRENT_BUILD_ID) {
        setHasUpdate(true);
        return; // stop the loop — banner has taken over
      }
      timer = setTimeout(check, POLL_INTERVAL_MS);
    }

    timer = setTimeout(check, INITIAL_DELAY_MS);

    function onVisible() {
      if (document.visibilityState === "visible" && !stopped) {
        // User came back to the tab — check immediately.
        check();
      }
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return hasUpdate;
}
