import { useState, useEffect, useRef, useCallback, useMemo, Component, ReactNode, startTransition, Suspense } from "react";
import { lazyDefault, lazyNamed } from "@/lib/lazyChunk";
import { useLocation } from "wouter";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useQuery } from "@tanstack/react-query";
import { apiUrl } from "@/lib/queryClient";
import { signalContentPainted } from "@/lib/contentPaintedSignal";
import { Skeleton } from "@/components/ui/skeleton";
import { useInViewport } from "@/hooks/useInViewport";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCanonical } from "@/hooks/useCanonical";
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
import { useHeroPreload } from "@/hooks/useHeroPreload";
import { AdSlot } from "@/components/AdSlot";
import { DmsLeaderboardAd, DmsMpuAd, useAdTracking } from "@/components/DmsAdSlot";

// الإعلان البارز أعلى الصفحة الرئيسية (تحت الهيدر). أُعيد إظهاره 2026-07-09 (بعد إخفاء المونديال). للإخفاء: بدّل إلى false.
const SHOW_TOP_ADS = true;

// === LAZY LOADED - Below the fold content (retryImport + deploy recovery) ===
const AIInsightsBlock = lazyNamed(() => import("@/components/AIInsightsBlock"), "AIInsightsBlock");
const TrendingKeywords = lazyNamed(() => import("@/components/TrendingKeywords"), "TrendingKeywords");
const SmartSummaryBlock = lazyNamed(() => import("@/components/SmartSummaryBlock"), "SmartSummaryBlock");
const PersonalizedFeed = lazyNamed(() => import("@/components/PersonalizedFeed"), "PersonalizedFeed");
const ContinueReadingWidget = lazyNamed(() => import("@/components/ContinueReadingWidget"), "ContinueReadingWidget");
const TrendingTopics = lazyNamed(() => import("@/components/TrendingTopics"), "TrendingTopics");
const OpinionArticlesBlock = lazyNamed(() => import("@/components/OpinionArticlesBlock"), "OpinionArticlesBlock");
const TrendingWeekSection = lazyNamed(() => import("@/components/TrendingWeekSection"), "TrendingWeekSection");
const MuqtarabTopicsShowcase = lazyNamed(() => import("@/components/MuqtarabTopicsShowcase"), "MuqtarabTopicsShowcase");
const QuadCategoriesBlock = lazyNamed(() => import("@/components/QuadCategoriesBlock"), "QuadCategoriesBlock");
const GulfLiveBlock = lazyDefault(() => import("@/components/GulfLiveBlock"));
const GulfCupHomeSection = lazyDefault(() => import("@/components/gulfcup/GulfCupHomeSection"));
const KingsCupHomeSection = lazyDefault(() => import("@/components/kingscup/KingsCupHomeSection"));
const RoshnHomeSection = lazyDefault(() => import("@/components/rsl/RoshnHomeSection"));
const SportsPortalStrip = lazyDefault(() => import("@/components/sports/SportsPortalStrip"));
const AsianCupHomeSection = lazyDefault(() => import("@/components/asiancup/AsianCupHomeSection"));
const HajjBlock = lazyNamed(() => import("@/components/HajjBlock"), "HajjBlock");
const NationalDay96Block = lazyNamed(() => import("@/components/seasonal/NationalDay96Block"), "NationalDay96Block");
const SahraaTvBlock = lazyNamed(() => import("@/components/SahraaTvBlock"), "SahraaTvBlock");
const EconomyNumbersBlock = lazyNamed(() => import("@/components/economy/EconomyNumbersBlock"), "EconomyNumbersBlock");
const NewsMap = lazyDefault(() => import("@/components/NewsMap"));

// Smart Blocks: معطّلة على واجهة الزائر حالياً (لوحة التحكم فقط).
// لا تستدعِ /api/smart-blocks/homepage من الصفحة الرئيسية حتى إعادة التفعيل.

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

// Below-the-fold sections are optional content: if one fails (chunk blocked by
// a content blocker, transient network/CDN hiccup, mid-deploy hash rotation),
// collapse just that section instead of letting the error bubble up to the
// route-level ErrorBoundary and replace the WHOLE homepage with "حدث خطأ".
// Recovery reloads stay the job of deployRecovery's window-level listeners.
class SectionErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("[LazySection] section failed, collapsing it:", error?.message);
  }

  render() {
    return this.state.hasError ? null : this.props.children;
  }
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
        <SectionErrorBoundary>
          <Suspense fallback={<SectionSkeleton height={minHeight} />}>
            {children}
          </Suspense>
        </SectionErrorBoundary>
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

/**
 * Lightweight telemetry for the idle-tab-resume recovery path, via the existing
 * GA4 gtag (no new endpoint). Fire-and-forget — never throws into render.
 *   - homepage_feed_degraded: a background refetch failed but we kept showing
 *     cached/last-good content instead of the dead error screen.
 *   - homepage_feed_recovered: a later refetch succeeded and cleared the error.
 */
function reportHomepageEvent(event: "homepage_feed_degraded" | "homepage_feed_recovered", error?: unknown) {
  try {
    const message = error instanceof Error ? error.message : undefined;
    if (event === "homepage_feed_degraded") {
      console.warn("[homepage] feed refetch failed — showing cached content", message);
    } else {
      console.warn("[homepage] feed auto-recovered");
    }
    const gtag = (window as any).gtag;
    if (typeof gtag === "function") {
      gtag("event", event, message ? { error_message: String(message).slice(0, 100) } : {});
    }
  } catch {
    // Telemetry must never break the page.
  }
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
      const res = await fetch(apiUrl("/api/categories?withStats=true"), { credentials: "include" });
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

  const { data: homepage, isLoading, isPlaceholderData, isFetching, error, refetch: refetchHomepage } = useQuery<HomepageData>({
    queryKey: ["/api/homepage-lite"],
    staleTime: 60 * 1000, // Data becomes stale after 1 minute (so focus refetch works)
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    refetchInterval: 60 * 1000, // Poll every 60 seconds for new articles (SSE was removed)
    refetchIntervalInBackground: false, // Don't waste resources when tab hidden
    refetchOnWindowFocus: true, // Refetch when user returns to tab
    // Inherits the global retry policy (isRetriableError + backoff/jitter in
    // queryClient.ts): a transient "Load failed" when the focus refetch fires
    // on an idle-tab resume is retried up to 3× and self-heals before any error
    // ever reaches the UI.
    // Paint the last-known feed instantly on reload (HTML is no-store, so the
    // in-memory cache is empty after a refresh) while we revalidate in the
    // background. Eliminates the full-screen skeleton flash on every refresh.
    placeholderData: () => readHomepageCache<HomepageData>(),
  });

  // Telemetry: track when a background refetch failed but we kept rendering
  // cached content (degraded) and when it later recovered. Measures how often
  // the idle-resume path self-heals vs. strands the user.
  const wasDegradedRef = useRef(false);
  useEffect(() => {
    const degraded = Boolean(error) && Boolean(homepage);
    if (degraded && !wasDegradedRef.current) {
      wasDegradedRef.current = true;
      reportHomepageEvent("homepage_feed_degraded", error);
    } else if (!error && wasDegradedRef.current) {
      wasDegradedRef.current = false;
      reportHomepageEvent("homepage_feed_recovered");
    }
  }, [error, homepage]);

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

  useCanonical("https://sabq.org");

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

  // LCP: preload the hero carousel's lead image (breaking news sorts first,
  // matching HeroCarousel's own ordering) so the browser starts fetching it
  // before React mounts the carousel.
  const heroLeadImage = useMemo(() => {
    const heroes = Array.isArray(homepage?.hero) ? homepage!.hero : [];
    if (heroes.length === 0) return null;
    const lead =
      heroes.find((a) => a.newsType === "breaking") || heroes[0];
    return lead?.imageUrl || lead?.thumbnailUrl || null;
  }, [homepage]);
  useHeroPreload(heroLeadImage);

  // المحتوى الرئيسي جاهز → حرّر طبقة الإعلانات المؤجلة (انظر index.html)
  useEffect(() => {
    if (homepage?.hero?.length) signalContentPainted();
  }, [homepage]);

  const feedTitle = useMemo(() => user ? "أخبارك الذكية" : "جميع الأخبار", [user]);
  const feedSubtitle = useMemo(() => user ? "محتوى مُختار بذكاء بناءً على اهتماماتك" : undefined, [user]);

  useEffect(() => {
    if (!initialLoadComplete) return;
    let lastUpdate = 0;
    let active = true;

    const poll = async () => {
      if (!active || document.hidden) return;
      try {
        const res = await fetch(apiUrl('/api/cache-invalidation/check'));
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

  // Only show the full-screen error when we have NOTHING to render. If a
  // refetch (e.g. the idle-tab-resume focus refetch) failed but we still hold
  // the last-good feed, we fall through and keep showing it with a small
  // non-blocking "retry" pill — see FeedStatusBanner in the main return below.
  // This is the core fix: a transient blip must never blank a populated page.
  if (error && !homepage) {
    return (
      <div className="min-h-screen bg-background flex flex-col" dir="rtl">
        <Header user={user || undefined} />
        <NavigationBar />
        <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
          <div className="text-center py-20">
            <p className="text-destructive text-lg mb-4">
              حدث خطأ في تحميل الصفحة الرئيسية
            </p>
            <p className="mb-6 text-sm font-medium text-foreground/70">
              {error instanceof Error ? error.message : "خطأ غير معروف"}
            </p>
            <button
              type="button"
              onClick={() => refetchHomepage()}
              disabled={isFetching}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60"
            >
              {isFetching ? "جارٍ المحاولة…" : "إعادة المحاولة"}
            </button>
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
            <p className="text-lg font-medium text-foreground/70">
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
      {/* Non-blocking "refresh failed / retrying" pill. Only appears when a
          background refetch errored while we keep showing the last-good feed —
          so the user sees content + a recovery affordance instead of a dead
          screen. Auto-clears the moment a refetch (focus / 60s poll / manual)
          succeeds. */}
      {error && homepage && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full border bg-card/95 px-4 py-2 shadow-lg backdrop-blur"
          dir="rtl"
          role="status"
          aria-live="polite"
        >
          <span className="text-sm font-medium text-foreground/70">
            {isFetching ? "جارٍ تحديث الأخبار…" : "تعذّر تحديث الأخبار"}
          </span>
          {!isFetching && (
            <button
              type="button"
              onClick={() => refetchHomepage()}
              className="text-sm font-medium text-primary hover:underline"
            >
              إعادة المحاولة
            </button>
          )}
        </div>
      )}
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
        <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8">
          {/* Hero Section */}
          {homepage.hero && homepage.hero.length > 0 && <HeroCarousel articles={homepage.hero} />}
        </div>

        {/* شريط المدخل إلى البوابة الرياضية — الباب الوحيد إلى /sports من الرئيسية.
            سطر واحد بارتفاع ثابت (فلا يزحزح ما تحته عند وصول البيانات)، ونصّه
            يتغيّر بسلّم أهمية موصوف داخل المكوّن. */}
        <ErrorBoundary fallback={null}>
          <Suspense fallback={<div className="h-12 border-y border-border/60 bg-muted/40" />}>
            <SportsPortalStrip />
          </Suspense>
        </ErrorBoundary>

        {/* كأس العالم 2026 على الرئيسية — مخفي 2026-07-20؛ إعادة التفعيل: WorldCupHomeSection تحت الهيرو */}

        {/* Gulf Cup 27 + Asian Cup 2027 strips — each hides itself entirely
            when toggled off from dashboard (blockHidden / schedule window)
            or when no data */}
        {/* King's Cup strip — hides itself entirely when toggled off from
            dashboard (blockHidden / schedule window) or when no data */}
        <ErrorBoundary fallback={null}>
          <Suspense fallback={null}>
            <KingsCupHomeSection />
          </Suspense>
        </ErrorBoundary>

        {/* Roshn Saudi League strip — pre-season countdown / matchday /
            next match / champion; hides via dashboard toggle or no data */}
        <ErrorBoundary fallback={null}>
          <Suspense fallback={null}>
            <RoshnHomeSection />
          </Suspense>
        </ErrorBoundary>

        <ErrorBoundary fallback={null}>
          <Suspense fallback={null}>
            <GulfCupHomeSection />
          </Suspense>
        </ErrorBoundary>
        <ErrorBoundary fallback={null}>
          <Suspense fallback={null}>
            <AsianCupHomeSection />
          </Suspense>
        </ErrorBoundary>

        <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
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

          {/* بلوك اليوم الوطني الـ96 — يظهر فقط عند تفعيله من اللوحة وداخل
              نافذة الموسم؛ /api/national-day-block يرجع isVisible:false
              خارجها فلا يُنتج أي DOM بقية السنة. */}
          <ErrorBoundary fallback={null}>
            <Suspense fallback={null}>
              <NationalDay96Block />
            </Suspense>
          </ErrorBoundary>

          {/* الاقتصاد بالأرقام — شريط بيانات البنك المركزي (يختفي ذاتيًا بلا بيانات) */}
          <ErrorBoundary fallback={null}>
            <Suspense fallback={null}>
              <EconomyNumbersBlock />
            </Suspense>
          </ErrorBoundary>

          {/* الإعلان البارز أسفل الهيدر — الإطفاء الفوري من اللوحة: إعدادات النظام ← إعلانات DMS أعلى الصفحات. SHOW_TOP_ADS بقي كقاطع طوارئ في الكود. */}
          {SHOW_TOP_ADS && (
            <>
              {/* DMS Ads - Leaderboard for desktop, MPU for mobile - تحت الكاروسيل */}
              <DmsLeaderboardAd />
              <DmsMpuAd topSlot />

              {/* Ad Banner Slot - Below Featured News */}
              <AdSlot slotId="header-banner" className="w-full" />
            </>
          )}
        </div>

        {/* AI Summary Section with soft gradient background - Lazy loaded */}
        <LazySection>
          <div className="bg-ai-gradient-soft py-8">
            <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="scroll-fade-in">
                <SmartSummaryBlock />
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

        {/* بلوك قناة الصحراء — أسفل بلوك آخر/جميع الأخبار */}
        <ErrorBoundary fallback={null}>
          <Suspense fallback={null}>
            <SahraaTvBlock />
          </Suspense>
        </ErrorBoundary>

        {/* Quad Categories Block - 4 category columns - Below Smart News */}
        <LazySection>
          <QuadCategoriesBlock enabled={true} />
        </LazySection>

        {/* Weekly AI Insights - directly below the quad categories block */}
        <LazySection>
          <div className="bg-ai-gradient-soft py-8">
            <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="scroll-fade-in">
                <AIInsightsBlock enabled={true} />
              </div>
            </div>
          </div>
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
