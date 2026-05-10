import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { ar } from "date-fns/locale";
import {
  Calendar,
  Download,
  Headphones,
  Users,
  Clock,
  TrendingUp,
  BarChart3,
  Play,
  FileAudio
} from "lucide-react";
import { MetricCard } from "@/components/analytics/MetricCard";
import { TrendChart } from "@/components/analytics/TrendChart";
import { CompletionGauge } from "@/components/analytics/CompletionGauge";
import { DeviceChart } from "@/components/analytics/DeviceChart";
import { PeakHoursHeatmap } from "@/components/analytics/PeakHoursHeatmap";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface DateRange {
  from: Date;
  to: Date;
}

interface AnalyticsOverview {
  totalNewsletters: number;
  totalListens: number;
  uniqueListeners: number;
  averageCompletion: number;
  totalHoursListened: number;
  activeListeners: number;
  scheduledCount: number;
  publishedToday: number;
  weeklyGrowth: number;
  topNewsletter: {
    title: string;
    listens: number;
  } | null;
}

interface TrendsData {
  trends: Array<{
    date: string;
    value: number;
    [key: string]: any;
  }>;
  peakHours: Array<{
    hour: number;
    dayOfWeek: number;
    count: number;
  }>;
  deviceDistribution: Array<{
    type: string;
    count: number;
    percentage: number;
  }>;
}

interface TopNewsletter {
  id: string;
  title: string;
  publishedAt: string;
  totalListens: number;
  uniqueListeners: number;
  avgCompletion: number;
  totalHours: number;
}

const templateLabels: Record<string, string> = {
  MORNING_BRIEF: "نشرة صباحية",
  EVENING_DIGEST: "ملخص مسائي",
  WEEKLY_ANALYSIS: "تحليل أسبوعي",
  BREAKING_NEWS: "عاجل",
  TECH_UPDATE: "تقنية",
  BUSINESS_REPORT: "اقتصاد",
  SPORT_HIGHLIGHTS: "رياضة",
  CUSTOM: "مخصص"
};

export default function AudioNewsletterAnalytics() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date()
  });
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const [metric, setMetric] = useState<"listens" | "completion" | "duration" | "unique_users">("listens");
  const [exportType, setExportType] = useState<"overview" | "newsletters" | "listens">("overview");

  // Fetch overview data
  const { data: overview, isLoading: overviewLoading } = useQuery<AnalyticsOverview>({
    queryKey: ["/api/audio-newsletters/analytics/overview", dateRange],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: dateRange.from.toISOString(),
        endDate: dateRange.to.toISOString()
      });
      const response = await fetch(`/api/audio-newsletters/analytics/overview?${params}`);
      if (!response.ok) throw new Error("Failed to fetch overview");
      return response.json();
    }
  });

  // Fetch trends data
  const { data: trendsData, isLoading: trendsLoading } = useQuery<TrendsData>({
    queryKey: ["/api/audio-newsletters/analytics/trends", dateRange, period, metric],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: dateRange.from.toISOString(),
        endDate: dateRange.to.toISOString(),
        period,
        metric
      });
      const response = await fetch(`/api/audio-newsletters/analytics/trends?${params}`);
      if (!response.ok) throw new Error("Failed to fetch trends");
      return response.json();
    }
  });

  // Fetch top newsletters
  const { data: topNewsletters, isLoading: topLoading } = useQuery<{ newsletters: TopNewsletter[] }>({
    queryKey: ["/api/audio-newsletters/analytics/top-newsletters", dateRange],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: dateRange.from.toISOString(),
        endDate: dateRange.to.toISOString(),
        limit: "10"
      });
      const response = await fetch(`/api/audio-newsletters/analytics/top-newsletters?${params}`);
      if (!response.ok) throw new Error("Failed to fetch top newsletters");
      return response.json();
    }
  });

  const handleExport = async () => {
    try {
      const params = new URLSearchParams({
        type: exportType,
        startDate: dateRange.from.toISOString(),
        endDate: dateRange.to.toISOString()
      });
      
      const response = await fetch(`/api/audio-newsletters/analytics/export?${params}`);
      if (!response.ok) throw new Error("Failed to export data");
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `analytics-${exportType}-${format(new Date(), "yyyy-MM-dd")}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: "تم التصدير بنجاح",
        description: "تم تحميل ملف البيانات"
      });
    } catch (error) {
      toast({
        title: "خطأ في التصدير",
        description: "فشل تصدير البيانات",
        variant: "destructive"
      });
    }
  };

  const formatMetricLabel = (metric: string) => {
    const labels: Record<string, string> = {
      listens: "عدد الاستماعات",
      completion: "معدل الإكمال",
      duration: "مدة الاستماع",
      unique_users: "المستخدمون الفريدون"
    };
    return labels[metric] || metric;
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">تحليلات النشرات الصوتية</h1>
          <p className="text-muted-foreground mt-1">
            تتبع أداء النشرات الصوتية وتفاعل المستخدمين
          </p>
        </div>
        
        <div className="flex flex-col gap-2 sm:flex-row">
          <DatePickerWithRange
            date={dateRange}
            onDateChange={(range) => range && setDateRange(range)}
          />
          
          <div className="flex gap-2">
            <Select value={exportType} onValueChange={(v) => setExportType(v as any)}>
              <SelectTrigger className="w-32" data-testid="select-export-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="overview">ملخص</SelectItem>
                <SelectItem value="newsletters">نشرات</SelectItem>
                <SelectItem value="listens">استماعات</SelectItem>
              </SelectContent>
            </Select>
            
            <Button
              onClick={handleExport}
              variant="outline"
              data-testid="button-export"
            >
              <Download className="h-4 w-4 ml-2" />
              تصدير CSV
            </Button>
          </div>
        </div>
      </div>

      {/* Overview Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="إجمالي الاستماعات"
          value={overview?.totalListens || 0}
          icon={Headphones}
          trend={{
            value: overview?.weeklyGrowth || 0,
            label: "عن الأسبوع الماضي"
          }}
          loading={overviewLoading}
        />
        
        <MetricCard
          title="المستمعون الفريدون"
          value={overview?.uniqueListeners || 0}
          icon={Users}
          description={`${overview?.activeListeners || 0} نشط آخر 30 يوم`}
          loading={overviewLoading}
        />
        
        <MetricCard
          title="معدل الإكمال"
          value={overview?.averageCompletion || 0}
          icon={TrendingUp}
          format="percentage"
          loading={overviewLoading}
        />
        
        <MetricCard
          title="ساعات الاستماع"
          value={overview?.totalHoursListened || 0}
          icon={Clock}
          description="إجمالي وقت الاستماع"
          loading={overviewLoading}
        />
      </div>

      {/* Additional Info Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title="النشرات المنشورة"
          value={overview?.totalNewsletters || 0}
          icon={FileAudio}
          description={`${overview?.publishedToday || 0} منشورة اليوم`}
          loading={overviewLoading}
        />
        
        <MetricCard
          title="النشرات المجدولة"
          value={overview?.scheduledCount || 0}
          icon={Calendar}
          loading={overviewLoading}
        />
        
        {overview?.topNewsletter && (
          <Card className="hover-elevate">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                النشرة الأكثر استماعاً
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-semibold truncate">
                {overview.topNewsletter.title}
              </div>
              <div className="text-sm text-muted-foreground">
                {overview.topNewsletter.listens} استماع
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Charts Section */}
      <Tabs defaultValue="trends" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="trends">الاتجاهات</TabsTrigger>
          <TabsTrigger value="completion">معدل الإكمال</TabsTrigger>
          <TabsTrigger value="devices">الأجهزة</TabsTrigger>
          <TabsTrigger value="peak">ساعات الذروة</TabsTrigger>
        </TabsList>

        <TabsContent value="trends" className="space-y-4">
          <div className="flex items-center gap-2">
            <Select value={metric} onValueChange={(v) => setMetric(v as any)}>
              <SelectTrigger className="w-48" data-testid="select-metric">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="listens">عدد الاستماعات</SelectItem>
                <SelectItem value="unique_users">المستخدمون الفريدون</SelectItem>
                <SelectItem value="completion">معدل الإكمال</SelectItem>
                <SelectItem value="duration">مدة الاستماع</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <TrendChart
            data={trendsData?.trends || []}
            title={formatMetricLabel(metric)}
            description="تتبع الأداء عبر الزمن"
            loading={trendsLoading}
            type="area"
            height={400}
            period={period}
            onPeriodChange={(p) => setPeriod(p as any)}
            formatValue={metric === "completion" ? (v) => `${v.toFixed(1)}%` : undefined}
          />
        </TabsContent>

        <TabsContent value="completion">
          <div className="grid gap-4 md:grid-cols-2">
            <CompletionGauge
              value={overview?.averageCompletion || 0}
              title="معدل الإكمال الإجمالي"
              description="متوسط نسبة إكمال الاستماع للنشرات"
              loading={overviewLoading}
              size={250}
            />
            
            <TrendChart
              data={trendsData?.trends || []}
              title="معدل الإكمال عبر الزمن"
              loading={trendsLoading}
              type="line"
              height={250}
              valueKey="value"
              formatValue={(v) => `${v.toFixed(1)}%`}
            />
          </div>
        </TabsContent>

        <TabsContent value="devices">
          <DeviceChart
            data={trendsData?.deviceDistribution || []}
            description="توزيع المستمعين حسب نوع الجهاز"
            loading={trendsLoading}
            height={400}
          />
        </TabsContent>

        <TabsContent value="peak">
          <PeakHoursHeatmap
            data={trendsData?.peakHours || []}
            loading={trendsLoading}
          />
        </TabsContent>
      </Tabs>

      {/* Top Newsletters Table */}
      <Card className="hover-elevate">
        <CardHeader>
          <CardTitle>النشرات الأكثر استماعاً</CardTitle>
          <CardDescription>
            أفضل النشرات الصوتية حسب عدد الاستماعات
          </CardDescription>
        </CardHeader>
        <CardContent>
          {topLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead colSpan={2}>العنوان</TableHead>
                    <TableHead className="text-center">الاستماعات</TableHead>
                    <TableHead className="text-center">مستمعون فريدون</TableHead>
                    <TableHead className="text-center">معدل الإكمال</TableHead>
                    <TableHead className="text-center">ساعات الاستماع</TableHead>
                    <TableHead className="text-left">تاريخ النشر</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topNewsletters?.newsletters.map((newsletter) => (
                    <TableRow key={newsletter.id}>
                      <TableCell className="font-medium" colSpan={2}>
                        {newsletter.title}
                      </TableCell>
                      <TableCell className="text-center">
                        {newsletter.totalListens.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-center">
                        {newsletter.uniqueListeners.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <span>{(newsletter.avgCompletion || 0).toFixed(1)}%</span>
                          {newsletter.avgCompletion >= 75 && (
                            <div className="h-2 w-2 rounded-full bg-green-500" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {newsletter.totalHours || 0}
                      </TableCell>
                      <TableCell className="text-left text-muted-foreground">
                        {format(new Date(newsletter.publishedAt), "dd MMM yyyy", { locale: ar })}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!topNewsletters?.newsletters || topNewsletters.newsletters.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        لا توجد نشرات في الفترة المحددة
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}