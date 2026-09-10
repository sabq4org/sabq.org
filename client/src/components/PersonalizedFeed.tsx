import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Newspaper, Clock, MessageSquare, Sparkles, Zap, Star, Flame, Loader2, ChevronDown, Brain, Camera, BarChart3, Target, BookOpen } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import type { ArticleWithDetails } from "@shared/schema";
import { formatArticleTimestamp } from "@/lib/formatTime";
import { getObjectPosition, getArticleDisplayImageUrl } from "@/lib/imageUtils";
import { prefetchArticle } from "@/lib/prefetchRoute";
import { getReadingHistory, type ReadingEntry } from "@/lib/readingHistory";
import { computeMatchScore, type MatchResult } from "@/lib/matchScore";
import { OptimizedImage } from "@/components/OptimizedImage";
import { useIsMobile } from "@/hooks/use-mobile";
import { apiUrl } from "@/lib/queryClient";
import { NewsArticleCard } from "@/components/NewsArticleCard";

interface MatchBadgeProps {
  match: MatchResult;
  articleId: string;
  size?: "sm" | "md";
}

function MatchBadge({ match, articleId, size = "md" }: MatchBadgeProps) {
  const isSm = size === "sm";
  const barColor =
    match.level === "high"
      ? "bg-emerald-500"
      : match.level === "medium"
        ? "bg-amber-500"
        : "bg-muted-foreground/40";
  const numColor =
    match.level === "high"
      ? "text-emerald-600 dark:text-emerald-400"
      : match.level === "medium"
        ? "text-amber-600 dark:text-amber-400"
        : "text-foreground/65";

  if (!match.hasEnoughHistory) {
    if (isSm) return null;
    return (
      <p
        className="flex items-center gap-1 text-[11px] font-medium text-foreground/65"
        data-testid={`text-match-empty-${articleId}`}
      >
        <Target className="h-3 w-3" aria-hidden="true" />
        {match.reason}
      </p>
    );
  }

  if (isSm) {
    // Mobile: single compact line — bar + % + reason inline
    return (
      <div
        className="flex items-center gap-2 text-[11px]"
        data-testid={`block-match-${articleId}`}
      >
        <div
          className="h-0.5 w-8 shrink-0 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={match.score}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`نسبة التطابق ${match.score}%`}
          data-testid={`bar-match-${articleId}`}
        >
          <div
            className={`h-full ${barColor}`}
            style={{ width: `${Math.max(match.score, 4)}%` }}
          />
        </div>
        <span
          className={`font-bold tabular-nums ${numColor}`}
          data-testid={`text-match-score-${articleId}`}
        >
          {match.score}%
        </span>
        <span
          className="truncate font-medium text-foreground/65"
          data-testid={`text-match-reason-${articleId}`}
        >
          · {match.reason}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 text-xs" data-testid={`block-match-${articleId}`}>
      <p
        className="line-clamp-1 font-medium text-foreground/65"
        data-testid={`text-match-reason-${articleId}`}
      >
        {match.reason}
      </p>
      <div className="flex items-center gap-1.5 shrink-0">
        <Target className="h-3 w-3 text-foreground/65" aria-hidden="true" />
        <span className="whitespace-nowrap font-medium text-foreground/65">نسبة التطابق</span>
        <span
          className={`font-bold ${numColor}`}
          data-testid={`text-match-score-${articleId}`}
        >
          {match.score}%
        </span>
        <div
          className="h-1 w-10 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={match.score}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`نسبة التطابق ${match.score}%`}
          data-testid={`bar-match-${articleId}`}
        >
          <div
            className={`h-full ${barColor} transition-all`}
            style={{ width: `${Math.max(match.score, 4)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// Helper function to check if article is new (published within last 30 minutes)
const isNewArticle = (publishedAt: Date | string | null | undefined) => {
  if (!publishedAt) return false;
  const published = typeof publishedAt === 'string' ? new Date(publishedAt) : publishedAt;
  const now = new Date();
  const diffInMinutes = (now.getTime() - published.getTime()) / (1000 * 60);
  return diffInMinutes <= 30;
};

interface PersonalizedFeedProps {
  articles: ArticleWithDetails[];
  title?: string;
  subtitle?: string;
  showReason?: boolean;
}

interface Recommendation {
  id: string;
  article: ArticleWithDetails;
  reason: string;
  score: number;
}

export function PersonalizedFeed({ articles: initialArticles, title = "جميع الأخبار", subtitle, showReason = false }: PersonalizedFeedProps) {
  const { user } = useAuth();
  // Render only ONE layout for the current viewport instead of mounting both
  // the mobile list and the desktop grid (display:none). On a phone this halves
  // the DOM nodes, OptimizedImage IntersectionObservers, and React work for the
  // feed — the heaviest block on the homepage. Breakpoint matches the original
  // `lg` (1024px) split so tablets keep the list view.
  const isCompact = useIsMobile(1024);
  const [articles, setArticles] = useState(initialArticles);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(initialArticles.length);
  const [error, setError] = useState<string | null>(null);
  const [displayedRecommendations, setDisplayedRecommendations] = useState<Set<string>>(new Set());
  const impressionQueue = useRef<string[]>([]);
  const impressionTimeout = useRef<NodeJS.Timeout | null>(null);

  const { data: recommendationsData } = useQuery<{ recommendations: Recommendation[] }>({
    queryKey: ['/api/recommendations/personalized'],
    enabled: !!user,
  });

  const recommendations = recommendationsData?.recommendations || [];

  // Local reading-history-based "match score" (privacy-friendly: client-only)
  const [historyTick, setHistoryTick] = useState(0);
  useEffect(() => {
    if (!user) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === "sabq:reading_history:v1") setHistoryTick((t) => t + 1);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") setHistoryTick((t) => t + 1);
    };
    const onUpdated = () => setHistoryTick((t) => t + 1);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("reading-history-updated", onUpdated);
    return () => {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("reading-history-updated", onUpdated);
    };
  }, [user]);

  const readingHistory: ReadingEntry[] = useMemo(
    () => (user ? getReadingHistory() : []),
    [user, historyTick],
  );

  const matches = useMemo(() => {
    const map = new Map<string, MatchResult>();
    if (!user) return map;
    for (const a of articles) {
      map.set(a.id, computeMatchScore(a, readingHistory));
    }
    return map;
  }, [articles, readingHistory, user]);

  const sendImpressions = useCallback(async () => {
    if (impressionQueue.current.length === 0) return;

    const articleIds = [...impressionQueue.current];
    impressionQueue.current = [];

    try {
      await fetch(apiUrl('/api/recommendations/impressions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          articleIds,
          impressionType: 'feed',
        }),
      });
    } catch (error) {
      console.error('[Impressions] Error sending impressions:', error);
    }
  }, []);

  const queueImpression = useCallback((articleId: string) => {
    if (!user) return;
    impressionQueue.current.push(articleId);

    if (impressionTimeout.current) {
      clearTimeout(impressionTimeout.current);
    }

    impressionTimeout.current = setTimeout(sendImpressions, 2000);
  }, [user, sendImpressions]);

  useEffect(() => {
    return () => {
      if (impressionTimeout.current) {
        clearTimeout(impressionTimeout.current);
      }
      if (impressionQueue.current.length > 0) {
        sendImpressions();
      }
    };
  }, [sendImpressions]);

  const handleRecommendationDisplay = useCallback(async (articleId: string, recommendationId?: string) => {
    if (!recommendationId || displayedRecommendations.has(recommendationId)) return;

    setDisplayedRecommendations(prev => new Set(prev).add(recommendationId));
    queueImpression(articleId);

    try {
      await fetch(apiUrl(`/api/recommendations/${recommendationId}/displayed`), {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('[Recommendations] Error marking displayed:', error);
    }
  }, [displayedRecommendations, queueImpression]);

  const handleRecommendationClick = useCallback(async (articleId: string, recommendationId?: string) => {
    if (!recommendationId) return;

    try {
      await fetch(apiUrl(`/api/recommendations/${recommendationId}/clicked`), {
        method: 'POST',
        credentials: 'include',
      });
      await fetch(apiUrl('/api/recommendations/click'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ articleId }),
      });
    } catch (error) {
      console.error('[Recommendations] Error recording click:', error);
    }
  }, []);

  const loadMore = async () => {
    setIsLoading(true);
    setError(null); // مسح الخطأ السابق
    
    try {
      // استخدام نقطة النهاية المخصصة للترقيم
      const response = await fetch(
        apiUrl(`/api/news/paginated?limit=8&offset=${offset}`),
        { credentials: 'include' }
      );
      
      if (!response.ok) {
        throw new Error('فشل تحميل المزيد من الأخبار');
      }
      
      const data = await response.json();
      const newArticles = data.articles || [];
      
      if (newArticles.length === 0) {
        setHasMore(false); // فقط هنا نخفي الزر (لا توجد أخبار متبقية)
      } else {
        // تجنب التكرار عبر فلترة الأخبار الموجودة مسبقاً
        const existingIds = new Set(articles.map(a => a.id));
        const uniqueNewArticles = newArticles.filter((a: any) => !existingIds.has(a.id));
        
        setArticles([...articles, ...uniqueNewArticles]);
        setOffset(offset + newArticles.length);
        
        // التحقق من وجود المزيد
        setHasMore(data.hasMore !== false && newArticles.length > 0);
      }
    } catch (error) {
      console.error('Error loading more articles:', error);
      setError(error instanceof Error ? error.message : 'حدث خطأ أثناء التحميل');
      // ✅ لا نضع hasMore = false هنا! نبقيه true لإمكانية retry
    } finally {
      setIsLoading(false);
    }
  };

  if (!articles || articles.length === 0) return null;

  return (
    <section className="public-theme space-y-4" dir="rtl">
      <div className="flex items-center gap-2">
        {user ? (
          <Sparkles className="h-6 w-6 text-primary" />
        ) : (
          <Newspaper className="h-6 w-6 text-primary" />
        )}
        <h2 className="text-2xl md:text-3xl font-bold" data-testid="heading-personalized-feed">
          {title}
        </h2>
      </div>
      
      <p className="text-sm font-medium text-foreground/70">
        {subtitle || "نشر كل الأخبار المضافة مرتبة من الأحدث إلى الأقدم"}
      </p>

      {/* Mobile View: Vertical List (like RecommendationsWidget) */}
      {isCompact && (
      <div className="lg:hidden rounded-2xl overflow-hidden border border-border/60 bg-card">
        {articles.map((article, index) => (
          <div key={article.id} onMouseEnter={() => prefetchArticle(article.englishSlug || article.slug)} onTouchStart={() => prefetchArticle(article.englishSlug || article.slug)}>
            <NewsArticleCard article={article} viewMode="compact" priority={index < 3} />
          </div>
        ))}
      </div>
      )}

      {/* Desktop View: Grid with 4 columns */}
      {!isCompact && (
      <div className="hidden lg:grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {articles.map((article, index) => {
          const match = matches.get(article.id);
          return (
            <div key={article.id} onMouseEnter={() => prefetchArticle(article.englishSlug || article.slug)} onTouchStart={() => prefetchArticle(article.englishSlug || article.slug)}>
              <NewsArticleCard article={article} viewMode="grid" priority={index < 4} />
              {match && <div className="pt-2 border-t border-border/40"><MatchBadge match={match} articleId={article.id} size="md" /></div>}
            </div>
          );
        })}
      </div>
      )}

      {/* زر "المزيد من الأخبار" */}
      {hasMore && (
        <div className="flex flex-col items-center gap-3 pt-6">
          {/* Error Message */}
          {error && (
            <div 
              className="text-destructive text-sm text-center bg-destructive/10 px-4 py-2 rounded-md"
              data-testid="error-load-more"
            >
              {error}
            </div>
          )}
          
          {/* Load More Button */}
          <Button
            onClick={loadMore}
            disabled={isLoading}
            size="lg"
            className="gap-2 min-w-[200px]"
            data-testid="button-load-more-news"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                جاري التحميل...
              </>
            ) : error ? (
              <>
                <ChevronDown className="h-5 w-5" />
                إعادة المحاولة
              </>
            ) : (
              <>
                <ChevronDown className="h-5 w-5" />
                المزيد من الأخبار
              </>
            )}
          </Button>
        </div>
      )}
    </section>
  );
}
