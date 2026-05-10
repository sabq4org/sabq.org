import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SentimentIndicator } from "@/components/SentimentIndicator";
import { 
  Brain, 
  MessageSquare, 
  TrendingUp, 
  FileText,
  Percent,
  Calendar,
  AlertCircle,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { formatDistanceToNow } from "date-fns";
import { arSA } from "date-fns/locale";
import { Link } from "wouter";

interface SentimentAnalytics {
  distribution: {
    positive: number;
    neutral: number;
    negative: number;
    total: number;
  };
  trend: Array<{
    date: string;
    positive: number;
    neutral: number;
    negative: number;
  }>;
  topArticles: Array<{
    id: string;
    title: string;
    slug: string;
    totalComments: number;
    positivePercent: number;
    neutralPercent: number;
    negativePercent: number;
  }>;
  statistics: {
    totalAnalyzed: number;
    averageConfidence: number;
    mostCommonSentiment: 'positive' | 'neutral' | 'negative';
    latestAnalysis: string | null;
  };
}

// Colors matching SentimentIndicator
const COLORS = {
  positive: '#10b981', // green
  neutral: '#6b7280',  // gray
  negative: '#ef4444', // red
};

function LoadingState() {
  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="page-sentiment-analytics">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="h-8 w-48" />
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
      <div className="space-y-6" data-testid="page-sentiment-analytics">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Brain className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-3xl font-bold">تحليل المشاعر</h1>
        </div>
        
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-2xl font-bold mb-2">لا توجد بيانات تحليل المشاعر حتى الآن</h2>
            <p className="text-muted-foreground text-center max-w-md">
              ابدأ بتحليل التعليقات لمعرفة مشاعر القراء تجاه المحتوى الخاص بك
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

export default function SentimentAnalytics() {
  const { data: analytics, isLoading } = useQuery<SentimentAnalytics>({
    queryKey: ['/api/sentiment/analytics'],
  });

  if (isLoading) {
    return <LoadingState />;
  }

  if (!analytics || analytics.statistics.totalAnalyzed === 0) {
    return <EmptyState />;
  }

  // Prepare distribution chart data
  const distributionData = [
    { 
      name: 'إيجابي', 
      value: analytics.distribution.positive,
      percent: (analytics.distribution.positive / analytics.distribution.total * 100).toFixed(1)
    },
    { 
      name: 'محايد', 
      value: analytics.distribution.neutral,
      percent: (analytics.distribution.neutral / analytics.distribution.total * 100).toFixed(1)
    },
    { 
      name: 'سلبي', 
      value: analytics.distribution.negative,
      percent: (analytics.distribution.negative / analytics.distribution.total * 100).toFixed(1)
    },
  ];

  const sentimentLabels: Record<string, string> = {
    positive: 'إيجابي',
    neutral: 'محايد',
    negative: 'سلبي',
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl" data-testid="page-sentiment-analytics">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Brain className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">تحليل المشاعر</h1>
            <p className="text-muted-foreground mt-1">
              تحليل شامل لمشاعر التعليقات والتفاعلات
            </p>
          </div>
        </div>

        {/* Statistics Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                التعليقات المحللة
              </CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-analyzed">
                {analytics.statistics.totalAnalyzed.toLocaleString('en-US')}
              </div>
              <p className="text-xs text-muted-foreground">
                إجمالي التعليقات المحللة
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                متوسط الثقة
              </CardTitle>
              <Percent className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-avg-confidence">
                {(analytics.statistics.averageConfidence * 100).toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">
                دقة التحليل
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                الشعور الأكثر شيوعاً
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mb-2">
                <SentimentIndicator 
                  sentiment={analytics.statistics.mostCommonSentiment}
                  showLabel={true}
                  showTooltip={false}
                  size="md"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {sentimentLabels[analytics.statistics.mostCommonSentiment]}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                آخر تحليل
              </CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold" data-testid="text-latest-analysis">
                {analytics.statistics.latestAnalysis 
                  ? formatDistanceToNow(new Date(analytics.statistics.latestAnalysis), { 
                      addSuffix: true,
                      locale: arSA
                    })
                  : 'لا يوجد'}
              </div>
              <p className="text-xs text-muted-foreground">
                آخر تعليق تم تحليله
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Analytics Grid */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Overall Sentiment Distribution Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-primary" />
                <CardTitle>توزيع المشاعر الإجمالي</CardTitle>
              </div>
              <CardDescription>
                نسب المشاعر في جميع التعليقات المحللة
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center">
                <ResponsiveContainer width="100%" height={250} data-testid="chart-sentiment-distribution">
                  <PieChart>
                    <Pie
                      data={distributionData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => `${entry.name}: ${entry.percent}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      <Cell fill={COLORS.positive} />
                      <Cell fill={COLORS.neutral} />
                      <Cell fill={COLORS.negative} />
                    </Pie>
                    <Tooltip 
                      formatter={(value: number) => value.toLocaleString('en-US')}
                    />
                  </PieChart>
                </ResponsiveContainer>
                
                <div className="mt-4 w-full space-y-2">
                  {distributionData.map((item, index) => (
                    <div key={index} className="flex items-center justify-between p-2 rounded-lg border">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ 
                            backgroundColor: index === 0 ? COLORS.positive : 
                                           index === 1 ? COLORS.neutral : 
                                           COLORS.negative 
                          }}
                        />
                        <span className="text-sm font-medium">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{item.percent}%</Badge>
                        <span className="text-sm text-muted-foreground">
                          {item.value.toLocaleString('en-US')}
                        </span>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-muted">
                    <span className="text-sm font-bold">الإجمالي</span>
                    <span className="text-sm font-bold">
                      {analytics.distribution.total.toLocaleString('en-US')}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sentiment Trend Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                <CardTitle>اتجاه المشاعر (آخر 30 يوم)</CardTitle>
              </div>
              <CardDescription>
                تتبع التغيرات في المشاعر على مدار الوقت
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300} data-testid="chart-sentiment-trend">
                <LineChart data={analytics.trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value) => new Date(value).toLocaleDateString('ar-EG', { 
                      month: 'short', 
                      day: 'numeric' 
                    })}
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip 
                    labelFormatter={(value) => new Date(value).toLocaleDateString('ar-EG')}
                    formatter={(value: number, name: string) => {
                      const labels: Record<string, string> = {
                        positive: 'إيجابي',
                        neutral: 'محايد',
                        negative: 'سلبي',
                      };
                      return [value.toLocaleString('en-US'), labels[name] || name];
                    }}
                  />
                  <Legend 
                    formatter={(value) => {
                      const labels: Record<string, string> = {
                        positive: 'إيجابي',
                        neutral: 'محايد',
                        negative: 'سلبي',
                      };
                      return labels[value] || value;
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="positive" 
                    stroke={COLORS.positive} 
                    strokeWidth={2}
                    name="positive"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="neutral" 
                    stroke={COLORS.neutral} 
                    strokeWidth={2}
                    name="neutral"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="negative" 
                    stroke={COLORS.negative} 
                    strokeWidth={2}
                    name="negative"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Top Articles by Sentiment Card */}
          <Card className="md:col-span-2">
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <CardTitle>المقالات الأكثر تعليقاً</CardTitle>
              </div>
              <CardDescription>
                المقالات التي تحتوي على أكبر عدد من التعليقات المحللة
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3" data-testid="list-top-articles">
                {(analytics?.topArticles?.length ?? 0) > 0 ? (
                  analytics?.topArticles?.map((article, index) => (
                    <Link 
                      key={article.id} 
                      href={`/article/${article.englishSlug || article.slug}`}
                    >
                      <div
                        className="flex items-center justify-between p-4 rounded-lg border hover-elevate transition-all cursor-pointer"
                        data-testid={`article-item-${article.id}`}
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
                              {article.totalComments.toLocaleString('en-US')} تعليق
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className="text-center">
                            <div className="text-sm font-bold" style={{ color: COLORS.positive }}>
                              {article.positivePercent.toFixed(0)}%
                            </div>
                            <div className="text-xs text-muted-foreground">إيجابي</div>
                          </div>
                          
                          <div className="text-center">
                            <div className="text-sm font-bold" style={{ color: COLORS.neutral }}>
                              {article.neutralPercent.toFixed(0)}%
                            </div>
                            <div className="text-xs text-muted-foreground">محايد</div>
                          </div>
                          
                          <div className="text-center">
                            <div className="text-sm font-bold" style={{ color: COLORS.negative }}>
                              {article.negativePercent.toFixed(0)}%
                            </div>
                            <div className="text-xs text-muted-foreground">سلبي</div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    لا توجد بيانات متاحة
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
