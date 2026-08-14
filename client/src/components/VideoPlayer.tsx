import { useState, useEffect, useRef } from "react";
import { Play, Loader2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoPlayerProps {
  videoUrl: string;
  thumbnailUrl?: string | null;
  title: string;
  className?: string;
}

type VideoType = "youtube" | "dailymotion" | "twitter" | "direct";

declare global {
  interface Window {
    twttr?: any;
  }
}

function getVideoType(url: string): VideoType {
  const clean = (url || "").trim().toLowerCase();
  if (clean.includes("youtube.com") || clean.includes("youtu.be")) {
    return "youtube";
  }
  if (clean.includes("dailymotion.com") || clean.includes("dai.ly")) {
    return "dailymotion";
  }
  if (clean.includes("x.com") || clean.includes("twitter.com")) {
    return "twitter";
  }
  return "direct";
}

function getYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i,
    /(?:youtube\.com\/shorts\/)([^"&?\/\s]{11})/i,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function getDailymotionId(url: string): string | null {
  const patterns = [
    /dailymotion\.com\/video\/([^_\n?#\/]+)/i,
    /dai\.ly\/([^_\n?#\/]+)/i,
    /dailymotion\.com\/embed\/video\/([^_\n?#\/]+)/i,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function getTwitterId(url: string): string | null {
  const clean = url.trim();
  const match = clean.match(/(?:x\.com|twitter\.com)\/(?:[A-Za-z0-9_]{1,15}|i)\/status(?:es)?\/(\d{5,25})/i);
  return match ? match[1] : null;
}

function getYouTubeThumbnail(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

function getDailymotionThumbnail(videoId: string): string {
  return `https://www.dailymotion.com/thumbnail/video/${videoId}`;
}

function TwitterVideoEmbed({ tweetId, title }: { tweetId: string; title: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let mounted = true;

    const renderTweet = () => {
      if (!containerRef.current || !window.twttr?.widgets) return;
      containerRef.current.innerHTML = "";
      const isDark = document.documentElement.classList.contains("dark");

      const createMethod = window.twttr.widgets.createVideo || window.twttr.widgets.createTweet;
      createMethod(tweetId, containerRef.current, {
        theme: isDark ? "dark" : "light",
        align: "center",
        conversation: "none",
        dnt: true,
      })
        .then((el: HTMLElement | null) => {
          if (!mounted) return;
          if (el) {
            setLoading(false);
          } else {
            // Fallback to createTweet if createVideo was not applicable
            if (createMethod !== window.twttr.widgets.createTweet) {
              window.twttr.widgets.createTweet(tweetId, containerRef.current, {
                theme: isDark ? "dark" : "light",
                align: "center",
                conversation: "none",
                dnt: true,
              }).then((tweetEl: HTMLElement | null) => {
                if (!mounted) return;
                setLoading(false);
                if (!tweetEl) setFailed(true);
              }).catch(() => {
                if (!mounted) return;
                setLoading(false);
                setFailed(true);
              });
            } else {
              setLoading(false);
              setFailed(true);
            }
          }
        })
        .catch(() => {
          if (!mounted) return;
          setLoading(false);
          setFailed(true);
        });
    };

    if (window.twttr?.widgets) {
      renderTweet();
    } else {
      const existing = document.querySelector('script[src="https://platform.twitter.com/widgets.js"]');
      if (!existing) {
        const script = document.createElement("script");
        script.src = "https://platform.twitter.com/widgets.js";
        script.async = true;
        script.charset = "utf-8";
        script.onload = () => {
          if (mounted) renderTweet();
        };
        script.onerror = () => {
          if (mounted) {
            setLoading(false);
            setFailed(true);
          }
        };
        document.body.appendChild(script);
      } else {
        const interval = setInterval(() => {
          if (window.twttr?.widgets) {
            clearInterval(interval);
            if (mounted) renderTweet();
          }
        }, 100);
        setTimeout(() => {
          clearInterval(interval);
          if (mounted && loading) {
            setLoading(false);
            setFailed(true);
          }
        }, 5000);
      }
    }

    return () => {
      mounted = false;
    };
  }, [tweetId]);

  return (
    <div className="relative w-full min-h-[300px] flex flex-col items-center justify-center bg-black/5 dark:bg-black/20 rounded-lg p-2 sm:p-4">
      {loading && (
        <div className="flex flex-col items-center gap-2 text-muted-foreground py-12" data-testid="twitter-video-loading">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <span className="text-xs font-medium">جاري تحميل الفيديو من منصة X...</span>
        </div>
      )}
      <div
        ref={containerRef}
        className={cn("w-full max-w-[550px] flex justify-center", loading && "hidden")}
        data-testid="twitter-video-container"
      />
      {failed && !loading && (
        <div className="py-8 text-center text-sm space-y-2">
          <p className="text-muted-foreground">تعذر تضمين مشغل الفيديو مباشرة.</p>
          <a
            href={`https://x.com/i/status/${tweetId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary font-medium hover:underline bg-primary/10 px-3 py-1.5 rounded-md"
          >
            <span>فتح الفيديو على منصة X</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      )}
    </div>
  );
}

export function VideoPlayer({ videoUrl, thumbnailUrl, title, className }: VideoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  
  const videoType = getVideoType(videoUrl);
  
  let autoThumbnail: string | null = null;
  let embedUrl: string | null = null;
  let twitterTweetId: string | null = null;
  
  if (videoType === "youtube") {
    const videoId = getYouTubeId(videoUrl);
    if (videoId) {
      autoThumbnail = getYouTubeThumbnail(videoId);
      embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
    }
  } else if (videoType === "dailymotion") {
    const videoId = getDailymotionId(videoUrl);
    if (videoId) {
      autoThumbnail = getDailymotionThumbnail(videoId);
      embedUrl = `https://geo.dailymotion.com/player.html?video=${videoId}&autoplay=1`;
    }
  } else if (videoType === "twitter") {
    twitterTweetId = getTwitterId(videoUrl);
  }
  
  const displayThumbnail = thumbnailUrl || autoThumbnail || "/placeholder-video.jpg";
  
  const handlePlay = () => {
    setIsPlaying(true);
  };
  
  if (isPlaying) {
    if (videoType === "twitter" && twitterTweetId) {
      return (
        <div className={cn("relative w-full rounded-lg overflow-hidden", className)}>
          <TwitterVideoEmbed tweetId={twitterTweetId} title={title} />
        </div>
      );
    }

    if (videoType === "direct") {
      return (
        <div className={cn("relative w-full rounded-lg overflow-hidden bg-black", className)}>
          <video
            src={videoUrl}
            poster={displayThumbnail}
            controls
            autoPlay
            playsInline
            className="w-full aspect-video"
            data-testid="video-player-direct"
          >
            <track kind="captions" />
            المتصفح لا يدعم تشغيل الفيديو
          </video>
        </div>
      );
    }
    
    if (embedUrl) {
      return (
        <div className={cn("relative w-full rounded-lg overflow-hidden bg-black", className)}>
          <iframe
            src={embedUrl}
            title={title}
            className="w-full aspect-video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            data-testid="video-player-embed"
          />
        </div>
      );
    }
  }
  
  return (
    <div 
      className={cn(
        "relative w-full rounded-lg overflow-hidden cursor-pointer group",
        className
      )}
      onClick={handlePlay}
      data-testid="video-player-thumbnail"
    >
      <div className="relative aspect-video bg-muted">
        <img
          src={displayThumbnail}
          alt={title}
          className="w-full h-full object-cover"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            if (autoThumbnail && target.src !== autoThumbnail) {
              target.src = autoThumbnail;
            }
          }}
        />
        
        <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-colors" />
        
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-primary/90 group-hover:bg-primary group-hover:scale-110 transition-all duration-300 flex items-center justify-center shadow-lg">
            <Play className="h-8 w-8 sm:h-10 sm:w-10 text-primary-foreground fill-current mr-[-2px]" />
          </div>
        </div>
        
        <div className="absolute bottom-0 start-0 end-0 p-3 sm:p-4 bg-gradient-to-t from-black/70 to-transparent">
          <span className="text-white text-xs sm:text-sm font-medium">
            {videoType === "youtube" && "YouTube"}
            {videoType === "dailymotion" && "Dailymotion"}
            {videoType === "twitter" && "منصة X (تويتر)"}
            {videoType === "direct" && "فيديو"}
          </span>
        </div>
      </div>
    </div>
  );
}
