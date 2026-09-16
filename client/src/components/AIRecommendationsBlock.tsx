import type { ArticleSidebarQuery } from "@/hooks/useArticleSidebarData";
import { useArticleRecommendations, type ArticleRecommendation } from "@/hooks/useArticleSidebarData";
import { ArticleSidebarRecovery } from "@/components/ArticleSidebarRecovery";
import { ArticleSidebarModule } from "@/components/ArticleSidebarModule";
import { SidebarArticleCard } from "@/components/SidebarArticleCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles } from "lucide-react";

interface AIRecommendationsBlockProps {
  articleSlug: string;
}

export function AIRecommendationsBlock({ articleSlug }: AIRecommendationsBlockProps) {
  const query = useArticleRecommendations(articleSlug);
  return <AIRecommendationsPanel query={query} />;
}

function LoadingSkeleton() {
  return (
    <div className="article-sidebar-module" aria-hidden="true">
      <Skeleton className="h-8 w-48" />
      <div className="article-sidebar-module-list mt-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 rounded-xl border p-3">
            <Skeleton className="h-20 w-24 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** AI picks for the reader, in the shared sidebar card shape. */
export function AIRecommendationsPanel({ query }: { query: ArticleSidebarQuery<ArticleRecommendation[]> }) {
  const { data: recommendationsRaw, isLoading, error } = query;
  if (!recommendationsRaw && (error || query.fetchStatus === "paused" || query.sessionUnavailable)) {
    return <ArticleSidebarRecovery label="التوصيات" onRetry={query.retrySidebar} busy={query.isFetching} />;
  }
  const recommendations = Array.isArray(recommendationsRaw) ? recommendationsRaw : [];

  if (isLoading || query.waitingForSession) return <LoadingSkeleton />;
  if (recommendations.length === 0) return null;

  return (
    <>
      {error && <ArticleSidebarRecovery label="التوصيات" hasData onRetry={query.retrySidebar} busy={query.isFetching} />}
      <ArticleSidebarModule
        title="توصيات الذكاء الاصطناعي"
        description="مختار لك بواسطة AI"
        icon={Sparkles}
        titleTestId="text-ai-recommendations-title"
        testId="card-ai-recommendations"
      >
        {recommendations.map((rec, index) => (
          <SidebarArticleCard
            key={rec.id}
            testId={`ai-recommendation-${index}`}
            titleTestId={`ai-recommendation-title-${index}`}
            item={{
              id: rec.id,
              href: `/article/${rec.englishSlug || rec.slug}`,
              title: rec.title,
              imageUrl: rec.imageUrl,
              publishedAt: rec.publishedAt,
              byline: rec.category?.nameAr,
            }}
          />
        ))}
      </ArticleSidebarModule>
    </>
  );
}
