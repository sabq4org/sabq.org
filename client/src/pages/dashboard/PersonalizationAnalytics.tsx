import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Users, 
  Target, 
  Heart, 
  Activity,
  TrendingUp,
  Zap,
  BarChart3,
  AlertCircle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

interface PersonalizationAnalytics {
  segments: Array<{
    name: string;
    nameAr: string;
    count: number;
    color: string;
  }>;
  recommendationPerformance: Array<{
    type: string;
    typeAr: string;
    impressions: number;
    clicks: number;
    ctr: number;
    color: string;
  }>;
  interestDistribution: Array<{
    category: string;
    categoryAr: string;
    count: number;
    color: string;
  }>;
  activityMetrics: {
    totalInteractions: number;
    avgArticlesPerUser: number;
    mostActiveSegment: string;
    mostActiveSegmentAr: string;
    activeUsersToday: number;
  };
}

const CHART_COLORS = [
  '#10b981', // emerald
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
];

function LoadingState() {
  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="page-personalization-analytics-loading">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="h-8 w-64" />
        </div>
        
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        
        <div className="grid gap-6 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-80" />
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}

function EmptyState() {
  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="page-personalization-analytics-empty">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Target className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-3xl font-bold">تحليلات التخصيص</h1>
        </div>
        
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-2xl font-bold mb-2">لا توجد بيانات تخصيص حتى الآن</h2>
            <p className="text-muted-foreground text-center max-w-md">
              ستظهر البيانات هنا بمجرد بدء المستخدمين بالتفاعل مع نظام التوصيات
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

export default function PersonalizationAnalytics() {
  const { data: analytics, isLoading } = useQuery<PersonalizationAnalytics>({
    queryKey: ['/api/admin/personalization/analytics'],
  });

  if (isLoading) {
    return <LoadingState />;
  }

  if (!analytics || analytics.activityMetrics.totalInteractions === 0) {
    return <EmptyState />;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl" data-testid="page-personalization-analytics">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Target className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">تحليلات التخصيص</h1>
            <p className="text-muted-foreground mt-1">
              تحليل شامل لتجربة المستخدم المخصصة وأداء نظام التوصيات
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                إجمالي التفاعلات
              </CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-interactions">
                {analytics.activityMetrics.totalInteractions.toLocaleString('en-US')}
              </div>
              <p className="text-xs text-muted-foreground">
                تفاعل مُسجَّل
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                متوسط المقالات لكل مستخدم
              </CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-avg-articles">
                {analytics.activityMetrics.avgArticlesPerUser.toFixed(1)}
              </div>
              <p className="text-xs text-muted-foreground">
                مقال لكل مستخدم
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                الشريحة الأكثر نشاطاً
              </CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold" data-testid="text-most-active-segment">
                {analytics.activityMetrics.mostActiveSegmentAr}
              </div>
              <p className="text-xs text-muted-foreground">
                أعلى معدل تفاعل
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                المستخدمون النشطون اليوم
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-active-users">
                {analytics.activityMetrics.activeUsersToday.toLocaleString('en-US')}
              </div>
              <p className="text-xs text-muted-foreground">
                مستخدم نشط
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <CardTitle>توزيع شرائح المستخدمين</CardTitle>
              </div>
              <CardDescription>
                عدد المستخدمين في كل شريحة
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300} data-testid="chart-segments">
                <BarChart data={analytics.segments} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis 
                    dataKey="nameAr" 
                    type="category" 
                    width={100}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip 
                    formatter={(value: number) => [value.toLocaleString('en-US'), 'عدد المستخدمين']}
                    labelFormatter={(label) => label}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {analytics?.segments?.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color || CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              
              <div className="mt-4 space-y-2">
                {analytics?.segments?.map((segment, index) => (
                  <div key={index} className="flex items-center justify-between p-2 rounded-lg border">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: segment.color || CHART_COLORS[index % CHART_COLORS.length] }}
                      />
                      <span className="text-sm font-medium">{segment.nameAr}</span>
                    </div>
                    <Badge variant="outline">{segment.count.toLocaleString('en-US')}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                <CardTitle>أداء أنواع التوصيات</CardTitle>
              </div>
              <CardDescription>
                مقارنة معدل النقر حسب نوع التوصية
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300} data-testid="chart-recommendation-performance">
                <BarChart data={analytics.recommendationPerformance}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="typeAr" 
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis 
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <Tooltip 
                    formatter={(value: number, name: string) => {
                      if (name === 'ctr') return [`${value.toFixed(1)}%`, 'معدل النقر'];
                      return [value.toLocaleString('en-US'), name === 'impressions' ? 'مرات الظهور' : 'النقرات'];
                    }}
                  />
                  <Legend 
                    formatter={(value) => {
                      const labels: Record<string, string> = {
                        ctr: 'معدل النقر %',
                      };
                      return labels[value] || value;
                    }}
                  />
                  <Bar dataKey="ctr" name="ctr" radius={[4, 4, 0, 0]}>
                    {analytics?.recommendationPerformance?.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color || CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              
              <div className="mt-4 space-y-2">
                {analytics?.recommendationPerformance?.map((item, index) => (
                  <div key={index} className="flex items-center justify-between p-2 rounded-lg border">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: item.color || CHART_COLORS[index % CHART_COLORS.length] }}
                      />
                      <span className="text-sm font-medium">{item.typeAr}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">{item.impressions.toLocaleString('en-US')} ظهور</span>
                      <Badge variant="outline">{item.ctr.toFixed(1)}%</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-primary" />
                <CardTitle>توزيع اهتمامات المستخدمين</CardTitle>
              </div>
              <CardDescription>
                نسب الاهتمام بالتصنيفات المختلفة
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center">
                <ResponsiveContainer width="100%" height={250} data-testid="chart-interests">
                  <PieChart>
                    <Pie
                      data={analytics.interestDistribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => `${entry.categoryAr}`}
                      outerRadius={80}
                      innerRadius={40}
                      fill="#8884d8"
                      dataKey="count"
                    >
                      {analytics?.interestDistribution?.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color || CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number) => [value.toLocaleString('en-US'), 'عدد المستخدمين']}
                    />
                  </PieChart>
                </ResponsiveContainer>
                
                <div className="mt-4 w-full space-y-2">
                  {analytics?.interestDistribution?.map((item, index) => {
                    const total = analytics?.interestDistribution?.reduce((sum, i) => sum + i.count, 0);
                    const percent = total > 0 ? ((item.count / total) * 100).toFixed(1) : '0';
                    return (
                      <div key={index} className="flex items-center justify-between p-2 rounded-lg border">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: item.color || CHART_COLORS[index % CHART_COLORS.length] }}
                          />
                          <span className="text-sm font-medium">{item.categoryAr}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{percent}%</Badge>
                          <span className="text-sm text-muted-foreground">
                            {item.count.toLocaleString('en-US')}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                <CardTitle>ملخص الأداء</CardTitle>
              </div>
              <CardDescription>
                نظرة سريعة على مؤشرات الأداء الرئيسية
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-muted-foreground">أفضل أنواع التوصيات أداءً</h4>
                  {analytics.recommendationPerformance
                    .sort((a, b) => b.ctr - a.ctr)
                    .slice(0, 3)
                    .map((item, index) => (
                      <div key={index} className="flex items-center gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-sm font-bold text-primary">{index + 1}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{item.typeAr}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.clicks.toLocaleString('en-US')} نقرة من {item.impressions.toLocaleString('en-US')} ظهور
                          </p>
                        </div>
                        <Badge 
                          variant={index === 0 ? "default" : "outline"}
                          className={index === 0 ? "bg-emerald-500" : ""}
                        >
                          {item.ctr.toFixed(1)}%
                        </Badge>
                      </div>
                    ))}
                </div>

                <div className="border-t pt-4 space-y-4">
                  <h4 className="text-sm font-medium text-muted-foreground">أكبر شرائح المستخدمين</h4>
                  {analytics.segments
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 3)
                    .map((segment, index) => (
                      <div key={index} className="flex items-center gap-3">
                        <div 
                          className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: `${segment.color || CHART_COLORS[index]}20` }}
                        >
                          <Users 
                            className="h-4 w-4" 
                            style={{ color: segment.color || CHART_COLORS[index] }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{segment.nameAr}</p>
                        </div>
                        <span className="text-sm font-medium">
                          {segment.count.toLocaleString('en-US')} مستخدم
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
