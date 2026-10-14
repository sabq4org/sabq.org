import { useEffect, useRef, useState, useMemo, Fragment, type CSSProperties, type MouseEvent } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAnalyticsPageMetadata } from "@/hooks/use-analytics";
import {
  formatDistanceToNow,
  parseISO,
  startOfDay,
  subDays,
  subHours,
  differenceInMinutes,
  isToday,
  isYesterday,
} from "date-fns";
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
  Search,
  X,
  Bookmark,
  Share2,
  BookOpen,
  LayoutList,
  Rows3,
  Flame,
  ArrowUpRight,
  Pause,
  Play,
  Check,
  ChevronLeft,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatTime, formatNumber } from "@/lib/format";
import { DmsLeaderboardAd, DmsMpuAd, useAdTracking } from "@/components/DmsAdSlot";
import { OptimizedImage } from "@/components/OptimizedImage";
import { getObjectPosition } from "@/lib/imageUtils";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useToast } from "@/hooks/use-toast";
import { transformArticleHtml } from "@/lib/legacyHtmlTransformer";
import DOMPurify from "isomorphic-dompurify";
import type { ArticleWithDetails } from "@shared/schema";

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
type FeedDensity = "detailed" | "compact";

const SAVED_LIVE_STORAGE_KEY = "sabq:live:saved-ids";

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
    return differenceInMinutes(now, date) <= 10;
  } catch {
    return false;
  }
}

// Exact clock time (e.g. 12:45 م) shown on each timeline node. Routes through
// the shared formatTime helper so digits stay Latin (the app-wide contract in
// lib/format.ts).
function formatClock(dateString: string): string {
  try {
    return formatTime(parseISO(dateString));
  } catch {
    return "";
  }
}

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

const BUCKET_META: { key: BucketKey; label: string; subtitle: string; icon: typeof Radio }[] = [
  { key: "now", label: "الآن", subtitle: "آخر 15 دقيقة", icon: Radio },
  { key: "hour", label: "آخر ساعة", subtitle: "خلال 60 دقيقة", icon: Zap },
  { key: "today", label: "اليوم", subtitle: "تغطية اليوم", icon: Activity },
  { key: "yesterday", label: "الأمس", subtitle: "تغطية الأمس", icon: Clock },
  { key: "older", label: "أقدم", subtitle: "الأيام السابقة", icon: Clock },
];

function resolveCategoryColor(raw?: string | null): string {
  if (!raw) return "hsl(var(--primary))";
  const v = raw.trim();
  if (!v) return "hsl(var(--primary))";
  return v;
}

function cleanLiveSummary(raw?: string | null): string {
  if (!raw) return "";
  return raw
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
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
  onSelectCategory?: (categoryId: string) => void;
}

function StatisticsCards({ items, onSelectCategory }: StatisticsCardsProps) {
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
    const totalViews = items.reduce((sum, item) => sum + (item.viewsCount || 0), 0);

    const categoryMap = new Map<string, { id: string; nameAr: string; count: number }>();
    for (const item of items) {
      const existing = categoryMap.get(item.categoryNameAr);
      if (existing) {
        existing.count += 1;
      } else {
        categoryMap.set(item.categoryNameAr, {
          id: item.categoryId,
          nameAr: item.categoryNameAr,
          count: 1,
        });
      }
    }

    const mostActiveCategory = Array.from(categoryMap.values()).sort(
      (a, b) => b.count - a.count
    )[0];

    let avgFrequency = 0;
    if (todayUpdates.length > 1) {
      const sortedUpdates = [...todayUpdates].sort(
        (a, b) => parseISO(b.publishedAt).getTime() - parseISO(a.publishedAt).getTime()
      );
      const totalMinutes = differenceInMinutes(
        parseISO(sortedUpdates[0].publishedAt),
        parseISO(sortedUpdates[sortedUpdates.length - 1].publishedAt)
      );
      avgFrequency = Math.max(1, Math.round(totalMinutes / (todayUpdates.length - 1)));
    }

    const newestMinutesAgo = items[0]?.publishedAt
      ? Math.max(0, differenceInMinutes(now, parseISO(items[0].publishedAt)))
      : null;

    return {
      todayTotal: todayUpdates.length || items.length,
      breakingCount,
      totalViews,
      mostActiveCategory: mostActiveCategory ? mostActiveCategory.nameAr : "لا يوجد",
      mostActiveCategoryId: mostActiveCategory?.id || "",
      mostActiveCategoryCount: mostActiveCategory?.count || 0,
      avgFrequency,
      newestMinutesAgo,
    };
  }, [items]);

  const statCards = [
    {
      id: "today-updates",
      label: "التحديثات المرصودة",
      value: statistics.todayTotal,
      unit:
        statistics.newestMinutesAgo !== null
          ? statistics.newestMinutesAgo <= 1
            ? "آخر خبر: الآن"
            : `آخر خبر منذ ${statistics.newestMinutesAgo} د`
          : "تحديث مباشر",
      icon: Activity,
      iconBg: "bg-primary/15",
      iconColor: "text-primary",
    },
    {
      id: "breaking-count",
      label: statistics.breakingCount > 0 ? "أخبار عاجلة" : "قراءات البث المباشر",
      value:
        statistics.breakingCount > 0
          ? statistics.breakingCount
          : formatNumber(statistics.totalViews),
      unit: statistics.breakingCount > 0 ? "خبر عاجل نشط" : "مشاهدة للتحديثات",
      icon: statistics.breakingCount > 0 ? Zap : Eye,
      iconBg: statistics.breakingCount > 0 ? "bg-destructive/15" : "bg-emerald-500/15",
      iconColor: statistics.breakingCount > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400",
    },
    {
      id: "active-category",
      label: "الأكثر نشاطاً",
      value: statistics.mostActiveCategory,
      unit:
        statistics.mostActiveCategoryCount > 0
          ? `${statistics.mostActiveCategoryCount} أخبار في البث`
          : "تصنيف",
      icon: BarChart3,
      iconBg: "bg-purple-500/15",
      iconColor: "text-purple-600 dark:text-purple-400",
      isText: true,
      onClick:
        statistics.mostActiveCategoryId && onSelectCategory
          ? () => onSelectCategory(statistics.mostActiveCategoryId)
          : undefined,
    },
    {
      id: "avg-frequency",
      label: "إيقاع النشر",
      value: statistics.avgFrequency > 0 ? `${statistics.avgFrequency}` : "—",
      unit: statistics.avgFrequency > 0 ? "دقيقة بين كل خبرين" : "غير متوفر",
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
          onClick={stat.onClick}
          className={`bg-card rounded-xl border border-border/70 px-3 py-2.5 sm:px-4 sm:py-3 shadow-sm transition-all ${
            stat.onClick ? "cursor-pointer hover:border-primary/40 hover:shadow-md" : ""
          }`}
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
  isFirst?: boolean;
  density: FeedDensity;
  isSaved: boolean;
  onQuickRead: (item: LiveUpdate) => void;
  onToggleSave: (id: string) => void;
  onSelectCategory: (categoryId: string) => void;
}

function TimelineEntry({
  item,
  isFirst = false,
  density,
  isSaved,
  onQuickRead,
  onToggleSave,
  onSelectCategory,
}: TimelineEntryProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const isNew = isNewUpdate(item.publishedAt);
  const categoryColor = resolveCategoryColor(item.categoryColor);
  const nodeColor = item.isBreaking
    ? "hsl(var(--destructive))"
    : isFirst || isNew
      ? "hsl(var(--primary))"
      : categoryColor;
  const accent = isFirst || isNew || item.isBreaking;
  const cleanedSummary = useMemo(() => cleanLiveSummary(item.summary), [item.summary]);
  const articleHref = `/article/${item.englishSlug || item.slug}`;

  const handleQuickReadClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onQuickRead(item);
  };

  const handleBookmarkClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleSave(item.id);
  };

  const handleCategoryClick = (e: MouseEvent) => {
    if (!item.categoryId) return;
    e.preventDefault();
    e.stopPropagation();
    onSelectCategory(item.categoryId);
  };

  const handleShareClick = async (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const fullUrl = `${window.location.origin}${articleHref}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: item.title,
          url: fullUrl,
        });
        return;
      } catch {
        // Fallback to clipboard copy
      }
    }
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      toast({
        title: "تم نسخ رابط الخبر",
        description: "يمكنك الآن مشاركة الرابط مباشرة",
      });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ignore
    }
  };

  if (density === "compact") {
    return (
      <Link
        href={articleHref}
        className="block mbm-enter"
        data-testid={`link-article-${item.id}`}
      >
        <article className="relative group" data-testid={`card-news-${item.id}`}>
          <span
            className={`absolute top-1/2 -translate-y-1/2 -right-[17px] z-[1] h-2.5 w-2.5 rounded-full ring-[3px] ring-background ${accent ? "mbm-node-pulse" : ""}`}
            style={{ backgroundColor: nodeColor, "--mbm-dot": nodeColor } as CSSProperties}
            aria-hidden="true"
            data-testid={`node-${item.id}`}
          />
          <div
            className={`rounded-xl bg-card border transition-all duration-200 px-3 py-2.5 flex items-center justify-between gap-3 ${
              item.isBreaking
                ? "border-destructive/40 bg-destructive/[0.03]"
                : isFirst
                  ? "border-primary/40 bg-primary/[0.02]"
                  : "border-border/70 hover:border-primary/35"
            }`}
          >
            <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap sm:flex-nowrap">
              <span
                className="inline-flex items-center gap-1 text-[11px] font-bold tabular-nums text-primary shrink-0"
                data-testid={`text-clock-${item.id}`}
              >
                {formatClock(item.publishedAt)}
              </span>

              <span
                onClick={handleCategoryClick}
                className="public-label text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-foreground/80 shrink-0 cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors"
                style={{ borderRight: `3px solid ${categoryColor}` }}
                data-testid={`badge-category-${item.id}`}
              >
                {item.categoryNameAr}
              </span>

              {item.isBreaking && (
                <Badge variant="destructive" className="public-label text-[10px] gap-0.5 px-1.5 py-0 h-4 shrink-0" data-testid={`badge-breaking-${item.id}`}>
                  <Zap className="h-2.5 w-2.5" />
                  عاجل
                </Badge>
              )}

              {isNew && (
                <Badge className="text-[10px] bg-emerald-600 text-white border-0 gap-0.5 px-1.5 py-0 h-4 shrink-0" data-testid={`badge-new-${item.id}`}>
                  جديد
                </Badge>
              )}

              <h3
                className="public-card-title font-bold text-xs sm:text-sm text-foreground group-hover:text-primary transition-colors line-clamp-1 flex-1 min-w-0"
                data-testid={`text-title-${item.id}`}
              >
                {item.title}
              </h3>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="hidden md:inline text-[11px] text-muted-foreground" data-testid={`text-time-${item.id}`}>
                {formatRelativeTime(item.publishedAt)}
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-muted-foreground" data-testid={`text-views-${item.id}`}>
                <Eye className="h-3 w-3" />
                {formatNumber(item.viewsCount)}
              </span>
              <span className="hidden" data-testid={`text-comments-${item.id}`}>
                {formatNumber(item.commentsCount)}
              </span>
              <button
                type="button"
                onClick={handleQuickReadClick}
                className="no-min-touch-size inline-flex h-7 items-center gap-1 rounded-lg border border-border/70 bg-muted/50 px-2 py-0.5 text-[11px] font-semibold text-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors"
                title="معاينة سريعة دون مغادرة البث"
                data-testid={`button-quick-read-${item.id}`}
              >
                <BookOpen className="h-3 w-3" />
                <span className="hidden sm:inline">معاينة</span>
              </button>
            </div>
          </div>
        </article>
      </Link>
    );
  }

  return (
    <Link
      href={articleHref}
      className="block mbm-enter"
      data-testid={`link-article-${item.id}`}
    >
      <article className="relative group" data-testid={`card-news-${item.id}`}>
        {/* Timeline node — centred on the parent spine (right gutter, RTL) */}
        <span
          className={`absolute top-4 -right-[18px] z-[1] h-3 w-3 rounded-full ring-[3px] ring-background ${accent ? "mbm-node-pulse" : ""}`}
          style={{ backgroundColor: nodeColor, "--mbm-dot": nodeColor } as CSSProperties}
          aria-hidden="true"
          data-testid={`node-${item.id}`}
        />

        <div
          className={`rounded-xl bg-card border shadow-sm hover:shadow-md transition-all duration-300 p-3 sm:p-4 ${
            item.isBreaking
              ? "border-destructive/45 bg-gradient-to-l from-destructive/[0.04] to-transparent"
              : isFirst
                ? "border-primary/40 bg-gradient-to-l from-primary/[0.03] to-transparent"
                : "border-border/70 hover:border-primary/35"
          }`}
        >
          {/* Meta row: clock + category + state badges */}
          <div className="flex items-center gap-1.5 sm:gap-2 mb-2 flex-wrap">
            <span
              className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] sm:text-xs font-bold tabular-nums text-primary"
              data-testid={`text-clock-${item.id}`}
            >
              <Clock className="h-3 w-3" />
              {formatClock(item.publishedAt)}
            </span>

            <span
              onClick={handleCategoryClick}
              className="public-label text-[10px] sm:text-[11px] font-semibold px-2 py-0.5 rounded bg-muted text-foreground/80 cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors"
              style={{ borderRight: `3px solid ${categoryColor}` }}
              title={`تصفية حسب ${item.categoryNameAr}`}
              data-testid={`badge-category-${item.id}`}
            >
              {item.categoryNameAr}
            </span>

            {isFirst && !item.isBreaking && (
              <Badge variant="secondary" className="text-[10px] bg-primary/15 text-primary border-0 gap-1 px-2 py-0 h-5">
                <Sparkles className="h-2.5 w-2.5" />
                أحدث التطورات
              </Badge>
            )}

            {item.isBreaking && (
              <Badge variant="destructive" className="public-label text-[10px] gap-0.5 shadow-sm px-2 py-0 h-5" data-testid={`badge-breaking-${item.id}`}>
                <Zap className="h-2.5 w-2.5" />
                عاجل
              </Badge>
            )}
            {isNew && (
              <Badge className="text-[10px] bg-emerald-600 text-white border-0 shadow-sm gap-0.5 px-2 py-0 h-5" data-testid={`badge-new-${item.id}`}>
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
              <h3
                className="public-card-title font-bold text-sm sm:text-base md:text-[17px] mb-1.5 line-clamp-2 leading-relaxed text-foreground group-hover:text-primary transition-colors"
                data-testid={`text-title-${item.id}`}
              >
                {item.title}
              </h3>

              {cleanedSummary && (
                <p
                  className="public-card-excerpt text-xs sm:text-[13px] text-foreground/70 line-clamp-2 leading-relaxed mb-2.5"
                  data-testid={`text-summary-${item.id}`}
                >
                  {cleanedSummary}
                </p>
              )}

              {/* Footer stats + Reader Quick Actions */}
              <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-border/50">
                <div className="flex items-center gap-2.5 sm:gap-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1" data-testid={`text-views-${item.id}`}>
                    <Eye className="h-3.5 w-3.5" />
                    {formatNumber(item.viewsCount)}
                  </span>
                  <span className="flex items-center gap-1" data-testid={`text-comments-${item.id}`}>
                    <MessageSquare className="h-3.5 w-3.5" />
                    {formatNumber(item.commentsCount)}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleQuickReadClick}
                    className="no-min-touch-size inline-flex h-7 items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
                    data-testid={`button-quick-read-${item.id}`}
                  >
                    <BookOpen className="h-3 w-3" />
                    <span>قراءة سريعة</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleBookmarkClick}
                    className={`no-min-touch-size inline-flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${
                      isSaved
                        ? "border-primary/40 bg-primary/15 text-primary"
                        : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                    aria-label={isSaved ? "إزالة من المحفوظات" : "حفظ الخبر"}
                    title={isSaved ? "محفوظ في البث" : "حفظ الخبر"}
                    data-testid={`button-bookmark-${item.id}`}
                  >
                    <Bookmark className={`h-3.5 w-3.5 ${isSaved ? "fill-current" : ""}`} />
                  </button>

                  <button
                    type="button"
                    onClick={handleShareClick}
                    className="no-min-touch-size inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    aria-label="نسخ أو مشاركة الرابط"
                    title="مشاركة الخبر"
                    data-testid={`button-share-${item.id}`}
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Share2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {item.imageUrl && (
              <div className="relative flex-shrink-0 w-20 h-20 sm:w-28 sm:h-24 rounded-xl overflow-hidden self-start border border-border/50">
                <OptimizedImage
                  src={item.imageUrl}
                  alt={item.title}
                  className="w-full h-full object-cover rounded-xl transition-transform duration-500 group-hover:scale-105"
                  wrapperClassName="w-full h-full"
                  priority={isFirst}
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
function TimelineGroupHeader({
  label,
  subtitle,
  count,
  icon: Icon,
}: {
  label: string;
  subtitle?: string;
  count: number;
  icon: typeof Radio;
}) {
  return (
    <div className="relative mb-3" data-testid={`group-header-${label}`}>
      <span className="absolute top-1/2 -translate-y-1/2 right-[4px] z-[1] h-6 w-6 rounded-full bg-background ring-4 ring-background flex items-center justify-center">
        <Icon className="h-3.5 w-3.5 text-primary" />
      </span>
      <div className="inline-flex items-center gap-2 mr-9 rounded-xl border border-border/70 bg-card px-3.5 py-1.5 text-xs sm:text-sm font-bold shadow-sm">
        <span>{label}</span>
        {subtitle && (
          <span className="hidden sm:inline text-[11px] font-normal text-muted-foreground">
            · {subtitle}
          </span>
        )}
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary font-bold">
          {count}
        </span>
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
            <span className="absolute top-4 -right-[18px] z-[1] h-3 w-3 rounded-full ring-[3px] ring-background bg-muted" />
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

function EmptyState({
  hasActiveFilters,
  onResetFilters,
}: {
  hasActiveFilters?: boolean;
  onResetFilters?: () => void;
}) {
  return (
    <div className="text-center py-16 px-4 bg-muted/30 rounded-2xl border border-border/70" data-testid="empty-state">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-muted mb-5">
        <Radio className="h-10 w-10 text-muted-foreground" />
      </div>
      <h3 className="text-xl font-bold mb-2">لا توجد أخبار مطابقة حالياً</h3>
      <p className="text-sm text-muted-foreground mb-5 max-w-md mx-auto">
        {hasActiveFilters
          ? "جرّب توسيع الفترة الزمنية إلى «آخر 7 أيام» أو اختيار «كل التصنيفات» لعرض كافة التحديثات."
          : "سنعلمك فور وصول أخبار جديدة من غرفة أخبار سبق."}
      </p>
      {hasActiveFilters && onResetFilters && (
        <Button variant="outline" size="sm" onClick={onResetFilters} className="rounded-full gap-2" data-testid="button-reset-live-filters">
          <RefreshCw className="h-3.5 w-3.5" />
          إعادة ضبط الفلاتر
        </Button>
      )}
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
  useAnalyticsPageMetadata("لحظة بلحظة | سبق");
  useAdTracking("لحظة بلحظة");

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

  const [filter, setFilter] = useState<"all" | "breaking" | "saved">("all");
  const [timeRange, setTimeRange] = useState<TimeRange>("today");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [density, setDensity] = useState<FeedDensity>("detailed");
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [isRefreshingManual, setIsRefreshingManual] = useState<boolean>(false);
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const [filtersCollapsed, setFiltersCollapsed] = useState<boolean>(false);
  const [quickReadItem, setQuickReadItem] = useState<LiveUpdate | null>(null);
  const lastScrollYRef = useRef<number>(0);
  const [savedIds, setSavedIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(SAVED_LIVE_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const toggleSaveItem = (id: string) => {
    setSavedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((item) => item !== id) : [id, ...prev];
      try {
        window.localStorage.setItem(SAVED_LIVE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage error
      }
      return next;
    });
  };

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
    refetchInterval: autoRefresh ? 60000 : false,
  });

  const breakingNews = breakingData?.items || [];

  const apiFilterParam = filter === "breaking" ? "breaking" : "all";

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfiniteQuery<LiveUpdatesResponse>({
    queryKey: ["/api/live/updates", apiFilterParam],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("limit", "20");
      if (apiFilterParam !== "all") {
        params.set("filter", apiFilterParam);
      }
      if (pageParam) {
        params.set("cursor", pageParam as string);
      }

      return apiRequest<LiveUpdatesResponse>(`/api/live/updates?${params}`);
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined,
    refetchInterval: autoRefresh ? 60000 : false,
  });

  const allItems = useMemo(
    () => data?.pages.flatMap((page) => page.items) || [],
    [data?.pages]
  );

  // Fetch full article details on demand when Quick Read modal is open
  const { data: quickReadArticle, isLoading: isLoadingQuickRead } = useQuery<ArticleWithDetails>({
    queryKey: ["/api/articles", quickReadItem?.slug],
    enabled: !!quickReadItem?.slug,
    staleTime: 5 * 60 * 1000,
  });

  const sanitizedQuickReadHtml = useMemo(() => {
    if (!quickReadArticle?.content) return "";
    const sanitized = DOMPurify.sanitize(quickReadArticle.content, {
      ADD_TAGS: ["blockquote", "img", "figure", "figcaption"],
      ADD_ATTR: ["class", "alt", "loading", "src", "target", "rel"],
    });
    return transformArticleHtml(sanitized);
  }, [quickReadArticle?.content]);

  // Compute category distribution across all loaded items for quick pills & sidebar radar
  const categoryBreakdown = useMemo(() => {
    const counts = new Map<
      string,
      { id: string; nameAr: string; color: string; count: number }
    >();
    for (const item of allItems) {
      if (!item.categoryId || !item.categoryNameAr) continue;
      const existing = counts.get(item.categoryId);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(item.categoryId, {
          id: item.categoryId,
          nameAr: item.categoryNameAr,
          color: resolveCategoryColor(item.categoryColor),
          count: 1,
        });
      }
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
  }, [allItems]);

  // Top-read updates in the live stream for the sidebar
  const mostReadLiveItems = useMemo(() => {
    return [...allItems]
      .sort((a, b) => (b.viewsCount || 0) - (a.viewsCount || 0))
      .slice(0, 5);
  }, [allItems]);

  const filteredItems = useMemo(() => {
    let filtered = allItems;
    const now = new Date();

    if (filter === "saved") {
      filtered = filtered.filter((item) => savedIds.includes(item.id));
    } else {
      switch (timeRange) {
        case "1h": {
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
        }
        case "3h": {
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
        }
        case "today": {
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
        }
        case "yesterday": {
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
        }
        case "7d": {
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
      }
    }

    if (categoryFilter !== "all") {
      filtered = filtered.filter((item) => item.categoryId === categoryFilter);
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          (item.summary && item.summary.toLowerCase().includes(q)) ||
          (item.categoryNameAr && item.categoryNameAr.toLowerCase().includes(q))
      );
    }

    return filtered;
  }, [allItems, filter, savedIds, timeRange, categoryFilter, searchQuery]);

  // Auto-load additional pages when a time range (like "yesterday") or category filter
  // needs older items that haven't been fetched yet.
  const loadedPagesCount = data?.pages.length || 0;
  useEffect(() => {
    const needsMoreForFilter =
      (timeRange === "yesterday" || timeRange === "7d" || categoryFilter !== "all" || searchQuery.trim().length > 0) &&
      filteredItems.length < 6;
    if (
      needsMoreForFilter &&
      hasNextPage &&
      !isFetchingNextPage &&
      !isLoading &&
      loadedPagesCount < 6
    ) {
      fetchNextPage();
    }
  }, [
    timeRange,
    categoryFilter,
    searchQuery,
    filteredItems.length,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    loadedPagesCount,
    fetchNextPage,
  ]);

  // Group the visible updates into time buckets for the live-blog spine.
  const timelineGroups = useMemo(() => {
    const byBucket = new Map<BucketKey, LiveUpdate[]>();
    for (const item of filteredItems) {
      const key = getBucketKey(item.publishedAt);
      const arr = byBucket.get(key);
      if (arr) arr.push(item);
      else byBucket.set(key, [item]);
    }
    return BUCKET_META.map((meta) => ({
      ...meta,
      items: byBucket.get(meta.key) ?? [],
    })).filter((g) => g.items.length > 0);
  }, [filteredItems]);

  // "New updates" live pill
  const [seenTopId, setSeenTopId] = useState<string | null>(null);

  useEffect(() => {
    setSeenTopId(null);
  }, [apiFilterParam]);

  useEffect(() => {
    if (seenTopId === null && allItems.length > 0) {
      setSeenTopId(allItems[0].id);
    }
  }, [allItems, seenTopId]);

  useEffect(() => {
    const onScroll = () => {
      const currentY = window.scrollY;
      const delta = currentY - lastScrollYRef.current;
      if (currentY <= 180) {
        setFiltersCollapsed(false);
      } else if (delta > 10 && currentY > 240) {
        setFiltersCollapsed(true);
      } else if (delta < -10) {
        setFiltersCollapsed(false);
      }
      lastScrollYRef.current = currentY;
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
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleManualRefresh = async () => {
    setIsRefreshingManual(true);
    setLastUpdate(formatTime(new Date()));
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/live/updates"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/live/breaking"] }),
      refetch(),
    ]);
    setTimeout(() => setIsRefreshingManual(false), 450);
  };

  const handleResetFilters = () => {
    setFilter("all");
    setTimeRange("7d");
    setCategoryFilter("all");
    setSearchQuery("");
  };

  useEffect(() => {
    const updateTime = () => {
      setLastUpdate(formatTime(new Date()));
    };

    updateTime();

    if (!autoRefresh) return;

    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/live/updates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/live/breaking"] });
      updateTime();
    }, 30000);

    return () => clearInterval(interval);
  }, [autoRefresh]);

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

  // Quick Reader prev/next navigation within filteredItems
  const quickReadIndex = useMemo(() => {
    if (!quickReadItem) return -1;
    return filteredItems.findIndex((item) => item.id === quickReadItem.id);
  }, [quickReadItem, filteredItems]);

  const hasActiveFilters =
    filter !== "all" ||
    timeRange !== "today" ||
    categoryFilter !== "all" ||
    searchQuery.trim().length > 0;

  return (
    <div className="public-page min-h-screen bg-background flex flex-col" dir="rtl" data-testid="page-moment-by-moment">
      <Header user={user} />

      <main className="flex-1">
        {/* Official Sabq editorial heading */}
        <section
          className="public-page-header border-b border-[#e3ebf2] bg-gradient-to-b from-[#f4f8fb] to-background text-[#10202e] dark:border-border dark:from-[#171e29] dark:to-background dark:text-foreground"
          data-testid="header-hero"
        >
          <div className="public-container container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 sm:py-6 lg:py-8">
            <nav className="flex items-center gap-2 mb-2.5 sm:mb-4 text-xs text-[#6b7c8a] dark:text-muted-foreground" aria-label="مسار الصفحة">
              <Link href="/" className="inline-flex items-center gap-1.5 hover:text-primary transition-colors" data-testid="link-home">
                <Home className="h-3.5 w-3.5" />
                الرئيسية
              </Link>
              <ChevronRight className="h-3.5 w-3.5 rotate-180" />
              <span className="text-foreground font-medium">لحظة بلحظة</span>
            </nav>

            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 sm:gap-5">
              <div className="flex items-start gap-2.5 sm:gap-4">
                <span className="w-1.5 h-11 sm:h-16 rounded-full bg-primary shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-[11px] sm:text-sm font-bold text-primary mb-0.5 sm:mb-1">مركز سبق للتغطية الحية</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="public-page-title text-xl sm:text-3xl md:text-4xl font-black tracking-tight" data-testid="text-page-title">
                      لحظة بلحظة
                    </h1>
                    <Badge variant="destructive" className="gap-1.5 px-2 py-0.5 text-[11px] sm:text-xs" data-testid="badge-live">
                      <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                      مباشر
                    </Badge>
                  </div>
                  <p className="public-page-description mt-1 text-xs sm:text-sm text-[#6b7c8a] dark:text-muted-foreground max-w-2xl line-clamp-2 sm:line-clamp-none" data-testid="text-page-subtitle">
                    متابعة فورية لأهم الأخبار العاجلة والتحديثات من غرفة أخبار سبق — اضغط «قراءة سريعة» على أي خبر لاستعراضه كاملاً دون مغادرة البث
                  </p>
                </div>
              </div>

              {/* Live Room Controls: Auto-refresh toggle + Density Switcher */}
              <div className="flex items-center justify-between sm:justify-start gap-2 overflow-x-auto no-scrollbar">
                {/* Density Switcher */}
                <div
                  className="inline-flex items-center rounded-xl border border-border/80 bg-card p-0.5 sm:p-1 shadow-sm shrink-0"
                  role="group"
                  aria-label="نمط عرض البث"
                >
                  <button
                    type="button"
                    onClick={() => setDensity("detailed")}
                    className={`no-min-touch-size inline-flex h-7 sm:h-8 items-center gap-1 rounded-lg px-2 sm:px-2.5 text-[11px] sm:text-xs font-bold transition-colors ${
                      density === "detailed"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    aria-pressed={density === "detailed"}
                    data-testid="button-density-detailed"
                  >
                    <Rows3 className="h-3.5 w-3.5 shrink-0" />
                    <span>بطاقات مفصّلة</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDensity("compact")}
                    className={`no-min-touch-size inline-flex h-7 sm:h-8 items-center gap-1 rounded-lg px-2 sm:px-2.5 text-[11px] sm:text-xs font-bold transition-colors ${
                      density === "compact"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    aria-pressed={density === "compact"}
                    data-testid="button-density-compact"
                  >
                    <LayoutList className="h-3.5 w-3.5 shrink-0" />
                    <span>برقيات سريعة</span>
                  </button>
                </div>

                {/* Auto-refresh status toggle */}
                <button
                  type="button"
                  onClick={() => setAutoRefresh((prev) => !prev)}
                  className={`no-min-touch-size inline-flex h-8 sm:h-9 items-center gap-1.5 rounded-xl border px-2.5 sm:px-3 text-[11px] sm:text-xs font-semibold transition-colors shrink-0 ${
                    autoRefresh
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border-border/80 bg-card text-muted-foreground hover:text-foreground"
                  }`}
                  aria-pressed={autoRefresh}
                  title={autoRefresh ? "إيقاف التحديث التلقائي" : "تفعيل التحديث التلقائي كل 30 ثانية"}
                  data-testid="button-toggle-autorefresh"
                >
                  {autoRefresh ? (
                    <Pause className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <Play className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="sm:hidden">{autoRefresh ? "تلقائي: مفعّل" : "تلقائي: متوقف"}</span>
                  <span className="hidden sm:inline">{autoRefresh ? "تحديث تلقائي: مفعّل" : "تحديث تلقائي: متوقف"}</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        <BreakingTicker items={breakingNews} />

        {/* Standard Sabq content width and two-column editorial grid */}
        <div className="public-container container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-7">
          {/* DMS Leaderboard (full width) */}
          <DmsLeaderboardAd />

          {/* Statistics Section */}
          <section className="mb-3 sm:mb-6" data-testid="section-statistics">
            {isLoading ? (
              <StatisticsSkeleton />
            ) : (
              <StatisticsCards
                items={allItems}
                onSelectCategory={(catId) =>
                  setCategoryFilter((prev) => (prev === catId ? "all" : catId))
                }
              />
            )}
          </section>

          {/* Two-column layout: live feed (right) + sidebar (left) in RTL */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-7">
            {/* MAIN — live feed */}
            <main data-testid="main-content" className="min-w-0">
              {/* Sticky Filter & Search Command Bar — ultra-compact on mobile with scroll-down collapse */}
              <div
                className="sticky top-14 sm:top-16 z-20 mb-3 sm:mb-4"
                data-testid="header-status-bar"
              >
                <div className="public-card rounded-xl sm:rounded-2xl bg-card/95 backdrop-blur-md border border-border/80 shadow-sm px-2.5 py-2 sm:p-3.5 space-y-2">
                  {/* Top Row: Single non-wrapping row on mobile (Live + Count + Inline Search + Refresh) */}
                  <div className="flex items-center justify-between gap-1.5 sm:gap-2.5 flex-nowrap">
                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                      {/* Live Indicator with Pulse Ring */}
                      <div className="flex items-center gap-1.5 bg-destructive/10 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full">
                        <div className="relative">
                          <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" data-testid="indicator-live" />
                          <div className="absolute inset-0 h-2 w-2 rounded-full bg-destructive live-pulse-ring" />
                        </div>
                        <span className="text-[11px] sm:text-xs font-bold text-destructive" data-testid="text-live">مباشر</span>
                      </div>

                      {lastUpdate && (
                        <Badge variant="outline" className="hidden md:inline-flex text-xs gap-1 px-2 py-0.5" data-testid="badge-last-update">
                          <Clock className="h-3 w-3 text-primary" />
                          <span>آخر تحديث:</span> {lastUpdate}
                        </Badge>
                      )}

                      <Badge variant="secondary" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 tabular-nums" data-testid="badge-items-count">
                        {filteredItems.length} <span className="hidden sm:inline">تحديث</span>
                      </Badge>
                    </div>

                    {/* Search in Live Stream + Mobile Expand Filters + Refresh Button */}
                    <div className="flex items-center gap-1.5 flex-1 justify-end min-w-0">
                      <div className="relative flex-1 max-w-[185px] sm:max-w-[230px]">
                        <Search className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <Input
                          type="search"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="ابحث في البث..."
                          className="h-7 sm:h-8 pr-7 pl-6 text-[11px] sm:text-xs rounded-full bg-muted/50 border-border/70"
                          data-testid="input-live-search"
                        />
                        {searchQuery && (
                          <button
                            type="button"
                            onClick={() => setSearchQuery("")}
                            className="no-min-touch-size absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            aria-label="مسح البحث"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>

                      {filtersCollapsed && (
                        <button
                          type="button"
                          onClick={() => setFiltersCollapsed(false)}
                          className="no-min-touch-size sm:hidden inline-flex h-7 items-center gap-1 rounded-full border border-border/70 bg-muted/60 px-2 text-[10px] font-semibold text-foreground shrink-0"
                          aria-label="إظهار فلاتر البث"
                        >
                          <span>الفلاتر</span>
                          {hasActiveFilters && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                        </button>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleManualRefresh}
                        disabled={isRefreshingManual}
                        className="no-min-touch-size gap-1.5 h-7 w-7 sm:h-8 sm:w-auto p-0 sm:px-3 text-xs rounded-full shrink-0"
                        aria-label="تحديث البث المباشر"
                        data-testid="button-refresh"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${isRefreshingManual ? "animate-spin text-primary" : ""}`} />
                        <span className="hidden sm:inline">تحديث</span>
                      </Button>
                    </div>
                  </div>

                  {/* Second Row: Single-line horizontally scrollable filter strip on mobile, auto-collapses on scroll-down */}
                  <div
                    className={`${
                      filtersCollapsed ? "hidden sm:flex" : "flex"
                    } items-center gap-1.5 overflow-x-auto no-scrollbar flex-nowrap sm:flex-wrap`}
                  >
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setFilter("all")}
                        className={`no-min-touch-size h-7 px-2.5 rounded-full text-[11px] sm:text-xs font-semibold transition-all shrink-0 ${
                          filter === "all"
                            ? "filter-pill-active"
                            : "bg-muted/60 text-foreground hover-elevate"
                        }`}
                        data-testid="button-filter-all"
                      >
                        الكل
                      </button>
                      <button
                        type="button"
                        onClick={() => setFilter("breaking")}
                        className={`no-min-touch-size h-7 px-2.5 rounded-full text-[11px] sm:text-xs font-semibold transition-all inline-flex items-center gap-1 shrink-0 ${
                          filter === "breaking"
                            ? "filter-pill-breaking-active"
                            : "bg-muted/60 text-foreground hover-elevate"
                        }`}
                        data-testid="button-filter-breaking"
                      >
                        <Zap className="h-3 w-3" />
                        عاجل
                      </button>
                      <button
                        type="button"
                        onClick={() => setFilter("saved")}
                        className={`no-min-touch-size h-7 px-2.5 rounded-full text-[11px] sm:text-xs font-semibold transition-all inline-flex items-center gap-1 shrink-0 ${
                          filter === "saved"
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "bg-muted/60 text-foreground hover-elevate"
                        }`}
                        data-testid="button-filter-saved"
                      >
                        <Bookmark className="h-3 w-3" />
                        <span>محفوظاتي</span>
                        {savedIds.length > 0 && (
                          <span className="rounded-full bg-background/20 px-1.5 text-[10px]">
                            {savedIds.length}
                          </span>
                        )}
                      </button>
                    </div>

                    <div className="h-4 w-px bg-border shrink-0" />

                    {/* Time Range Select */}
                    <Select value={timeRange} onValueChange={(value: TimeRange) => setTimeRange(value)}>
                      <SelectTrigger className="no-min-touch-size shrink-0 w-[96px] sm:w-[135px] h-7 sm:h-8 rounded-full bg-muted/60 text-[11px] sm:text-xs px-2.5" data-testid="select-time-range">
                        <Clock className="h-3 w-3 ml-1 text-primary shrink-0" />
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

                    {/* Category Select */}
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger className="no-min-touch-size shrink-0 w-[112px] sm:w-[155px] h-7 sm:h-8 rounded-full bg-muted/60 text-[11px] sm:text-xs px-2.5" data-testid="select-category">
                        <FolderOpen className="h-3 w-3 ml-1 text-primary shrink-0" />
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

                    {/* Quick Category Chips from Live Stream */}
                    {categoryBreakdown.length > 1 && (
                      <div className="hidden xl:flex items-center gap-1.5 mr-auto overflow-x-auto">
                        {categoryBreakdown.slice(0, 4).map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() =>
                              setCategoryFilter((prev) => (prev === cat.id ? "all" : cat.id))
                            }
                            className={`no-min-touch-size inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                              categoryFilter === cat.id
                                ? "bg-primary/15 text-primary font-bold ring-1 ring-primary/30"
                                : "bg-muted/50 text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: cat.color }}
                            />
                            <span>{cat.nameAr}</span>
                            <span className="text-[10px] opacity-75">({cat.count})</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* "New updates" live pill */}
              {newCount > 0 && (
                <div className="sticky top-28 sm:top-36 z-30 flex justify-center pointer-events-none mb-3">
                  <button
                    onClick={revealNewUpdates}
                    className="no-min-touch-size mbm-enter pointer-events-auto flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-1.5 text-xs sm:text-sm font-semibold shadow-lg hover:brightness-110 transition"
                    data-testid="button-new-updates"
                  >
                    <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                    {newCount} تحديث جديد · اضغط للعرض
                    <ChevronUp className="h-4 w-4" />
                  </button>
                </div>
              )}

              {isLoading && <TimelineSkeleton count={8} />}

              {!isLoading && filteredItems.length === 0 && isFetchingNextPage && (
                <div className="py-12 text-center rounded-2xl border border-border/60 bg-card/50 space-y-3">
                  <Loader2 className="h-7 w-7 animate-spin text-primary mx-auto" />
                  <p className="text-sm font-medium text-muted-foreground">
                    جاري البحث في التحديثات الأقدم...
                  </p>
                </div>
              )}

              {!isLoading && !isFetchingNextPage && filteredItems.length === 0 && (
                <EmptyState
                  hasActiveFilters={hasActiveFilters}
                  onResetFilters={handleResetFilters}
                />
              )}

              {!isLoading && timelineGroups.length > 0 && (
                <div className="space-y-6" data-testid="list-news">
                  {(() => {
                    let globalIndex = -1;
                    return timelineGroups.map((group) => (
                      <section key={group.key} className="relative pr-7" data-testid={`group-${group.key}`}>
                        {/* Continuous spine for this time bucket */}
                        <div className="mbm-spine pointer-events-none absolute top-7 bottom-0 right-[15px] w-0.5" />
                        <TimelineGroupHeader
                          label={group.label}
                          subtitle={group.subtitle}
                          count={group.items.length}
                          icon={group.icon}
                        />
                        <div className={density === "compact" ? "space-y-2" : "space-y-3"}>
                          {group.items.map((item) => {
                            globalIndex += 1;
                            const showAd = (globalIndex + 1) % 6 === 0;
                            return (
                              <Fragment key={item.id}>
                                <TimelineEntry
                                  item={item}
                                  isFirst={globalIndex === 0}
                                  density={density}
                                  isSaved={savedIds.includes(item.id)}
                                  onQuickRead={(target) => setQuickReadItem(target)}
                                  onToggleSave={toggleSaveItem}
                                  onSelectCategory={(catId) =>
                                    setCategoryFilter((prev) => (prev === catId ? "all" : catId))
                                  }
                                />
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

            {/* SIDEBAR — Live Newsroom Pulse & Most Read */}
            <aside className="mt-6 lg:mt-0" data-testid="sidebar">
              <div className="lg:sticky lg:top-20 space-y-5">
                {/* Breaking highlights (when active) */}
                {breakingNews.length > 0 && (
                  <div
                    className="rounded-2xl bg-card border border-destructive/30 shadow-sm p-4"
                    data-testid="sidebar-breaking"
                  >
                    <h2 className="flex items-center gap-2 text-sm font-bold mb-3 text-destructive">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-destructive animate-pulse" />
                        <span className="absolute inset-0 h-2.5 w-2.5 rounded-full bg-destructive live-pulse-ring" />
                      </span>
                      أبرز العاجل الآن
                    </h2>
                    <ul className="space-y-3">
                      {breakingNews.slice(0, 6).map((item) => (
                        <li key={item.id} className="border-b border-border/40 last:border-0 pb-3 last:pb-0">
                          <Link
                            href={`/article/${item.englishSlug || item.slug}`}
                            className="block text-xs sm:text-sm font-medium leading-relaxed text-foreground hover:text-destructive transition-colors line-clamp-2"
                            data-testid={`sidebar-breaking-${item.id}`}
                          >
                            {item.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Most Read in Live Stream Now */}
                {mostReadLiveItems.length > 0 && (
                  <div
                    className="rounded-2xl bg-card border border-border/70 shadow-sm p-4"
                    data-testid="sidebar-most-read"
                  >
                    <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-border/60">
                      <h2 className="flex items-center gap-2 text-sm font-extrabold text-foreground">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Flame className="h-4 w-4" />
                        </span>
                        <span>الأكثر قراءة في البث</span>
                      </h2>
                      <span className="text-[11px] text-muted-foreground">مباشر</span>
                    </div>
                    <ul className="space-y-3">
                      {mostReadLiveItems.map((item, idx) => (
                        <li
                          key={item.id}
                          className="border-b border-border/40 last:border-0 pb-3 last:pb-0"
                        >
                          <div className="flex items-start gap-2.5">
                            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-black text-primary mt-0.5">
                              {idx + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <Link
                                href={`/article/${item.englishSlug || item.slug}`}
                                className="block text-xs sm:text-[13px] font-bold leading-snug text-foreground hover:text-primary transition-colors line-clamp-2 mb-1"
                                data-testid={`sidebar-most-read-${item.id}`}
                              >
                                {item.title}
                              </Link>
                              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                <span>{item.categoryNameAr}</span>
                                <span className="inline-flex items-center gap-1 font-medium">
                                  <Eye className="h-3 w-3" />
                                  {formatNumber(item.viewsCount)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Live Coverage Category Radar */}
                {categoryBreakdown.length > 0 && (
                  <div
                    className="rounded-2xl bg-card border border-border/70 shadow-sm p-4"
                    data-testid="sidebar-category-pulse"
                  >
                    <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-border/60">
                      <h2 className="flex items-center gap-2 text-sm font-extrabold text-foreground">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <BarChart3 className="h-4 w-4" />
                        </span>
                        <span>توزيع التغطية الحية</span>
                      </h2>
                      {categoryFilter !== "all" && (
                        <button
                          type="button"
                          onClick={() => setCategoryFilter("all")}
                          className="text-[11px] font-semibold text-primary hover:underline"
                        >
                          عرض الكل
                        </button>
                      )}
                    </div>
                    <div className="space-y-2.5">
                      {categoryBreakdown.slice(0, 6).map((cat) => {
                        const pct = Math.max(
                          8,
                          Math.round((cat.count / Math.max(1, allItems.length)) * 100)
                        );
                        const isSelected = categoryFilter === cat.id;
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() =>
                              setCategoryFilter((prev) => (prev === cat.id ? "all" : cat.id))
                            }
                            className={`w-full text-right rounded-xl p-2 transition-colors ${
                              isSelected
                                ? "bg-primary/10 ring-1 ring-primary/30"
                                : "hover:bg-muted/60"
                            }`}
                            data-testid={`sidebar-category-${cat.id}`}
                          >
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="font-bold text-foreground flex items-center gap-1.5">
                                <span
                                  className="h-2.5 w-2.5 rounded-full"
                                  style={{ backgroundColor: cat.color }}
                                />
                                {cat.nameAr}
                              </span>
                              <span className="text-[11px] text-muted-foreground font-medium">
                                {cat.count} خبر ({pct}%)
                              </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${pct}%`,
                                  backgroundColor: cat.color,
                                }}
                              />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* MPU ad */}
                <DmsMpuAd />
              </div>
            </aside>
          </div>
        </div>
      </main>

      {/* Quick Reader Modal — Read full update without leaving the live stream */}
      <Dialog
        open={!!quickReadItem}
        onOpenChange={(open) => {
          if (!open) setQuickReadItem(null);
        }}
      >
        <DialogContent
          className="max-w-2xl max-h-[88vh] overflow-y-auto p-0 gap-0 rounded-2xl"
          dir="rtl"
          data-testid="dialog-live-quick-read"
        >
          {quickReadItem && (
            <>
              <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border/70 bg-background/95 backdrop-blur-md px-4 sm:px-5 py-3">
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                    <Clock className="h-3 w-3" />
                    {formatClock(quickReadItem.publishedAt)}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {quickReadItem.categoryNameAr}
                  </Badge>
                  {quickReadItem.isBreaking && (
                    <Badge variant="destructive" className="text-xs gap-1">
                      <Zap className="h-3 w-3" />
                      عاجل
                    </Badge>
                  )}
                </div>

                {/* Prev / Next live item navigation inside Quick Reader */}
                <div className="flex items-center gap-1.5 pl-6">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={quickReadIndex <= 0}
                    onClick={() => {
                      if (quickReadIndex > 0) {
                        setQuickReadItem(filteredItems[quickReadIndex - 1]);
                      }
                    }}
                    className="no-min-touch-size h-7 px-2 text-xs gap-1 rounded-lg"
                    title="الخبر الأحدث"
                    data-testid="button-quick-read-prev"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                    <span>الأحدث</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={quickReadIndex < 0 || quickReadIndex >= filteredItems.length - 1}
                    onClick={() => {
                      if (quickReadIndex >= 0 && quickReadIndex < filteredItems.length - 1) {
                        setQuickReadItem(filteredItems[quickReadIndex + 1]);
                      }
                    }}
                    className="no-min-touch-size h-7 px-2 text-xs gap-1 rounded-lg"
                    title="الخبر الأقدم"
                    data-testid="button-quick-read-next"
                  >
                    <span>الأقدم</span>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="p-5 sm:p-6 space-y-4">
                <DialogHeader className="text-right space-y-2">
                  <DialogTitle className="text-xl sm:text-2xl font-black leading-snug text-foreground">
                    {quickReadItem.title}
                  </DialogTitle>
                  <DialogDescription className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{formatRelativeTime(quickReadItem.publishedAt)}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5" />
                      {formatNumber(quickReadItem.viewsCount)} مشاهدة
                    </span>
                  </DialogDescription>
                </DialogHeader>

                {quickReadItem.imageUrl && (
                  <div className="rounded-xl overflow-hidden border border-border/60 aspect-[16/9] bg-muted">
                    <OptimizedImage
                      src={quickReadItem.imageUrl}
                      alt={quickReadItem.title}
                      className="w-full h-full object-cover"
                      wrapperClassName="w-full h-full"
                      priority={true}
                      objectPosition={getObjectPosition(quickReadItem)}
                    />
                  </div>
                )}

                {/* AI Summary / Excerpt box if available */}
                {(quickReadArticle?.aiSummary || quickReadArticle?.excerpt) && (
                  <div className="rounded-xl border-r-4 border-primary bg-primary/5 p-4 space-y-1.5">
                    <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5" />
                      خلاصة الخبر
                    </span>
                    <p className="text-sm leading-relaxed text-foreground/90">
                      {quickReadArticle.aiSummary || quickReadArticle.excerpt}
                    </p>
                  </div>
                )}

                {/* Full Article Body or Loading Skeleton */}
                {isLoadingQuickRead ? (
                  <div className="space-y-3 py-2">
                    <p className="text-sm text-foreground/80 leading-relaxed">
                      {cleanLiveSummary(quickReadItem.summary)}
                    </p>
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-11/12" />
                    <Skeleton className="h-4 w-4/5" />
                  </div>
                ) : sanitizedQuickReadHtml ? (
                  <div
                    className="prose prose-sm sm:prose-base dark:prose-invert max-w-none leading-loose text-foreground"
                    dangerouslySetInnerHTML={{ __html: sanitizedQuickReadHtml }}
                  />
                ) : (
                  <p className="text-sm sm:text-base leading-relaxed text-foreground/85">
                    {cleanLiveSummary(quickReadItem.summary)}
                  </p>
                )}

                <div className="flex items-center justify-between gap-3 pt-4 border-t border-border/70">
                  <Button
                    variant={savedIds.includes(quickReadItem.id) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleSaveItem(quickReadItem.id)}
                    className="rounded-full gap-1.5"
                  >
                    <Bookmark
                      className={`h-4 w-4 ${
                        savedIds.includes(quickReadItem.id) ? "fill-current" : ""
                      }`}
                    />
                    <span>
                      {savedIds.includes(quickReadItem.id) ? "محفوظ في البث" : "حفظ للمتابعة"}
                    </span>
                  </Button>

                  <Link
                    href={`/article/${
                      quickReadArticle?.englishSlug ||
                      quickReadItem.englishSlug ||
                      quickReadItem.slug
                    }`}
                  >
                    <Button size="sm" className="rounded-full gap-1.5" data-testid="button-open-full-article">
                      <span>فتح صفحة الخبر والتعليقات</span>
                      <ArrowUpRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}
