import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SabqPulseSection } from "@/components/SabqPulseSection";
import { NewsEnhancedFilterBar } from "@/components/NewsEnhancedFilterBar";
import { NewsArticleCard } from "@/components/NewsArticleCard";
import { ScrollToTopButton } from "@/components/ScrollToTopButton";
import { PersonalizedFeed } from "@/components/PersonalizedFeed";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronRight, ChevronLeft } from "lucide-react";
import type { ArticleWithDetails, Category } from "@shared/schema";
import { filterAICategories } from "@/utils/filterAICategories";
import { DmsLeaderboardAd, DmsMpuAd, useAdTracking } from "@/components/DmsAdSlot";

type TimeRange = 'today' | 'week' | 'month' | 'all';
type Mood = 'all' | 'trending' | 'calm' | 'hot';

export default function NewsPage() {
  // DMS Ad tracking for News section
  useAdTracking('News');
  
  const [currentPage, setCurrentPage] = useState(1);
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [mood, setMood] = useState<Mood>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<'default' | 'newest' | 'oldest' | 'most-viewed' | 'most-commented'>('newest');
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'compact'>('grid');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [infiniteScrollEnabled, setInfiniteScrollEnabled] = useState(false);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [displayedCount, setDisplayedCount] = useState(20);

  const { data: user } = useQuery<{ id: string; name?: string; email?: string; role?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  // Fetch categories for filter (excluding AI categories)
  const { data: allCategoriesRaw } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });
  const allCategories = Array.isArray(allCategoriesRaw) ? allCategoriesRaw : [];
  
  // Filter out AI categories from main site
  const categories = useMemo(() => filterAICategories(allCategories), [allCategories]);

  // Fetch articles with server-side search
  const { data: articlesRaw, isLoading: articlesLoading } = useQuery<ArticleWithDetails[]>({
    queryKey: ["/api/articles", { 
      search: debouncedSearch || undefined,
      category: selectedCategory !== 'all' ? selectedCategory : undefined,
    }],
  });
  const articles = Array.isArray(articlesRaw) ? articlesRaw : [];

  // Fetch personalized feed (forYou) from homepage data
  const { data: homepageData } = useQuery<{ forYou: ArticleWithDetails[] }>({
    queryKey: ["/api/homepage-lite"],
    enabled: !!user,
  });

  const forYouArticles = homepageData?.forYou || [];

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset pagination when filters or items per page change
  useEffect(() => {
    setCurrentPage(1);
    if (infiniteScrollEnabled) {
      setDisplayedCount(20);
    }
  }, [debouncedSearch, sortOption, timeRange, selectedCategory, mood, infiniteScrollEnabled, itemsPerPage]);

  // Filter articles based on selected filters (search and category handled server-side)
  const filteredArticles = useMemo(() => {
    return articles.filter((article) => {
      // Exclude opinion articles
      if (article.articleType === 'opinion') return false;

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

      // Filter by mood (simplified - can be enhanced with AI)
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

      // Category filter handled server-side

      return true;
    });
  }, [articles, timeRange, mood]);

  // Sort articles
  const sortedArticles = useMemo(() => {
    const sorted = [...filteredArticles];
    
    switch (sortOption) {
      case 'default':
        // Keep server order (displayOrder first, then publishedAt)
        return sorted;
      case 'newest':
        return sorted.sort((a, b) => {
          const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
          const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
          return dateB - dateA;
        });
      case 'oldest':
        return sorted.sort((a, b) => {
          const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
          const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
          return dateA - dateB;
        });
      case 'most-viewed':
        return sorted.sort((a, b) => (b.views || 0) - (a.views || 0));
      case 'most-commented':
        return sorted.sort((a, b) => (b.commentsCount || 0) - (a.commentsCount || 0));
      default:
        return sorted;
    }
  }, [filteredArticles, sortOption]);

  // Calculate pagination
  const totalPages = Math.ceil(sortedArticles.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentArticles = infiniteScrollEnabled
    ? sortedArticles.slice(0, displayedCount)
    : sortedArticles.slice(startIndex, endIndex);

  // Clamp currentPage to valid range when totalPages changes
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  // Infinite Scroll Hook (after sortedArticles is defined)
  useEffect(() => {
    if (!infiniteScrollEnabled) return;

    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const windowHeight = window.innerHeight;
      const docHeight = document.documentElement.scrollHeight;

      if (scrollTop + windowHeight >= docHeight - 300) {
        setDisplayedCount(prev => Math.min(prev + 20, sortedArticles.length));
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [infiniteScrollEnabled, sortedArticles.length]);

  // Generate page numbers to display
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

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    scrollToTop();
  };

  const handleFilterChange = () => {
    setCurrentPage(1); // Reset to first page when filters change
  };

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Header user={user} />

      <main className="flex-1 container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-3" data-testid="heading-news">
            الأخبار الذكية
          </h1>
          <p className="text-lg text-muted-foreground">
            اكتشف آخر الأخبار مع تحليلات وإحصائيات ذكية مدعومة بالذكاء الاصطناعي
          </p>
        </div>

        {/* DMS Ads - Leaderboard for desktop, MPU for mobile */}
        <DmsLeaderboardAd />
        <DmsMpuAd topSlot />

        <SabqPulseSection />

        {/* Enhanced Filter Bar */}
        <NewsEnhancedFilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          sortOption={sortOption}
          onSortChange={setSortOption}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          timeRange={timeRange}
          onTimeRangeChange={(range) => {
            setTimeRange(range);
            handleFilterChange();
          }}
          selectedCategory={selectedCategory}
          onCategoryChange={(categoryId) => {
            setSelectedCategory(categoryId);
            handleFilterChange();
          }}
          categories={categories}
        />

        {/* Results Summary */}
        <div className="mb-6 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            عرض {currentArticles.length} من {sortedArticles.length} خبر
          </p>
          {(searchQuery || timeRange !== 'all' || mood !== 'all' || selectedCategory !== 'all') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setTimeRange('all');
                setMood('all');
                setSelectedCategory('all');
                setSortOption('default');
                handleFilterChange();
              }}
              data-testid="button-clear-filters"
            >
              مسح الفلاتر
            </Button>
          )}
        </div>

        {/* Advanced Pagination Controls */}
        <div className="mt-8 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-muted/30 rounded-lg">
          {/* Items per page selector */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">عرض:</span>
            <Select
              value={itemsPerPage.toString()}
              onValueChange={(value) => {
                setItemsPerPage(Number(value));
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-[100px]" data-testid="select-items-per-page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">خبر</span>
          </div>

          {/* Infinite Scroll Toggle */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">التمرير التلقائي:</span>
            <Button
              variant={infiniteScrollEnabled ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setInfiniteScrollEnabled(!infiniteScrollEnabled);
                if (!infiniteScrollEnabled) {
                  setDisplayedCount(20);
                } else {
                  setCurrentPage(1);
                }
              }}
              data-testid="button-toggle-infinite-scroll"
            >
              {infiniteScrollEnabled ? "مفعّل" : "معطّل"}
            </Button>
          </div>

          {/* Total count */}
          <div className="text-sm text-muted-foreground">
            {infiniteScrollEnabled
              ? `عرض ${currentArticles.length} من ${sortedArticles.length} خبر`
              : `الصفحة ${currentPage} من ${totalPages}`}
          </div>
        </div>

        {/* Articles - Matching PersonalizedFeed Design */}
        {articlesLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : currentArticles.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground text-lg mb-2">
              لا توجد أخبار تطابق الفلاتر المحددة
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
              عرض جميع الأخبار
            </Button>
          </div>
        ) : (
          <>
            {/* Articles Display - Using NewsArticleCard */}
            {viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {currentArticles.map((article) => (
                  <NewsArticleCard
                    key={article.id}
                    article={article}
                    viewMode="grid"
                  />
                ))}
              </div>
            ) : viewMode === 'list' ? (
              <div className="space-y-4">
                {currentArticles.map((article) => (
                  <NewsArticleCard
                    key={article.id}
                    article={article}
                    viewMode="list"
                  />
                ))}
              </div>
            ) : (
              <Card className="overflow-hidden">
                <CardContent className="p-0 divide-y">
                  {currentArticles.map((article) => (
                    <NewsArticleCard
                      key={article.id}
                      article={article}
                      viewMode="compact"
                    />
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Loading indicator for infinite scroll */}
            {infiniteScrollEnabled && displayedCount < sortedArticles.length && (
              <div className="mt-8 flex justify-center">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <span>جاري التحميل...</span>
                </div>
              </div>
            )}

            {/* End of results message */}
            {infiniteScrollEnabled && displayedCount >= sortedArticles.length && sortedArticles.length > 20 && (
              <div className="mt-8 text-center text-sm text-muted-foreground">
                تم عرض جميع الأخبار ({sortedArticles.length} خبر)
              </div>
            )}

            {/* Pagination - Only show when infinite scroll is disabled */}
            {!infiniteScrollEnabled && totalPages > 1 && (
              <div className="mt-12 flex justify-center items-center gap-2" dir="ltr">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  data-testid="button-prev-page"
                  aria-label="الصفحة السابقة"
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
                      onClick={() => handlePageChange(page as number)}
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
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  data-testid="button-next-page"
                  aria-label="الصفحة التالية"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}

        {/* Scroll to Top Button */}
        <ScrollToTopButton />
      </main>

      <Footer />
    </div>
  );
}
