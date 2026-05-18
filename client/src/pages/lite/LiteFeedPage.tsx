import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { SwipeCard } from "@/components/lite/SwipeCard";
import { LiteModeAdSlot, useLiteModeAdTracking, forceTriggerAdsWhenReady } from "@/components/DmsAdSlot";
import { 
  Newspaper, 
  Loader2,
  RefreshCw,
  RotateCcw,
  User as UserIcon,
  MousePointerClick,
  ChevronUp,
  LayoutGrid
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { apiRequest, trackBeacon } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import type { Article, Category, User } from "@shared/schema";
import sabqLogo from "@assets/sabq-logo.png";

type ArticleWithDetails = Article & {
  category?: Category;
  author?: User;
  commentsCount?: number;
  reactionsCount?: number;
};

type FeedItem = 
  | { type: 'article'; data: ArticleWithDetails }
  | { type: 'dms_ad'; data: { index: number } };

interface AdSlideWrapperProps {
  position: 'current' | 'next' | 'previous';
  dragOffset: number;
  onDragStart: () => void;
  onDragMove: (offset: number) => void;
  onDragEnd: () => void;
  adIndex: number;
}

function AdSlideWrapper({ position, dragOffset, onDragStart, onDragMove, onDragEnd, adIndex }: AdSlideWrapperProps) {
  const startYRef = useRef(0);
  const isDraggingRef = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startYRef.current = e.touches[0].clientY;
    isDraggingRef.current = true;
    onDragStart();
  }, [onDragStart]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDraggingRef.current) return;
    const currentY = e.touches[0].clientY;
    const offset = currentY - startYRef.current;
    onDragMove(offset);
  }, [onDragMove]);

  const handleTouchEnd = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    onDragEnd();
  }, [onDragEnd]);

  return (
    <div 
      className="absolute inset-0 flex items-center justify-center bg-black touch-none"
      style={{
        transform: position === 'current' 
          ? `translateY(${dragOffset}px)` 
          : position === 'next' 
            ? `translateY(${100 + (dragOffset > 0 ? 0 : dragOffset / 10)}vh)` 
            : `translateY(${-100 + (dragOffset < 0 ? 0 : dragOffset / 10)}vh)`,
        zIndex: position === 'current' ? 10 : 5
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="w-full h-full flex items-center justify-center p-4 pointer-events-none">
        <LiteModeAdSlot index={adIndex} />
      </div>
    </div>
  );
}

export default function LiteFeedPage() {
  const [, setLocation] = useLocation();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showBackToStart, setShowBackToStart] = useState(false);
  const [showDoubleTapHint, setShowDoubleTapHint] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const animationRef = useRef<number | null>(null);
  const viewDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastTapRef = useRef<number>(0);
  const hintShownCountRef = useRef<number>(0);
  const logoLongPressRef = useRef<NodeJS.Timeout | null>(null);
  const prevIndexRef = useRef<number>(0);
  const triggeredAdsRef = useRef<Set<number>>(new Set());
  
  const PULL_TO_REFRESH_THRESHOLD = 100;

  const { user, isAuthenticated } = useAuth();
  
  // DMS Ad tracking for Lite Mode
  useLiteModeAdTracking();

  const handleLogoTouchStart = useCallback(() => {
    logoLongPressRef.current = setTimeout(() => {
      setLocation('/');
    }, 800);
  }, [setLocation]);

  const handleLogoTouchEnd = useCallback(() => {
    if (logoLongPressRef.current) {
      clearTimeout(logoLongPressRef.current);
      logoLongPressRef.current = null;
    }
  }, []);

  const { data: articlesRaw, isLoading, refetch } = useQuery<ArticleWithDetails[]>({
    queryKey: ["/api/lite-feed"],
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
  const articles = Array.isArray(articlesRaw) ? articlesRaw : [];

  // Mark initial load as complete after articles are fetched
  useEffect(() => {
    if (articles.length > 0 && !initialLoadComplete) {
      setInitialLoadComplete(true);
    }
  }, [articles, initialLoadComplete]);

  const { data: personalizedData } = useQuery<{ articles: ArticleWithDetails[] }>({
    queryKey: ["/api/personal-feed"],
    enabled: isAuthenticated && initialLoadComplete,
    staleTime: 5 * 60 * 1000,
  });

  const personalizedArticleIds = useMemo(() => {
    if (!personalizedData?.articles) return new Set<string>();
    return new Set(personalizedData?.articles?.map(a => a.id));
  }, [personalizedData]);

  const sortedArticles = useMemo(() => {
    return [...articles].sort((a, b) => {
      const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return dateB - dateA;
    });
  }, [articles]);

  const feedItems: FeedItem[] = useMemo(() => {
    const items: FeedItem[] = [];
    let dmsAdIndex = 0;
    
    sortedArticles.forEach((article, index) => {
      items.push({ type: 'article', data: article });

      // 1 DMS ad after every 10th news card (was every 5th). DMS asked
      // for a lower frequency on 2026-05-18 — the empty slots between
      // every 5 cards were hurting UX without improving fill. Still
      // dense enough that an average session passes ~2-3 ad slots.
      if ((index + 1) % 10 === 0 && index < sortedArticles.length - 1) {
        items.push({ type: 'dms_ad', data: { index: dmsAdIndex } });
        dmsAdIndex++;
      }
    });
    
    return items;
  }, [sortedArticles]);

  // Preload ONLY the next image for smoother swiping (minimized for performance)
  useEffect(() => {
    const nextIndex = currentIndex + 1;
    if (nextIndex < feedItems.length) {
      const item = feedItems[nextIndex];
      const imgUrl = item.type === 'article' 
        ? ((item.data as any).liteOptimizedImageUrl || (item.data as any).imageUrl)
        : null;
      if (imgUrl) {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.as = 'image';
        link.href = imgUrl;
        document.head.appendChild(link);
        return () => { document.head.removeChild(link); };
      }
    }
  }, [currentIndex, feedItems]);

  const handleDragStart = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    setIsAnimating(false);
  }, []);

  const handleDragMove = useCallback((offset: number) => {
    if (!isAnimating) {
      if (currentIndex === 0 && offset > 0) {
        setDragOffset(offset * 0.3);
      } else if (currentIndex >= feedItems.length - 1 && offset < 0) {
        setDragOffset(offset * 0.3);
      } else {
        setDragOffset(offset);
      }
    }
  }, [isAnimating, currentIndex, feedItems.length]);

  const handleDragEnd = useCallback(() => {
    if (isAnimating) return;

    const threshold = 80;
    const screenHeight = window.innerHeight;

    if (dragOffset < -threshold && currentIndex < feedItems.length - 1) {
      setIsAnimating(true);
      
      const animateOut = () => {
        setDragOffset(prev => {
          const next = prev - 60;
          if (next <= -screenHeight) {
            setCurrentIndex(i => i + 1);
            setDragOffset(0);
            setIsAnimating(false);
            return 0;
          }
          animationRef.current = requestAnimationFrame(animateOut);
          return next;
        });
      };
      animationRef.current = requestAnimationFrame(animateOut);
      
    } else if (dragOffset < -threshold && currentIndex >= feedItems.length - 1) {
      setIsAnimating(true);
      setShowBackToStart(true);
      
      const animateOut = () => {
        setDragOffset(prev => {
          const next = prev - 60;
          if (next <= -screenHeight) {
            setCurrentIndex(0);
            setDragOffset(0);
            setIsAnimating(false);
            setTimeout(() => setShowBackToStart(false), 1500);
            return 0;
          }
          animationRef.current = requestAnimationFrame(animateOut);
          return next;
        });
      };
      animationRef.current = requestAnimationFrame(animateOut);
      
    } else if (dragOffset > threshold && currentIndex > 0) {
      setIsAnimating(true);
      
      const animateOut = () => {
        setDragOffset(prev => {
          const next = prev + 60;
          if (next >= screenHeight) {
            setCurrentIndex(i => i - 1);
            setDragOffset(0);
            setIsAnimating(false);
            return 0;
          }
          animationRef.current = requestAnimationFrame(animateOut);
          return next;
        });
      };
      animationRef.current = requestAnimationFrame(animateOut);
      
    } else if (dragOffset > PULL_TO_REFRESH_THRESHOLD && currentIndex === 0) {
      // Pull-to-refresh when at first article
      setIsRefreshing(true);
      setIsAnimating(true);
      
      const animateBack = () => {
        setDragOffset(prev => {
          const next = prev * 0.8;
          if (Math.abs(next) < 2) {
            setDragOffset(0);
            // Perform refresh
            refetch().then(() => {
              setIsRefreshing(false);
              setIsAnimating(false);
            });
            return 0;
          }
          animationRef.current = requestAnimationFrame(animateBack);
          return next;
        });
      };
      animationRef.current = requestAnimationFrame(animateBack);
      
    } else {
      setIsAnimating(true);
      
      const animateBack = () => {
        setDragOffset(prev => {
          const next = prev * 0.8;
          if (Math.abs(next) < 2) {
            setIsAnimating(false);
            return 0;
          }
          animationRef.current = requestAnimationFrame(animateBack);
          return next;
        });
      };
      animationRef.current = requestAnimationFrame(animateBack);
    }
  }, [isAnimating, dragOffset, currentIndex, feedItems.length, PULL_TO_REFRESH_THRESHOLD, refetch]);

  const handleRefresh = useCallback(() => {
    setCurrentIndex(0);
    setDragOffset(0);
    refetch();
  }, [refetch]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isAnimating) return;
      
      if (e.key === "ArrowUp" && currentIndex < feedItems.length - 1) {
        setDragOffset(-100);
        setTimeout(() => handleDragEnd(), 10);
      } else if (e.key === "ArrowDown" && currentIndex > 0) {
        setDragOffset(100);
        setTimeout(() => handleDragEnd(), 10);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, feedItems.length, isAnimating, handleDragEnd]);

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (feedItems.length === 0) return;
    
    const currentItem = feedItems[currentIndex];
    if (!currentItem) return;
    
    if (viewDebounceRef.current) {
      clearTimeout(viewDebounceRef.current);
    }
    
    viewDebounceRef.current = setTimeout(() => {
      if (currentItem.type === 'article') {
        // Track article view via sendBeacon (with keepalive-fetch fallback)
        // so swipe-and-leave still records the last view. Always silent —
        // never show a toast for telemetry.
        try {
          trackBeacon(`/api/articles/${currentItem.data.id}/view`);
        } catch (error) {
          console.debug("Article view tracking failed (silent):", error);
        }
      } else if (currentItem.type === 'dms_ad') {
        // Trigger ads EVERY time an ad slide becomes visible (wait for slots, no guard)
        forceTriggerAdsWhenReady();
      }
    }, 500);
    
    return () => {
      if (viewDebounceRef.current) {
        clearTimeout(viewDebounceRef.current);
      }
    };
  }, [currentIndex, feedItems]);

  const articleOnlyIndex = useMemo(() => {
    if (feedItems.length === 0) return 0;
    let count = 0;
    for (let i = 0; i < currentIndex; i++) {
      if (feedItems[i]?.type === 'article') count++;
    }
    if (feedItems[currentIndex]?.type === 'article') count++;
    return count;
  }, [currentIndex, feedItems]);

  const handleDoubleTap = useCallback(() => {
    const now = Date.now();
    const timeSinceLastTap = now - lastTapRef.current;
    
    if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
      if (currentIndex > 0) {
        setShowBackToStart(true);
        setCurrentIndex(0);
        setDragOffset(0);
        setTimeout(() => setShowBackToStart(false), 1500);
      }
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  }, [currentIndex]);

  useEffect(() => {
    // Track swipe direction: only show hint when swiping forward (index increasing)
    const isSwipingForward = currentIndex > prevIndexRef.current;
    prevIndexRef.current = currentIndex;
    
    // Only show hint when:
    // - Not at first article (currentIndex > 0)
    // - At least 7 articles viewed
    // - Every 7 articles (7, 14, 21...)
    // - Swiping forward (not going back)
    // - Max 3 times total
    if (isSwipingForward && currentIndex > 0 && articleOnlyIndex >= 7 && articleOnlyIndex % 7 === 0 && hintShownCountRef.current < 3) {
      setShowDoubleTapHint(true);
      hintShownCountRef.current += 1;
      const timer = setTimeout(() => setShowDoubleTapHint(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [articleOnlyIndex, currentIndex]);

  // Show onboarding on first visit
  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem('hasSeenSwipeOnboarding');
    if (!hasSeenOnboarding) {
      setShowOnboarding(true);
      localStorage.setItem('hasSeenSwipeOnboarding', 'true');
      const timer = setTimeout(() => setShowOnboarding(false), 2500);
      return () => clearTimeout(timer);
    }
  }, []);

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-white animate-spin mx-auto mb-4" />
          <p className="text-white/70">جاري تحميل الأخبار...</p>
        </div>
      </div>
    );
  }

  if (sortedArticles.length === 0) {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center" dir="rtl">
        <div className="text-center p-8">
          <Newspaper className="h-16 w-16 text-white/50 mx-auto mb-4" />
          <h2 className="text-xl text-white font-bold mb-2">لا توجد أخبار</h2>
          <p className="text-white/70 mb-6">لم يتم العثور على أخبار حالياً</p>
          <Button onClick={handleRefresh} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            تحديث
          </Button>
        </div>
      </div>
    );
  }

  const currentItem = feedItems[currentIndex];
  const nextItem = feedItems[currentIndex + 1];
  const prevItem = feedItems[currentIndex - 1];

  const renderFeedItem = (item: FeedItem, position: 'current' | 'next' | 'previous', key: string) => {
    if (item.type === 'article') {
      const isPersonalized = isAuthenticated && personalizedArticleIds.has(item.data.id);
      return (
        <SwipeCard
          key={key}
          article={item.data}
          position={position}
          canGoBack={position === 'current' && currentIndex > 0}
          dragOffset={dragOffset}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          isPersonalized={isPersonalized}
        />
      );
    } else {
      // DMS Ad slot - render within a swipeable container with touch handlers
      return (
        <AdSlideWrapper
          key={key}
          position={position}
          dragOffset={dragOffset}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          adIndex={item.data.index}
        />
      );
    }
  };

  return (
    <div className="h-screen w-screen bg-black overflow-hidden flex flex-col">
      <div className="absolute top-4 right-4 z-30">
        <img 
          src={sabqLogo} 
          alt="سبق" 
          className="h-9 w-auto cursor-pointer select-none"
          data-testid="img-sabq-logo"
          onTouchStart={handleLogoTouchStart}
          onTouchEnd={handleLogoTouchEnd}
          onMouseDown={handleLogoTouchStart}
          onMouseUp={handleLogoTouchEnd}
          onMouseLeave={handleLogoTouchEnd}
          draggable={false}
        />
      </div>

      <div className="absolute top-4 left-4 z-30 flex items-center gap-2">
        {/* Button to go to full version */}
        <button
          onClick={() => setLocation('/')}
          className="w-9 h-9 flex items-center justify-center bg-white/10 backdrop-blur-sm rounded-full text-white/50 hover:text-white hover:bg-white/20 transition-all"
          data-testid="button-full-version"
          title="النسخة الكاملة"
        >
          <LayoutGrid className="h-4 w-4" />
        </button>
        
        {isAuthenticated && user && (
          <>
            {user.profileImageUrl ? (
              <img
                src={user.profileImageUrl}
                alt={user.name || 'صورة المستخدم'}
                className="w-9 h-9 rounded-full border-2 border-white/30 object-cover"
                data-testid="avatar-user"
              />
            ) : (
              <div 
                className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center border-2 border-white/30"
                data-testid="avatar-user"
                title={user.name || user.email || 'مستخدم'}
              >
                <UserIcon className="h-5 w-5 text-white" />
              </div>
            )}
          </>
        )}
      </div>

      {/* Top shadow gradient */}
      <div 
        className="absolute top-0 left-0 right-0 h-20 z-[25] pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.4) 40%, transparent 100%)'
        }}
      />

      <div className="flex-1 relative" onClick={handleDoubleTap}>
        {prevItem && renderFeedItem(prevItem, 'previous', `prev-${prevItem.type}-${prevItem.type === 'article' ? prevItem.data.id : prevItem.data.index}`)}

        {nextItem && renderFeedItem(nextItem, 'next', `next-${nextItem.type}-${nextItem.type === 'article' ? nextItem.data.id : nextItem.data.index}`)}

        {currentItem && renderFeedItem(currentItem, 'current', `current-${currentItem.type}-${currentItem.type === 'article' ? currentItem.data.id : currentItem.data.index}`)}

        {showBackToStart && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-30 pointer-events-none" dir="rtl">
            <div className="text-center animate-pulse">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-primary/30 flex items-center justify-center">
                <RotateCcw className="h-8 w-8 text-primary" />
              </div>
              <p className="text-white text-lg font-medium">عدت للبداية</p>
            </div>
          </div>
        )}

        {/* Onboarding overlay - shows on first visit */}
        <AnimatePresence>
          {showOnboarding && (
            <motion.div 
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="absolute inset-0 flex items-center justify-center bg-black/80 z-50 pointer-events-none"
              dir="rtl"
              data-testid="overlay-onboarding"
            >
              <div className="text-center">
                <motion.div
                  animate={{ y: [0, -30, 0] }}
                  transition={{ repeat: 3, duration: 0.6 }}
                  className="mb-4"
                >
                  <ChevronUp className="h-20 w-20 text-white mx-auto" />
                </motion.div>
                <p className="text-white text-2xl font-bold mb-2">اسحب للأعلى</p>
                <p className="text-white/70 text-base">لقراءة المزيد من الأخبار</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Pull-to-refresh indicator */}
        {currentIndex === 0 && dragOffset > 20 && (
          <div 
            className="absolute top-0 left-0 right-0 flex justify-center z-40 pointer-events-none"
            style={{ 
              transform: `translateY(${Math.min(dragOffset * 0.5, 80)}px)`,
              opacity: Math.min(dragOffset / PULL_TO_REFRESH_THRESHOLD, 1)
            }}
          >
            <div className="bg-white/20 backdrop-blur-sm rounded-full p-3">
              <RefreshCw 
                className={`h-6 w-6 text-white ${isRefreshing ? 'animate-spin' : ''}`}
                style={{ 
                  transform: `rotate(${Math.min(dragOffset * 2, 360)}deg)`,
                  transition: isRefreshing ? 'none' : 'transform 0.1s'
                }}
              />
            </div>
          </div>
        )}

        {isRefreshing && (
          <div className="absolute top-4 left-0 right-0 flex justify-center z-40 pointer-events-none">
            <div className="bg-white/20 backdrop-blur-sm rounded-full px-4 py-2 flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-white animate-spin" />
              <span className="text-white text-sm">جاري التحديث...</span>
            </div>
          </div>
        )}

        {showDoubleTapHint && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 animate-bounce" dir="rtl">
            <div className="bg-white/20 backdrop-blur-md rounded-full px-4 py-2 flex items-center gap-2">
              <MousePointerClick className="h-4 w-4 text-white" />
              <span className="text-white text-sm">اضغط مرتين للعودة للبداية</span>
            </div>
          </div>
        )}
      </div>

      {currentItem?.type === 'article' && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20">
          <div 
            className="bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 text-white/80 text-sm font-medium"
            data-testid="text-article-counter"
            dir="rtl"
          >
            {articleOnlyIndex} / {sortedArticles.length}
          </div>
        </div>
      )}


    </div>
  );
}
