import type { ArticleSidebarQuery } from "@/hooks/useArticleSidebarData";
import { useArticleRecommendations, type ArticleRecommendation } from "@/hooks/useArticleSidebarData";
import { ArticleSidebarRecovery } from "@/components/ArticleSidebarRecovery";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { 
  Sparkles, 
  Brain, 
  Compass,
  Newspaper,
  TrendingUp,
  Clock,
  Eye
} from "lucide-react";

interface AIRecommendationsBlockProps {
  articleSlug: string;
}

const iconMap: Record<string, any> = {
  Brain,
  Sparkles,
  Compass,
  Newspaper,
  TrendingUp,
};

export function AIRecommendationsBlock({ articleSlug }: AIRecommendationsBlockProps) {
  const query = useArticleRecommendations(articleSlug);
  return <AIRecommendationsPanel query={query} />;
}

export function AIRecommendationsPanel({ query }: { query: ArticleSidebarQuery<ArticleRecommendation[]> }) {
  const { data: recommendationsRaw, isLoading, error } = query;
  if (!recommendationsRaw && (error || query.fetchStatus === "paused" || query.sessionUnavailable)) {
    return <ArticleSidebarRecovery label="التوصيات" onRetry={query.retrySidebar} busy={query.isFetching} />;
  }
  const recommendations = Array.isArray(recommendationsRaw) ? recommendationsRaw : [];

  if (isLoading || query.waitingForSession) {
    return (
      <Card className="overflow-hidden border-2 border-primary/20">
        <CardHeader className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 pb-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-5 w-32" />
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-3">
              <Skeleton className="h-5 w-5 rounded" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (recommendations.length === 0) {
    return null;
  }

  return (
    <>
      {error && <ArticleSidebarRecovery label="التوصيات" hasData onRetry={query.retrySidebar} busy={query.isFetching} />}
    <Card 
      className="overflow-hidden border-2 border-primary/20 shadow-lg hover:shadow-xl transition-shadow duration-300" 
      data-testid="card-ai-recommendations"
    >
      {/* Header with gradient background */}
      <CardHeader className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 pb-4 border-b border-primary/10">
        <div className="flex items-center justify-between gap-3 flex-wrap" dir="rtl">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg shadow-md">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <h3 className="text-lg font-bold text-foreground" data-testid="text-ai-recommendations-title">
              توصيات الذكاء الاصطناعي
            </h3>
          </div>
          <Badge 
            variant="outline" 
            className="text-xs bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
          >
            <Brain className="h-3 w-3 mr-1" />
            مختار لك بواسطة AI
          </Badge>
        </div>
      </CardHeader>

      {/* Recommendations List */}
      <CardContent className="p-0" dir="rtl">
        <div className="divide-y divide-border/50">
          {recommendations.map((rec, index) => {
            const IconComponent = iconMap[rec.aiMetadata.icon] || Newspaper;
            
            return (
              <Link key={rec.id} href={`/article/${rec.englishSlug || rec.slug}`}>
                <a
                  className="block p-4 hover:bg-muted/50 transition-colors group"
                  data-testid={`ai-recommendation-${index}`}
                >
                  <div className="flex items-start gap-3">
                    {/* Icon with gradient background */}
                    <div className="flex-shrink-0">
                      <div className="p-2 bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 rounded-lg group-hover:scale-110 transition-transform">
                        <IconComponent className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-2">
                      {/* Title */}
                      <h4 
                        className="font-semibold text-sm leading-tight text-foreground group-hover:text-primary transition-colors line-clamp-2"
                        data-testid={`ai-recommendation-title-${index}`}
                      >
                        {rec.title}
                      </h4>

                      {/* Excerpt */}
                      {rec.excerpt && (
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                          {rec.excerpt}
                        </p>
                      )}

                      {/* Meta info */}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {rec.category && (
                          <span className="flex items-center gap-1">
                            {rec.category.icon} {rec.category.nameAr}
                          </span>
                        )}
                        {rec.views !== undefined && (
                          <span className="flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            {rec.views}
                          </span>
                        )}
                      </div>

                      {/* AI Reason */}
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1">
                          <Sparkles className="h-2.5 w-2.5" />
                          {rec.aiMetadata.reason}
                        </span>
                        
                        {/* Relevance Score */}
                        <div className="flex items-center gap-1">
                          <div className="h-1.5 w-12 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all"
                              style={{ width: `${rec.aiMetadata.relevanceScore}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground font-medium">
                            {rec.aiMetadata.relevanceScore}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </a>
              </Link>
            );
          })}
        </div>

        {/* Footer message */}
        <div className="p-4 bg-muted/30 border-t border-border/50">
          <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-2">
            <Brain className="h-3.5 w-3.5 text-primary" />
            <span>بناءً على تفاعلك الأخير، هذه المواضيع قد تثير اهتمامك أيضًا</span>
          </p>
        </div>
      </CardContent>
    </Card>
    </>
  );
}
