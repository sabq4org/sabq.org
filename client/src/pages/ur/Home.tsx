import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Clock, Eye, TrendingUp, Flame, Zap } from "lucide-react";
import { UrduLayout } from "@/components/ur/UrduLayout";
import { UrduHeroCarousel } from "@/components/ur/UrduHeroCarousel";
import { UrduQuadCategoriesBlock } from "@/components/ur/UrduQuadCategoriesBlock";
import { UrduSmartNewsBlock } from "@/components/ur/UrduSmartNewsBlock";
import { UrduSmartSummaryBlock } from "@/components/ur/UrduSmartSummaryBlock";
import { useAuth } from "@/hooks/useAuth";
import { useCanonical } from "@/hooks/useCanonical";
import type { UrArticleWithDetails, UrSmartBlock } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

// Helper function to check if article is new (published within last 3 hours)
const isNewArticle = (publishedAt: Date | string | null | undefined) => {
  if (!publishedAt) return false;
  const published = typeof publishedAt === 'string' ? new Date(publishedAt) : publishedAt;
  const now = new Date();
  const diffInHours = (now.getTime() - published.getTime()) / (1000 * 60 * 60);
  return diffInHours <= 3;
};

export default function UrduHome() {
  const { user } = useAuth();
  
  useCanonical("https://sabq.org/ur");
  
  const { data: articlesRaw, isLoading: articlesLoading } = useQuery<UrArticleWithDetails[]>({
    queryKey: ["/api/ur/articles"],
  });
  const articles = Array.isArray(articlesRaw) ? articlesRaw : [];

  // Fetch smart blocks for different placements
  const { data: blocksBelowFeatured } = useQuery<UrSmartBlock[]>({
    queryKey: ['/api/ur/smart-blocks', 'below_featured'],
    queryFn: async () => {
      const params = new URLSearchParams({ isActive: 'true', placement: 'below_featured' });
      const res = await fetch(`/api/ur/smart-blocks?${params}`, { credentials: 'include' });
      if (!res.ok) return [];
      return await res.json();
    },
  });

  const { data: blocksAboveAllNews } = useQuery<UrSmartBlock[]>({
    queryKey: ['/api/ur/smart-blocks', 'above_all_news'],
    queryFn: async () => {
      const params = new URLSearchParams({ isActive: 'true', placement: 'above_all_news' });
      const res = await fetch(`/api/ur/smart-blocks?${params}`, { credentials: 'include' });
      if (!res.ok) return [];
      return await res.json();
    },
  });

  const { data: blocksBetweenAllAndMurqap } = useQuery<UrSmartBlock[]>({
    queryKey: ['/api/ur/smart-blocks', 'between_all_and_murqap'],
    queryFn: async () => {
      const params = new URLSearchParams({ isActive: 'true', placement: 'between_all_and_murqap' });
      const res = await fetch(`/api/ur/smart-blocks?${params}`, { credentials: 'include' });
      if (!res.ok) return [];
      return await res.json();
    },
  });

  const { data: blocksAboveFooter } = useQuery<UrSmartBlock[]>({
    queryKey: ['/api/ur/smart-blocks', 'above_footer'],
    queryFn: async () => {
      const params = new URLSearchParams({ isActive: 'true', placement: 'above_footer' });
      const res = await fetch(`/api/ur/smart-blocks?${params}`, { credentials: 'include' });
      if (!res.ok) return [];
      return await res.json();
    },
  });

  // Separate featured and regular articles
  const featuredArticles = articles.filter(article => article.isFeatured && article.status === "published");
  const regularArticles = articles.filter(article => !article.isFeatured && article.status === "published");

  if (articlesLoading) {
    return (
      <UrduLayout>
        <div className="container max-w-7xl mx-auto px-4 py-8">
          <Skeleton className="h-12 w-48 mb-8" />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <Skeleton key={i} className="h-64" />
            ))}
          </div>
        </div>
      </UrduLayout>
    );
  }

  return (
    <UrduLayout>
      <main className="flex-1">
        <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
          {/* Featured News Carousel */}
          {featuredArticles.length > 0 && (
            <div className="mb-8">
              <UrduHeroCarousel articles={featuredArticles} />
            </div>
          )}

          {/* Smart Blocks: below_featured */}
          {blocksBelowFeatured && blocksBelowFeatured.map((block) => (
            <UrduSmartNewsBlock key={block.id} config={block} />
          ))}
        </div>

        {/* Smart Summary Block - Only for authenticated users */}
        {user && (
          <div className="bg-ai-gradient-soft py-8">
            <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
              <div className="scroll-fade-in">
                <UrduSmartSummaryBlock />
              </div>
            </div>
          </div>
        )}

        <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 py-8">
          {/* Smart Blocks: above_all_news */}
          {blocksAboveAllNews && blocksAboveAllNews.map((block) => (
            <UrduSmartNewsBlock key={block.id} config={block} />
          ))}

          {/* Latest Articles Section */}
          {regularArticles.length > 0 && (
            <div className="scroll-fade-in">
              <div className="flex items-center gap-3 mb-6">
                <TrendingUp className="h-6 w-6 text-primary" />
                <h2 className="text-2xl md:text-3xl font-bold">تازہ ترین خبریں</h2>
              </div>

              <p className="text-muted-foreground mb-4">
                تمام تازہ ترین مضامین نئے سے پرانے کی ترتیب میں
              </p>

              {/* Mobile View: Vertical List */}
              <Card className="overflow-hidden lg:hidden border-0 dark:border dark:border-card-border">
                <CardContent className="p-0">
                  <div className="dark:divide-y">
                    {regularArticles.map((article) => {
                      const timeAgo = article.publishedAt
                        ? formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true })
                        : null;

                      return (
                        <div key={article.id}>
                          <Link href={`/ur/article/${article.englishSlug || article.slug}`}>
                            <div 
                              className="block group cursor-pointer"
                              data-testid={`link-article-mobile-${article.id}`}
                            >
                              <div className="p-4 hover-elevate active-elevate-2 transition-all">
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
                                    {isNewArticle(article.publishedAt) && (
                                      <div className="absolute top-1 left-1 bg-emerald-500 text-white px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-0.5">
                                        <Flame className="h-2.5 w-2.5" />
                                        نیا
                                      </div>
                                    )}
                                  </div>

                                  {/* Content */}
                                  <div className="flex-1 min-w-0 space-y-2">
                                    {/* Breaking/New/Category Badge */}
                                    {article.newsType === "breaking" ? (
                                      <Badge 
                                        variant="destructive" 
                                        className="text-xs h-5 gap-1"
                                        data-testid={`badge-breaking-${article.id}`}
                                      >
                                        <Zap className="h-3 w-3" />
                                        بریکنگ
                                      </Badge>
                                    ) : isNewArticle(article.publishedAt) ? (
                                      <Badge 
                                        className="text-xs h-5 gap-1 bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600"
                                        data-testid={`badge-new-${article.id}`}
                                      >
                                        <Flame className="h-3 w-3" />
                                        نیا
                                      </Badge>
                                    ) : article.category ? (
                                      <Badge 
                                        variant="outline" 
                                        className="text-xs h-5"
                                        data-testid={`badge-article-category-${article.id}`}
                                      >
                                        {article.category.icon} {article.category.name}
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
                                      <span className="flex items-center gap-1">
                                        <Eye className="h-3 w-3" />
                                        {(article.views || 0).toLocaleString()}
                                      </span>
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

              {/* Desktop View: Grid */}
              <div className="hidden lg:grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {regularArticles.map((article) => (
                  <Link key={article.id} href={`/ur/article/${article.englishSlug || article.slug}`}>
                    <Card className={`hover-elevate active-elevate-2 h-full cursor-pointer overflow-hidden group border-0 dark:border dark:border-card-border ${
                      article.newsType === "breaking" ? "bg-destructive/5" : ""
                    }`} data-testid={`card-article-${article.id}`}>
                      {article.imageUrl && (
                        <div className="relative h-48 overflow-hidden">
                          <img
                            src={article.imageUrl}
                            alt={article.title}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                          {article.newsType === "breaking" ? (
                            <Badge 
                              variant="destructive" 
                              className="absolute top-3 left-3 gap-1" 
                              data-testid={`badge-breaking-${article.id}`}
                            >
                              <Zap className="h-3 w-3" />
                              بریکنگ
                            </Badge>
                          ) : isNewArticle(article.publishedAt) ? (
                            <Badge 
                              className="absolute top-3 left-3 gap-1 bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600" 
                              data-testid={`badge-new-${article.id}`}
                            >
                              <Flame className="h-3 w-3" />
                              نیا
                            </Badge>
                          ) : article.category ? (
                            <Badge 
                              variant="default" 
                              className="absolute top-3 left-3" 
                              data-testid={`badge-category-${article.id}`}
                            >
                              {article.category.icon} {article.category.name}
                            </Badge>
                          ) : null}
                        </div>
                      )}
                      <CardContent className="p-5 space-y-3">
                        <h3 className={`text-lg font-bold line-clamp-2 transition-colors ${
                          article.newsType === "breaking"
                            ? "text-destructive"
                            : "group-hover:text-primary"
                        }`}>
                          {article.title}
                        </h3>
                        {article.excerpt && (
                          <p className="text-sm text-muted-foreground line-clamp-3">
                            {article.excerpt}
                          </p>
                        )}
                        <div className="flex flex-col gap-2 pt-2 border-t">
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            {article.publishedAt && (
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                <span>{formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true })}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              <span>{(article.views || 0).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Quad Categories Block - Full Width */}
        <div className="scroll-fade-in">
          <UrduQuadCategoriesBlock />
        </div>

        <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 py-8">
          {/* Smart Blocks: between_all_and_murqap */}
          {blocksBetweenAllAndMurqap && blocksBetweenAllAndMurqap.map((block) => (
            <UrduSmartNewsBlock key={block.id} config={block} />
          ))}

          {/* Empty State */}
          {articles.length === 0 && (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground mb-4">ابھی کوئی مضامین دستیاب نہیں ہیں</p>
              <Link href="/ur/dashboard">
                <Button data-testid="button-create-article">
                  پہلا مضمون بنائیں <ArrowRight className="w-4 h-4 mr-2" />
                </Button>
              </Link>
            </Card>
          )}

          {/* Smart Blocks: above_footer */}
          {blocksAboveFooter && blocksAboveFooter.map((block) => (
            <UrduSmartNewsBlock key={block.id} config={block} />
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-card mt-16">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center text-sm text-muted-foreground">
            <p>&copy; 2025 Sabq Smart. تمام حقوق محفوظ ہیں</p>
          </div>
        </div>
      </footer>
    </UrduLayout>
  );
}
