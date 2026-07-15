import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AccountSectionHeader } from "@/components/AccountSectionHeader";
import { MobileOptimizedKpiCard } from "@/components/MobileOptimizedKpiCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Sun, 
  RefreshCw, 
  Calendar, 
  Clock, 
  ArrowLeft, 
  Heart,
  BookOpen,
  Bookmark,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  Target,
  Lightbulb,
  BarChart3,
  Sparkles,
  Eye,
  Zap,
  Brain,
  Crosshair,
  Search,
  Gauge,
  TargetIcon,
  ChevronDown,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { queryClient } from "@/lib/queryClient";
import { Link } from "wouter";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface DailySummary {
  personalizedGreeting?: {
    userName: string;
    articlesReadToday: number;
    readingTimeMinutes: number;
    topCategories: string[];
    readingMood: string;
  };
  metrics: {
    articlesRead: number;
    readingTimeMinutes: number;
    completionRate: number;
    articlesBookmarked: number;
    articlesLiked: number;
    commentsPosted: number;
    percentChangeFromYesterday: number;
  };
  interestAnalysis: {
    topCategories: Array<{ name: string; count: number }>;
    topicsThatCatchAttention: string[];
    suggestedArticles: Array<{
      id: string;
      title: string;
      slug: string;
      englishSlug?: string | null;
      categoryName: string;
    }>;
  };
  timeActivity: {
    hourlyBreakdown: Array<{ hour: number; count: number }>;
    peakReadingTime: number;
    lowActivityPeriod: number;
    aiSuggestion: string;
  };
  aiInsights?: {
    readingMood: string;
    dailyGoal: string;
    focusScore: number;
  };
  generatedAt: string;
}

export default function DailyBrief() {
  const [location, navigate] = useLocation();
  const [isMetricsExpanded, setIsMetricsExpanded] = useState(true);
  const [isInterestExpanded, setIsInterestExpanded] = useState(true);
  const [isTimeActivityExpanded, setIsTimeActivityExpanded] = useState(true);
  const [isAIInsightsExpanded, setIsAIInsightsExpanded] = useState(true);

  // Fetch user for header
  const { data: user } = useQuery<{ id: string; name?: string; email?: string; role?: string; profileImageUrl?: string | null }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const { data: summary, isLoading, error, refetch } = useQuery<DailySummary>({
    queryKey: ["/api/ai/daily-summary"],
    retry: false,
  });

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/ai/daily-summary"] });
    refetch();
  };

  const todayInArabic = format(new Date(), 'EEEE، d MMMM yyyy', { locale: ar });

  // Memoized formatter for engagement score and numerals
  const formattedMetrics = useMemo(() => {
    if (!summary) {
      return {
        articlesRead: "0",
        readingTime: "0",
        completionRate: "0",
        engagementScore: "0",
        engagementScoreRaw: 0,
        articlesBookmarked: "0",
        articlesLiked: "0",
        commentsPosted: "0",
        focusScore: "0",
      };
    }
    
    const engagementScore = (summary.metrics.articlesLiked || 0) + 
                           (summary.metrics.commentsPosted || 0) + 
                           (summary.metrics.articlesBookmarked || 0);
    
    return {
      articlesRead: (summary.metrics.articlesRead ?? 0).toLocaleString('en-US'),
      readingTime: (summary.metrics.readingTimeMinutes ?? 0).toLocaleString('en-US'),
      completionRate: (Math.round(summary.metrics.completionRate ?? 0)).toLocaleString('en-US'),
      engagementScore: engagementScore.toLocaleString('en-US'),
      engagementScoreRaw: engagementScore,
      articlesBookmarked: (summary.metrics.articlesBookmarked ?? 0).toLocaleString('en-US'),
      articlesLiked: (summary.metrics.articlesLiked ?? 0).toLocaleString('en-US'),
      commentsPosted: (summary.metrics.commentsPosted ?? 0).toLocaleString('en-US'),
      focusScore: (summary.aiInsights?.focusScore ?? 0).toLocaleString('en-US'),
    };
  }, [summary]);

  // Get greeting based on local time
  const getGreeting = () => {
    const hour = new Date().getHours();
    
    if (hour >= 5 && hour < 12) {
      return "صباح الخير";
    } else {
      return "مساء الخير";
    }
  };

  const getMoodIcon = (mood: string) => {
    const moods: Record<string, JSX.Element> = {
      "تحليلي": <Brain className="h-12 w-12 text-primary" />,
      "فضولي": <Search className="h-12 w-12 text-primary" />,
      "سريع": <Zap className="h-12 w-12 text-primary" />,
      "نقدي": <Crosshair className="h-12 w-12 text-primary" />,
    };
    return moods[mood] || <BookOpen className="h-12 w-12 text-primary" />;
  };

  const getChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (change < 0) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return null;
  };

  const formatHour = (hour: number) => {
    if (hour === 0) return "12 ص";
    if (hour < 12) return `${hour} ص`;
    if (hour === 12) return "12 م";
    return `${hour - 12} م`;
  };

  if (error) {
    return (
      <>
        <Header user={user} />
        <main className="min-h-screen bg-background py-8">
          <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <Card data-testid="card-no-activity">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Eye className="h-16 w-16 text-muted-foreground mb-4" />
                <h2 className="text-2xl font-semibold mb-2" data-testid="text-no-activity-title">
                  لا توجد بيانات كافية
                </h2>
                <p className="text-muted-foreground mb-6" data-testid="text-no-activity-description">
                  لم نتمكن من العثور على نشاط قرائي خلال آخر 24 ساعة
                </p>
                <Button asChild data-testid="button-explore-news">
                  <Link href="/news">
                    استكشف الأخبار
                    <ArrowLeft className="mr-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header user={user} />
      <main className="min-h-screen bg-background">
        <div className="border-b border-primary/10 bg-ai-gradient-soft">
          <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
            <div className="scroll-fade-in" dir="rtl">
              <AccountSectionHeader
                icon={Sun}
                title={isLoading ? "جاري التحميل..." : `${getGreeting()}${summary?.personalizedGreeting?.userName ? ` ${summary.personalizedGreeting.userName}` : ""}!`}
                subtitle={todayInArabic}
                testId="text-daily-brief-title"
                action={
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full"
                    onClick={handleRefresh}
                    disabled={isLoading}
                    data-testid="button-refresh-brief"
                  >
                    <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                  </Button>
                }
              />
            </div>
          </div>
        </div>

        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          {/* Loading State */}
          {isLoading && (
            <div className="space-y-6" data-testid="loading-state">
              <Card className="border-0 dark:border dark:border-card-border">
                <CardHeader>
                  <Skeleton className="h-8 w-3/4" />
                  <Skeleton className="h-4 w-1/2 mt-2" />
                </CardHeader>
              </Card>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Card key={i} className="border-0 dark:border dark:border-card-border">
                    <CardContent className="p-6">
                      <Skeleton className="h-24" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Summary Content */}
          {!isLoading && summary && (
            <div className="space-y-10" dir="rtl">
              {/* Statistics KPIs Section */}
              {formattedMetrics && (
              <div className="scroll-fade-in grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 md:gap-4">
                <MobileOptimizedKpiCard
                  label="المقالات المقروءة اليوم"
                  value={formattedMetrics.articlesRead}
                  icon={BookOpen}
                  iconColor="text-primary"
                  iconBgColor="bg-primary/10"
                  className="border-0 dark:border dark:border-card-border"
                  testId="kpi-articles-read"
                  ariaLive={true}
                />
                
                <MobileOptimizedKpiCard
                  label="وقت القراءة (دقيقة)"
                  value={formattedMetrics.readingTime}
                  icon={Clock}
                  iconColor="text-primary"
                  iconBgColor="bg-primary/10"
                  className="border-0 dark:border dark:border-card-border"
                  testId="kpi-reading-time"
                  ariaLive={true}
                />
                
                <MobileOptimizedKpiCard
                  label="معدل الإكمال (%)"
                  value={formattedMetrics.completionRate}
                  icon={Target}
                  iconColor="text-primary"
                  iconBgColor="bg-primary/10"
                  className="border-0 dark:border dark:border-card-border"
                  testId="kpi-completion-rate"
                  ariaLive={true}
                />
                
                <MobileOptimizedKpiCard
                  label="نقاط التفاعل"
                  value={formattedMetrics.engagementScore}
                  icon={Activity}
                  iconColor="text-primary"
                  iconBgColor="bg-primary/10"
                  className="border-0 dark:border dark:border-card-border"
                  testId="kpi-engagement"
                  ariaLive={true}
                />
              </div>
              )}

              {/* Personalized Greeting Card */}
              {summary.personalizedGreeting && (
              <Card className="border-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent shadow-sm dark:border dark:border-card-border" data-testid="card-greeting">
                <CardContent className="p-8">
                  <div className="flex items-start gap-6">
                    <div className="flex-shrink-0" data-testid="icon-reading-mood">
                      <div className="h-16 w-16 md:h-20 md:w-20 rounded-full bg-primary/10 flex items-center justify-center">
                        {getMoodIcon(summary.personalizedGreeting.readingMood)}
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="text-lg md:text-xl leading-relaxed mb-3" data-testid="text-greeting-summary">
                        قرأت خلال آخر 24 ساعة <strong data-testid="value-articles-today">{(summary.personalizedGreeting.articlesReadToday ?? 0).toLocaleString('en-US')}</strong> مقال خلال{' '}
                        <strong data-testid="value-reading-minutes">{(summary.personalizedGreeting.readingTimeMinutes ?? 0).toLocaleString('en-US')}</strong> دقيقة
                        {summary.personalizedGreeting.topCategories.length > 0 && (
                          <>
                            {' '}— منها عن{' '}
                            {summary.personalizedGreeting.topCategories.map((cat, idx) => (
                              <span key={idx} data-testid={`text-top-category-${idx}`}>
                                <strong>{cat}</strong>
                                {idx < (summary.personalizedGreeting?.topCategories.length ?? 0) - 1 && ' و'}
                              </span>
                            ))}
                          </>
                        )}
                      </p>
                      <p className="text-sm md:text-base text-muted-foreground" data-testid="text-mood-description">
                        مزاجك القرائي اليوم <strong data-testid="value-reading-mood">"{summary.personalizedGreeting.readingMood}"</strong> حسب تفاعلك مع المقالات.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              )}

              {/* Performance Metrics */}
              <Collapsible open={isMetricsExpanded} onOpenChange={setIsMetricsExpanded}>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <h2 className="text-2xl font-bold flex items-center gap-2" data-testid="heading-performance-metrics">
                    <BarChart3 className="h-6 w-6 text-primary" />
                    مؤشرات الأداء الشخصي
                  </h2>
                  <CollapsibleTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      data-testid="button-toggle-metrics"
                    >
                      <ChevronDown 
                        className={cn(
                          "h-4 w-4 transition-transform duration-200",
                          isMetricsExpanded && "rotate-180"
                        )}
                      />
                    </Button>
                  </CollapsibleTrigger>
                </div>
                
                <CollapsibleContent>
                  <div className="grid gap-2 sm:gap-3 md:gap-4 grid-cols-2 md:grid-cols-3">
                  <Card data-testid="metric-articles-read">
                    <CardContent className="p-3 sm:p-4 md:p-6">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <p className="text-sm text-muted-foreground mb-2" data-testid="label-articles-read">المقالات المقروءة</p>
                          <div className="text-2xl md:text-3xl font-bold" data-testid="value-articles-read">{formattedMetrics.articlesRead}</div>
                          {summary.metrics.percentChangeFromYesterday !== 0 && (
                            <div className="flex items-center gap-1 mt-1">
                              <span data-testid="icon-change-articles">{getChangeIcon(summary.metrics.percentChangeFromYesterday)}</span>
                              <p className="text-xs text-muted-foreground" data-testid="text-change-articles">
                                {summary.metrics.percentChangeFromYesterday > 0 ? 'بزيادة' : 'بانخفاض'}{' '}
                                {Math.abs(summary.metrics.percentChangeFromYesterday)}% عن أمس
                              </p>
                            </div>
                          )}
                        </div>
                        <div className="flex-shrink-0">
                          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                            <BookOpen className="h-6 w-6 text-primary" />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card data-testid="metric-reading-time">
                    <CardContent className="p-3 sm:p-4 md:p-6">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <p className="text-sm text-muted-foreground mb-2" data-testid="label-reading-time">وقت القراءة الإجمالي</p>
                          <div className="text-2xl md:text-3xl font-bold" data-testid="value-reading-time">{formattedMetrics.readingTime} دقيقة</div>
                          <p className="text-xs text-muted-foreground mt-1" data-testid="text-focus-feedback">تركيز ممتاز</p>
                        </div>
                        <div className="flex-shrink-0">
                          <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                            <Clock className="h-6 w-6 text-blue-500" />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card data-testid="metric-completion-rate">
                    <CardContent className="p-3 sm:p-4 md:p-6">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <p className="text-sm text-muted-foreground mb-2" data-testid="label-completion-rate">معدل إكمال القراءة</p>
                          <div className="text-2xl md:text-3xl font-bold" data-testid="value-completion-rate">{formattedMetrics.completionRate}%</div>
                          <Progress value={summary.metrics.completionRate} className="mt-2" data-testid="progress-completion-rate" />
                        </div>
                        <div className="flex-shrink-0">
                          <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
                            <Target className="h-6 w-6 text-green-500" />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card data-testid="metric-bookmarks">
                    <CardContent className="p-3 sm:p-4 md:p-6">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <p className="text-sm text-muted-foreground mb-2" data-testid="label-bookmarks">المقالات المحفوظة</p>
                          <div className="text-2xl md:text-3xl font-bold" data-testid="value-bookmarks">{formattedMetrics.articlesBookmarked}</div>
                          {summary.interestAnalysis.topCategories[0] && (
                            <p className="text-xs text-muted-foreground mt-1" data-testid="text-bookmark-category">
                              أغلبها عن {summary.interestAnalysis.topCategories[0].name}
                            </p>
                          )}
                        </div>
                        <div className="flex-shrink-0">
                          <div className="h-12 w-12 rounded-full bg-orange-500/10 flex items-center justify-center">
                            <Bookmark className="h-6 w-6 text-orange-500" />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card data-testid="metric-likes">
                    <CardContent className="p-3 sm:p-4 md:p-6">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <p className="text-sm text-muted-foreground mb-2" data-testid="label-likes">الإعجابات</p>
                          <div className="text-2xl md:text-3xl font-bold" data-testid="value-likes">{formattedMetrics.articlesLiked}</div>
                        </div>
                        <div className="flex-shrink-0">
                          <div className="h-12 w-12 rounded-full bg-red-500/10 flex items-center justify-center">
                            <Heart className="h-6 w-6 text-red-500" />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card data-testid="metric-comments">
                    <CardContent className="p-3 sm:p-4 md:p-6">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <p className="text-sm text-muted-foreground mb-2" data-testid="label-comments">التعليقات</p>
                          <div className="text-2xl md:text-3xl font-bold" data-testid="value-comments">{formattedMetrics.commentsPosted}</div>
                        </div>
                        <div className="flex-shrink-0">
                          <div className="h-12 w-12 rounded-full bg-purple-500/10 flex items-center justify-center">
                            <MessageSquare className="h-6 w-6 text-purple-500" />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Interest Analysis */}
              <Collapsible open={isInterestExpanded} onOpenChange={setIsInterestExpanded}>
                <Card data-testid="card-interest-analysis">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1">
                        <CardTitle className="flex items-center gap-2 text-2xl" data-testid="heading-interest-analysis">
                          <Sparkles className="h-7 w-7 text-primary" />
                          تحليل الاهتمامات (AI Insights)
                        </CardTitle>
                        <CardDescription className="mt-1 text-sm">
                          اكتشف ما يثير اهتمامك من مواضيع وفئات
                        </CardDescription>
                      </div>
                      <CollapsibleTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          data-testid="button-toggle-interest"
                        >
                          <ChevronDown 
                            className={cn(
                              "h-4 w-4 transition-transform duration-200",
                              isInterestExpanded && "rotate-180"
                            )}
                          />
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                  </CardHeader>
                  
                  <CollapsibleContent>
                    <CardContent className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-2" data-testid="label-today-interest">اهتمامك اليوم:</h3>
                    <div className="flex flex-wrap gap-2">
                      {summary.interestAnalysis.topCategories.map((cat, idx) => {
                        const colors = [
                          "bg-primary/10 text-primary border-primary/20",
                          "bg-blue-500/10 text-blue-600 border-blue-500/20",
                          "bg-green-500/10 text-green-600 border-green-500/20",
                          "bg-orange-500/10 text-orange-600 border-orange-500/20",
                          "bg-purple-500/10 text-purple-600 border-purple-500/20",
                        ];
                        return (
                          <Badge 
                            key={idx} 
                            variant="outline" 
                            className={`text-base px-3 py-1 ${colors[idx % colors.length]}`}
                            data-testid={`badge-category-${idx}`}
                          >
                            <span data-testid={`text-category-name-${idx}`}>{cat.name}</span>
                            {' '}(<span data-testid={`value-category-count-${idx}`}>{(cat.count ?? 0).toLocaleString('en-US')}</span>)
                          </Badge>
                        );
                      })}
                    </div>
                  </div>

                  {summary.interestAnalysis.topicsThatCatchAttention.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-2" data-testid="label-topics-attention">المواضيع التي تثير انتباهك:</h3>
                      <div className="flex flex-wrap gap-2">
                        {summary.interestAnalysis.topicsThatCatchAttention.map((topic, idx) => (
                          <Badge 
                            key={idx} 
                            variant="outline"
                            data-testid={`badge-topic-${idx}`}
                          >
                            {topic}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {summary.interestAnalysis.suggestedArticles.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-3" data-testid="label-system-suggestions">يقترح النظام:</h3>
                      <div className="grid gap-3 md:grid-cols-3">
                        {summary.interestAnalysis.suggestedArticles.map((article, idx) => (
                          <Link 
                            key={article.id} 
                            href={`/article/${article.englishSlug || article.slug}`}
                            data-testid={`link-suggested-article-${idx}`}
                          >
                            <Card className="hover-elevate transition-all cursor-pointer h-full">
                              <CardContent className="p-6">
                                <Badge 
                                  variant="secondary" 
                                  className="mb-3"
                                  data-testid={`badge-suggestion-category-${idx}`}
                                >
                                  {article.categoryName}
                                </Badge>
                                <h4 
                                  className="font-semibold text-base line-clamp-2"
                                  data-testid={`text-suggestion-title-${idx}`}
                                >
                                  {article.title}
                                </h4>
                              </CardContent>
                            </Card>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>

              {/* Time Activity Chart */}
              <Collapsible open={isTimeActivityExpanded} onOpenChange={setIsTimeActivityExpanded}>
                <Card data-testid="card-time-activity">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1">
                        <CardTitle className="flex items-center gap-2 text-2xl" data-testid="heading-time-activity">
                          <Zap className="h-7 w-7 text-primary" />
                          نشاطك الزمني
                        </CardTitle>
                        <CardDescription className="mt-1 text-sm" data-testid="text-activity-summary">
                          أكثر أوقات قراءتك: <strong data-testid="value-peak-time">{formatHour(summary.timeActivity.peakReadingTime)}</strong>
                          {' '}• أقل فترات التفاعل: <strong data-testid="value-low-time">{formatHour(summary.timeActivity.lowActivityPeriod)}</strong>
                        </CardDescription>
                      </div>
                      <CollapsibleTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          data-testid="button-toggle-time-activity"
                        >
                          <ChevronDown 
                            className={cn(
                              "h-4 w-4 transition-transform duration-200",
                              isTimeActivityExpanded && "rotate-180"
                            )}
                          />
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                  </CardHeader>
                  
                  <CollapsibleContent>
                    <CardContent>
                  <div className="h-80 w-full" data-testid="chart-hourly-activity">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart 
                        data={summary.timeActivity.hourlyBreakdown}
                        margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="hour" 
                          tickFormatter={formatHour}
                          reversed
                          style={{ direction: 'rtl' }}
                        />
                        <YAxis />
                        <Tooltip 
                          labelFormatter={(hour) => `الساعة ${formatHour(Number(hour))}`}
                          formatter={(value) => [`${value} مقال`, 'عدد المقالات']}
                          contentStyle={{ direction: 'rtl', textAlign: 'right' }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="count" 
                          stroke="hsl(var(--primary))" 
                          fill="hsl(var(--primary) / 0.2)" 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-6 p-4 bg-primary/10 rounded-lg border border-primary/20" data-testid="box-ai-suggestion">
                    <div className="flex items-start gap-3">
                      <Lightbulb className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                      <p className="text-sm leading-relaxed">
                        <strong className="text-base">اقتراح AI:</strong>{' '}
                        <span data-testid="text-ai-suggestion">{summary.timeActivity.aiSuggestion}</span>
                      </p>
                    </div>
                  </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>

              {/* AI Insights */}
              {summary.aiInsights && (
              <Collapsible open={isAIInsightsExpanded} onOpenChange={setIsAIInsightsExpanded}>
                <Card className="bg-gradient-to-br from-purple-500/15 via-purple-500/10 to-pink-500/10 border-purple-500/30" data-testid="card-ai-insights">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1">
                        <CardTitle className="flex items-center gap-2 text-2xl" data-testid="heading-ai-touches">
                          <Sparkles className="h-7 w-7 text-purple-600 dark:text-purple-400" />
                          لمسات الذكاء الاصطناعي
                        </CardTitle>
                        <CardDescription className="mt-1 text-sm text-purple-600/80 dark:text-purple-400/80">
                          تحليل ذكي لأدائك القرائي اليومي
                        </CardDescription>
                      </div>
                      <CollapsibleTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          data-testid="button-toggle-ai-insights"
                        >
                          <ChevronDown 
                            className={cn(
                              "h-4 w-4 transition-transform duration-200",
                              isAIInsightsExpanded && "rotate-180"
                            )}
                          />
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                  </CardHeader>
                  
                  <CollapsibleContent>
                    <CardContent className="space-y-6">
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="p-4 bg-purple-500/10 rounded-lg" data-testid="box-reading-mood-report">
                      <h3 className="font-semibold mb-3 flex items-center gap-2 text-base">
                        <Brain className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                        تقرير مزاجك القرائي
                      </h3>
                      <p 
                        className="text-2xl font-bold text-purple-600 dark:text-purple-400"
                        data-testid="value-ai-reading-mood"
                      >
                        {summary.aiInsights.readingMood}
                      </p>
                    </div>

                    <div className="p-4 bg-purple-500/10 rounded-lg" data-testid="box-focus-score">
                      <h3 className="font-semibold mb-3 flex items-center gap-2 text-base">
                        <Gauge className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                        نسبة تركيزك اليوم
                      </h3>
                      <div className="flex items-center gap-3">
                        <Progress 
                          value={summary.aiInsights.focusScore} 
                          className="flex-1"
                          data-testid="progress-focus-score"
                        />
                        <span 
                          className="text-2xl font-bold text-purple-600 dark:text-purple-400"
                          data-testid="value-focus-score"
                        >
                          {formattedMetrics.focusScore}%
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 bg-purple-500/15 rounded-lg border border-purple-500/30" data-testid="box-daily-goal">
                    <h3 className="font-semibold mb-3 flex items-center gap-2 text-base">
                      <TargetIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                      اقتراح هدف اليوم
                    </h3>
                    <p className="text-sm leading-relaxed text-foreground/90" data-testid="text-daily-goal">{summary.aiInsights.dailyGoal}</p>
                  </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
              )}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
