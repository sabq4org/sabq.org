import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import Chart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Eye,
  MousePointerClick,
  Percent,
  Target,
  Wallet,
  CreditCard,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Download,
  Calendar,
  RefreshCw,
  Smartphone,
  Globe,
  FileText,
  Radio,
  Power,
} from "lucide-react";
import { format, subDays, startOfMonth, startOfToday, endOfToday } from "date-fns";
import { arSA } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

interface LiveData {
  impressions: number;
  clicks: number;
  timestamp: string;
}

interface OverviewStats {
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpc: number;
  cpm: number;
  spent: number;
  revenue: number;
}

interface OverviewStatsWithComparison extends OverviewStats {
  previousPeriod: OverviewStats;
  deltas: {
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: number;
    cpc: number;
    cpm: number;
    spent: number;
    revenue: number;
  };
}

interface TimeSeriesDataPoint {
  date: string;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  spent: number;
}

interface AudienceBreakdown {
  label: string;
  impressions: number;
  clicks: number;
  ctr: number;
}

interface AudienceAnalytics {
  byDevice: AudienceBreakdown[];
  byCountry: AudienceBreakdown[];
  byReferrer: AudienceBreakdown[];
}

interface CampaignWithStats {
  id: string;
  name: string;
  status: string;
  stats: OverviewStats;
}

interface FunnelStage {
  stage: string;
  stageAr: string;
  count: number;
  percentage: number;
  dropoff: number;
  color: string;
}

interface FunnelData {
  stages: FunnelStage[];
  totalConversionRate: number;
}

const dateRangePresets = [
  { value: "today", label: "اليوم" },
  { value: "7days", label: "آخر 7 أيام" },
  { value: "30days", label: "آخر 30 يوماً" },
  { value: "thisMonth", label: "هذا الشهر" },
];

const statusLabels: Record<string, string> = {
  active: "نشطة",
  paused: "متوقفة",
  ended: "منتهية",
  pending_review: "قيد المراجعة",
  draft: "مسودة",
};

const statusColors: Record<string, string> = {
  active: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  paused: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
  ended: "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
  pending_review: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  draft: "bg-muted text-muted-foreground border-border",
};

function getDateRange(preset: string): { dateFrom: Date; dateTo: Date } {
  const now = new Date();
  switch (preset) {
    case "today":
      return { dateFrom: startOfToday(), dateTo: endOfToday() };
    case "7days":
      return { dateFrom: subDays(now, 7), dateTo: now };
    case "30days":
      return { dateFrom: subDays(now, 30), dateTo: now };
    case "thisMonth":
      return { dateFrom: startOfMonth(now), dateTo: now };
    default:
      return { dateFrom: subDays(now, 30), dateTo: now };
  }
}

function formatNumber(num: number): string {
  if (num === null || num === undefined || isNaN(num)) return "0";
  return new Intl.NumberFormat("en-US").format(num);
}

function formatCurrency(num: number): string {
  if (num === null || num === undefined || isNaN(num)) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "SAR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(0);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "SAR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);
}

function KPICard({
  icon: Icon,
  title,
  value,
  subtitle,
  color = "primary",
  testId,
  delta,
}: {
  icon: any;
  title: string;
  value: string | number;
  subtitle?: string;
  color?: string;
  testId: string;
  delta?: number;
}) {
  const colorClasses: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    blue: "bg-blue-500/10 text-blue-500",
    green: "bg-emerald-500/10 text-emerald-500",
    purple: "bg-purple-500/10 text-purple-500",
    orange: "bg-orange-500/10 text-orange-500",
    pink: "bg-pink-500/10 text-pink-500",
    cyan: "bg-cyan-500/10 text-cyan-500",
    amber: "bg-amber-500/10 text-amber-500",
  };

  const validDelta = delta !== undefined && !isNaN(delta) && isFinite(delta);
  const isPositive = validDelta && delta > 0;
  const isNegative = validDelta && delta < 0;
  const deltaText = validDelta
    ? `${isPositive ? "+" : ""}${delta.toFixed(1)}% مقارنة بالفترة السابقة`
    : null;

  return (
    <Card data-testid={testId}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground">{title}</p>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold" data-testid={`${testId}-value`}>
                {value}
              </p>
              {validDelta && delta !== 0 && (
                <span 
                  className={`flex items-center gap-0.5 text-xs font-medium ${
                    isPositive ? "text-green-500" : "text-red-500"
                  }`}
                  data-testid={`${testId}-delta`}
                >
                  {isPositive ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {isPositive ? "+" : ""}{delta.toFixed(1)}%
                </span>
              )}
            </div>
            {deltaText && (
              <p className={`text-xs ${isPositive ? "text-green-500" : isNegative ? "text-red-500" : "text-muted-foreground"}`}>
                {deltaText}
              </p>
            )}
            {subtitle && !deltaText && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function KPICardsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {[...Array(8)].map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-16" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-[300px] w-full" />
      </CardContent>
    </Card>
  );
}

function TableSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function LiveDataCard({
  isEnabled,
  onToggle,
  liveData,
  isConnected,
}: {
  isEnabled: boolean;
  onToggle: () => void;
  liveData: LiveData | null;
  isConnected: boolean;
}) {
  return (
    <Card data-testid="card-live-data">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className={`p-3 rounded-lg ${isEnabled && isConnected ? 'bg-green-500/10' : 'bg-muted'}`}>
                <Radio className={`h-5 w-5 ${isEnabled && isConnected ? 'text-green-500' : 'text-muted-foreground'}`} />
              </div>
              {isEnabled && isConnected && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                </span>
              )}
            </div>
            <div>
              <h3 className="font-semibold text-lg">البيانات اللحظية</h3>
              <div className="flex items-center gap-2 text-sm">
                {isEnabled ? (
                  <>
                    <span 
                      className={`inline-flex items-center gap-1.5 ${isConnected ? 'text-green-500' : 'text-red-500'}`}
                      data-testid="status-live-connection"
                    >
                      <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                      {isConnected ? 'متصل' : 'غير متصل'}
                    </span>
                    {liveData?.timestamp && (
                      <span className="text-muted-foreground">
                        • آخر تحديث: {format(new Date(liveData.timestamp), 'HH:mm:ss', { locale: arSA })}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">البث المباشر متوقف</span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {isEnabled && liveData && (
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-500" data-testid="live-impressions">
                    {formatNumber(liveData.impressions)}
                  </p>
                  <p className="text-xs text-muted-foreground">المشاهدات اليوم</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-500" data-testid="live-clicks">
                    {formatNumber(liveData.clicks)}
                  </p>
                  <p className="text-xs text-muted-foreground">النقرات اليوم</p>
                </div>
              </div>
            )}
            
            <Button
              variant={isEnabled ? "default" : "outline"}
              size="sm"
              onClick={onToggle}
              data-testid="button-toggle-live"
              className="min-w-[100px]"
            >
              <Power className="h-4 w-4 ml-2" />
              {isEnabled ? 'إيقاف' : 'تشغيل'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdAnalyticsPage() {
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState("30days");
  const [isExporting, setIsExporting] = useState(false);
  
  // Live data state - persist in localStorage
  const [liveEnabled, setLiveEnabled] = useState(() => {
    const saved = localStorage.getItem('adAnalytics_liveEnabled');
    return saved === 'true';
  });
  const [liveData, setLiveData] = useState<LiveData | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  // Persist live toggle state
  useEffect(() => {
    localStorage.setItem('adAnalytics_liveEnabled', String(liveEnabled));
  }, [liveEnabled]);
  
  // Polling for live data (more reliable than SSE with auth)
  useEffect(() => {
    if (!liveEnabled) {
      setIsConnected(false);
      return;
    }
    
    let isActive = true;
    let errorCount = 0;
    const maxErrors = 3;
    
    const fetchLiveData = async () => {
      try {
        const response = await fetch('/api/ads/analytics/live-poll', {
          credentials: 'include'
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json() as LiveData;
        if (isActive) {
          setLiveData(data);
          setIsConnected(true);
          errorCount = 0;
        }
      } catch (error) {
        console.error('[Live] Error fetching data:', error);
        errorCount++;
        if (errorCount >= maxErrors && isActive) {
          setIsConnected(false);
        }
      }
    };
    
    // Initial fetch
    fetchLiveData();
    
    // Poll every 5 seconds
    const intervalId = setInterval(fetchLiveData, 5000);
    
    return () => {
      isActive = false;
      clearInterval(intervalId);
      setIsConnected(false);
    };
  }, [liveEnabled]);
  
  const toggleLive = useCallback(() => {
    setLiveEnabled(prev => !prev);
  }, []);

  const { dateFrom, dateTo } = useMemo(() => getDateRange(dateRange), [dateRange]);

  const dateParams = useMemo(
    () =>
      `dateFrom=${dateFrom.toISOString()}&dateTo=${dateTo.toISOString()}`,
    [dateFrom, dateTo]
  );

  const {
    data: overview,
    isLoading: overviewLoading,
    refetch: refetchOverview,
  } = useQuery<OverviewStatsWithComparison>({
    queryKey: ["/api/ads/analytics/overview-comparison", dateParams],
  });

  const { data: timeseries, isLoading: timeseriesLoading } = useQuery<
    TimeSeriesDataPoint[]
  >({
    queryKey: ["/api/ads/analytics/timeseries", "period=daily", dateParams],
  });

  const { data: audience, isLoading: audienceLoading } =
    useQuery<AudienceAnalytics>({
      queryKey: ["/api/ads/analytics/audience", dateParams],
    });

  const { data: campaigns, isLoading: campaignsLoading } = useQuery<
    CampaignWithStats[]
  >({
    queryKey: ["/api/ads/analytics/campaigns", dateParams],
  });

  const { data: funnelData, isLoading: funnelLoading } = useQuery<FunnelData>({
    queryKey: ["/api/ads/analytics/funnel", dateParams],
  });

  const handleExportCSV = async (type: string) => {
    setIsExporting(true);
    try {
      const url = `/api/ads/analytics/export/csv?type=${type}&${dateParams}`;
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("فشل التصدير");

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `ad-analytics-${type}-${format(new Date(), "yyyy-MM-dd")}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

      toast({
        title: "تم التصدير بنجاح",
        description: "تم تحميل ملف CSV بنجاح",
      });
    } catch (error) {
      toast({
        title: "خطأ في التصدير",
        description: "حدث خطأ أثناء تصدير البيانات",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const [isExportingPDF, setIsExportingPDF] = useState(false);

  const handleExportPDF = async () => {
    setIsExportingPDF(true);
    try {
      const url = `/api/ads/analytics/export/pdf?${dateParams}`;
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("فشل التصدير");

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `ad-analytics-report-${format(new Date(), "yyyy-MM-dd")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

      toast({
        title: "تم التصدير بنجاح",
        description: "تم تحميل تقرير PDF بنجاح",
      });
    } catch (error) {
      toast({
        title: "خطأ في التصدير",
        description: "حدث خطأ أثناء تصدير التقرير",
        variant: "destructive",
      });
    } finally {
      setIsExportingPDF(false);
    }
  };

  const lineChartOptions: ApexOptions = useMemo(
    () => ({
      chart: {
        type: "line",
        toolbar: { show: true },
        zoom: { enabled: true },
        fontFamily: "inherit",
      },
      stroke: {
        curve: "smooth",
        width: 3,
      },
      colors: ["#3B82F6", "#10B981"],
      xaxis: {
        categories: timeseries?.map((d) =>
          format(new Date(d.date), "dd MMM", { locale: arSA })
        ) || [],
        labels: {
          style: { fontFamily: "inherit" },
        },
      },
      yaxis: [
        {
          title: { text: "المشاهدات", style: { fontFamily: "inherit" } },
          labels: {
            formatter: (val) => formatNumber(val),
            style: { fontFamily: "inherit" },
          },
        },
        {
          opposite: true,
          title: { text: "النقرات", style: { fontFamily: "inherit" } },
          labels: {
            formatter: (val) => formatNumber(val),
            style: { fontFamily: "inherit" },
          },
        },
      ],
      legend: {
        position: "top",
        fontFamily: "inherit",
      },
      tooltip: {
        shared: true,
        intersect: false,
        style: { fontFamily: "inherit" },
      },
      grid: {
        borderColor: "hsl(var(--border))",
      },
    }),
    [timeseries]
  );

  const lineChartSeries = useMemo(
    () => [
      {
        name: "المشاهدات",
        data: timeseries?.map((d) => d.impressions) || [],
      },
      {
        name: "النقرات",
        data: timeseries?.map((d) => d.clicks) || [],
      },
    ],
    [timeseries]
  );

  const barChartOptions: ApexOptions = useMemo(
    () => ({
      chart: {
        type: "bar",
        toolbar: { show: true },
        fontFamily: "inherit",
      },
      plotOptions: {
        bar: {
          horizontal: false,
          columnWidth: "55%",
          borderRadius: 4,
        },
      },
      colors: ["#8B5CF6", "#F59E0B"],
      xaxis: {
        categories: campaigns?.slice(0, 5).map((c) => c.name) || [],
        labels: {
          style: { fontFamily: "inherit" },
          rotate: -45,
        },
      },
      yaxis: {
        labels: {
          formatter: (val) => formatNumber(val),
          style: { fontFamily: "inherit" },
        },
      },
      legend: {
        position: "top",
        fontFamily: "inherit",
      },
      dataLabels: {
        enabled: false,
      },
      grid: {
        borderColor: "hsl(var(--border))",
      },
    }),
    [campaigns]
  );

  const barChartSeries = useMemo(
    () => [
      {
        name: "المشاهدات",
        data: campaigns?.slice(0, 5).map((c) => c.stats?.impressions || 0) || [],
      },
      {
        name: "النقرات",
        data: campaigns?.slice(0, 5).map((c) => c.stats?.clicks || 0) || [],
      },
    ],
    [campaigns]
  );

  const deviceChartOptions: ApexOptions = useMemo(
    () => ({
      chart: {
        type: "donut",
        fontFamily: "inherit",
      },
      labels: audience?.byDevice?.map((d) => d.label) || [],
      colors: ["#3B82F6", "#10B981", "#F59E0B", "#EF4444"],
      legend: {
        position: "bottom",
        fontFamily: "inherit",
      },
      dataLabels: {
        enabled: true,
        formatter: (val: number) => `${val.toFixed(1)}%`,
      },
      plotOptions: {
        pie: {
          donut: {
            size: "65%",
            labels: {
              show: true,
              total: {
                show: true,
                label: "إجمالي",
                fontFamily: "inherit",
                formatter: () =>
                  formatNumber(
                    audience?.byDevice?.reduce(
                      (sum, d) => sum + d.impressions,
                      0
                    ) || 0
                  ),
              },
            },
          },
        },
      },
    }),
    [audience]
  );

  const deviceChartSeries = useMemo(
    () => audience?.byDevice?.map((d) => d.impressions) || [],
    [audience]
  );

  const countryChartOptions: ApexOptions = useMemo(
    () => ({
      chart: {
        type: "donut",
        fontFamily: "inherit",
      },
      labels: audience?.byCountry?.map((d) => d.label) || [],
      colors: ["#8B5CF6", "#EC4899", "#06B6D4", "#84CC16", "#F97316"],
      legend: {
        position: "bottom",
        fontFamily: "inherit",
      },
      dataLabels: {
        enabled: true,
        formatter: (val: number) => `${val.toFixed(1)}%`,
      },
      plotOptions: {
        pie: {
          donut: {
            size: "65%",
            labels: {
              show: true,
              total: {
                show: true,
                label: "إجمالي",
                fontFamily: "inherit",
                formatter: () =>
                  formatNumber(
                    audience?.byCountry?.reduce(
                      (sum, d) => sum + d.impressions,
                      0
                    ) || 0
                  ),
              },
            },
          },
        },
      },
    }),
    [audience]
  );

  const countryChartSeries = useMemo(
    () => audience?.byCountry?.map((d) => d.impressions) || [],
    [audience]
  );

  const funnelChartOptions: ApexOptions = useMemo(
    () => ({
      chart: {
        type: "bar",
        toolbar: { show: true },
        fontFamily: "inherit",
      },
      plotOptions: {
        bar: {
          horizontal: true,
          barHeight: "70%",
          borderRadius: 4,
          distributed: true,
        },
      },
      colors: funnelData?.stages?.map((s) => s.color) || ["#A855F7", "#3B82F6", "#22C55E", "#F97316", "#EF4444"],
      xaxis: {
        categories: funnelData?.stages?.map((s) => s.stageAr) || [],
        labels: {
          style: { fontFamily: "inherit" },
          formatter: (val) => formatNumber(Number(val)),
        },
      },
      yaxis: {
        labels: {
          style: { fontFamily: "inherit" },
        },
      },
      legend: {
        show: false,
      },
      dataLabels: {
        enabled: true,
        formatter: (val: number, opts: any) => {
          const stage = funnelData?.stages?.[opts.dataPointIndex];
          if (stage) {
            return `${formatNumber(val)} (${stage.percentage}%)`;
          }
          return formatNumber(val);
        },
        style: {
          fontFamily: "inherit",
          colors: ["#fff"],
        },
      },
      tooltip: {
        y: {
          formatter: (val: number, opts: any) => {
            const stage = funnelData?.stages?.[opts.dataPointIndex];
            if (stage) {
              return `${formatNumber(val)} - الانخفاض: ${stage.dropoff}%`;
            }
            return formatNumber(val);
          },
        },
        style: { fontFamily: "inherit" },
      },
      grid: {
        borderColor: "hsl(var(--border))",
      },
    }),
    [funnelData]
  );

  const funnelChartSeries = useMemo(
    () => [
      {
        name: "قمع التسويق",
        data: funnelData?.stages?.map((s) => s.count) || [],
      },
    ],
    [funnelData]
  );

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">تحليلات الإعلانات</h1>
            <p className="text-muted-foreground">
              إحصائيات وتحليلات شاملة لأداء الحملات الإعلانية
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select
              value={dateRange}
              onValueChange={setDateRange}
              data-testid="select-date-range"
            >
              <SelectTrigger className="w-[160px]" data-testid="button-date-range">
                <Calendar className="h-4 w-4 ml-2" />
                <SelectValue placeholder="اختر الفترة" />
              </SelectTrigger>
              <SelectContent>
                {dateRangePresets.map((preset) => (
                  <SelectItem
                    key={preset.value}
                    value={preset.value}
                    data-testid={`option-date-${preset.value}`}
                  >
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetchOverview()}
              data-testid="button-refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => handleExportCSV("overview")}
              disabled={isExporting}
              data-testid="button-export-overview"
            >
              <Download className="h-4 w-4 ml-2" />
              تصدير CSV
            </Button>
            <Button
              variant="outline"
              onClick={handleExportPDF}
              disabled={isExportingPDF}
              data-testid="button-export-pdf"
            >
              <FileText className="h-4 w-4 ml-2" />
              {isExportingPDF ? "جاري التصدير..." : "تصدير PDF"}
            </Button>
          </div>
        </div>

        <LiveDataCard
          isEnabled={liveEnabled}
          onToggle={toggleLive}
          liveData={liveData}
          isConnected={isConnected}
        />

        {overviewLoading ? (
          <KPICardsSkeleton />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard
              icon={Eye}
              title="المشاهدات"
              value={formatNumber(overview?.impressions || 0)}
              color="blue"
              testId="kpi-impressions"
              delta={overview?.deltas?.impressions}
            />
            <KPICard
              icon={MousePointerClick}
              title="النقرات"
              value={formatNumber(overview?.clicks || 0)}
              color="green"
              testId="kpi-clicks"
              delta={overview?.deltas?.clicks}
            />
            <KPICard
              icon={Percent}
              title="معدل النقر (CTR)"
              value={`${overview?.ctr?.toFixed(2) || 0}%`}
              color="purple"
              testId="kpi-ctr"
              delta={overview?.deltas?.ctr}
            />
            <KPICard
              icon={Target}
              title="التحويلات"
              value={formatNumber(overview?.conversions || 0)}
              color="orange"
              testId="kpi-conversions"
              delta={overview?.deltas?.conversions}
            />
            <KPICard
              icon={Wallet}
              title="المصروف"
              value={formatCurrency(overview?.spent || 0)}
              color="pink"
              testId="kpi-spent"
              delta={overview?.deltas?.spent}
            />
            <KPICard
              icon={CreditCard}
              title="تكلفة النقرة (CPC)"
              value={formatCurrency(overview?.cpc || 0)}
              color="cyan"
              testId="kpi-cpc"
              delta={overview?.deltas?.cpc}
            />
            <KPICard
              icon={BarChart3}
              title="تكلفة الألف (CPM)"
              value={formatCurrency(overview?.cpm || 0)}
              color="amber"
              testId="kpi-cpm"
              delta={overview?.deltas?.cpm}
            />
            <KPICard
              icon={TrendingUp}
              title="الإيرادات"
              value={formatCurrency(overview?.revenue || 0)}
              color="primary"
              testId="kpi-revenue"
              delta={overview?.deltas?.revenue}
            />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {timeseriesLoading ? (
            <ChartSkeleton />
          ) : (
            <Card className="lg:col-span-2" data-testid="chart-timeseries">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-lg">أداء الإعلانات عبر الوقت</CardTitle>
                  <CardDescription>
                    المشاهدات والنقرات خلال الفترة المحددة
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExportCSV("timeseries")}
                  disabled={isExporting}
                  data-testid="button-export-timeseries"
                >
                  <Download className="h-4 w-4 ml-1" />
                  تصدير
                </Button>
              </CardHeader>
              <CardContent>
                {timeseries && timeseries.length > 0 ? (
                  <Chart
                    options={lineChartOptions}
                    series={lineChartSeries}
                    type="line"
                    height={350}
                  />
                ) : (
                  <div className="h-[350px] flex items-center justify-center text-muted-foreground">
                    لا توجد بيانات للفترة المحددة
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {funnelLoading ? (
            <ChartSkeleton />
          ) : (
            <Card className="lg:col-span-2" data-testid="chart-funnel">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-lg">قمع التسويق</CardTitle>
                  <CardDescription>
                    مراحل رحلة العميل من الوعي إلى التأييد - معدل التحويل الإجمالي: {funnelData?.totalConversionRate || 0}%
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {funnelData?.stages && funnelData.stages.length > 0 ? (
                  <Chart
                    options={funnelChartOptions}
                    series={funnelChartSeries}
                    type="bar"
                    height={350}
                  />
                ) : (
                  <div className="h-[350px] flex items-center justify-center text-muted-foreground">
                    لا توجد بيانات للفترة المحددة
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {campaignsLoading ? (
            <ChartSkeleton />
          ) : (
            <Card data-testid="chart-campaigns">
              <CardHeader>
                <CardTitle className="text-lg">مقارنة الحملات</CardTitle>
                <CardDescription>أفضل 5 حملات من حيث الأداء</CardDescription>
              </CardHeader>
              <CardContent>
                {campaigns && campaigns.length > 0 ? (
                  <Chart
                    options={barChartOptions}
                    series={barChartSeries}
                    type="bar"
                    height={300}
                  />
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    لا توجد حملات
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {audienceLoading ? (
            <ChartSkeleton />
          ) : (
            <Card data-testid="chart-devices">
              <CardHeader className="flex flex-row items-center gap-2">
                <Smartphone className="h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle className="text-lg">توزيع الأجهزة</CardTitle>
                  <CardDescription>نوع الأجهزة المستخدمة</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {audience?.byDevice && audience.byDevice.length > 0 ? (
                  <Chart
                    options={deviceChartOptions}
                    series={deviceChartSeries}
                    type="donut"
                    height={300}
                  />
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    لا توجد بيانات
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {audienceLoading ? (
            <ChartSkeleton />
          ) : (
            <Card data-testid="chart-countries">
              <CardHeader className="flex flex-row items-center gap-2">
                <Globe className="h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle className="text-lg">توزيع الدول</CardTitle>
                  <CardDescription>المشاهدات حسب الموقع الجغرافي</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {audience?.byCountry && audience.byCountry.length > 0 ? (
                  <Chart
                    options={countryChartOptions}
                    series={countryChartSeries}
                    type="donut"
                    height={300}
                  />
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    لا توجد بيانات
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {campaignsLoading ? (
          <TableSkeleton />
        ) : (
          <Card data-testid="table-campaigns">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle className="text-lg">أداء الحملات</CardTitle>
                <CardDescription>
                  إحصائيات تفصيلية لجميع الحملات
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportCSV("campaigns")}
                disabled={isExporting}
                data-testid="button-export-campaigns"
              >
                <Download className="h-4 w-4 ml-1" />
                تصدير
              </Button>
            </CardHeader>
            <CardContent>
              {campaigns && campaigns.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">اسم الحملة</TableHead>
                        <TableHead className="text-center">الحالة</TableHead>
                        <TableHead className="text-center">المشاهدات</TableHead>
                        <TableHead className="text-center">النقرات</TableHead>
                        <TableHead className="text-center">CTR</TableHead>
                        <TableHead className="text-center">المصروف</TableHead>
                        <TableHead className="text-center">CPC</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {campaigns.map((campaign) => (
                        <TableRow
                          key={campaign.id}
                          data-testid={`row-campaign-${campaign.id}`}
                        >
                          <TableCell className="font-medium text-right">
                            {campaign.name}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant="outline"
                              className={statusColors[campaign.status] || ""}
                            >
                              {statusLabels[campaign.status] || campaign.status}
                            </Badge>
                          </TableCell>
                          <TableCell
                            className="text-center"
                            data-testid={`cell-impressions-${campaign.id}`}
                          >
                            {formatNumber(campaign.stats?.impressions || 0)}
                          </TableCell>
                          <TableCell
                            className="text-center"
                            data-testid={`cell-clicks-${campaign.id}`}
                          >
                            {formatNumber(campaign.stats?.clicks || 0)}
                          </TableCell>
                          <TableCell
                            className="text-center"
                            data-testid={`cell-ctr-${campaign.id}`}
                          >
                            {(campaign.stats?.ctr || 0).toFixed(2)}%
                          </TableCell>
                          <TableCell
                            className="text-center"
                            data-testid={`cell-spent-${campaign.id}`}
                          >
                            {formatCurrency(campaign.stats?.spent || 0)}
                          </TableCell>
                          <TableCell
                            className="text-center"
                            data-testid={`cell-cpc-${campaign.id}`}
                          >
                            {formatCurrency(campaign.stats?.cpc || 0)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="py-12 text-center text-muted-foreground">
                  لا توجد حملات إعلانية
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
