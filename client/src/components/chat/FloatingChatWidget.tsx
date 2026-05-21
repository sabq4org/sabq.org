import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hasPermission, useAuth } from "@/hooks/useAuth";
import { ChatLayout } from "./ChatLayout";
import { useChatUnreadCount } from "./hooks";

const STORAGE_KEY = "sabq.chat.widget.open";

/**
 * Floating chat widget visible from any dashboard page. Hides itself on
 * the dedicated /dashboard/chat page so the bubble doesn't double-up. Also
 * hides for users who lack chat.use entirely.
 */
export function FloatingChatWidget() {
  const { user } = useAuth();
  const [location] = useLocation();
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });
  const canUseChat = !!user && hasPermission(user, "chat.use");
  const onDashboard = location.startsWith("/dashboard");
  const unread = useChatUnreadCount(canUseChat && onDashboard);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
  }, [open]);

  // Update the document title to reflect unread count — feels like a real
  // messaging app even when the user is on another tab.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = unread > 0 ? `(${unread}) ${base}` : base;
    return () => {
      document.title = document.title.replace(/^\(\d+\)\s*/, "");
    };
  }, [unread]);

  if (!canUseChat) return null;
  if (!onDashboard) return null;
  // Hide on the dedicated chat page — no need to double up.
  if (location === "/dashboard/chat") return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex flex-col items-start gap-3">
      {open && (
        <div className="w-[360px] h-[560px] max-h-[80vh] rounded-2xl shadow-2xl border bg-background overflow-hidden flex flex-col">
          <div className="absolute top-2 right-2 z-10">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setOpen(false)}
              aria-label="إغلاق نافذة الدردشة"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <ChatLayout compact />
        </div>
      )}
      <Button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="h-14 w-14 rounded-full shadow-lg p-0 relative"
        aria-label="فتح الدردشة"
        data-testid="chat-floating-button"
      >
        <MessageSquare className="h-6 w-6" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center border-2 border-background">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Button>
    </div>
  );
}
