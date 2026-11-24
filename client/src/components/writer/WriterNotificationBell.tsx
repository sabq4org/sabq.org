// جرس لوحة الكاتب (المرحلة 3): لم يكن في لوحة التحكم جرس، والإشعارات تصل الكاتب
// (قرار المراجعة، رد الإدارة، ملف جديد، الاجتماعات) فلا يراها إلا في البريد.

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { WriterNotificationRow } from "@/components/writer/WriterNotificationRow";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  WRITER_NOTIFICATIONS_QUERY,
  asWriterNotifications,
  type WriterNotification,
} from "@/lib/writerNotifications";

export function useWriterNotifications(enabled = true) {
  const query = useQuery({
    queryKey: WRITER_NOTIFICATIONS_QUERY,
    enabled,
    refetchInterval: enabled ? 60_000 : false,
    refetchIntervalInBackground: false,
  });
  const items = asWriterNotifications(query.data);
  const unread = items.filter((n) => !n.read).length;

  const markRead = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/notifications/${id}/read`, { method: "POST" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });
  const markAll = useMutation({
    mutationFn: () => apiRequest("/api/notifications/read-all", { method: "POST" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  return { items, unread, isLoading: query.isLoading, markRead, markAll };
}

export function WriterNotificationBell() {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const { items, unread, markRead, markAll } = useWriterNotifications();

  const openOne = (n: WriterNotification) => {
    if (!n.read) markRead.mutate(n.id);
    setOpen(false);
    if (n.deeplink) navigate(n.deeplink);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-[#E6F4FD] md:h-11 md:w-11",
            open && "bg-[#E6F4FD] text-[#0B6FA8]",
          )}
          aria-label={unread > 0 ? `الإشعارات، ${unread} غير مقروءة` : "الإشعارات"}
          data-testid="button-writer-bell"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute left-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#E5484D] px-1 text-[11px] font-bold leading-none text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[calc(100vw-24px)] max-w-[380px] overflow-hidden rounded-[22px] border-0 p-0 shadow-[0_12px_40px_rgba(27,43,58,0.16)]"
        data-testid="popover-writer-bell"
      >
        <div className="flex items-center border-b border-[#EEF2F6] px-4 py-3.5 dark:border-border">
          <span className="flex-1 text-base font-bold">الإشعارات</span>
          {unread > 0 && (
            <button type="button" onClick={() => markAll.mutate()} className="text-[13px] font-medium text-[#0B6FA8]">
              تعليم الكل كمقروء
            </button>
          )}
        </div>
        <div className="max-h-[420px] divide-y divide-[#EEF2F6] overflow-y-auto dark:divide-border">
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[#617183]">لا إشعارات بعد. يصلك هنا قرار المراجعة ورد الإدارة والملفات الجديدة.</p>
          ) : (
            items.slice(0, 6).map((n) => <WriterNotificationRow key={n.id} n={n} onOpen={openOne} compact />)
          )}
        </div>
        <Link
          href="/dashboard/notifications"
          onClick={() => setOpen(false)}
          className="block border-t border-[#EEF2F6] py-3.5 text-center text-[15px] font-semibold text-[#0B6FA8] dark:border-border"
          data-testid="link-writer-all-notifications"
        >
          كل الإشعارات
        </Link>
      </PopoverContent>
    </Popover>
  );
}
