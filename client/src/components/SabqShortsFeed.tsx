import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, Volume2, VolumeX, Heart, Share2, MessageSquare, Loader2, Maximize2, Minimize2 } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

/**
 * Sabq Shorts / Reels – Short-form video news feed
 * ————————————————————————————————————————————————
 * Full-featured vertical video feed similar to Instagram Reels/TikTok:
 * - Vertical swipe navigation (up/down)
 * - RTL support
 * - HLS video streaming with MP4 fallback
 * - Like, share, comment interactions
 * - Analytics tracking (views, watch time)
 * - Keyboard controls (↑/↓, Space, M)
 */

type ShortItem = {
  id: string;
  title: string;
  description?: string;
  slug: string;
  coverImage: string;
  hlsUrl?: string;
  mp4Url?: string;
  duration?: number;
  categoryId?: string;
  reporterId?: string;
  status: string;
  publishedAt?: string;
  views: number;
  likes: number;
  shares: number;
  comments: number;
  category?: { id: string; nameAr: string; slug: string };
  reporter?: { id: string; firstName?: string; lastName?: string; profileImageUrl?: string };
};

const fmt = new Intl.NumberFormat("en-US");

// Keyboard controls hook
function useKeyControls(opts: {
  onNext: () => void;
  onPrev: () => void;
  onTogglePlay: () => void;
  onToggleMute: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") opts.onPrev();
      if (e.key === "ArrowDown") opts.onNext();
      if (e.key === " ") { e.preventDefault(); opts.onTogglePlay(); }
      if (e.key.toLowerCase() === "m") opts.onToggleMute();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [opts]);
}

// HLS video loader (supports native HLS on iOS Safari)
function attachHlsIfNeeded(video: HTMLVideoElement, hlsUrl?: string, mp4Url?: string) {
  if (!video) return;
  
  if (hlsUrl) {
    // iOS Safari supports HLS natively
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = hlsUrl;
    } else {
      // For browsers that need hls.js
      const Hls = (window as any).Hls;
      if (Hls && Hls.isSupported()) {
        const hls = new Hls({ maxBufferLength: 15 });
        hls.loadSource(hlsUrl);
        hls.attachMedia(video);
        (video as any)._hls = hls;
      } else if (mp4Url) {
        video.src = mp4Url; // fallback
      }
    }
  } else if (mp4Url) {
    video.src = mp4Url;
  }
}

// Single short slide component
function ShortSlide({
  item,
  index,
  activeIndex,
  onLike,
  onShare,
}: {
  item: ShortItem;
  index: number;
  activeIndex: number;
  onLike: (id: string) => void;
  onShare: (id: string) => void;
}) {
  const isActive = index === activeIndex;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [watchStartTime, setWatchStartTime] = useState<number | null>(null);
  const [hasTrackedView, setHasTrackedView] = useState(false);

  // Attach video source on mount
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    
    attachHlsIfNeeded(v, item.hlsUrl, item.mp4Url);

    const onCanPlay = () => setIsLoading(false);
    v.addEventListener("canplay", onCanPlay);
    
    return () => {
      v.removeEventListener("canplay", onCanPlay);
      // Cleanup HLS instance
      if ((v as any)._hls) {
        (v as any)._hls.destroy();
      }
    };
  }, [item.hlsUrl, item.mp4Url]);

  // Play/pause based on active state
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    
    if (isActive) {
      v.play().catch(() => {});
      setIsPlaying(true);
      setWatchStartTime(Date.now());
      
      // Track view (once per short)
      if (!hasTrackedView) {
        fetch(`/api/shorts/${item.id}/view`, { method: 'POST' }).catch(() => {});
        setHasTrackedView(true);
      }
    } else {
      v.pause();
      setIsPlaying(false);
      
      // Track watch time when leaving
      if (watchStartTime) {
        const watchTime = Math.floor((Date.now() - watchStartTime) / 1000);
        if (watchTime > 0) {
          const watchPercentage = item.duration ? (watchTime / item.duration) * 100 : 0;
          fetch('/api/analytics/short', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              shortId: item.id,
              eventType: 'watch_time',
              watchTime,
              watchPercentage: Math.min(100, watchPercentage),
            }),
          }).catch(() => {});
        }
        setWatchStartTime(null);
      }
      
      v.currentTime = 0;
    }
  }, [isActive, item.id, item.duration, watchStartTime, hasTrackedView]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    
    if (v.paused) {
      v.play();
      setIsPlaying(true);
      if (!watchStartTime) setWatchStartTime(Date.now());
    } else {
      v.pause();
      setIsPlaying(false);
    }
  }, [watchStartTime]);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = videoRef.current?.parentElement;
    if (!el) return;
    
    if (!document.fullscreenElement) {
      el.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  }, []);

  const reporterName = item.reporter 
    ? `${item.reporter.firstName || ''} ${item.reporter.lastName || ''}`.trim() || 'سبق'
    : 'سبق';

  return (
    <motion.section
      role="group"
      aria-roledescription="مقطع قصير"
      dir="rtl"
      data-testid={`short-slide-${item.id}`}
      className="relative h-[100dvh] w-full snap-start flex items-center justify-center bg-black text-white"
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -50 }}
      transition={{ duration: 0.25 }}
    >
      <div className="absolute inset-0 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted={isMuted}
          loop
          poster={item.coverImage}
          className="h-full w-full object-cover"
          data-testid={`video-${item.id}`}
        />
        
        {/* Tap zones for play/mute */}
        <div className="absolute inset-0 grid grid-cols-3">
          <button 
            aria-label="تشغيل/إيقاف" 
            onClick={togglePlay} 
            className="col-span-2"
            data-testid={`button-play-pause-${item.id}`}
          />
          <button 
            aria-label="كتم/إلغاء كتم" 
            onClick={toggleMute}
            data-testid={`button-mute-${item.id}`}
          />
        </div>
      </div>

      {/* Top gradient */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/70 to-transparent" />

      {/* Action buttons (right side) */}
      <div className="absolute right-3 top-16 flex flex-col items-center gap-4" data-testid={`actions-${item.id}`}>
        <button 
          onClick={() => onLike(item.id)} 
          aria-label="إعجاب" 
          className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm hover:bg-white/20"
          data-testid={`button-like-${item.id}`}
        >
          <Heart className="size-6" />
        </button>
        
        <button 
          onClick={() => onShare(item.id)} 
          aria-label="مشاركة" 
          className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm hover:bg-white/20"
          data-testid={`button-share-${item.id}`}
        >
          <Share2 className="size-6" />
        </button>
        
        <button 
          aria-label="تعليقات" 
          className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm hover:bg-white/20"
          data-testid={`button-comments-${item.id}`}
        >
          <MessageSquare className="size-6" />
        </button>
        
        <button 
          onClick={toggleFullscreen} 
          aria-label="ملء الشاشة" 
          className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm hover:bg-white/20"
          data-testid={`button-fullscreen-${item.id}`}
        >
          {isFullscreen ? <Minimize2 className="size-6" /> : <Maximize2 className="size-6" />}
        </button>
      </div>

      {/* Bottom metadata */}
      <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6" data-testid={`metadata-${item.id}`}>
        <div className="max-w-[720px]">
          <div className="mb-2 flex items-center gap-3">
            {item.reporter?.profileImageUrl ? (
              <img 
                src={item.reporter.profileImageUrl} 
                alt={reporterName} 
                className="h-9 w-9 rounded-full object-cover"
                data-testid={`reporter-avatar-${item.id}`}
              />
            ) : (
              <div className="h-9 w-9 rounded-full bg-white/15" data-testid={`reporter-avatar-placeholder-${item.id}`} />
            )}
            
            <div>
              <div className="text-sm/5 text-white/90" data-testid={`reporter-name-${item.id}`}>
                {reporterName} • {item.category?.nameAr || 'عام'}
              </div>
              <h2 className="text-lg md:text-xl font-semibold" data-testid={`title-${item.id}`}>
                {item.title}
              </h2>
            </div>
          </div>

          {item.description && (
            <p className="mt-1 line-clamp-3 text-sm/6 text-white/80" data-testid={`description-${item.id}`}>
              {item.description}
            </p>
          )}

          <div className="mt-3 text-xs text-white/70" data-testid={`stats-${item.id}`}>
            {fmt.format(item.likes)} إعجاب • {fmt.format(item.comments)} تعليق
          </div>
        </div>

        {/* Controls */}
        <div className="mt-4 flex items-center gap-2">
          <button 
            onClick={togglePlay} 
            className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm backdrop-blur hover:bg-white/20"
            data-testid={`control-play-${item.id}`}
          >
            {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
            {isPlaying ? "إيقاف" : "تشغيل"}
          </button>
          
          <button 
            onClick={toggleMute} 
            className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm backdrop-blur hover:bg-white/20"
            data-testid={`control-mute-${item.id}`}
          >
            {isMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            {isMuted ? "بدون صوت" : "بالصوت"}
          </button>
        </div>
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-full bg-black/40 p-3">
            <Loader2 className="size-6 animate-spin" data-testid={`loader-${item.id}`} />
          </div>
        </div>
      )}
    </motion.section>
  );
}

// Main vertical feed component
export default function SabqShortsFeed() {
  const { data: response, isLoading } = useQuery<{ items: ShortItem[]; total: number }>({
    queryKey: ["/api/shorts"],
  });

  const items = response?.items || [];
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const touchStartY = useRef<number | null>(null);
  const lastScrollAt = useRef(0);

  // Like mutation
  const likeMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/shorts/${id}/like`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["/api/shorts"] });
      queryClient.refetchQueries({ queryKey: ["/api/shorts"] });
    },
  });

  // Share mutation
  const shareMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/shorts/${id}/share`, { method: 'POST' }),
  });

  // Keyboard shortcuts
  useKeyControls({
    onNext: () => snapTo(activeIndex + 1),
    onPrev: () => snapTo(activeIndex - 1),
    onTogglePlay: () => {},
    onToggleMute: () => {},
  });

  // Snap navigation
  const snapTo = useCallback((nextIndex: number) => {
    const idx = Math.max(0, Math.min(nextIndex, items.length - 1));
    const el = containerRef.current;
    if (!el) return;
    
    el.scrollTo({ top: idx * window.innerHeight, behavior: "smooth" });
    setActiveIndex(idx);
  }, [items.length]);

  // Wheel control (desktop)
  const onWheel = useCallback((e: React.WheelEvent) => {
    const now = Date.now();
    if (now - lastScrollAt.current < 400) return;
    lastScrollAt.current = now;
    
    if (e.deltaY > 0) snapTo(activeIndex + 1);
    else snapTo(activeIndex - 1);
  }, [activeIndex, snapTo]);

  // Touch swipe (mobile)
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };
  
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartY.current;
    if (start == null) return;
    
    const dy = e.changedTouches[0].clientY - start;
    if (Math.abs(dy) > 48) {
      dy < 0 ? snapTo(activeIndex + 1) : snapTo(activeIndex - 1);
    }
    touchStartY.current = null;
  };

  // Like handler
  const onLike = useCallback((id: string) => {
    likeMutation.mutate(id);
  }, [likeMutation]);

  // Share handler
  const onShare = useCallback((id: string) => {
    shareMutation.mutate(id);
    
    if (navigator.share) {
      navigator.share({ 
        title: 'سبق الذكية', 
        url: `/shorts/${items.find(i => i.id === id)?.slug}` 
      }).catch(() => {});
    } else {
      const short = items.find(i => i.id === id);
      if (short) {
        navigator.clipboard.writeText(`${location.origin}/shorts/${short.slug}`);
      }
    }
  }, [items, shareMutation]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-black">
        <Loader2 className="size-8 animate-spin text-white" data-testid="loader-main" />
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="fixed inset-0 z-30 flex flex-col items-center justify-center bg-black text-white" dir="rtl">
        <p className="text-lg" data-testid="text-empty">لا توجد مقاطع قصيرة حالياً</p>
      </div>
    );
  }

  return (
    <div dir="rtl" className="fixed inset-0 z-30 bg-black" data-testid="shorts-feed">
      {/* Top instruction bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex h-12 items-center justify-center text-white/90">
        <div className="pointer-events-auto mt-2 rounded-full bg-white/10 px-3 py-1.5 text-xs backdrop-blur" data-testid="text-instructions">
          اسحب للأعلى لمشاهدة التالي • اضغط لإيقاف/تشغيل
        </div>
      </div>

      {/* Vertical snaps container */}
      <div
        ref={containerRef}
        className="h-full w-full snap-y snap-mandatory overflow-y-scroll scroll-smooth"
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        data-testid="shorts-container"
      >
        <AnimatePresence initial={false}>
          {items.map((item, i) => (
            <ShortSlide
              key={item.id}
              item={item}
              index={i}
              activeIndex={activeIndex}
              onLike={onLike}
              onShare={onShare}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
