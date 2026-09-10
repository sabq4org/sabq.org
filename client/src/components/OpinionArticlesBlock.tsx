import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { apiUrl } from "@/lib/queryClient";
import { ChevronLeft, Quote, User } from "lucide-react";
import { formatDistanceToNow, isValid } from "date-fns";
import { ar } from "date-fns/locale";

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
          )) : articles.map((article) => {
            const authorName = `${article.author?.firstName || ""} ${article.author?.lastName || ""}`.trim() || "كاتب رأي";
            const publishedAt = article.publishedAt ? new Date(article.publishedAt) : null;

            return (
              <article key={article.id} className={`${cardClassName} group`} data-testid={`opinion-card-${article.id}`}>
                <Quote className="absolute left-4 top-4 h-8 w-8 text-[#e3ebf2] dark:text-border" aria-hidden="true" />
                <div className="flex items-center gap-3 pl-8">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={article.author?.profileImageUrl} alt={authorName} className="object-cover" loading="lazy" />
                    <AvatarFallback><User className="h-6 w-6 text-[#6b7c8a] dark:text-muted-foreground" aria-hidden="true" /></AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#10202e] dark:text-foreground">{authorName}</p>
                    <p className="mt-0.5 text-xs text-[#6b7c8a] dark:text-muted-foreground">كاتب رأي</p>
                  </div>
                </div>

                <h3 className="mt-4 text-lg font-bold leading-relaxed text-[#10202e] dark:text-foreground">
                  <Link
                    href={`/opinion/${article.slug}`}
                    className="after:absolute after:inset-0 after:rounded-3xl transition-colors hover:text-primary focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-primary focus-visible:after:ring-offset-2"
                  >
                    {article.title}
                  </Link>
                </h3>
                {article.excerpt && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-[#5a6b79] dark:text-muted-foreground">{article.excerpt}</p>}

                <div className="mt-auto pt-4">
                  <div className="flex items-center justify-between gap-2 border-t border-[#e3ebf2] pt-3 text-xs text-[#6b7c8a] dark:text-muted-foreground dark:border-border">
                    {publishedAt && isValid(publishedAt) ? (
                      <time dateTime={publishedAt.toISOString()}>
                        {formatDistanceToNow(publishedAt, { addSuffix: true, locale: ar })}
                      </time>
                    ) : <span />}
                    <span className="font-semibold text-[#0e76b8] dark:text-primary">اقرأ المقال</span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
