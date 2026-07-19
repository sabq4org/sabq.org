import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ChevronLeft, Mail, MessageSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/lib/queryClient";

/**
 * Two compact inbox rows on the admin dashboard:
 *   - رسائل الزوار → /dashboard/contact-messages   (pending count)
 *   - رسائل الكتاب → /dashboard/opinion-tickets    (unread count)
 *
 * Theme tokens only — no sky/amber washes that fight the org dashboard theme.
 */

interface ContactMessagesResponse {
  messages: Array<{ status: string }>;
  total?: number;
}

interface OpinionTicketsUnreadResponse {
  unreadCount: number;
}

interface TabCardProps {
  title: string;
  subtitle: string;
  href: string;
  count: number;
  isLoading: boolean;
  icon: React.ComponentType<{ className?: string }>;
  urgent?: boolean;
  testId: string;
}

function TabCard({ title, subtitle, href, count, isLoading, icon: Icon, urgent, testId }: TabCardProps) {
  const hasNew = !isLoading && count > 0;

  return (
    <Link href={href}>
      <a
        className="group relative block rounded-xl border border-border/70 bg-card shadow-none transition-colors hover:border-border hover:bg-muted/20"
        data-testid={testId}
      >
        <Card className="border-0 bg-transparent shadow-none">
          <CardContent className="p-2.5 sm:p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold">{title}</h3>
                  {isLoading ? (
                    <Skeleton className="h-5 w-10 rounded-full" />
                  ) : hasNew ? (
                    <Badge
                      className={cn(
                        "h-5 min-w-[20px] justify-center border px-1.5 text-[10px]",
                        urgent
                          ? "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/10"
                          : "border-primary/25 bg-primary/10 text-primary hover:bg-primary/10",
                      )}
                      data-testid={`${testId}-badge`}
                    >
                      {count}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                  {hasNew ? subtitle : "لا توجد جديدة"}
                </p>
              </div>
              <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-[-2px]" />
            </div>
          </CardContent>
        </Card>
        {hasNew && (
          <span
            aria-hidden
            className={cn(
              "absolute -top-1 -end-1 h-2.5 w-2.5 animate-pulse rounded-full ring-2 ring-background",
              urgent ? "bg-destructive" : "bg-primary",
            )}
          />
        )}
      </a>
    </Link>
  );
}

interface MessagesTabsProps {
  showVisitorMessages?: boolean;
  showWriterTickets?: boolean;
}

export function MessagesTabs({
  showVisitorMessages = true,
  showWriterTickets = true,
}: MessagesTabsProps) {
  // Visitor messages — use the filtered endpoint total, not the first page
  // length. The old implementation capped the dashboard badge at 20 and
  // disagreed with the full inbox count.
  const visitorQuery = useQuery<ContactMessagesResponse>({
    queryKey: ["/api/admin/contact-messages", "tabs-pending"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/admin/contact-messages?status=pending&limit=20"), {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load contact messages");
      return res.json();
    },
    enabled: showVisitorMessages,
    refetchInterval: 60_000,
  });

  // Writer tickets — admin-side unread count from the dedicated endpoint
  const writerQuery = useQuery<OpinionTicketsUnreadResponse>({
    queryKey: ["/api/opinion-tickets/unread-count"],
    enabled: showWriterTickets,
    refetchInterval: 60_000,
  });

  const visitorCount = visitorQuery.data?.total ?? visitorQuery.data?.messages?.filter((m) => m.status === "pending").length ?? 0;
  const writerCount = writerQuery.data?.unreadCount ?? 0;

  if (!showVisitorMessages && !showWriterTickets) return null;

  return (
    <div
      className={cn(
        "grid gap-2 sm:gap-3",
        showVisitorMessages && showWriterTickets ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1",
      )}
      data-testid="messages-tabs"
    >
      {showVisitorMessages && (
        <TabCard
          title="رسائل الزوار"
          subtitle={visitorCount > 0 ? `${visitorCount} رسالة بانتظار الرد` : ""}
          href="/dashboard/contact-messages"
          count={visitorCount}
          isLoading={visitorQuery.isLoading}
          icon={Mail}
          testId="tab-visitor-messages"
        />
      )}
      {showWriterTickets && (
        <TabCard
          title="رسائل الكتّاب"
          subtitle={writerCount > 0 ? `${writerCount} استفسار جديد` : ""}
          href="/dashboard/opinion-tickets"
          count={writerCount}
          isLoading={writerQuery.isLoading}
          icon={MessageSquare}
          urgent
          testId="tab-writer-tickets"
        />
      )}
    </div>
  );
}
