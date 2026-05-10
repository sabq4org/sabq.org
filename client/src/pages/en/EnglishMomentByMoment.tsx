import { useEffect, useRef, useState, useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { formatDistanceToNow, parseISO, startOfDay, subDays, subHours, differenceInMinutes } from "date-fns";
import { enUS } from "date-fns/locale";
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
import { EnglishLayout } from "@/components/en/EnglishLayout";
import { EnglishFooter } from "@/components/en/EnglishFooter";

interface LiveUpdate {
  id: string;
  title: string;
  slug: string;
  imageUrl: string | null;
  publishedAt: string;
  updatedAt: string;
  isBreaking: boolean;
  categoryId: string;
  categoryName: string;
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
  name: string;
  slug: string;
  color?: string;
  status: string;
}

type TimeRange = "1h" | "3h" | "today" | "yesterday" | "7d";

function formatRelativeTime(dateString: string): string {
  try {
    const date = parseISO(dateString);
    return formatDistanceToNow(date, { addSuffix: true, locale: enUS });
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
      acc[item.categoryName] = (acc[item.categoryName] || 0) + 1;
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
      mostActiveCategory: mostActiveCategory ? mostActiveCategory[0] : "None",
      avgFrequency,
    };
  }, [items]);

  const statCards = [
    {
      id: "today-updates",
      label: "Today's Updates",
      value: statistics.todayTotal,
      unit: "live updates",
      icon: Activity,
      gradient: "stat-card-gradient-1",
      iconBg: "bg-primary/15",
      iconColor: "text-primary",
    },
    {
      id: "breaking-count",
      label: "Breaking News",
      value: statistics.breakingCount,
      unit: "breaking stories",
      icon: Zap,
      gradient: "stat-card-gradient-2",
      iconBg: "bg-destructive/15",
      iconColor: "text-destructive",
    },
    {
      id: "active-category",
      label: "Most Active",
      value: statistics.mostActiveCategory,
      unit: "category",
      icon: BarChart3,
      gradient: "stat-card-gradient-3",
      iconBg: "bg-purple-500/15",
      iconColor: "text-purple-600 dark:text-purple-400",
      isText: true,
    },
    {
      id: "avg-frequency",
      label: "Update Rate",
      value: statistics.avgFrequency > 0 ? statistics.avgFrequency : "—",
      unit: statistics.avgFrequency > 0 ? "minutes" : "N/A",
      icon: Timer,
      gradient: "stat-card-gradient-4",
      iconBg: "bg-info/15",
      iconColor: "text-info",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {statCards.map((stat) => (
        <div
          key={stat.id}
          className={`${stat.gradient} rounded-xl p-5 hover-elevate border`}
          data-testid={`stat-${stat.id}`}
        >
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
      ))}
    </div>
  );
}

interface ModernNewsCardProps {
  item: LiveUpdate;
}

function ModernNewsCard({ item }: ModernNewsCardProps) {
  const isNew = isNewUpdate(item.publishedAt);
  const categoryColor = item.categoryColor || "hsl(var(--primary))";

  return (
    <Link href={`/en/article/${item.englishSlug || item.slug}`} data-testid={`link-article-${item.id}`}>
      <Card 
        className="hover-elevate active-elevate-2 border-l-4 transition-all"
        style={{ 
          borderLeftColor: categoryColor,
        }}
        data-testid={`card-news-${item.id}`}
      >
        <CardContent className="p-0">
          <div className="flex gap-4 p-5">
            {item.imageUrl && (
              <div className="relative shrink-0">
                <img 
                  src={item.imageUrl} 
                  alt={item.title}
                  className="w-28 h-28 rounded-xl object-cover"
                  loading="lazy"
                  data-testid={`img-thumbnail-${item.id}`}
                />
                {item.isBreaking && (
                  <div className="absolute -top-2 -left-2">
                    <Badge variant="destructive" className="text-xs shadow-lg" data-testid={`badge-breaking-overlay-${item.id}`}>
                      <Zap className="h-3 w-3" />
                    </Badge>
                  </div>
                )}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                {isNew && (
                  <Badge className="text-xs bg-green-600 text-white shadow-sm" data-testid={`badge-new-${item.id}`}>
                    New
                  </Badge>
                )}
                {item.isBreaking && !item.imageUrl && (
                  <Badge variant="destructive" className="text-xs gap-1 shadow-sm" data-testid={`badge-breaking-${item.id}`}>
                    <Zap className="h-3 w-3" />
                    Breaking
                  </Badge>
                )}
                <Badge 
                  variant="secondary" 
                  className="text-xs text-black"
                  style={{ 
                    borderLeft: `3px solid ${categoryColor}`,
                    backgroundColor: '#e5e5e6'
                  }}
                  data-testid={`badge-category-${item.id}`}
                >
                  {item.categoryName}
                </Badge>
                <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1" data-testid={`text-time-${item.id}`}>
                  <Clock className="h-3 w-3" />
                  {formatRelativeTime(item.publishedAt)}
                </span>
              </div>

              <h3 className="font-bold text-base mb-2 line-clamp-2 leading-relaxed" data-testid={`text-title-${item.id}`}>
                {item.title}
              </h3>

              <p className="text-sm text-muted-foreground line-clamp-2 mb-4 leading-relaxed" data-testid={`text-summary-${item.id}`}>
                {item.summary}
              </p>

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-full" data-testid={`text-views-${item.id}`}>
                  <Eye className="h-3.5 w-3.5" />
                  {item.viewsCount.toLocaleString()}
                </span>
                <span className="flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-full" data-testid={`text-comments-${item.id}`}>
                  <MessageSquare className="h-3.5 w-3.5" />
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
        <Card key={i} className="border-l-4 border-l-muted">
          <CardContent className="p-5">
            <div className="flex gap-4">
              <Skeleton className="w-28 h-28 rounded-xl shrink-0" />
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-4 w-24 ml-auto" />
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
      <h3 className="text-xl font-bold mb-3">No news at the moment</h3>
      <p className="text-muted-foreground">
        We'll notify you when new updates arrive
      </p>
    </div>
  );
}

function BreakingTicker({ items }: { items: LiveUpdate[] }) {
  if (items.length === 0) return null;

  const duplicatedItems = [...items, ...items];

  return (
    <div className="bg-destructive/10 backdrop-blur-sm border-y border-destructive/20 py-3 overflow-hidden" data-testid="breaking-ticker">
      <div className="container max-w-6xl px-6">
        <div className="flex items-center gap-4">
          <div className="shrink-0 flex items-center gap-2">
            <div className="relative">
              <div className="h-2.5 w-2.5 rounded-full bg-destructive animate-pulse" />
              <div className="absolute inset-0 h-2.5 w-2.5 rounded-full bg-destructive live-pulse-ring" />
            </div>
            <Badge variant="destructive" className="shadow-md" data-testid="badge-breaking-ticker">
              <Zap className="h-3 w-3 mr-1" />
              Breaking
            </Badge>
          </div>
          <div className="overflow-hidden flex-1">
            <div className="flex gap-8 animate-ticker-ltr">
              {duplicatedItems.map((item, index) => (
                <Link 
                  key={`${item.id}-${index}`}
                  href={`/en/article/${item.englishSlug || item.slug}`}
                  className="text-sm font-medium hover:text-destructive transition-colors whitespace-nowrap"
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

export default function EnglishMomentByMoment() {
  const [filter, setFilter] = useState<"all" | "breaking">("all");
  const [timeRange, setTimeRange] = useState<TimeRange>("today");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const { data: categoriesDataRaw } = useQuery<Category[]>({
    queryKey: ["/api/en/categories"],
  });
  const categoriesData = Array.isArray(categoriesDataRaw) ? categoriesDataRaw : [];

  const activeCategories = categoriesData.filter(
    (cat) => cat.status === "visible"
  );

  const { data: breakingData } = useQuery<BreakingNewsResponse>({
    queryKey: ["/api/en/live/breaking"],
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
    queryKey: ["/api/en/live/updates", filter],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("limit", "20");
      if (filter !== "all") {
        params.set("filter", filter);
      }
      if (pageParam) {
        params.set("cursor", pageParam as string);
      }

      const res = await fetch(`/api/en/live/updates?${params}`);
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
    queryClient.invalidateQueries({ queryKey: ["/api/en/live/updates"] });
    queryClient.invalidateQueries({ queryKey: ["/api/en/live/breaking"] });
    refetch();
  };

  useEffect(() => {
    const updateTime = () => {
      setLastUpdate(new Date().toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      }));
    };

    updateTime();

    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/en/live/updates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/en/live/breaking"] });
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
    <EnglishLayout>
      <div className="min-h-screen bg-background" data-testid="page-moment-by-moment-en">
        {/* Hero Section */}
        <div className="glass-hero border-b" data-testid="header-hero">
          <div className="container max-w-6xl px-6 py-8">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 mb-4 text-sm">
              <Link href="/en" data-testid="link-home">
                <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
                  <Home className="h-4 w-4" />
                  Home
                </Button>
              </Link>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Moment by Moment</span>
            </div>

            <div className="flex items-start gap-4">
              <div className="relative">
                <div className="p-3 bg-destructive rounded-xl" data-testid="icon-live">
                  <Radio className="h-8 w-8 text-destructive-foreground" />
                </div>
                <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-destructive live-pulse-ring" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <h1 className="text-3xl md:text-4xl font-bold tracking-tight" data-testid="text-page-title">
                    Moment by Moment
                  </h1>
                  <Badge 
                    variant="destructive" 
                    className="text-sm px-3 py-1"
                    data-testid="badge-live"
                  >
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                      LIVE
                    </span>
                  </Badge>
                </div>
                <p className="text-muted-foreground text-base md:text-lg max-w-2xl" data-testid="text-page-subtitle">
                  Live coverage of breaking news and real-time updates
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Breaking News Ticker */}
        <BreakingTicker items={breakingNews} />

        {/* Statistics Section */}
        <section className="container max-w-6xl px-6 py-8">
          {isLoading ? (
            <StatisticsSkeleton />
          ) : (
            <StatisticsCards items={allItems} />
          )}
        </section>

        {/* Sticky Filter Bar */}
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b py-4" data-testid="header-status-bar">
          <div className="container max-w-6xl px-6">
            {/* Status Row */}
            <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
              <div className="flex items-center gap-3 flex-wrap">
                {/* Live Indicator */}
                <div className="flex items-center gap-2 bg-destructive/10 px-3 py-1.5 rounded-full">
                  <div className="relative">
                    <div className="h-2.5 w-2.5 rounded-full bg-destructive animate-pulse" data-testid="indicator-live" />
                    <div className="absolute inset-0 h-2.5 w-2.5 rounded-full bg-destructive live-pulse-ring" />
                  </div>
                  <span className="text-sm font-semibold text-destructive" data-testid="text-live">Live</span>
                </div>
                
                {lastUpdate && (
                  <Badge variant="outline" className="text-xs gap-1.5" data-testid="badge-last-update">
                    <Clock className="h-3 w-3" />
                    Last update: {lastUpdate}
                  </Badge>
                )}
                
                <Badge variant="secondary" className="text-xs" data-testid="badge-count">
                  {filteredItems.length} {filteredItems.length === 1 ? 'update' : 'updates'}
                </Badge>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleManualRefresh}
                className="gap-2"
                data-testid="button-refresh"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </div>

            {/* Filters Row */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Time Range Filter */}
              <Select value={timeRange} onValueChange={(value) => setTimeRange(value as TimeRange)}>
                <SelectTrigger className="w-[140px]" data-testid="select-time-range">
                  <Clock className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Time range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">Last hour</SelectItem>
                  <SelectItem value="3h">Last 3 hours</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                </SelectContent>
              </Select>

              {/* Category Filter */}
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[160px]" data-testid="select-category">
                  <FolderOpen className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {activeCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Breaking Filter */}
              <div className="flex items-center gap-2">
                <Button
                  variant={filter === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter("all")}
                  data-testid="button-filter-all"
                >
                  All
                </Button>
                <Button
                  variant={filter === "breaking" ? "destructive" : "outline"}
                  size="sm"
                  onClick={() => setFilter("breaking")}
                  className="gap-1"
                  data-testid="button-filter-breaking"
                >
                  <Zap className="h-3 w-3" />
                  Breaking
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* News Feed */}
        <section className="container max-w-6xl px-6 py-8">
          {isLoading ? (
            <CompactSkeleton count={10} />
          ) : filteredItems.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="flex flex-col gap-6">
              {filteredItems.map((item) => (
                <ModernNewsCard key={item.id} item={item} />
              ))}
            </div>
          )}

          {/* Load More */}
          <div ref={loadMoreRef} className="py-8">
            {isFetchingNextPage && (
              <div className="flex items-center justify-center gap-3 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Loading more...</span>
              </div>
            )}
          </div>
        </section>

        <EnglishFooter />
      </div>
    </EnglishLayout>
  );
}
