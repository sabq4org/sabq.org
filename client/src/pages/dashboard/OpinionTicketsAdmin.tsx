import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { Inbox, MessageSquare } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { STATUS_META, STATUS_OPTIONS, type OpinionTicketStatus } from "@/components/opinion-tickets/statusMeta";

interface AdminTicketRow {
  id: string;
  writerId: string;
  writerName: string | null;
  writerEmail: string | null;
  title: string;
  status: OpinionTicketStatus;
  lastMessageAt: string;
  createdAt: string;
  hasUnread: boolean;
}

interface ListResponse {
  tickets: AdminTicketRow[];
}

interface WritersResponse {
  writers: Array<{ id: string; name: string | null; email: string | null }>;
}

function formatDate(date: string) {
  try {
    return format(new Date(date), "d MMMM yyyy - HH:mm", { locale: ar });
  } catch {
    return date;
  }
}

export default function OpinionTicketsAdmin() {
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<OpinionTicketStatus | "all">("all");
  const [writerFilter, setWriterFilter] = useState<string>("all");

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (statusFilter !== "all") p.set("status", statusFilter);
    if (writerFilter !== "all") p.set("writerId", writerFilter);
    const qs = p.toString();
    return qs ? `?${qs}` : "";
  }, [statusFilter, writerFilter]);

  const { data, isLoading } = useQuery<ListResponse>({
    queryKey: ["/api/opinion-tickets", { status: statusFilter, writerId: writerFilter }],
    queryFn: async () => {
      const res = await fetch(`/api/opinion-tickets${queryParams}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load tickets");
      return res.json();
    },
  });

  const { data: writersData } = useQuery<WritersResponse>({
    queryKey: ["/api/opinion-tickets/writers/list"],
  });

  const tickets = Array.isArray(data?.tickets) ? data!.tickets : [];
  const writers = Array.isArray(writersData?.writers) ? writersData!.writers : [];

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4 md:p-6" dir="rtl">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            استفسارات كتّاب الرأي
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            جميع استفسارات الكتّاب مرتبة بالأحدث.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="min-w-[180px]">
            <label className="text-xs text-muted-foreground mb-1 block">الحالة</label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger data-testid="select-filter-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الحالات</SelectItem>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_META[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[220px]">
            <label className="text-xs text-muted-foreground mb-1 block">الكاتب</label>
            <Select value={writerFilter} onValueChange={setWriterFilter}>
              <SelectTrigger data-testid="select-filter-writer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الكتّاب</SelectItem>
                {writers.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name || w.email || w.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : tickets.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Inbox className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">لا توجد استفسارات مطابقة</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {tickets.map((t) => {
              const meta = STATUS_META[t.status];
              return (
                <Card
                  key={t.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/dashboard/opinion-tickets/${t.id}`)}
                  onKeyDown={(e) =>
                    (e.key === "Enter" || e.key === " ") &&
                    navigate(`/dashboard/opinion-tickets/${t.id}`)
                  }
                  className={cn(
                    "hover:bg-muted/40 transition-colors cursor-pointer",
                    t.hasUnread && "border-primary/40 bg-primary/5"
                  )}
                  data-testid={`row-admin-ticket-${t.id}`}
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <MessageSquare className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium line-clamp-1">{t.title}</h3>
                        {t.hasUnread && (
                          <Badge className="bg-primary text-primary-foreground text-[10px] px-1.5">
                            جديد
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t.writerName || t.writerEmail || t.writerId} · آخر نشاط: {formatDate(t.lastMessageAt)}
                      </p>
                    </div>
                    <Badge className={cn("shrink-0", meta.className)}>{meta.label}</Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
