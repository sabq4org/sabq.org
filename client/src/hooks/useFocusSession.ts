import { useEffect, useRef, useState, useCallback } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useBehaviorTracking } from "@/hooks/useBehaviorTracking";

const GUEST_KEY = "sabq:focus_sessions:v1";
// Minimum focused seconds before a session counts as a "successful focus read".
// The Focus Mode spec defines successful reads via a minimum-time threshold;
// scroll progress is tracked separately as a bonus signal but does NOT gate
// the `completed` flag (that policy was too strict and undercounted real reads).
const MIN_SUCCESSFUL_READ_SECONDS = 30;
// Scroll-progress threshold used purely for the `scrolledEnough` indicator
// (kept for future analytics; not part of the completion gate).
const COMPLETION_THRESHOLD = 0.85;

export interface GuestSession {
  id: string;
  articleId: string;
  language: string;
  startedAt: number;
  endedAt?: number;
  focusedSeconds: number;
  completed: boolean;
  articleTitle?: string | null;
  articleSlug?: string | null;
  articleImageUrl?: string | null;
  categoryName?: string | null;
}

export interface FocusSessionRecord extends GuestSession {
  shareSlug?: string | null;
}

export interface UseFocusSessionOptions {
  articleId: string;
  language: "ar" | "en" | "ur";
  isLoggedIn: boolean;
  active: boolean;
  articleSnapshot?: {
    title?: string | null;
    slug?: string | null;
    imageUrl?: string | null;
    categoryName?: string | null;
  };
}

interface FocusSessionApiResponse {
  id?: string;
  shareSlug?: string | null;
}

function readGuestSessions(): GuestSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(GUEST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeGuestSessions(sessions: GuestSession[]) {
  if (typeof window === "undefined") return;
  try {
    // Keep only last 50 entries to bound storage
    window.localStorage.setItem(GUEST_KEY, JSON.stringify(sessions.slice(-50)));
  } catch {
    // ignore quota
  }
}

export function getGuestFocusSessions(): GuestSession[] {
  return readGuestSessions();
}

function invalidateWeeklyReport() {
  queryClient.invalidateQueries({ queryKey: ["/api/me/focus-sessions/weekly"] }).catch(() => {});
}

// Marker key so we don't repeatedly attempt to sync the SAME guest sessions
// after a successful sync. Using a numeric high-water-mark (the max startedAt
// previously synced) makes the sync idempotent across reloads.
const GUEST_SYNC_MARKER_KEY = "sabq:focus_sessions_synced_at:v1";

function readSyncMarker(): number {
  if (typeof window === "undefined") return 0;
  try {
    const v = window.localStorage.getItem(GUEST_SYNC_MARKER_KEY);
    return v ? Number(v) || 0 : 0;
  } catch {
    return 0;
  }
}

function writeSyncMarker(value: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GUEST_SYNC_MARKER_KEY, String(value));
  } catch {
    /* ignore */
  }
}

/**
 * Sync any guest focus sessions stored in localStorage to the server for the
 * now-authenticated user. Safe to call multiple times: only sessions newer
 * than the last successful sync marker are sent, and on success we clear
 * the localStorage entries that were imported plus update the marker.
 *
 * Returns the number of sessions imported (0 if nothing to do).
 */
export async function syncGuestFocusSessionsToUser(): Promise<number> {
  const all = readGuestSessions();
  if (all.length === 0) return 0;
  const lastSyncedAt = readSyncMarker();

  // Only consider sessions that have actually ended (so we don't sync the
  // currently-active in-flight session) and that are newer than the marker.
  const candidates = all.filter((s) => {
    if (!s.endedAt) return false;
    if (s.startedAt <= lastSyncedAt) return false;
    return true;
  });
  if (candidates.length === 0) return 0;

  const payload = {
    sessions: candidates.slice(0, 50).map((s) => ({
      articleId: s.articleId,
      language: s.language,
      startedAt: new Date(s.startedAt).toISOString(),
      endedAt: s.endedAt ? new Date(s.endedAt).toISOString() : undefined,
      focusedSeconds: s.focusedSeconds,
      completed: s.completed,
      articleTitle: s.articleTitle ?? null,
      articleSlug: s.articleSlug ?? null,
      articleImageUrl: s.articleImageUrl ?? null,
      categoryName: s.categoryName ?? null,
    })),
  };

  try {
    const result = await apiRequest("/api/focus-sessions/sync", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
      silent: true,
    }) as { imported?: number; total?: number } | null;

    const imported = result?.imported ?? 0;
    if (imported > 0) {
      // Drop the synced ones from localStorage (keep any active/in-flight
      // session that wasn't a candidate) and bump the high-water mark.
      const syncedIds = new Set(candidates.slice(0, 50).map((s) => s.id));
      const remaining = all.filter((s) => !syncedIds.has(s.id));
      writeGuestSessions(remaining);
      const newMarker = candidates.reduce((max, s) => Math.max(max, s.startedAt), lastSyncedAt);
      writeSyncMarker(newMarker);
      invalidateWeeklyReport();
    }
    return imported;
  } catch (error) {
    console.debug("Guest focus session sync failed (will retry on next login transition):", error);
    return 0;
  }
}

/**
 * Hook that tracks a single focus reading session.
 * - Uses Page Visibility API to pause when hidden > 30s.
 * - Persists to DB for logged-in users; localStorage for guests.
 * - Successful read threshold: a session is only marked `completed` once focusedSeconds >= 30.
 * - Returns sessionId, focusedSeconds, completed flag, and helpers.
 */
export function useFocusSession({
  articleId,
  language,
  isLoggedIn,
  active,
  articleSnapshot,
}: UseFocusSessionOptions) {
  const { logBehavior } = useBehaviorTracking();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [focusedSeconds, setFocusedSeconds] = useState(0);
  const [scrolledEnough, setScrolledEnough] = useState(false);
  const [shareSlug, setShareSlug] = useState<string | null>(null);

  // Refs for stable values inside long-lived intervals/handlers
  const articleIdRef = useRef(articleId);
  const focusedSecondsRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const isLoggedInRef = useRef(isLoggedIn);
  const lastTickRef = useRef<number>(Date.now());
  const hiddenSinceRef = useRef<number | null>(null);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSyncedSecondsRef = useRef(0);
  const cleanedUpRef = useRef(false);
  const scrolledEnoughRef = useRef(false);

  useEffect(() => { articleIdRef.current = articleId; }, [articleId]);
  useEffect(() => { isLoggedInRef.current = isLoggedIn; }, [isLoggedIn]);
  useEffect(() => { focusedSecondsRef.current = focusedSeconds; }, [focusedSeconds]);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { scrolledEnoughRef.current = scrolledEnough; }, [scrolledEnough]);

  // Derived "completed" flag is purely a minimum-focused-seconds threshold per
  // the Focus Mode spec. `scrolledEnough` remains tracked as a separate signal
  // but is intentionally NOT AND-gated here so that long, attentive reads that
  // didn't quite hit 85% scroll (e.g. very long articles) still count.
  const completed = focusedSeconds >= MIN_SUCCESSFUL_READ_SECONDS;

  // Start session when activated
  useEffect(() => {
    if (!active || !articleId) return;
    cleanedUpRef.current = false;
    let cancelled = false;

    (async () => {
      try {
        if (isLoggedIn) {
          const created = await apiRequest("/api/focus-sessions", {
            method: "POST",
            body: JSON.stringify({
              articleId,
              language,
              articleTitle: articleSnapshot?.title ?? null,
              articleImageUrl: articleSnapshot?.imageUrl ?? null,
              articleSlug: articleSnapshot?.slug ?? null,
              categoryName: articleSnapshot?.categoryName ?? null,
            }),
            headers: { "Content-Type": "application/json" },
            silent: true,
          }) as FocusSessionApiResponse | null;
          if (!cancelled && created?.id) {
            setSessionId(created.id);
          }
        } else {
          // Guest: localStorage only
          const id = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const session: GuestSession = {
            id,
            articleId,
            language,
            startedAt: Date.now(),
            focusedSeconds: 0,
            completed: false,
            articleTitle: articleSnapshot?.title ?? null,
            articleSlug: articleSnapshot?.slug ?? null,
            articleImageUrl: articleSnapshot?.imageUrl ?? null,
            categoryName: articleSnapshot?.categoryName ?? null,
          };
          const all = readGuestSessions();
          all.push(session);
          writeGuestSessions(all);
          if (!cancelled) setSessionId(id);
        }
      } catch (error) {
        console.debug("Focus session start failed (silent):", error);
      }
    })();

    logBehavior("focus_mode_enter", { articleId, language });
    lastTickRef.current = Date.now();
    hiddenSinceRef.current = document.visibilityState === "hidden" ? Date.now() : null;

    // Tick once per second; pause IMMEDIATELY when the tab is hidden so the
    // timer reflects real focused reading time only (not background time).
    tickIntervalRef.current = setInterval(() => {
      const now = Date.now();

      // Paused: tab is hidden. Reset lastTickRef so when the tab becomes
      // visible again we don't credit the entire hidden gap as elapsed time.
      if (document.visibilityState === "hidden") {
        lastTickRef.current = now;
        return;
      }

      const elapsed = now - lastTickRef.current;
      lastTickRef.current = now;
      // Only credit time within reasonable bounds (prevents giant jumps after sleep)
      if (elapsed > 0 && elapsed < 5000) {
        const inc = Math.round(elapsed / 1000);
        if (inc > 0) {
          setFocusedSeconds((prev) => prev + inc);
        }
      }
    }, 1000);

    const handleVisibility = () => {
      const now = Date.now();
      if (document.visibilityState === "hidden") {
        hiddenSinceRef.current = now;
      } else {
        hiddenSinceRef.current = null;
        // Restart counting cleanly so the just-resumed tick doesn't include
        // any hidden time in its elapsed delta.
        lastTickRef.current = now;
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
      // finalizeSession is itself idempotent (cleanedUpRef guard) so even if
      // the consumer also called it via close/ESC, this won't double-fire.
      finalizeSession(scrolledEnoughRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, articleId]);

  // Periodic sync for logged-in users every ~15s when value changed
  useEffect(() => {
    if (!sessionId || !isLoggedIn) return;
    if (focusedSeconds - lastSyncedSecondsRef.current < 15) return;
    lastSyncedSecondsRef.current = focusedSeconds;
    void apiRequest(`/api/focus-sessions/${sessionId}`, {
      method: "PATCH",
      body: JSON.stringify({ focusedSeconds }),
      headers: { "Content-Type": "application/json" },
      silent: true,
    })
      .then(() => invalidateWeeklyReport())
      .catch(() => {});
  }, [focusedSeconds, sessionId, isLoggedIn]);

  // Mirror updates to guest localStorage
  useEffect(() => {
    if (!sessionId || isLoggedIn) return;
    const all = readGuestSessions();
    const idx = all.findIndex((s) => s.id === sessionId);
    if (idx >= 0) {
      all[idx] = { ...all[idx], focusedSeconds, completed };
      writeGuestSessions(all);
    }
  }, [sessionId, isLoggedIn, focusedSeconds, completed]);

  const markCompleted = useCallback(() => {
    setScrolledEnough(true);
  }, []);

  const finalizeSession = useCallback((_scrolledFlag?: boolean) => {
    // Idempotent: only the FIRST call (from ESC, close button, or unmount
    // cleanup) actually persists; subsequent calls become no-ops to prevent
    // duplicate PATCH requests and duplicate `focus_mode_exit` events.
    // `_scrolledFlag` is accepted for backward-compat with existing callers
    // but is intentionally unused — completion is purely time-based now.
    if (cleanedUpRef.current) return;
    cleanedUpRef.current = true;

    const id = sessionIdRef.current;
    const seconds = focusedSecondsRef.current;
    const loggedIn = isLoggedInRef.current;
    if (!id || seconds < 1) return;

    // A session is persisted as a "successful focus read" purely on the
    // minimum focused-seconds threshold, matching the spec's policy.
    const finalCompleted = seconds >= MIN_SUCCESSFUL_READ_SECONDS;
    if (loggedIn) {
      // Best-effort fire & forget
      void apiRequest(`/api/focus-sessions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          focusedSeconds: seconds,
          endedAt: new Date().toISOString(),
          completed: finalCompleted,
        }),
        headers: { "Content-Type": "application/json" },
        silent: true,
      })
        .then(() => invalidateWeeklyReport())
        .catch(() => {});
    } else {
      const all = readGuestSessions();
      const idx = all.findIndex((s) => s.id === id);
      if (idx >= 0) {
        all[idx] = {
          ...all[idx],
          focusedSeconds: seconds,
          endedAt: Date.now(),
          completed: finalCompleted,
        };
        writeGuestSessions(all);
      }
    }
    logBehavior("focus_mode_exit", {
      articleId: articleIdRef.current,
      readTime: seconds,
      completed: finalCompleted,
    });
  }, [logBehavior]);

  const generateShareSlug = useCallback(async (): Promise<string | null> => {
    if (!sessionId || !isLoggedIn) return null;
    if (shareSlug) return shareSlug;
    try {
      const updated = await apiRequest(`/api/focus-sessions/${sessionId}`, {
        method: "PATCH",
        body: JSON.stringify({
          focusedSeconds: focusedSecondsRef.current,
          // Completion policy is time-based; server re-validates against the
          // 30s minimum so this is a safe assertion either way.
          completed: focusedSecondsRef.current >= MIN_SUCCESSFUL_READ_SECONDS,
          generateShareSlug: true,
        }),
        headers: { "Content-Type": "application/json" },
      }) as FocusSessionApiResponse;
      invalidateWeeklyReport();
      if (updated?.shareSlug) {
        setShareSlug(updated.shareSlug);
        logBehavior("focus_session_share", {
          articleId: articleIdRef.current,
          shareSlug: updated.shareSlug,
        });
        return updated.shareSlug;
      }
    } catch (error) {
      console.debug("Generate share slug failed:", error);
    }
    return null;
  }, [sessionId, isLoggedIn, shareSlug, logBehavior]);

  return {
    sessionId,
    focusedSeconds,
    completed,
    shareSlug,
    markCompleted,
    finalizeSession,
    generateShareSlug,
    completionThreshold: COMPLETION_THRESHOLD,
    minSuccessfulReadSeconds: MIN_SUCCESSFUL_READ_SECONDS,
  };
}
