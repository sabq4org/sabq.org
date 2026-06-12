import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type WriterInquiriesButtonProps = {
  className?: string;
};

/** زر استفساراتي المشترك لكتّاب الرأي وكتّاب الزوايا — يفتح نفس صفحة التذاكر */
export function WriterInquiriesButton({ className }: WriterInquiriesButtonProps) {
  const [, navigate] = useLocation();

  const { data: ticketsUnread } = useQuery<{ unreadCount: number }>({
    queryKey: ["/api/opinion-tickets/unread-count"],
    refetchInterval: 60_000,
  });
  const unreadTickets = ticketsUnread?.unreadCount ?? 0;

  return (
    <Button
      variant="outline"
      onClick={() => navigate("/dashboard/opinion-author/tickets")}
      data-testid="button-my-tickets"
      className={cn(
        "gap-2 relative bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-900 dark:bg-card dark:hover:bg-muted/60 dark:border-border dark:text-amber-100",
        className,
      )}
    >
      <MessageSquare className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      استفساراتي
      {unreadTickets > 0 && (
        <>
          <Badge className="ms-1 bg-amber-500 hover:bg-amber-500 text-white text-[10px] px-1.5 h-5 min-w-[20px] justify-center">
            {unreadTickets}
          </Badge>
          <span
            aria-hidden
            className="absolute -top-0.5 -end-0.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-background animate-pulse"
          />
        </>
      )}
    </Button>
  );
}
