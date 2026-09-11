import { useParams, useSearch } from "wouter";
import { CategoryArchivePage } from "@/components/CategoryArchivePage";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useCallback, useEffect, Fragment } from "react";
import { useCanonical } from "@/hooks/useCanonical";
import { signalContentPainted } from "@/lib/contentPaintedSignal";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Clock,
  Sparkles,
  Flame,
  Brain,
  Calendar,
  Zap,
  TrendingUp,
  Bot,
  MessageSquare,
  RefreshCw,
  SlidersHorizontal,
  FileText,
  FolderX,
  Loader2,
  ArrowRight,
  Home,
  FolderOpen,
} from "lucide-react";
import { Link } from "wouter";
import { NewsArticleCard } from "@/components/NewsArticleCard";
import { DmsLeaderboardAd, DmsMpuAd, useAdTracking } from "@/components/DmsAdSlot";
import type { Category, ArticleWithDetails } from "@shared/schema";
import { motion } from "framer-motion";

// Helper function to check if article is new (published within last 3 hours)
const isNewArticle = (publishedAt: Date | string | null | undefined) => {
  if (!publishedAt) return false;
  const published = typeof publishedAt === 'string' ? new Date(publishedAt) : publishedAt;
  const now = new Date();
  const diffInHours = (now.getTime() - published.getTime()) / (1000 * 60 * 60);
  return diffInHours <= 3;
};

// Helper function to get category type badge
function getCategoryTypeBadge(type?: string) {
  switch (type) {
    case "dynamic":
      return { label: "ديناميكي", icon: <Zap className="h-3 w-3" />, variant: "default" as const };
    case "smart":
      return { label: "ذكي", icon: <Brain className="h-3 w-3" />, variant: "default" as const };
    case "seasonal":
      return { label: "موسمي", icon: <Calendar className="h-3 w-3" />, variant: "secondary" as const };
    default:
      return null;
  }
}

// Helper function to format update interval
function formatUpdateInterval(seconds?: number) {
  if (!seconds) return null;
  if (seconds < 60) return `${seconds} ثانية`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} دقيقة`;
}

// Helper function to estimate reading time
function estimateReadingTime(content?: string): number {
  if (!content) return 1;
  const wordsPerMinute = 200;
  const words = content.split(/\s+/).length;
  const minutes = Math.ceil(words / wordsPerMinute);
  return minutes || 1;
}

type SortMode = "newest" | "views" | "engagement";
type TimeRange = "today" | "3days" | "7days" | "30days" | "all";
type ArticleTypeFilter = "all" | "breaking" | "new" | "opinion" | "analysis";

export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const search = useSearch();
  const value = new URLSearchParams(search).get("page");
  if (value !== null) {
    const page = /^[1-9]\d*$/.test(value) && Number(value) <= 10_000 ? Number(value) : null;
    return <CategoryArchivePage slug={slug} page={page} />;
  }
  return <CategoryLandingPage />;
}

function CategoryLandingPage() {
  const { slug } = useParams<{ slug: string }>();

  // Filter states
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [timeRange, setTimeRange] = useState<TimeRange>("30days");
  const [articleType, setArticleType] = useState<ArticleTypeFilter>("all");
  const [displayCount, setDisplayCount] = useState(12);

  const { data: user } = useQuery<{ id: string; name?: string; email?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const { data: category, isLoading: categoryLoading } = useQuery<Category>({
    queryKey: ["/api/categories/slug", slug],
  });

  // DMS Ad tracking for category page
  useAdTracking(category?.nameAr || '');

  // يعمل بالتوازي مع استعلام القسم — المسار يعتمد على الـ slug وحده،
  // وانتظار القسم كان يضيف ~ثانية كاملة على LCP الجوال (GSC: 29 ألف صفحة)
  const { data: allArticlesRaw, isLoading: articlesLoading } = useQuery<ArticleWithDetails[]>({
    queryKey: ["/api/categories", slug, "articles"],
    enabled: !!slug,
  });
  const allArticles = Array.isArray(allArticlesRaw) ? allArticlesRaw : [];

  // المحتوى الرئيسي جاهز → حرّر طبقة الإعلانات المؤجلة (انظر index.html)
  useEffect(() => {
    if (!articlesLoading && allArticlesRaw !== undefined) signalContentPainted();
  }, [articlesLoading, allArticlesRaw]);

  // Reset displayCount when filters change
  useEffect(() => {
    setDisplayCount(12);
  }, [sortMode, timeRange, articleType]);

  // Update document.title for SEO (GA4 auto-tracks page views)
  useEffect(() => {
    if (category?.nameAr) {
      document.title = `${category.nameAr} | سبق`;
    }
    return () => {
      document.title = 'سبق - صحيفة إلكترونية سعودية';
    };
  }, [category?.nameAr]);

  useCanonical(category ? `https://sabq.org/category/${category.englishSlug || slug}` : null);

  // Filter and sort articles
  const filteredArticles = useMemo(() => {
    let filtered = [...allArticles];

    // Time range filter
    if (timeRange !== "all") {
      const now = new Date();
      let cutoffDate: Date;

      switch (timeRange) {
        case "today":
          cutoffDate = new Date(now.setHours(0, 0, 0, 0));
          break;
        case "3days":
          cutoffDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
          break;
        case "7days":
          cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "30days":
          cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          cutoffDate = new Date(0);
      }

      filtered = filtered.filter(
        (a) => a.publishedAt && new Date(a.publishedAt) >= cutoffDate
      );
    }

    // Article type filter
    if (articleType !== "all") {
      filtered = filtered.filter((a) => {
        switch (articleType) {
          case "breaking":
            return a.newsType === "breaking";
          case "new":
            return isNewArticle(a.publishedAt);
          case "opinion":
            return a.newsType === "opinion";
          case "analysis":
            return a.newsType === "analysis";
          default:
            return true;
        }
      });
    }

    // Sort
    switch (sortMode) {
      case "views":
        filtered.sort((a, b) => (b.views || 0) - (a.views || 0));
        break;
      case "engagement":
        filtered.sort(
          (a, b) =>
            (b.reactionsCount || 0) + (b.commentsCount || 0) -
            ((a.reactionsCount || 0) + (a.commentsCount || 0))
        );
        break;
      case "newest":
      default:
        filtered.sort(
          (a, b) =>
            new Date(b.publishedAt || 0).getTime() -
            new Date(a.publishedAt || 0).getTime()
        );
        break;
    }

    return filtered;
  }, [allArticles, sortMode, timeRange, articleType]);

  // Displayed articles (with pagination)
  const displayedArticles = useMemo(() => {
    return filteredArticles.slice(0, displayCount);
  }, [filteredArticles, displayCount]);

  // Reset filters
  const handleResetFilters = useCallback(() => {
    setSortMode("newest");
    setTimeRange("30days");
    setArticleType("all");
    setDisplayCount(12);
  }, []);

  // Load more
  const handleLoadMore = useCallback(() => {
    setDisplayCount((prev) => prev + 12);
  }, []);

  const isSmartCategory = category?.type === "smart" || category?.type === "dynamic" || category?.type === "seasonal";

  if (categoryLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header user={user} />
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Skeleton className="h-72 w-full mb-8 rounded-xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-80 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!category) {
    return (
      <div className="min-h-screen bg-background">
        <Header user={user} />
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <h1 className="text-3xl font-bold mb-4">التصنيف غير موجود</h1>
          <p className="text-muted-foreground">لم نتمكن من العثور على هذا التصنيف</p>
        </div>
      </div>
    );
  }

  return (
    <div className="public-page min-h-screen bg-background" dir="rtl">
      <Header user={user} />

      {/* Keep the category heading text-only for a fast LCP, with the same
          solid surface as the categories directory and live feed. */}
      <div className="public-page-header border-b border-[#e3ebf2] bg-[#f4f8fb] text-[#10202e] dark:border-border dark:bg-[#171e29] dark:text-foreground" data-testid="category-header">
        <div className="public-container container mx-auto px-3 sm:px-6 lg:px-8 py-8 lg:py-10">
          {/* Breadcrumb Navigation */}
          <nav className="flex items-center gap-2 text-sm text-[#6b7c8a] dark:text-muted-foreground" data-testid="breadcrumb-navigation">
            <Link href="/">
              <span className="flex items-center gap-1 hover-elevate px-2 py-1 rounded transition-colors cursor-pointer">
                <Home className="h-3.5 w-3.5" />
                الرئيسية
              </span>
            </Link>
            <ArrowRight className="h-3.5 w-3.5" />
            <Link href="/categories">
              <span className="hover-elevate px-2 py-1 rounded transition-colors cursor-pointer">
                التصنيفات
              </span>
            </Link>
            <ArrowRight className="h-3.5 w-3.5" />
            <span className="font-semibold text-foreground">{category.nameAr}</span>
          </nav>

          {/* Category Header (title + description) */}
          {(
            <div className="mt-4">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                {isSmartCategory && (
                  <motion.div
                    animate={{
                      scale: [1, 1.1, 1],
                      rotate: [0, 5, -5, 0],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      repeatDelay: 3,
                    }}
                  >
                    <Sparkles className="h-8 w-8 sm:h-10 sm:w-10 text-primary" />
                  </motion.div>
                )}
                {category.icon && (
                  <span className="text-3xl sm:text-4xl">{category.icon}</span>
                )}
                <h1 className="public-page-title text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold">
                  {category.nameAr}
                </h1>
                {isSmartCategory ? (
                  <motion.div
                    animate={{ opacity: [1, 0.7, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Badge
                      className="flex items-center gap-1.5 min-h-8 px-3 py-1.5 text-sm bg-primary text-primary-foreground border-0 shadow-lg"
                      data-testid="badge-category-type"
                    >
                      <Brain className="h-3.5 w-3.5" />
                      اختيار ذكي
                    </Badge>
                  </motion.div>
                ) : (
                  getCategoryTypeBadge(category.type) && (
                    <Badge
                      variant={getCategoryTypeBadge(category.type)!.variant}
                      className="flex items-center gap-1 min-h-8 px-3 py-1.5 text-sm"
                      data-testid="badge-category-type"
                    >
                      {getCategoryTypeBadge(category.type)!.icon}
                      {getCategoryTypeBadge(category.type)!.label}
                    </Badge>
                  )
                )}
              </div>
              {category.description && (
                <p className="public-page-description text-sm sm:text-base md:text-lg text-[#6b7c8a] dark:text-muted-foreground max-w-3xl mb-2 sm:mb-3 leading-relaxed">
                  {category.description}
                </p>
              )}
            </div>
          )}
          {/* Smart Category Features */}
          {isSmartCategory && (
            <div className="flex flex-wrap gap-2">
              {category.features?.realtime && (
                <Badge
                  variant="secondary"
                  className="min-h-8 px-3 py-1.5"
                  data-testid="badge-feature-realtime"
                >
                  <Flame className="h-3.5 w-3.5 sm:h-3 sm:w-3 mr-1" />
                  <span className="text-sm">مباشر</span>
                </Badge>
              )}
              {category.features?.trending && (
                <Badge
                  variant="secondary"
                  className="min-h-8 px-3 py-1.5"
                  data-testid="badge-feature-trending"
                >
                  <TrendingUp className="h-3.5 w-3.5 sm:h-3 sm:w-3 mr-1" />
                  <span className="text-sm">رائج</span>
                </Badge>
              )}
              {category.features?.ai_powered && (
                <Badge
                  variant="secondary"
                  className="min-h-8 px-3 py-1.5"
                  data-testid="badge-feature-ai"
                >
                  <Bot className="h-3.5 w-3.5 sm:h-3 sm:w-3 mr-1" />
                  <span className="text-sm">ذكاء اصطناعي</span>
                </Badge>
              )}
              {category.features?.breaking_news && (
                <Badge
                  variant="default"
                  className="bg-red-600 dark:bg-red-500 text-white min-h-8 px-3 py-1.5"
                  data-testid="badge-feature-breaking"
                >
                  <Zap className="h-3.5 w-3.5 sm:h-3 sm:w-3 mr-1" />
                  <span className="text-sm">عاجل</span>
                </Badge>
              )}
              {category.type === "dynamic" && category.updateInterval && (
                <Badge
                  variant="secondary"
                  className="min-h-8 px-3 py-1.5"
                  data-testid="badge-update-interval"
                >
                  <Clock className="h-3.5 w-3.5 sm:h-3 sm:w-3 mr-1" />
                  <span className="text-sm">يتحدث كل {formatUpdateInterval(category.updateInterval)}</span>
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>

      {/* DMS Leaderboard Ad - Desktop only */}
      <div className="container mx-auto px-3 sm:px-6 lg:px-8 pt-4">
        <DmsLeaderboardAd />
      </div>

      {/* Advanced Filters Bar */}
      <div className="container mx-auto px-3 sm:px-6 lg:px-8 pb-6">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          {/* Left Side (RTL): Sort */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
            <Select value={sortMode} onValueChange={(value: SortMode) => setSortMode(value)}>
              <SelectTrigger className="w-full sm:w-48" data-testid="select-sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest" data-testid="option-sort-newest">
                  الأحدث
                </SelectItem>
                <SelectItem value="views" data-testid="option-sort-views">
                  الأكثر مشاهدة
                </SelectItem>
                <SelectItem value="engagement" data-testid="option-sort-engagement">
                  الأكثر تفاعلاً
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Right Side: Time and Type Filters */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* Time Range Filter */}
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Select value={timeRange} onValueChange={(value: TimeRange) => setTimeRange(value)}>
                <SelectTrigger className="w-full sm:w-40" data-testid="select-time-range">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today" data-testid="option-time-today">
                    اليوم
                  </SelectItem>
                  <SelectItem value="3days" data-testid="option-time-3days">
                    آخر 3 أيام
                  </SelectItem>
                  <SelectItem value="7days" data-testid="option-time-7days">
                    آخر 7 أيام
                  </SelectItem>
                  <SelectItem value="30days" data-testid="option-time-30days">
                    آخر 30 يوم
                  </SelectItem>
                  <SelectItem value="all" data-testid="option-time-all">
                    الكل
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Article Type Filter */}
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <Select value={articleType} onValueChange={(value: ArticleTypeFilter) => setArticleType(value)}>
                <SelectTrigger className="w-full sm:w-40" data-testid="select-article-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" data-testid="option-type-all">
                    الكل
                  </SelectItem>
                  <SelectItem value="breaking" data-testid="option-type-breaking">
                    عاجل
                  </SelectItem>
                  <SelectItem value="new" data-testid="option-type-new">
                    جديد
                  </SelectItem>
                  <SelectItem value="opinion" data-testid="option-type-opinion">
                    رأي
                  </SelectItem>
                  <SelectItem value="analysis" data-testid="option-type-analysis">
                    تحليل
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Active Filters Indicator */}
        {(sortMode !== "newest" || timeRange !== "30days" || articleType !== "all") && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-sm text-muted-foreground">الفلاتر النشطة:</span>
            <div className="flex flex-wrap gap-2">
              {sortMode !== "newest" && (
                <Badge variant="secondary" className="text-xs">
                  {sortMode === "views" ? "الأكثر مشاهدة" : "الأكثر تفاعلاً"}
                </Badge>
              )}
              {timeRange !== "30days" && (
                <Badge variant="secondary" className="text-xs">
                  {
                    {
                      today: "اليوم",
                      "3days": "آخر 3 أيام",
                      "7days": "آخر 7 أيام",
                      all: "الكل",
                    }[timeRange]
                  }
                </Badge>
              )}
              {articleType !== "all" && (
                <Badge variant="secondary" className="text-xs">
                  {
                    {
                      breaking: "عاجل",
                      new: "جديد",
                      opinion: "رأي",
                      analysis: "تحليل",
                    }[articleType]
                  }
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetFilters}
              className="text-xs"
              data-testid="button-reset-filters"
            >
              إعادة تعيين
            </Button>
          </div>
        )}
      </div>

      {/* Articles Grid/List */}
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <h2 className="text-xl sm:text-2xl font-bold">
            آخر الأخبار
            {filteredArticles.length > 0 && (
              <Badge variant="secondary" className="mr-2 min-h-7 px-2.5">
                {filteredArticles.length.toLocaleString("en-US")}
              </Badge>
            )}
          </h2>
        </div>

        {articlesLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : displayedArticles.length === 0 ? (
          // Enhanced Empty State
          <div className="text-center py-16 sm:py-20" data-testid="empty-state">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-muted mb-6">
              <FolderX className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">لم نجد مقالات تطابق الفلاتر المحددة</h3>
            <p className="text-muted-foreground mb-6">جرب تغيير الفلاتر أو إعادة تعيينها</p>
            <Button onClick={handleResetFilters} data-testid="button-reset-empty">
              إعادة تعيين الفلاتر
            </Button>
          </div>
        ) : (
          <>
            {/* Articles Grid - Using NewsArticleCard like NewsPage */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {displayedArticles.map((article, index) => (
                <Fragment key={article.id}>
                  <div>
                    <NewsArticleCard
                      article={article}
                      viewMode="grid"
                      hideCategory={true}
                      priority={index === 0}
                    />
                  </div>
                  {/* MPU Ad after 2nd article on mobile - separate grid item */}
                  {index === 1 && (
                    <div className="md:hidden col-span-1">
                      <DmsMpuAd />
                    </div>
                  )}
                </Fragment>
              ))}
            </div>

            {/* Load More Button */}
            {displayedArticles.length < filteredArticles.length && (
              <div className="mt-8 text-center" data-testid="load-more-section">
                <p className="text-sm text-muted-foreground mb-4">
                  عرض {displayedArticles.length} من {filteredArticles.length} مقالة
                  {filteredArticles.length - displayedArticles.length > 0 && (
                    <span className="font-semibold">
                      {" "}• متبقي {filteredArticles.length - displayedArticles.length} مقالة
                    </span>
                  )}
                </p>
                <Button
                  onClick={handleLoadMore}
                  size="lg"
                  className="gap-2"
                  data-testid="button-load-more"
                  disabled={articlesLoading}
                >
                  {articlesLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      جاري التحميل...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      تحميل المزيد ({Math.min(12, filteredArticles.length - displayedArticles.length)})
                    </>
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <nav aria-label="أرشيف القسم" className="container mx-auto px-4 py-8 text-center">
        <a href={`/category/${encodeURIComponent(category?.englishSlug || slug)}?page=1`} className="text-primary">تصفح أرشيف القسم</a>
      </nav>
      {/* Footer */}
      <Footer />
    </div>
  );
}
