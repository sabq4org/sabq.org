import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { format, formatDistanceToNowStrict } from "date-fns";
import { ar } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import {
  ChevronLeft,
  ChevronRight,
  FileSearch,
  ListChecks,
  RefreshCcw,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
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
import { getActionPresentation, getEntityTypeLabel } from "@/lib/activityUtils";
import { apiUrl, queryClient } from "@/lib/queryClient";

interface ActivityLog {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  metadata: { ip?: string; userAgent?: string; reason?: string } | null;
  createdAt: string;
  user?: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
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

async function fetchJson<T>(path: string, forbiddenMessage: string): Promise<T> {
  const response = await fetch(apiUrl(path), { credentials: "include" });
  if (!response.ok) {
    if (response.status === 403) throw new Error(forbiddenMessage);
    throw new Error("تعذر تحميل بيانات سجل التدقيق");
  }
  return response.json();
}

export default function ActivityLogsPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [entityTypeFilter, setEntityTypeFilter] = useState("all");
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
    if (dateRange?.from) params.set("dateFrom", dateRange.from.toISOString());
    if (dateRange?.to) {
      const end = new Date(dateRange.to);
      end.setHours(23, 59, 59, 999);
      params.set("dateTo", end.toISOString());
    }
    return `/api/admin/activity-logs?${params.toString()}`;
  }, [page, searchQuery, actionFilter, entityTypeFilter, dateRange]);

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
      const payload = await fetchJson<ActivityLogsAnalytics>(analyticsPath, "ليس لديك صلاحية لعرض مؤشرات سجل التدقيق");
      if (!payload?.summary) {
        throw new Error("إصدار خدمة المؤشرات لا يطابق الواجهة الحالية");
      }
      return payload;
    },
    retry: false,
  });

  const logs = Array.isArray(logsData?.logs) ? logsData.logs : [];
  const totalPages = Math.max(logsData?.totalPages || 1, 1);
  const activeFilterCount = [searchQuery, actionFilter !== "all", entityTypeFilter !== "all", Boolean(dateRange?.from)]
    .filter(Boolean).length;

  const columns = useMemo(() => [
    columnHelper.accessor("user", {
      id: "user",
      header: "المنفّذ",
      cell: ({ getValue }) => {
        const user = getValue();
        if (!user) {
          return (
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted"><RefreshCcw className="h-4 w-4 text-muted-foreground" /></span>
              <div><p className="text-sm font-medium">النظام</p><p className="text-xs text-muted-foreground">عملية آلية أو مستخدم محذوف</p></div>
            </div>
          );
        }
        const name = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email;
        const initials = `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}` || user.email[0];
        return (
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9"><AvatarImage src={user.profileImageUrl || undefined} /><AvatarFallback>{initials}</AvatarFallback></Avatar>
            <div className="min-w-0"><p className="max-w-48 truncate text-sm font-medium">{name}</p><p className="max-w-48 truncate text-xs text-muted-foreground" dir="ltr">{user.email}</p></div>
          </div>
        );
      },
    }),
    columnHelper.accessor("action", {
      header: "العملية",
      cell: ({ getValue }) => {
        const presentation = getActionPresentation(getValue());
        const Icon = presentation.icon;
        return <Badge variant="outline" className="gap-1.5 rounded-lg py-1"><Icon className={`h-3.5 w-3.5 ${presentation.textColor}`} />{presentation.label}</Badge>;
      },
    }),
    columnHelper.accessor("entityType", {
      header: "النطاق",
      cell: ({ getValue }) => <span className="text-sm">{getEntityTypeLabel(getValue())}</span>,
    }),
    columnHelper.accessor("entityId", {
      header: "معرّف السجل",
      cell: ({ getValue }) => {
        const value = getValue();
        return <code className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground" dir="ltr" title={value}>{value.length > 13 ? `${value.slice(0, 10)}…` : value}</code>;
      },
    }),
    columnHelper.accessor("createdAt", {
      header: "التوقيت",
      cell: ({ getValue }) => {
        const date = new Date(getValue());
        return (
          <div className="whitespace-nowrap"><p className="text-sm font-medium">{formatDistanceToNowStrict(date, { addSuffix: true, locale: ar })}</p><p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{format(date, "d MMM yyyy، HH:mm", { locale: ar })}</p></div>
        );
      },
    }),
  ], []);

  const table = useReactTable({ data: logs, columns, getCoreRowModel: getCoreRowModel(), manualPagination: true, pageCount: totalPages });

  function resetFilters() {
    setSearchInput("");
    setSearchQuery("");
    setActionFilter("all");
    setEntityTypeFilter("all");
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
          <Card className="mt-12 rounded-2xl border-destructive/30"><CardContent className="flex flex-col items-center py-14 text-center"><ShieldCheck className="mb-4 h-10 w-10 text-destructive" /><h1 className="text-xl font-bold">تعذر فتح سجل التدقيق</h1><p className="mt-2 text-sm text-muted-foreground">{logsError.message}</p></CardContent></Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <main className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6 lg:p-8" dir="rtl" data-testid="activity-logs-page">
        <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-primary/10 p-2.5 text-primary"><ListChecks className="h-6 w-6" /></span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">سجل التدقيق</h1>
                <Badge variant="outline" className="hidden rounded-md text-[11px] font-normal text-muted-foreground sm:inline-flex">رقابة النظام</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">تتبّع التغييرات والعمليات المنفذة داخل المنصة</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            {analytics?.summary?.lastActivityAt && (
              <span className="hidden text-xs text-muted-foreground lg:inline">
                آخر نشاط {formatDistanceToNowStrict(new Date(analytics.summary.lastActivityAt), { addSuffix: true, locale: ar })}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={refreshData} disabled={logsFetching || analyticsFetching} className="rounded-lg">
              <RefreshCcw className={`ml-2 h-4 w-4 ${(logsFetching || analyticsFetching) ? "animate-spin" : ""}`} />تحديث البيانات
            </Button>
          </div>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-lg font-bold">مؤشرات الرقابة</h2><p className="text-sm text-muted-foreground">كل مؤشر مرتبط بفترة واضحة وقابل للمقارنة</p></div>
          <Select value={String(analyticsDays)} onValueChange={(value) => setAnalyticsDays(Number(value))}>
            <SelectTrigger className="w-44 rounded-xl" data-testid="select-analytics-period"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="7">آخر 7 أيام</SelectItem><SelectItem value="30">آخر 30 يوماً</SelectItem><SelectItem value="90">آخر 90 يوماً</SelectItem></SelectContent>
          </Select>
        </div>

        {analyticsError ? (
          <Card className="rounded-2xl border-amber-500/30 bg-amber-500/5"><CardContent className="py-4 text-sm text-amber-700 dark:text-amber-300">تعذر تحميل المؤشرات حالياً، بينما يظل سجل العمليات متاحاً أدناه.</CardContent></Card>
        ) : <ActivityLogsInsights analytics={analytics} isLoading={analyticsLoading} />}

        <Card className="rounded-2xl border-border/70 shadow-sm" data-testid="filters-card">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-primary" /><span className="text-sm font-semibold">بحث وتصفية السجل</span>{activeFilterCount > 0 && <Badge variant="secondary" className="rounded-full">{activeFilterCount}</Badge>}</div>{activeFilterCount > 0 && <Button variant="ghost" size="sm" onClick={resetFilters} className="h-8"><RotateCcw className="ml-1.5 h-3.5 w-3.5" />مسح الفلاتر</Button>}</div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_180px_180px_270px]">
              <div className="relative"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="ابحث بالعملية أو النوع أو المعرّف…" className="rounded-xl pr-10" data-testid="input-search" /></div>
              <Select value={actionFilter} onValueChange={(value) => { setActionFilter(value); setPage(1); }}><SelectTrigger className="rounded-xl" data-testid="select-action-filter"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">كل العمليات</SelectItem><SelectItem value="create">إنشاء</SelectItem><SelectItem value="update">تحديث</SelectItem><SelectItem value="delete">حذف</SelectItem><SelectItem value="publish">نشر</SelectItem><SelectItem value="approve">اعتماد</SelectItem><SelectItem value="reject">رفض</SelectItem><SelectItem value="login">تسجيل دخول</SelectItem></SelectContent></Select>
              <Select value={entityTypeFilter} onValueChange={(value) => { setEntityTypeFilter(value); setPage(1); }}><SelectTrigger className="rounded-xl" data-testid="select-entity-filter"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">كل الأنواع</SelectItem><SelectItem value="article">المقالات</SelectItem><SelectItem value="user">المستخدمون</SelectItem><SelectItem value="category">التصنيفات</SelectItem><SelectItem value="comment">التعليقات</SelectItem><SelectItem value="role">الأدوار</SelectItem><SelectItem value="settings">الإعدادات</SelectItem><SelectItem value="campaign">الحملات</SelectItem></SelectContent></Select>
              <DatePickerWithRange date={dateRange} onDateChange={(value) => { setDateRange(value); setPage(1); }} placeholder="كل الفترات" className="[&_button]:w-full [&_button]:rounded-xl" />
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-2xl border-border/70 shadow-sm" data-testid="logs-table-card">
          <CardHeader className="flex-row items-center justify-between space-y-0 border-b bg-muted/20 px-5 py-4">
            <div><CardTitle className="text-base">تسلسل العمليات</CardTitle><CardDescription className="mt-1">{logsData ? `${(logsData.total || 0).toLocaleString("ar-SA")} عملية مطابقة` : "جاري حساب السجلات…"}</CardDescription></div>
            {logsFetching && !logsLoading && <RefreshCcw className="h-4 w-4 animate-spin text-muted-foreground" />}
          </CardHeader>
          <CardContent className="p-0">
            {logsLoading ? (
              <div className="space-y-2 p-5" data-testid="table-loading">{[1, 2, 3, 4, 5, 6].map((item) => <Skeleton key={item} className="h-14 rounded-xl" />)}</div>
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center" data-testid="empty-state"><span className="mb-4 rounded-2xl bg-muted p-4"><FileSearch className="h-7 w-7 text-muted-foreground" /></span><p className="font-semibold">لا توجد عمليات مطابقة</p><p className="mt-1 text-sm text-muted-foreground">جرّب توسيع الفترة أو إزالة بعض الفلاتر</p>{activeFilterCount > 0 && <Button variant="outline" size="sm" onClick={resetFilters} className="mt-4">مسح الفلاتر</Button>}</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table data-testid="logs-table">
                    <TableHeader><TableRow className="hover:bg-transparent">{table.getHeaderGroups().map((group) => group.headers.map((header) => <TableHead key={header.id} className="h-11 whitespace-nowrap text-right text-xs font-semibold text-muted-foreground">{flexRender(header.column.columnDef.header, header.getContext())}</TableHead>))}<TableHead className="w-10" /></TableRow></TableHeader>
                    <TableBody>{table.getRowModel().rows.map((row) => <TableRow key={row.original.id} onClick={() => { setSelectedLog(row.original); setDrawerOpen(true); }} className="cursor-pointer transition-colors hover:bg-muted/45" data-testid={`log-row-${row.original.id}`}>{row.getVisibleCells().map((cell) => <TableCell key={cell.id} className="py-3">{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}<TableCell><ChevronLeft className="h-4 w-4 text-muted-foreground" /></TableCell></TableRow>)}</TableBody>
                  </Table>
                </div>
                <div className="flex flex-col items-center justify-between gap-3 border-t px-5 py-4 sm:flex-row">
                  <p className="text-xs text-muted-foreground">صفحة <strong className="text-foreground">{page.toLocaleString("ar-SA")}</strong> من <strong className="text-foreground">{totalPages.toLocaleString("ar-SA")}</strong></p>
                  <div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1} className="rounded-lg"><ChevronRight className="ml-1 h-4 w-4" />السابق</Button><Button variant="outline" size="sm" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages} className="rounded-lg">التالي<ChevronLeft className="mr-1 h-4 w-4" /></Button></div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <ActivityLogDrawer log={selectedLog} open={drawerOpen} onOpenChange={setDrawerOpen} />
      </main>
    </DashboardLayout>
  );
}
