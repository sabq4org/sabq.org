import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Mail, MessageSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/lib/queryClient";

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
  iconBoxClass: string;
  urgent?: boolean;
  testId: string;
}

function TabCard({
  title,
  subtitle,
  href,
  count,
  isLoading,
  icon: Icon,
  iconBoxClass,
  urgent,
  testId,
}: TabCardProps) {
  const hasNew = !isLoading && count > 0;

  return (
    <Link href={href}>
      <a
        className="group relative block rounded-xl border border-border/70 bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-muted/20 hover:shadow-md"
        data-testid={testId}
      >
        <Card className="border-0 bg-transparent shadow-none">
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
                    iconBoxClass,
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-foreground">{title}</h3>
                    {isLoading ? (
                      <Skeleton className="h-5 w-10 rounded-full" />
                    ) : hasNew ? (
                      <Badge
                        variant="outline"
                        className={cn(
                          "h-5 min-w-[22px] justify-center px-2 text-[11px] font-semibold tabular-nums",
                          urgent
                            ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                            : "border-primary/25 bg-primary/10 text-primary",
                        )}
                        data-testid={`${testId}-badge`}
                      >
                        {count} جديد
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="h-5 px-2 text-[10px] text-muted-foreground">
                        مكتمل ✓
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                    {hasNew ? subtitle : "جميع الرسائل تمت معالجتها"}
                  </p>
                </div>
              </div>
              <ArrowLeft className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:-translate-x-1 group-hover:text-primary" />
            </div>
          </CardContent>
        </Card>
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

  const writerQuery = useQuery<OpinionTicketsUnreadResponse>({
    queryKey: ["/api/opinion-tickets/unread-count"],
    enabled: showWriterTickets,
    refetchInterval: 60_000,
  });

  const visitorCount =
    visitorQuery.data?.total ??
    visitorQuery.data?.messages?.filter((m) => m.status === "pending").length ??
    0;
  const writerCount = writerQuery.data?.unreadCount ?? 0;

  if (!showVisitorMessages && !showWriterTickets) return null;

  return (
    <div
      className={cn(
        "grid gap-3",
        showVisitorMessages && showWriterTickets ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1",
      )}
      data-testid="messages-tabs"
    >
      {showVisitorMessages && (
        <TabCard
          title="صندوق رسائل الزوار"
          subtitle={visitorCount > 0 ? `${visitorCount} رسالة واردة بانتظار المراجعة والرد` : ""}
          href="/dashboard/contact-messages"
          count={visitorCount}
          isLoading={visitorQuery.isLoading}
          icon={Mail}
          iconBoxClass="bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400"
          testId="tab-visitor-messages"
        />
      )}
      {showWriterTickets && (
        <TabCard
          title="تذاكر ورسائل الكتّاب"
          subtitle={writerCount > 0 ? `${writerCount} استفسار وتذكرة جديدة من كتّاب الرأي` : ""}
          href="/dashboard/opinion-tickets"
          count={writerCount}
          isLoading={writerQuery.isLoading}
          icon={MessageSquare}
          iconBoxClass="bg-violet-500/10 border-violet-500/20 text-violet-600 dark:text-violet-400"
          urgent
          testId="tab-writer-tickets"
        />
      )}
    </div>
  );
}
