import { useEffect, useState } from "react";
import { MessagesSquare, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConversationsList } from "./ConversationsList";
import { ConversationView } from "./ConversationView";
import { UserPicker } from "./UserPicker";
import { StatusPicker } from "./StatusPicker";
import { useChatConversations, useChatRealtimeBridge } from "./hooks";
import { hasPermission, useAuth } from "@/hooks/useAuth";
import type { ChatConversationSummary } from "./types";

interface ChatLayoutProps {
  /** When true, render in compact (popup widget) mode — single column. */
  compact?: boolean;
  /** Optional preselected conversation id (e.g. via URL deep-link). */
  initialConversationId?: string | null;
}

export function ChatLayout({ compact = false, initialConversationId = null }: ChatLayoutProps) {
  const { user } = useAuth();
  const userId = user?.id;

  useChatRealtimeBridge(userId);

  const { data, isLoading } = useChatConversations({ enabled: !!userId });
  const conversations: ChatConversationSummary[] = Array.isArray(data?.conversations)
    ? data!.conversations
    : [];

  const [activeId, setActiveId] = useState<string | null>(initialConversationId);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Keep activeId valid as the list reshuffles. On wide screens, auto-pick
  // the first conversation so the right pane isn't empty.
  useEffect(() => {
    if (!conversations.length) {
      if (activeId !== null) setActiveId(null);
      return;
    }
    const stillExists = activeId && conversations.some((c) => c.id === activeId);
    if (!stillExists) {
      setActiveId(compact ? null : conversations[0].id);
    }
  }, [conversations, activeId, compact]);

  const active = activeId ? conversations.find((c) => c.id === activeId) ?? null : null;
  const canStartNew = hasPermission(user, "chat.manage");

  if (!userId) return null;

  // Compact (widget) mode: stack — show the list, drill into one conversation.
  if (compact) {
    if (active) {
      return (
        <div className="flex flex-col h-full">
          <ConversationView
            conversation={active}
            currentUserId={userId}
            onBack={() => setActiveId(null)}
            compact
          />
        </div>
      );
    }
    return (
      <div className="flex flex-col h-full bg-background">
        <div className="flex items-center justify-between border-b px-4 py-3 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <MessagesSquare className="h-4 w-4 text-primary shrink-0" />
            <span className="font-medium text-sm">الدردشة</span>
          </div>
          <div className="flex items-center gap-1">
            <StatusPicker compact />
            {canStartNew && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 gap-1 px-2"
                onClick={() => setPickerOpen(true)}
                data-testid="chat-new-button-compact"
                aria-label="محادثة جديدة"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        <ConversationsList
          conversations={conversations}
          activeId={activeId}
          loading={isLoading}
          onSelect={(c) => setActiveId(c.id)}
        />
        <UserPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onConversationReady={(id) => setActiveId(id)}
        />
      </div>
    );
  }

  // Full-page mode: 2-column.
  return (
    <div className="grid grid-cols-[320px_1fr] h-full border rounded-lg overflow-hidden bg-background">
      <div className="flex flex-col border-l">
        <div className="flex items-center justify-between border-b px-3 py-3 gap-2">
          <div className="font-medium">المحادثات</div>
          <div className="flex items-center gap-2">
            <StatusPicker />
            {canStartNew && (
              <Button
                type="button"
                size="sm"
                className="h-8 gap-1"
                onClick={() => setPickerOpen(true)}
                data-testid="chat-new-button"
              >
                <Plus className="h-3.5 w-3.5" />
                محادثة جديدة
              </Button>
            )}
          </div>
        </div>
        <ConversationsList
          conversations={conversations}
          activeId={activeId}
          loading={isLoading}
          onSelect={(c) => setActiveId(c.id)}
        />
      </div>
      <div className="flex flex-col">
        {active ? (
          <ConversationView conversation={active} currentUserId={userId} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3 p-8 text-center">
            <MessagesSquare className="h-12 w-12 opacity-50" />
            <div className="font-medium">اختر محادثة من القائمة</div>
            {canStartNew && (
              <div className="text-sm">أو ابدأ محادثة جديدة مع أحد الزملاء</div>
            )}
          </div>
        )}
      </div>
      <UserPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onConversationReady={(id) => setActiveId(id)}
      />
    </div>
  );
}
