const CB_COUNT_KEY = "sabq_cb_count";
const CB_LAST_KEY = "sabq_cb_last";
const HR_DONE_KEY = "sabq_hr_done";
const CB_PARAM = "_cb";
const CB_MAX_PER_WINDOW = 5;
const CB_COOLDOWN_MS = 30_000;
const CB_WINDOW_MS = 5 * 60_000;
const HR_COOLDOWN_MS = 10 * 60_000;
const RECOVERY_PENDING_KEY = "sabq_recovery_pending";
const RECOVERY_PENDING_TTL_MS = 20_000;

function markRecoveryPending(): void {
  try {
    sessionStorage.setItem(RECOVERY_PENDING_KEY, String(Date.now()));
  } catch {}
}

export function getRecoveryPendingMs(): number {
  try {
    const started = parseInt(sessionStorage.getItem(RECOVERY_PENDING_KEY) || "0", 10);
    if (!started) return 0;
    const remaining = RECOVERY_PENDING_TTL_MS - (Date.now() - started);
    if (remaining <= 0) {
      sessionStorage.removeItem(RECOVERY_PENDING_KEY);
      return 0;
    }
    return remaining;
  } catch {
    return 0;
  }
}

export function isRecoveryPending(): boolean {
  return getRecoveryPendingMs() > 0;
}

export function canCacheBust(): boolean {
  try {
    const last = parseInt(sessionStorage.getItem(CB_LAST_KEY) || "0", 10);
    const now = Date.now();
    if (last && now - last < CB_COOLDOWN_MS) {
      return false;
    }
    if (last && now - last >= CB_WINDOW_MS) {
      sessionStorage.setItem(CB_COUNT_KEY, "0");
      return true;
    }
    const count = parseInt(sessionStorage.getItem(CB_COUNT_KEY) || "0", 10);
    return count < CB_MAX_PER_WINDOW;
  } catch {
    return true;
  }
}

export function markCacheBust(): void {
  try {
    const last = parseInt(sessionStorage.getItem(CB_LAST_KEY) || "0", 10);
    const now = Date.now();
    let count = parseInt(sessionStorage.getItem(CB_COUNT_KEY) || "0", 10);
    if (last && now - last >= CB_WINDOW_MS) {
      count = 0;
    }
    sessionStorage.setItem(CB_COUNT_KEY, String(count + 1));
    sessionStorage.setItem(CB_LAST_KEY, String(now));
  } catch {}
}

export function getCacheBustCount(): number {
  try {
    return parseInt(sessionStorage.getItem(CB_COUNT_KEY) || "0", 10);
  } catch {
    return 0;
  }
}

export function cacheBustReload(): void {
  markRecoveryPending();
  try {
    const url = new URL(window.location.href);
    url.searchParams.set(CB_PARAM, String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}

export function canHardReset(): boolean {
  try {
    const last = parseInt(sessionStorage.getItem(HR_DONE_KEY) || "0", 10);
    return !last || Date.now() - last >= HR_COOLDOWN_MS;
  } catch {
    return true;
  }
}

// Clear all chunk-recovery state. Called from main.tsx after the React app
// has been alive for a stable boot window — a successful render proves the
// current HTML/chunk pair works, so any reload counters accumulated from
// earlier failed cycles are no longer relevant and would otherwise cause
// "تعذر تحميل الصفحة" to fire on the next minor hiccup. Mirrors the keys
// owned by both the inline safety net (index.html) and the in-bundle layers.
export function resetCacheBustState(): void {
  var keys = [
    CB_COUNT_KEY,
    CB_LAST_KEY,
    HR_DONE_KEY,
    RECOVERY_PENDING_KEY,
    "sabq_chunk_reload",
    "sabq_chunk_error_reload",
    "__sabq_safety_reload_ts",
    "__sabq_safety_reload_count",
    "__sabq_safety_reload_window",
  ];
  keys.forEach((k) => {
    try { sessionStorage.removeItem(k); } catch {}
  });
}

export function hardReset(): void {
  markRecoveryPending();
  try {
    sessionStorage.setItem(HR_DONE_KEY, String(Date.now()));
  } catch {}
  try {
    const cacheKeys = ["sabq_chunk_reload", "sabq_chunk_error_reload", CB_COUNT_KEY, CB_LAST_KEY];
    cacheKeys.forEach((k) => {
      try { sessionStorage.removeItem(k); } catch {}
      try { localStorage.removeItem(k); } catch {}
    });
    if ("caches" in window) {
      caches.keys().then((keys) => {
        keys.forEach((k) => caches.delete(k).catch(() => {}));
      }).catch(() => {});
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister().catch(() => {}));
      }).catch(() => {});
    }
  } catch {}
  cacheBustReload();
}
