import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  BookOpen,
  Bookmark,
  ChevronDown,
  Clock,
  Gauge,
  Heart,
  Lightbulb,
  MessageSquare,
  RefreshCw,
  Sparkles,
  Sun,
  Target,
  Zap,
} from "lucide-react";

import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AccountSectionHeader } from "@/components/AccountSectionHeader";
import { MobileOptimizedKpiCard } from "@/components/MobileOptimizedKpiCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { apiUrl, queryClient } from "@/lib/queryClient";
import { MoodIcon } from "@/components/daily-brief/MoodIcon";
import { SuggestionCard } from "@/components/daily-brief/SuggestionCard";
import { MetricCard } from "@/components/daily-brief/MetricCard";
import { HourlyActivityChart } from "@/components/daily-brief/HourlyActivityChart";
import { BriefStateView } from "@/components/daily-brief/BriefStateView";
import { GuestBriefLanding } from "@/components/daily-brief/GuestBriefLanding";

/** عقد البيانات المعتمد (§18) — suggestedArticles يحمل categoryName. */
interface DailySummary {
  hasActivity?: boolean;
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
      imageUrl?: string | null;
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

/** نتيجة التفريع (§14): ok / guest(401) / empty(404 أو hasActivity:false). */
type DailyBriefResult =
  | { kind: "ok"; data: DailySummary }
  | { kind: "guest" }
  | { kind: "empty" };

/** خريطة تفسير المزاج القرائي — تقبل المفاتيح العربية والإنجليزية (§5). */
const MOOD_EXPLANATIONS: Record<string, string> = {
  تحليلي: "تميل اليوم إلى المقالات المعمّقة والتحليلات.",
  Analytical: "تميل اليوم إلى المقالات المعمّقة والتحليلات.",
  فضولي: "تتنقّل بفضول بين مواضيع متنوعة.",
  Curious: "تتنقّل بفضول بين مواضيع متنوعة.",
  سريع: "قراءة سريعة بوتيرة عالية — تلتقط الجوهر بسرعة.",
  Fast: "قراءة سريعة بوتيرة عالية — تلتقط الجوهر بسرعة.",
  نقدي: "تتوقف عند التفاصيل وتزن وجهات النظر.",
  Critical: "تتوقف عند التفاصيل وتزن وجهات النظر.",
};
const DEFAULT_MOOD_EXPLANATION = "نمط قراءة متوازن اليوم.";

const getGreeting = () => {
  const hour = new Date().getHours();
  return hour >= 5 && hour < 12 ? "صباح الخير" : "مساء الخير";
};

/** 0→«12 ص»، <12→«{h} ص»، 12→«12 م»، >12→«{h-12} م». */
const formatHour = (hour: number) => {
  if (hour === 0) return "12 ص";
  if (hour < 12) return `${hour} ص`;
  if (hour === 12) return "12 م";
  return `${hour - 12} م`;
};

export default function DailyBrief() {
  const [isInterestsOpen, setIsInterestsOpen] = useState(true);
  const [isTimeActivityOpen, setIsTimeActivityOpen] = useState(true);
  const [isMetricsOpen, setIsMetricsOpen] = useState(false);
  const [isAiInsightsOpen, setIsAiInsightsOpen] = useState(true);

  const { data: user } = useQuery<{ id: string; name?: string; email?: string; role?: string; profileImageUrl?: string | null }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  // آلية التفريع (§14): fetch مباشر بـ credentials:"include" لأن الـ fetcher
  // الافتراضي يعيد null على 401 ويرمي برسالة بلا status على 404.
  const { data: result, isLoading, refetch } = useQuery<DailyBriefResult>({
    queryKey: ["/api/ai/daily-summary"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/ai/daily-summary"), { credentials: "include" });
      if (res.status === 401) return { kind: "guest" };
      if (res.status === 404) return { kind: "empty" };
      if (!res.ok) throw new Error(`فشل تحميل الموجز اليومي (${res.status})`);
      const data = (await res.json()) as DailySummary;
      if (data?.hasActivity === false) return { kind: "empty" };
      return { kind: "ok", data };
    },
    retry: false,
  });

  const summary = result?.kind === "ok" ? result.data : undefined;

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/ai/daily-summary"] });
    refetch();
  };

  const todayFormatted = format(new Date(), "EEEE، d MMMM yyyy", { locale: ar });

  const formatted = useMemo(() => {
    const metrics = summary?.metrics;
    const engagementRaw =
      (metrics?.articlesLiked ?? 0) + (metrics?.commentsPosted ?? 0) + (metrics?.articlesBookmarked ?? 0);
    const completionRaw = Math.round(metrics?.completionRate ?? 0);
    return {
      articlesReadRaw: metrics?.articlesRead ?? 0,
      readingTimeRaw: metrics?.readingTimeMinutes ?? 0,
      completionRaw,
      engagementRaw,
      articlesRead: (metrics?.articlesRead ?? 0).toLocaleString("en-US"),
      readingTime: (metrics?.readingTimeMinutes ?? 0).toLocaleString("en-US"),
      completionRate: completionRaw.toLocaleString("en-US"),
      engagement: engagementRaw.toLocaleString("en-US"),
      bookmarked: (metrics?.articlesBookmarked ?? 0).toLocaleString("en-US"),
      liked: (metrics?.articlesLiked ?? 0).toLocaleString("en-US"),
      comments: (metrics?.commentsPosted ?? 0).toLocaleString("en-US"),
      focusScore: (summary?.aiInsights?.focusScore ?? 0).toLocaleString("en-US"),
    };
  }, [summary]);

  const bandTitle = isLoading
    ? "جاري التحميل…"
    : summary
      ? `${getGreeting()}${summary.personalizedGreeting?.userName ? ` ${summary.personalizedGreeting.userName}` : ""}!`
      : "موجزك اليومي";

  const bandAction = summary ? (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground tabular-nums" data-testid="text-last-updated">
        آخر تحديث {format(new Date(summary.generatedAt), "HH:mm")}
      </span>
      <Button
        variant="outline"
        size="icon"
        className="rounded-full"
        onClick={handleRefresh}
        disabled={isLoading}
        data-testid="button-refresh-brief"
      >
        <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
      </Button>
    </div>
  ) : undefined;

  return (
    <>
      <Header user={user} />
      <main className="min-h-screen bg-background">
        {/* القسم 0 — شريط الترويسة (يظهر في كل الحالات) */}
        <div className="border-b border-primary/10 bg-ai-gradient-soft">
          <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
            <div className="scroll-fade-in" dir="rtl">
              <AccountSectionHeader
                icon={Sun}
                title={bandTitle}
                subtitle={todayFormatted}
                testId="text-daily-brief-title"
                action={bandAction}
              />
            </div>
          </div>
        </div>

        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          {isLoading ? (
            /* حالة التحميل (§14.1) */
            <div className="space-y-6" data-testid="loading-state">
              <Card className="border-0 shadow-sm dark:border dark:border-card-border">
                <CardContent className="p-6 md:p-8">
                  <Skeleton className="h-7 w-2/3" />
                  <Skeleton className="h-4 w-1/2 mt-3" />
                  <Skeleton className="h-4 w-1/3 mt-2" />
                </CardContent>
              </Card>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 rounded-2xl" />
                ))}
              </div>
              <Card className="border-0 shadow-sm dark:border dark:border-card-border">
                <CardContent className="p-6">
                  <Skeleton className="h-40 w-full rounded-2xl" />
                </CardContent>
              </Card>
            </div>
          ) : result?.kind === "guest" ? (
            <GuestBriefLanding locale="ar" />
          ) : result?.kind === "empty" ? (
            <BriefStateView
              variant="empty"
              title="لا يوجد نشاط بعد"
              description="ابدأ القراءة وسيظهر موجزك هنا خلال 24 ساعة."
              action={{ label: "استكشف الأخبار", href: "/news" }}
              arrowIcon={<ArrowLeft className="h-4 w-4" />}
            />
          ) : !summary ? (
            <BriefStateView
              variant="error"
              title="تعذّر تحميل موجزك"
              description="حدث خطأ أثناء إنشاء الملخص. حاول مرة أخرى."
              action={{ label: "إعادة المحاولة", onClick: () => refetch() }}
              arrowIcon={<RefreshCw className="h-4 w-4" />}
            />
          ) : (
            <SuccessContent
              summary={summary}
              formatted={formatted}
              isInterestsOpen={isInterestsOpen}
              setIsInterestsOpen={setIsInterestsOpen}
              isTimeActivityOpen={isTimeActivityOpen}
              setIsTimeActivityOpen={setIsTimeActivityOpen}
              isMetricsOpen={isMetricsOpen}
              setIsMetricsOpen={setIsMetricsOpen}
              isAiInsightsOpen={isAiInsightsOpen}
              setIsAiInsightsOpen={setIsAiInsightsOpen}
            />
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}

interface FormattedMetrics {
  articlesReadRaw: number;
  readingTimeRaw: number;
  completionRaw: number;
  engagementRaw: number;
  articlesRead: string;
  readingTime: string;
  completionRate: string;
  engagement: string;
  bookmarked: string;
  liked: string;
  comments: string;
  focusScore: string;
}

interface SuccessContentProps {
  summary: DailySummary;
  formatted: FormattedMetrics;
  isInterestsOpen: boolean;
  setIsInterestsOpen: (open: boolean) => void;
  isTimeActivityOpen: boolean;
  setIsTimeActivityOpen: (open: boolean) => void;
  isMetricsOpen: boolean;
  setIsMetricsOpen: (open: boolean) => void;
  isAiInsightsOpen: boolean;
  setIsAiInsightsOpen: (open: boolean) => void;
}

function SuccessContent({
  summary,
  formatted,
  isInterestsOpen,
  setIsInterestsOpen,
  isTimeActivityOpen,
  setIsTimeActivityOpen,
  isMetricsOpen,
  setIsMetricsOpen,
  isAiInsightsOpen,
  setIsAiInsightsOpen,
}: SuccessContentProps) {
  const greeting = summary.personalizedGreeting;
  const articlesToday = greeting?.articlesReadToday ?? 0;
  const minutesToday = greeting?.readingTimeMinutes ?? 0;
  const greetingTopCategories = greeting?.topCategories ?? [];
  const readingMood = greeting?.readingMood ?? "";

  const topCategories = summary.interestAnalysis.topCategories ?? [];
  const topics = summary.interestAnalysis.topicsThatCatchAttention ?? [];
  const suggestedArticles = summary.interestAnalysis.suggestedArticles ?? [];

  const hourlyBreakdown = summary.timeActivity.hourlyBreakdown ?? [];
  const totalCount = hourlyBreakdown.reduce((sum, point) => sum + (point.count ?? 0), 0);
  const peakReadingTime = summary.timeActivity.peakReadingTime ?? 0;
  const lowActivityPeriod = summary.timeActivity.lowActivityPeriod ?? 0;

  const percentChange = summary.metrics.percentChangeFromYesterday ?? 0;
  // القيمة 100 قسرية تعني «أمس صفر» → تُخفى (§11).
  const showChange = percentChange !== 0 && percentChange !== 100;

  const hasInterests = topCategories.length > 0 || topics.length > 0;

  return (
    <div className="space-y-10" dir="rtl">
      {/* القسم 1 — بطاقة التحية/المزاج (Hero) */}
      <Card
        className="scroll-fade-in border-0 bg-ai-gradient-soft shadow-sm dark:border dark:border-card-border"
        data-testid="card-greeting"
      >
        <CardContent className="p-6 md:p-8">
          <div className="flex items-start gap-4 md:gap-6">
            <div
              className="h-16 w-16 md:h-20 md:w-20 shrink-0 rounded-full bg-primary/10 flex items-center justify-center"
              data-testid="icon-reading-mood"
            >
              <MoodIcon mood={readingMood} className="h-8 w-8 md:h-10 md:w-10 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base md:text-lg leading-relaxed" data-testid="text-greeting-summary">
                {articlesToday > 0 ? (
                  <>
                    قرأت خلال آخر 24 ساعة{" "}
                    <strong className="tabular-nums" data-testid="value-articles-today">
                      {articlesToday.toLocaleString("en-US")}
                    </strong>{" "}
                    مقالاً
                    {minutesToday > 0 && (
                      <>
                        {" "}
                        خلال{" "}
                        <strong className="tabular-nums" data-testid="value-reading-minutes">
                          {minutesToday.toLocaleString("en-US")}
                        </strong>{" "}
                        دقيقة
                      </>
                    )}
                  </>
                ) : (
                  "لم تُسجَّل قراءات خلال آخر 24 ساعة — يومك القرائي يبدأ الآن."
                )}
                {greetingTopCategories.length > 0 && (
                  <>
                    {" "}
                    — منها عن{" "}
                    {greetingTopCategories.map((category, index) => (
                      <span key={index} data-testid={`text-top-category-${index}`}>
                        {index > 0 && " و"}
                        <strong>{category}</strong>
                      </span>
                    ))}
                  </>
                )}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1" data-testid="text-mood-description">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm">
                  مزاجك القرائي اليوم:{" "}
                  <strong data-testid="value-reading-mood">"{readingMood}"</strong>
                </span>
                <span className="text-sm text-muted-foreground" data-testid="text-mood-explanation">
                  {MOOD_EXPLANATIONS[readingMood] ?? DEFAULT_MOOD_EXPLANATION}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* القسم 2 — صف KPIs (الصف الوحيد للأرقام) */}
      <div className="scroll-fade-in grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 md:gap-4">
        <MobileOptimizedKpiCard
          label="المقالات المقروءة اليوم"
          value={formatted.articlesReadRaw === 0 ? "ابدأ أول مقال" : formatted.articlesRead}
          icon={BookOpen}
          iconColor="text-primary"
          iconBgColor="bg-primary/10"
          className="border-0 dark:border dark:border-card-border"
          testId="kpi-articles-read"
          ariaLive
        />
        <MobileOptimizedKpiCard
          label="وقت القراءة (دقيقة)"
          value={formatted.readingTimeRaw === 0 ? "دقائقك بانتظارك" : formatted.readingTime}
          icon={Clock}
          iconColor="text-primary"
          iconBgColor="bg-primary/10"
          className="border-0 dark:border dark:border-card-border"
          testId="kpi-reading-time"
          ariaLive
        />
        <MobileOptimizedKpiCard
          label="معدل الإكمال (%)"
          value={formatted.completionRaw === 0 ? "أكمل مقالاً واحداً" : formatted.completionRate}
          icon={Target}
          iconColor="text-primary"
          iconBgColor="bg-primary/10"
          className="border-0 dark:border dark:border-card-border"
          testId="kpi-completion-rate"
          ariaLive
        />
        <MobileOptimizedKpiCard
          label="نقاط التفاعل"
          value={formatted.engagementRaw === 0 ? "تفاعل مع محتواك" : formatted.engagement}
          icon={Activity}
          iconColor="text-primary"
          iconBgColor="bg-primary/10"
          className="border-0 dark:border dark:border-card-border"
          testId="kpi-engagement"
          ariaLive
        />
      </div>

      {/* القسم 3 — الاهتمامات (يُخفى كلياً عند غياب الفئات والمواضيع) */}
      {hasInterests && (
        <Collapsible open={isInterestsOpen} onOpenChange={setIsInterestsOpen}>
          <Card className="border-0 shadow-sm dark:border dark:border-card-border" data-testid="card-interest-analysis">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1">
                  <CardTitle className="flex items-center gap-2 text-2xl" data-testid="heading-interest-analysis">
                    <Sparkles className="h-6 w-6 text-primary" />
                    اهتماماتك اليوم
                  </CardTitle>
                  <CardDescription className="mt-1 text-sm">
                    الفئات والمواضيع التي تصدّرت قراءتك خلال 24 ساعة
                  </CardDescription>
                </div>
                <CollapsibleTrigger asChild>
                  <Button size="sm" variant="ghost" data-testid="button-toggle-interest">
                    <ChevronDown
                      className={cn("h-4 w-4 transition-transform duration-200", isInterestsOpen && "rotate-180")}
                    />
                  </Button>
                </CollapsibleTrigger>
              </div>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-4">
                {topCategories.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {topCategories.map((category, index) => (
                      <Badge
                        key={index}
                        variant="outline"
                        className="text-sm px-3 py-1 bg-primary/10 text-primary border-primary/20"
                        data-testid={`badge-category-${index}`}
                      >
                        {category.name}{" "}
                        (
                        <span className="tabular-nums" data-testid={`value-category-count-${index}`}>
                          {(category.count ?? 0).toLocaleString("en-US")}
                        </span>
                        )
                      </Badge>
                    ))}
                  </div>
                )}
                {topics.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-2" data-testid="label-topics-attention">
                      مواضيع لفتت انتباهك
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {topics.map((topic, index) => (
                        <Badge key={index} variant="outline" data-testid={`badge-topic-${index}`}>
                          {topic}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* القسم 4 — الاقتراحات (يُخفى كلياً عند الغياب) */}
      {suggestedArticles.length > 0 && (
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2" data-testid="heading-suggestions">
            <Lightbulb className="h-6 w-6 text-primary" />
            مقترح لك
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {suggestedArticles.map((article, index) => (
              <SuggestionCard
                key={article.id}
                title={article.title}
                categoryName={article.categoryName}
                imageUrl={article.imageUrl}
                href={`/article/${article.englishSlug || article.slug}`}
                index={index}
              />
            ))}
          </div>
        </div>
      )}

      {/* القسم 5 — النشاط الزمني */}
      <Collapsible open={isTimeActivityOpen} onOpenChange={setIsTimeActivityOpen}>
        <Card className="border-0 shadow-sm dark:border dark:border-card-border" data-testid="card-time-activity">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1">
                <CardTitle className="flex items-center gap-2 text-2xl" data-testid="heading-time-activity">
                  <Zap className="h-6 w-6 text-primary" />
                  نشاطك على مدار اليوم
                </CardTitle>
                {totalCount > 0 && (
                  <CardDescription className="mt-1 text-sm" data-testid="text-activity-summary">
                    أكثر أوقات قراءتك:{" "}
                    <strong data-testid="value-peak-time">{formatHour(peakReadingTime)}</strong>
                    {lowActivityPeriod !== 0 && (
                      <>
                        {" "}
                        • أقل فترات التفاعل:{" "}
                        <strong data-testid="value-low-time">{formatHour(lowActivityPeriod)}</strong>
                      </>
                    )}
                  </CardDescription>
                )}
              </div>
              <CollapsibleTrigger asChild>
                <Button size="sm" variant="ghost" data-testid="button-toggle-time-activity">
                  <ChevronDown
                    className={cn("h-4 w-4 transition-transform duration-200", isTimeActivityOpen && "rotate-180")}
                  />
                </Button>
              </CollapsibleTrigger>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              {totalCount > 0 && (
                <HourlyActivityChart
                  data={hourlyBreakdown}
                  reversed
                  isRTL
                  formatHour={formatHour}
                  tooltipTitle={(hour) => `الساعة ${formatHour(hour)}`}
                  seriesName="المقالات"
                  valueSuffix="مقال"
                />
              )}
              <div className="mt-6 p-4 bg-primary/10 rounded-lg border border-primary/20" data-testid="box-ai-suggestion">
                <div className="flex items-start gap-3">
                  <Lightbulb className="h-5 w-5 shrink-0 mt-0.5 text-primary" />
                  <p className="text-sm leading-relaxed">
                    <strong>اقتراح AI:</strong>{" "}
                    <span data-testid="text-ai-suggestion">{summary.timeActivity.aiSuggestion}</span>
                  </p>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* القسم 6 — مؤشرات الأداء التفصيلية (مطوية افتراضياً) */}
      <Collapsible open={isMetricsOpen} onOpenChange={setIsMetricsOpen}>
        <div className="flex items-center justify-between gap-2 mb-4">
          <h2 className="text-2xl font-bold flex items-center gap-2" data-testid="heading-performance-metrics">
            <BarChart3 className="h-6 w-6 text-primary" />
            مؤشرات الأداء التفصيلية
          </h2>
          <CollapsibleTrigger asChild>
            <Button size="sm" variant="ghost" data-testid="button-toggle-metrics">
              <ChevronDown
                className={cn("h-4 w-4 transition-transform duration-200", isMetricsOpen && "rotate-180")}
              />
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 md:gap-4">
            <MetricCard
              testId="metric-articles-read"
              label="المقالات المقروءة"
              value={formatted.articlesRead}
              icon={BookOpen}
              change={
                showChange
                  ? {
                      direction: percentChange > 0 ? "up" : "down",
                      text: `${percentChange > 0 ? "بزيادة" : "بانخفاض"} ${Math.abs(percentChange)}% عن أمس`,
                      testId: "text-change-articles",
                      iconTestId: "icon-change-articles",
                    }
                  : undefined
              }
            />
            <MetricCard
              testId="metric-reading-time"
              label="وقت القراءة الإجمالي"
              value={`${formatted.readingTime} دقيقة`}
              icon={Clock}
              subtext="إجمالي دقائق آخر 24 ساعة"
            />
            <MetricCard
              testId="metric-completion-rate"
              label="معدل إكمال القراءة"
              value={`${formatted.completionRate}%`}
              icon={Target}
              progress={summary.metrics.completionRate ?? 0}
            />
            <MetricCard
              testId="metric-bookmarks"
              label="المقالات المحفوظة"
              value={formatted.bookmarked}
              icon={Bookmark}
              subtext={topCategories[0] ? `أغلبها عن ${topCategories[0].name}` : undefined}
            />
            <MetricCard
              testId="metric-likes"
              label="الإعجابات"
              value={formatted.liked}
              icon={Heart}
            />
            <MetricCard
              testId="metric-comments"
              label="التعليقات"
              value={formatted.comments}
              icon={MessageSquare}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* القسم 7 — لمسات AI (المزاج انتقل إلى الـ Hero) */}
      {summary.aiInsights && (
        <Collapsible open={isAiInsightsOpen} onOpenChange={setIsAiInsightsOpen}>
          <Card
            className="border-0 bg-ai-gradient-soft shadow-sm dark:border dark:border-card-border"
            data-testid="card-ai-insights"
          >
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1">
                  <CardTitle className="flex items-center gap-2 text-2xl" data-testid="heading-ai-touches">
                    <Sparkles className="h-6 w-6 text-primary" />
                    لمسات الذكاء الاصطناعي
                  </CardTitle>
                  <CardDescription className="mt-1 text-sm">تحليل ذكي لأدائك القرائي اليومي</CardDescription>
                </div>
                <CollapsibleTrigger asChild>
                  <Button size="sm" variant="ghost" data-testid="button-toggle-ai-insights">
                    <ChevronDown
                      className={cn("h-4 w-4 transition-transform duration-200", isAiInsightsOpen && "rotate-180")}
                    />
                  </Button>
                </CollapsibleTrigger>
              </div>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-4">
                <div className="rounded-lg bg-card p-4 md:p-6 shadow-sm" data-testid="box-focus-score">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Gauge className="h-5 w-5 text-primary" />
                    نسبة تركيزك اليوم
                  </h3>
                  <div className="mt-3 flex items-center gap-3">
                    <Progress
                      value={summary.aiInsights.focusScore ?? 0}
                      className="flex-1"
                      data-testid="progress-focus-score"
                    />
                    <span className="text-2xl font-bold tabular-nums text-ai-gradient" data-testid="value-focus-score">
                      {formatted.focusScore}%
                    </span>
                  </div>
                </div>
                <div className="rounded-lg bg-card p-4 md:p-6 shadow-sm" data-testid="box-daily-goal">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Target className="h-5 w-5 text-primary" />
                    هدفك المقترح لليوم
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/90" data-testid="text-daily-goal">
                    {summary.aiInsights.dailyGoal}
                  </p>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
    </div>
  );
}
