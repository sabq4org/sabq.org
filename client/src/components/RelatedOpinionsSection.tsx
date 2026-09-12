import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { BookOpen, ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { apiUrl } from "@/lib/queryClient";
import { ArticleSidebarModule } from "@/components/ArticleSidebarModule";
import { SidebarArticleCard } from "@/components/SidebarArticleCard";

interface OpinionArticle {
  id: string;
  title: string;
  excerpt?: string;
  slug: string;
  imageUrl?: string;
  publishedAt?: string;
  updatedAt?: string;
  views: number;
  author?: {
    id: string;
    firstName?: string;
    lastName?: string;
    profileImageUrl?: string;
    bio?: string;
  };
  category?: {
    id: string;
    nameAr: string;
    nameEn: string;
    slug: string;
    color?: string;
    icon?: string;
  };
}

interface RelatedOpinionsSectionProps {
  categoryId: string;
  categoryName: string;
  excludeArticleId?: string;
  limit?: number;
}

function authorName(article: OpinionArticle) {
  const author = article.author;
  if (!author) return "كاتب رأي";
  return `${author.firstName || ""} ${author.lastName || ""}`.trim() || "كاتب رأي";
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

/** Latest opinion pieces from the story's section, in the shared sidebar card shape. */
export function RelatedOpinionsSection({
  categoryId,
  categoryName,
  excludeArticleId,
  limit = 5,
}: RelatedOpinionsSectionProps) {
  const { data, isLoading } = useQuery<{ articles: OpinionArticle[]; total: number }>({
    queryKey: ["/api/opinion/related/category", categoryId, { excludeId: excludeArticleId, limit }],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: limit.toString(),
        ...(excludeArticleId && { excludeId: excludeArticleId }),
      });
      const res = await fetch(apiUrl(`/api/opinion/related/category/${categoryId}?${params}`), {
        credentials: "include",
      });
      if (!res.ok) return { articles: [], total: 0 };
      return await res.json();
    },
  });

  if (isLoading) return <LoadingSkeleton />;

  const articles = Array.isArray(data?.articles) ? data.articles : [];
  if (articles.length === 0) return null;

  return (
    <ArticleSidebarModule
      title="مقالات قد تهمك"
      description={`من تصنيف «${categoryName}»`}
      icon={BookOpen}
      testId="sidebar-related-opinions"
      action={
        <Link href={`/opinion?category=${categoryId}`} data-testid="button-view-more-opinions">
          عرض المزيد <ArrowLeft aria-hidden="true" />
        </Link>
      }
    >
      {articles.map((article) => (
        <SidebarArticleCard
          key={article.id}
          ariaLabel="مقال"
          testId={`opinion-sidebar-${article.id}`}
          item={{
            id: article.id,
            href: `/opinion/${article.slug}`,
            title: article.title,
            // Opinion pieces without artwork keep the author's photo inside the same frame.
            imageUrl: article.imageUrl || article.author?.profileImageUrl || null,
            updatedAt: article.updatedAt,
            // No timestamp here: the block reads as a writers' list, not a timeline.
            byline: authorName(article),
            bylineAvatarUrl: article.author?.profileImageUrl || null,
          }}
        />
      ))}
    </ArticleSidebarModule>
  );
}
