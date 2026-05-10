import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  TrendingUp, 
  Users, 
  MessageCircle,
  Activity,
  Lightbulb,
  BarChart3,
} from "lucide-react";

interface AIInsightsData {
  dailySummary: string;
  topTopics: Array<{ name: string; score: number }>;
  activityTrend: string;
  userEngagement: {
    activeUsers: number;
    totalComments: number;
    totalReactions: number;
  };
  keyHighlights: string[];
}

function InsightSkeleton() {
  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-5 w-40" />
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-8 w-24 rounded-full" />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function MomentAIInsights() {
  const { data, isLoading } = useQuery<AIInsightsData>({
    queryKey: ["/api/moment/ai-insights"],
  });

  if (isLoading) {
    return <InsightSkeleton />;
  }

  if (!data) return null;

  return (
    <Card data-testid="card-ai-insights">
      <CardContent className="p-6 space-y-6">
        {/* AI Summary */}
        <div className="p-4 bg-muted/50 rounded-lg border">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-primary/10 rounded-lg shrink-0">
              <Activity className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-sm mb-2">نبض اللحظة</h4>
              <p className="text-sm leading-relaxed text-muted-foreground" data-testid="text-ai-summary">
                {data.dailySummary}
              </p>
            </div>
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-blue-500/5 rounded-lg border border-blue-500/10">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground mb-1">المستخدمون النشطون</p>
                <p className="text-2xl font-bold text-blue-600" data-testid="stat-active-users">
                  {data.userEngagement.activeUsers.toLocaleString('en-US')}
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-green-500/5 rounded-lg border border-green-500/10">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <MessageCircle className="h-5 w-5 text-green-600" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground mb-1">التعليقات اليوم</p>
                <p className="text-2xl font-bold text-green-600" data-testid="stat-comments">
                  {data.userEngagement.totalComments.toLocaleString('en-US')}
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-orange-500/5 rounded-lg border border-orange-500/10">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <TrendingUp className="h-5 w-5 text-orange-600" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground mb-1">التفاعلات</p>
                <p className="text-2xl font-bold text-orange-600" data-testid="stat-reactions">
                  {data.userEngagement.totalReactions.toLocaleString('en-US')}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Top Topics */}
        {data.topTopics && data.topTopics.length > 0 && (
          <div>
            <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              المواضيع الأكثر نشاطاً
            </h4>
            <div className="flex flex-wrap gap-2">
              {data?.topTopics?.map((topic, index) => (
                <Badge 
                  key={topic.name}
                  variant="secondary"
                  className="gap-2"
                  data-testid={`badge-trending-${index}`}
                >
                  {topic.name}
                  <span className="text-xs opacity-70">({topic.score})</span>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Key Highlights */}
        {data.keyHighlights && data.keyHighlights.length > 0 && (
          <div>
            <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-primary" />
              أبرز الأحداث
            </h4>
            <ul className="space-y-2">
              {data?.keyHighlights?.map((highlight, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2 text-sm"
                  data-testid={`highlight-${index}`}
                >
                  <div className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                  <span>{highlight}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Activity Trend */}
        <div className="p-4 bg-muted/30 rounded-lg border-r-2 border-primary">
          <p className="text-xs font-medium text-primary mb-1">اتجاه النشاط</p>
          <p className="text-sm" data-testid="text-activity-trend">
            {data.activityTrend}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
