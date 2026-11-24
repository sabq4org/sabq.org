// «إشعاراتي» للكاتب (المرحلة 3): مجمّعة باليوم مع تصفية حسب النوع.

import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { WriterPageFrame, WriterSurface } from "@/components/writer/WriterPageFrame";
import { WriterNotificationRow } from "@/components/writer/WriterNotificationRow";
import { useWriterNotifications } from "@/components/writer/WriterNotificationBell";
import { cn } from "@/lib/utils";
import {
  WRITER_NOTIFICATION_FILTERS,
  groupWriterNotifications,
  writerNotificationCategory,
  type WriterNotification,
} from "@/lib/writerNotifications";

type FilterKey = (typeof WRITER_NOTIFICATION_FILTERS)[number]["key"];

export default function WriterNotificationsPage() {
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState<FilterKey>("all");
  const { items, unread, isLoading, markRead, markAll } = useWriterNotifications();

  const matches = (n: WriterNotification, key: FilterKey) =>
    key === "all" ? true : key === "unread" ? !n.read : writerNotificationCategory(n.type, n.deeplink) === key;

  const groups = useMemo(
    () => groupWriterNotifications(items.filter((n) => matches(n, filter))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, filter],
  );

  const openOne = (n: WriterNotification) => {
    if (!n.read) markRead.mutate(n.id);
    if (n.deeplink) navigate(n.deeplink);
  };

  return (
    <WriterPageFrame
      title="إشعاراتي"
      description="قرارات المراجعة وردود الإدارة والملفات الجديدة والاجتماعات."
      titleTestId="text-writer-notifications-title"
      actions={
        unread > 0 ? (
          <button
            type="button"
            onClick={() => markAll.mutate()}
            className="h-11 rounded-full bg-card px-5 text-[15px] shadow-[inset_0_0_0_1px_#DCE4EC] dark:shadow-none"
            data-testid="button-writer-read-all"
          >
            تعليم الكل كمقروء
          </button>
        ) : null
      }
    >
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {WRITER_NOTIFICATION_FILTERS.map((f) => {
          const count = items.filter((n) => matches(n, f.key)).length;
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "h-9 shrink-0 rounded-full px-4 text-sm",
                active ? "bg-[#1E9BE6] font-semibold text-white" : "bg-card text-foreground shadow-[inset_0_0_0_1px_#DCE4EC] dark:shadow-none",
              )}
              data-testid={`filter-notifications-${f.key}`}
            >
              {f.label} {count}
            </button>
          );
        })}
      </div>

      <WriterSurface className="overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#1E9BE6]" /></div>
        ) : groups.length === 0 ? (
          <p className="px-6 py-12 text-center text-[15px] text-[#617183]">
            {filter === "all" ? "لا إشعارات بعد." : "لا إشعارات هنا."}
          </p>
        ) : (
          groups.map((g) => (
            <section key={g.day}>
              <h2 className="border-b border-[#EEF2F6] bg-[#FAFCFE] px-5 pb-1.5 pt-3.5 text-[13px] font-semibold text-[#617183] dark:border-border dark:bg-muted/30 sm:px-6">
                {g.day}
              </h2>
              <div className="divide-y divide-[#EEF2F6] dark:divide-border">
                {g.items.map((n) => <WriterNotificationRow key={n.id} n={n} onOpen={openOne} />)}
              </div>
            </section>
          ))
        )}
      </WriterSurface>
      <p className="text-xs text-[#617183]">تُعرض آخر 100 إشعار.</p>
    </WriterPageFrame>
  );
}
