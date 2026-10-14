import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { format, formatDistanceToNowStrict } from "date-fns";
import { ar } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  FileSearch,
  Link2,
  ListChecks,
  RefreshCcw,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Users,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import ActivityLogDrawer from "@/components/ActivityLogDrawer";
import ActivityLogsInsights, { type ActivityLogsAnalytics } from "@/components/ActivityLogsInsights";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useToast } from "@/hooks/use-toast";
import {
  getActionPresentation,
  getEntityTypeLabel,
  resolveActivityActor,
  extractLogSummary,
} from "@/lib/activityUtils";
import { apiUrl, queryClient } from "@/lib/queryClient";

interface ActivityLog {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  metadata: { ip?: string; userAgent?: string; reason?: string; bot?: string; channel?: string } | null;
  createdAt: string;
  user?: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
  } | null;
  entityInfo?: {
    title: string | null;
    subtitle?: string | null;
    url?: string | null;
    status?: string | null;
  } | null;
}

interface LogsPayload {
  logs: ActivityLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const PAGE_SIZE = 30;
const columnHelper = createColumnHelper<ActivityLog>();

function toLatinDigits(value: string) {
  return value
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}

async function fetchJson<T>(path: string, forbiddenMessage: string): Promise<T> {
  const response = await fetch(apiUrl(path), { credentials: "include" });
  if (!response.ok) {
    if (response.status === 403) throw new Error(forbiddenMessage);
    throw new Error("تعذر تحميل بيانات سجل التدقيق");
  }
  return response.json();
}

export default function ActivityLogsPage() {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [entityTypeFilter, setEntityTypeFilter] = useState("all");
  const [actorTypeFilter, setActorTypeFilter] = useState<"all" | "human" | "ai" | "system">("all");
  const [dateRange, setDateRange] = useState<DateRange>();
  const [analyticsDays, setAnalyticsDays] = useState(30);
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const logsPath = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (searchQuery) params.set("searchQuery", searchQuery);
    if (actionFilter !== "all") params.set("action", actionFilter);
    if (entityTypeFilter !== "all") params.set("entityType", entityTypeFilter);
    if (actorTypeFilter !== "all") params.set("actorType", actorTypeFilter);
    if (dateRange?.from) params.set("dateFrom", dateRange.from.toISOString());
    if (dateRange?.to) {
      const end = new Date(dateRange.to);
      end.setHours(23, 59, 59, 999);
      params.set("dateTo", end.toISOString());
    }
    return `/api/admin/activity-logs?${params.toString()}`;
  }, [page, searchQuery, actionFilter, entityTypeFilter, actorTypeFilter, dateRange]);

  const {
    data: logsData,
    isLoading: logsLoading,
    isFetching: logsFetching,
    error: logsError,
  } = useQuery<LogsPayload>({
    queryKey: [logsPath],
    queryFn: () => fetchJson(logsPath, "ليس لديك صلاحية لعرض سجل التدقيق"),
    retry: false,
  });

  const analyticsPath = `/api/admin/activity-logs/analytics?days=${analyticsDays}`;
  const {
    data: analytics,
    isLoading: analyticsLoading,
    isFetching: analyticsFetching,
    error: analyticsError,
  } = useQuery<ActivityLogsAnalytics>({
    queryKey: [analyticsPath],
    queryFn: async () => {
      const payload = await fetchJson<ActivityLogsAnalytics>(
        analyticsPath,
        "ليس لديك صلاحية لعرض مؤشرات سجل التدقيق"
      );
      if (!payload?.summary) {
        throw new Error("إصدار خدمة المؤشرات لا يطابق الواجهة الحالية");
      }
      return payload;
    },
    retry: false,
  });

  const logs = Array.isArray(logsData?.logs) ? logsData.logs : [];
  const totalPages = Math.max(logsData?.totalPages || 1, 1);
  const activeFilterCount = [
    searchQuery,
    actionFilter !== "all",
    entityTypeFilter !== "all",
    actorTypeFilter !== "all",
    Boolean(dateRange?.from),
  ].filter(Boolean).length;

  const copyId = (e: React.MouseEvent, id: string, label = "معرّف السجل") => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    toast({
      title: "تم النسخ",
      description: `تم نسخ ${label} بنجاح`,
    });
  };

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "user",
        header: "المنفّذ",
        cell: ({ row }) => {
          const actor = resolveActivityActor(row.original);
          return (
            <div className="flex items-center gap-3 min-w-[200px]">
              {actor.kind === "user" ? (
                <Avatar className="h-9 w-9 shrink-0 border border-border/60">
                  <AvatarImage src={actor.profileImageUrl || undefined} />
                  <AvatarFallback className="text-xs font-bold">{actor.initials}</AvatarFallback>
                </Avatar>
              ) : actor.kind === "ai_system" ? (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
                  <Sparkles className="h-4 w-4" />
                </span>
              ) : actor.kind === "shortlink_system" ? (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300">
                  <Link2 className="h-4 w-4" />
                </span>
              ) : actor.kind === "bot_system" ? (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                  <Bot className="h-4 w-4" />
                </span>
              ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <Bot className="h-4 w-4" />
                </span>
              )}

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="max-w-44 truncate text-sm font-semibold text-foreground">{actor.name}</p>
                  {actor.badge && (
                    <span
                      className={`inline-flex items-center rounded-md border px-1.5 py-0 text-[10px] font-medium leading-4 ${actor.badge.tone}`}
                    >
                      {actor.badge.label}
                    </span>
                  )}
                </div>
                <p
                  className="max-w-48 truncate text-xs text-muted-foreground mt-0.5"
                  dir={actor.kind === "user" ? "ltr" : "rtl"}
                >
                  {actor.subtitle}
                </p>
              </div>
            </div>
          );
        },
      }),
      columnHelper.accessor("action", {
        header: "العملية",
        cell: ({ row }) => {
          const presentation = getActionPresentation(row.original.action, row.original.entityType);
          const Icon = presentation.icon;
          return (
            <Badge
              variant="outline"
              className={`gap-1.5 rounded-lg py-1 px-2.5 font-medium whitespace-nowrap border-border/70 ${presentation.bgColor}`}
            >
              <Icon className={`h-3.5 w-3.5 shrink-0 ${presentation.textColor}`} />
              <span>{presentation.label}</span>
            </Badge>
          );
        },
      }),
      columnHelper.display({
        id: "entityDetails",
        header: "الكيان والتفاصيل",
        cell: ({ row }) => {
          const log = row.original;
          const summary = extractLogSummary(log);
          const entityLabel = getEntityTypeLabel(log.entityType);

          return (
            <div className="min-w-[260px] max-w-[460px] space-y-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="inline-flex items-center rounded-md bg-muted/70 border border-border/60 px-1.5 py-0.5 text-[11px] font-semibold text-foreground/85">
                  {entityLabel}
                </span>
                {summary.statusLabel && (
                  <span className="inline-flex items-center rounded-md bg-sky-500/10 border border-sky-500/20 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300">
                    {summary.statusLabel}
                  </span>
                )}
                {summary.title ? (
                  <span
                    className="text-sm font-bold text-foreground truncate max-w-[330px]"
                    title={summary.title}
                  >
                    {summary.title}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">سجل {entityLabel}</span>
                )}
              </div>
              {summary.detail && summary.detail !== summary.title && (
                <p
                  className="text-xs text-muted-foreground truncate max-w-[440px]"
                  title={summary.detail}
                >
                  {summary.detail}
                </p>
              )}
            </div>
          );
        },
      }),
      columnHelper.accessor("entityId", {
        header: "معرّف السجل",
        cell: ({ row }) => {
          const value = row.original.entityId;
          const summary = extractLogSummary(row.original);
          return (
            <div className="flex items-center gap-1">
              <code
                className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground border border-border/50"
                dir="ltr"
                title={value}
              >
                {value.length > 13 ? `${value.slice(0, 10)}…` : value}
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={(e) => copyId(e, value)}
                title="نسخ المعرّف"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
              {summary.url && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-sky-600 hover:text-sky-700 dark:text-sky-400"
                  asChild
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  title="فتح الرابط"
                >
                  <a href={summary.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
              )}
            </div>
          );
        },
      }),
      columnHelper.accessor("createdAt", {
        header: "التوقيت",
        cell: ({ getValue }) => {
          const date = new Date(getValue());
          return (
            <div className="whitespace-nowrap">
              <p className="text-sm font-medium">
                {toLatinDigits(formatDistanceToNowStrict(date, { addSuffix: true, locale: ar }))}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                {toLatinDigits(format(date, "d MMM yyyy، HH:mm", { locale: ar }))}
              </p>
            </div>
          );
        },
      }),
    ],
    []
  );

  const table = useReactTable({
    data: logs,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: totalPages,
  });

  function resetFilters() {
    setSearchInput("");
    setSearchQuery("");
    setActionFilter("all");
    setEntityTypeFilter("all");
    setActorTypeFilter("all");
    setDateRange(undefined);
    setPage(1);
  }

  function refreshData() {
    queryClient.invalidateQueries({ queryKey: [logsPath] });
    queryClient.invalidateQueries({ queryKey: [analyticsPath] });
  }

  if (logsError) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-7xl p-4 sm:p-6" dir="rtl" data-testid="activity-logs-page">
          <Card className="mt-12 rounded-2xl border-destructive/30">
            <CardContent className="flex flex-col items-center py-14 text-center">
              <ShieldCheck className="mb-4 h-10 w-10 text-destructive" />
              <h1 className="text-xl font-bold">تعذر فتح سجل التدقيق</h1>
              <p className="mt-2 text-sm text-muted-foreground">{logsError.message}</p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="relative min-h-full overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(27,173,248,0.07),_transparent_55%),radial-gradient(ellipse_at_bottom_left,_rgba(16,185,129,0.045),_transparent_45%),linear-gradient(180deg,_rgba(240,249,255,0.55)_0%,_transparent_26%)] dark:bg-[radial-gradient(ellipse_at_top,_rgba(27,173,248,0.1),_transparent_50%),radial-gradient(ellipse_at_bottom_left,_rgba(16,185,129,0.05),_transparent_45%),linear-gradient(180deg,_rgba(8,47,73,0.22)_0%,_transparent_28%)]"
        />
        <main
          className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6 lg:p-8"
          dir="rtl"
          data-testid="activity-logs-page"
        >
          <header className="relative overflow-hidden rounded-2xl border border-sky-200/60 bg-gradient-to-l from-sky-50/80 via-background to-emerald-50/40 p-5 shadow-sm dark:border-sky-900/40 dark:from-sky-950/30 dark:via-background dark:to-emerald-950/20 sm:p-6">
            <div
              aria-hidden
              className="pointer-events-none absolute -left-16 -top-20 h-44 w-44 rounded-full bg-[#1BADF8]/10 blur-3xl dark:bg-[#1BADF8]/15"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-16 -right-10 h-40 w-40 rounded-full bg-emerald-400/10 blur-3xl"
            />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="rounded-xl bg-[#1BADF8]/15 p-2.5 text-[#078fd1] dark:text-[#45c0f5]">
                  <ListChecks className="h-5 w-5 sm:h-6 sm:w-6" />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-bold tracking-tight">سجل التدقيق والنشاط</h1>
                    <Badge
                      variant="outline"
                      className="hidden rounded-md border-sky-200/80 bg-background/70 text-[11px] font-normal text-sky-800 dark:border-sky-900/40 dark:text-sky-200 sm:inline-flex"
                    >
                      رقابة النظام الدقيقة
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    تتبّع دقيق للعمليات التحريرية، مهام الذكاء الاصطناعي، والعمليات الآلية مع تفاصيل الكيانات المتأثرة
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                {analytics?.summary?.lastActivityAt && (
                  <span className="hidden rounded-lg border border-sky-200/60 bg-background/60 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm dark:border-sky-900/40 lg:inline">
                    آخر نشاط{" "}
                    {toLatinDigits(
                      formatDistanceToNowStrict(new Date(analytics.summary.lastActivityAt), {
                        addSuffix: true,
                        locale: ar,
                      })
                    )}
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refreshData}
                  disabled={logsFetching || analyticsFetching}
                  className="rounded-lg border-sky-200/80 bg-background/70 dark:border-sky-900/40"
                >
                  <RefreshCcw
                    className={`ml-2 h-4 w-4 ${logsFetching || analyticsFetching ? "animate-spin" : ""}`}
                  />
                  تحديث البيانات
                </Button>
              </div>
            </div>
          </header>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200/45 bg-gradient-to-l from-sky-50/45 to-transparent p-4 dark:border-sky-900/30 dark:from-sky-950/15 md:px-5">
            <div>
              <h2 className="text-lg font-bold">مؤشرات الرقابة</h2>
              <p className="text-sm text-muted-foreground">كل مؤشر مرتبط بفترة واضحة وقابل للمقارنة</p>
            </div>
            <Select value={String(analyticsDays)} onValueChange={(value) => setAnalyticsDays(Number(value))}>
              <SelectTrigger
                className="w-44 rounded-xl border-sky-200/70 bg-background/80 dark:border-sky-900/40"
                data-testid="select-analytics-period"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">آخر 7 أيام</SelectItem>
                <SelectItem value="30">آخر 30 يوماً</SelectItem>
                <SelectItem value="90">آخر 90 يوماً</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {analyticsError ? (
            <Card className="rounded-2xl border-amber-300/70 bg-amber-50/70 dark:border-amber-900/40 dark:bg-amber-950/10">
              <CardContent className="py-4 text-sm text-amber-800 dark:text-amber-200">
                تعذر تحميل المؤشرات حالياً، بينما يظل سجل العمليات متاحاً أدناه.
              </CardContent>
            </Card>
          ) : (
            <ActivityLogsInsights analytics={analytics} isLoading={analyticsLoading} />
          )}

          <Card
            className="rounded-2xl border-sky-200/55 bg-gradient-to-br from-sky-50/40 via-card to-card shadow-sm dark:border-sky-900/35 dark:from-sky-950/15"
            data-testid="filters-card"
          >
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-[#078fd1] dark:text-[#45c0f5]" />
                  <span className="text-sm font-semibold">بحث وتصفية السجل</span>
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary" className="rounded-full tabular-nums">
                      {activeFilterCount}
                    </Badge>
                  )}
                </div>

                {/* شريط تصفية سريع لنوع المنفّذ */}
                <div className="flex flex-wrap items-center gap-1.5" data-testid="actor-type-filter">
                  {(
                    [
                      { key: "all", label: "كل السجلات", icon: ListChecks },
                      { key: "human", label: "عمليات الفريق اليدوية", icon: Users },
                      { key: "ai", label: "الذكاء الاصطناعي", icon: Sparkles },
                      { key: "system", label: "النظام الآلي", icon: Bot },
                    ] as const
                  ).map((item) => {
                    const Icon = item.icon;
                    const active = actorTypeFilter === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => {
                          setActorTypeFilter(item.key);
                          setPage(1);
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                          active
                            ? "border-[#1BADF8] bg-[#1BADF8]/15 text-[#078fd1] dark:text-[#45c0f5]"
                            : "border-border/70 bg-background/70 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}

                  {activeFilterCount > 0 && (
                    <Button variant="ghost" size="sm" onClick={resetFilters} className="h-7 text-xs">
                      <RotateCcw className="ml-1 h-3.5 w-3.5" />
                      مسح الفلاتر
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_200px_200px_270px]">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="ابحث بعنوان المقال، اسم المنفّذ، البريد، الرمز المختصر، أو المعرّف…"
                    className="rounded-xl border-sky-100/80 bg-background/70 pr-10 dark:border-sky-900/30"
                    data-testid="input-search"
                  />
                </div>

                <Select
                  value={actionFilter}
                  onValueChange={(value) => {
                    setActionFilter(value);
                    setPage(1);
                  }}
                >
                  <SelectTrigger
                    className="rounded-xl border-sky-100/80 bg-background/70 dark:border-sky-900/30"
                    data-testid="select-action-filter"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل العمليات</SelectItem>
                    <SelectItem value="create">إنشاء وإضافة</SelectItem>
                    <SelectItem value="update">تحديث وتعديل</SelectItem>
                    <SelectItem value="publish">نشر واعتماد نشر</SelectItem>
                    <SelectItem value="ai">كل عمليات الذكاء الاصطناعي</SelectItem>
                    <SelectItem value="auto_categorize_article">تصنيف ذكي تلقائي</SelectItem>
                    <SelectItem value="generate_seo_metadata">توليد بيانات SEO ذكية</SelectItem>
                    <SelectItem value="archive">أرشفة</SelectItem>
                    <SelectItem value="schedule">جدولة نشر</SelectItem>
                    <SelectItem value="delete">حذف</SelectItem>
                    <SelectItem value="approve">اعتماد</SelectItem>
                    <SelectItem value="reject">رفض</SelectItem>
                    <SelectItem value="login">تسجيل دخول</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={entityTypeFilter}
                  onValueChange={(value) => {
                    setEntityTypeFilter(value);
                    setPage(1);
                  }}
                >
                  <SelectTrigger
                    className="rounded-xl border-sky-100/80 bg-background/70 dark:border-sky-900/30"
                    data-testid="select-entity-filter"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل النطاقات</SelectItem>
                    <SelectItem value="article">المقالات والأخبار</SelectItem>
                    <SelectItem value="short_link">الروابط المختصرة</SelectItem>
                    <SelectItem value="category">التصنيفات</SelectItem>
                    <SelectItem value="user">المستخدمون</SelectItem>
                    <SelectItem value="role">الأدوار والصلاحيات</SelectItem>
                    <SelectItem value="smart_block">البلوكات الذكية</SelectItem>
                    <SelectItem value="publisher">الناشرون والوكالات</SelectItem>
                    <SelectItem value="ifox">آيفوكس (iFox)</SelectItem>
                    <SelectItem value="comment">التعليقات</SelectItem>
                    <SelectItem value="tag">الوسوم</SelectItem>
                    <SelectItem value="internal_announcement">التعميمات الداخلية</SelectItem>
                    <SelectItem value="settings">الإعدادات</SelectItem>
                    <SelectItem value="campaign">الحملات الإعلانية</SelectItem>
                  </SelectContent>
                </Select>

                <DatePickerWithRange
                  date={dateRange}
                  onDateChange={(value) => {
                    setDateRange(value);
                    setPage(1);
                  }}
                  placeholder="كل الفترات"
                  className="[&_button]:w-full [&_button]:rounded-xl [&_button]:border-sky-100/80 [&_button]:bg-background/70 dark:[&_button]:border-sky-900/30"
                />
              </div>
            </CardContent>
          </Card>

          <Card
            className="overflow-hidden rounded-2xl border-slate-200/70 bg-card shadow-sm dark:border-slate-800/60"
            data-testid="logs-table-card"
          >
            <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-sky-100/70 bg-sky-50/35 px-5 py-4 dark:border-sky-900/30 dark:bg-sky-950/15">
              <div>
                <CardTitle className="text-base">تسلسل العمليات</CardTitle>
                <CardDescription className="mt-1">
                  {logsData ? (
                    <span className="tabular-nums">
                      {`${(logsData.total || 0).toLocaleString("en-US")} عملية مطابقة`}
                    </span>
                  ) : (
                    "جاري حساب السجلات…"
                  )}
                </CardDescription>
              </div>
              {logsFetching && !logsLoading && (
                <RefreshCcw className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </CardHeader>
            <CardContent className="p-0">
              {logsLoading ? (
                <div className="space-y-2 p-5" data-testid="table-loading">
                  {[1, 2, 3, 4, 5, 6].map((item) => (
                    <Skeleton key={item} className="h-14 rounded-xl" />
                  ))}
                </div>
              ) : logs.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-center" data-testid="empty-state">
                  <span className="mb-4 rounded-2xl border border-sky-200/60 bg-sky-50/50 p-4 dark:border-sky-900/40 dark:bg-sky-950/20">
                    <FileSearch className="h-7 w-7 text-sky-600 dark:text-sky-300" />
                  </span>
                  <p className="font-semibold">لا توجد عمليات مطابقة</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    جرّب توسيع الفترة أو إزالة بعض الفلاتر
                  </p>
                  {activeFilterCount > 0 && (
                    <Button variant="outline" size="sm" onClick={resetFilters} className="mt-4">
                      مسح الفلاتر
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  {/* جدول الديسكتوب */}
                  <div className="hidden md:block overflow-x-auto">
                    <Table data-testid="logs-table">
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          {table.getHeaderGroups().map((group) =>
                            group.headers.map((header) => (
                              <TableHead
                                key={header.id}
                                className="h-11 whitespace-nowrap text-right text-xs font-semibold text-muted-foreground"
                              >
                                {flexRender(header.column.columnDef.header, header.getContext())}
                              </TableHead>
                            ))
                          )}
                          <TableHead className="w-10" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {table.getRowModel().rows.map((row) => (
                          <TableRow
                            key={row.original.id}
                            onClick={() => {
                              setSelectedLog(row.original);
                              setDrawerOpen(true);
                            }}
                            className="cursor-pointer transition-colors hover:bg-sky-50/40 dark:hover:bg-sky-950/20"
                            data-testid={`log-row-${row.original.id}`}
                          >
                            {row.getVisibleCells().map((cell) => (
                              <TableCell key={cell.id} className="py-3">
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                              </TableCell>
                            ))}
                            <TableCell>
                              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* بطاقات الجوال */}
                  <div className="divide-y divide-border/60 md:hidden">
                    {logs.map((log) => {
                      const actor = resolveActivityActor(log);
                      const presentation = getActionPresentation(log.action, log.entityType);
                      const Icon = presentation.icon;
                      const summary = extractLogSummary(log);
                      const date = new Date(log.createdAt);

                      return (
                        <div
                          key={log.id}
                          onClick={() => {
                            setSelectedLog(log);
                            setDrawerOpen(true);
                          }}
                          className="p-3.5 space-y-2 cursor-pointer transition-colors hover:bg-sky-50/40 dark:hover:bg-sky-950/20"
                          data-testid={`log-card-mobile-${log.id}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Badge
                                variant="outline"
                                className={`gap-1 rounded-lg py-0.5 px-2 text-xs font-medium shrink-0 ${presentation.bgColor}`}
                              >
                                <Icon className={`h-3 w-3 ${presentation.textColor}`} />
                                <span>{presentation.label}</span>
                              </Badge>
                              <span className="text-xs font-semibold text-muted-foreground shrink-0">
                                · {getEntityTypeLabel(log.entityType)}
                              </span>
                            </div>
                            <span className="text-[11px] text-muted-foreground whitespace-nowrap tabular-nums">
                              {toLatinDigits(formatDistanceToNowStrict(date, { addSuffix: true, locale: ar }))}
                            </span>
                          </div>

                          {(summary.title || summary.detail) && (
                            <div className="space-y-0.5">
                              {summary.title && (
                                <p className="text-xs font-bold text-foreground line-clamp-2">
                                  {summary.title}
                                </p>
                              )}
                              {summary.detail && summary.detail !== summary.title && (
                                <p className="text-[11px] text-muted-foreground line-clamp-1">
                                  {summary.detail}
                                </p>
                              )}
                            </div>
                          )}

                          <div className="flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-medium text-foreground truncate">{actor.name}</span>
                              {actor.badge && (
                                <span
                                  className={`inline-flex items-center rounded border px-1.5 py-0 text-[10px] ${actor.badge.tone}`}
                                >
                                  {actor.badge.label}
                                </span>
                              )}
                            </div>
                            <code className="rounded bg-muted px-1.5 py-0.5 text-[10px]" dir="ltr">
                              {log.entityId.length > 10 ? `${log.entityId.slice(0, 8)}…` : log.entityId}
                            </code>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-col items-center justify-between gap-3 border-t border-sky-100/60 px-5 py-4 dark:border-sky-900/30 sm:flex-row">
                    <p className="text-xs text-muted-foreground">
                      صفحة <strong className="tabular-nums text-foreground">{page.toLocaleString("en-US")}</strong> من{" "}
                      <strong className="tabular-nums text-foreground">{totalPages.toLocaleString("en-US")}</strong>
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((value) => Math.max(1, value - 1))}
                        disabled={page <= 1}
                        className="rounded-lg"
                      >
                        <ChevronRight className="ml-1 h-4 w-4" />
                        السابق
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                        disabled={page >= totalPages}
                        className="rounded-lg"
                      >
                        التالي
                        <ChevronLeft className="mr-1 h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <ActivityLogDrawer log={selectedLog} open={drawerOpen} onOpenChange={setDrawerOpen} />
        </main>
      </div>
    </DashboardLayout>
  );
}
