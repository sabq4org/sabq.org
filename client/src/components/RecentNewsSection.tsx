import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Newspaper, ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { apiUrl } from "@/lib/queryClient";
import { ArticleSidebarModule } from "@/components/ArticleSidebarModule";
import { SidebarArticleCard } from "@/components/SidebarArticleCard";

interface NewsArticle {
  id: string;
  title: string;
  slug: string;
  englishSlug?: string;
  imageUrl?: string;
  featuredImage?: string;
  thumbnailUrl?: string;
  publishedAt?: string;
  updatedAt?: string;
  articleType?: string;
  category?: {
    id: string;
    nameAr: string;
    slug: string;
  };
}

interface RecentNewsSectionProps {
  excludeArticleId?: string;
  limit?: number;
}

function LoadingSkeleton() {
  return (
    <div className="article-sidebar-module" aria-hidden="true">
      <Skeleton className="h-8 w-48" />
      <div className="article-sidebar-module-list mt-4">
        {[1, 2, 3, 4, 5].map((i) => (
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

/** Latest news beside an opinion piece, in the shared sidebar card shape. */
export function RecentNewsSection({
  excludeArticleId,
  limit = 5,
}: RecentNewsSectionProps) {
  const { data, isLoading } = useQuery<{ articles: NewsArticle[] }>({
    queryKey: ["/api/articles/recent", { excludeId: excludeArticleId, limit }],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: String(limit + 1),
        excludeOpinion: "true",
      });
      if (excludeArticleId) {
        params.append("excludeId", excludeArticleId);
      }
      const res = await fetch(apiUrl(`/api/articles/recent?${params}`), {
        credentials: "include",
      });
      if (!res.ok) return { articles: [] };
      const data = await res.json();
      return { articles: (data.articles || []).slice(0, limit) };
    },
  });

  if (isLoading) return <LoadingSkeleton />;

  const articles = Array.isArray(data?.articles) ? data.articles.slice(0, limit) : [];
  if (articles.length === 0) return null;

  return (
    <ArticleSidebarModule
      title="أخبار نُشرت مؤخراً"
      description="قد تعجبك أيضاً"
      icon={Newspaper}
      testId="sidebar-recent-news"
      action={
        <Link href="/news" data-testid="button-view-more-news">
          المزيد <ArrowLeft aria-hidden="true" />
        </Link>
      }
    >
      {articles.map((article) => (
        <SidebarArticleCard
          key={article.id}
          item={{
            id: article.id,
            href: `/article/${article.englishSlug || article.slug}`,
            title: article.title,
            imageUrl: article.imageUrl || article.thumbnailUrl || article.featuredImage || null,
            updatedAt: article.updatedAt,
            publishedAt: article.publishedAt,
            byline: article.category?.nameAr,
          }}
        />
      ))}
    </ArticleSidebarModule>
  );
}
