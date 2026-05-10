import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { 
  BarChart3, 
  Users, 
  Clock, 
  MousePointer, 
  TrendingUp, 
  Globe, 
  Smartphone, 
  RefreshCw,
  ArrowRight,
  Eye,
  Activity,
  Monitor,
  Flame,
  ExternalLink
} from "lucide-react";

type OverviewData = {
  sessions: {
    total: number;
    uniqueUsers: number;
    newVisitors: number;
    returningVisitors: number;
    avgDuration: number;
    avgPagesPerSession: number;
  };
  engagement: {
    avgScrollDepth: number;
    avgTimeOnPage: number;
    bounceRate: number;
    completionRate: number;
  };
  topArticles: Array<{
    articleId: string;
    title: string;
    views: number;
    avgTimeOnPage: number;
    engagementScore: number;
  }>;
  topCategories: Array<{
    categoryId: string;
    name: string;
    views: number;
    avgEngagement: number;
  }>;
};

type TrafficSourcesData = {
  byType: Array<{ type: string; count: number; percentage: number }>;
  bySocial: Array<{ platform: string; count: number; percentage: number }>;
  byReferrer: Array<{ domain: string; count: number; percentage: number }>;
};

type PeakHoursData = {
  hourly: Array<{ hour: number; count: number; avgEngagement: number }>;
  daily: Array<{ day: string; count: number; avgEngagement: number }>;
};

type NavigationPath = {
  fromPage: string;
  toPage: string;
  count: number;
  avgDwellTime: number;
};

type DeviceData = {
  byDevice: Array<{ device: string; count: number; percentage: number }>;
  byPlatform: Array<{ platform: string; count: number; percentage: number }>;
  byBrowser: Array<{ browser: string; count: number; percentage: number }>;
};

type CategoryData = Array<{
  categoryId: string;
  name: string;
  articleCount: number;
  totalViews: number;
  avgEngagement: number;
  topArticle: string | null;
}>;

type RealTimeData = {
  activeUsers: number;
  currentPageViews: number;
  topCurrentArticles: Array<{ articleId: string; title: string; viewers: number }>;
  recentEvents: Array<{ type: string; count: number; trend: number }>;
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}ث`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}د`;
  return `${Math.round(ms / 3600000)}س`;
}

function formatHour(hour: number): string {
  if (hour === 0) return "12 ص";
  if (hour < 12) return `${hour} ص`;
  if (hour === 12) return "12 م";
  return `${hour - 12} م`;
}

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  description,
  trend,
  isLoading 
}: { 
  title: string; 
  value: string | number; 
  icon: any; 
  description?: string;
  trend?: number;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-8 w-16" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-full bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold">{value}</p>
              {trend !== undefined && (
                <Badge 
                  variant={trend >= 0 ? "default" : "destructive"} 
                  className="text-xs"
                  data-testid={`trend-badge-${title}`}
                >
                  {trend >= 0 ? "+" : ""}{trend.toFixed(1)}%
                </Badge>
              )}
            </div>
            {description && (
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function HourlyChart({ data, isLoading }: { data: PeakHoursData["hourly"]; isLoading: boolean }) {
  if (isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  const maxCount = Math.max(...data.map(d => d.count), 1);

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-1 h-32">
        {Array.from({ length: 24 }, (_, hour) => {
          const hourData = data.find(d => d.hour === hour);
          const count = hourData?.count || 0;
          const height = (count / maxCount) * 100;
          return (
            <div
              key={hour}
              className="flex-1 bg-primary/20 hover:bg-primary/40 transition-colors rounded-t cursor-pointer group relative"
              style={{ height: `${Math.max(height, 4)}%` }}
              title={`${formatHour(hour)}: ${count} قراءة`}
              data-testid={`hourly-bar-${hour}`}
            >
              <div 
                className="absolute bottom-0 left-0 right-0 bg-primary rounded-t transition-all"
                style={{ height: `${(hourData?.avgEngagement || 0) * 100}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>12 ص</span>
        <span>6 ص</span>
        <span>12 م</span>
        <span>6 م</span>
        <span>12 ص</span>
      </div>
    </div>
  );
}

function DailyChart({ data, isLoading }: { data: PeakHoursData["daily"]; isLoading: boolean }) {
  if (isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const arabicDays = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const maxCount = Math.max(...data.map(d => d.count), 1);

  return (
    <div className="space-y-2">
      {days.map((day, index) => {
        const dayData = data.find(d => d.day.toLowerCase().trim() === day.toLowerCase());
        const count = dayData?.count || 0;
        const percentage = (count / maxCount) * 100;
        
        return (
          <div key={day} className="flex items-center gap-3" data-testid={`daily-row-${day}`}>
            <span className="w-16 text-sm text-muted-foreground">{arabicDays[index]}</span>
            <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
              <div 
                className="h-full bg-primary transition-all"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <span className="w-12 text-sm text-right">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

function TrafficSourcesList({ 
  data, 
  title, 
  isLoading 
}: { 
  data: Array<{ type?: string; platform?: string; domain?: string; count: number; percentage: number }>; 
  title: string;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map(i => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Globe className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">لا توجد بيانات بعد</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {data.slice(0, 10).map((item, index) => {
        const label = item.type || item.platform || item.domain || "غير معروف";
        return (
          <div 
            key={index} 
            className="flex items-center gap-3"
            data-testid={`traffic-source-${index}`}
          >
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{label}</span>
                <span className="text-sm text-muted-foreground">{item.percentage}%</span>
              </div>
              <Progress value={item.percentage} className="h-2" />
            </div>
            <span className="text-sm text-muted-foreground w-12 text-right">
              {item.count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function NavigationFlowChart({ data, isLoading }: { data: NavigationPath[]; isLoading: boolean }) {
  if (isLoading) {
    return <Skeleton className="h-60 w-full" />;
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <ArrowRight className="h-10 w-10 mx-auto mb-2 opacity-50" />
        <p className="text-sm">لا توجد مسارات تصفح مسجلة بعد</p>
        <p className="text-xs mt-1">ستظهر البيانات عند تفاعل المستخدمين مع المنصة</p>
      </div>
    );
  }

  const maxCount = Math.max(...data.map(d => d.count), 1);

  return (
    <div className="space-y-3">
      {data.slice(0, 10).map((path, index) => (
        <div 
          key={index} 
          className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
          data-testid={`navigation-path-${index}`}
        >
          <Badge variant="outline" className="min-w-20 justify-center">
            {path.fromPage === "direct" ? "مباشر" : path.fromPage}
          </Badge>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <Badge variant="secondary" className="min-w-20 justify-center">
            {path.toPage}
          </Badge>
          <div className="flex-1 h-2 bg-muted rounded mx-2">
            <div 
              className="h-full bg-primary rounded transition-all"
              style={{ width: `${(path.count / maxCount) * 100}%` }}
            />
          </div>
          <span className="text-sm text-muted-foreground min-w-16 text-left">
            {path.count} ({formatDuration(path.avgDwellTime)})
          </span>
        </div>
      ))}
    </div>
  );
}

function DeviceBreakdown({ data, isLoading }: { data: DeviceData | undefined; isLoading: boolean }) {
  if (isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (!data) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Smartphone className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">لا توجد بيانات أجهزة بعد</p>
      </div>
    );
  }

  const deviceIcons: Record<string, any> = {
    desktop: Monitor,
    mobile: Smartphone,
    tablet: Monitor,
    unknown: Monitor,
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="space-y-2">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Smartphone className="h-4 w-4" />
          نوع الجهاز
        </h4>
        {data.byDevice.length > 0 ? (
          data?.byDevice?.map((item, index) => {
            const DeviceIcon = deviceIcons[item.device.toLowerCase()] || Monitor;
            return (
              <div key={index} className="flex items-center gap-2" data-testid={`device-${item.device}`}>
                <DeviceIcon className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1 text-sm">{item.device}</span>
                <span className="text-sm text-muted-foreground">{item.percentage}%</span>
              </div>
            );
          })
        ) : (
          <p className="text-xs text-muted-foreground">لا توجد بيانات</p>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-medium">نظام التشغيل</h4>
        {data.byPlatform.length > 0 ? (
          data?.byPlatform?.slice(0, 5).map((item, index) => (
            <div key={index} className="flex items-center gap-2" data-testid={`platform-${item.platform}`}>
              <span className="flex-1 text-sm">{item.platform}</span>
              <span className="text-sm text-muted-foreground">{item.percentage}%</span>
            </div>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">لا توجد بيانات</p>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-medium">المتصفح</h4>
        {data.byBrowser.length > 0 ? (
          data?.byBrowser?.slice(0, 5).map((item, index) => (
            <div key={index} className="flex items-center gap-2" data-testid={`browser-${item.browser}`}>
              <span className="flex-1 text-sm">{item.browser}</span>
              <span className="text-sm text-muted-foreground">{item.percentage}%</span>
            </div>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">لا توجد بيانات</p>
        )}
      </div>
    </div>
  );
}

function RealTimePanel({ data, isLoading }: { data: RealTimeData | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">لا توجد بيانات لحظية</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <Card className="bg-green-500/10 border-green-500/20">
          <CardContent className="p-4 text-center">
            <Activity className="h-6 w-6 mx-auto mb-2 text-green-500" />
            <p className="text-3xl font-bold text-green-600">{data.activeUsers}</p>
            <p className="text-sm text-muted-foreground">مستخدم نشط الآن</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-500/10 border-blue-500/20">
          <CardContent className="p-4 text-center">
            <Eye className="h-6 w-6 mx-auto mb-2 text-blue-500" />
            <p className="text-3xl font-bold text-blue-600">{data.currentPageViews}</p>
            <p className="text-sm text-muted-foreground">مشاهدة صفحات</p>
          </CardContent>
        </Card>
      </div>

      {data.topCurrentArticles.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-500" />
            الأكثر قراءة الآن
          </h4>
          <div className="space-y-2">
            {data?.topCurrentArticles?.map((article, index) => (
              <div 
                key={article.articleId} 
                className="flex items-center gap-3 p-2 rounded-lg bg-muted/50"
                data-testid={`realtime-article-${article.articleId}`}
              >
                <Badge variant="outline" className="min-w-8 justify-center">
                  {index + 1}
                </Badge>
                <span className="flex-1 text-sm truncate">{article.title || "بدون عنوان"}</span>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Eye className="h-3 w-3" />
                  <span>{article.viewers}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TopArticlesList({ data, isLoading }: { data: OverviewData["topArticles"]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map(i => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">لا توجد مقالات مقروءة بعد</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {data.map((article, index) => (
        <div 
          key={article.articleId}
          className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
          data-testid={`top-article-${article.articleId}`}
        >
          <Badge variant="outline" className="min-w-8 justify-center font-bold">
            {index + 1}
          </Badge>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{article.title || "بدون عنوان"}</p>
            <p className="text-xs text-muted-foreground">
              {article.views} مشاهدة • {formatDuration(article.avgTimeOnPage * 1000)} متوسط القراءة
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge 
              variant={article.engagementScore > 0.5 ? "default" : "secondary"}
              className="text-xs"
            >
              {(article.engagementScore * 100).toFixed(0)}% تفاعل
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

function TopCategoriesList({ data, isLoading }: { data: CategoryData; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map(i => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">لا توجد بيانات أقسام</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {data.slice(0, 10).map((category, index) => (
        <div 
          key={category.categoryId}
          className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
          data-testid={`top-category-${category.categoryId}`}
        >
          <Badge variant="outline" className="min-w-8 justify-center font-bold">
            {index + 1}
          </Badge>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{category.name}</p>
            <p className="text-xs text-muted-foreground">
              {category.articleCount} مقال • {category.totalViews} مشاهدة
            </p>
          </div>
          <Badge 
            variant={category.avgEngagement > 0.5 ? "default" : "secondary"}
            className="text-xs"
          >
            {(category.avgEngagement * 100).toFixed(0)}%
          </Badge>
        </div>
      ))}
    </div>
  );
}

export default function AdvancedAnalytics() {
  const [range, setRange] = useState("7");
  
  const { data: overview, isLoading: overviewLoading, refetch: refetchOverview } = useQuery<OverviewData>({
    queryKey: [`/api/advanced-analytics/overview?range=${range}`],
  });
  
  const { data: trafficSources, isLoading: trafficLoading } = useQuery<TrafficSourcesData>({
    queryKey: [`/api/advanced-analytics/sources?range=${range}`],
  });
  
  const { data: peakHours, isLoading: peakLoading } = useQuery<PeakHoursData>({
    queryKey: [`/api/advanced-analytics/peak-hours?range=${range}`],
  });
  
  const { data: navigationPaths, isLoading: navLoading } = useQuery<NavigationPath[]>({
    queryKey: [`/api/advanced-analytics/paths?range=${range}`],
  });
  
  const { data: deviceData, isLoading: deviceLoading } = useQuery<DeviceData>({
    queryKey: [`/api/advanced-analytics/devices?range=${range}`],
  });
  
  const { data: categoryData, isLoading: categoryLoading } = useQuery<CategoryData>({
    queryKey: [`/api/advanced-analytics/categories?range=${range}`],
  });
  
  const { data: realTimeData, isLoading: realTimeLoading, refetch: refetchRealTime } = useQuery<RealTimeData>({
    queryKey: ["/api/advanced-analytics/realtime"],
    refetchInterval: 180000, // 3 min (was 30s)
  });

  const handleRefresh = () => {
    refetchOverview();
    refetchRealTime();
  };

  return (
    <div className="container mx-auto py-6 space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6" />
            تحليلات سلوك القراء المتقدمة
          </h1>
          <p className="text-muted-foreground mt-1">
            تتبع دقيق لكيفية تفاعل القراء مع المحتوى
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            data-testid="button-refresh-analytics"
          >
            <RefreshCw className="h-4 w-4 ml-2" />
            تحديث
          </Button>
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-36" data-testid="select-date-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">اليوم</SelectItem>
              <SelectItem value="7">7 أيام</SelectItem>
              <SelectItem value="30">30 يوم</SelectItem>
              <SelectItem value="90">90 يوم</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="إجمالي الجلسات"
          value={overview?.sessions.total.toLocaleString() || "0"}
          icon={Users}
          description={`${overview?.sessions.uniqueUsers.toLocaleString() || 0} مستخدم فريد`}
          isLoading={overviewLoading}
        />
        <StatCard
          title="متوسط مدة الجلسة"
          value={formatDuration(overview?.sessions.avgDuration || 0)}
          icon={Clock}
          description={`${overview?.sessions.avgPagesPerSession.toFixed(1) || 0} صفحات/جلسة`}
          isLoading={overviewLoading}
        />
        <StatCard
          title="عمق التمرير"
          value={`${overview?.engagement.avgScrollDepth.toFixed(0) || 0}%`}
          icon={MousePointer}
          description="متوسط نسبة قراءة المقال"
          isLoading={overviewLoading}
        />
        <StatCard
          title="معدل الإكمال"
          value={`${((overview?.engagement?.completionRate ?? 0) * 100).toFixed(0)}%`}
          icon={TrendingUp}
          description="نسبة إتمام القراءة"
          isLoading={overviewLoading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-green-500" />
              لحظي - الآن
            </CardTitle>
            <CardDescription>النشاط المباشر على المنصة</CardDescription>
          </CardHeader>
          <CardContent>
            <RealTimePanel data={realTimeData} isLoading={realTimeLoading} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              أوقات الذروة
            </CardTitle>
            <CardDescription>توزيع القراءات على مدار اليوم</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="hourly">
              <TabsList className="mb-4">
                <TabsTrigger value="hourly" data-testid="tab-hourly">الساعات</TabsTrigger>
                <TabsTrigger value="daily" data-testid="tab-daily">الأيام</TabsTrigger>
              </TabsList>
              <TabsContent value="hourly">
                <HourlyChart data={peakHours?.hourly || []} isLoading={peakLoading} />
              </TabsContent>
              <TabsContent value="daily">
                <DailyChart data={peakHours?.daily || []} isLoading={peakLoading} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              المقالات الأكثر قراءة
            </CardTitle>
            <CardDescription>ترتيب المقالات حسب عدد المشاهدات والتفاعل</CardDescription>
          </CardHeader>
          <CardContent>
            <TopArticlesList data={overview?.topArticles || []} isLoading={overviewLoading} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              أداء الأقسام
            </CardTitle>
            <CardDescription>تحليل أداء كل قسم من أقسام المنصة</CardDescription>
          </CardHeader>
          <CardContent>
            <TopCategoriesList data={categoryData || []} isLoading={categoryLoading} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowRight className="h-5 w-5" />
            مسارات التصفح
          </CardTitle>
          <CardDescription>كيف ينتقل القراء بين صفحات المنصة</CardDescription>
        </CardHeader>
        <CardContent>
          <NavigationFlowChart data={navigationPaths || []} isLoading={navLoading} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              مصادر الزيارات
            </CardTitle>
            <CardDescription>من أين يأتي القراء</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="type">
              <TabsList className="mb-4">
                <TabsTrigger value="type" data-testid="tab-source-type">النوع</TabsTrigger>
                <TabsTrigger value="social" data-testid="tab-source-social">السوشيال</TabsTrigger>
                <TabsTrigger value="referrer" data-testid="tab-source-referrer">المحيل</TabsTrigger>
              </TabsList>
              <TabsContent value="type">
                <TrafficSourcesList 
                  data={trafficSources?.byType || []} 
                  title="نوع المصدر"
                  isLoading={trafficLoading}
                />
              </TabsContent>
              <TabsContent value="social">
                <TrafficSourcesList 
                  data={trafficSources?.bySocial || []} 
                  title="منصة التواصل"
                  isLoading={trafficLoading}
                />
              </TabsContent>
              <TabsContent value="referrer">
                <TrafficSourcesList 
                  data={trafficSources?.byReferrer || []} 
                  title="الموقع المحيل"
                  isLoading={trafficLoading}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              الأجهزة والمتصفحات
            </CardTitle>
            <CardDescription>ما يستخدمه القراء للوصول إلى المنصة</CardDescription>
          </CardHeader>
          <CardContent>
            <DeviceBreakdown data={deviceData} isLoading={deviceLoading} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            الزوار الجدد vs العائدون
          </CardTitle>
          <CardDescription>تحليل ولاء القراء</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-full bg-green-500/20">
                  <Users className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">
                    {overview?.sessions.newVisitors.toLocaleString() || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">زائر جديد</p>
                </div>
              </div>
            </div>
            <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-full bg-blue-500/20">
                  <RefreshCw className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-blue-600">
                    {overview?.sessions.returningVisitors.toLocaleString() || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">زائر عائد</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
