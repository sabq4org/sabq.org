import { useEffect, useRef, useState, useMemo, Fragment, type CSSProperties } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { formatDistanceToNow, parseISO, startOfDay, subDays, subHours, differenceInMinutes, isToday, isYesterday } from "date-fns";
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
  Activity,
  BarChart3,
  Timer,
  Home,
  ChevronRight,
  ChevronUp,
} from "lucide-react";
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
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatTime, formatNumber } from "@/lib/format";
import { DmsLeaderboardAd, DmsMpuAd, useAdTracking } from "@/components/DmsAdSlot";
import { OptimizedImage } from "@/components/OptimizedImage";
import { getObjectPosition } from "@/lib/imageUtils";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

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

// Exact clock time (e.g. 12:45 م) shown on each timeline node. Routes through
// the shared formatTime helper so digits stay Latin (the app-wide contract in
// lib/format.ts) — toLocaleTimeString("ar-EG") would emit Arabic-Indic digits
// and clash with the Latin-digit stats/counts on the same screen.
function formatClock(dateString: string): string {
  try {
    return formatTime(parseISO(dateString));
  } catch {
    return "";
  }
}

// Which time bucket an update belongs to. Drives the live-blog grouping
// (الآن / آخر ساعة / اليوم / الأمس / أقدم) so the reader always has a clear
// sense of "when" as they scroll down the spine.
type BucketKey = "now" | "hour" | "today" | "yesterday" | "older";

function getBucketKey(dateString: string): BucketKey {
  try {
    const date = parseISO(dateString);
    const mins = differenceInMinutes(new Date(), date);
    if (mins <= 15) return "now";
    if (mins <= 60) return "hour";
    if (isToday(date)) return "today";
    if (isYesterday(date)) return "yesterday";
    return "older";
  } catch {
    return "older";
  }
}

const BUCKET_META: { key: BucketKey; label: string; icon: typeof Radio }[] = [
  { key: "now", label: "الآن", icon: Radio },
  { key: "hour", label: "آخر ساعة", icon: Zap },
  { key: "today", label: "اليوم", icon: Activity },
  { key: "yesterday", label: "الأمس", icon: Clock },
  { key: "older", label: "أقدم", icon: Clock },
];

// Normalize a category colour into a usable CSS colour. Editors store hex
// (#rrggbb) or occasionally a bare token; fall back to the brand primary.
function resolveCategoryColor(raw?: string | null): string {
  if (!raw) return "hsl(var(--primary))";
  const v = raw.trim();
  if (!v) return "hsl(var(--primary))";
  return v;
}

function StatisticsSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3" data-testid="skeleton-statistics">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="bg-card rounded-xl p-3 border border-border/70">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-6 w-12" />
            </div>
            <Skeleton className="h-9 w-9 rounded-lg" />
          </div>
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
      iconBg: "bg-primary/15",
      iconColor: "text-primary",
    },
    {
      id: "breaking-count",
      label: "أخبار عاجلة",
      value: statistics.breakingCount,
      unit: "خبر عاجل",
      icon: Zap,
      iconBg: "bg-destructive/15",
      iconColor: "text-destructive",
    },
    {
      id: "active-category",
      label: "الأكثر نشاطاً",
      value: statistics.mostActiveCategory,
      unit: "تصنيف",
      icon: BarChart3,
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
      iconBg: "bg-info/15",
      iconColor: "text-info",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
      {statCards.map((stat) => (
        <div
          key={stat.id}
          className="bg-card rounded-xl border border-border/70 px-3 py-2.5 sm:px-4 sm:py-3 shadow-sm"
          data-testid={`stat-${stat.id}`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="block text-[10px] sm:text-xs text-muted-foreground font-medium mb-0.5">
                {stat.label}
              </span>
              <div className={`${stat.isText ? "text-sm sm:text-base" : "text-xl sm:text-2xl"} font-black leading-none line-clamp-1`}>
                {stat.value}
              </div>
            </div>
            <div className={`p-2 rounded-lg shrink-0 ${stat.iconBg}`}>
              <stat.icon className={`h-4 w-4 ${stat.iconColor}`} />
            </div>
          </div>
          <span className="block text-[9px] sm:text-[10px] text-muted-foreground mt-1">{stat.unit}</span>
        </div>
      ))}
    </div>
  );
}

interface TimelineEntryProps {
  item: LiveUpdate;
}

// A single node on the live timeline. The coloured dot (category colour)
// sits on the shared vertical spine drawn by the parent group; breaking /
// just-arrived entries get a breathing ring so the freshest news pops.
function TimelineEntry({ item }: TimelineEntryProps) {
  const isNew = isNewUpdate(item.publishedAt);
  const categoryColor = resolveCategoryColor(item.categoryColor);
  const nodeColor = item.isBreaking
    ? "hsl(var(--destructive))"
    : "hsl(var(--primary))";
  const accent = isNew || item.isBreaking;

  return (
    <Link
      href={`/article/${item.englishSlug || item.slug}`}
      className="block mbm-enter"
      data-testid={`link-article-${item.id}`}
    >
      <article className="relative group" data-testid={`card-news-${item.id}`}>
        {/* Timeline node — centred on the parent spine (right gutter, RTL) */}
        <span
          className={`absolute top-4 right-[10px] z-[1] h-3 w-3 rounded-full ring-[3px] ring-background ${accent ? "mbm-node-pulse" : ""}`}
          style={{ backgroundColor: nodeColor, "--mbm-dot": nodeColor } as CSSProperties}
          aria-hidden="true"
          data-testid={`node-${item.id}`}
        />

        <div className="rounded-xl bg-card border border-border/70 shadow-sm hover:shadow-md transition-all duration-300 p-3">
          {/* Meta row: clock + category + state badges */}
          <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 flex-wrap">
            <span
              className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-bold tabular-nums text-primary"
              data-testid={`text-clock-${item.id}`}
            >
              <Clock className="h-3 w-3" />
              {formatClock(item.publishedAt)}
            </span>

            <span
              className="text-[10px] sm:text-[11px] font-medium px-1.5 py-0.5 rounded bg-muted text-foreground/75"
              style={{ borderRight: `3px solid ${categoryColor}` }}
              data-testid={`badge-category-${item.id}`}
            >
              {item.categoryNameAr}
            </span>

            {item.isBreaking && (
              <Badge variant="destructive" className="text-[10px] gap-0.5 shadow-sm px-1.5 py-0 h-4" data-testid={`badge-breaking-${item.id}`}>
                <Zap className="h-2.5 w-2.5" />
                عاجل
              </Badge>
            )}
            {isNew && (
              <Badge className="text-[10px] bg-emerald-600 text-white border-0 shadow-sm gap-0.5 px-1.5 py-0 h-4" data-testid={`badge-new-${item.id}`}>
                <Zap className="h-2.5 w-2.5" />
                جديد
              </Badge>
            )}

            <span className="text-[10px] sm:text-xs text-muted-foreground mr-auto" data-testid={`text-time-${item.id}`}>
              {formatRelativeTime(item.publishedAt)}
            </span>
          </div>

          <div className="flex gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-sm sm:text-base mb-1 line-clamp-2 leading-relaxed text-foreground group-hover:text-primary transition-colors" data-testid={`text-title-${item.id}`}>
                {item.title}
              </h3>

              {item.summary && (
                <p className="text-xs text-foreground/65 line-clamp-1 leading-relaxed hidden sm:block mb-1.5" data-testid={`text-summary-${item.id}`}>
                  {item.summary}
                </p>
              )}

              <div className="flex items-center gap-3 text-[10px] sm:text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1" data-testid={`text-views-${item.id}`}>
                  <Eye className="h-3 w-3" />
                  {formatNumber(item.viewsCount)}
                </span>
                <span className="flex items-center gap-1" data-testid={`text-comments-${item.id}`}>
                  <MessageSquare className="h-3 w-3" />
                  {formatNumber(item.commentsCount)}
                </span>
              </div>
            </div>

            {item.imageUrl && (
              <div className="relative flex-shrink-0 w-20 h-16 sm:w-24 sm:h-20 rounded-lg overflow-hidden self-center">
                <OptimizedImage
                  src={item.imageUrl}
                  alt={item.title}
                  className="w-full h-full object-cover rounded-lg transition-transform duration-500 group-hover:scale-110"
                  wrapperClassName="w-full h-full"
                  priority={false}
                  objectPosition={getObjectPosition(item)}
                />
              </div>
            )}
          </div>
        </div>
      </article>
    </Link>
  );
}

// Header chip that introduces each time bucket; its marker sits on the spine.
function TimelineGroupHeader({ label, count, icon: Icon }: { label: string; count: number; icon: typeof Radio }) {
  return (
    <div className="relative mb-2.5" data-testid={`group-header-${label}`}>
      <span className="absolute top-1/2 -translate-y-1/2 right-[4px] z-[1] h-6 w-6 rounded-full bg-background ring-4 ring-background flex items-center justify-center">
        <Icon className="h-3.5 w-3.5 text-primary" />
      </span>
      <div className="inline-flex items-center gap-2 mr-9 rounded-lg border border-border/70 bg-card px-3 py-1.5 text-xs sm:text-sm font-bold shadow-sm">
        {label}
        <span className="text-muted-foreground font-medium">({count})</span>
      </div>
    </div>
  );
}

function TimelineSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="relative pr-7 sm:pr-8" data-testid="skeleton-loading">
      <div className="mbm-spine pointer-events-none absolute top-2 bottom-0 right-[15px] w-0.5" />
      <div className="space-y-3 sm:space-y-4">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="relative">
            <span className="absolute top-4 right-[10px] z-[1] h-3 w-3 rounded-full ring-[3px] ring-background bg-muted" />
            <div className="rounded-xl bg-card border border-border/70 shadow-sm p-3">
              <div className="flex items-center gap-2 mb-2">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-16 rounded-full" />
                <Skeleton className="h-3 w-20 mr-auto" />
              </div>
              <div className="flex gap-4">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-4 w-4/5" />
                  <div className="flex gap-3 pt-1">
                    <Skeleton className="h-5 w-14 rounded-full" />
                    <Skeleton className="h-5 w-14 rounded-full" />
                  </div>
                </div>
                <Skeleton className="w-20 h-16 sm:w-24 sm:h-20 rounded-lg shrink-0" />
              </div>
            </div>
          </div>
        ))}
      </div>
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
      <div className="container max-w-7xl px-4 sm:px-6 lg:px-8">
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

  const { data: user } = useQuery<{
    id: string;
    name?: string;
    email?: string;
    role?: string;
    profileImageUrl?: string | null;
    permissions?: string[];
  }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });
  
  const [filter, setFilter] = useState<"all" | "breaking">("all");
  const [timeRange, setTimeRange] = useState<TimeRange>("today");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const { data: categoriesDataRaw } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    queryFn: () => apiRequest<Category[]>("/api/categories"),
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

      return apiRequest<LiveUpdatesResponse>(`/api/live/updates?${params}`);
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

  // Group the visible updates into time buckets for the live-blog spine.
  const timelineGroups = useMemo(() => {
    const byBucket = new Map<BucketKey, LiveUpdate[]>();
    for (const item of filteredItems) {
      const key = getBucketKey(item.publishedAt);
      const arr = byBucket.get(key);
      if (arr) arr.push(item);
      else byBucket.set(key, [item]);
    }
    return BUCKET_META
      .map((meta) => ({ ...meta, items: byBucket.get(meta.key) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [filteredItems]);

  // "New updates" live pill — counts items that arrived ahead of the newest
  // one the reader has acknowledged, so polling never silently reshuffles the
  // feed under them (a classic live-blog pattern).
  const [seenTopId, setSeenTopId] = useState<string | null>(null);
  // Hide the sticky filter chrome while the reader scrolls down the feed;
  // bring it back on scroll-up so filters stay one gesture away.
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const lastScrollY = useRef(0);

  // Reset the watermark whenever the breaking/all filter flips (new dataset).
  useEffect(() => {
    setSeenTopId(null);
  }, [filter]);

  useEffect(() => {
    if (seenTopId === null && allItems.length > 0) {
      setSeenTopId(allItems[0].id);
    }
  }, [allItems, seenTopId]);

  useEffect(() => {
    lastScrollY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastScrollY.current;
      if (Math.abs(delta) < 8) return;
      if (y < 64) {
        setFiltersCollapsed(false);
      } else if (delta > 0) {
        setFiltersCollapsed(true);
      } else {
        setFiltersCollapsed(false);
      }
      lastScrollY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const newCount = useMemo(() => {
    if (!seenTopId) return 0;
    const idx = allItems.findIndex((i) => i.id === seenTopId);
    return idx > 0 ? idx : 0;
  }, [allItems, seenTopId]);

  const revealNewUpdates = () => {
    if (allItems.length > 0) setSeenTopId(allItems[0].id);
    setFiltersCollapsed(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleManualRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/live/updates"] });
    queryClient.invalidateQueries({ queryKey: ["/api/live/breaking"] });
    refetch();
  };

  useEffect(() => {
    const updateTime = () => {
      setLastUpdate(formatTime(new Date()));
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
    <div className="min-h-screen bg-background flex flex-col" dir="rtl" data-testid="page-moment-by-moment">
      <Header user={user} />

      <main className="flex-1">
        {/* Official Sabq editorial heading: same shell and width as news pages.
            Red is reserved for live state; brand blue anchors the section. */}
        <section className="border-b border-[#e3ebf2] bg-[#f4f8fb] text-[#10202e] dark:border-border dark:bg-[#171e29] dark:text-foreground" data-testid="header-hero">
          <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-10">
            <nav className="flex items-center gap-2 mb-4 text-xs text-[#6b7c8a] dark:text-muted-foreground" aria-label="مسار الصفحة">
              <Link href="/" className="inline-flex items-center gap-1.5 hover:text-primary transition-colors" data-testid="link-home">
                <Home className="h-3.5 w-3.5" />
                الرئيسية
              </Link>
              <ChevronRight className="h-3.5 w-3.5 rotate-180" />
              <span className="text-foreground font-medium">لحظة بلحظة</span>
            </nav>

            <div className="flex items-center justify-between gap-6">
              <div className="flex items-start gap-3 sm:gap-4">
                <span className="w-1.5 h-14 sm:h-16 rounded-full bg-primary shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-xs sm:text-sm font-bold text-primary mb-1">مركز سبق المباشر</p>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight" data-testid="text-page-title">
                      لحظة بلحظة
                    </h1>
                    <Badge variant="destructive" className="gap-1.5 px-2 py-0.5" data-testid="badge-live">
                      <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                      مباشر
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-sm text-[#6b7c8a] dark:text-muted-foreground" data-testid="text-page-subtitle">
                    متابعة فورية لأهم الأخبار العاجلة والتحديثات من غرفة أخبار سبق
                  </p>
                </div>
              </div>

              {lastUpdate && (
                <div className="hidden md:flex items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-2 text-xs text-muted-foreground">
                  <RefreshCw className="h-3.5 w-3.5 text-primary" />
                  آخر تحديث {lastUpdate}
                </div>
              )}
            </div>
          </div>
        </section>

        <BreakingTicker items={breakingNews} />

        {/* Standard Sabq content width and two-column editorial grid. */}
        <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-7">
        {/* DMS Leaderboard (full width) */}
        <DmsLeaderboardAd />

        {/* Statistics Section - Compact on mobile */}
        <section className="mb-4 sm:mb-5" data-testid="section-statistics">
          {isLoading ? (
            <StatisticsSkeleton />
          ) : (
            <StatisticsCards items={allItems} />
          )}
        </section>

        {/* Two-column layout: live feed (right) + sidebar (left) in RTL */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6">
          {/* MAIN — live feed, occupies the right side of the page */}
          <main data-testid="main-content">
            {/* Enhanced Sticky Filter Bar - Compact on mobile; collapses on scroll-down */}
            <div
              className={`sticky top-16 z-20 overflow-hidden transition-all duration-300 ease-out ${
                filtersCollapsed
                  ? "max-h-0 opacity-0 -translate-y-2 mb-0 pointer-events-none"
                  : "max-h-48 opacity-100 translate-y-0 mb-4"
              }`}
              data-testid="header-status-bar"
              aria-hidden={filtersCollapsed}
            >
              <div className="rounded-xl bg-card/95 backdrop-blur-sm border border-border/70 shadow-sm p-3">
              {/* Status Row - Ultra compact on mobile */}
              <div className="flex items-center justify-between gap-2 sm:gap-4 flex-wrap mb-2.5">
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
              <div className="flex flex-wrap items-center gap-2">
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

            {/* "New updates" live pill */}
            {newCount > 0 && (
              <div className={`sticky z-30 flex justify-center pointer-events-none mb-3 transition-[top] duration-300 ${filtersCollapsed ? "top-20" : "top-36"}`}>
                <button
                  onClick={revealNewUpdates}
                  className="mbm-enter pointer-events-auto flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2 text-xs sm:text-sm font-semibold shadow-lg hover:brightness-110 transition"
                  data-testid="button-new-updates"
                >
                  <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                  {newCount} تحديث جديد · اضغط للعرض
                  <ChevronUp className="h-4 w-4" />
                </button>
              </div>
            )}

            {isLoading && <TimelineSkeleton count={8} />}

            {!isLoading && filteredItems.length === 0 && <EmptyState />}

            {!isLoading && timelineGroups.length > 0 && (
              <div className="space-y-5" data-testid="list-news">
                {(() => {
                  let globalIndex = -1;
                  return timelineGroups.map((group) => (
                    <section key={group.key} className="relative pr-7" data-testid={`group-${group.key}`}>
                      {/* Continuous spine for this time bucket */}
                      <div className="mbm-spine pointer-events-none absolute top-7 bottom-0 right-[15px] w-0.5" />
                      <TimelineGroupHeader label={group.label} count={group.items.length} icon={group.icon} />
                      <div className="space-y-3">
                        {group.items.map((item) => {
                          globalIndex += 1;
                          const showAd = (globalIndex + 1) % 6 === 0;
                          return (
                            <Fragment key={item.id}>
                              <TimelineEntry item={item} />
                              {showAd && (
                                <div className="pr-0">
                                  <DmsMpuAd id={`MPU-mbm-${Math.floor(globalIndex / 6)}`} lazyLoad={true} />
                                </div>
                              )}
                            </Fragment>
                          );
                        })}
                      </div>
                    </section>
                  ));
                })()}
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

          {/* SIDEBAR — secondary content, occupies the left side of the page */}
          <aside className="mt-6 lg:mt-0" data-testid="sidebar">
            <div className="lg:sticky lg:top-20 space-y-4 sm:space-y-6">
              {/* MPU ad (moved out of the main feed top into the sidebar) */}
              <DmsMpuAd />

              {/* Breaking highlights */}
              {breakingNews.length > 0 && (
                <div className="rounded-xl bg-card border border-border/50 shadow-[0_1px_3px_rgba(0,0,0,0.05)] p-4" data-testid="sidebar-breaking">
                  <h2 className="flex items-center gap-2 text-sm font-bold mb-3">
                    <span className="relative flex h-2 w-2">
                      <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
                      <span className="absolute inset-0 h-2 w-2 rounded-full bg-destructive live-pulse-ring" />
                    </span>
                    أبرز العاجل
                  </h2>
                  <ul className="space-y-3">
                    {breakingNews.slice(0, 6).map((item) => (
                      <li key={item.id} className="border-b border-border/40 last:border-0 pb-3 last:pb-0">
                        <Link
                          href={`/article/${item.englishSlug || item.slug}`}
                          className="block text-xs sm:text-sm leading-relaxed text-foreground hover:text-destructive transition-colors line-clamp-2"
                          data-testid={`sidebar-breaking-${item.id}`}
                        >
                          {item.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
      </main>

      <Footer />
    </div>
  );
}
