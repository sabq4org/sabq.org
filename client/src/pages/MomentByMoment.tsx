import { useEffect, useRef, useState, useMemo, Fragment } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { formatDistanceToNow, parseISO, startOfDay, subDays, subHours, differenceInMinutes } from "date-fns";
import { ar } from "date-fns/locale";
import {
  Radio,
  Zap,
  Eye,
  MessageSquare,
  Loader2,
  Clock,
  RefreshCw,
  FolderOpen,
  TrendingUp,
  Activity,
  BarChart3,
  Timer,
  Home,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { queryClient } from "@/lib/queryClient";
import { DmsLeaderboardAd, DmsMpuAd, useAdTracking } from "@/components/DmsAdSlot";
import { OptimizedImage } from "@/components/OptimizedImage";
import { getObjectPosition } from "@/lib/imageUtils";

interface LiveUpdate {
  id: string;
  title: string;
  slug: string;
  englishSlug: string | null;
  imageUrl: string | null;
  imageFocalPoint?: { x: number; y: number } | null;
  publishedAt: string;
  updatedAt: string;
  isBreaking: boolean;
  categoryId: string;
  categoryNameAr: string;
  categoryColor?: string;
  viewsCount: number;
  commentsCount: number;
  summary: string;
}

interface LiveUpdatesResponse {
  items: LiveUpdate[];
  nextCursor: string | null;
}

interface BreakingNewsResponse {
  items: LiveUpdate[];
}

interface Category {
  id: string;
  nameAr: string;
  slug: string;
  color?: string;
  status: string;
  type: string;
}

type TimeRange = "1h" | "3h" | "today" | "yesterday" | "7d";

function formatRelativeTime(dateString: string): string {
  try {
    const date = parseISO(dateString);
    return formatDistanceToNow(date, { addSuffix: true, locale: ar });
  } catch {
    return "";
  }
}

function isNewUpdate(dateString: string): boolean {
  try {
    const date = parseISO(dateString);
    const now = new Date();
    return differenceInMinutes(now, date) <= 5;
  } catch {
    return false;
  }
}

function StatisticsSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="skeleton-statistics">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="bg-card rounded-xl p-5 border">
          <div className="flex items-center gap-3 mb-4">
            <Skeleton className="h-12 w-12 rounded-xl" />
            <div className="flex-1">
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
      ))}
    </div>
  );
}

interface StatisticsCardsProps {
  items: LiveUpdate[];
}

function StatisticsCards({ items }: StatisticsCardsProps) {
  const statistics = useMemo(() => {
    const now = new Date();
    const todayStart = startOfDay(now);

    const todayUpdates = items.filter((item) => {
      try {
        const publishedDate = parseISO(item.publishedAt);
        return publishedDate >= todayStart;
      } catch {
        return false;
      }
    });

    const breakingCount = items.filter((item) => item.isBreaking).length;

    const categoryCounts = items.reduce((acc, item) => {
      acc[item.categoryNameAr] = (acc[item.categoryNameAr] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const mostActiveCategory = Object.entries(categoryCounts).sort(
      ([, a], [, b]) => b - a
    )[0];

    let avgFrequency = 0;
    if (todayUpdates.length > 1) {
      const sortedUpdates = todayUpdates.sort(
        (a, b) => parseISO(b.publishedAt).getTime() - parseISO(a.publishedAt).getTime()
      );
      const totalMinutes = differenceInMinutes(
        parseISO(sortedUpdates[0].publishedAt),
        parseISO(sortedUpdates[sortedUpdates.length - 1].publishedAt)
      );
      avgFrequency = Math.round(totalMinutes / (todayUpdates.length - 1));
    }

    return {
      todayTotal: todayUpdates.length,
      breakingCount,
      mostActiveCategory: mostActiveCategory ? mostActiveCategory[0] : "لا يوجد",
      avgFrequency,
    };
  }, [items]);

  const statCards = [
    {
      id: "today-updates",
      label: "تحديثات اليوم",
      value: statistics.todayTotal,
      unit: "تحديث مباشر",
      icon: Activity,
      gradient: "stat-card-gradient-1",
      iconBg: "bg-primary/15",
      iconColor: "text-primary",
    },
    {
      id: "breaking-count",
      label: "أخبار عاجلة",
      value: statistics.breakingCount,
      unit: "خبر عاجل",
      icon: Zap,
      gradient: "stat-card-gradient-2",
      iconBg: "bg-destructive/15",
      iconColor: "text-destructive",
    },
    {
      id: "active-category",
      label: "الأكثر نشاطاً",
      value: statistics.mostActiveCategory,
      unit: "تصنيف",
      icon: BarChart3,
      gradient: "stat-card-gradient-3",
      iconBg: "bg-purple-500/15",
      iconColor: "text-purple-600 dark:text-purple-400",
      isText: true,
    },
    {
      id: "avg-frequency",
      label: "معدل التحديث",
      value: statistics.avgFrequency > 0 ? statistics.avgFrequency : "—",
      unit: statistics.avgFrequency > 0 ? "دقيقة" : "غير متوفر",
      icon: Timer,
      gradient: "stat-card-gradient-4",
      iconBg: "bg-info/15",
      iconColor: "text-info",
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-1.5 sm:gap-4">
      {statCards.map((stat, index) => (
        <div
          key={stat.id}
          className={`${stat.gradient} rounded-lg sm:rounded-xl p-1.5 sm:p-5 hover-elevate border`}
          data-testid={`stat-${stat.id}`}
        >
          {/* Mobile: Ultra compact vertical layout */}
          <div className="sm:hidden flex flex-col items-center text-center gap-0.5">
            <div className={`p-1 rounded-md ${stat.iconBg}`}>
              <stat.icon className={`h-3 w-3 ${stat.iconColor}`} />
            </div>
            <div className={`${stat.isText ? 'text-[10px]' : 'text-sm'} font-bold line-clamp-1`}>
              {stat.value}
            </div>
            <span className="text-[8px] text-muted-foreground leading-tight line-clamp-1">{stat.label}</span>
          </div>
          {/* Desktop: Original layout */}
          <div className="hidden sm:block">
            <div className="flex items-center gap-3 mb-3">
              <div className={`p-3 rounded-xl ${stat.iconBg}`}>
                <stat.icon className={`h-5 w-5 ${stat.iconColor}`} />
              </div>
              <span className="text-sm text-muted-foreground font-medium">{stat.label}</span>
            </div>
            <div className={`${stat.isText ? 'text-lg' : 'text-3xl'} font-bold mb-1 line-clamp-1`}>
              {stat.value}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3" />
              <span>{stat.unit}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

interface ModernNewsCardProps {
  item: LiveUpdate;
  index: number;
}

function ModernNewsCard({ item, index }: ModernNewsCardProps) {
  const isNew = isNewUpdate(item.publishedAt);
  const categoryColor = item.categoryColor || "hsl(var(--primary))";

  return (
    <Link href={`/article/${item.englishSlug || item.slug}`} data-testid={`link-article-${item.id}`}>
      <Card 
        className="group hover-elevate active-elevate-2 border-r-2 sm:border-r-4 transition-all"
        style={{ 
          borderRightColor: categoryColor,
        }}
        data-testid={`card-news-${item.id}`}
      >
        <CardContent className="p-0">
          <div className="flex gap-3 sm:gap-4 p-4 sm:p-5">
            {item.imageUrl && (
              <div className="relative flex-shrink-0 w-24 h-20 rounded-lg overflow-hidden">
                <OptimizedImage 
                  src={item.imageUrl} 
                  alt={item.title}
                  className="w-full h-full object-cover rounded-lg transition-transform duration-500 group-hover:scale-110"
                  wrapperClassName="w-full h-full"
                  priority={false}
                  objectPosition={getObjectPosition(item)}
                />
                {item.isBreaking && (
                  <div className="absolute -top-1 -right-1 sm:-top-2 sm:-right-2">
                    <Badge variant="destructive" className="text-[10px] sm:text-xs shadow-lg px-1 sm:px-2 py-0.5 sm:py-0.5" data-testid={`badge-breaking-overlay-${item.id}`}>
                      <Zap className="h-2.5 sm:h-3 w-2.5 sm:w-3" />
                    </Badge>
                  </div>
                )}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-3 flex-wrap">
                {isNew && (
                  <Badge className="text-[10px] sm:text-xs bg-green-600 text-white shadow-sm px-1.5 sm:px-2 py-0 h-4 sm:h-auto" data-testid={`badge-new-${item.id}`}>
                    جديد
                  </Badge>
                )}
                {item.isBreaking && !item.imageUrl && (
                  <Badge variant="destructive" className="text-[10px] sm:text-xs gap-0.5 sm:gap-1 shadow-sm px-1.5 sm:px-2 py-0 h-4 sm:h-auto" data-testid={`badge-breaking-${item.id}`}>
                    <Zap className="h-2.5 sm:h-3 w-2.5 sm:w-3" />
                    عاجل
                  </Badge>
                )}
                <Badge 
                  variant="secondary" 
                  className="text-[10px] sm:text-xs text-black px-1.5 sm:px-2 py-0 h-4 sm:h-auto"
                  style={{ 
                    borderRight: `2px solid ${categoryColor}`,
                    backgroundColor: '#e5e5e6'
                  }}
                  data-testid={`badge-category-${item.id}`}
                >
                  {item.categoryNameAr}
                </Badge>
                <span className="text-[10px] sm:text-xs text-muted-foreground mr-auto flex items-center gap-1 sm:gap-1" data-testid={`text-time-${item.id}`}>
                  <Clock className="h-3 sm:h-3 w-3 sm:w-3" />
                  {formatRelativeTime(item.publishedAt)}
                </span>
              </div>

              <h3 className="font-bold text-sm sm:text-base mb-1.5 sm:mb-2 line-clamp-2 leading-relaxed sm:leading-relaxed" data-testid={`text-title-${item.id}`}>
                {item.title}
              </h3>

              <p className="text-xs sm:text-sm text-muted-foreground line-clamp-1 sm:line-clamp-2 mb-2 sm:mb-4 leading-relaxed sm:leading-relaxed hidden sm:block" data-testid={`text-summary-${item.id}`}>
                {item.summary}
              </p>

              <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-xs text-muted-foreground">
                <span className="flex items-center gap-1 sm:gap-1.5 bg-muted/50 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full" data-testid={`text-views-${item.id}`}>
                  <Eye className="h-3 sm:h-3.5 w-3 sm:w-3.5" />
                  {item.viewsCount.toLocaleString()}
                </span>
                <span className="flex items-center gap-1 sm:gap-1.5 bg-muted/50 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full" data-testid={`text-comments-${item.id}`}>
                  <MessageSquare className="h-3 sm:h-3.5 w-3 sm:w-3.5" />
                  {item.commentsCount.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function CompactSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-6" data-testid="skeleton-loading">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="border-r-4 border-r-muted">
          <CardContent className="p-5">
            <div className="flex gap-4">
              <Skeleton className="w-28 h-28 rounded-xl shrink-0" />
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-4 w-24 mr-auto" />
                </div>
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-4/5" />
                <Skeleton className="h-4 w-3/4" />
                <div className="flex gap-4">
                  <Skeleton className="h-6 w-16 rounded-full" />
                  <Skeleton className="h-6 w-16 rounded-full" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16 bg-muted/30 rounded-2xl border" data-testid="empty-state">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-muted mb-6">
        <Radio className="h-10 w-10 text-muted-foreground" />
      </div>
      <h3 className="text-xl font-bold mb-3">لا توجد أخبار حالياً</h3>
      <p className="text-muted-foreground">
        سنعلمك فور وصول أخبار جديدة
      </p>
    </div>
  );
}

function BreakingTicker({ items }: { items: LiveUpdate[] }) {
  if (items.length === 0) return null;

  const duplicatedItems = [...items, ...items];

  return (
    <div className="bg-destructive/10 backdrop-blur-sm border-y border-destructive/20 py-1.5 sm:py-3 overflow-hidden" data-testid="breaking-ticker">
      <div className="container max-w-6xl px-3 sm:px-6">
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="shrink-0 flex items-center gap-1 sm:gap-2">
            <div className="relative">
              <div className="h-1.5 sm:h-2.5 w-1.5 sm:w-2.5 rounded-full bg-destructive animate-pulse" />
              <div className="absolute inset-0 h-1.5 sm:h-2.5 w-1.5 sm:w-2.5 rounded-full bg-destructive live-pulse-ring" />
            </div>
            <Badge variant="destructive" className="shadow-md text-[9px] sm:text-xs px-1 sm:px-2 py-0 sm:py-0.5 h-4 sm:h-auto" data-testid="badge-breaking-ticker">
              <Zap className="h-2 sm:h-3 w-2 sm:w-3 ml-0.5 sm:ml-1" />
              عاجل
            </Badge>
          </div>
          <div className="overflow-hidden flex-1">
            <div className="flex gap-4 sm:gap-8 animate-ticker">
              {duplicatedItems.map((item, index) => (
                <Link 
                  key={`${item.id}-${index}`}
                  href={`/article/${item.englishSlug || item.slug}`}
                  className="text-[10px] sm:text-sm font-medium hover:text-destructive transition-colors whitespace-nowrap"
                  data-testid={`link-breaking-${item.id}-${index}`}
                >
                  {item.title}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MomentByMoment() {
  useAdTracking('لحظة بلحظة');
  
  const [filter, setFilter] = useState<"all" | "breaking">("all");
  const [timeRange, setTimeRange] = useState<TimeRange>("today");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const { data: categoriesDataRaw } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    queryFn: async () => {
      const res = await fetch("/api/categories", { credentials: 'include' });
      if (!res.ok) throw new Error("Failed to fetch categories");
      return res.json();
    },
  });
  const categoriesData = Array.isArray(categoriesDataRaw) ? categoriesDataRaw : [];

  const activeCategories = categoriesData.filter(
    (cat) => cat.status === "visible" && cat.type === "core"
  );

  const { data: breakingData } = useQuery<BreakingNewsResponse>({
    queryKey: ["/api/live/breaking"],
    refetchInterval: 60000, // 60s (was 30s)
  });

  const breakingNews = breakingData?.items || [];

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfiniteQuery<LiveUpdatesResponse>({
    queryKey: ["/api/live/updates", filter],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("limit", "20");
      if (filter !== "all") {
        params.set("filter", filter);
      }
      if (pageParam) {
        params.set("cursor", pageParam as string);
      }

      const res = await fetch(`/api/live/updates?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined,
    refetchInterval: 60000, // 60s (was 30s)
  });

  const allItems = data?.pages.flatMap((page) => page.items) || [];

  const filteredItems = useMemo(() => {
    let filtered = allItems;
    const now = new Date();
    
    switch (timeRange) {
      case "1h":
        const hourAgo = subHours(now, 1);
        filtered = filtered.filter((item) => {
          try {
            const publishedDate = parseISO(item.publishedAt);
            return publishedDate >= hourAgo && publishedDate <= now;
          } catch {
            return false;
          }
        });
        break;
        
      case "3h":
        const threeHoursAgo = subHours(now, 3);
        filtered = filtered.filter((item) => {
          try {
            const publishedDate = parseISO(item.publishedAt);
            return publishedDate >= threeHoursAgo && publishedDate <= now;
          } catch {
            return false;
          }
        });
        break;
        
      case "today":
        const todayStart = startOfDay(now);
        const tomorrowStart = new Date(now);
        tomorrowStart.setDate(tomorrowStart.getDate() + 1);
        const tomorrowStartOfDay = startOfDay(tomorrowStart);
        
        filtered = filtered.filter((item) => {
          try {
            const publishedDate = parseISO(item.publishedAt);
            return publishedDate >= todayStart && publishedDate < tomorrowStartOfDay;
          } catch {
            return false;
          }
        });
        break;
        
      case "yesterday":
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStart = startOfDay(yesterday);
        const todayStartForYesterday = startOfDay(now);
        
        filtered = filtered.filter((item) => {
          try {
            const publishedDate = parseISO(item.publishedAt);
            return publishedDate >= yesterdayStart && publishedDate < todayStartForYesterday;
          } catch {
            return false;
          }
        });
        break;
        
      case "7d":
        const weekAgo = subDays(now, 7);
        filtered = filtered.filter((item) => {
          try {
            const publishedDate = parseISO(item.publishedAt);
            return publishedDate >= weekAgo && publishedDate <= now;
          } catch {
            return false;
          }
        });
        break;
    }

    if (categoryFilter !== "all") {
      filtered = filtered.filter((item) => item.categoryId === categoryFilter);
    }

    return filtered;
  }, [allItems, timeRange, categoryFilter]);

  const handleManualRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/live/updates"] });
    queryClient.invalidateQueries({ queryKey: ["/api/live/breaking"] });
    refetch();
  };

  useEffect(() => {
    const updateTime = () => {
      setLastUpdate(new Date().toLocaleTimeString("ar-EG", {
        hour: "2-digit",
        minute: "2-digit",
      }));
    };

    updateTime();

    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/live/updates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/live/breaking"] });
      updateTime();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!loadMoreRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loadMoreRef.current);

    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return (
    <div className="min-h-screen bg-background" dir="rtl" data-testid="page-moment-by-moment">
      {/* Hero Section with Glassmorphism - Compact on mobile */}
      <div className="glass-hero border-b" data-testid="header-hero">
        <div className="container max-w-6xl px-3 sm:px-6 py-3 sm:py-8">
          {/* Breadcrumb / Home Navigation */}
          <div className="flex items-center gap-1 sm:gap-2 mb-2 sm:mb-4 text-[10px] sm:text-sm">
            <Link href="/" data-testid="link-home">
              <Button variant="ghost" size="sm" className="gap-1 sm:gap-2 text-muted-foreground hover:text-foreground h-6 sm:h-8 px-1 sm:px-3 text-[10px] sm:text-sm">
                <Home className="h-3 sm:h-4 w-3 sm:w-4" />
                الرئيسية
              </Button>
            </Link>
            <ChevronRight className="h-3 sm:h-4 w-3 sm:w-4 text-muted-foreground rotate-180" />
            <span className="font-medium">لحظة بلحظة</span>
          </div>

          <div className="flex items-start gap-2 sm:gap-4">
            <div className="relative">
              <div className="p-1.5 sm:p-3 bg-destructive rounded-lg sm:rounded-xl" data-testid="icon-live">
                <Radio className="h-4 sm:h-8 w-4 sm:w-8 text-destructive-foreground" />
              </div>
              <div className="absolute -top-0.5 -right-0.5 sm:-top-1 sm:-right-1 h-2 sm:h-3 w-2 sm:w-3 rounded-full bg-destructive live-pulse-ring" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-1.5 sm:gap-3 mb-1 sm:mb-2 flex-wrap">
                <h1 className="text-lg sm:text-3xl md:text-4xl font-bold tracking-tight" data-testid="text-page-title">
                  لحظة بلحظة
                </h1>
                <Badge 
                  variant="destructive" 
                  className="text-[9px] sm:text-sm px-1.5 sm:px-3 py-0 sm:py-1 h-4 sm:h-auto"
                  data-testid="badge-live"
                >
                  <span className="flex items-center gap-1 sm:gap-2">
                    <span className="h-1.5 sm:h-2 w-1.5 sm:w-2 rounded-full bg-white animate-pulse" />
                    LIVE
                  </span>
                </Badge>
              </div>
              <p className="text-muted-foreground text-[10px] sm:text-base md:text-lg max-w-2xl" data-testid="text-page-subtitle">
                متابعة مباشرة للأخبار العاجلة والتحديثات اللحظية
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Breaking News Ticker */}
      <BreakingTicker items={breakingNews} />

      {/* DMS Ads - Leaderboard for desktop, MPU for mobile */}
      <div className="container max-w-6xl px-6 pt-6">
        <DmsLeaderboardAd />
        <DmsMpuAd />
      </div>

      {/* Statistics Section - Compact on mobile */}
      <section className="container max-w-6xl px-3 sm:px-6 py-3 sm:py-8">
        {isLoading ? (
          <StatisticsSkeleton />
        ) : (
          <StatisticsCards items={allItems} />
        )}
      </section>

      {/* Enhanced Sticky Filter Bar - Compact on mobile */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b py-2 sm:py-4" data-testid="header-status-bar">
        <div className="container max-w-6xl px-3 sm:px-6">
          {/* Status Row - Ultra compact on mobile */}
          <div className="flex items-center justify-between gap-2 sm:gap-4 flex-wrap mb-2 sm:mb-4">
            <div className="flex items-center gap-1.5 sm:gap-3 flex-wrap">
              {/* Live Indicator with Pulse Ring */}
              <div className="flex items-center gap-1 sm:gap-2 bg-destructive/10 px-1.5 sm:px-3 py-0.5 sm:py-1.5 rounded-full">
                <div className="relative">
                  <div className="h-1.5 sm:h-2.5 w-1.5 sm:w-2.5 rounded-full bg-destructive animate-pulse" data-testid="indicator-live" />
                  <div className="absolute inset-0 h-1.5 sm:h-2.5 w-1.5 sm:w-2.5 rounded-full bg-destructive live-pulse-ring" />
                </div>
                <span className="text-[10px] sm:text-sm font-semibold text-destructive" data-testid="text-live">مباشر</span>
              </div>
              
              {lastUpdate && (
                <Badge variant="outline" className="text-[9px] sm:text-xs gap-0.5 sm:gap-1.5 px-1 sm:px-2 py-0 sm:py-0.5 h-4 sm:h-auto" data-testid="badge-last-update">
                  <Clock className="h-2 sm:h-3 w-2 sm:w-3" />
                  <span className="hidden sm:inline">آخر تحديث:</span> {lastUpdate}
                </Badge>
              )}

              <Badge variant="secondary" className="text-[9px] sm:text-xs px-1 sm:px-2 py-0 sm:py-0.5 h-4 sm:h-auto" data-testid="badge-items-count">
                {filteredItems.length} <span className="hidden sm:inline">تحديث</span>
              </Badge>
            </div>

            <Button 
              variant="outline" 
              size="sm"
              onClick={handleManualRefresh}
              className="gap-1 sm:gap-2 h-6 sm:h-8 px-2 sm:px-3 text-[10px] sm:text-sm"
              data-testid="button-refresh"
            >
              <RefreshCw className="h-3 sm:h-4 w-3 sm:w-4" />
              <span className="hidden sm:inline">تحديث</span>
            </Button>
          </div>

          {/* Pill-Style Filters Row - Compact on mobile */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-3">
            {/* Filter Pills */}
            <div className="flex gap-1 sm:gap-2">
              <button
                onClick={() => setFilter("all")}
                className={`px-2 sm:px-4 py-1 sm:py-2 rounded-full text-[10px] sm:text-sm font-medium transition-all ${
                  filter === "all" 
                    ? "filter-pill-active" 
                    : "bg-muted/60 text-foreground hover-elevate"
                }`}
                data-testid="button-filter-all"
              >
                الكل
              </button>
              <button
                onClick={() => setFilter("breaking")}
                className={`px-2 sm:px-4 py-1 sm:py-2 rounded-full text-[10px] sm:text-sm font-medium transition-all flex items-center gap-0.5 sm:gap-1.5 ${
                  filter === "breaking" 
                    ? "filter-pill-breaking-active" 
                    : "bg-muted/60 text-foreground hover-elevate"
                }`}
                data-testid="button-filter-breaking"
              >
                <Zap className="h-2.5 sm:h-3.5 w-2.5 sm:w-3.5" />
                عاجل
              </button>
            </div>

            <div className="h-4 sm:h-6 w-px bg-border hidden sm:block" />

            {/* Time Range Select - Compact on mobile */}
            <Select value={timeRange} onValueChange={(value: TimeRange) => setTimeRange(value)}>
              <SelectTrigger className="w-[90px] sm:w-[160px] h-6 sm:h-9 rounded-full bg-muted/60 text-[10px] sm:text-sm px-2 sm:px-3" data-testid="select-time-range">
                <Clock className="h-2.5 sm:h-4 w-2.5 sm:w-4 ml-1 sm:ml-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1h" data-testid="option-1h">آخر ساعة</SelectItem>
                <SelectItem value="3h" data-testid="option-3h">آخر 3 ساعات</SelectItem>
                <SelectItem value="today" data-testid="option-today">اليوم</SelectItem>
                <SelectItem value="yesterday" data-testid="option-yesterday">الأمس</SelectItem>
                <SelectItem value="7d" data-testid="option-7d">آخر 7 أيام</SelectItem>
              </SelectContent>
            </Select>

            {/* Category Select - Compact on mobile */}
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[90px] sm:w-[180px] h-6 sm:h-9 rounded-full bg-muted/60 text-[10px] sm:text-sm px-2 sm:px-3" data-testid="select-category">
                <FolderOpen className="h-2.5 sm:h-4 w-2.5 sm:w-4 ml-1 sm:ml-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="option-all-categories">كل التصنيفات</SelectItem>
                {activeCategories.map((category) => (
                  <SelectItem 
                    key={category.id} 
                    value={category.id}
                    data-testid={`option-category-${category.id}`}
                  >
                    {category.nameAr}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* News Feed - Compact on mobile */}
      <main className="container max-w-4xl px-3 sm:px-6 py-3 sm:py-8" data-testid="main-content">
        {isLoading && <CompactSkeleton count={10} />}

        {!isLoading && filteredItems.length === 0 && <EmptyState />}

        {!isLoading && filteredItems.length > 0 && (
          <div className="flex flex-col gap-2 sm:gap-6" data-testid="list-news">
            {filteredItems.map((item, index) => (
              <Fragment key={item.id}>
                <ModernNewsCard item={item} index={index} />
                {/* Mobile ad slot after every 5th item */}
                {(index + 1) % 5 === 0 && index < filteredItems.length - 1 && (
                  <DmsMpuAd id={`MPU-mbm-${Math.floor(index / 5)}`} lazyLoad={true} />
                )}
              </Fragment>
            ))}
          </div>
        )}

        {/* Load More Trigger */}
        <div ref={loadMoreRef} className="py-8 text-center" data-testid="div-load-more">
          {isFetchingNextPage && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loader-fetching" />
              <span className="text-sm text-muted-foreground">جاري تحميل المزيد...</span>
            </div>
          )}
          {!hasNextPage && filteredItems.length > 0 && (
            <div className="inline-block px-6 py-3 rounded-full bg-muted/50">
              <p className="text-sm text-muted-foreground" data-testid="text-no-more">
                لا توجد تحديثات أقدم
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
