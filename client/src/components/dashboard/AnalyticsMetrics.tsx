import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Eye, Users, FileText, MessageSquare, Heart, Bookmark } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface MetricData {
  title: string;
  subtitle: string;
  value: number;
  change: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
}

interface AnalyticsOverview {
  totalViews?: number;
  viewsChange?: number;
  totalUsers?: number;
  usersChange?: number;
  totalArticles?: number;
  articlesChange?: number;
  totalComments?: number;
  commentsChange?: number;
  totalLikes?: number;
  likesChange?: number;
  totalBookmarks?: number;
  bookmarksChange?: number;
}

export default function AnalyticsMetrics() {
  const { data: analytics, isLoading } = useQuery<AnalyticsOverview>({
    queryKey: ["/api/analytics/overview"],
  });

  const metrics: MetricData[] = [
    {
      title: "إجمالي المشاهدات",
      subtitle: "سجل القراءات التراكمي",
      value: Number(analytics?.totalViews || 0),
      change: Number(analytics?.viewsChange || 0),
      icon: Eye,
      tone: "bg-blue-500/10 text-blue-500",
    },
    {
      title: "المقالات المنشورة",
      subtitle: "الأرشيف الإخباري النشط",
      value: Number(analytics?.totalArticles || 0),
      change: Number(analytics?.articlesChange || 0),
      icon: FileText,
      tone: "bg-violet-500/10 text-violet-500",
    },
    {
      title: "القرّاء المسجلون",
      subtitle: "حسابات الأعضاء في المنصة",
      value: Number(analytics?.totalUsers || 0),
      change: Number(analytics?.usersChange || 0),
      icon: Users,
      tone: "bg-emerald-500/10 text-emerald-500",
    },
    {
      title: "إجمالي الإعجابات",
      subtitle: "تفاعلات القرّاء مع الأخبار",
      value: Number(analytics?.totalLikes || 0),
      change: Number(analytics?.likesChange || 0),
      icon: Heart,
      tone: "bg-rose-500/10 text-rose-500",
    },
    {
      title: "إجمالي التعليقات",
      subtitle: "النقاشات والمداخلات",
      value: Number(analytics?.totalComments || 0),
      change: Number(analytics?.commentsChange || 0),
      icon: MessageSquare,
      tone: "bg-amber-500/10 text-amber-500",
    },
    {
      title: "المقالات المحفوظة",
      subtitle: "قوائم القراءة المفضلة",
      value: Number(analytics?.totalBookmarks || 0),
      change: Number(analytics?.bookmarksChange || 0),
      icon: Bookmark,
      tone: "bg-cyan-500/10 text-cyan-500",
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="border-border/60">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-20" />
                </div>
                <Skeleton className="h-10 w-10 rounded-xl" />
              </div>
              <Skeleton className="mt-3 h-3 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {metrics.map((metric, index) => {
        const Icon = metric.icon;
        const isPositive = metric.change >= 0;

        return (
          <Card key={index} className="border-border/60 transition-all hover:border-border">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">{metric.title}</p>
                  <div className="text-2xl font-bold tracking-tight tabular-nums text-foreground">
                    {metric.value.toLocaleString("en-US")}
                  </div>
                </div>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${metric.tone}`}>
                  <Icon className="h-5 w-5" />
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{metric.subtitle}</span>
                <span
                  className={`inline-flex items-center gap-0.5 font-medium tabular-nums ${
                    isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                  }`}
                  title="مقارنة بالشهر الماضي"
                >
                  {isPositive ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {Math.abs(metric.change)}%
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
