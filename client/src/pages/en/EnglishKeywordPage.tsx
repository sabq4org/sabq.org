import { useQuery } from "@tanstack/react-query";
import { getObjectPosition } from "@/lib/imageUtils";
import { useParams, Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, Eye, Tag, Zap, Flame, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { EnArticle } from "@shared/schema";
import { EnglishLayout } from "@/components/en/EnglishLayout";

// Helper function to check if article is new (published within last 3 hours)
const isNewArticle = (publishedAt: Date | string | null | undefined) => {
  if (!publishedAt) return false;
  const published = typeof publishedAt === 'string' ? new Date(publishedAt) : publishedAt;
  const now = new Date();
  const diffInHours = (now.getTime() - published.getTime()) / (1000 * 60 * 60);
  return diffInHours <= 3;
};

export default function EnglishKeywordPage() {
  const params = useParams();
  const keyword = decodeURIComponent(params.keyword || "");

  const { data: user } = useQuery<{ id: string; firstName?: string; email?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const { data: articles, isLoading } = useQuery<EnArticle[]>({
    queryKey: ["/api/en/keyword", keyword],
    queryFn: async () => {
      const res = await fetch(`/api/en/keyword/${encodeURIComponent(keyword)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch articles");
      return res.json();
    },
  });

  return (
    <EnglishLayout>
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8 space-y-4">
          <div className="flex items-center gap-3">
            <Tag className="h-8 w-8 text-primary" />
            <h1 className="text-3xl md:text-4xl font-bold" data-testid="text-keyword-title">
              {keyword}
            </h1>
          </div>
          {!isLoading && articles && (
            <p className="text-muted-foreground" data-testid="text-articles-count">
              {articles.length} {articles.length === 1 ? "article" : "articles"}
            </p>
          )}
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}

        {/* Articles - Unified Layout */}
        {!isLoading && articles && articles.length > 0 && (
          <>
            {/* Mobile View: Vertical List */}
            <Card className="overflow-hidden lg:hidden border-0 dark:border dark:border-card-border">
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {articles.map((article) => {
                    const timeAgo = article.publishedAt
                      ? formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true })
                      : null;

                    return (
                      <div key={article.id}>
                        <Link href={`/en/article/${article.englishSlug || article.slug}`}>
                          <div 
                            className="block group cursor-pointer"
                            data-testid={`link-article-mobile-${article.id}`}
                          >
                            <div className={`p-4 hover-elevate active-elevate-2 transition-all ${
                              article.newsType === "breaking" ? "bg-destructive/5" : ""
                            }`}>
                              <div className="flex gap-3">
                                {/* Image */}
                                <div className="relative flex-shrink-0 w-24 h-20 rounded-lg overflow-hidden">
                                  {article.imageUrl ? (
                                    <img
                                      src={article.imageUrl}
                                      alt={article.title}
                                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                      loading="lazy"
                                      style={{
                                        objectPosition: getObjectPosition(article)
                                      }}
                                    />
                                  ) : (
                                    <div className="w-full h-full bg-gradient-to-br from-primary/20 via-accent/20 to-primary/10" />
                                  )}
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0 space-y-2">
                                  {/* Breaking/New Badge */}
                                  {article.newsType === "breaking" ? (
                                    <Badge 
                                      variant="destructive" 
                                      className="text-xs h-5 gap-1"
                                      data-testid={`badge-breaking-${article.id}`}
                                    >
                                      <Zap className="h-3 w-3" />
                                      Breaking
                                    </Badge>
                                  ) : isNewArticle(article.publishedAt) ? (
                                    <Badge 
                                      className="text-xs h-5 gap-1 bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600"
                                      data-testid={`badge-new-${article.id}`}
                                    >
                                      <Flame className="h-3 w-3" />
                                      New
                                    </Badge>
                                  ) : null}

                                  {/* Title */}
                                  <h4 className={`font-bold text-sm line-clamp-2 leading-snug transition-colors ${
                                    article.newsType === "breaking"
                                      ? "text-destructive"
                                      : "group-hover:text-primary"
                                  }`} data-testid={`text-article-title-${article.id}`}>
                                    {article.title}
                                  </h4>

                                  {/* Meta Info */}
                                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                    {timeAgo && (
                                      <span className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {timeAgo}
                                      </span>
                                    )}
                                    {article.views !== undefined && (
                                      <span className="flex items-center gap-1">
                                        <Eye className="h-3 w-3" />
                                        {article.views.toLocaleString()}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Desktop View: Grid with 4 columns */}
            <div className="hidden lg:grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {articles.map((article) => (
                <Link key={article.id} href={`/en/article/${article.englishSlug || article.slug}`}>
                  <Card 
                    className={`cursor-pointer h-full overflow-hidden border-0 dark:border dark:border-card-border ${
                      article.newsType === "breaking" ? "bg-destructive/5" : ""
                    }`}
                    data-testid={`card-article-${article.id}`}
                  >
                    {article.imageUrl && (
                      <div className="relative h-48 overflow-hidden">
                        <img
                          src={article.imageUrl}
                          alt={article.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          style={{
                            objectPosition: getObjectPosition(article)
                          }}
                        />
                        {article.newsType === "breaking" ? (
                          <Badge 
                            variant="destructive" 
                            className="absolute top-3 left-3 gap-1" 
                            data-testid={`badge-breaking-${article.id}`}
                          >
                            <Zap className="h-3 w-3" />
                            Breaking
                          </Badge>
                        ) : isNewArticle(article.publishedAt) ? (
                          <Badge 
                            className="absolute top-3 left-3 gap-1 bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600" 
                            data-testid={`badge-new-${article.id}`}
                          >
                            <Flame className="h-3 w-3" />
                            New
                          </Badge>
                        ) : null}
                        {article.aiSummary && (
                          <div className="absolute top-3 right-3">
                            <Badge variant="secondary" className="bg-primary/90 text-primary-foreground">
                              <Sparkles className="h-3 w-3 mr-1" />
                              AI
                            </Badge>
                          </div>
                        )}
                      </div>
                    )}
                    
                    <CardContent className="p-4 space-y-3">
                      <h3 
                        className={`font-bold text-lg line-clamp-2 ${
                          article.newsType === "breaking"
                            ? "text-destructive"
                            : "text-foreground"
                        }`}
                        data-testid={`text-article-title-${article.id}`}
                      >
                        {article.title}
                      </h3>
                      
                      {article.excerpt && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {article.excerpt}
                        </p>
                      )}

                      <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2">
                        {article.publishedAt && (
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>
                              {formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true })}
                            </span>
                          </div>
                        )}
                        
                        {article.views !== undefined && (
                          <div className="flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            <span>{article.views.toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </>
        )}

        {/* Empty State */}
        {!isLoading && articles && articles.length === 0 && (
          <div className="text-center py-12">
            <Tag className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-2xl font-bold mb-2" data-testid="text-no-articles">
              No Articles Found
            </h2>
            <p className="text-muted-foreground">
              We couldn't find any articles with the keyword "{keyword}"
            </p>
          </div>
        )}
      </main>
    </EnglishLayout>
  );
}
