import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { UrduLayout } from "@/components/ur/UrduLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Clock, Eye, Newspaper, Zap, Flame } from "lucide-react";
import { Link } from "wouter";
import type { UrCategory, UrArticle } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { arSA } from "date-fns/locale";
import { CategoryAnalytics } from "@/components/CategoryAnalytics";
import { UrduFooter } from "@/components/ur/UrduFooter";
import { useHeroPreload } from "@/hooks/useHeroPreload";
import {
  buildCloudflareUrl,
  generateResponsiveSrcSet,
  HERO_SIZES_ATTR,
} from "@/lib/cdnImage";

// Helper function to check if article is new (published within last 3 hours)
const isNewArticle = (publishedAt: Date | string | null | undefined) => {
  if (!publishedAt) return false;
  const published = typeof publishedAt === 'string' ? new Date(publishedAt) : publishedAt;
  const now = new Date();
  const diffInHours = (now.getTime() - published.getTime()) / (1000 * 60 * 60);
  return diffInHours <= 3;
};

export default function UrduCategoryPage() {
  const { slug } = useParams<{ slug: string }>();

  const { data: user } = useQuery<{ id: string; firstName?: string; email?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const { data: category, isLoading: categoryLoading } = useQuery<UrCategory>({
    queryKey: ["/api/ur/categories/slug", slug],
    queryFn: async () => {
      const res = await fetch(`/api/ur/categories/slug/${slug}`, { credentials: 'include' });
      if (!res.ok) throw new Error("Failed to fetch category");
      return res.json();
    },
  });

  const { data: articlesRaw, isLoading: articlesLoading } = useQuery<UrArticle[]>({
    queryKey: ["/api/ur/categories", slug, "articles"],
    queryFn: async () => {
      if (!category) return [];
      const res = await fetch(`/api/ur/categories/${category.id}/articles`, { credentials: 'include' });
      if (!res.ok) throw new Error("Failed to fetch articles");
      return res.json();
    },
    enabled: !!category,
  });
  const articles = Array.isArray(articlesRaw) ? articlesRaw : [];

  const { data: analytics, isLoading: analyticsLoading } = useQuery<any>({
    queryKey: ["/api/ur/categories", category?.id, "analytics"],
    queryFn: async () => {
      if (!category) return null;
      const res = await fetch(`/api/ur/categories/${category.id}/analytics`, { credentials: 'include' });
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
    enabled: !!category,
  });

  // LCP: preload the hero image once the category data is known.
  useHeroPreload(category?.heroImageUrl);

  if (categoryLoading) {
    return (
      <UrduLayout>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Skeleton className="h-64 w-full mb-8 rounded-xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-80 rounded-lg" />
            ))}
          </div>
        </div>
      </UrduLayout>
    );
  }

  if (!category) {
    return (
      <UrduLayout>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <h1 className="text-3xl font-bold mb-4">زمرہ نہیں ملا</h1>
          <p className="text-muted-foreground">ہمیں یہ زمرہ نہیں مل سکا</p>
        </div>
      </UrduLayout>
    );
  }

  return (
    <UrduLayout>
      <div>
        {/* Hero Section */}
        {category.heroImageUrl ? (
          <div className="relative h-48 sm:h-64 md:h-80 overflow-hidden">
            <img
              src={buildCloudflareUrl(category.heroImageUrl, { width: 1280, quality: 80 }) || category.heroImageUrl}
              srcSet={generateResponsiveSrcSet(category.heroImageUrl, 80) || undefined}
              sizes={HERO_SIZES_ATTR}
              alt={category.name}
              className="w-full h-full object-cover"
              width={1280}
              height={320}
              loading="eager"
              decoding="async"
              {...{ fetchpriority: "high" }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-black/30 dark:from-black/80 dark:via-black/40 dark:to-transparent" />
            <div className="absolute inset-0 flex items-end">
              <div className="container mx-auto px-3 sm:px-6 lg:px-8 pb-6 sm:pb-8">
                <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-2 sm:mb-3">
                  {category.name}
                </h1>
                {category.description && (
                  <p className="text-sm sm:text-base md:text-lg text-white/90 max-w-3xl">
                    {category.description}
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-gradient-to-br from-primary/10 to-primary/5 py-12 sm:py-16">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center gap-4 mb-4">
                <Newspaper className="h-12 w-12 sm:h-16 sm:w-16 text-primary" />
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold">
                  {category.name}
                </h1>
              </div>
              {category.description && (
                <p className="text-base sm:text-lg text-muted-foreground max-w-3xl">
                  {category.description}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Category Analytics */}
        {analyticsLoading ? (
          <div className="container mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i} className="shadow-sm border border-border/40 dark:border-card-border">
                  <CardContent className="p-4 sm:p-6">
                    <Skeleton className="h-24 sm:h-32 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : analytics ? (
          <div className="container mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8">
            <CategoryAnalytics analytics={analytics} language="ur" />
          </div>
        ) : null}

        {/* Articles Grid */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          {articlesLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : articles.length === 0 ? (
            <div className="text-center py-20">
              <Newspaper className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-2xl font-bold mb-2">ابھی کوئی مضامین نہیں</h2>
              <p className="text-muted-foreground">
                اس وقت اس زمرے میں کوئی مضامین نہیں ہیں
              </p>
            </div>
          ) : (
            <>
              {/* Mobile View: Vertical List */}
              <Card className="overflow-hidden lg:hidden shadow-sm border border-border/40 dark:border-card-border">
                <CardContent className="p-0">
                  <div className="divide-y divide-border/50 dark:divide-border">
                    {articles.map((article) => {
                      const timeAgo = article.publishedAt
                        ? formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true, locale: arSA })
                        : null;

                      return (
                        <div key={article.id}>
                          <Link href={`/ur/article/${article.englishSlug || article.slug}`}>
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
                                        تازہ خبر
                                      </Badge>
                                    ) : isNewArticle(article.publishedAt) ? (
                                      <Badge 
                                        className="text-xs h-5 gap-1 bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600"
                                        data-testid={`badge-new-${article.id}`}
                                      >
                                        <Flame className="h-3 w-3" />
                                        نیا
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
                  <Link key={article.id} href={`/ur/article/${article.englishSlug || article.slug}`}>
                    <Card 
                      className={`cursor-pointer h-full overflow-hidden shadow-sm border border-border/40 dark:border-card-border ${
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
                          />
                          {article.newsType === "breaking" ? (
                            <Badge 
                              variant="destructive" 
                              className="absolute top-3 left-3 gap-1" 
                              data-testid={`badge-breaking-${article.id}`}
                            >
                              <Zap className="h-3 w-3" />
                              تازہ خبر
                            </Badge>
                          ) : isNewArticle(article.publishedAt) ? (
                            <Badge 
                              className="absolute top-3 left-3 gap-1 bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600" 
                              data-testid={`badge-new-${article.id}`}
                            >
                              <Flame className="h-3 w-3" />
                              نیا
                            </Badge>
                          ) : null}
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
                                {formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true, locale: arSA })}
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
        </div>
      </div>
      <UrduFooter />
    </UrduLayout>
  );
}
