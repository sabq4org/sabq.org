import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Check, Clock } from "lucide-react";
import type { ChatMessage } from "./types";

interface MessageBubbleProps {
  message: ChatMessage;
  isMine: boolean;
  otherAvatarUrl: string | null;
  otherName: string;
  showAvatar: boolean;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0] || "")
    .slice(0, 2)
    .join("")
    .toUpperCase() || "؟";
}

export function MessageBubble({
  message,
  isMine,
  otherAvatarUrl,
  otherName,
  showAvatar,
}: MessageBubbleProps) {
  const hasImages = message.attachments.length > 0;
  const hasText = !!message.body?.trim();

  return (
    <div
      className={`flex items-end gap-2 ${isMine ? "flex-row-reverse" : ""}`}
      data-testid={`chat-message-${message.id}`}
    >
      {!isMine && (
        <div className="w-8 shrink-0">
          {showAvatar && (
            <Avatar className="h-8 w-8">
              <AvatarImage src={otherAvatarUrl ?? undefined} alt={otherName} />
              <AvatarFallback className="text-xs">{initials(otherName)}</AvatarFallback>
            </Avatar>
          )}
        </div>
      )}

      <div className={`max-w-[75%] flex flex-col gap-1 ${isMine ? "items-end" : "items-start"}`}>
        {hasImages && (
          <div className={`flex flex-wrap gap-1 ${isMine ? "justify-end" : "justify-start"}`}>
            {message.attachments.map((a) => (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noreferrer noopener"
                className="block"
              >
                <img
                  src={a.thumbnailUrl || a.url}
                  alt="مرفق"
                  className="max-h-60 max-w-60 rounded-lg border object-cover"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        )}

        {hasText && (
          <div
            className={`px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words shadow-sm ${
              isMine
                ? "bg-primary text-primary-foreground rounded-br-sm"
                : "bg-muted text-foreground rounded-bl-sm"
            }`}
          >
            {message.body}
          </div>
        )}

        <div
          className={`flex items-center gap-1 text-[10px] ${
            isMine ? "text-muted-foreground" : "text-muted-foreground"
          }`}
        >
          <span>{formatTime(message.createdAt)}</span>
          {isMine && (
            message.pending
              ? <Clock className="h-3 w-3" />
              : <Check className="h-3 w-3" />
          )}
        </div>
      </div>
    </div>
  );
}
