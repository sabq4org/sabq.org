import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Flame, MessageSquare, Zap, Heart, Brain, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface MiniChartProps {
  trend: string;
  color: string;
}

function MiniChart({ trend, color }: MiniChartProps) {
  const points = trend === "Up" || trend === "صاعد" || trend === "ارتفاع" 
    ? "0,20 5,15 10,10 15,8 20,5"
    : trend === "Stable" || trend === "مستقر"
    ? "0,12 5,13 10,12 15,13 20,12"
    : "0,5 5,8 10,12 15,15 20,20";

  const sanitizedId = color.replace(/[^a-z0-9]/gi, '');

  return (
    <svg width="30" height="20" viewBox="0 0 30 20" className="inline-block">
      <defs>
        <linearGradient id={`gradient-${sanitizedId}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
          <stop offset="100%" stopColor={color} stopOpacity="0.05"/>
        </linearGradient>
      </defs>
      <path
        d={`M0,20 ${points} 20,20 Z`}
        fill={`url(#gradient-${sanitizedId})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface InsightArticle {
  id: string;
  title: string;
  slug: string;
  englishSlug: string | null;
  imageUrl?: string;
}

interface AIInsightsData {
  mostViewed: {
    article: InsightArticle | null;
    count: number;
    trend: string;
  };
  mostCommented: {
    article: InsightArticle | null;
    count: number;
    trend: string;
  };
  mostControversial: {
    article: InsightArticle | null;
    trend: string;
    aiAnalysis: string;
  };
  mostPositive: {
    article: InsightArticle | null;
    positiveRate: string;
    trend: string;
  };
  aiPick: {
    article: InsightArticle | null;
    engagementScore: number;
    forecast: string;
  };
}

interface AIInsightsBlockProps {
  enabled?: boolean;
}

export function AIInsightsBlock({ enabled = true }: AIInsightsBlockProps) {
  const { data: insights, isLoading } = useQuery<AIInsightsData>({
    queryKey: ["/api/ai-insights"],
    enabled,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-7 rounded-full" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 sm:h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!insights) return null;

  const insightsData = [
    {
      icon: Flame,
      iconColor: "text-orange-600 dark:text-orange-400",
      bgColor: "bg-orange-50 dark:bg-gray-900/40 border border-orange-200 dark:border-orange-900/50",
      chartColor: "#f97316",
      title: "الأكثر تداولاً",
      subtitle: `${(insights.mostViewed?.count ?? 0).toLocaleString('en-US')} قراءة`,
      trend: insights.mostViewed?.trend || "",
      article: insights.mostViewed?.article || null,
      testId: "most-viewed",
    },
    {
      icon: MessageSquare,
      iconColor: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-50 dark:bg-gray-900/40 border border-blue-200 dark:border-blue-900/50",
      chartColor: "#3b82f6",
      title: "الأكثر تعليقاً",
      subtitle: `${(insights.mostCommented?.count ?? 0).toLocaleString('en-US')} تعليق`,
      trend: insights.mostCommented?.trend || "",
      article: insights.mostCommented?.article || null,
      testId: "most-commented",
    },
    {
      icon: Zap,
      iconColor: "text-yellow-600 dark:text-yellow-400",
      bgColor: "bg-yellow-50 dark:bg-gray-900/40 border border-yellow-200 dark:border-yellow-900/50",
      chartColor: "#eab308",
      title: "يثير الجدل",
      subtitle: insights.mostControversial?.aiAnalysis || "",
      trend: insights.mostControversial?.trend || "",
      article: insights.mostControversial?.article || null,
      testId: "most-controversial",
    },
    {
      icon: Heart,
      iconColor: "text-pink-600 dark:text-pink-400",
      bgColor: "bg-pink-50 dark:bg-gray-900/40 border border-pink-200 dark:border-pink-900/50",
      chartColor: "#ec4899",
      title: "الأكثر إعجاباً",
      subtitle: `${insights.mostPositive?.positiveRate || "0%"} تفاعل إيجابي`,
      trend: insights.mostPositive?.trend || "",
      article: insights.mostPositive?.article || null,
      testId: "most-positive",
    },
    {
      icon: Brain,
      iconColor: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-50 dark:bg-gray-900/40 border border-purple-200 dark:border-purple-900/50",
      chartColor: "#a855f7",
      title: "اختيار الذكاء الاصطناعي",
      subtitle: insights.aiPick?.forecast || "",
      trend: "AI Forecast",
      article: insights.aiPick?.article || null,
      testId: "ai-pick",
      isAI: true,
    },
  ];

  return (
    <div className="space-y-3" data-testid="ai-insights-block">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-ai-gradient ai-pulse">
          <Brain className="h-3.5 w-3.5 text-white" />
        </div>
        <div>
          <h2 className="text-base sm:text-lg font-bold" data-testid="insights-title">
            مؤشرات الأسبوع
          </h2>
          <p className="text-[10px] sm:text-xs font-medium text-foreground/70" data-testid="insights-subtitle">
            نظرة ذكية مدعومة بالذكاء الاصطناعي
          </p>
        </div>
      </div>

      {/* Mobile: Horizontal Scroll */}
      <div className="flex flex-row lg:hidden gap-2 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide">
        {insightsData.map((insight, index) => {
          const IconComponent = insight.icon;
          const articleLink = insight.article ? `/article/${insight.article.englishSlug || insight.article.slug}` : "#";
          
          return (
            <Link 
              key={index} 
              href={articleLink}
              className={`flex-shrink-0 snap-start ${insight.article ? "cursor-pointer" : "cursor-default pointer-events-none"}`}
            >
              <div
                className={`${insight.bgColor} rounded-xl p-2.5 flex flex-col w-[160px] h-[140px] ${
                  insight.article ? "" : "opacity-60"
                }`}
                data-testid={`insight-card-${insight.testId}`}
              >
                {/* Icon and Title Row */}
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex items-center justify-center w-8 h-8 flex-shrink-0">
                    <IconComponent className={`h-5 w-5 ${insight.iconColor}`} />
                  </div>
                  <h3 className="font-bold text-xs leading-tight flex-1 text-foreground" data-testid={`insight-title-${insight.testId}`}>
                    {insight.title}
                  </h3>
                </div>

                {/* Subtitle */}
                <p className="text-[10px] font-medium text-foreground/70 mb-2 line-clamp-2" data-testid={`insight-subtitle-${insight.testId}`}>
                  {insight.subtitle}
                </p>

                {/* Trend with MiniChart */}
                <div className="flex items-center gap-2 mb-2" data-testid={`insight-trend-${insight.testId}`}>
                  <MiniChart trend={insight.trend} color={insight.chartColor} />
                  <div className="flex items-center gap-1 text-foreground/85 text-[10px] font-medium">
                    <TrendingUp className="h-2.5 w-2.5" />
                    <span>{insight.trend}</span>
                  </div>
                </div>

                {/* Article Title */}
                {insight.article && (
                  <p className="mt-auto pt-2 text-[10px] text-foreground/85 line-clamp-2 border-t border-current/10" data-testid={`insight-article-${insight.testId}`}>
                    {insight.article.title}
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Desktop: Grid */}
      <div className="hidden lg:grid grid-cols-5 gap-2">
        {insightsData.map((insight, index) => {
          const IconComponent = insight.icon;
          const articleLink = insight.article ? `/article/${insight.article.englishSlug || insight.article.slug}` : "#";
          
          return (
            <Link 
              key={index} 
              href={articleLink}
              className={insight.article ? "cursor-pointer" : "cursor-default pointer-events-none"}
            >
              <div
                className={`${insight.bgColor} rounded-xl p-3 group flex flex-col min-h-[160px] ${
                  insight.article ? "" : "opacity-60"
                }`}
                data-testid={`insight-card-${insight.testId}`}
              >
                {/* Icon and Title Row */}
                <div className="flex items-start gap-2 mb-1.5">
                  <div className="flex items-center justify-center w-9 h-9 flex-shrink-0">
                    <IconComponent className={`h-6 w-6 ${insight.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-base leading-tight text-foreground" data-testid={`insight-title-${insight.testId}`}>
                      {insight.title}
                    </h3>
                  </div>
                </div>

                {/* Subtitle */}
                <p className="text-xs font-medium text-foreground/70 mb-2 min-h-[24px] line-clamp-2" data-testid={`insight-subtitle-${insight.testId}`}>
                  {insight.subtitle}
                </p>

                {/* Trend with MiniChart */}
                <div className="flex items-center gap-2 mb-2" data-testid={`insight-trend-${insight.testId}`}>
                  <MiniChart trend={insight.trend} color={insight.chartColor} />
                  <div className="flex items-center gap-1 text-foreground/85 text-xs font-medium">
                    <TrendingUp className="h-3 w-3" />
                    <span className="text-xs">{insight.trend}</span>
                  </div>
                </div>

                {/* Article Title - Always visible */}
                {insight.article && (
                  <p className="mt-auto pt-2 text-xs text-foreground/85 line-clamp-2 border-t border-current/10" data-testid={`insight-article-${insight.testId}`}>
                    {insight.article.title}
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
