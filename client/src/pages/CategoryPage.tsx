import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useCallback, useEffect, Fragment } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
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
  Eye,
  Heart,
  Newspaper,
  RefreshCw,
  SlidersHorizontal,
  FileText,
  FolderX,
  Loader2,
  ArrowRight,
  Home,
  FolderOpen,
  UserCircle2,
  CheckCircle,
  ArrowLeft,
} from "lucide-react";
import { Link } from "wouter";
import { NewsArticleCard } from "@/components/NewsArticleCard";
import { DmsLeaderboardAd, DmsMpuAd, useAdTracking } from "@/components/DmsAdSlot";
import { useHeroPreload } from "@/hooks/useHeroPreload";
import {
  buildCloudflareUrl,
  generateResponsiveSrcSet,
  HERO_SIZES_ATTR,
} from "@/lib/cdnImage";
import type { Category, ArticleWithDetails, User } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { arSA } from "date-fns/locale";
import { motion } from "framer-motion";
import { MobileOptimizedKpiCard } from "@/components/MobileOptimizedKpiCard";

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

  // LCP optimization: preload the hero image as soon as the category data is
  // known so the browser starts fetching it before React paints the <img>.
  useHeroPreload(category?.heroImageUrl);
  const heroSrc = useMemo(
    () =>
      category?.heroImageUrl
        ? buildCloudflareUrl(category.heroImageUrl, { width: 1280, quality: 80 })
        : "",
    [category?.heroImageUrl],
  );
  const heroSrcSet = useMemo(
    () => (category?.heroImageUrl ? generateResponsiveSrcSet(category.heroImageUrl, 80) : ""),
    [category?.heroImageUrl],
  );

  const { data: allArticlesRaw, isLoading: articlesLoading } = useQuery<ArticleWithDetails[]>({
    queryKey: ["/api/categories", slug, "articles"],
    enabled: !!category,
  });
  const allArticles = Array.isArray(allArticlesRaw) ? allArticlesRaw : [];

  // Calculate statistics from articles data
  const statistics = useMemo(() => {
    if (allArticles.length === 0) {
      return {
        totalArticles: 0,
        recentArticles: 0,
        totalViews: 0,
        avgEngagement: 0,
        mostViewed: null,
        latestArticle: null,
      };
    }

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const recentArticles = allArticles.filter((a) =>
      a.publishedAt && new Date(a.publishedAt) >= oneDayAgo
    );

    const totalViews = allArticles.reduce((sum, a) => sum + (a.views || 0), 0);
    const totalEngagement = allArticles.reduce(
      (sum, a) => sum + (a.reactionsCount || 0) + (a.commentsCount || 0),
      0
    );
    const avgEngagement = allArticles.length > 0
      ? Math.round(totalEngagement / allArticles.length)
      : 0;

    const mostViewed = allArticles.reduce(
      (max, a) => ((a.views || 0) > (max?.views || 0) ? a : max),
      allArticles[0]
    );

    const sortedByDate = [...allArticles].sort(
      (a, b) =>
        new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime()
    );
    const latestArticle = sortedByDate[0];

    return {
      totalArticles: allArticles.length,
      recentArticles: recentArticles.length,
      totalViews,
      avgEngagement,
      mostViewed,
      latestArticle,
    };
  }, [allArticles]);

  // Calculate most active reporter
  const mostActiveReporter = useMemo((): { author: User, count: number } | null => {
    if (allArticles.length === 0) return null;
    
    // Count articles per author
    const authorCounts = new Map<string, { author: User, count: number }>();
    
    allArticles.forEach(article => {
      const author = article.author;
      if (!author) return;
      
      const current = authorCounts.get(author.id);
      if (current) {
        current.count++;
      } else {
        authorCounts.set(author.id, { author, count: 1 });
      }
    });
    
    // Find author with most articles using Array.from and reduce
    const authorsArray = Array.from(authorCounts.values());
    if (authorsArray.length === 0) return null;
    
    return authorsArray.reduce((max, current) => 
      current.count > max.count ? current : max
    , authorsArray[0]);
  }, [allArticles]);

  // Calculate reporter total views in this category
  const calculateReporterViews = useCallback((authorId: string) => {
    return allArticles
      .filter(a => a.author?.id === authorId)
      .reduce((sum, a) => sum + (a.views || 0), 0);
  }, [allArticles]);

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
    <div className="min-h-screen bg-background" dir="rtl">
      <Header user={user} />

      {/* Hero Section with Text Overlay */}
      {category.heroImageUrl ? (
        <div className="relative h-96 overflow-hidden">
          <img
            src={heroSrc || category.heroImageUrl}
            srcSet={heroSrcSet || undefined}
            sizes={HERO_SIZES_ATTR}
            alt={category.nameAr}
            className="w-full h-full object-cover"
            width={1280}
            height={384}
            loading="eager"
            decoding="async"
            {...{ fetchpriority: "high" }}
          />
          {/* Dark gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-black/30" />
          
          {/* Text Overlay Content - Right aligned to match logo */}
          <div className="absolute inset-0 flex items-end pb-12">
            <div className="container mx-auto px-3 sm:px-6 lg:px-8">
              {/* Icon */}
              {category.icon && (
                <span className="text-5xl sm:text-6xl mb-4 block">{category.icon}</span>
              )}
              
              {/* Title */}
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 drop-shadow-lg">
                {category.nameAr}
              </h1>
              
              {/* Description */}
              {category.description && (
                <p className="text-base sm:text-lg md:text-xl text-white/90 max-w-3xl leading-relaxed drop-shadow-md">
                  {category.description}
                </p>
              )}
              
              {/* Smart Category Badge */}
              {isSmartCategory && (
                <motion.div
                  animate={{ opacity: [1, 0.7, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="mt-4"
                >
                  <Badge
                    className="flex items-center gap-1.5 min-h-8 px-4 py-2 text-sm bg-gradient-to-r from-primary to-accent text-primary-foreground border-0 shadow-lg w-fit"
                    data-testid="badge-category-type"
                  >
                    <Brain className="h-4 w-4" />
                    اختيار ذكي
                  </Badge>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Breadcrumb Navigation Section - Below Hero */}
      <div className={`${
        !category.heroImageUrl 
          ? isSmartCategory
            ? "bg-gradient-to-br from-primary/15 via-accent/10 to-primary/5 dark:from-primary/8 dark:via-accent/5 dark:to-primary/3 border-b"
            : "bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 dark:from-primary/10 dark:to-primary/5 border-b"
          : "border-b bg-background/95 backdrop-blur-sm"
      } relative overflow-hidden`}>
        {/* Animated AI Grid Pattern for Smart Categories (no hero image) */}
        {!category.heroImageUrl && isSmartCategory && (
          <div className="absolute inset-0 opacity-20 dark:opacity-10">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
          </div>
        )}
        
        <div className="container mx-auto px-3 sm:px-6 lg:px-8 py-4 relative z-10">
          {/* Breadcrumb Navigation */}
          <nav className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="breadcrumb-navigation">
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

          {/* Category Header for NO HERO IMAGE cases */}
          {!category.heroImageUrl && (
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
                <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-foreground">
                  {category.nameAr}
                </h1>
                {isSmartCategory ? (
                  <motion.div
                    animate={{ opacity: [1, 0.7, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Badge
                      className="flex items-center gap-1.5 min-h-8 px-3 py-1.5 text-sm bg-gradient-to-r from-primary to-accent text-primary-foreground border-0 shadow-lg"
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
                <p className="text-sm sm:text-base md:text-lg text-muted-foreground max-w-3xl mb-2 sm:mb-3 leading-relaxed">
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

      {/* Most Active Reporter Section - AFTER Category Header, BEFORE Statistics */}
      {mostActiveReporter && (
        <div className="container mx-auto px-3 sm:px-6 lg:px-8 py-6">
          <Card 
            className="overflow-hidden border-r-4 hover-elevate transition-all"
            style={{ borderRightColor: category?.color || 'var(--primary)' }}
            data-testid="card-most-active-reporter"
          >
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <UserCircle2 className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-bold">المراسل الأكثر نشاطاً في التصنيف</h3>
              </div>
              
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                {/* Profile Image */}
                <Avatar className="w-16 h-16">
                  <AvatarImage src={mostActiveReporter.author.profileImageUrl || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-xl">
                    {mostActiveReporter.author.firstName?.[0] || 'م'}
                  </AvatarFallback>
                </Avatar>
                
                {/* Reporter Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-xl font-bold">
                      {mostActiveReporter.author.firstName} {mostActiveReporter.author.lastName}
                    </h4>
                    {mostActiveReporter.author.verificationBadge !== 'none' && (
                      <CheckCircle className="h-5 w-5 text-primary" />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    {mostActiveReporter.author.role === 'reporter' ? 'مراسل' : 
                     mostActiveReporter.author.role === 'editor' ? 'محرر' : 
                     mostActiveReporter.author.role === 'chief_editor' ? 'رئيس تحرير' : 'كاتب'}
                  </p>
                  
                  {/* Statistics */}
                  <div className="flex flex-wrap items-center gap-4 text-sm mb-4">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Newspaper className="h-4 w-4" />
                      <span className="font-semibold text-foreground">{mostActiveReporter.count}</span>
                      مقالة في هذا التصنيف
                    </span>
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Eye className="h-4 w-4" />
                      <span className="font-semibold text-foreground">
                        {calculateReporterViews(mostActiveReporter.author.id).toLocaleString('en-US')}
                      </span>
                      مشاهدة
                    </span>
                  </div>
                  
                  {/* View Profile Button */}
                  <Link href={`/reporter/${mostActiveReporter.author.id}`}>
                    <Button variant="outline" size="sm" className="gap-2" data-testid="button-view-reporter-profile">
                      عرض الملف الشخصي
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Enhanced Statistics Summary Section */}
      {articlesLoading ? (
        <div className="container mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-4 rounded" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16 mb-2" />
                  <Skeleton className="h-3 w-20" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <div className="container mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 md:gap-4 mb-8">
            {/* Total Articles */}
            <MobileOptimizedKpiCard
              label="إجمالي المقالات"
              value={statistics.totalArticles.toLocaleString('en-US')}
              icon={Newspaper}
              iconColor="text-primary"
              iconBgColor="bg-primary/10"
              testId="stat-total-articles"
            />

            {/* Recent Articles (24h) */}
            <MobileOptimizedKpiCard
              label="المقالات الحديثة"
              value={statistics.recentArticles.toLocaleString('en-US')}
              icon={Clock}
              iconColor="text-blue-600"
              iconBgColor="bg-blue-600/10"
              testId="stat-recent-articles"
            />

            {/* Total Views */}
            <MobileOptimizedKpiCard
              label="المشاهدات الكلية"
              value={statistics.totalViews.toLocaleString('en-US')}
              icon={Eye}
              iconColor="text-purple-600"
              iconBgColor="bg-purple-600/10"
              testId="stat-total-views"
            />

            {/* Average Engagement */}
            <MobileOptimizedKpiCard
              label="معدل التفاعل"
              value={statistics.avgEngagement.toLocaleString('en-US')}
              icon={Heart}
              iconColor="text-red-600"
              iconBgColor="bg-red-600/10"
              testId="stat-avg-engagement"
            />

            {/* Most Viewed Article */}
            <MobileOptimizedKpiCard
              label="أكثر المقالات مشاهدة"
              value={statistics.mostViewed ? statistics.mostViewed.title : "لا توجد بيانات"}
              icon={TrendingUp}
              iconColor="text-green-600"
              iconBgColor="bg-green-600/10"
              testId="stat-most-viewed"
            />

            {/* Last Update */}
            <MobileOptimizedKpiCard
              label="آخر تحديث"
              value={
                statistics.latestArticle?.publishedAt
                  ? formatDistanceToNow(new Date(statistics.latestArticle.publishedAt), {
                      addSuffix: true,
                      locale: arSA,
                    })
                  : "لا توجد بيانات"
              }
              icon={RefreshCw}
              iconColor="text-orange-600"
              iconBgColor="bg-orange-600/10"
              testId="stat-last-update"
            />
          </div>
        </div>
      )}

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
                      priority={index === 0 && !category.heroImageUrl}
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

      {/* Footer */}
      <Footer />
    </div>
  );
}