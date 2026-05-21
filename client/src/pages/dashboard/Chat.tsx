import { DashboardLayout } from "@/components/DashboardLayout";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { hasPermission, useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { useEffect } from "react";

export default function ChatPage() {
  const { user, isLoading } = useAuth({ redirectToLogin: true });
  const [, navigate] = useLocation();

  // If the logged-in user can't use chat, bounce to dashboard.
  useEffect(() => {
    if (!isLoading && user && !hasPermission(user, "chat.use")) {
      navigate("/dashboard");
    }
  }, [user, isLoading, navigate]);

  if (isLoading || !user) {
    return null;
  }
  if (!hasPermission(user, "chat.use")) {
    return null;
  }

  return (
    <DashboardLayout>
      {/*
        We use dynamic viewport height (dvh) and reserve generous chrome
        space for the dashboard header + breadcrumbs + sidebar trigger
        bar. min-h-[500px] guarantees the composer stays visible even on
        short windows (e.g. zoomed-in laptop screens where 100dvh - 9rem
        could otherwise be too small).
      */}
      <div className="flex flex-col p-4 md:p-6 h-[calc(100dvh-9rem)] min-h-[500px] overflow-hidden">
        <div className="mb-3 shrink-0">
          <h1 className="text-xl font-semibold">الدردشة</h1>
          <p className="text-sm text-muted-foreground">
            تحدث مباشرة مع زملاء التحرير ومدراء المحتوى
          </p>
        </div>
        <div className="flex-1 min-h-0">
          <ChatLayout />
        </div>
      </div>
    </DashboardLayout>
  );
}
