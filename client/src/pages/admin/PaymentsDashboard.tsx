import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown,
  CreditCard, 
  AlertTriangle, 
  CheckCircle,
  Clock,
  XCircle,
  Download,
  RefreshCw,
  Calendar,
  BarChart3,
  Bell,
  FileText,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge variant="default" className="bg-green-600" data-testid={`badge-status-${status}`}><CheckCircle className="w-3 h-3 ml-1" /> مكتمل</Badge>;
      case "pending":
        return <Badge variant="secondary" data-testid={`badge-status-${status}`}><Clock className="w-3 h-3 ml-1" /> معلق</Badge>;
      case "failed":
        return <Badge variant="destructive" data-testid={`badge-status-${status}`}><XCircle className="w-3 h-3 ml-1" /> فاشل</Badge>;
      default:
        return <Badge variant="outline" data-testid={`badge-status-${status}`}>{status}</Badge>;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "critical":
        return <Badge variant="destructive" data-testid={`badge-severity-${severity}`}>حرج</Badge>;
      case "high":
        return <Badge variant="destructive" className="bg-orange-500" data-testid={`badge-severity-${severity}`}>مرتفع</Badge>;
      case "medium":
        return <Badge variant="secondary" data-testid={`badge-severity-${severity}`}>متوسط</Badge>;
      default:
        return <Badge variant="outline" data-testid={`badge-severity-${severity}`}>منخفض</Badge>;
    }
  };

  const kpisData = kpis?.data;
  const summaryData = summary?.data;
  const trendsData = trends?.data?.trends || [];
  const transactionsData = transactions?.data?.transactions || [];
  const failedData = failedPayments?.data?.transactions || [];
  const alertsData = alerts?.data?.alerts || [];
  const unreadAlerts = alerts?.data?.unreadCount || 0;

  return (
    <DashboardLayout>
    <div className="container mx-auto p-4 md:p-6 space-y-6" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600">
            <DollarSign className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold" data-testid="text-page-title">لوحة تحكم المدفوعات</h1>
            <p className="text-muted-foreground">مراقبة وتحليل جميع المدفوعات والإيرادات</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="hover-elevate active-elevate-2 transition-all bg-green-50 dark:bg-green-950/30" data-testid="card-today-revenue">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">إيرادات اليوم</CardTitle>
            <div className="p-2 rounded-md bg-green-500/20">
              <DollarSign className="w-4 h-4 text-green-600 dark:text-green-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-today-revenue">
              {kpisLoading ? "..." : `${kpisData?.today.revenueSAR || "0.00"} ر.س`}
            </div>
          </CardContent>
        </Card>

        <Card className="hover-elevate active-elevate-2 transition-all bg-blue-50 dark:bg-blue-950/30" data-testid="card-month-revenue">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">إيرادات الشهر</CardTitle>
            <div className="p-2 rounded-md bg-blue-500/20">
              <BarChart3 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-month-revenue">
              {kpisLoading ? "..." : `${kpisData?.thisMonth.revenueSAR || "0.00"} ر.س`}
            </div>
            {kpisData?.thisMonth.growth && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                {parseFloat(kpisData.thisMonth.growth) >= 0 ? (
                  <><ArrowUpRight className="w-3 h-3 text-green-500" /> <span className="text-green-500">+{kpisData.thisMonth.growth}%</span></>
                ) : (
                  <><ArrowDownRight className="w-3 h-3 text-red-500" /> <span className="text-red-500">{kpisData.thisMonth.growth}%</span></>
                )}
                مقارنة بالشهر الماضي
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="hover-elevate active-elevate-2 transition-all bg-purple-50 dark:bg-purple-950/30" data-testid="card-success-rate">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">نسبة النجاح</CardTitle>
            <div className="p-2 rounded-md bg-purple-500/20">
              <CheckCircle className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-success-rate">
              {kpisLoading ? "..." : `${kpisData?.metrics.successRate || "0"}%`}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {(kpisData?.metrics.successfulPayments || 0).toLocaleString('en-US')} من {(kpisData?.metrics.totalPayments || 0).toLocaleString('en-US')} عملية
            </p>
          </CardContent>
        </Card>

        <Card className="hover-elevate active-elevate-2 transition-all bg-amber-50 dark:bg-amber-950/30" data-testid="card-lifetime-revenue">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الإيرادات</CardTitle>
            <div className="p-2 rounded-md bg-amber-500/20">
              <TrendingUp className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-lifetime-revenue">
              {kpisLoading ? "..." : `${kpisData?.lifetime.revenueSAR || "0.00"} ر.س`}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4" dir="rtl">
        <TabsList className="flex-row-reverse">
          <TabsTrigger value="overview" data-testid="tab-overview">نظرة عامة</TabsTrigger>
          <TabsTrigger value="transactions" data-testid="tab-transactions">المعاملات</TabsTrigger>
          <TabsTrigger value="failed" className="relative" data-testid="tab-failed">
            المعلقة والفاشلة
            {(failedData.length > 0) && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                {failedData.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="alerts" className="relative" data-testid="tab-alerts">
            التنبيهات
            {unreadAlerts > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                {unreadAlerts}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[180px]" data-testid="select-period">
                <SelectValue placeholder="اختر الفترة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">اليوم</SelectItem>
                <SelectItem value="week">آخر 7 أيام</SelectItem>
                <SelectItem value="month">هذا الشهر</SelectItem>
                <SelectItem value="year">هذا العام</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card data-testid="card-article-summary">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="w-5 h-5" />
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
                    <div className="text-3xl font-bold text-green-600" data-testid="text-article-revenue">
                      {summaryData?.article.revenueSAR || "0.00"} ر.س
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="text-lg font-semibold text-green-600">{summaryData?.article.successful || 0}</div>
                        <div className="text-xs text-muted-foreground">ناجحة</div>
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-yellow-600">{summaryData?.article.pending || 0}</div>
                        <div className="text-xs text-muted-foreground">معلقة</div>
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-red-600">{summaryData?.article.failed || 0}</div>
                        <div className="text-xs text-muted-foreground">فاشلة</div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-advertiser-summary">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CreditCard className="w-5 h-5" />
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
                    <div className="text-3xl font-bold text-blue-600" data-testid="text-advertiser-revenue">
                      {summaryData?.advertiser.revenueSAR || "0.00"} ر.س
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="text-lg font-semibold text-green-600">{summaryData?.advertiser.successful || 0}</div>
                        <div className="text-xs text-muted-foreground">ناجحة</div>
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-yellow-600">{summaryData?.advertiser.pending || 0}</div>
                        <div className="text-xs text-muted-foreground">معلقة</div>
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-red-600">{summaryData?.advertiser.failed || 0}</div>
                        <div className="text-xs text-muted-foreground">فاشلة</div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <Card data-testid="card-trends">
            <CardHeader>
              <CardTitle>اتجاه الإيرادات</CardTitle>
              <CardDescription>الإيرادات اليومية خلال الفترة المحددة</CardDescription>
            </CardHeader>
            <CardContent>
              {trendsData.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  لا توجد بيانات للعرض
                </div>
              ) : (
                <div className="space-y-2">
                  {trendsData.slice(-10).map((trend, index) => (
                    <div key={index} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                      <span className="text-sm">{new Date(trend.date).toLocaleDateString("ar-SA-u-ca-gregory")}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-green-600">{trend.articleRevenueSAR} ر.س (مقالات)</span>
                        <span className="text-sm text-blue-600">{trend.advertiserRevenueSAR} ر.س (إعلانات)</span>
                        <span className="font-semibold">{trend.totalRevenueSAR} ر.س</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="w-5 h-5" />
                تصفية المعاملات
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <Select value={transactionType} onValueChange={setTransactionType}>
                  <SelectTrigger className="w-[150px]" data-testid="select-transaction-type">
                    <SelectValue placeholder="النوع" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    <SelectItem value="article">مقالات</SelectItem>
                    <SelectItem value="advertiser">معلنين</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={transactionStatus} onValueChange={setTransactionStatus}>
                  <SelectTrigger className="w-[150px]" data-testid="select-transaction-status">
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
                  className="w-[150px]"
                  data-testid="input-start-date"
                />
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-[150px]"
                  data-testid="input-end-date"
                />

                <Button variant="outline" onClick={() => refetchTransactions()} data-testid="button-filter">
                  تطبيق
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>قائمة المعاملات</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                {transactionsLoading ? (
                  <div className="animate-pulse space-y-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="h-12 bg-muted rounded"></div>
                    ))}
                  </div>
                ) : transactionsData.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    لا توجد معاملات
                  </div>
                ) : (
                  <div className="space-y-2">
                    {transactionsData.map((tx) => (
                      <div 
                        key={tx.id} 
                        className="flex items-center justify-between p-3 rounded-lg border"
                        data-testid={`transaction-row-${tx.id}`}
                      >
                        <div className="flex items-center gap-3">
                          {tx.paymentType === "article" ? (
                            <FileText className="w-5 h-5 text-green-600" />
                          ) : (
                            <CreditCard className="w-5 h-5 text-blue-600" />
                          )}
                          <div>
                            <div className="font-medium">{tx.amountSAR} ر.س</div>
                            <div className="text-xs text-muted-foreground">
                              {tx.chargeId ? `#${tx.chargeId.slice(0, 12)}...` : "-"}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {getStatusBadge(tx.status)}
                          <span className="text-xs text-muted-foreground">
                            {new Date(tx.createdAt).toLocaleDateString("ar-SA-u-ca-gregory")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="failed" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                المدفوعات المعلقة والفاشلة
              </CardTitle>
              <CardDescription>
                آخر 7 أيام - {failedData.length} عملية تحتاج متابعة
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                {failedData.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
                    <p className="text-muted-foreground">لا توجد مدفوعات فاشلة أو معلقة</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {failedData.map((tx) => (
                      <div 
                        key={tx.id} 
                        className="flex items-center justify-between p-3 rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-800"
                        data-testid={`failed-row-${tx.id}`}
                      >
                        <div className="flex items-center gap-3">
                          {tx.paymentType === "article" ? (
                            <FileText className="w-5 h-5" />
                          ) : (
                            <CreditCard className="w-5 h-5" />
                          )}
                          <div>
                            <div className="font-medium">{tx.amountSAR} ر.س</div>
                            <div className="text-xs text-muted-foreground">
                              {tx.chargeId ? `#${tx.chargeId.slice(0, 12)}...` : "-"}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {getStatusBadge(tx.status)}
                          <span className="text-xs text-muted-foreground">
                            {new Date(tx.createdAt).toLocaleDateString("ar-SA-u-ca-gregory")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
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
                  <div className="space-y-2">
                    {alertsData.map((alert) => (
                      <div 
                        key={alert.id} 
                        className={`p-4 rounded-lg border ${!alert.isRead ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800" : ""}`}
                        data-testid={`alert-row-${alert.id}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              {getSeverityBadge(alert.severity)}
                              <span className="font-medium">{alert.title}</span>
                            </div>
                            <p className="text-sm text-muted-foreground">{alert.message}</p>
                            <p className="text-xs text-muted-foreground mt-2">
                              {new Date(alert.createdAt).toLocaleString("ar-SA-u-ca-gregory")}
                            </p>
                          </div>
                          {!alert.isRead && (
                            <Button 
                              size="sm" 
                              variant="ghost"
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
