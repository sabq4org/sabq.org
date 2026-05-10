import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { UrduLayout } from "@/components/ur/UrduLayout";
import { UrduNewsAnalyticsHero } from "@/components/ur/UrduNewsAnalyticsHero";
import { UrduAIInsightsPanel } from "@/components/ur/UrduAIInsightsPanel";
import { UrduSmartFilterBar } from "@/components/ur/UrduSmartFilterBar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, ChevronLeft, Clock, Eye, Zap, Flame, Sparkles } from "lucide-react";
import { Link } from "wouter";
import type { EnArticle, EnCategory } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { arSA } from "date-fns/locale";
import { filterAICategories } from "@/utils/filterAICategories";

// Helper function to check if article is new (published within last 3 hours)
const isNewArticle = (publishedAt: Date | string | null | undefined) => {
  if (!publishedAt) return false;
  const published = typeof publishedAt === 'string' ? new Date(publishedAt) : publishedAt;
  const now = new Date();
  const diffInHours = (now.getTime() - published.getTime()) / (1000 * 60 * 60);
  return diffInHours <= 3;
};

const ARTICLES_PER_PAGE = 20;

type TimeRange = 'today' | 'week' | 'month' | 'all';
type Mood = 'all' | 'trending' | 'calm' | 'hot';

export default function UrduNewsPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [mood, setMood] = useState<Mood>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const { data: user } = useQuery<{ id: string; firstName?: string; email?: string; role?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  // Fetch analytics
  const { data: analytics, isLoading: analyticsLoading } = useQuery<any>({
    queryKey: ["/api/ur/news/analytics"],
  });

  // Fetch categories for filter (excluding AI categories)
  const { data: allCategoriesRaw } = useQuery<EnCategory[]>({
    queryKey: ["/api/ur/categories"],
  });
  const allCategories = Array.isArray(allCategoriesRaw) ? allCategoriesRaw : [];
  
  // Filter out AI categories from main site
  const categories = useMemo(() => filterAICategories(allCategories), [allCategories]);

  // Fetch articles
  const { data: articlesRaw, isLoading: articlesLoading } = useQuery<EnArticle[]>({
    queryKey: ["/api/ur/articles"],
  });
  const articles = Array.isArray(articlesRaw) ? articlesRaw : [];

  // Filter articles based on selected filters
  const filteredArticles = articles.filter((article) => {
    // Filter by time range
    if (timeRange !== 'all' && article.publishedAt) {
      const now = new Date();
      const publishedDate = new Date(article.publishedAt);
      const daysDiff = Math.floor((now.getTime() - publishedDate.getTime()) / (1000 * 60 * 60 * 24));

      switch (timeRange) {
        case 'today':
          if (daysDiff > 0) return false;
          break;
        case 'week':
          if (daysDiff > 7) return false;
          break;
        case 'month':
          if (daysDiff > 30) return false;
          break;
      }
    }

    // Filter by mood
    if (mood !== 'all') {
      switch (mood) {
        case 'trending':
          if ((article.views || 0) < 100) return false;
          break;
        case 'hot':
          if (!article.isFeatured) return false;
          break;
        case 'calm':
          if (article.isFeatured) return false;
          break;
      }
    }

    // Filter by category
    if (selectedCategory !== 'all' && article.categoryId !== selectedCategory) {
      return false;
    }

    return true;
  });

  // Calculate pagination
  const totalPages = Math.ceil(filteredArticles.length / ARTICLES_PER_PAGE);
  const startIndex = (currentPage - 1) * ARTICLES_PER_PAGE;
  const endIndex = startIndex + ARTICLES_PER_PAGE;
  const currentArticles = filteredArticles.slice(startIndex, endIndex);

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 7;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');

      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) pages.push(i);

      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }

    return pages;
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFilterChange = () => {
    setCurrentPage(1); // Reset to first page when filters change
  };

  return (
    <UrduLayout>
      <main className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8" dir="rtl">
          <h1 className="text-4xl md:text-5xl font-bold mb-3" data-testid="heading-news">
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              سمارٹ خبریں
            </span>
          </h1>
          <p className="text-lg text-muted-foreground">
            AI سے چلنے والی تجزیات اور بصیرت کے ساتھ تازہ ترین خبروں کو دریافت کریں
          </p>
        </div>

        {/* Analytics Hero Section */}
        {analyticsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-32 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : analytics ? (
          <UrduNewsAnalyticsHero analytics={analytics} />
        ) : null}

        {/* AI Insights Panel */}
        {analytics?.aiInsights && (
          <UrduAIInsightsPanel insights={analytics.aiInsights} />
        )}

        {/* Smart Filter Bar */}
        <UrduSmartFilterBar
          onTimeRangeChange={(range) => {
            setTimeRange(range);
            handleFilterChange();
          }}
          onMoodChange={(newMood) => {
            setMood(newMood);
            handleFilterChange();
          }}
          onCategoryChange={(categoryId) => {
            setSelectedCategory(categoryId);
            handleFilterChange();
          }}
          categories={categories.map(c => ({ id: c.id, name: c.name, icon: c.icon || undefined }))}
        />

        {/* Results Summary */}
        <div className="mb-6 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {currentArticles.length} میں سے {filteredArticles.length} مضامین دکھا رہے ہیں
          </p>
          {(timeRange !== 'all' || mood !== 'all' || selectedCategory !== 'all') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTimeRange('all');
                setMood('all');
                setSelectedCategory('all');
                handleFilterChange();
              }}
              data-testid="button-clear-filters"
            >
              فلٹرز صاف کریں
            </Button>
          )}
        </div>

        {/* Articles Grid - Unified Layout */}
        {articlesLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : currentArticles.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground text-lg mb-2">
              کوئی مضامین نہیں ملے
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setTimeRange('all');
                setMood('all');
                setSelectedCategory('all');
                handleFilterChange();
              }}
            >
              تمام مضامین دکھائیں
            </Button>
          </div>
        ) : (
          <>
            {/* Mobile View: Vertical List */}
            <Card className="overflow-hidden lg:hidden shadow-sm border border-border/40 dark:border-card-border">
              <CardContent className="p-0">
                <div className="divide-y divide-border/50 dark:divide-border">
                  {currentArticles.map((article) => {
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
                                      فوری خبر
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
                                        {article.views.toLocaleString('en-US')}
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
              {currentArticles.map((article) => (
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
                            className="absolute top-3 right-3 gap-1" 
                            data-testid={`badge-breaking-${article.id}`}
                          >
                            <Zap className="h-3 w-3" />
                            فوری خبر
                          </Badge>
                        ) : isNewArticle(article.publishedAt) ? (
                          <Badge 
                            className="absolute top-3 right-3 gap-1 bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600" 
                            data-testid={`badge-new-${article.id}`}
                          >
                            <Flame className="h-3 w-3" />
                            نیا
                          </Badge>
                        ) : null}
                        {article.aiSummary && (
                          <div className="absolute top-3 left-3">
                            <Badge variant="secondary" className="bg-primary/90 text-primary-foreground">
                              <Sparkles className="h-3 w-3 ml-1" />
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
                              {formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true, locale: arSA })}
                            </span>
                          </div>
                        )}
                        
                        {article.views !== undefined && (
                          <div className="flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            <span>{article.views.toLocaleString('en-US')}</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-12 flex justify-center items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    setCurrentPage(prev => Math.max(1, prev - 1));
                    scrollToTop();
                  }}
                  disabled={currentPage === 1}
                  data-testid="button-prev-page"
                  aria-label="صفحہ پچھلا"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>

                {getPageNumbers().map((page, index) => (
                  page === '...' ? (
                    <span key={`ellipsis-${index}`} className="px-2 text-muted-foreground">
                      ...
                    </span>
                  ) : (
                    <Button
                      key={page}
                      variant={currentPage === page ? "default" : "outline"}
                      size="icon"
                      onClick={() => {
                        setCurrentPage(page as number);
                        scrollToTop();
                      }}
                      data-testid={`button-page-${page}`}
                      className="min-w-9"
                    >
                      {page}
                    </Button>
                  )
                ))}

                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    setCurrentPage(prev => Math.min(totalPages, prev + 1));
                    scrollToTop();
                  }}
                  disabled={currentPage === totalPages}
                  data-testid="button-next-page"
                  aria-label="اگلا صفحہ"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </UrduLayout>
  );
}
