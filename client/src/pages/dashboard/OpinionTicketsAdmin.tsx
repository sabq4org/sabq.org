import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import {
  CheckCircle,
  Clock,
  Inbox,
  Lock,
  MessageSquare,
  Search,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { STATUS_META, STATUS_OPTIONS, type OpinionTicketStatus } from "@/components/opinion-tickets/statusMeta";
import { apiUrl } from "@/lib/queryClient";

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

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  iconBg: string;
}

function StatCard({ label, value, icon: Icon, iconColor, iconBg }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-lg", iconBg)}>
            <Icon className={cn("h-5 w-5", iconColor)} />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">{value.toLocaleString("en-US")}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function OpinionTicketsAdmin() {
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<OpinionTicketStatus | "all">("all");
  const [writerFilter, setWriterFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

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
      const res = await fetch(apiUrl(`/api/opinion-tickets${queryParams}`), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load tickets");
      return res.json();
    },
  });

  const { data: writersData } = useQuery<WritersResponse>({
    queryKey: ["/api/opinion-tickets/writers/list"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/opinion-tickets/writers/list"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load writers");
      return res.json();
    },
  });

  const tickets = Array.isArray(data?.tickets) ? data!.tickets : [];
  const writers = Array.isArray(writersData?.writers) ? writersData!.writers : [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.writerName || "").toLowerCase().includes(q) ||
        (t.writerEmail || "").toLowerCase().includes(q)
    );
  }, [tickets, search]);

  const stats = useMemo(() => {
    const open = tickets.filter((t) => t.status === "open").length;
    const answered = tickets.filter((t) => t.status === "answered").length;
    const closed = tickets.filter((t) => t.status === "closed").length;
    return { total: tickets.length, open, answered, closed };
  }, [tickets]);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1600px] space-y-6 px-4 pb-10 sm:px-6" dir="rtl">
        <DashboardPageHeader
          icon={MessageSquare}
          title="استفسارات كتّاب الرأي"
          description="إدارة استفسارات الكتّاب والرد عليها"
          titleTestId="text-page-title"
        />

        {/* Stats */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-4 w-20 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="إجمالي الاستفسارات"
              value={stats.total}
              icon={Inbox}
              iconColor="text-primary"
              iconBg="bg-primary/10"
            />
            <StatCard
              label="مفتوحة"
              value={stats.open}
              icon={Clock}
              iconColor="text-amber-800 dark:text-amber-200"
              iconBg="bg-amber-100 dark:bg-amber-500/20"
            />
            <StatCard
              label="تمت الإجابة"
              value={stats.answered}
              icon={CheckCircle}
              iconColor="text-emerald-800 dark:text-emerald-200"
              iconBg="bg-emerald-100 dark:bg-emerald-500/20"
            />
            <StatCard
              label="مغلقة"
              value={stats.closed}
              icon={Lock}
              iconColor="text-slate-700 dark:text-slate-200"
              iconBg="bg-slate-100 dark:bg-slate-500/20"
            />
          </div>
        )}

        {/* Filters */}
        <div className="grid gap-3 md:grid-cols-[1fr_200px_220px]">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="بحث في العنوان أو اسم الكاتب..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-10"
              data-testid="input-search-tickets"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger data-testid="select-filter-status">
              <SelectValue placeholder="جميع الحالات" />
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
          <Select value={writerFilter} onValueChange={setWriterFilter}>
            <SelectTrigger data-testid="select-filter-writer">
              <SelectValue placeholder="جميع الكتّاب" />
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

        {/* List */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">قائمة الاستفسارات</h2>
            <p className="text-xs text-muted-foreground">
              {isLoading ? "جاري التحميل..." : `${filtered.length} استفسار`}
            </p>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 border rounded-lg bg-muted/20">
              <Inbox className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">لا توجد استفسارات مطابقة</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              {filtered.map((t, idx) => {
                const meta = STATUS_META[t.status] ?? STATUS_META.open;
                return (
                  <div
                    key={t.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/dashboard/opinion-tickets/${t.id}`)}
                    onKeyDown={(e) =>
                      (e.key === "Enter" || e.key === " ") &&
                      navigate(`/dashboard/opinion-tickets/${t.id}`)
                    }
                    className={cn(
                      "flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-colors hover:bg-muted/50",
                      idx !== filtered.length - 1 && "border-b border-border/70",
                      t.hasUnread && "bg-amber-50/70 dark:bg-amber-500/10"
                    )}
                    data-testid={`row-admin-ticket-${t.id}`}
                  >
                    <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center shrink-0">
                      <MessageSquare className="h-4 w-4 text-amber-800 dark:text-amber-200" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-sm text-foreground line-clamp-1">{t.title}</h3>
                        {t.hasUnread && (
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full bg-amber-600 ring-2 ring-background"
                            aria-label="جديد"
                          />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {t.writerName || t.writerEmail || t.writerId}
                        <span className="mx-1">·</span>
                        {formatDate(t.lastMessageAt)}
                      </p>
                    </div>
                    <Badge variant="outline" className={cn("shrink-0 font-medium", meta.className)}>
                      {meta.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
