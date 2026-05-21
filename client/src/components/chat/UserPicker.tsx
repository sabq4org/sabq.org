import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { useChatStaffSearch } from "./hooks";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { chatConversationsQueryKey } from "./hooks";

interface UserPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConversationReady: (conversationId: string) => void;
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

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0] || "").slice(0, 2).join("").toUpperCase() || "؟";
}

export function UserPicker({ open, onOpenChange, onConversationReady }: UserPickerProps) {
  const [query, setQuery] = useState("");
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const { toast } = useToast();
  const { data, isLoading } = useChatStaffSearch(query, { enabled: open });
  const staff = Array.isArray(data?.staff) ? data!.staff : [];

  const handlePick = async (userId: string) => {
    if (creatingId) return;
    setCreatingId(userId);
    try {
      const result = await apiRequest<{ id: string }>("/api/chat/conversations", {
        method: "POST",
        body: JSON.stringify({ participantId: userId }),
      });
      queryClient.invalidateQueries({ queryKey: chatConversationsQueryKey() });
      onOpenChange(false);
      setQuery("");
      onConversationReady(result.id);
    } catch (err: any) {
      toast({
        title: "تعذّر إنشاء المحادثة",
        description: err?.message || "حاول مرة أخرى",
        variant: "destructive",
      });
    } finally {
      setCreatingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle>محادثة جديدة</DialogTitle>
          <DialogDescription>اختر زميلاً لبدء الحديث معه</DialogDescription>
        </DialogHeader>
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث بالاسم أو البريد…"
              className="pr-8"
              autoFocus
              data-testid="chat-userpicker-search"
            />
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto border-t">
          {isLoading ? (
            <div className="p-6 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : staff.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              لا توجد نتائج
            </div>
          ) : (
            staff.map((u) => (
              <button
                key={u.id}
                type="button"
                disabled={creatingId !== null}
                onClick={() => void handlePick(u.id)}
                className="w-full text-right flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors disabled:opacity-50"
                data-testid={`chat-userpicker-${u.id}`}
              >
                <div className="relative shrink-0">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={u.avatarUrl ?? undefined} alt={u.name} />
                    <AvatarFallback className="text-xs">{initials(u.name)}</AvatarFallback>
                  </Avatar>
                  {u.online && (
                    <span className="absolute bottom-0 left-0 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-background" />
                  )}
                </div>
                <div className="flex-1 min-w-0 text-right">
                  <div className="text-sm font-medium truncate">{u.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {(u.role && ROLE_LABELS[u.role]) || u.role || ""}
                  </div>
                </div>
                {creatingId === u.id && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
