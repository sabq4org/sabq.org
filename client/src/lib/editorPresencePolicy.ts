export const EDITOR_HEARTBEAT_INTERVAL_MS = 20_000;
export const EDITOR_IDLE_TIMEOUT_MS = 3 * 60 * 1000;
export const EDITOR_HIDDEN_TIMEOUT_MS = 60 * 1000;

export interface EditorPresenceActivityState {
  lastActivityAt: number;
  hiddenSince: number | null;
}

/**
 * Determines whether the editor tab is still actively writing/viewing and
 * should continue sending live presence heartbeats.
 */
export function shouldMaintainEditorPresence(
  state: EditorPresenceActivityState,
  now: number,
): boolean {
  if (state.hiddenSince !== null && now - state.hiddenSince >= EDITOR_HIDDEN_TIMEOUT_MS) {
    return false;
  }
  if (now - state.lastActivityAt >= EDITOR_IDLE_TIMEOUT_MS) {
    return false;
  }
  return true;
}

/**
 * Returns the milliseconds until presence should next be re-evaluated for
 * inactivity or background-tab expiry.
 */
export function getNextPresenceCheckDelayMs(
  state: EditorPresenceActivityState,
  now: number,
): number {
  const idleRemaining = EDITOR_IDLE_TIMEOUT_MS - (now - state.lastActivityAt);
  if (state.hiddenSince === null) {
    return Math.max(0, idleRemaining);
  }
  const hiddenRemaining = EDITOR_HIDDEN_TIMEOUT_MS - (now - state.hiddenSince);
  return Math.max(0, Math.min(idleRemaining, hiddenRemaining));
}
