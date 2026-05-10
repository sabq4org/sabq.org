import { useState } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoPlayerProps {
  videoUrl: string;
  thumbnailUrl?: string | null;
  title: string;
  className?: string;
}

type VideoType = "youtube" | "dailymotion" | "direct";

function getVideoType(url: string): VideoType {
  if (url.includes("youtube.com") || url.includes("youtu.be")) {
    return "youtube";
  }
  if (url.includes("dailymotion.com") || url.includes("dai.ly")) {
    return "dailymotion";
  }
  return "direct";
}

function getYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function getDailymotionId(url: string): string | null {
  const patterns = [
    /dailymotion\.com\/video\/([^_\n?#]+)/,
    /dai\.ly\/([^_\n?#]+)/,
    /dailymotion\.com\/embed\/video\/([^_\n?#]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function getYouTubeThumbnail(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

function getDailymotionThumbnail(videoId: string): string {
  return `https://www.dailymotion.com/thumbnail/video/${videoId}`;
}

export function VideoPlayer({ videoUrl, thumbnailUrl, title, className }: VideoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  
  const videoType = getVideoType(videoUrl);
  
  let autoThumbnail: string | null = null;
  let embedUrl: string | null = null;
  
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
      // Use geo.dailymotion.com for better compatibility (new Dailymotion player)
      embedUrl = `https://geo.dailymotion.com/player.html?video=${videoId}&autoplay=1`;
    }
  }
  
  const displayThumbnail = thumbnailUrl || autoThumbnail || "/placeholder-video.jpg";
  
  const handlePlay = () => {
    setIsPlaying(true);
  };
  
  if (isPlaying) {
    if (videoType === "direct") {
      return (
        <div className={cn("relative w-full rounded-lg overflow-hidden bg-black", className)}>
          <video
            src={videoUrl}
            controls
            autoPlay
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
            {videoType === "direct" && "فيديو"}
          </span>
        </div>
      </div>
    </div>
  );
}
