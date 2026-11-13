export const LEGACY_UNCHANGED_MAX_MS = 30 * 60 * 1000;
export const LEGACY_GAP_RESET_MS = 10 * 60 * 1000;
const MAX_TRACKED_SESSIONS = 1000;

export interface LegacyHeartbeatRecord {
  signature: string;
  firstSeenAt: number;
  lastSeenAt: number;
  suppressed: boolean;
}

export interface LegacyGuardDecision {
  suppress: boolean;
  newlySuppressed: boolean;
}

/**
 * Tracks pre-fix clients (those without `idleAware: true`) so an abandoned
 * browser tab continuously sending the exact same payload is eventually
 * dropped instead of staying stuck in "writing now" for days or weeks.
 */
export function evaluateLegacyHeartbeat(
  tracker: Map<string, LegacyHeartbeatRecord>,
  sessionKey: string,
  signature: string,
  now: number,
  idleAware: boolean,
): LegacyGuardDecision {
  if (idleAware) {
    tracker.delete(sessionKey);
    return { suppress: false, newlySuppressed: false };
  }

  const prev = tracker.get(sessionKey);
  if (!prev || prev.signature !== signature || now - prev.lastSeenAt > LEGACY_GAP_RESET_MS) {
    pruneLegacyTracker(tracker, now);
    tracker.set(sessionKey, {
      signature,
      firstSeenAt: now,
      lastSeenAt: now,
      suppressed: false,
    });
    return { suppress: false, newlySuppressed: false };
  }

  prev.lastSeenAt = now;
  if (now - prev.firstSeenAt >= LEGACY_UNCHANGED_MAX_MS) {
    const newlySuppressed = !prev.suppressed;
    prev.suppressed = true;
    return { suppress: true, newlySuppressed };
  }

  return { suppress: false, newlySuppressed: false };
}

/** Removes expired records and caps map growth under sustained traffic. */
export function pruneLegacyTracker(
  tracker: Map<string, LegacyHeartbeatRecord>,
  now: number,
): void {
  for (const [key, record] of tracker) {
    if (now - record.lastSeenAt > LEGACY_GAP_RESET_MS) {
      tracker.delete(key);
    }
  }
  while (tracker.size >= MAX_TRACKED_SESSIONS) {
    const oldestKey = tracker.keys().next().value;
    if (!oldestKey) break;
    tracker.delete(oldestKey);
  }
}
