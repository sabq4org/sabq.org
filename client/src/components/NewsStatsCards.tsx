import { useQuery } from "@tanstack/react-query";
import { MobileOptimizedKpiCard } from "@/components/MobileOptimizedKpiCard";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Newspaper, Calendar, TrendingUp, BarChart3 } from "lucide-react";

interface NewsStats {
  totalNews: number;
  todayNews: number;
  topViewedThisWeek: {
    article: any;
    views: number;
  };
  averageViews: number;
}

export function NewsStatsCards() {
  const { data: stats, isLoading } = useQuery<NewsStats>({
    queryKey: ["/api/news/stats"],
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mb-8">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-2 sm:p-3">
              <Skeleton className="h-12 sm:h-14 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mb-8" data-testid="news-stats-cards">
      <MobileOptimizedKpiCard
        label="إجمالي الأخبار"
        value={(stats.totalNews ?? 0).toLocaleString('en-US')}
        icon={Newspaper}
        iconColor="text-primary"
        iconBgColor="bg-primary/10"
        testId="stat-total-news"
        className="compact"
      />
      
      <MobileOptimizedKpiCard
        label="أخبار اليوم"
        value={(stats.todayNews ?? 0).toLocaleString('en-US')}
        icon={Calendar}
        iconColor="text-green-600 dark:text-green-500"
        iconBgColor="bg-green-500/10"
        testId="stat-today-news"
        className="compact"
      />
      
      <MobileOptimizedKpiCard
        label="الأكثر مشاهدة (أسبوعياً)"
        value={(stats.topViewedThisWeek.views ?? 0).toLocaleString('en-US')}
        icon={TrendingUp}
        iconColor="text-blue-600 dark:text-blue-500"
        iconBgColor="bg-blue-500/10"
        testId="stat-top-viewed"
        className="compact"
      />
      
      <MobileOptimizedKpiCard
        label="متوسط المشاهدات"
        value={(stats.averageViews ?? 0).toLocaleString('en-US')}
        icon={BarChart3}
        iconColor="text-orange-600 dark:text-orange-500"
        iconBgColor="bg-orange-500/10"
        testId="stat-avg-views"
        className="compact"
      />
    </div>
  );
}
