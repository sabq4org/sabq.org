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
      size="sm"
      onClick={() => navigate("/dashboard/opinion-author/tickets")}
      data-testid="button-my-tickets"
      className={cn("relative gap-2", className)}
    >
      <MessageSquare className="h-4 w-4 text-primary" />
      استفساراتي
      {unreadTickets > 0 && (
        <>
          <Badge className="ms-1 h-5 min-w-[20px] justify-center bg-primary px-1.5 text-[10px] text-primary-foreground hover:bg-primary">
            {unreadTickets}
          </Badge>
          <span
            aria-hidden
            className="absolute -top-0.5 -end-0.5 h-2 w-2 animate-pulse rounded-full bg-primary ring-2 ring-background"
          />
        </>
      )}
    </Button>
  );
}
