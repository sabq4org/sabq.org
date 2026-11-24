// صف إشعار واحد في جرس لوحة الكاتب وصفحة «إشعاراتي».

import { FileText, MessageSquare, PenLine, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  writerNotificationCategory,
  writerNotificationTime,
  type WriterNotification,
  type WriterNotificationCategory,
} from "@/lib/writerNotifications";

const ICON: Record<WriterNotificationCategory, { Icon: typeof FileText; cls: string }> = {
  articles: { Icon: PenLine, cls: "bg-[#E6F4FD] text-[#0B6FA8]" },
  tickets: { Icon: MessageSquare, cls: "bg-[#EEF0FF] text-[#4B4FC4]" },
  files: { Icon: FileText, cls: "bg-[#FFF6E5] text-[#946000]" },
  meetings: { Icon: Video, cls: "bg-[#F1F4F7] text-[#55667A]" },
};

export function WriterNotificationRow({
  n,
  onOpen,
  compact = false,
}: {
  n: WriterNotification;
  onOpen: (n: WriterNotification) => void;
  compact?: boolean;
}) {
  const { Icon, cls } = ICON[writerNotificationCategory(n.type, n.deeplink)];
  return (
    <button
      type="button"
      onClick={() => onOpen(n)}
      className={cn(
        "flex w-full items-start gap-3 text-start transition hover:bg-[#F4F9FD] dark:hover:bg-muted/40",
        compact ? "px-4 py-3" : "px-5 py-4 sm:items-center sm:gap-4 sm:px-6",
        !n.read && "bg-[#F7FBFE] dark:bg-sky-950/20",
      )}
      data-testid={`writer-notification-${n.id}`}
    >
      <span className={cn("flex shrink-0 items-center justify-center rounded-full", compact ? "h-9 w-9" : "h-10 w-10", cls)}>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className={cn("block text-[15px] leading-6", n.read ? "font-medium" : "font-bold")}>{n.title}</span>
        {n.body && <span className="line-clamp-2 block text-sm leading-6 text-[#55667A] dark:text-muted-foreground">{n.body}</span>}
        {compact && <span className="block text-xs text-[#617183]">{writerNotificationTime(n.createdAt)}</span>}
      </span>
      {!compact && <span className="hidden shrink-0 text-xs text-[#617183] sm:inline">{writerNotificationTime(n.createdAt)}</span>}
      <span className={cn("mt-2 h-2 w-2 shrink-0 rounded-full sm:mt-0", n.read ? "bg-transparent" : "bg-[#1E9BE6]")} />
    </button>
  );
}
