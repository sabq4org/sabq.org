import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  ChevronUp,
  ChevronDown,
  ListMusic,
  Clock,
  Radio,
  X,
  Headphones,
  Download,
  Share2,
  Heart,
  HeartOff
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import type { AudioNewsletter } from '@shared/schema';

interface AudioWidgetState {
  currentNewsletters: AudioNewsletter[];
  currentIndex: number;
  isPlaying: boolean;
  isExpanded: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  isMuted: boolean;
  showPlaylist: boolean;
  autoPlay: boolean;
  playbackRate: number;
}

const STORAGE_KEY = 'sabq_audio_widget_state';
const PROGRESS_STORAGE_KEY = 'sabq_audio_progress';

export function HomeAudioWidget() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout>();
  const [isMinimized, setIsMinimized] = useState(false);
  
  // Load saved state from localStorage
  const [state, setState] = useState<AudioWidgetState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return {
      currentNewsletters: [],
      currentIndex: 0,
      isPlaying: false,
      isExpanded: false,
      volume: 0.7,
      currentTime: 0,
      duration: 0,
      isMuted: false,
      showPlaylist: false,
      autoPlay: false,
      playbackRate: 1
    };
  });

  // Fetch latest newsletters
  const { data: newsletters, isLoading } = useQuery<AudioNewsletter[]>({
    queryKey: ['/api/audio-newsletters/public'],
    queryFn: async () => {
      const res = await fetch('/api/audio-newsletters/public?limit=5&status=published');
      if (!res.ok) {
        // Return empty array if endpoint doesn't exist or has error
        return [];
      }
      const data = await res.json();
      // Ensure we always return an array
      return Array.isArray(data.newsletters) ? data.newsletters : [];
    }
  });

  // Track listen mutation
  const trackListen = useMutation({
    mutationFn: async (newsletterId: string) => {
      const res = await fetch(`/api/audio-newsletters/${newsletterId}/listen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          duration: state.duration,
          completionRate: (state.currentTime / state.duration) * 100
        }),
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to track listen');
      return res.json();
    }
  });

  // Save state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // Load saved progress for current newsletter
  useEffect(() => {
    if (state.currentNewsletters.length > 0) {
      const currentNewsletter = state.currentNewsletters[state.currentIndex];
      const savedProgress = localStorage.getItem(`${PROGRESS_STORAGE_KEY}_${currentNewsletter.id}`);
      
      if (savedProgress && audioRef.current) {
        const progress = parseFloat(savedProgress);
        audioRef.current.currentTime = progress;
        setState(prev => ({ ...prev, currentTime: progress }));
      }
    }
  }, [state.currentIndex, state.currentNewsletters]);

  // Update newsletters when data is loaded
  useEffect(() => {
    if (newsletters && newsletters.length > 0) {
      setState(prev => ({
        ...prev,
        currentNewsletters: newsletters
      }));
    }
  }, [newsletters]);

  // Audio element event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setState(prev => ({ ...prev, duration: audio.duration }));
    };

    const handleTimeUpdate = () => {
      setState(prev => ({ ...prev, currentTime: audio.currentTime }));
      
      // Save progress every 5 seconds
      if (state.currentNewsletters.length > 0) {
        const currentNewsletter = state.currentNewsletters[state.currentIndex];
        if (Math.floor(audio.currentTime) % 5 === 0) {
          localStorage.setItem(
            `${PROGRESS_STORAGE_KEY}_${currentNewsletter.id}`,
            audio.currentTime.toString()
          );
        }
      }
    };

    const handleEnded = () => {
      // Track completion
      if (state.currentNewsletters.length > 0) {
        const currentNewsletter = state.currentNewsletters[state.currentIndex];
        trackListen.mutate(currentNewsletter.id);
        
        // Clear saved progress
        localStorage.removeItem(`${PROGRESS_STORAGE_KEY}_${currentNewsletter.id}`);
      }
      
      // Auto-play next if enabled
      if (state.autoPlay && state.currentIndex < state.currentNewsletters.length - 1) {
        handleNext();
      } else {
        setState(prev => ({ ...prev, isPlaying: false }));
      }
    };

    const handlePlay = () => setState(prev => ({ ...prev, isPlaying: true }));
    const handlePause = () => setState(prev => ({ ...prev, isPlaying: false }));

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, [state.currentNewsletters, state.currentIndex, state.autoPlay]);

  // Control functions
  const handlePlayPause = () => {
    if (audioRef.current) {
      if (state.isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
    }
  };

  const handleNext = () => {
    if (state.currentIndex < state.currentNewsletters.length - 1) {
      setState(prev => ({
        ...prev,
        currentIndex: prev.currentIndex + 1,
        currentTime: 0
      }));
    }
  };

  const handlePrevious = () => {
    if (state.currentIndex > 0) {
      setState(prev => ({
        ...prev,
        currentIndex: prev.currentIndex - 1,
        currentTime: 0
      }));
    }
  };

  const handleSeek = (value: number[]) => {
    const time = value[0];
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setState(prev => ({ ...prev, currentTime: time }));
    }
  };

  const handleVolumeChange = (value: number[]) => {
    const volume = value[0];
    if (audioRef.current) {
      audioRef.current.volume = volume;
      setState(prev => ({ ...prev, volume, isMuted: volume === 0 }));
    }
  };

  const handleMuteToggle = () => {
    if (audioRef.current) {
      audioRef.current.muted = !state.isMuted;
      setState(prev => ({ ...prev, isMuted: !prev.isMuted }));
    }
  };

  const handlePlaybackRateChange = () => {
    const rates = [0.5, 0.75, 1, 1.25, 1.5, 2];
    const currentIndex = rates.indexOf(state.playbackRate);
    const nextIndex = (currentIndex + 1) % rates.length;
    const nextRate = rates[nextIndex];
    
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
      setState(prev => ({ ...prev, playbackRate: nextRate }));
    }
  };

  const handlePlaylistItemClick = (index: number) => {
    setState(prev => ({
      ...prev,
      currentIndex: index,
      currentTime: 0,
      showPlaylist: false
    }));
  };

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Don't render if no newsletters
  if (!newsletters || newsletters.length === 0) {
    return null;
  }

  const currentNewsletter = state.currentNewsletters[state.currentIndex];
  
  if (!currentNewsletter) {
    return null;
  }

  // Mini player view
  if (isMinimized) {
    return (
      <div
        className={cn(
          "fixed bottom-4 right-4 z-50",
          "bg-card border rounded-full shadow-lg",
          "flex items-center gap-2 p-2 pr-4",
          "hover-elevate cursor-pointer"
        )}
        onClick={() => setIsMinimized(false)}
        data-testid="audio-widget-mini"
      >
        <Button
          size="icon"
          variant="ghost"
          className="rounded-full"
          onClick={(e) => {
            e.stopPropagation();
            handlePlayPause();
          }}
          data-testid="button-play-pause-mini"
        >
          {state.isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-primary animate-pulse" />
          <span className="text-sm font-medium">النشرة الصوتية</span>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={currentNewsletter.audioUrl || undefined}
        preload="metadata"
        data-testid="audio-element"
      />

      {/* Main widget */}
      <Card
        className={cn(
          "fixed bottom-4 right-4 z-50",
          "w-[380px] shadow-lg",
          state.isExpanded ? "h-[500px]" : "h-auto",
          "transition-all duration-300"
        )}
        data-testid="audio-widget"
      >
        <CardContent className="p-0">
          {/* Header */}
          <div className="p-4 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Headphones className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">النشرة الصوتية</h3>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setState(prev => ({ ...prev, showPlaylist: !prev.showPlaylist }))}
                data-testid="button-playlist"
              >
                <ListMusic className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setState(prev => ({ ...prev, isExpanded: !prev.isExpanded }))}
                data-testid="button-expand"
              >
                {state.isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setIsMinimized(true)}
                data-testid="button-minimize"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Current newsletter info */}
          <div className="p-4 space-y-2">
            <h4 className="font-semibold line-clamp-2">{currentNewsletter.title}</h4>
            {currentNewsletter.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {currentNewsletter.description}
              </p>
            )}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatTime(state.duration)}
              </span>
              {currentNewsletter.createdAt && (
                <span>
                  {formatDistanceToNow(new Date(currentNewsletter.createdAt), {
                    addSuffix: true,
                    locale: ar
                  })}
                </span>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="px-4 pb-2">
            <Slider
              value={[state.currentTime]}
              max={state.duration || 100}
              step={1}
              onValueChange={handleSeek}
              className="cursor-pointer"
              data-testid="slider-progress"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>{formatTime(state.currentTime)}</span>
              <span>{formatTime(state.duration)}</span>
            </div>
          </div>

          {/* Control buttons */}
          <div className="p-4 pt-2 space-y-3">
            <div className="flex items-center justify-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={handlePrevious}
                disabled={state.currentIndex === 0}
                data-testid="button-previous"
              >
                <SkipBack className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="default"
                className="h-12 w-12"
                onClick={handlePlayPause}
                data-testid="button-play-pause"
              >
                {state.isPlaying ? (
                  <Pause className="h-5 w-5" />
                ) : (
                  <Play className="h-5 w-5" />
                )}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleNext}
                disabled={state.currentIndex === state.currentNewsletters.length - 1}
                data-testid="button-next"
              >
                <SkipForward className="h-4 w-4" />
              </Button>
            </div>

            {/* Volume and playback controls */}
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={handleMuteToggle}
                data-testid="button-mute"
              >
                {state.isMuted ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </Button>
              <Slider
                value={[state.isMuted ? 0 : state.volume]}
                max={1}
                step={0.1}
                onValueChange={handleVolumeChange}
                className="flex-1"
                data-testid="slider-volume"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handlePlaybackRateChange}
                className="min-w-[60px]"
                data-testid="button-playback-rate"
              >
                {state.playbackRate}x
              </Button>
            </div>

            {/* Additional controls */}
            {state.isExpanded && (
              <div className="flex items-center justify-between pt-2 border-t">
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (currentNewsletter.audioUrl) {
                        const a = document.createElement('a');
                        a.href = currentNewsletter.audioUrl;
                        a.download = `${currentNewsletter.title}.mp3`;
                        a.click();
                      }
                    }}
                    data-testid="button-download"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (navigator.share && currentNewsletter.audioUrl) {
                        navigator.share({
                          title: currentNewsletter.title,
                          text: currentNewsletter.description || '',
                          url: window.location.origin + '/audio/' + currentNewsletter.id
                        });
                      }
                    }}
                    data-testid="button-share"
                  >
                    <Share2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-muted-foreground">تشغيل تلقائي</label>
                  <Button
                    size="icon"
                    variant={state.autoPlay ? 'default' : 'outline'}
                    onClick={() => setState(prev => ({ ...prev, autoPlay: !prev.autoPlay }))}
                    className="h-6 w-6"
                    data-testid="button-autoplay"
                  >
                    {state.autoPlay ? '✓' : ''}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Playlist */}
          {state.showPlaylist && state.isExpanded && (
            <div className="border-t">
              <ScrollArea className="h-[200px]">
                <div className="p-2">
                  <h4 className="text-sm font-semibold mb-2 px-2">قائمة التشغيل</h4>
                  {state.currentNewsletters.map((newsletter, index) => (
                    <button
                      key={newsletter.id}
                      onClick={() => handlePlaylistItemClick(index)}
                      className={cn(
                        "w-full text-right p-2 rounded hover:bg-accent/50 transition-colors",
                        index === state.currentIndex && "bg-accent"
                      )}
                      data-testid={`playlist-item-${index}`}
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-xs text-muted-foreground mt-1">
                          {index + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium line-clamp-1">
                            {newsletter.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {newsletter.duration ? formatTime(newsletter.duration) : 'غير محدد'}
                          </p>
                        </div>
                        {index === state.currentIndex && state.isPlaying && (
                          <Radio className="h-3 w-3 text-primary animate-pulse mt-1" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}