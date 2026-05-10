import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Eye, Users, FileText, MessageSquare, Heart, Bookmark } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface MetricData {
  title: string;
  value: string | number;
  change: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
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
  // Fetch analytics data
  const { data: analytics, isLoading } = useQuery<AnalyticsOverview>({
    queryKey: ['/api/analytics/overview'],
  });

  const metrics: MetricData[] = [
    {
      title: "إجمالي المشاهدات",
      value: analytics?.totalViews || "0",
      change: analytics?.viewsChange || 0,
      icon: Eye,
      color: "text-blue-600 dark:text-blue-400"
    },
    {
      title: "إجمالي المستخدمين",
      value: analytics?.totalUsers || "0",
      change: analytics?.usersChange || 0,
      icon: Users,
      color: "text-green-600 dark:text-green-400"
    },
    {
      title: "إجمالي المقالات",
      value: analytics?.totalArticles || "0",
      change: analytics?.articlesChange || 0,
      icon: FileText,
      color: "text-purple-600 dark:text-purple-400"
    },
    {
      title: "إجمالي التعليقات",
      value: analytics?.totalComments || "0",
      change: analytics?.commentsChange || 0,
      icon: MessageSquare,
      color: "text-yellow-600 dark:text-yellow-400"
    },
    {
      title: "إجمالي الإعجابات",
      value: analytics?.totalLikes || "0",
      change: analytics?.likesChange || 0,
      icon: Heart,
      color: "text-red-600 dark:text-red-400"
    },
    {
      title: "إجمالي المحفوظات",
      value: analytics?.totalBookmarks || "0",
      change: analytics?.bookmarksChange || 0,
      icon: Bookmark,
      color: "text-indigo-600 dark:text-indigo-400"
    }
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="space-y-0 pb-2">
              <div className="h-4 w-24 bg-muted rounded"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 bg-muted rounded mb-2"></div>
              <div className="h-3 w-20 bg-muted rounded"></div>
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
          <Card key={index} className="hover-elevate active-elevate-2">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {metric.title}
              </CardTitle>
              <Icon className={`h-4 w-4 ${metric.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metric.value.toLocaleString()}</div>
              <div className="flex items-center gap-1 text-xs mt-1">
                {isPositive ? (
                  <TrendingUp className="h-3 w-3 text-green-600" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-600" />
                )}
                <span className={isPositive ? "text-green-600" : "text-red-600"}>
                  {Math.abs(metric.change)}%
                </span>
                <span className="text-muted-foreground">من الشهر الماضي</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
