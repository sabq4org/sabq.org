import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Eye, 
  MousePointerClick,
  Lightbulb,
  AlertCircle,
  FileText,
  Target,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

interface RecommendationAnalytics {
  period: {
    days: number;
    startDate: string;
    endDate: string;
  };
  overview: {
    totalRecommendations: number;
    uniqueUsers: number;
    clickThroughRate: number;
    viewRate: number;
    totalViewed: number;
    totalClicked: number;
  };
  dailyTrend: Array<{
    date: string;
    count: number;
  }>;
  byReason: Array<{
    reason: string;
    count: number;
    avgScore: number;
  }>;
  topArticles: Array<{
    articleId: string;
    title: string;
    count: number;
    avgScore: number;
  }>;
  engagementByReason: Array<{
    reason: string;
    totalSent: number;
    totalClicked: number;
    ctr: number;
  }>;
}

const reasonLabels: Record<string, string> = {
  PersonalizedContent: "محتوى مخصص",
  TrendingInInterest: "رائج في اهتماماتك",
  SimilarToRecent: "مشابه لما قرأت",
  CrossCategory: "اكتشف محتوى جديد",
  because_you_liked: "لأنك أعجبت بـ",
  similar_to_saved: "مشابه لما حفظت",
  within_reads: "من قراءاتك",
  trending_for_you: "رائج بالنسبة لك",
};

const getReasonLabel = (reason: string) => reasonLabels[reason] || reason;

export default function RecommendationAnalytics() {
  const [period, setPeriod] = useState<"7" | "30" | "90">("7");

  const { data, isLoading, error } = useQuery<RecommendationAnalytics>({
    queryKey: [`/api/admin/recommendations/analytics?days=${period}`],
  });

  if (error) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[400px] text-center">
          <AlertCircle className="h-16 w-16 text-destructive mb-4" />
          <h2 className="text-2xl font-bold mb-2">حدث خطأ</h2>
          <p className="text-muted-foreground" data-testid="text-error">
            فشل تحميل إحصائيات التوصيات. يرجى المحاولة مرة أخرى.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-yellow-500 to-orange-600">
              <Lightbulb className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold" data-testid="text-page-title">
                إحصائيات نظام التوصيات الذكية
              </h1>
              <p className="text-muted-foreground mt-1">
                تحليل شامل لأداء نظام التوصيات والتفاعل مع المستخدمين
              </p>
            </div>
          </div>

          {/* Period Selector */}
          <Tabs value={period} onValueChange={(v) => setPeriod(v as "7" | "30" | "90")}>
            <TabsList data-testid="tabs-period">
              <TabsTrigger value="7" data-testid="tab-7days">آخر 7 أيام</TabsTrigger>
              <TabsTrigger value="30" data-testid="tab-30days">آخر 30 يوم</TabsTrigger>
              <TabsTrigger value="90" data-testid="tab-90days">آخر 90 يوم</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
            <p className="text-muted-foreground" data-testid="text-loading">
              جاري تحميل الإحصائيات...
            </p>
          </div>
        ) : data ? (
          <>
            {/* Overview Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card className="hover-elevate active-elevate-2 transition-all bg-purple-50 dark:bg-purple-950/30" data-testid="card-total-recommendations">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    إجمالي التوصيات
                  </CardTitle>
                  <div className="p-2 rounded-md bg-purple-500/20">
                    <FileText className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-total-recommendations">
                    {data.overview.totalRecommendations.toLocaleString('en-US')}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    تم إرسالها خلال الفترة المحددة
                  </p>
                </CardContent>
              </Card>

              <Card className="hover-elevate active-elevate-2 transition-all bg-blue-50 dark:bg-blue-950/30" data-testid="card-unique-users">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    مستخدمون نشطون
                  </CardTitle>
                  <div className="p-2 rounded-md bg-blue-500/20">
                    <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-unique-users">
                    {data.overview.uniqueUsers.toLocaleString('en-US')}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    تلقوا توصيات خلال الفترة
                  </p>
                </CardContent>
              </Card>

              <Card className="hover-elevate active-elevate-2 transition-all bg-green-50 dark:bg-green-950/30" data-testid="card-view-rate">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    معدل المشاهدة
                  </CardTitle>
                  <div className="p-2 rounded-md bg-green-500/20">
                    <Eye className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-view-rate">
                    {data.overview.viewRate.toFixed(1)}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {data.overview.totalViewed.toLocaleString('en-US')} مشاهدة
                  </p>
                </CardContent>
              </Card>

              <Card className="hover-elevate active-elevate-2 transition-all bg-amber-50 dark:bg-amber-950/30" data-testid="card-ctr">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    نسبة النقر (CTR)
                  </CardTitle>
                  <div className="p-2 rounded-md bg-amber-500/20">
                    <MousePointerClick className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-400" data-testid="text-ctr">
                    {data.overview.clickThroughRate.toFixed(1)}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {data.overview.totalClicked.toLocaleString('en-US')} نقرة
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Daily Trend Chart */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  <CardTitle>الاتجاه اليومي للتوصيات</CardTitle>
                </div>
                <CardDescription>
                  عدد التوصيات المرسلة يومياً خلال الفترة المحددة
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data.dailyTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => new Date(value).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })}
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip 
                      labelFormatter={(value) => new Date(value).toLocaleDateString('ar-EG')}
                      formatter={(value: number) => [value.toLocaleString('en-US'), 'التوصيات']}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="count" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      name="عدد التوصيات"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Two Column Layout */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* Recommendations by Type */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-primary" />
                    <CardTitle>التوصيات حسب النوع</CardTitle>
                  </div>
                  <CardDescription>
                    توزيع التوصيات على الأنواع المختلفة
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data.byReason}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="reason" 
                        tick={{ fontSize: 11 }}
                        tickFormatter={getReasonLabel}
                      />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip 
                        labelFormatter={getReasonLabel}
                        formatter={(value: number, name: string) => {
                          if (name === 'count') return [value.toLocaleString('en-US'), 'العدد'];
                          if (name === 'avgScore') return [value.toFixed(2), 'متوسط النقاط'];
                          return value;
                        }}
                      />
                      <Legend />
                      <Bar dataKey="count" fill="hsl(var(--primary))" name="العدد" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Engagement by Type */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    <CardTitle>التفاعل حسب النوع</CardTitle>
                  </div>
                  <CardDescription>
                    نسبة النقر (CTR) لكل نوع من التوصيات
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {data?.engagementByReason?.map((item) => (
                      <div key={item.reason} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">
                            {getReasonLabel(item.reason)}
                          </span>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" data-testid={`badge-ctr-${item.reason}`}>
                              {item.ctr.toFixed(1)}%
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {item.totalClicked}/{item.totalSent}
                            </span>
                          </div>
                        </div>
                        <div className="w-full bg-secondary rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full transition-all"
                            style={{ width: `${Math.min(item.ctr, 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Top Recommended Articles */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <CardTitle>أكثر المقالات الموصى بها</CardTitle>
                </div>
                <CardDescription>
                  المقالات التي تم التوصية بها أكثر من غيرها
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data?.topArticles?.map((article, index) => (
                    <div
                      key={article.articleId}
                      className="flex items-center justify-between p-3 rounded-lg border hover-elevate"
                      data-testid={`article-${article.articleId}`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-sm font-bold text-primary">
                            {index + 1}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate" title={article.title}>
                            {article.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            متوسط النقاط: {article.avgScore.toFixed(2)}
                          </p>
                        </div>
                      </div>
                      <Badge variant="secondary" data-testid={`badge-count-${article.articleId}`}>
                        {article.count.toLocaleString('en-US')} توصية
                      </Badge>
                    </div>
                  ))}
                  {data.topArticles.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      لا توجد بيانات متاحة
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
