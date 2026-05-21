import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, MessagesSquare } from "lucide-react";
import type { ChatConversationSummary } from "./types";

interface ConversationsListProps {
  conversations: ChatConversationSummary[];
  activeId: string | null;
  loading: boolean;
  onSelect: (conversation: ChatConversationSummary) => void;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "الآن";
  if (diff < 3600) return `قبل ${Math.floor(diff / 60)} د`;
  if (diff < 86400) return `قبل ${Math.floor(diff / 3600)} س`;
  if (diff < 604800) return `قبل ${Math.floor(diff / 86400)} ي`;
  return d.toLocaleDateString("ar-SA", { day: "numeric", month: "short" });
}

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0] || "").slice(0, 2).join("").toUpperCase() || "؟";
}

export function ConversationsList({
  conversations,
  activeId,
  loading,
  onSelect,
}: ConversationsListProps) {
  if (loading && conversations.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground text-sm p-6 text-center">
        <MessagesSquare className="h-10 w-10 opacity-50" />
        <div>لا توجد محادثات بعد</div>
        <div className="text-[11px]">اضغط على زر "محادثة جديدة" لبدء واحدة</div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto" data-testid="chat-conversations-list">
      {conversations.map((c) => {
        const isActive = c.id === activeId;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c)}
            className={`w-full text-right flex items-center gap-3 px-3 py-3 border-b transition-colors ${
              isActive
                ? "bg-primary/10"
                : c.hasUnread
                  ? "bg-muted/40 hover:bg-muted"
                  : "hover:bg-muted/50"
            }`}
            data-testid={`chat-conversation-${c.id}`}
          >
            <div className="relative shrink-0">
              <Avatar className="h-11 w-11">
                <AvatarImage src={c.otherUser.avatarUrl ?? undefined} alt={c.otherUser.name} />
                <AvatarFallback className="text-xs">{initials(c.otherUser.name)}</AvatarFallback>
              </Avatar>
              {c.otherUser.online && (
                <span className="absolute bottom-0 left-0 h-3 w-3 rounded-full bg-green-500 border-2 border-background" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={`text-sm truncate ${
                    c.hasUnread ? "font-semibold text-foreground" : "font-medium text-foreground"
                  }`}
                >
                  {c.otherUser.name}
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {relativeTime(c.lastMessageAt)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <span
                  className={`text-xs truncate ${
                    c.hasUnread ? "text-foreground font-medium" : "text-muted-foreground"
                  }`}
                >
                  {c.lastMessagePreview || "—"}
                </span>
                {c.hasUnread && (
                  <span className="h-2 w-2 rounded-full bg-primary shrink-0" aria-label="غير مقروء" />
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
