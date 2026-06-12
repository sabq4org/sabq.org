import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ChevronLeft, Mail, MessageSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/lib/queryClient";

/**
 * Two prominent "inbox" tabs at the top of the admin dashboard:
 *   - رسائل الزوار → /dashboard/contact-messages   (pending count)
 *   - رسائل الكتاب → /dashboard/opinion-tickets    (unread count)
 *
 * Each renders as a soft-tinted Card with an icon, a count, and a
 * pulsing dot when there is something new — so a busy admin notices
 * them without needing to open the sidebar.
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
  tone: "cyan" | "amber";
  testId: string;
}

const TONE_STYLES: Record<TabCardProps["tone"], {
  bg: string;
  iconBg: string;
  iconColor: string;
  dot: string;
  badge: string;
}> = {
  cyan: {
    bg: "bg-cyan-50 hover:bg-cyan-100/70 border-cyan-200 dark:bg-card dark:hover:bg-accent/50 dark:border-border",
    iconBg: "bg-cyan-500/15",
    iconColor: "text-cyan-700 dark:text-cyan-300",
    dot: "bg-cyan-500",
    badge: "bg-cyan-600 hover:bg-cyan-600 text-white",
  },
  amber: {
    bg: "bg-amber-50 hover:bg-amber-100/70 border-amber-200 dark:bg-card dark:hover:bg-accent/50 dark:border-border",
    iconBg: "bg-amber-500/15",
    iconColor: "text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
    badge: "bg-amber-600 hover:bg-amber-600 text-white",
  },
};

function TabCard({ title, subtitle, href, count, isLoading, icon: Icon, tone, testId }: TabCardProps) {
  const t = TONE_STYLES[tone];
  const hasNew = !isLoading && count > 0;

  return (
    <Link href={href}>
      <a
        className={cn(
          "block group rounded-2xl border transition-colors relative",
          t.bg
        )}
        data-testid={testId}
      >
        <Card className="bg-transparent border-0 shadow-none">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={cn("p-2.5 rounded-xl shrink-0", t.iconBg)}>
                <Icon className={cn("h-5 w-5", t.iconColor)} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-sm">{title}</h3>
                  {isLoading ? (
                    <Skeleton className="h-5 w-10 rounded-full" />
                  ) : hasNew ? (
                    <Badge className={cn("text-[10px] h-5 px-1.5 min-w-[20px] justify-center", t.badge)} data-testid={`${testId}-badge`}>
                      {count}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  {hasNew ? subtitle : "لا توجد جديدة"}
                </p>
              </div>
              <ChevronLeft className="h-4 w-4 text-muted-foreground group-hover:translate-x-[-2px] transition-transform shrink-0" />
            </div>
          </CardContent>
        </Card>
        {hasNew && (
          <span
            aria-hidden
            className={cn(
              "absolute -top-1 -end-1 h-3 w-3 rounded-full ring-2 ring-background animate-pulse",
              t.dot
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
  // Visitor messages — pending count from the recent batch
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

  const visitorCount = visitorQuery.data?.messages?.filter((m) => m.status === "pending").length ?? 0;
  const writerCount = writerQuery.data?.unreadCount ?? 0;

  if (!showVisitorMessages && !showWriterTickets) return null;

  return (
    <div
      className={cn(
        "grid gap-3",
        showVisitorMessages && showWriterTickets ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"
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
          tone="cyan"
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
          tone="amber"
          testId="tab-writer-tickets"
        />
      )}
    </div>
  );
}
