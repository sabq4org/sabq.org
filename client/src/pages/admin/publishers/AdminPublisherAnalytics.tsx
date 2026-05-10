import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoleProtection } from "@/hooks/useRoleProtection";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  TrendingUp, 
  Users, 
  CreditCard, 
  FileText, 
  DollarSign,
  Building2,
  Activity,
  CheckCircle,
  XCircle,
  Clock
} from "lucide-react";
import type { Publisher, PublisherCredit, Article } from "@shared/schema";

interface AnalyticsData {
  totalPublishers: number;
  activePublishers: number;
  totalCreditsSold: number;
  creditsUsed: number;
  creditsRemaining: number;
  totalRevenue: number;
  totalArticles: number;
  publishedArticles: number;
  pendingArticles: number;
  rejectedArticles: number;
  topPublishers: Array<{
    publisher: Publisher;
    articlesCount: number;
    creditsUsed: number;
  }>;
}

interface ChartData {
  label: string;
  value: number;
  color?: string;
}

export default function AdminPublisherAnalytics() {
  useRoleProtection('admin');
  const [timeRange, setTimeRange] = useState<"7days" | "30days" | "all">("30days");

  // Fetch publishers
  const { data: publishersData } = useQuery<{
    publishers: Publisher[];
    total: number;
  }>({
    queryKey: ["/api/admin/publishers", { limit: 1000 }],
  });

  // Fetch all articles
  const { data: articlesData } = useQuery<{
    articles: Article[];
    total: number;
  }>({
    queryKey: ["/api/admin/publishers/articles", { limit: 1000 }],
  });

  // Calculate analytics
  const analytics = useMemo<AnalyticsData>(() => {
    const publishers = publishersData?.publishers || [];
    const articles = articlesData?.articles || [];

    const activePublishers = publishers.filter(p => p.isActive && !p.suspendedUntil);
    
    const publishedArticles = articles.filter(a => a.status === "published");
    const pendingArticles = articles.filter(a => a.status === "draft");
    const rejectedArticles = articles.filter(a => a.status === "archived");

    // Calculate credits (would need actual credit data from API)
    const totalCreditsSold = 0; // This should come from backend
    const creditsUsed = publishedArticles.length;
    const creditsRemaining = totalCreditsSold - creditsUsed;

    // Calculate revenue (would need actual pricing data)
    const totalRevenue = 0;

    // Top publishers by articles
    const publisherArticleCounts = new Map<string, number>();
    articles.forEach(article => {
      const count = publisherArticleCounts.get(article.authorId) || 0;
      publisherArticleCounts.set(article.authorId, count + 1);
    });

    const topPublishers = publishers
      .map(publisher => ({
        publisher,
        articlesCount: publisherArticleCounts.get(publisher.userId) || 0,
        creditsUsed: publisherArticleCounts.get(publisher.userId) || 0,
      }))
      .sort((a, b) => b.articlesCount - a.articlesCount)
      .slice(0, 5);

    return {
      totalPublishers: publishers.length,
      activePublishers: activePublishers.length,
      totalCreditsSold,
      creditsUsed,
      creditsRemaining,
      totalRevenue,
      totalArticles: articles.length,
      publishedArticles: publishedArticles.length,
      pendingArticles: pendingArticles.length,
      rejectedArticles: rejectedArticles.length,
      topPublishers,
    };
  }, [publishersData, articlesData]);

  const approvalRateData: ChartData[] = [
    { label: "منشور", value: analytics.publishedArticles, color: "hsl(var(--chart-1))" },
    { label: "قيد المراجعة", value: analytics.pendingArticles, color: "hsl(var(--chart-2))" },
    { label: "مرفوض", value: analytics.rejectedArticles, color: "hsl(var(--chart-3))" },
  ];

  const totalArticlesForChart = analytics.publishedArticles + analytics.pendingArticles + analytics.rejectedArticles;

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            تحليلات الناشرين
          </h1>
          <p className="text-muted-foreground">
            تقارير وإحصائيات شاملة عن الناشرين والمقالات
          </p>
        </div>
        <div className="w-48">
          <Select value={timeRange} onValueChange={(v: any) => setTimeRange(v)}>
            <SelectTrigger data-testid="select-time-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7days">آخر 7 أيام</SelectItem>
              <SelectItem value="30days">آخر 30 يوم</SelectItem>
              <SelectItem value="all">جميع الفترات</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الناشرين</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-publishers">
              {analytics.totalPublishers}
            </div>
            <p className="text-xs text-muted-foreground">
              نشط: {analytics.activePublishers}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الرصيد المباع</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-credits-sold">
              {analytics.totalCreditsSold || "-"}
            </div>
            <p className="text-xs text-muted-foreground">
              مستخدم: {analytics.creditsUsed}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي المقالات</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-articles">
              {analytics.totalArticles}
            </div>
            <p className="text-xs text-muted-foreground">
              منشور: {analytics.publishedArticles}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">الإيرادات</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-revenue">
              {analytics.totalRevenue || "-"} ريال
            </div>
            <p className="text-xs text-muted-foreground">
              من باقات الرصيد
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Article Approval Rate */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              نسبة الموافقة على المقالات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {approvalRateData.map((item, index) => {
                const percentage = totalArticlesForChart > 0 
                  ? ((item.value / totalArticlesForChart) * 100).toFixed(1)
                  : "0";
                
                return (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: item.color }}
                        />
                        <span>{item.label}</span>
                      </div>
                      <span className="font-medium">{item.value} ({percentage}%)</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full transition-all"
                        style={{ 
                          width: `${percentage}%`,
                          backgroundColor: item.color 
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {totalArticlesForChart === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                لا توجد بيانات لعرضها
              </div>
            )}
          </CardContent>
        </Card>

        {/* Credits Usage */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              استخدام الرصيد
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>الرصيد المستخدم</span>
                  <span className="font-medium text-green-600">
                    {analytics.creditsUsed}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-green-600 transition-all"
                    style={{ 
                      width: analytics.totalCreditsSold > 0 
                        ? `${(analytics.creditsUsed / analytics.totalCreditsSold) * 100}%`
                        : '0%'
                    }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>الرصيد المتبقي</span>
                  <span className="font-medium text-blue-600">
                    {analytics.creditsRemaining || 0}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-600 transition-all"
                    style={{ 
                      width: analytics.totalCreditsSold > 0
                        ? `${(analytics.creditsRemaining / analytics.totalCreditsSold) * 100}%`
                        : '0%'
                    }}
                  />
                </div>
              </div>

              <div className="pt-4 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">إجمالي الرصيد</span>
                  <span className="text-lg font-bold">
                    {analytics.totalCreditsSold || "-"}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Publishers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            أكثر الناشرين نشاطاً
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(analytics?.topPublishers?.length ?? 0) > 0 ? (
            <div className="space-y-4">
              {analytics?.topPublishers?.map((item, index) => (
                <div 
                  key={item.publisher.id}
                  className="flex items-center justify-between p-3 rounded-md border hover-elevate"
                  data-testid={`publisher-rank-${index + 1}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium">{item.publisher.agencyName}</p>
                      {item.publisher.agencyNameEn && (
                        <p className="text-sm text-muted-foreground">
                          {item.publisher.agencyNameEn}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <p className="text-2xl font-bold">{item.articlesCount}</p>
                      <p className="text-xs text-muted-foreground">مقالة</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold">{item.creditsUsed}</p>
                      <p className="text-xs text-muted-foreground">رصيد مستخدم</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              لا توجد بيانات لعرضها
            </div>
          )}
        </CardContent>
      </Card>

      {/* Article Status Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">مقالات منشورة</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {analytics.publishedArticles}
            </div>
            <p className="text-xs text-muted-foreground">
              {totalArticlesForChart > 0 
                ? `${((analytics.publishedArticles / totalArticlesForChart) * 100).toFixed(1)}%`
                : "0%"} من الإجمالي
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">قيد المراجعة</CardTitle>
            <Clock className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {analytics.pendingArticles}
            </div>
            <p className="text-xs text-muted-foreground">
              {totalArticlesForChart > 0
                ? `${((analytics.pendingArticles / totalArticlesForChart) * 100).toFixed(1)}%`
                : "0%"} من الإجمالي
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">مقالات مرفوضة</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {analytics.rejectedArticles}
            </div>
            <p className="text-xs text-muted-foreground">
              {totalArticlesForChart > 0
                ? `${((analytics.rejectedArticles / totalArticlesForChart) * 100).toFixed(1)}%`
                : "0%"} من الإجمالي
            </p>
          </CardContent>
        </Card>
      </div>
      </div>
    </DashboardLayout>
  );
}
