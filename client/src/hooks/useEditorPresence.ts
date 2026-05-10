import { useEffect, useMemo, useRef, useState } from "react";

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

const HEARTBEAT_INTERVAL_MS = 20_000;

function postHeartbeat(payload: {
  articleId: string | null;
  articleTitle: string;
  articleSummary: string;
}) {
  return fetch("/api/editor-presence/heartbeat", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

function leavePresence() {
  try {
    if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      const blob = new Blob([JSON.stringify({})], { type: "application/json" });
      const sent = (navigator as any).sendBeacon?.(
        "/api/editor-presence/leave",
        blob,
      );
      if (sent) return;
    }
  } catch {
    // fall through to fetch
  }
  fetch("/api/editor-presence/leave", {
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

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const send = () => {
      if (cancelled) return;
      postHeartbeat(latestPayloadRef.current);
    };

    send();
    const interval = setInterval(send, HEARTBEAT_INTERVAL_MS);

    const handleBeforeUnload = () => leavePresence();
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      leavePresence();
    };
  }, [enabled]);

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
