import { useState, useEffect, useCallback, useMemo, ReactNode, startTransition, lazy, Suspense } from "react";
import { useLocation } from "wouter";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { useInViewport } from "@/hooks/useInViewport";
import { useIsMobile } from "@/hooks/use-mobile";
import { prefetchArticleDetail, prefetchCategoryPage, prefetchHomeSections, prefetchWhenIdle } from "@/lib/prefetchRoute";
import { readHomepageCache, writeHomepageCache } from "@/lib/homepageCache";
import type { ArticleWithDetails, CategoryWithStats } from "@shared/schema";
import type { User } from "@/hooks/useAuth";

// === CRITICAL PATH (Eager) - Above the fold content ===
import { Header } from "@/components/Header";
import { NavigationBar } from "@/components/NavigationBar";
import { CategoryPills } from "@/components/CategoryPills";
import { Footer } from "@/components/Footer";
import { HeroCarousel } from "@/components/HeroCarousel";
import { AdSlot } from "@/components/AdSlot";
import { DmsLeaderboardAd, DmsMpuAd, useAdTracking } from "@/components/DmsAdSlot";

// === LAZY LOADED - Below the fold content (code-split chunks) ===
const AIInsightsBlock = lazy(() => 
  import("@/components/AIInsightsBlock").then(module => ({ default: module.AIInsightsBlock }))
);
const TrendingKeywords = lazy(() => 
  import("@/components/TrendingKeywords").then(module => ({ default: module.TrendingKeywords }))
);
const SmartSummaryBlock = lazy(() => 
  import("@/components/SmartSummaryBlock").then(module => ({ default: module.SmartSummaryBlock }))
);
const PersonalizedFeed = lazy(() => 
  import("@/components/PersonalizedFeed").then(module => ({ default: module.PersonalizedFeed }))
);
const ContinueReadingWidget = lazy(() => 
  import("@/components/ContinueReadingWidget").then(module => ({ default: module.ContinueReadingWidget }))
);
const TrendingTopics = lazy(() => 
  import("@/components/TrendingTopics").then(module => ({ default: module.TrendingTopics }))
);
const OpinionArticlesBlock = lazy(() => 
  import("@/components/OpinionArticlesBlock").then(module => ({ default: module.OpinionArticlesBlock }))
);
const TrendingWeekSection = lazy(() => 
  import("@/components/TrendingWeekSection").then(module => ({ default: module.TrendingWeekSection }))
);
const MuqtarabTopicsShowcase = lazy(() => 
  import("@/components/MuqtarabTopicsShowcase").then(module => ({ default: module.MuqtarabTopicsShowcase }))
);
const QuadCategoriesBlock = lazy(() => 
  import("@/components/QuadCategoriesBlock").then(module => ({ default: module.QuadCategoriesBlock }))
);
const GulfLiveBlock = lazy(() => import("@/components/GulfLiveBlock"));
const HajjBlock = lazy(() => import("@/components/HajjBlock").then(m => ({ default: m.HajjBlock })));
const NewsMap = lazy(() => import("@/components/NewsMap"));

function SectionSkeleton({ height = 200 }: { height?: number }) {
  return <div className="animate-pulse bg-muted/30 rounded-lg" style={{ height }} />;
}

function ArticleCardSkeleton() {
  return (
    <div className="bg-card border rounded-lg overflow-hidden">
      <Skeleton className="w-full aspect-[16/9]" />
      <div className="p-4 space-y-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-3/4" />
        <div className="flex items-center gap-2 pt-1">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    </div>
  );
}

function LazySection({ children, minHeight = 200 }: { children: ReactNode; minHeight?: number }) {
  // Start loading well before the section enters the viewport so its JS chunk
  // and data fetch resolve by the time the user scrolls to it — eliminates the
  // per-section skeleton flash that made mobile scrolling feel laggy.
  const [ref, isVisible] = useInViewport<HTMLDivElement>({ rootMargin: '800px' });
  const [shouldRender, setShouldRender] = useState(false);
  
  useEffect(() => {
    if (isVisible && !shouldRender) {
      startTransition(() => {
        setShouldRender(true);
      });
    }
  }, [isVisible, shouldRender]);
  
  return (
    <div
      ref={ref}
      style={{
        // Keep a stable reserved height for not-yet-rendered sections to avoid
        // layout shift (CLS), and let offscreen sections skip paint/layout work
        // on weaker mobile devices via content-visibility.
        minHeight: shouldRender ? undefined : minHeight,
        contentVisibility: shouldRender ? undefined : 'auto',
        containIntrinsicSize: shouldRender ? undefined : `auto ${minHeight}px`,
      }}
    >
      {shouldRender ? (
        <Suspense fallback={<SectionSkeleton height={minHeight} />}>
          {children}
        </Suspense>
      ) : (
        <SectionSkeleton height={minHeight} />
      )}
    </div>
  );
}

interface HomepageData {
  hero: ArticleWithDetails[];
  forYou: ArticleWithDetails[];
  breaking: ArticleWithDetails[];
  editorPicks: ArticleWithDetails[];
  deepDive: ArticleWithDetails[];
  trending: Array<{ topic: string; count: number; views: number; articles: number; comments: number }>;
}

export default function Home() {
  // Track when initial load is complete to defer non-critical queries
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  const isMobile = useIsMobile();
  const [, navigate] = useLocation();

  // DMS Ad tracking for homepage
  useAdTracking('Homepage');
  
  const { data: user } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const { data: categoriesWithStats } = useQuery<CategoryWithStats[]>({
    queryKey: ["/api/categories", "withStats"],
    queryFn: async () => {
      const res = await fetch("/api/categories?withStats=true", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch categories");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const visibleCategories = useMemo(() => {
    const list = Array.isArray(categoriesWithStats) ? categoriesWithStats : [];
    return list
      .filter(
        (cat) =>
          (cat.status === "visible" || cat.status === "active") &&
          cat.type === "core",
      )
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
  }, [categoriesWithStats]);

  const { data: homepage, isLoading, isPlaceholderData, error, refetch: refetchHomepage } = useQuery<HomepageData>({
    queryKey: ["/api/homepage-lite"],
    staleTime: 60 * 1000, // Data becomes stale after 1 minute (so focus refetch works)
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    refetchInterval: 60 * 1000, // Poll every 60 seconds for new articles (SSE was removed)
    refetchIntervalInBackground: false, // Don't waste resources when tab hidden
    refetchOnWindowFocus: true, // Refetch when user returns to tab
    // Paint the last-known feed instantly on reload (HTML is no-store, so the
    // in-memory cache is empty after a refresh) while we revalidate in the
    // background. Eliminates the full-screen skeleton flash on every refresh.
    placeholderData: () => readHomepageCache<HomepageData>(),
  });

  // Snapshot fresh (non-placeholder) homepage data for the next reload.
  useEffect(() => {
    if (homepage && !isPlaceholderData) {
      writeHomepageCache(homepage);
    }
  }, [homepage, isPlaceholderData]);

  // Set document.title for SEO (GA4 auto-tracks page views)
  useEffect(() => {
    document.title = 'سبق - صحيفة إلكترونية سعودية';
  }, []);

  // Mark initial load complete when homepage data loads
  useEffect(() => {
    if (homepage && !initialLoadComplete) {
      // Small delay to ensure hero content renders first
      const timer = setTimeout(() => {
        setInitialLoadComplete(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [homepage, initialLoadComplete]);

  // Warm the article-detail chunk during idle time: virtually every homepage
  // visitor opens an article next, so this makes the first click feel instant
  // instead of blocking on the chunk download. Runs once the feed has data.
  useEffect(() => {
    if (!initialLoadComplete) return;
    const cancel = prefetchWhenIdle(() => {
      prefetchArticleDetail();
      prefetchCategoryPage();
      // Warm the below-the-fold homepage section chunks during idle so they're
      // already cached when the user scrolls — only the data fetch remains.
      // Skip desktop-only chunks on mobile (map + trending panels aren't
      // rendered there).
      prefetchHomeSections({ includeDesktopOnly: !isMobile });
    });
    return cancel;
  }, [initialLoadComplete, isMobile]);

  const feedTitle = useMemo(() => user ? "أخبارك الذكية" : "جميع الأخبار", [user]);
  const feedSubtitle = useMemo(() => user ? "محتوى مُختار بذكاء بناءً على اهتماماتك" : undefined, [user]);

  useEffect(() => {
    if (!initialLoadComplete) return;
    let lastUpdate = 0;
    let active = true;

    const poll = async () => {
      if (!active || document.hidden) return;
      try {
        const res = await fetch('/api/cache-invalidation/check');
        if (!res.ok) return;
        const data = await res.json();
        if (lastUpdate && data.lastUpdate > lastUpdate) {
          refetchHomepage();
        }
        lastUpdate = data.lastUpdate;
      } catch {}
    };

    const timer = setInterval(poll, 30000);
    const onVisible = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', onVisible);
    poll();

    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [initialLoadComplete, refetchHomepage]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col" dir="rtl">
        <Header user={user || undefined} />
        <NavigationBar />
        <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12 flex-1">
          <Skeleton className="w-full h-[400px] md:h-[500px] rounded-lg" />
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <ArticleCardSkeleton key={i} />
              ))}
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex flex-col" dir="rtl">
        <Header user={user || undefined} />
        <NavigationBar />
        <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
          <div className="text-center py-20">
            <p className="text-destructive text-lg mb-4">
              حدث خطأ في تحميل الصفحة الرئيسية
            </p>
            <p className="text-muted-foreground text-sm">
              {error instanceof Error ? error.message : "خطأ غير معروف"}
            </p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!homepage) {
    return (
      <div className="min-h-screen bg-background flex flex-col" dir="rtl">
        <Header user={user || undefined} />
        <NavigationBar />
        <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
          <div className="text-center py-20">
            <p className="text-muted-foreground text-lg">
              لا توجد بيانات متاحة حالياً
            </p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Header user={user || undefined} />
      {visibleCategories.length > 0 && (
        <div className="hidden md:block">
        <CategoryPills
          categories={visibleCategories}
          onSelectCategory={(categoryId) => {
            if (!categoryId) {
              navigate("/categories");
              return;
            }
            const target = visibleCategories.find((c) => c.id === categoryId);
            if (target?.slug) navigate(`/category/${target.slug}`);
          }}
        />
        </div>
      )}

      <main className="flex-1">
        <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
          {/* Hero Section */}
          {homepage.hero && homepage.hero.length > 0 && (
            <div className="mb-8">
              <HeroCarousel articles={homepage.hero} />
            </div>
          )}

          {/* Gulf Live Coverage Block — hidden (no active events) */}
          {/* <ErrorBoundary fallback={null}>
            <Suspense fallback={null}>
              <GulfLiveBlock />
            </Suspense>
          </ErrorBoundary> */}

          {/* Hajj Block ("صدى الحج") — only renders during the configured
              Hajj season; the backend `/api/hajj-block` returns
              {isVisible:false} outside that window so this Suspense
              produces no DOM the rest of the year. */}
          <ErrorBoundary fallback={null}>
            <Suspense fallback={null}>
              <HajjBlock />
            </Suspense>
          </ErrorBoundary>

          {/* DMS Ads - Leaderboard for desktop, MPU for mobile - تحت الكاروسيل */}
          <DmsLeaderboardAd />
          <DmsMpuAd />

          {/* Ad Banner Slot - Below Featured News */}
          <AdSlot slotId="header-banner" className="w-full" />
        </div>

        {/* AI Section with soft gradient background - Lazy loaded */}
        <LazySection>
          <div className="bg-ai-gradient-soft py-8">
            <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
              <div className="scroll-fade-in">
                <SmartSummaryBlock />
              </div>
              <div className="scroll-fade-in">
                <AIInsightsBlock enabled={true} />
              </div>
            </div>
          </div>
        </LazySection>

        <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 py-8">
          {/* All News Section */}
          {homepage.forYou && homepage.forYou.length > 0 && (
            <div className="scroll-fade-in">
              <Suspense fallback={<SectionSkeleton height={400} />}>
                <PersonalizedFeed 
                  articles={homepage.forYou}
                  title={feedTitle}
                  subtitle={feedSubtitle}
                  showReason={false}
                />
              </Suspense>
            </div>
          )}
        </div>

        {/* Quad Categories Block - 4 category columns - Below Smart News */}
        <LazySection>
          <QuadCategoriesBlock enabled={true} />
        </LazySection>

        {/* Trending Week Section - Top viewed articles - Below All News */}
        <LazySection>
          <TrendingWeekSection />
        </LazySection>

        {/* Muqtarab Topics Showcase - Featured topics from angles */}
        <LazySection>
          <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <MuqtarabTopicsShowcase enabled={true} />
          </div>
        </LazySection>

        <LazySection>
          <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 py-8">
            <div className="scroll-fade-in">
              <OpinionArticlesBlock enabled={true} />
            </div>
          </div>
        </LazySection>

        {/* Continue Reading — stands alone (its own container + padding)
            so the inner grid uses the full max-w-7xl width like TrendingWeek. */}
        <LazySection>
          <ContinueReadingWidget />
        </LazySection>

        {/* Trending Topics + Trending Keywords — desktop only (hidden on mobile). */}
        {!isMobile && (
          <LazySection>
            <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8 py-8">
              <div className="space-y-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {homepage.trending && homepage.trending.length > 0 && (
                    <div className="scroll-fade-in">
                      <TrendingTopics topics={homepage.trending} />
                    </div>
                  )}
                  <div className="scroll-fade-in">
                    <TrendingKeywords />
                  </div>
                </div>
              </div>
            </div>
          </LazySection>
        )}

        {/* News Map (Leaflet) — desktop only. The map library is heavy
            (~150KB+); skipping the section on mobile means the chunk never
            downloads there. */}
        {!isMobile && (
          <LazySection>
            <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              <NewsMap />
            </div>
          </LazySection>
        )}
      </main>
      
      <Footer />
    </div>
  );
}
