import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Eye, MousePointer, X as XIcon, TrendingUp } from "lucide-react";

interface AnalyticsData {
  summary: {
    totalImpressions: number;
    uniqueViews: number;
    dismissals: number;
    clicks: number;
    ctr: number;
  };
  byChannel: Array<{
    channel: string;
    impressions: number;
    views: number;
    clicks: number;
  }>;
  dailyTrend: Array<{
    date: string;
    impressions: number;
    views: number;
  }>;
}

export default function AnnouncementAnalytics() {
  const { id } = useParams<{ id: string }>();

  const { data: analytics, isLoading } = useQuery<AnalyticsData>({
    queryKey: ['/api/announcements', id, 'analytics'],
    enabled: !!id,
  });

  const getChannelLabel = (channel: string) => {
    const labels: Record<string, string> = {
      dashboard: 'لوحة التحكم',
      email: 'البريد الإلكتروني',
      mobile: 'تطبيق الجوال',
      web: 'الموقع',
    };
    return labels[channel] || channel;
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('ar-SA').format(num);
  };

  const formatPercentage = (num: number) => {
    return `${(num * 100).toFixed(2)}%`;
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="container mx-auto p-3 md:p-6 space-y-4 md:space-y-6" dir="rtl">
          <Skeleton className="h-12 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </DashboardLayout>
    );
  }

  if (!analytics) {
    return (
      <DashboardLayout>
        <div className="container mx-auto p-3 md:p-6" dir="rtl">
          <p className="text-sm md:text-base text-muted-foreground">لا توجد بيانات تحليلية</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto p-3 md:p-6 space-y-4 md:space-y-6" dir="rtl">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">تحليلات الإعلان</h1>
          <p className="text-sm md:text-base text-muted-foreground mt-2">
            إحصائيات مفصلة حول أداء الإعلان
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs md:text-sm font-medium">إجمالي الظهور</CardTitle>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl md:text-2xl font-bold" data-testid="stat-total-impressions">
                {formatNumber(analytics.summary.totalImpressions)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs md:text-sm font-medium">المشاهدات الفريدة</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl md:text-2xl font-bold" data-testid="stat-unique-views">
                {formatNumber(analytics.summary.uniqueViews)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs md:text-sm font-medium">الإغلاقات</CardTitle>
              <XIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl md:text-2xl font-bold" data-testid="stat-dismissals">
                {formatNumber(analytics.summary.dismissals)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs md:text-sm font-medium">النقرات</CardTitle>
              <MousePointer className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl md:text-2xl font-bold" data-testid="stat-clicks">
                {formatNumber(analytics.summary.clicks)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                معدل النقر: {formatPercentage(analytics.summary.ctr)}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base md:text-lg">الأداء حسب القناة</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analytics.byChannel} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis 
                  type="category" 
                  dataKey="channel" 
                  tickFormatter={getChannelLabel}
                  width={120}
                />
                <Tooltip 
                  formatter={(value: number) => formatNumber(value)}
                  labelFormatter={getChannelLabel}
                />
                <Bar dataKey="impressions" fill="#8884d8" name="الظهور" />
                <Bar dataKey="views" fill="#82ca9d" name="المشاهدات" />
                <Bar dataKey="clicks" fill="#ffc658" name="النقرات" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base md:text-lg">اتجاه المشاهدات اليومية</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analytics.dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date"
                  tickFormatter={(date) => new Date(date).toLocaleDateString('ar-SA-u-ca-gregory', { month: 'short', day: 'numeric' })}
                />
                <YAxis />
                <Tooltip 
                  formatter={(value: number) => formatNumber(value)}
                  labelFormatter={(date) => new Date(date).toLocaleDateString('ar-SA-u-ca-gregory')}
                />
                <Line 
                  type="monotone" 
                  dataKey="impressions" 
                  stroke="#8884d8" 
                  name="الظهور"
                  strokeWidth={2}
                />
                <Line 
                  type="monotone" 
                  dataKey="views" 
                  stroke="#82ca9d" 
                  name="المشاهدات"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
