import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  DollarSign, 
  TrendingUp, 
  CreditCard, 
  AlertTriangle, 
  CheckCircle,
  Clock,
  XCircle,
  Download,
  RefreshCw,
  BarChart3,
  Bell,
  FileText,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  RotateCcw,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface KPIsData {
  today: { revenueHalalas: number; revenueSAR: string };
  thisMonth: { revenueHalalas: number; revenueSAR: string; growth: string };
  lastMonth: { revenueHalalas: number; revenueSAR: string };
  lifetime: { revenueHalalas: number; revenueSAR: string };
  metrics: { successRate: string; totalPayments: number; successfulPayments: number };
}

interface SummaryData {
  period: { start: string; end: string; days: number };
  article: { total: number; successful: number; failed: number; pending: number; revenueSAR: string };
  advertiser: { total: number; successful: number; failed: number; pending: number; revenueSAR: string };
  combined: { 
    totalPayments: number; 
    totalSuccessful: number; 
    totalFailed: number;
    totalPending: number;
    totalRevenueSAR: string; 
    successRate: string;
    dailyAverageSAR: string;
  };
}

interface TrendData {
  date: string;
  totalRevenueSAR: string;
  articleRevenueSAR: string;
  advertiserRevenueSAR: string;
}

interface Transaction {
  id: string;
  paymentType: string;
  chargeId: string;
  amountSAR: string;
  status: string;
  createdAt: string;
}

interface Alert {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  isRead: boolean;
  isResolved: boolean;
  createdAt: string;
}

export default function PaymentsDashboard() {
  const { toast } = useToast();
  const [period, setPeriod] = useState("month");
  const [transactionType, setTransactionType] = useState("all");
  const [transactionStatus, setTransactionStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { data: kpis, isLoading: kpisLoading, refetch: refetchKPIs } = useQuery<{ success: boolean; data: KPIsData }>({
    queryKey: ["/api/admin/payments/kpis"],
  });

  const { data: summary, isLoading: summaryLoading } = useQuery<{ success: boolean; data: SummaryData }>({
    queryKey: ["/api/admin/payments/summary", period],
  });

  const { data: trends } = useQuery<{ success: boolean; data: { trends: TrendData[] } }>({
    queryKey: ["/api/admin/payments/trends", { days: period === "week" ? "7" : period === "month" ? "30" : "90" }],
  });

  const { data: transactions, isLoading: transactionsLoading, refetch: refetchTransactions } = useQuery<{ success: boolean; data: { transactions: Transaction[] } }>({
    queryKey: ["/api/admin/payments/transactions", transactionType, transactionStatus],
  });

  const { data: failedPayments, refetch: refetchFailed } = useQuery<{ success: boolean; data: { transactions: Transaction[]; count: number } }>({
    queryKey: ["/api/admin/payments/failed"],
  });

  const { data: alerts, refetch: refetchAlerts } = useQuery<{ success: boolean; data: { alerts: Alert[]; unreadCount: number } }>({
    queryKey: ["/api/admin/payments/alerts"],
  });

  const markAlertReadMutation = useMutation({
    mutationFn: async (alertId: string) => {
      return apiRequest(`/api/admin/payments/alerts/${alertId}/read`, { method: "POST" });
    },
    onSuccess: () => {
      refetchAlerts();
    },
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const end = endDate || new Date().toISOString().split("T")[0];
      window.open(`/api/admin/payments/export?startDate=${start}&endDate=${end}&format=csv&type=${transactionType}`, "_blank");
    },
  });

  const handleRefresh = () => {
    refetchKPIs();
    refetchTransactions();
    refetchFailed();
    refetchAlerts();
    toast({
      title: "تم التحديث",
      description: "تم تحديث البيانات بنجاح",
    });
  };

  const getStatusBadge = (status: string, isMobile = false) => {
    const suffix = isMobile ? "-mobile" : "";
    switch (status) {
      case "completed":
        return (
          <Badge
            variant="outline"
            className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
            data-testid={`badge-status-${status}${suffix}`}
          >
            <CheckCircle className="w-3 h-3 ml-1" /> مكتمل
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="secondary" data-testid={`badge-status-${status}${suffix}`}>
            <Clock className="w-3 h-3 ml-1" /> معلق
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" data-testid={`badge-status-${status}${suffix}`}>
            <XCircle className="w-3 h-3 ml-1" /> فاشل
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" data-testid={`badge-status-${status}${suffix}`}>
            {status}
          </Badge>
        );
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "critical":
        return <Badge variant="destructive" data-testid={`badge-severity-${severity}`}>حرج</Badge>;
      case "high":
        return <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-300" data-testid={`badge-severity-${severity}`}>مرتفع</Badge>;
      case "medium":
        return <Badge variant="secondary" data-testid={`badge-severity-${severity}`}>متوسط</Badge>;
      default:
        return <Badge variant="outline" data-testid={`badge-severity-${severity}`}>منخفض</Badge>;
    }
  };

  const kpisData = kpis?.data;
  const summaryData = summary?.data;
  const trendsData = Array.isArray(trends?.data?.trends) ? trends.data.trends : [];
  const transactionsData = Array.isArray(transactions?.data?.transactions) ? transactions.data.transactions : [];
  const failedData = Array.isArray(failedPayments?.data?.transactions) ? failedPayments.data.transactions : [];
  const alertsData = Array.isArray(alerts?.data?.alerts) ? alerts.data.alerts : [];
  const unreadAlerts = alerts?.data?.unreadCount || 0;

  const filteredTransactions = useMemo(() => {
    if (!Array.isArray(transactionsData)) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return transactionsData;
    return transactionsData.filter((tx) => {
      const chargeMatch = (tx.chargeId || "").toLowerCase().includes(q);
      const amountMatch = (tx.amountSAR || "").toLowerCase().includes(q);
      const idMatch = (tx.id || "").toLowerCase().includes(q);
      return chargeMatch || amountMatch || idMatch;
    });
  }, [transactionsData, searchQuery]);

  const txStatusCounts = useMemo(() => {
    const list = Array.isArray(transactionsData) ? transactionsData : [];
    return {
      all: list.length,
      completed: list.filter((tx) => tx.status === "completed").length,
      pending: list.filter((tx) => tx.status === "pending").length,
      failed: list.filter((tx) => tx.status === "failed").length,
    };
  }, [transactionsData]);

  const hasTransactionFilters =
    searchQuery.trim() !== "" ||
    transactionType !== "all" ||
    transactionStatus !== "all" ||
    startDate !== "" ||
    endDate !== "";

  const handleResetTransactionFilters = () => {
    setSearchQuery("");
    setTransactionType("all");
    setTransactionStatus("all");
    setStartDate("");
    setEndDate("");
  };

  const recentTrends = Array.isArray(trendsData) ? trendsData.slice(-10) : [];

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 pb-10 sm:px-6" dir="rtl">
        <DashboardPageHeader
          icon={DollarSign}
          titleTestId="text-page-title"
          title={
            <span className="flex flex-wrap items-center gap-2">
              <span>لوحة تحكم المدفوعات</span>
              <Badge
                variant="secondary"
                className="gap-1 border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-medium tabular-nums text-primary"
                data-testid="badge-total-payments"
              >
                {(kpisData?.metrics?.totalPayments || 0).toLocaleString("en-US")} عملية
              </Badge>
            </span>
          }
          description="مراقبة وتحليل جميع المدفوعات والإيرادات ومعاملات المقالات والمعلنين"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="h-9 w-[150px] rounded-xl border-border/60 bg-background text-xs sm:text-sm" data-testid="select-period">
                  <SelectValue placeholder="اختر الفترة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">اليوم</SelectItem>
                  <SelectItem value="week">آخر 7 أيام</SelectItem>
                  <SelectItem value="month">هذا الشهر</SelectItem>
                  <SelectItem value="year">هذا العام</SelectItem>
                </SelectContent>
              </Select>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRefresh}
                data-testid="button-refresh"
              >
                <RefreshCw className="w-4 h-4 ml-2" />
                تحديث
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => exportMutation.mutate()}
                disabled={exportMutation.isPending}
                data-testid="button-export"
              >
                <Download className="w-4 h-4 ml-2" />
                تصدير
              </Button>
            </div>
          }
        />

        {/* 4-Card KPI Summary Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="rounded-xl border-border/60 bg-card shadow-none" data-testid="card-today-revenue">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">إيرادات اليوم</p>
                  <div className="mt-1.5 text-2xl font-bold tabular-nums text-foreground" data-testid="text-today-revenue">
                    {kpisLoading ? "..." : `${kpisData?.today?.revenueSAR || "0.00"} ر.س`}
                  </div>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <DollarSign className="w-5 h-5" />
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                التحصيل الفوري خلال اليوم
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-border/60 bg-card shadow-none" data-testid="card-month-revenue">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">إيرادات الشهر</p>
                  <div className="mt-1.5 text-2xl font-bold tabular-nums text-foreground" data-testid="text-month-revenue">
                    {kpisLoading ? "..." : `${kpisData?.thisMonth?.revenueSAR || "0.00"} ر.س`}
                  </div>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                  <BarChart3 className="w-5 h-5" />
                </div>
              </div>
              {kpisData?.thisMonth?.growth ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-3 tabular-nums">
                  {parseFloat(kpisData.thisMonth.growth) >= 0 ? (
                    <>
                      <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="font-medium text-emerald-600 dark:text-emerald-400">+{kpisData.thisMonth.growth}%</span>
                    </>
                  ) : (
                    <>
                      <ArrowDownRight className="w-3.5 h-3.5 text-red-500" />
                      <span className="font-medium text-red-600 dark:text-red-400">{kpisData.thisMonth.growth}%</span>
                    </>
                  )}
                  <span>مقارنة بالشهر الماضي</span>
                </p>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">إجمالي تحصيل الشهر الجاري</p>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-xl border-border/60 bg-card shadow-none" data-testid="card-success-rate">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">نسبة النجاح</p>
                  <div className="mt-1.5 text-2xl font-bold tabular-nums text-foreground" data-testid="text-success-rate">
                    {kpisLoading ? "..." : `${kpisData?.metrics?.successRate || "0"}%`}
                  </div>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
                  <CheckCircle className="w-5 h-5" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3 tabular-nums">
                {(kpisData?.metrics?.successfulPayments || 0).toLocaleString("en-US")} من {(kpisData?.metrics?.totalPayments || 0).toLocaleString("en-US")} عملية
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-border/60 bg-card shadow-none" data-testid="card-lifetime-revenue">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">إجمالي الإيرادات</p>
                  <div className="mt-1.5 text-2xl font-bold tabular-nums text-foreground" data-testid="text-lifetime-revenue">
                    {kpisLoading ? "..." : `${kpisData?.lifetime?.revenueSAR || "0.00"} ر.س`}
                  </div>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <TrendingUp className="w-5 h-5" />
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                العائد التراكمي للمنصة
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="overview" className="space-y-4" dir="rtl">
          <TabsList className="flex-row-reverse max-w-full overflow-x-auto justify-start">
            <TabsTrigger value="overview" data-testid="tab-overview">نظرة عامة</TabsTrigger>
            <TabsTrigger value="transactions" data-testid="tab-transactions">المعاملات</TabsTrigger>
            <TabsTrigger value="failed" className="relative" data-testid="tab-failed">
              المعلقة والفاشلة
              {failedData.length > 0 && (
                <span className="mr-1.5 bg-red-500 text-white text-[11px] tabular-nums rounded-full px-1.5 py-0.5 inline-flex items-center justify-center">
                  {failedData.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="alerts" className="relative" data-testid="tab-alerts">
              التنبيهات
              {unreadAlerts > 0 && (
                <span className="mr-1.5 bg-red-500 text-white text-[11px] tabular-nums rounded-full px-1.5 py-0.5 inline-flex items-center justify-center">
                  {unreadAlerts}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="rounded-xl border-border/60 bg-card shadow-none" data-testid="card-article-summary">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <FileText className="w-4 h-4" />
                    </span>
                    مدفوعات المقالات
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {summaryLoading ? (
                    <div className="animate-pulse space-y-2">
                      <div className="h-4 bg-muted rounded w-3/4"></div>
                      <div className="h-4 bg-muted rounded w-1/2"></div>
                    </div>
                  ) : (
                    <>
                      <div className="text-2xl sm:text-3xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400" data-testid="text-article-revenue">
                        {summaryData?.article?.revenueSAR || "0.00"} ر.س
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="rounded-xl bg-muted/40 p-2.5">
                          <div className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{summaryData?.article?.successful || 0}</div>
                          <div className="text-xs text-muted-foreground">ناجحة</div>
                        </div>
                        <div className="rounded-xl bg-muted/40 p-2.5">
                          <div className="text-lg font-bold tabular-nums text-amber-600 dark:text-amber-400">{summaryData?.article?.pending || 0}</div>
                          <div className="text-xs text-muted-foreground">معلقة</div>
                        </div>
                        <div className="rounded-xl bg-muted/40 p-2.5">
                          <div className="text-lg font-bold tabular-nums text-red-600 dark:text-red-400">{summaryData?.article?.failed || 0}</div>
                          <div className="text-xs text-muted-foreground">فاشلة</div>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-xl border-border/60 bg-card shadow-none" data-testid="card-advertiser-summary">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                      <CreditCard className="w-4 h-4" />
                    </span>
                    مدفوعات المعلنين
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {summaryLoading ? (
                    <div className="animate-pulse space-y-2">
                      <div className="h-4 bg-muted rounded w-3/4"></div>
                      <div className="h-4 bg-muted rounded w-1/2"></div>
                    </div>
                  ) : (
                    <>
                      <div className="text-2xl sm:text-3xl font-bold tabular-nums text-sky-600 dark:text-sky-400" data-testid="text-advertiser-revenue">
                        {summaryData?.advertiser?.revenueSAR || "0.00"} ر.س
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="rounded-xl bg-muted/40 p-2.5">
                          <div className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{summaryData?.advertiser?.successful || 0}</div>
                          <div className="text-xs text-muted-foreground">ناجحة</div>
                        </div>
                        <div className="rounded-xl bg-muted/40 p-2.5">
                          <div className="text-lg font-bold tabular-nums text-amber-600 dark:text-amber-400">{summaryData?.advertiser?.pending || 0}</div>
                          <div className="text-xs text-muted-foreground">معلقة</div>
                        </div>
                        <div className="rounded-xl bg-muted/40 p-2.5">
                          <div className="text-lg font-bold tabular-nums text-red-600 dark:text-red-400">{summaryData?.advertiser?.failed || 0}</div>
                          <div className="text-xs text-muted-foreground">فاشلة</div>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-xl border-border/60 bg-card shadow-none" data-testid="card-trends">
              <CardHeader className="pb-3">
                <CardTitle className="text-base sm:text-lg">اتجاه الإيرادات</CardTitle>
                <CardDescription>الإيرادات اليومية خلال الفترة المحددة</CardDescription>
              </CardHeader>
              <CardContent>
                {recentTrends.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    لا توجد بيانات للعرض
                  </div>
                ) : (
                  <>
                    {/* Desktop Table View */}
                    <div className="hidden md:block overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-right">التاريخ</TableHead>
                            <TableHead className="text-right">إيرادات المقالات</TableHead>
                            <TableHead className="text-right">إيرادات الإعلانات</TableHead>
                            <TableHead className="text-right">الإجمالي اليومي</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {recentTrends.map((trend, index) => (
                            <TableRow key={index} data-testid={`trend-row-${index}`}>
                              <TableCell className="font-medium tabular-nums">
                                {new Date(trend.date).toLocaleDateString("ar-SA-u-ca-gregory")}
                              </TableCell>
                              <TableCell className="tabular-nums text-emerald-600 dark:text-emerald-400">
                                {trend.articleRevenueSAR} ر.س
                              </TableCell>
                              <TableCell className="tabular-nums text-sky-600 dark:text-sky-400">
                                {trend.advertiserRevenueSAR} ر.س
                              </TableCell>
                              <TableCell className="font-bold tabular-nums">
                                {trend.totalRevenueSAR} ر.س
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Mobile Stacked Cards View */}
                    <div className="space-y-2.5 md:hidden">
                      {recentTrends.map((trend, index) => (
                        <div
                          key={index}
                          className="rounded-xl border border-border/60 bg-muted/30 p-3.5 space-y-2"
                          data-testid={`trend-row-${index}-mobile`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium tabular-nums">
                              {new Date(trend.date).toLocaleDateString("ar-SA-u-ca-gregory")}
                            </span>
                            <span className="font-bold tabular-nums text-foreground">
                              {trend.totalRevenueSAR} ر.س
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1 border-t border-border/40">
                            <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">
                              مقالات: {trend.articleRevenueSAR} ر.س
                            </span>
                            <span className="text-sky-600 dark:text-sky-400 tabular-nums">
                              إعلانات: {trend.advertiserRevenueSAR} ر.س
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transactions" className="space-y-4">
            {/* Search & Quick Filter Toolbar */}
            <Card className="rounded-xl border-border/60 bg-card shadow-none">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Filter className="w-4 h-4 text-primary" />
                    تصفية وبحث المعاملات
                  </CardTitle>
                  {hasTransactionFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleResetTransactionFilters}
                      className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                      data-testid="button-reset-transaction-filters"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      إعادة تعيين
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Quick status filter pills with count badges */}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={transactionStatus === "all" ? "default" : "outline"}
                    className="h-8 rounded-xl gap-1.5 text-xs"
                    onClick={() => setTransactionStatus("all")}
                    data-testid="pill-tx-all"
                  >
                    <span>الكل</span>
                    <Badge variant="secondary" className="px-1.5 py-0 text-[11px] tabular-nums">
                      {txStatusCounts.all}
                    </Badge>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={transactionStatus === "completed" ? "default" : "outline"}
                    className="h-8 rounded-xl gap-1.5 text-xs"
                    onClick={() => setTransactionStatus("completed")}
                    data-testid="pill-tx-completed"
                  >
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                    <span>مكتمل</span>
                    <Badge variant="secondary" className="px-1.5 py-0 text-[11px] tabular-nums">
                      {txStatusCounts.completed}
                    </Badge>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={transactionStatus === "pending" ? "default" : "outline"}
                    className="h-8 rounded-xl gap-1.5 text-xs"
                    onClick={() => setTransactionStatus("pending")}
                    data-testid="pill-tx-pending"
                  >
                    <Clock className="h-3.5 w-3.5 text-amber-500" />
                    <span>معلق</span>
                    <Badge variant="secondary" className="px-1.5 py-0 text-[11px] tabular-nums">
                      {txStatusCounts.pending}
                    </Badge>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={transactionStatus === "failed" ? "default" : "outline"}
                    className="h-8 rounded-xl gap-1.5 text-xs"
                    onClick={() => setTransactionStatus("failed")}
                    data-testid="pill-tx-failed"
                  >
                    <XCircle className="h-3.5 w-3.5 text-red-500" />
                    <span>فاشل</span>
                    <Badge variant="secondary" className="px-1.5 py-0 text-[11px] tabular-nums">
                      {txStatusCounts.failed}
                    </Badge>
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                  <div className="relative lg:col-span-2">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="بحث برقم العملية أو المبلغ..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pr-10 rounded-xl border-border/60"
                      data-testid="input-search-transactions"
                    />
                  </div>

                  <Select value={transactionType} onValueChange={setTransactionType}>
                    <SelectTrigger className="rounded-xl border-border/60" data-testid="select-transaction-type">
                      <SelectValue placeholder="النوع" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">الكل</SelectItem>
                      <SelectItem value="article">مقالات</SelectItem>
                      <SelectItem value="advertiser">معلنين</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={transactionStatus} onValueChange={setTransactionStatus}>
                    <SelectTrigger className="rounded-xl border-border/60" data-testid="select-transaction-status">
                      <SelectValue placeholder="الحالة" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">الكل</SelectItem>
                      <SelectItem value="completed">مكتمل</SelectItem>
                      <SelectItem value="pending">معلق</SelectItem>
                      <SelectItem value="failed">فاشل</SelectItem>
                    </SelectContent>
                  </Select>

                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="rounded-xl border-border/60"
                    data-testid="input-start-date"
                  />

                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="rounded-xl border-border/60 flex-1"
                      data-testid="input-end-date"
                    />
                    <Button variant="outline" className="rounded-xl shrink-0" onClick={() => refetchTransactions()} data-testid="button-filter">
                      تطبيق
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-xl border-border/60 bg-card shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-base sm:text-lg">
                  <span>قائمة المعاملات</span>
                  <Badge variant="outline" className="font-normal tabular-nums text-muted-foreground">
                    {filteredTransactions.length} معاملة
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {transactionsLoading ? (
                  <div className="animate-pulse space-y-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="h-12 bg-muted rounded-xl"></div>
                    ))}
                  </div>
                ) : filteredTransactions.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    لا توجد معاملات
                  </div>
                ) : (
                  <>
                    {/* Desktop Table View */}
                    <div className="hidden md:block overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-right">النوع</TableHead>
                            <TableHead className="text-right">رقم العملية</TableHead>
                            <TableHead className="text-right">المبلغ</TableHead>
                            <TableHead className="text-right">الحالة</TableHead>
                            <TableHead className="text-right">التاريخ</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredTransactions.map((tx) => (
                            <TableRow key={tx.id} data-testid={`transaction-row-${tx.id}`}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {tx.paymentType === "article" ? (
                                    <>
                                      <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                      <span>مقالات</span>
                                    </>
                                  ) : (
                                    <>
                                      <CreditCard className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                                      <span>معلنين</span>
                                    </>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {tx.chargeId ? `#${tx.chargeId.slice(0, 12)}...` : "-"}
                              </TableCell>
                              <TableCell className="font-bold tabular-nums">
                                {tx.amountSAR} ر.س
                              </TableCell>
                              <TableCell>{getStatusBadge(tx.status, false)}</TableCell>
                              <TableCell className="text-xs text-muted-foreground tabular-nums">
                                {new Date(tx.createdAt).toLocaleDateString("ar-SA-u-ca-gregory")}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Mobile Stacked Cards View */}
                    <div className="space-y-3 md:hidden">
                      {filteredTransactions.map((tx) => (
                        <div
                          key={tx.id}
                          className="rounded-xl border border-border/60 bg-card p-3.5 space-y-2.5"
                          data-testid={`transaction-row-${tx.id}-mobile`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                                {tx.paymentType === "article" ? (
                                  <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                ) : (
                                  <CreditCard className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                                )}
                              </span>
                              <div className="min-w-0">
                                <div className="font-bold tabular-nums text-foreground">
                                  {tx.amountSAR} ر.س
                                </div>
                                <div className="text-xs text-muted-foreground font-mono truncate">
                                  {tx.chargeId ? `#${tx.chargeId.slice(0, 12)}...` : "-"}
                                </div>
                              </div>
                            </div>
                            {getStatusBadge(tx.status, true)}
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/50">
                            <span>{tx.paymentType === "article" ? "مدفوعات مقالات" : "مدفوعات معلنين"}</span>
                            <span className="tabular-nums">
                              {new Date(tx.createdAt).toLocaleDateString("ar-SA-u-ca-gregory")}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="failed" className="space-y-4">
            <Card className="rounded-xl border-border/60 bg-card shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  المدفوعات المعلقة والفاشلة
                </CardTitle>
                <CardDescription>
                  آخر 7 أيام - <span className="tabular-nums font-medium">{failedData.length}</span> عملية تحتاج متابعة
                </CardDescription>
              </CardHeader>
              <CardContent>
                {failedData.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-2" />
                    <p className="text-muted-foreground">لا توجد مدفوعات فاشلة أو معلقة</p>
                  </div>
                ) : (
                  <>
                    {/* Desktop Table View */}
                    <div className="hidden md:block overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-right">النوع</TableHead>
                            <TableHead className="text-right">رقم العملية</TableHead>
                            <TableHead className="text-right">المبلغ</TableHead>
                            <TableHead className="text-right">الحالة</TableHead>
                            <TableHead className="text-right">التاريخ</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {failedData.map((tx) => (
                            <TableRow key={tx.id} data-testid={`failed-row-${tx.id}`}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {tx.paymentType === "article" ? (
                                    <>
                                      <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                      <span>مقالات</span>
                                    </>
                                  ) : (
                                    <>
                                      <CreditCard className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                                      <span>معلنين</span>
                                    </>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {tx.chargeId ? `#${tx.chargeId.slice(0, 12)}...` : "-"}
                              </TableCell>
                              <TableCell className="font-bold tabular-nums">
                                {tx.amountSAR} ر.س
                              </TableCell>
                              <TableCell>{getStatusBadge(tx.status, false)}</TableCell>
                              <TableCell className="text-xs text-muted-foreground tabular-nums">
                                {new Date(tx.createdAt).toLocaleDateString("ar-SA-u-ca-gregory")}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Mobile Stacked Cards View */}
                    <div className="space-y-3 md:hidden">
                      {failedData.map((tx) => (
                        <div
                          key={tx.id}
                          className="rounded-xl border border-amber-200/80 bg-amber-50/50 dark:bg-muted/40 dark:border-border p-3.5 space-y-2.5"
                          data-testid={`failed-row-${tx.id}-mobile`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background/80">
                                {tx.paymentType === "article" ? (
                                  <FileText className="w-4 h-4" />
                                ) : (
                                  <CreditCard className="w-4 h-4" />
                                )}
                              </span>
                              <div className="min-w-0">
                                <div className="font-bold tabular-nums text-foreground">
                                  {tx.amountSAR} ر.س
                                </div>
                                <div className="text-xs text-muted-foreground font-mono truncate">
                                  {tx.chargeId ? `#${tx.chargeId.slice(0, 12)}...` : "-"}
                                </div>
                              </div>
                            </div>
                            {getStatusBadge(tx.status, true)}
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/50">
                            <span>{tx.paymentType === "article" ? "مدفوعات مقالات" : "مدفوعات معلنين"}</span>
                            <span className="tabular-nums">
                              {new Date(tx.createdAt).toLocaleDateString("ar-SA-u-ca-gregory")}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="alerts" className="space-y-4">
            <Card className="rounded-xl border-border/60 bg-card shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Bell className="w-5 h-5 text-primary" />
                  تنبيهات المدفوعات
                </CardTitle>
                <CardDescription>
                  {unreadAlerts > 0 ? `${unreadAlerts} تنبيه غير مقروء` : "لا توجد تنبيهات جديدة"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  {alertsData.length === 0 ? (
                    <div className="text-center py-8">
                      <Bell className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                      <p className="text-muted-foreground">لا توجد تنبيهات</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {alertsData.map((alert) => (
                        <div 
                          key={alert.id} 
                          className={`p-4 rounded-xl border ${!alert.isRead ? "bg-sky-50/60 dark:bg-sky-950/20 border-sky-200/70 dark:border-sky-900/50" : "border-border/60"}`}
                          data-testid={`alert-row-${alert.id}`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                {getSeverityBadge(alert.severity)}
                                <span className="font-medium break-words">{alert.title}</span>
                              </div>
                              <p className="text-sm text-muted-foreground break-words">{alert.message}</p>
                              <p className="text-xs text-muted-foreground mt-2 tabular-nums">
                                {new Date(alert.createdAt).toLocaleString("ar-SA-u-ca-gregory")}
                              </p>
                            </div>
                            {!alert.isRead && (
                              <Button 
                                size="sm" 
                                variant="ghost"
                                className="self-start shrink-0"
                                onClick={() => markAlertReadMutation.mutate(alert.id)}
                                data-testid={`button-mark-read-${alert.id}`}
                              >
                                تحديد كمقروء
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
