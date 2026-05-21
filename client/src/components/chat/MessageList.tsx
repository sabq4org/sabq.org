import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Loader2, MessagesSquare } from "lucide-react";
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

export function MessageList({ messages, currentUserId, other, loading }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastMessageIdRef = useRef<string | null>(null);

  // Auto-scroll to the bottom whenever a new message arrives or we mount.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const lastId = messages.length > 0 ? messages[messages.length - 1].id : null;
    if (lastId !== lastMessageIdRef.current) {
      el.scrollTop = el.scrollHeight;
      lastMessageIdRef.current = lastId;
    }
  }, [messages]);

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
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground text-sm p-8 text-center">
        <MessagesSquare className="h-10 w-10 opacity-50" />
        <div>لا توجد رسائل بعد. ابدأ المحادثة!</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-4 py-3 space-y-2"
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
  );
}
