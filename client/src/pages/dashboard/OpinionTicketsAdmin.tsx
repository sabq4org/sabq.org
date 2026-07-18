import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
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
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
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
import { authorKindMeta, type TicketAuthorKind } from "@/components/opinion-tickets/authorKindMeta";
import { apiUrl } from "@/lib/queryClient";

interface AdminTicketRow {
  id: string;
  writerId: string;
  writerName: string | null;
  writerEmail: string | null;
  authorKind?: TicketAuthorKind;
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
  writers: Array<{
    id: string;
    name: string | null;
    email: string | null;
    authorKind?: TicketAuthorKind;
  }>;
}

function formatDate(date: string) {
  try {
    return new Date(date).toLocaleString("ar-SA-u-ca-gregory-nu-latn", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
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
  cardClassName: string;
}

function StatCard({ label, value, icon: Icon, iconColor, iconBg, cardClassName }: StatCardProps) {
  return (
    <Card className={cn("rounded-2xl shadow-sm", cardClassName)}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={cn("rounded-lg p-2", iconBg)}>
            <Icon className={cn("h-5 w-5", iconColor)} />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold tabular-nums">{value.toLocaleString("en-US")}</p>
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
      <DashboardPageShell
        maxWidthClassName="max-w-[1600px]"
        contentClassName="px-4 pb-10 sm:px-6"
      >
        <DashboardPageHeader
          icon={MessageSquare}
          title="استفسارات المراسلين والكتّاب"
          description="صندوق واحد لاستفسارات المراسلين وكتّاب الرأي والزوايا"
          titleTestId="text-page-title"
        />

        {/* Stats */}
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="rounded-2xl border-sky-200/55 shadow-sm dark:border-sky-900/35">
                <CardContent className="p-4">
                  <Skeleton className="mb-2 h-4 w-20" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard
              label="إجمالي الاستفسارات"
              value={stats.total}
              icon={Inbox}
              iconColor="text-sky-700 dark:text-sky-300"
              iconBg="bg-sky-100/80 dark:bg-sky-950/40"
              cardClassName="border-sky-200/55 bg-gradient-to-br from-sky-50/50 via-card to-card dark:border-sky-900/35 dark:from-sky-950/15"
            />
            <StatCard
              label="مفتوحة"
              value={stats.open}
              icon={Clock}
              iconColor="text-amber-800 dark:text-amber-200"
              iconBg="bg-amber-100/80 dark:bg-amber-950/40"
              cardClassName="border-amber-200/55 bg-gradient-to-br from-amber-50/50 via-card to-card dark:border-amber-900/35 dark:from-amber-950/15"
            />
            <StatCard
              label="تمت الإجابة"
              value={stats.answered}
              icon={CheckCircle}
              iconColor="text-emerald-800 dark:text-emerald-200"
              iconBg="bg-emerald-100/80 dark:bg-emerald-950/40"
              cardClassName="border-emerald-200/55 bg-gradient-to-br from-emerald-50/50 via-card to-card dark:border-emerald-900/35 dark:from-emerald-950/15"
            />
            <StatCard
              label="مغلقة"
              value={stats.closed}
              icon={Lock}
              iconColor="text-rose-700 dark:text-rose-300"
              iconBg="bg-rose-100/80 dark:bg-rose-950/40"
              cardClassName="border-rose-200/55 bg-gradient-to-br from-rose-50/45 via-card to-card dark:border-rose-900/35 dark:from-rose-950/15"
            />
          </div>
        )}

        {/* Filters */}
        <Card className="rounded-2xl border-sky-200/55 bg-gradient-to-br from-sky-50/40 via-card to-card shadow-sm dark:border-sky-900/35 dark:from-sky-950/15">
          <CardContent className="p-4">
            <div className="grid gap-3 md:grid-cols-[1fr_200px_220px]">
              <div className="relative">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="بحث في العنوان أو اسم المراسل/الكاتب..."
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
                  <SelectValue placeholder="الجميع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع المراسلين والكتّاب</SelectItem>
                  {writers.map((w) => {
                    const kind = authorKindMeta(w.authorKind);
                    return (
                      <SelectItem key={w.id} value={w.id}>
                        {kind.shortLabel}: {w.name || w.email || w.id}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* List */}
        <Card className="rounded-2xl border-sky-200/55 bg-gradient-to-br from-sky-50/40 via-card to-card shadow-sm dark:border-sky-900/35 dark:from-sky-950/15">
          <CardContent className="p-4 sm:p-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">قائمة الاستفسارات</h2>
              <p className="text-xs tabular-nums text-muted-foreground">
                {isLoading ? "جاري التحميل..." : `${filtered.length.toLocaleString("en-US")} استفسار`}
              </p>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-lg" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-lg border bg-muted/20 py-12 text-center">
                <Inbox className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
                <p className="text-muted-foreground">لا توجد استفسارات مطابقة</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-sky-100/80 bg-card shadow-sm dark:border-sky-900/30">
                {filtered.map((t, idx) => {
                  const meta = STATUS_META[t.status] ?? STATUS_META.open;
                  const kind = authorKindMeta(t.authorKind);
                  const KindIcon = kind.icon;
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
                        "flex cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/50",
                        idx !== filtered.length - 1 && "border-b border-border/70",
                        t.hasUnread && "bg-amber-50/70 dark:bg-amber-500/10"
                      )}
                      data-testid={`row-admin-ticket-${t.id}`}
                    >
                      <div
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                          kind.className,
                        )}
                        title={kind.label}
                        aria-label={kind.label}
                      >
                        <KindIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="line-clamp-1 text-sm font-semibold text-foreground">{t.title}</h3>
                          {t.hasUnread && (
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full bg-amber-600 ring-2 ring-background"
                              aria-label="جديد"
                            />
                          )}
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-xs tabular-nums text-muted-foreground">
                          <span className="font-medium text-foreground/70">{kind.label}</span>
                          <span className="mx-1">·</span>
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
          </CardContent>
        </Card>
      </DashboardPageShell>
    </DashboardLayout>
  );
}
