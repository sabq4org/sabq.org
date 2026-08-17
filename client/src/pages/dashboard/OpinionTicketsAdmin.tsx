import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Inbox,
  MessageSquare,
  Mic,
  PenLine,
  Search,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
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
import {
  AUTHOR_KIND_META,
  authorKindMeta,
  type TicketAuthorKind,
} from "@/components/opinion-tickets/authorKindMeta";
import { SendColleagueMessageDialog } from "@/components/opinion-tickets/SendColleagueMessageDialog";
import { apiUrl } from "@/lib/queryClient";

type TicketDirection = "inbound" | "outbound";

interface AdminTicketRow {
  id: string;
  writerId: string;
  writerName: string | null;
  writerEmail: string | null;
  authorKind?: TicketAuthorKind;
  title: string;
  status: OpinionTicketStatus;
  /** واردة من المساهم | صادرة من الإدارة (أول رسالة) */
  direction?: TicketDirection;
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

type KindFilter = "all" | TicketAuthorKind;
type DirectionFilter = "all" | TicketDirection;

function formatDate(date: string) {
  try {
    return new Date(date).toLocaleString("ar-SA-u-ca-gregory-nu-latn", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return date;
  }
}

function resolveKind(kind?: string | null): TicketAuthorKind {
  if (kind && kind in AUTHOR_KIND_META) return kind as TicketAuthorKind;
  return "other";
}

export default function OpinionTicketsAdmin() {
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<OpinionTicketStatus | "all">("all");
  const [writerFilter, setWriterFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>("all");
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

  const stats = useMemo(() => {
    let open = 0;
    let answered = 0;
    let closed = 0;
    let unread = 0;
    let inbound = 0;
    let outbound = 0;
    const byKind: Record<TicketAuthorKind, number> = {
      reporter: 0,
      opinion_author: 0,
      angle_writer: 0,
      other: 0,
    };
    for (const t of tickets) {
      if (t.status === "open") open += 1;
      else if (t.status === "answered") answered += 1;
      else if (t.status === "closed") closed += 1;
      if (t.hasUnread) unread += 1;
      if ((t.direction ?? "inbound") === "outbound") outbound += 1;
      else inbound += 1;
      byKind[resolveKind(t.authorKind)] += 1;
    }
    return {
      total: tickets.length,
      open,
      answered,
      closed,
      unread,
      inbound,
      outbound,
      byKind,
    };
  }, [tickets]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) => {
      if (kindFilter !== "all" && resolveKind(t.authorKind) !== kindFilter) return false;
      const dir = t.direction ?? "inbound";
      if (directionFilter !== "all" && dir !== directionFilter) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        (t.writerName || "").toLowerCase().includes(q) ||
        (t.writerEmail || "").toLowerCase().includes(q)
      );
    });
  }, [tickets, search, kindFilter, directionFilter]);

  const writersForSelect = useMemo(() => {
    if (kindFilter === "all") return writers;
    return writers.filter((w) => resolveKind(w.authorKind) === kindFilter);
  }, [writers, kindFilter]);

  const kindTabs: Array<{ id: KindFilter; label: string; count: number; icon: typeof Mic }> = [
    { id: "all", label: "الكل", count: stats.total, icon: Inbox },
    { id: "reporter", label: "مراسلون", count: stats.byKind.reporter, icon: Mic },
    { id: "opinion_author", label: "كتّاب رأي", count: stats.byKind.opinion_author, icon: PenLine },
    { id: "angle_writer", label: "زوايا", count: stats.byKind.angle_writer, icon: PenLine },
  ];

  const statusStrip = [
    { label: "الإجمالي", value: stats.total, tone: "text-foreground" },
    { label: "مفتوحة", value: stats.open, tone: "text-amber-700 dark:text-amber-300" },
    { label: "مجابة", value: stats.answered, tone: "text-emerald-700 dark:text-emerald-300" },
    { label: "مغلقة", value: stats.closed, tone: "text-rose-700 dark:text-rose-300" },
    { label: "غير مقروء", value: stats.unread, tone: "text-primary" },
  ];

  return (
    <DashboardLayout>
      <DashboardPageShell
        maxWidthClassName="max-w-[1400px]"
        contentClassName="px-4 pb-16 sm:px-6"
      >
        <DashboardPageHeader
          icon={MessageSquare}
          title="استفسارات المساهمين"
          description="واردة من المساهمين، أو صادرة منا عبر «أرسل رسالة لزميل» — شهادات التعريف من الخطابات الرسمية فقط"
          titleTestId="text-page-title"
          actions={<SendColleagueMessageDialog />}
        />

        {/* حالة الصندوق */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {statusStrip.map((item) => (
            <div key={item.label} className="rounded-xl border bg-card px-3 py-2.5">
              <p className="text-[11px] text-muted-foreground">{item.label}</p>
              <p className={cn("mt-0.5 text-xl font-bold tabular-nums tracking-tight", item.tone)}>
                {isLoading ? "—" : item.value}
              </p>
            </div>
          ))}
        </div>

        {/* واردة / صادرة */}
        <div className="flex flex-wrap gap-1.5 rounded-xl border bg-card p-1">
          {(
            [
              { id: "all" as const, label: "كل الاتجاهات", count: stats.total, icon: Inbox },
              {
                id: "inbound" as const,
                label: "واردة",
                count: stats.inbound,
                icon: ArrowDownLeft,
              },
              {
                id: "outbound" as const,
                label: "صادرة منا",
                count: stats.outbound,
                icon: ArrowUpRight,
              },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDirectionFilter(tab.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors tabular-nums",
                  directionFilter === tab.id
                    ? "bg-muted text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                data-testid={`filter-direction-${tab.id}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                <span className="opacity-70">({isLoading ? "—" : tab.count})</span>
              </button>
            );
          })}
        </div>

        {/* توزيع الأدوار — جوهر التغيير بعد دخول المراسلين */}
        <div className="grid gap-2 sm:grid-cols-3">
          {(
            [
              {
                kind: "reporter" as const,
                hint: "استفسارات الميدان والتحرير",
                ring: "border-sky-200/70 dark:border-sky-900/40",
                fill: "from-sky-500/10",
              },
              {
                kind: "opinion_author" as const,
                hint: "كتّاب المقالات والرأي",
                ring: "border-amber-200/70 dark:border-amber-900/40",
                fill: "from-amber-500/10",
              },
              {
                kind: "angle_writer" as const,
                hint: "كتّاب الزوايا الثابتة",
                ring: "border-violet-200/70 dark:border-violet-900/40",
                fill: "from-violet-500/10",
              },
            ] as const
          ).map((card) => {
            const meta = AUTHOR_KIND_META[card.kind];
            const Icon = meta.icon;
            const count = stats.byKind[card.kind];
            const share = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
            const selected = kindFilter === card.kind;
            return (
              <button
                key={card.kind}
                type="button"
                onClick={() => setKindFilter(selected ? "all" : card.kind)}
                className={cn(
                  "rounded-2xl border bg-gradient-to-bl to-card p-3.5 text-start transition-all",
                  card.ring,
                  card.fill,
                  selected && "ring-2 ring-primary/40",
                  !selected && "hover:bg-muted/30",
                )}
                data-testid={`kind-card-${card.kind}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={cn("inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium", meta.className)}>
                    <Icon className="h-3.5 w-3.5" />
                    {meta.label}
                  </span>
                  <span className="text-2xl font-bold tabular-nums">{isLoading ? "—" : count}</span>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">{card.hint}</p>
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      card.kind === "reporter" && "bg-sky-500",
                      card.kind === "opinion_author" && "bg-amber-500",
                      card.kind === "angle_writer" && "bg-violet-500",
                    )}
                    style={{ width: `${share}%` }}
                  />
                </div>
                <p className="mt-1 text-[10px] tabular-nums text-muted-foreground">{share}٪ من الصندوق</p>
              </button>
            );
          })}
        </div>

        {/* فلاتر مضغوطة */}
        <div className="space-y-3 rounded-2xl border bg-card p-3 sm:p-4">
          <div className="flex flex-wrap gap-1.5 rounded-xl bg-muted/40 p-1">
            {kindTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setKindFilter(tab.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors tabular-nums",
                    kindFilter === tab.id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  data-testid={`filter-kind-${tab.id}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                  <span className="opacity-70">({tab.count})</span>
                </button>
              );
            })}
          </div>

          <div className="grid gap-2 md:grid-cols-[1fr_160px_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="بحث في العنوان أو الاسم..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 pr-10"
                data-testid="input-search-tickets"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as OpinionTicketStatus | "all")}>
              <SelectTrigger className="h-10" data-testid="select-filter-status">
                <SelectValue placeholder="الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_META[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={writerFilter}
              onValueChange={(value) => {
                setWriterFilter(value);
                if (value !== "all") {
                  const w = writers.find((item) => item.id === value);
                  if (w) setKindFilter(resolveKind(w.authorKind));
                }
              }}
            >
              <SelectTrigger className="h-10" data-testid="select-filter-writer">
                <SelectValue placeholder="المساهم" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المساهمين</SelectItem>
                {writersForSelect.map((w) => {
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
        </div>

        {/* القائمة */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2 px-0.5">
            <h2 className="text-sm font-semibold">قائمة الاستفسارات</h2>
            <p className="text-xs tabular-nums text-muted-foreground">
              {isLoading ? "جاري التحميل..." : `${filtered.length} نتيجة`}
            </p>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-muted/20 py-12 text-center">
              <Inbox className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">لا توجد استفسارات مطابقة</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border bg-card">
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
                      "grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40 sm:px-4",
                      idx !== filtered.length - 1 && "border-b",
                      t.hasUnread && "bg-amber-50/60 dark:bg-amber-500/10",
                    )}
                    data-testid={`row-admin-ticket-${t.id}`}
                  >
                    <div
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                        kind.className,
                      )}
                      title={kind.label}
                      aria-label={kind.label}
                    >
                      <KindIcon className="h-4 w-4" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <h3 className="line-clamp-1 text-sm font-semibold">{t.title}</h3>
                        {t.hasUnread && (
                          <span
                            className="inline-block h-2 w-2 rounded-full bg-amber-600 ring-2 ring-background"
                            aria-label="جديد"
                          />
                        )}
                        <span
                          className={cn(
                            "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                            (t.direction ?? "inbound") === "outbound"
                              ? "bg-sky-100 text-sky-900 dark:bg-sky-500/20 dark:text-sky-100"
                              : "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-100",
                          )}
                          data-testid={`badge-direction-${t.id}`}
                        >
                          {(t.direction ?? "inbound") === "outbound" ? (
                            <ArrowUpRight className="h-3 w-3" />
                          ) : (
                            <ArrowDownLeft className="h-3 w-3" />
                          )}
                          {(t.direction ?? "inbound") === "outbound" ? "صادرة" : "واردة"}
                        </span>
                        <span
                          className={cn(
                            "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                            kind.className,
                          )}
                        >
                          {kind.shortLabel}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-[11px] tabular-nums text-muted-foreground">
                        {t.writerName || t.writerEmail || t.writerId}
                        <span className="mx-1 opacity-50">·</span>
                        {formatDate(t.lastMessageAt)}
                      </p>
                    </div>

                    <span
                      className={cn(
                        "shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-medium",
                        meta.className,
                      )}
                    >
                      {meta.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </DashboardPageShell>
    </DashboardLayout>
  );
}
