import { useQuery } from "@tanstack/react-query";
import { MobileOptimizedKpiCard } from "@/components/MobileOptimizedKpiCard";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Newspaper,
  Calendar,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Eye,
  Heart,
  Sparkles,
  Users,
  Bookmark,
  Trophy,
  Target,
} from "lucide-react";

type NewsStats = {
  totalNews: number;
  todayNews: number;
  topViewedThisWeek: { article?: { title?: string } | null; views: number };
  averageViews: number;
};

type NewsAnalytics = {
  period: { today: number; week: number; month: number };
  growth: { percentage: number; trend: "up" | "down" | "stable"; previousMonth: number };
  topCategory: {
    name: string;
    icon?: string | null;
    color?: string | null;
    count: number;
  } | null;
  topAuthor: {
    name: string;
    profileImageUrl?: string | null;
    count: number;
  } | null;
  totalViews: number;
  totalInteractions: number;
  aiInsights?: {
    dailySummary?: string;
    activityTrend?: string;
    keyHighlights?: string[];
  };
  topInterest?: {
    name: string;
    slug: string | null;
    subscribers: number;
    thisMonthNew: number;
    previousMonthNew: number;
    changePercent: number;
    trend: "up" | "down" | "stable";
  } | null;
  worldCup?: {
    champion: {
      teamId: number;
      name: string;
      logo: string | null;
      votes: number;
      sharePercent: number;
    } | null;
    topScorer: {
      playerId: number;
      name: string;
      photo: string | null;
      votes: number;
      sharePercent: number;
    } | null;
    totalChampionVotes: number;
    totalScorerVotes: number;
  } | null;
};

function TrendIcon({ trend }: { trend: "up" | "down" | "stable" }) {
  if (trend === "up") return <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />;
  if (trend === "down") return <TrendingDown className="h-3.5 w-3.5 text-rose-600" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

/**
 * Compact stats strip for /news — keeps every public KPI that existed before,
 * in a denser layout (no large empty hero blocks).
 */
export function SabqPulseSection() {
  const { data: stats, isLoading: statsLoading } = useQuery<NewsStats>({
    queryKey: ["/api/news/stats"],
  });
  const { data: analytics, isLoading: analyticsLoading } = useQuery<NewsAnalytics>({
    queryKey: ["/api/news/analytics"],
  });

  if (statsLoading || analyticsLoading) {
    return (
      <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-2" data-testid="sabq-pulse-loading">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!stats && !analytics) return null;

  const growth = analytics?.growth;
  const growthColor =
    growth?.trend === "up"
      ? "text-emerald-600"
      : growth?.trend === "down"
        ? "text-rose-600"
        : "text-muted-foreground";
  const growthLabel =
    growth?.trend === "up" ? "نمو" : growth?.trend === "down" ? "انخفاض" : "مستقر";

  return (
    <section className="mb-6 space-y-2" data-testid="sabq-pulse-section" aria-label="إحصائيات الأخبار">
      {/* Row 1 — نفس بطاقات NewsStatsCards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2" data-testid="news-stats-cards">
          <MobileOptimizedKpiCard
            label="إجمالي الأخبار"
            value={(stats.totalNews ?? 0).toLocaleString("en-US")}
            icon={Newspaper}
            iconColor="text-primary"
            iconBgColor="bg-primary/10"
            testId="stat-total-news"
            className="compact"
          />
          <MobileOptimizedKpiCard
            label="أخبار اليوم"
            value={(stats.todayNews ?? 0).toLocaleString("en-US")}
            icon={Calendar}
            iconColor="text-emerald-600"
            iconBgColor="bg-emerald-500/10"
            testId="stat-today-news"
            className="compact"
          />
          <MobileOptimizedKpiCard
            label="الأكثر مشاهدة (أسبوعياً)"
            value={(stats.topViewedThisWeek?.views ?? 0).toLocaleString("en-US")}
            icon={TrendingUp}
            iconColor="text-sky-600"
            iconBgColor="bg-sky-500/10"
            testId="stat-top-viewed"
            className="compact"
          />
          <MobileOptimizedKpiCard
            label="متوسط المشاهدات"
            value={(stats.averageViews ?? 0).toLocaleString("en-US")}
            icon={BarChart3}
            iconColor="text-amber-600"
            iconBgColor="bg-amber-500/10"
            testId="stat-avg-views"
            className="compact"
          />
        </div>
      )}

      {/* Row 2 — نفس بطاقات NewsAnalyticsHero مضغوطة */}
      {analytics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Card className="shadow-none" data-testid="stat-month-card">
            <CardContent className="p-2 sm:p-2.5">
              <div className="flex items-center justify-between gap-1 mb-1">
                <Newspaper className="h-3.5 w-3.5 text-primary shrink-0" />
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">
                  الشهر الحالي
                </Badge>
              </div>
              <p className="text-base sm:text-lg font-bold tabular-nums leading-none" data-testid="stat-total-month">
                {analytics.period.month.toLocaleString("en-US")}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1 truncate">إجمالي الأخبار المنشورة</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                اليوم: <span className="font-semibold text-foreground" data-testid="stat-total-today">{analytics.period.today.toLocaleString("en-US")}</span>
                {" · "}
                الأسبوع: <span className="font-semibold text-foreground" data-testid="stat-total-week">{analytics.period.week.toLocaleString("en-US")}</span>
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-none" data-testid="stat-growth-card">
            <CardContent className="p-2 sm:p-2.5">
              <div className="flex items-center justify-between gap-1 mb-1">
                {growth ? <TrendIcon trend={growth.trend} /> : <Minus className="h-3.5 w-3.5" />}
                <Badge variant="secondary" className={`text-[9px] px-1.5 py-0 h-4 ${growthColor}`}>
                  {growthLabel}
                </Badge>
              </div>
              <p className={`text-base sm:text-lg font-bold tabular-nums leading-none ${growthColor}`} data-testid="stat-growth">
                {growth && growth.percentage > 0 ? "+" : ""}
                {(growth?.percentage ?? 0).toLocaleString("en-US")}%
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">مؤشر نمو المحتوى</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                الشهر السابق: {(growth?.previousMonth ?? 0).toLocaleString("en-US")}
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-none" data-testid="stat-category-card">
            <CardContent className="p-2 sm:p-2.5">
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-sm leading-none">{analytics.topCategory?.icon || "📰"}</span>
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">
                  الأكثر نشاطاً
                </Badge>
              </div>
              <p className="text-sm sm:text-base font-bold truncate leading-tight" data-testid="stat-top-category">
                {analytics.topCategory?.name || "—"}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">التصنيف الأنشط</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                {(analytics.topCategory?.count ?? 0).toLocaleString("en-US")} خبر هذا الشهر
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-none" data-testid="stat-engagement-card">
            <CardContent className="p-2 sm:p-2.5">
              <div className="flex items-center justify-between gap-1 mb-1">
                <Sparkles className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">
                  AI
                </Badge>
              </div>
              <p className="text-base sm:text-lg font-bold tabular-nums leading-none" data-testid="stat-total-interactions">
                {analytics.totalInteractions.toLocaleString("en-US")}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">مؤشر التفاعل الذكي</p>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground tabular-nums">
                <span className="inline-flex items-center gap-0.5">
                  <Eye className="h-3 w-3 text-sky-600" />
                  <span data-testid="stat-total-views">{analytics.totalViews.toLocaleString("en-US")}</span>
                </span>
                <span className="inline-flex items-center gap-0.5">
                  <Heart className="h-3 w-3 text-rose-600" />
                  {analytics.totalInteractions.toLocaleString("en-US")}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* الكاتب الأنشط — صف مضغوط */}
      {analytics?.topAuthor && (
        <Card className="shadow-none">
          <CardContent className="p-2 sm:px-3 sm:py-2 flex items-center gap-2.5">
            <Users className="h-3.5 w-3.5 text-violet-600 shrink-0" />
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 shrink-0">
              الكاتب الأنشط
            </Badge>
            {analytics.topAuthor.profileImageUrl ? (
              <img
                src={analytics.topAuthor.profileImageUrl}
                alt=""
                className="h-7 w-7 rounded-full object-cover bg-muted shrink-0"
              />
            ) : (
              <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            )}
            <p className="text-sm font-semibold truncate flex-1" data-testid="stat-top-author">
              {analytics.topAuthor.name}
            </p>
            <p className="text-[10px] text-muted-foreground tabular-nums shrink-0">
              {analytics.topAuthor.count.toLocaleString("en-US")} مقال
            </p>
          </CardContent>
        </Card>
      )}

      {/* التقاطات: اهتمام المسجلين + ترشيحات المونديال */}
      {(analytics?.topInterest || analytics?.worldCup) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2" data-testid="pulse-insights">
          {analytics.topInterest && (
            <Card className="shadow-none" data-testid="stat-top-interest">
              <CardContent className="p-2 sm:p-2.5">
                <div className="flex items-center justify-between gap-1 mb-1">
                  <Bookmark className="h-3.5 w-3.5 text-teal-600 shrink-0" />
                  <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">
                    اهتمام المسجلين
                  </Badge>
                </div>
                <p className="text-sm sm:text-base font-bold truncate leading-tight">
                  {analytics.topInterest.name}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">
                  {analytics.topInterest.subscribers.toLocaleString("en-US")} متابع
                </p>
                <div className="mt-1 flex items-center gap-1.5 text-[10px]">
                  <TrendIcon trend={analytics.topInterest.trend} />
                  <span
                    className={
                      analytics.topInterest.trend === "up"
                        ? "text-emerald-600"
                        : analytics.topInterest.trend === "down"
                          ? "text-rose-600"
                          : "text-muted-foreground"
                    }
                  >
                    {analytics.topInterest.changePercent > 0 ? "+" : ""}
                    {analytics.topInterest.changePercent.toLocaleString("en-US")}% عن الشهر الماضي
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    ({analytics.topInterest.thisMonthNew.toLocaleString("en-US")} اشتراك جديد)
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {analytics.worldCup && (
            <Card className="shadow-none" data-testid="stat-world-cup">
              <CardContent className="p-2 sm:p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-1">
                  <Trophy className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">
                    ترشيحات المونديال
                  </Badge>
                </div>
                {analytics.worldCup.champion && (
                  <div className="flex items-center gap-2 min-w-0">
                    {analytics.worldCup.champion.logo ? (
                      <img
                        src={analytics.worldCup.champion.logo}
                        alt=""
                        className="h-6 w-6 object-contain shrink-0"
                      />
                    ) : (
                      <Trophy className="h-4 w-4 text-amber-600 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-muted-foreground leading-none mb-0.5">مرشح للفوز</p>
                      <p className="text-sm font-semibold truncate" data-testid="stat-wc-champion">
                        {analytics.worldCup.champion.name}
                      </p>
                    </div>
                    <p className="text-[10px] tabular-nums text-muted-foreground shrink-0">
                      {analytics.worldCup.champion.sharePercent.toLocaleString("en-US")}%
                    </p>
                  </div>
                )}
                {analytics.worldCup.topScorer && (
                  <div className="flex items-center gap-2 min-w-0">
                    {analytics.worldCup.topScorer.photo ? (
                      <img
                        src={analytics.worldCup.topScorer.photo}
                        alt=""
                        className="h-6 w-6 rounded-full object-cover bg-muted shrink-0"
                      />
                    ) : (
                      <Target className="h-4 w-4 text-sky-600 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-muted-foreground leading-none mb-0.5">مرشح للهداف</p>
                      <p className="text-sm font-semibold truncate" data-testid="stat-wc-scorer">
                        {analytics.worldCup.topScorer.name}
                      </p>
                    </div>
                    <p className="text-[10px] tabular-nums text-muted-foreground shrink-0">
                      {analytics.worldCup.topScorer.sharePercent.toLocaleString("en-US")}%
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {analytics?.aiInsights?.keyHighlights?.length ? (
        <p className="text-[11px] text-muted-foreground px-0.5 leading-relaxed" data-testid="stat-ai-highlights">
          {analytics.aiInsights.keyHighlights.join(" · ")}
        </p>
      ) : null}
    </section>
  );
}
