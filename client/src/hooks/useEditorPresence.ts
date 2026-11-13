import { useEffect, useMemo, useRef, useState } from "react";
import { apiUrl } from "@/lib/queryClient";
import {
  EDITOR_HEARTBEAT_INTERVAL_MS,
  getNextPresenceCheckDelayMs,
  shouldMaintainEditorPresence,
  type EditorPresenceActivityState,
} from "@/lib/editorPresencePolicy";

export interface CoEditorPresence {
  userId: string;
  userName: string;
  userAvatar: string | null;
  articleId: string | null;
  articleTitle: string;
  articleSummary: string;
  updatedAt: number;
}

interface UseEditorPresenceOptions {
  enabled: boolean;
  articleId: string | null;
  articleTitle: string;
  articleSummary: string;
  currentUserId?: string | null;
}

function postHeartbeat(payload: {
  articleId: string | null;
  articleTitle: string;
  articleSummary: string;
}) {
  return fetch(apiUrl("/api/editor-presence/heartbeat"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, idleAware: true }),
  }).catch(() => {});
}

function leavePresence() {
  try {
    if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      const blob = new Blob([JSON.stringify({})], { type: "application/json" });
      const sent = (navigator as any).sendBeacon?.(
        apiUrl("/api/editor-presence/leave"),
        blob,
      );
      if (sent) return;
    }
  } catch {
    // fall through to fetch
  }
  fetch(apiUrl("/api/editor-presence/leave"), {
    method: "DELETE",
    credentials: "include",
    keepalive: true,
  }).catch(() => {});
}

export function useEditorPresence({
  enabled,
  articleId,
  articleTitle,
  articleSummary,
  currentUserId,
}: UseEditorPresenceOptions) {
  const latestPayloadRef = useRef({ articleId, articleTitle, articleSummary });
  latestPayloadRef.current = { articleId, articleTitle, articleSummary };

  const [editors, setEditors] = useState<CoEditorPresence[]>([]);
  const onContentChangeRef = useRef<((articleChanged: boolean) => void) | null>(null);
  const prevPayloadRef = useRef({ articleId, articleTitle, articleSummary });

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let presenceActive = false;
    let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

    const isHidden = () =>
      typeof document !== "undefined" && document.visibilityState === "hidden";

    const activityState: EditorPresenceActivityState = {
      lastActivityAt: Date.now(),
      hiddenSince: isHidden() ? Date.now() : null,
    };

    const clearInactivityTimer = () => {
      if (inactivityTimer !== null) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
      }
    };

    const pausePresence = () => {
      clearInactivityTimer();
      if (!presenceActive) return;
      presenceActive = false;
      leavePresence();
    };

    const evaluateActivity = (): boolean => {
      if (cancelled) return false;
      const now = Date.now();
      if (!shouldMaintainEditorPresence(activityState, now)) {
        pausePresence();
        return false;
      }
      return true;
    };

    const scheduleInactivityCheck = () => {
      clearInactivityTimer();
      if (cancelled || !presenceActive) return;
      const delay = getNextPresenceCheckDelayMs(activityState, Date.now());
      inactivityTimer = setTimeout(() => {
        evaluateActivity();
      }, delay);
    };

    const sendHeartbeat = () => {
      if (cancelled) return;
      presenceActive = true;
      postHeartbeat(latestPayloadRef.current);
      scheduleInactivityCheck();
    };

    const markActive = (forceImmediateHeartbeat = false) => {
      if (cancelled || isHidden()) return;
      activityState.lastActivityAt = Date.now();
      activityState.hiddenSince = null;
      if (!presenceActive || forceImmediateHeartbeat) {
        sendHeartbeat();
      } else {
        scheduleInactivityCheck();
      }
    };

    onContentChangeRef.current = (articleChanged: boolean) => {
      markActive(articleChanged);
    };

    if (!isHidden()) {
      sendHeartbeat();
    }

    const interval = setInterval(() => {
      if (!evaluateActivity()) return;
      if (!presenceActive && isHidden()) return;
      sendHeartbeat();
    }, EDITOR_HEARTBEAT_INTERVAL_MS);

    const handleUserActivity = () => markActive(false);
    const handleVisibilityChange = () => {
      if (cancelled) return;
      if (isHidden()) {
        if (activityState.hiddenSince === null) {
          activityState.hiddenSince = Date.now();
        }
        if (evaluateActivity()) {
          scheduleInactivityCheck();
        }
      } else {
        markActive(false);
      }
    };
    const handlePageLeave = () => pausePresence();

    const activityEvents: Array<keyof WindowEventMap> = [
      "keydown",
      "pointerdown",
      "input",
      "focus",
      "wheel",
    ];
    for (const eventName of activityEvents) {
      window.addEventListener(eventName, handleUserActivity, {
        capture: true,
        passive: true,
      });
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageLeave);
    window.addEventListener("beforeunload", handlePageLeave);

    return () => {
      cancelled = true;
      onContentChangeRef.current = null;
      clearInterval(interval);
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, handleUserActivity, {
          capture: true,
        });
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageLeave);
      window.removeEventListener("beforeunload", handlePageLeave);
      pausePresence();
    };
  }, [enabled]);

  useEffect(() => {
    const prev = prevPayloadRef.current;
    const articleChanged = prev.articleId !== articleId;
    const contentChanged =
      articleChanged ||
      prev.articleTitle !== articleTitle ||
      prev.articleSummary !== articleSummary;
    prevPayloadRef.current = { articleId, articleTitle, articleSummary };

    if (!enabled || !contentChanged) return;
    onContentChangeRef.current?.(articleChanged);
  }, [enabled, articleId, articleTitle, articleSummary]);

  // Subscribe to presence stream so we can detect other editors on the same
  // article in real time. Only opens a connection when we actually need it
  // (i.e. an existing article is being edited).
  useEffect(() => {
    if (!enabled || !articleId) {
      setEditors([]);
      return;
    }

    const source = new EventSource("/api/editor-presence/stream", {
      withCredentials: true,
    } as EventSourceInit);

    const onPresence = (event: Event) => {
      try {
        const parsed = JSON.parse((event as MessageEvent).data);
        if (Array.isArray(parsed?.editors)) {
          setEditors(parsed.editors as CoEditorPresence[]);
        }
      } catch {
        // ignore malformed payloads
      }
    };

    source.addEventListener("presence_update", onPresence);

    return () => {
      source.removeEventListener("presence_update", onPresence);
      source.close();
      setEditors([]);
    };
  }, [enabled, articleId]);

  const coEditors = useMemo(() => {
    if (!articleId) return [] as CoEditorPresence[];
    return editors.filter(
      (entry) =>
        entry.articleId === articleId &&
        (!currentUserId || entry.userId !== currentUserId),
    );
  }, [editors, articleId, currentUserId]);

  return { coEditors };
}
