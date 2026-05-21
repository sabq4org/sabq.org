import { useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";
import { useChatMessages } from "./hooks";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { chatConversationsQueryKey } from "./hooks";
import type { ChatConversationSummary } from "./types";

interface ConversationViewProps {
  conversation: ChatConversationSummary;
  currentUserId: string;
  onBack?: () => void;
  compact?: boolean;
}

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0] || "").slice(0, 2).join("").toUpperCase() || "؟";
}

const ROLE_LABELS: Record<string, string> = {
  system_admin: "مدير النظام",
  admin: "مسؤول",
  editor: "محرر",
  content_manager: "مدير محتوى",
  reporter: "مراسل",
  opinion_author: "كاتب رأي",
  comments_moderator: "مشرف تعليقات",
  media_manager: "مدير وسائط",
};

export function ConversationView({
  conversation,
  currentUserId,
  onBack,
  compact = false,
}: ConversationViewProps) {
  const { data, isLoading } = useChatMessages(conversation.id);
  const messages = Array.isArray(data?.messages) ? data!.messages : [];

  // Mark as read when we open the conversation OR when a new message arrives.
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;
  useEffect(() => {
    if (!conversation.id) return;
    apiRequest(`/api/chat/conversations/${encodeURIComponent(conversation.id)}/read`, {
      method: "POST",
      body: JSON.stringify({}),
    })
      .then(() => {
        queryClient.setQueryData<{ conversations: ChatConversationSummary[] } | undefined>(
          chatConversationsQueryKey(),
          (old) => {
            if (!old) return old;
            return {
              conversations: old.conversations.map((c) =>
                c.id === conversation.id ? { ...c, hasUnread: false } : c,
              ),
            };
          },
        );
      })
      .catch(() => { /* read receipts are best-effort */ });
  }, [conversation.id, lastMessageId]);

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center gap-3 px-4 py-3 border-b">
        {onBack && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onBack}
            aria-label="رجوع"
            data-testid="chat-back-button"
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
        <div className="relative shrink-0">
          <Avatar className={compact ? "h-9 w-9" : "h-10 w-10"}>
            <AvatarImage src={conversation.otherUser.avatarUrl ?? undefined} alt={conversation.otherUser.name} />
            <AvatarFallback className="text-xs">{initials(conversation.otherUser.name)}</AvatarFallback>
          </Avatar>
          {conversation.otherUser.online && (
            <span className="absolute bottom-0 left-0 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-background" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{conversation.otherUser.name}</div>
          <div className="text-[11px] text-muted-foreground">
            {conversation.otherUser.online ? "متصل الآن" : "غير متصل"}
            {conversation.otherUser.role
              ? ` · ${ROLE_LABELS[conversation.otherUser.role] || conversation.otherUser.role}`
              : ""}
          </div>
        </div>
      </div>

      <MessageList
        messages={messages}
        currentUserId={currentUserId}
        other={conversation.otherUser}
        loading={isLoading}
      />

      <Composer conversationId={conversation.id} currentUserId={currentUserId} />
    </div>
  );
}
