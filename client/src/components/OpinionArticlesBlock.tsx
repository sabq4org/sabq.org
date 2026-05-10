import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, ArrowLeft, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

type OpinionArticle = {
  id: string;
  title: string;
  excerpt?: string;
  slug: string;
  imageUrl?: string;
  publishedAt?: string;
  views: number;
  author?: {
    id: string;
    firstName?: string;
    lastName?: string;
    profileImageUrl?: string;
  };
  category?: {
    id: string;
    nameAr: string;
    icon?: string;
  };
};

interface OpinionArticlesBlockProps {
  enabled?: boolean;
}

export function OpinionArticlesBlock({ enabled = true }: OpinionArticlesBlockProps) {
  const { data: articles, isLoading } = useQuery<{ articles: OpinionArticle[]; total: number }>({
    queryKey: ["/api/opinion", { page: 1, limit: 6 }],
    queryFn: async () => {
      const res = await fetch("/api/opinion?page=1&limit=6", {
        credentials: "include",
      });
      if (!res.ok) return { articles: [], total: 0 };
      return await res.json();
    },
    enabled,
  });

  if (isLoading) {
    return (
      <section className="py-8" dir="rtl">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BookOpen className="h-6 w-6 text-primary" />
              <h2 className="text-2xl md:text-3xl font-bold">مقالات الرأي</h2>
            </div>
          </div>

          {/* Mobile Skeleton */}
          <div className="md:hidden space-y-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-card shadow-sm border border-border dark:border-card-border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-2 w-2/3" />
                <div className="flex items-center gap-2 pt-2 border-t">
                  <Skeleton className="h-5 w-5 rounded-full" />
                  <Skeleton className="h-2 w-20" />
                  <Skeleton className="h-2 w-16" />
                </div>
              </div>
            ))}
          </div>

          {/* Tablet/Desktop Skeleton */}
          <div className="hidden md:grid gap-4 sm:gap-6 grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="shadow-sm border border-border dark:border-card-border">
                <CardContent className="p-4 sm:p-5 space-y-3">
                  <div className="h-6 bg-muted rounded w-1/3"></div>
                  <div className="h-5 bg-muted rounded w-full"></div>
                  <div className="h-5 bg-muted rounded w-4/5"></div>
                  <div className="h-4 bg-muted rounded w-2/3"></div>
                  <div className="h-4 bg-muted rounded w-1/2"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (!articles || articles.articles.length === 0) {
    return null;
  }

  return (
    <section className="py-8" dir="rtl">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen className="h-6 w-6 text-primary" />
            <h2 className="text-2xl md:text-3xl font-bold">مقالات الرأي</h2>
          </div>
          <Link href="/opinion">
            <Button variant="ghost" className="gap-2" data-testid="button-view-all-opinions">
              عرض الكل
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        {/* Mobile View - Compact List */}
        <div className="md:hidden flex flex-col gap-4">
          {articles?.articles?.map((article) => {
            const authorName = article.author
              ? `${article.author.firstName || ""} ${article.author.lastName || ""}`.trim() || "كاتب"
              : "كاتب";

            return (
              <Link key={article.id} href={`/opinion/${article.slug}`} className="block">
                <div 
                  className="group bg-card shadow-sm border border-border dark:border-card-border rounded-lg p-3 hover-elevate active-elevate-2"
                  data-testid={`opinion-card-mobile-${article.id}`}
                >
                  {/* Badges */}
                  <div className="flex items-center gap-1.5 mb-2">
                    <Badge variant="default" className="gap-1 text-[10px] px-1.5 py-0.5">
                      <BookOpen className="h-2.5 w-2.5" />
                      رأي
                    </Badge>
                    {article.category && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
                        {article.category.icon} {article.category.nameAr}
                      </Badge>
                    )}
                  </div>

                  {/* Title - 2 lines max */}
                  <h3 className="text-sm font-bold line-clamp-2 leading-snug mb-2 group-hover:text-primary transition-colors">
                    {article.title}
                  </h3>

                  {/* Excerpt - 1 line only on mobile */}
                  {article.excerpt && (
                    <p className="text-xs text-muted-foreground line-clamp-1 mb-2">
                      {article.excerpt}
                    </p>
                  )}

                  {/* Author info - compact */}
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-2 border-t border-border dark:border-border/60">
                    <div className="flex items-center gap-2">
                      {article.author?.profileImageUrl ? (
                        <img
                          src={article.author.profileImageUrl}
                          alt={authorName}
                          className="h-8 w-8 rounded-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                          <User className="h-4 w-4" />
                        </div>
                      )}
                      <span className="font-medium">{authorName}</span>
                    </div>
                    {article.publishedAt && (
                      <span className="text-[10px]">
                        {formatDistanceToNow(new Date(article.publishedAt), {
                          addSuffix: true,
                          locale: ar,
                        })}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Tablet/Desktop View - Cards Grid */}
        <div className="hidden md:grid gap-4 sm:gap-6 grid-cols-2 lg:grid-cols-3">
          {articles?.articles?.map((article) => {
            const authorName = article.author
              ? `${article.author.firstName || ""} ${article.author.lastName || ""}`.trim() || "كاتب"
              : "كاتب";

            return (
              <Link key={article.id} href={`/opinion/${article.slug}`}>
                <Card className="h-full hover-elevate active-elevate-2 overflow-hidden shadow-sm border border-border dark:border-card-border" data-testid={`opinion-card-${article.id}`}>
                  <CardContent className="p-4 sm:p-5 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="default" className="gap-1">
                        <BookOpen className="h-3 w-3" />
                        رأي
                      </Badge>
                      {article.category && (
                        <Badge variant="secondary">
                          {article.category.icon} {article.category.nameAr}
                        </Badge>
                      )}
                    </div>

                    <h3 className="text-base sm:text-lg font-bold line-clamp-2 leading-tight">
                      {article.title}
                    </h3>

                    {article.excerpt && (
                      <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                        {article.excerpt}
                      </p>
                    )}

                    <div className="flex items-center gap-3 sm:gap-4 text-xs text-muted-foreground pt-2 border-t border-border dark:border-border/60">
                      <div className="flex items-center gap-3">
                        {article.author?.profileImageUrl ? (
                          <img
                            src={article.author.profileImageUrl}
                            alt={authorName}
                            className="h-10 w-10 rounded-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                            <User className="h-5 w-5" />
                          </div>
                        )}
                        <span className="font-medium">{authorName}</span>
                      </div>
                      {article.publishedAt && (
                        <span>
                          {formatDistanceToNow(new Date(article.publishedAt), {
                            addSuffix: true,
                            locale: ar,
                          })}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
