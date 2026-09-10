import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { apiUrl } from "@/lib/queryClient";
import { ChevronLeft } from "lucide-react";
import { OpinionCard } from "@/components/public/OpinionCard";

const ARTICLE_LIMIT = 8;
const cardClassName = "relative flex min-w-0 flex-col rounded-3xl border border-[#e3ebf2] bg-white p-5 dark:border-border dark:bg-card";

type OpinionArticle = {
  id: string;
  title: string;
  excerpt?: string;
  slug: string;
  publishedAt?: string;
  author?: {
    firstName?: string;
    lastName?: string;
    profileImageUrl?: string;
  };
};

interface OpinionArticlesBlockProps {
  enabled?: boolean;
}

export function OpinionArticlesBlock({ enabled = true }: OpinionArticlesBlockProps) {
  const { data, isLoading } = useQuery<{ articles: OpinionArticle[] }>({
    queryKey: ["/api/opinion", { page: 1, limit: ARTICLE_LIMIT }],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/opinion?page=1&limit=${ARTICLE_LIMIT}`), {
        credentials: "include",
      });
      if (!res.ok) return { articles: [] };
      return await res.json();
    },
    enabled,
  });
  const articles = Array.isArray(data?.articles) ? data.articles.slice(0, ARTICLE_LIMIT) : [];

  if (!enabled || (!isLoading && articles.length === 0)) return null;

  return (
    <section
      className="border-y border-[#e3ebf2] bg-[#f4f8fb] py-8 md:py-10 dark:border-border dark:bg-muted/30"
      dir="rtl"
      aria-labelledby="homepage-opinions-heading"
      aria-busy={isLoading}
      data-testid="homepage-opinions"
    >
      <div className="container mx-auto max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <h2 id="homepage-opinions-heading" className="flex items-center gap-3 text-xl font-bold text-[#10202e] sm:text-2xl md:text-3xl dark:text-foreground">
            <span className="h-7 w-1.5 shrink-0 rounded-full bg-[#0e76b8]" aria-hidden="true" />
            آراء تستحق القراءة
          </h2>
          <Link
            href="/opinion"
            className="flex min-h-11 shrink-0 items-center gap-1 rounded text-sm font-semibold text-[#6b7c8a] dark:text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            data-testid="button-view-all-opinions"
          >
            المزيد
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4" data-testid="homepage-opinions-grid">
          {isLoading ? Array.from({ length: ARTICLE_LIMIT }, (_, i) => (
            <div key={i} className={cardClassName} aria-hidden="true" data-testid="opinion-card-skeleton">
              <div className="flex items-center gap-3">
                <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-14" />
                </div>
              </div>
              <div className="my-5 space-y-3">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-4/5" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
              <div className="flex justify-between border-t border-[#e3ebf2] pt-3 dark:border-border">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          )) : articles.map((article) => <OpinionCard key={article.id} article={article} variant="home" />)}
        </div>
      </div>
    </section>
  );
}
