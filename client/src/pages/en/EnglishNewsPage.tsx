import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { EnglishLayout } from "@/components/en/EnglishLayout";
import { EnglishNewsAnalyticsHero } from "@/components/en/EnglishNewsAnalyticsHero";
import { EnglishAIInsightsPanel } from "@/components/en/EnglishAIInsightsPanel";
import { EnglishSmartFilterBar } from "@/components/en/EnglishSmartFilterBar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, ChevronLeft, Clock, Eye, Zap, Flame, MessageSquare, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { type EnArticle, EnCategory } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { filterAICategories } from "@/utils/filterAICategories";
import { NewsArticleCard } from "@/components/NewsArticleCard";
import type { ArticleWithDetails } from "@shared/schema";

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

export default function EnglishNewsPage() {
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
    queryKey: ["/api/en/news/analytics"],
  });

  // Fetch categories for filter (excluding AI categories)
  const { data: allCategoriesRaw } = useQuery<EnCategory[]>({
    queryKey: ["/api/en/categories"],
  });
  const allCategories = Array.isArray(allCategoriesRaw) ? allCategoriesRaw : [];
  
  // Filter out AI categories from main site
  const categories = useMemo(() => filterAICategories(allCategories), [allCategories]);

  // Fetch articles
  const { data: articlesRaw, isLoading: articlesLoading } = useQuery<EnArticle[]>({
    queryKey: ["/api/en/articles"],
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
    <EnglishLayout>

      <main className="public-page container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="public-page-header mb-8">
          <h1 className="public-page-title text-4xl md:text-5xl font-bold mb-3" data-testid="heading-news">
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Smart News
            </span>
          </h1>
          <p className="public-page-description text-lg text-muted-foreground">
            Discover the latest news with AI-powered analytics and insights
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
          <EnglishNewsAnalyticsHero analytics={analytics} />
        ) : null}

        {/* AI Insights Panel */}
        {analytics?.aiInsights && (
          <EnglishAIInsightsPanel insights={analytics.aiInsights} />
        )}

        {/* Smart Filter Bar */}
        <EnglishSmartFilterBar
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
            Showing {currentArticles.length} of {filteredArticles.length} articles
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
              Clear Filters
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
              No articles match the selected filters
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
              Show All Articles
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {currentArticles.map((article, index) => (
                <NewsArticleCard key={article.id} article={article as unknown as ArticleWithDetails} viewMode="grid" locale="en" priority={index < 4} metadata={{ views: true }} />
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
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
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
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </EnglishLayout>
  );
}
