import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { EnglishLayout } from "@/components/en/EnglishLayout";
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
  ArrowRight, 
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { enUS } from "date-fns/locale";
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
  personalizedGreeting: {
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
  aiInsights: {
    readingMood: string;
    dailyGoal: string;
    focusScore: number;
  };
  generatedAt: string;
}

export default function EnglishDailyBrief() {
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
    queryKey: ["/api/en/ai/daily-summary"],
    retry: false,
  });

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/en/ai/daily-summary"] });
    refetch();
  };

  const todayInEnglish = format(new Date(), 'EEEE, MMMM d, yyyy', { locale: enUS });

  // Get greeting based on local time
  const getGreeting = () => {
    const hour = new Date().getHours();
    
    if (hour >= 5 && hour < 12) {
      return "Good morning";
    } else if (hour >= 12 && hour < 17) {
      return "Good afternoon";
    } else {
      return "Good evening";
    }
  };

  const getMoodIcon = (mood: string) => {
    const moods: Record<string, JSX.Element> = {
      // Arabic keys
      "تحليلي": <Brain className="h-12 w-12 text-primary" />,
      "فضولي": <Search className="h-12 w-12 text-primary" />,
      "سريع": <Zap className="h-12 w-12 text-primary" />,
      "نقدي": <Crosshair className="h-12 w-12 text-primary" />,
      // English keys
      "Analytical": <Brain className="h-12 w-12 text-primary" />,
      "Curious": <Search className="h-12 w-12 text-primary" />,
      "Fast": <Zap className="h-12 w-12 text-primary" />,
      "Critical": <Crosshair className="h-12 w-12 text-primary" />,
    };
    return moods[mood] || <BookOpen className="h-12 w-12 text-primary" />;
  };

  const getChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (change < 0) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return null;
  };

  const formatHour = (hour: number) => {
    if (hour === 0) return "12 AM";
    if (hour < 12) return `${hour} AM`;
    if (hour === 12) return "12 PM";
    return `${hour - 12} PM`;
  };

  if (error) {
    return (
      <EnglishLayout>
        <main className="min-h-screen bg-background py-8">
          <div className="container max-w-6xl mx-auto px-4">
            <Card data-testid="card-no-activity">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Eye className="h-16 w-16 text-muted-foreground mb-4" />
                <h2 className="text-2xl font-semibold mb-2" data-testid="text-no-activity-title">
                  Not Enough Data
                </h2>
                <p className="text-muted-foreground mb-6" data-testid="text-no-activity-description">
                  We couldn't find reading activity in the last 24 hours
                </p>
                <Button asChild data-testid="button-explore-news">
                  <Link href="/en/news">
                    Explore News
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>
      </EnglishLayout>
    );
  }

  return (
    <EnglishLayout>
      <main className="min-h-screen bg-background py-8">
        <div className="container max-w-7xl mx-auto px-4">
          {/* Header Section */}
          <div className="mb-8">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex-1">
                <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center gap-3" data-testid="text-daily-brief-title">
                  <Sun className="h-8 w-8 text-yellow-500" />
                  {isLoading ? "Loading..." : `${getGreeting()} ${summary?.personalizedGreeting.userName || ""}!`}
                </h1>
                <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
                  <div className="flex items-center gap-2" data-testid="text-current-date">
                    <Calendar className="h-4 w-4" />
                    <span>{todayInEnglish}</span>
                  </div>
                </div>
              </div>
              
              <Button 
                variant="outline" 
                size="icon"
                onClick={handleRefresh}
                disabled={isLoading}
                data-testid="button-refresh-brief"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            
            <Separator className="my-4" />
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="space-y-6" data-testid="loading-state">
              <Card>
                <CardHeader>
                  <Skeleton className="h-8 w-3/4" />
                  <Skeleton className="h-4 w-1/2 mt-2" />
                </CardHeader>
              </Card>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Card key={i}>
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
            <div className="space-y-8">
              {/* Personalized Greeting Card */}
              <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20" data-testid="card-greeting">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div data-testid="icon-reading-mood">
                      {getMoodIcon(summary.personalizedGreeting.readingMood)}
                    </div>
                    <div className="flex-1">
                      <p className="text-lg leading-relaxed" data-testid="text-greeting-summary">
                        In the last 24 hours, you read <strong data-testid="value-articles-today">{summary.personalizedGreeting.articlesReadToday}</strong> articles in{' '}
                        <strong data-testid="value-reading-minutes">{summary.personalizedGreeting.readingTimeMinutes}</strong> minutes
                        {summary.personalizedGreeting.topCategories.length > 0 && (
                          <>
                            {' '}— including articles about{' '}
                            {summary.personalizedGreeting.topCategories.map((cat, idx) => (
                              <span key={idx} data-testid={`text-top-category-${idx}`}>
                                <strong>{cat}</strong>
                                {idx < summary.personalizedGreeting.topCategories.length - 1 && ' and '}
                              </span>
                            ))}
                          </>
                        )}
                      </p>
                      <p className="text-muted-foreground mt-2" data-testid="text-mood-description">
                        Your reading mood today is <strong data-testid="value-reading-mood">"{summary.personalizedGreeting.readingMood}"</strong> based on your article engagement.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Performance Metrics */}
              <Collapsible open={isMetricsExpanded} onOpenChange={setIsMetricsExpanded}>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <h2 className="text-2xl font-bold flex items-center gap-2" data-testid="heading-performance-metrics">
                    <BarChart3 className="h-6 w-6 text-primary" />
                    Personal Performance Metrics
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
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <Card data-testid="metric-articles-read">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <BookOpen className="h-5 w-5 text-primary" />
                          <span className="text-sm text-muted-foreground" data-testid="label-articles-read">Articles Read</span>
                        </div>
                        <span data-testid="icon-change-articles">{getChangeIcon(summary.metrics.percentChangeFromYesterday)}</span>
                      </div>
                      <div className="text-3xl font-bold" data-testid="value-articles-read">{summary.metrics.articlesRead}</div>
                      {summary.metrics.percentChangeFromYesterday !== 0 && (
                        <p className="text-xs text-muted-foreground mt-1" data-testid="text-change-articles">
                          {summary.metrics.percentChangeFromYesterday > 0 ? 'Up' : 'Down'}{' '}
                          {Math.abs(summary.metrics.percentChangeFromYesterday)}% from yesterday
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  <Card data-testid="metric-reading-time">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="h-5 w-5 text-primary" />
                        <span className="text-sm text-muted-foreground" data-testid="label-reading-time">Total Reading Time</span>
                      </div>
                      <div className="text-3xl font-bold" data-testid="value-reading-time">{summary.metrics.readingTimeMinutes} minutes</div>
                      <p className="text-xs text-muted-foreground mt-1" data-testid="text-focus-feedback">Excellent focus</p>
                    </CardContent>
                  </Card>

                  <Card data-testid="metric-completion-rate">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-2 mb-2">
                        <Target className="h-5 w-5 text-primary" />
                        <span className="text-sm text-muted-foreground" data-testid="label-completion-rate">Reading Completion Rate</span>
                      </div>
                      <div className="text-3xl font-bold" data-testid="value-completion-rate">{Math.round(summary.metrics.completionRate)}%</div>
                      <Progress value={summary.metrics.completionRate} className="mt-2" data-testid="progress-completion-rate" />
                    </CardContent>
                  </Card>

                  <Card data-testid="metric-bookmarks">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-2 mb-2">
                        <Bookmark className="h-5 w-5 text-primary" />
                        <span className="text-sm text-muted-foreground" data-testid="label-bookmarks">Bookmarked Articles</span>
                      </div>
                      <div className="text-3xl font-bold" data-testid="value-bookmarks">{summary.metrics.articlesBookmarked}</div>
                      {summary.interestAnalysis.topCategories[0] && (
                        <p className="text-xs text-muted-foreground mt-1" data-testid="text-bookmark-category">
                          Mostly about {summary.interestAnalysis.topCategories[0].name}
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  <Card data-testid="metric-likes">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-2 mb-2">
                        <Heart className="h-5 w-5 text-primary" />
                        <span className="text-sm text-muted-foreground" data-testid="label-likes">Likes</span>
                      </div>
                      <div className="text-3xl font-bold" data-testid="value-likes">{summary.metrics.articlesLiked}</div>
                    </CardContent>
                  </Card>

                  <Card data-testid="metric-comments">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-2 mb-2">
                        <MessageSquare className="h-5 w-5 text-primary" />
                        <span className="text-sm text-muted-foreground" data-testid="label-comments">Comments</span>
                      </div>
                      <div className="text-3xl font-bold" data-testid="value-comments">{summary.metrics.commentsPosted}</div>
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
                      <CardTitle className="flex items-center gap-2" data-testid="heading-interest-analysis">
                        <Sparkles className="h-6 w-6 text-primary" />
                        Interest Analysis (AI Insights)
                      </CardTitle>
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
                    <h3 className="font-semibold mb-2" data-testid="label-today-interest">Your interests today:</h3>
                    <div className="flex flex-wrap gap-2">
                      {summary.interestAnalysis.topCategories.map((cat, idx) => (
                        <Badge 
                          key={idx} 
                          variant="secondary" 
                          className="text-base px-3 py-1"
                          data-testid={`badge-category-${idx}`}
                        >
                          <span data-testid={`text-category-name-${idx}`}>{cat.name}</span>
                          {' '}(<span data-testid={`value-category-count-${idx}`}>{cat.count}</span>)
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {summary.interestAnalysis.topicsThatCatchAttention.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-2" data-testid="label-topics-attention">Topics that catch your attention:</h3>
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
                      <h3 className="font-semibold mb-3" data-testid="label-system-suggestions">The system suggests:</h3>
                      <div className="grid gap-3 md:grid-cols-3">
                        {summary.interestAnalysis.suggestedArticles.map((article, idx) => (
                          <Link 
                            key={article.id} 
                            href={`/en/article/${article.englishSlug || article.slug}`}
                            data-testid={`link-suggested-article-${idx}`}
                          >
                            <Card className="hover-elevate transition-all cursor-pointer h-full">
                              <CardContent className="p-4">
                                <Badge 
                                  variant="secondary" 
                                  className="mb-2"
                                  data-testid={`badge-suggestion-category-${idx}`}
                                >
                                  {article.categoryName}
                                </Badge>
                                <h4 
                                  className="font-semibold text-sm line-clamp-2"
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
                        <CardTitle className="flex items-center gap-2" data-testid="heading-time-activity">
                          <Zap className="h-6 w-6 text-primary" />
                          Time Activity
                        </CardTitle>
                        <CardDescription data-testid="text-activity-summary">
                          Peak reading time: <strong data-testid="value-peak-time">{formatHour(summary.timeActivity.peakReadingTime)}</strong>
                          {' '}• Low activity period: <strong data-testid="value-low-time">{formatHour(summary.timeActivity.lowActivityPeriod)}</strong>
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
                  <div className="h-64 w-full" data-testid="chart-hourly-activity">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart 
                        data={summary.timeActivity.hourlyBreakdown}
                        margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="hour" 
                          tickFormatter={formatHour}
                        />
                        <YAxis />
                        <Tooltip 
                          labelFormatter={(hour) => `${formatHour(Number(hour))}`}
                          formatter={(value) => [`${value} articles`, 'Article Count']}
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
                  <div className="mt-4 p-4 bg-primary/5 rounded-lg" data-testid="box-ai-suggestion">
                    <div className="flex items-start gap-2">
                      <Lightbulb className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                      <p className="text-sm">
                        <strong>AI Suggestion:</strong>{' '}
                        <span data-testid="text-ai-suggestion">{summary.timeActivity.aiSuggestion}</span>
                      </p>
                    </div>
                  </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>

              {/* AI Insights */}
              <Collapsible open={isAIInsightsExpanded} onOpenChange={setIsAIInsightsExpanded}>
                <Card className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/20" data-testid="card-ai-insights">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="flex items-center gap-2" data-testid="heading-ai-touches">
                        <Sparkles className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                        AI Insights
                      </CardTitle>
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
                    <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div data-testid="box-reading-mood-report">
                      <h3 className="font-semibold mb-2 flex items-center gap-2">
                        <Brain className="h-5 w-5" />
                        Reading Mood Report
                      </h3>
                      <p 
                        className="text-2xl font-bold text-purple-600 dark:text-purple-400"
                        data-testid="value-ai-reading-mood"
                      >
                        {summary.aiInsights.readingMood}
                      </p>
                    </div>

                    <div data-testid="box-focus-score">
                      <h3 className="font-semibold mb-2 flex items-center gap-2">
                        <Gauge className="h-5 w-5" />
                        Today's Focus Score
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
                          {summary.aiInsights.focusScore}%
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-purple-500/10 rounded-lg" data-testid="box-daily-goal">
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <TargetIcon className="h-5 w-5" />
                      Daily Goal Suggestion
                    </h3>
                    <p data-testid="text-daily-goal">{summary.aiInsights.dailyGoal}</p>
                  </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            </div>
          )}
        </div>
      </main>
    </EnglishLayout>
  );
}
