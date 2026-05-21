import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, MessagesSquare } from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import type { ChatMessage, ChatStaffUser } from "./types";

interface MessageListProps {
  messages: ChatMessage[];
  currentUserId: string;
  other: ChatStaffUser;
  loading: boolean;
}

function startOfDay(iso: string): string {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const oneDay = 86_400_000;
  const diff = Math.round((now.getTime() - d.getTime()) / oneDay);
  if (diff === 0) return "اليوم";
  if (diff === 1) return "أمس";
  return d.toLocaleDateString("ar-SA", { weekday: "long", day: "numeric", month: "long" });
}

// Distance from the bottom (in pixels) below which we consider the user
// to be "at the bottom" — within this, new messages auto-scroll; outside
// this, we leave the user where they are and surface a "X new messages"
// pill they can tap to jump down.
const NEAR_BOTTOM_THRESHOLD_PX = 80;

export function MessageList({ messages, currentUserId, other, loading }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastMessageIdRef = useRef<string | null>(null);
  // Track "near bottom" reactively so we can pick a UX path on every
  // incoming message: snap-to-bottom OR show the new-message pill.
  const [nearBottom, setNearBottom] = useState(true);
  const [newSinceScrollUp, setNewSinceScrollUp] = useState(0);

  const checkNearBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return true;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    return distance <= NEAR_BOTTOM_THRESHOLD_PX;
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    setNewSinceScrollUp(0);
    setNearBottom(true);
  }, []);

  // Reactively track scroll position so the pill appears/disappears as the
  // user scrolls. Throttled to a single rAF per scroll event.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let raf = 0;
    const handler = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const isNear = checkNearBottom();
        setNearBottom(isNear);
        if (isNear) setNewSinceScrollUp(0);
      });
    };
    el.addEventListener("scroll", handler, { passive: true });
    return () => {
      el.removeEventListener("scroll", handler);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [checkNearBottom]);

  // Decide how to react to a new message:
  //   - if the user is near the bottom, snap to it (so the chat flows naturally)
  //   - if they've scrolled up to read history, leave them alone and
  //     increment the "new messages" counter for the pill
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const lastId = messages.length > 0 ? messages[messages.length - 1].id : null;
    const isNew = lastId !== lastMessageIdRef.current;
    if (!isNew) return;

    const wasNearBottom = checkNearBottom();
    const isMyMessage =
      messages.length > 0 && messages[messages.length - 1].senderId === currentUserId;

    // First paint (no prior id) OR I just sent OR user was near bottom → snap.
    if (lastMessageIdRef.current === null || isMyMessage || wasNearBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
      setNewSinceScrollUp(0);
    } else {
      setNewSinceScrollUp((n) => n + 1);
    }
    lastMessageIdRef.current = lastId;
  }, [messages, currentUserId, checkNearBottom]);

  // Insert "date separator" rows + decide which avatars to show.
  const rows = useMemo(() => {
    const result: Array<
      | { kind: "separator"; key: string; label: string }
      | { kind: "msg"; key: string; message: ChatMessage; showAvatar: boolean }
    > = [];
    let lastDay = "";
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      const day = startOfDay(m.createdAt);
      if (day !== lastDay) {
        lastDay = day;
        result.push({ kind: "separator", key: `sep-${day}`, label: formatDayLabel(m.createdAt) });
      }
      const next = messages[i + 1];
      // Show avatar only on the last message in a continuous run from the same sender.
      const showAvatar = !next || next.senderId !== m.senderId;
      result.push({ kind: "msg", key: m.id, message: m, showAvatar });
    }
    return result;
  }, [messages]);

  if (loading && messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground min-h-0">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground text-sm p-8 text-center min-h-0">
        <MessagesSquare className="h-10 w-10 opacity-50" />
        <div>لا توجد رسائل بعد. ابدأ المحادثة!</div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={containerRef}
        className="absolute inset-0 overflow-y-auto px-4 py-3 space-y-2 overscroll-contain"
        data-testid="chat-message-list"
      >
        {rows.map((row) =>
          row.kind === "separator" ? (
            <div key={row.key} className="flex items-center gap-3 my-2">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">{row.label}</span>
              <div className="flex-1 h-px bg-border" />
            </div>
          ) : (
            <MessageBubble
              key={row.key}
              message={row.message}
              isMine={row.message.senderId === currentUserId}
              otherAvatarUrl={other.avatarUrl}
              otherName={other.name}
              showAvatar={row.showAvatar}
            />
          ),
        )}
      </div>

      {!nearBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs shadow-lg hover:opacity-90 transition-opacity z-10"
          data-testid="chat-jump-to-bottom"
          aria-label="انتقل إلى آخر رسالة"
        >
          {newSinceScrollUp > 0 ? (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              <span>
                {newSinceScrollUp} {newSinceScrollUp === 1 ? "رسالة جديدة" : "رسائل جديدة"}
              </span>
            </>
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      )}
    </div>
  );
}
