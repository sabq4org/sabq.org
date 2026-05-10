import { useRef, useState, useEffect, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX, RotateCcw, RotateCw, Download, Share2, BarChart2, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface AudioPlayerProps {
  newsletterId: string;
  audioUrl: string;
  title: string;
  duration?: number;
  autoPlay?: boolean;
  showWaveform?: boolean;
  showDownload?: boolean;
  showShare?: boolean;
  className?: string;
}

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export function AudioPlayer({
  newsletterId,
  audioUrl,
  title,
  duration: propDuration,
  autoPlay = false,
  showWaveform = true,
  showDownload = true,
  showShare = true,
  className,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const { toast } = useToast();
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(propDuration || 0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isLoading, setIsLoading] = useState(!propDuration);
  const [hasTrackedListen, setHasTrackedListen] = useState(false);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  // Format time in MM:SS
  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Initialize audio context and analyser for waveform
  useEffect(() => {
    if (showWaveform && audioRef.current && !audioContext) {
      const context = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyserNode = context.createAnalyser();
      analyserNode.fftSize = 256;
      
      const source = context.createMediaElementSource(audioRef.current);
      source.connect(analyserNode);
      analyserNode.connect(context.destination);
      
      setAudioContext(context);
      setAnalyser(analyserNode);
    }

    return () => {
      if (audioContext) {
        audioContext.close();
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [showWaveform]);

  // Get computed primary color from CSS variable
  const getPrimaryColor = useCallback(() => {
    if (typeof window === 'undefined') return { h: 262, s: 83, l: 58 };
    
    const root = document.documentElement;
    const primaryValue = getComputedStyle(root).getPropertyValue('--primary').trim();
    
    if (!primaryValue) return { h: 262, s: 83, l: 58 }; // Default primary color
    
    // Parse HSL values (format: "262 83% 58%")
    const parts = primaryValue.split(' ');
    return {
      h: parseInt(parts[0]) || 262,
      s: parseInt(parts[1]) || 83,
      l: parseInt(parts[2]) || 58,
    };
  }, []);

  // Draw waveform visualization
  const drawWaveform = useCallback(() => {
    if (!canvasRef.current || !analyser) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    ctx.fillStyle = "rgb(0, 0, 0, 0)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const barWidth = (canvas.width / bufferLength) * 2.5;
    let barHeight;
    let x = 0;

    // Get actual primary color values
    const primary = getPrimaryColor();

    for (let i = 0; i < bufferLength; i++) {
      barHeight = (dataArray[i] / 255) * canvas.height * 0.8;
      
      // Use primary color with opacity - Canvas needs actual color values
      const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
      gradient.addColorStop(0, `hsla(${primary.h}, ${primary.s}%, ${primary.l}%, 0.8)`);
      gradient.addColorStop(1, `hsla(${primary.h}, ${primary.s}%, ${primary.l}%, 0.3)`);
      ctx.fillStyle = gradient;
      
      ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
      x += barWidth + 1;
    }

    if (isPlaying) {
      animationRef.current = requestAnimationFrame(drawWaveform);
    }
  }, [analyser, isPlaying, getPrimaryColor]);

  useEffect(() => {
    if (isPlaying && showWaveform) {
      drawWaveform();
    } else if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  }, [isPlaying, drawWaveform, showWaveform]);

  // Track listen event after 5 seconds of playback
  useEffect(() => {
    if (isPlaying && currentTime >= 5 && !hasTrackedListen) {
      trackListenEvent();
      setHasTrackedListen(true);
    }
  }, [isPlaying, currentTime, hasTrackedListen]);

  const trackListenEvent = async () => {
    try {
      await apiRequest(`/api/audio-newsletters/${newsletterId}/listen`, {
        method: "POST",
        body: JSON.stringify({
          duration: Math.floor(currentTime),
          completionRate: duration > 0 ? (currentTime / duration) * 100 : 0,
        }),
      });
    } catch (error) {
      console.error("Failed to track listen event:", error);
    }
  };

  // Audio element event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      setIsLoading(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      trackListenEvent();
    };

    const handleCanPlay = () => {
      setIsLoading(false);
      if (autoPlay) {
        audio.play().catch(console.error);
      }
    };

    const handleWaiting = () => {
      setIsLoading(true);
    };

    const handlePlaying = () => {
      setIsLoading(false);
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("playing", handlePlaying);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("playing", handlePlaying);
    };
  }, [autoPlay]);

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audioContext?.state === "suspended") {
      audioContext.resume();
    }

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(console.error);
    }
    setIsPlaying(!isPlaying);
  };

  const handleProgressChange = (value: number[]) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newTime = value[0];
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleVolumeChange = (value: number[]) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newVolume = value[0];
    audio.volume = newVolume;
    setVolume(newVolume);
    if (newVolume > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isMuted) {
      audio.volume = volume;
      setIsMuted(false);
    } else {
      audio.volume = 0;
      setIsMuted(true);
    }
  };

  const changePlaybackSpeed = (speed: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.playbackRate = speed;
    setPlaybackSpeed(speed);
  };

  const skipTime = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + seconds));
  };

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = audioUrl;
    link.download = `${title}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: "جاري التحميل",
      description: "سيبدأ تحميل الملف الصوتي قريباً",
    });
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: title,
          text: `استمع إلى: ${title}`,
          url: window.location.href,
        });
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error("Share failed:", error);
        }
      }
    } else {
      // Fallback: copy link
      await navigator.clipboard.writeText(window.location.href);
      toast({
        title: "تم النسخ",
        description: "تم نسخ الرابط إلى الحافظة",
      });
    }
  };

  if (isLoading && !duration) {
    return (
      <div className={cn("w-full space-y-4 p-4 border rounded-lg", className)} dir="rtl">
        <Skeleton className="h-10 w-full" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-10 w-20" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "w-full p-4 border rounded-lg bg-card space-y-4",
        className
      )}
      dir="rtl"
      role="region"
      aria-label={`مشغل صوتي لـ ${title}`}
    >
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      {/* Title and Action Buttons */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium truncate flex-1" data-testid="text-audio-title">
          {title}
        </div>
        <div className="flex items-center gap-1">
          {showDownload && (
            <Button
              size="icon"
              variant="ghost"
              onClick={handleDownload}
              className="h-8 w-8"
              data-testid="button-download"
              aria-label="تحميل"
            >
              <Download className="h-4 w-4" />
            </Button>
          )}
          {showShare && (
            <Button
              size="icon"
              variant="ghost"
              onClick={handleShare}
              className="h-8 w-8"
              data-testid="button-share"
              aria-label="مشاركة"
            >
              <Share2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Waveform Visualization */}
      {showWaveform && (
        <div className="relative h-16 bg-muted/30 rounded-lg overflow-hidden">
          <canvas
            ref={canvasRef}
            width={800}
            height={64}
            className="absolute inset-0 w-full h-full"
            data-testid="canvas-waveform"
          />
          {!isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Activity className="h-8 w-8 text-muted-foreground/50" />
            </div>
          )}
        </div>
      )}

      {/* Progress Bar */}
      <div className="space-y-2">
        <Slider
          value={[currentTime]}
          max={duration || 100}
          step={0.1}
          onValueChange={handleProgressChange}
          className="cursor-pointer"
          dir="ltr"
          data-testid="slider-progress"
          aria-label="شريط التقدم"
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span data-testid="text-current-time">{formatTime(currentTime)}</span>
          <span data-testid="text-duration">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        {/* Play/Pause Button */}
        <Button
          size="icon"
          variant="default"
          onClick={togglePlayPause}
          disabled={isLoading}
          className="h-10 w-10"
          data-testid="button-play-pause"
          aria-label={isPlaying ? "إيقاف مؤقت" : "تشغيل"}
        >
          {isLoading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
          ) : isPlaying ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5" />
          )}
        </Button>

        {/* Skip Backward */}
        <Button
          size="icon"
          variant="ghost"
          onClick={() => skipTime(-10)}
          className="h-9 w-9"
          data-testid="button-skip-backward"
          aria-label="العودة 10 ثواني"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>

        {/* Skip Forward */}
        <Button
          size="icon"
          variant="ghost"
          onClick={() => skipTime(10)}
          className="h-9 w-9"
          data-testid="button-skip-forward"
          aria-label="التقدم 10 ثواني"
        >
          <RotateCw className="h-4 w-4" />
        </Button>

        {/* Playback Speed */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="h-9 px-3"
              data-testid="button-playback-speed"
              aria-label={`سرعة التشغيل: ${playbackSpeed}x`}
            >
              {playbackSpeed}x
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <div className="px-2 py-1.5 text-sm font-semibold">سرعة التشغيل</div>
            <DropdownMenuSeparator />
            {PLAYBACK_SPEEDS.map((speed) => (
              <DropdownMenuItem
                key={speed}
                onClick={() => changePlaybackSpeed(speed)}
                data-testid={`menuitem-speed-${speed}`}
                className={cn(
                  "cursor-pointer",
                  playbackSpeed === speed && "bg-accent"
                )}
              >
                <span className="flex items-center justify-between w-full">
                  {speed}x
                  {speed === 1 && <span className="text-xs text-muted-foreground mr-2">عادي</span>}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Volume Control */}
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            onClick={toggleMute}
            className="h-9 w-9"
            data-testid="button-mute-toggle"
            aria-label={isMuted ? "إلغاء الكتم" : "كتم الصوت"}
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </Button>
          <Slider
            value={[isMuted ? 0 : volume]}
            max={1}
            step={0.01}
            onValueChange={handleVolumeChange}
            className="w-20 cursor-pointer"
            dir="ltr"
            data-testid="slider-volume"
            aria-label="مستوى الصوت"
          />
        </div>
      </div>
    </div>
  );
}