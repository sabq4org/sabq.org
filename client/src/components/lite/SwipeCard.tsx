import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Share2, Bookmark, BookmarkCheck, ChevronDown, Zap, Sparkles, Check, Play, ChevronUp, Camera, BarChart2, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { arSA } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import type { Article, Category, User } from "@shared/schema";
import { ArticleQuiz } from "@/components/ArticleQuiz";
import { WeeklyPhotosDisplay } from "@/components/WeeklyPhotosDisplay";
import { ImageWithCaption } from "@/components/ImageWithCaption";
import { DmsMpuAd, updateSignalDataLayer, forceTriggerAdsWhenReady, getCategoryChannelLevel } from "@/components/DmsAdSlot";
import { useToast } from "@/hooks/use-toast";
import DOMPurify from "isomorphic-dompurify";
import { getObjectPosition } from "@/lib/imageUtils";

type ArticleWithDetails = Article & {
  category?: Category;
  author?: User;
  commentsCount?: number;
  reactionsCount?: number;
};

function getOptimizedImageUrl(url: string | null | undefined): string {
  if (!url) return '';
  
  if (url.includes('/public-objects/')) {
    const pathMatch = url.match(/\/public-objects\/(.+)/);
    if (pathMatch) {
      const imagePath = pathMatch[1];
      return `/api/images/optimize?path=${encodeURIComponent(imagePath)}&w=1080&q=70&f=webp`;
    }
  }
  
  return url;
}

function getVideoEmbedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  
  // YouTube
  const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (youtubeMatch) {
    return `https://www.youtube.com/embed/${youtubeMatch[1]}?autoplay=1&rel=0`;
  }
  
  // Dailymotion - use geo.dailymotion.com for better compatibility
  const dailymotionMatch = url.match(/(?:dailymotion\.com\/video\/|dai\.ly\/)([\w-]+)/);
  if (dailymotionMatch) {
    return `https://geo.dailymotion.com/player.html?video=${dailymotionMatch[1]}&autoplay=1`;
  }
  
  // Direct video URL
  if (url.match(/\.(mp4|webm|ogg)$/i)) {
    return url;
  }
  
  return null;
}


// Expandable Summary Component
function ExpandableSummary({ summary }: { summary: string | null | undefined }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  if (!summary) return null;
  
  return (
    <div className="mb-6 p-4 bg-primary/5 rounded-xl border-r-4 border-primary">
      <p className={`text-primary font-medium text-base leading-relaxed ${!isExpanded ? 'line-clamp-3' : ''}`}>
        {summary}
      </p>
      {summary.length > 150 && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 text-primary/70 text-sm mt-2 hover:text-primary transition-colors"
          data-testid="button-expand-summary"
        >
          {isExpanded ? (
            <>
              <span>عرض أقل</span>
              <ChevronUp className="h-4 w-4" />
            </>
          ) : (
            <>
              <span>عرض المزيد</span>
              <ChevronDown className="h-4 w-4" />
            </>
          )}
        </button>
      )}
    </div>
  );
}

interface SwipeCardProps {
  article: ArticleWithDetails;
  position: 'current' | 'next' | 'previous';
  canGoBack: boolean;
  dragOffset: number;
  onDragStart: () => void;
  onDragMove: (offset: number) => void;
  onDragEnd: (velocity: number) => void;
  isPersonalized?: boolean;
  isBookmarked?: boolean;
  onBookmark?: (articleId: string) => void;
}

export function SwipeCard({ 
  article, 
  position, 
  canGoBack, 
  dragOffset,
  onDragStart,
  onDragMove,
  onDragEnd,
  isPersonalized = false,
  isBookmarked = false,
  onBookmark
}: SwipeCardProps) {
  const { toast } = useToast();
  const [showDetails, setShowDetails] = useState(false);
  const [detailDragOffset, setDetailDragOffset] = useState(0);
  const [localBookmarked, setLocalBookmarked] = useState(isBookmarked);
  const [cachedShortUrl, setCachedShortUrl] = useState<string | null>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const startYRef = useRef(0);
  const lastYRef = useRef(0);
  const lastTimeRef = useRef(0);
  const isDraggingRef = useRef(false);
  const detailScrollRef = useRef<HTMLDivElement>(null);
  const detailStartYRef = useRef(0);
  const isDetailDraggingRef = useRef(false);

  const { data: mediaAssets } = useQuery<any[]>({
    queryKey: ["/api/articles", article?.id, "media-assets"],
    enabled: showDetails && !!article?.id,
  });

  const { data: articleTags } = useQuery<{ id: string; nameAr: string; nameEn: string | null }[]>({
    queryKey: ["/api/articles", article?.id, "tags"],
    enabled: showDetails && !!article?.id,
  });

  const handleDetailTouchStart = useCallback((e: React.TouchEvent) => {
    const scrollTop = detailScrollRef.current?.scrollTop || 0;
    if (scrollTop <= 0) {
      detailStartYRef.current = e.touches[0].clientY;
      isDetailDraggingRef.current = true;
    }
  }, []);

  const handleDetailTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDetailDraggingRef.current) return;
    const scrollTop = detailScrollRef.current?.scrollTop || 0;
    const currentY = e.touches[0].clientY;
    const offset = currentY - detailStartYRef.current;
    
    if (scrollTop <= 0 && offset > 0) {
      e.preventDefault();
      setDetailDragOffset(offset * 0.6);
    } else {
      isDetailDraggingRef.current = false;
      setDetailDragOffset(0);
    }
  }, []);

  const handleDetailTouchEnd = useCallback(() => {
    if (!isDetailDraggingRef.current) return;
    isDetailDraggingRef.current = false;
    
    if (detailDragOffset > 120) {
      setShowDetails(false);
    }
    setDetailDragOffset(0);
  }, [detailDragOffset]);

  // Update local bookmark state when prop changes
  useEffect(() => {
    setLocalBookmarked(isBookmarked);
  }, [isBookmarked]);

  // Reset video playback state when article changes
  useEffect(() => {
    setIsVideoPlaying(false);
  }, [article.id]);

  // Pre-fetch short URL and trigger ads when details are opened
  useEffect(() => {
    if (showDetails) {
      // Trigger ads for Lite Mode article detail
      updateSignalDataLayer({
        channelLevel1: 'LiteMode',
        channelLevel2: getCategoryChannelLevel(article.category?.nameAr || ''),
        articleId: article.id,
        articleTitle: article.title,
        contentType: 'article'
      });
      forceTriggerAdsWhenReady();
      
      // Pre-fetch short URL
      if (!cachedShortUrl) {
        fetch(`/api/shortlinks/article/${article.id}`, { credentials: "include" })
          .then(res => res.ok ? res.json() : null)
          .then(data => {
            if (data?.shortCode) {
              setCachedShortUrl(`https://sabq.org/s/${data.shortCode}`);
            }
          })
          .catch(() => {});
      }
    }
  }, [showDetails, article.id, article.title, article.category?.nameAr, cachedShortUrl]);

  const handleBookmarkClick = useCallback(async () => {
    try {
      const response = await fetch(`/api/articles/${article.id}/bookmark`, {
        method: "POST",
        credentials: "include",
      });
      
      if (response.ok) {
        const data = await response.json();
        setLocalBookmarked(data.bookmarked);
        toast({
          title: data.bookmarked ? "تم الحفظ" : "تم إلغاء الحفظ",
          description: data.bookmarked ? "تمت إضافة المقال للمحفوظات" : "تمت إزالة المقال من المحفوظات",
        });
        onBookmark?.(article.id);
      }
    } catch (error) {
      toast({
        title: "خطأ",
        description: "يرجى تسجيل الدخول لحفظ المقالات",
        variant: "destructive",
      });
    }
  }, [article.id, onBookmark, toast]);

  const handleShareClick = useCallback(() => {
    // Use cached short URL if available, otherwise use slug URL
    const shareUrl = cachedShortUrl || `https://sabq.org/s/${article.slug}`;

    // Use native share if available - no async wait needed
    if (navigator.share) {
      navigator.share({
        title: article.title,
        text: article.aiSummary || article.excerpt || "",
        url: shareUrl,
      }).catch(() => {});
    } else {
      // Fallback to clipboard
      navigator.clipboard.writeText(shareUrl).then(() => {
        toast({
          title: "تم النسخ",
          description: "تم نسخ الرابط المختصر إلى الحافظة",
        });
      }).catch(() => {});
    }
  }, [cachedShortUrl, article.slug, article.title, article.aiSummary, article.excerpt, toast]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (position !== 'current') return;
    startYRef.current = e.touches[0].clientY;
    lastYRef.current = e.touches[0].clientY;
    lastTimeRef.current = Date.now();
    isDraggingRef.current = true;
    onDragStart();
  }, [position, onDragStart]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDraggingRef.current || position !== 'current') return;
    const currentY = e.touches[0].clientY;
    const offset = currentY - startYRef.current;
    lastYRef.current = currentY;
    lastTimeRef.current = Date.now();
    onDragMove(offset);
  }, [position, onDragMove]);

  const handleTouchEnd = useCallback(() => {
    if (!isDraggingRef.current || position !== 'current') return;
    isDraggingRef.current = false;
    const velocity = 0;
    onDragEnd(velocity);
  }, [position, onDragEnd]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (position !== 'current') return;
    startYRef.current = e.clientY;
    lastYRef.current = e.clientY;
    lastTimeRef.current = Date.now();
    isDraggingRef.current = true;
    onDragStart();
  }, [position, onDragStart]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || position !== 'current') return;
      const currentY = e.clientY;
      const offset = currentY - startYRef.current;
      lastYRef.current = currentY;
      lastTimeRef.current = Date.now();
      onDragMove(offset);
    };

    const handleMouseUp = () => {
      if (!isDraggingRef.current || position !== 'current') return;
      isDraggingRef.current = false;
      onDragEnd(0);
    };

    if (position === 'current') {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [position, onDragMove, onDragEnd]);

  const imageUrl = useMemo(() => {
    // For infographic articles, ALWAYS prefer the 16:9 banner for preview display
    if ((article as any).articleType === 'infographic' && (article as any).infographicBannerUrl) {
      return (article as any).infographicBannerUrl;
    }
    // Prefer pre-optimized Lite image if available
    if (article.liteOptimizedImageUrl) {
      return article.liteOptimizedImageUrl;
    }
    // Use original image directly without optimization to avoid 404 errors
    return article.imageUrl || article.thumbnailUrl || '';
  }, [article.liteOptimizedImageUrl, article.imageUrl, article.thumbnailUrl, (article as any).articleType, (article as any).infographicBannerUrl]);
  const videoEmbedUrl = article.isVideoTemplate ? getVideoEmbedUrl(article.videoUrl) : null;
  const videoThumbnail = article.videoThumbnailUrl || imageUrl;
  const publishedDate = article.publishedAt ? new Date(article.publishedAt) : new Date();
  const smartSummary = article.aiSummary || article.excerpt;
  const timeAgo = formatDistanceToNow(publishedDate, { addSuffix: false, locale: arSA });

  // Memoize sanitized content to avoid re-sanitizing on every render
  const sanitizedContent = useMemo(() => {
    return DOMPurify.sanitize(article.content || '');
  }, [article.id, article.content]);

  const getTransformY = () => {
    const screenHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
    
    if (position === 'current') {
      return dragOffset;
    } else if (position === 'next') {
      // Next card starts at bottom (100%), moves up as current is dragged up
      const baseOffset = screenHeight;
      const movement = Math.min(0, dragOffset); // Only respond to upward drag
      return baseOffset + movement;
    } else if (position === 'previous') {
      // Previous card starts at top (-100%), moves down as current is dragged down
      const baseOffset = -screenHeight;
      const movement = Math.max(0, dragOffset); // Only respond to downward drag
      return baseOffset + movement;
    }
    return 0;
  };

  const transformY = getTransformY();

  return (
    <>
      <div
        className="absolute inset-0 select-none"
        style={{ 
          transform: `translateY(${transformY}px)`,
          zIndex: position === 'current' ? 10 : 5,
          touchAction: 'none',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        data-testid={`swipe-card-${article.id}`}
      >
        <div className="h-full w-full overflow-hidden bg-black relative">
          {article.isVideoTemplate && videoEmbedUrl ? (
            <div className="absolute top-0 left-0 right-0 h-[45%]">
              <img
                src={videoThumbnail}
                alt={article.title}
                className="w-full h-full object-cover"
                style={{ objectPosition: getObjectPosition(article) }}
                draggable={false}
                loading="lazy"
              />
              <div 
                className="absolute inset-0 flex items-center justify-center cursor-pointer"
                onClick={(e) => { e.stopPropagation(); setIsVideoPlaying(true); }}
              >
                <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center shadow-lg">
                  <Play className="h-8 w-8 text-white fill-white ml-1" />
                </div>
              </div>
              <div 
                className="absolute inset-0 pointer-events-none" 
                style={{ 
                  background: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.3) 30%, rgba(0,0,0,0.7) 70%, rgba(0,0,0,1) 100%)' 
                }} 
              />
            </div>
          ) : imageUrl ? (
            <div className="absolute top-0 left-0 right-0 h-[45%]">
              <img
                src={imageUrl}
                alt={article.title}
                className="w-full h-full object-cover"
                style={{ objectPosition: getObjectPosition(article) }}
                draggable={false}
                loading="lazy"
              />
              <div 
                className="absolute inset-0" 
                style={{ 
                  background: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.3) 30%, rgba(0,0,0,0.7) 70%, rgba(0,0,0,1) 100%)' 
                }} 
              />
            </div>
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-gray-900 to-gray-800" />
          )}

          <div className="absolute inset-x-0 top-[42%] bottom-0 px-5" dir="rtl">
            {/* Red gradient from bottom for breaking news */}
            {article.newsType === 'breaking' && (
              <div 
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'linear-gradient(to top, rgba(180,30,30,0.45) 0%, rgba(140,25,25,0.3) 50%, rgba(100,20,20,0.15) 75%, transparent 100%)'
                }}
              />
            )}
            <div className="flex items-center gap-2 mb-3 relative">
              {isPersonalized && (
                <span 
                  className="px-3 py-1 rounded-full text-white text-sm font-bold flex items-center gap-1 bg-gradient-to-r from-purple-600 to-pink-500"
                  data-testid="badge-personalized"
                >
                  <Sparkles className="h-3 w-3" />
                  لك
                </span>
              )}
              {article.newsType === 'breaking' && (
                <span 
                  className="px-3 py-1 rounded-full text-white text-sm font-bold flex items-center gap-1 bg-red-600"
                  data-testid="badge-breaking"
                >
                  <Zap className="h-3 w-3" />
                  عاجل
                </span>
              )}
              {(article as any).articleType === 'weekly_photos' && (
                <span 
                  className="px-3 py-1 rounded-full text-white text-sm font-bold flex items-center gap-1 bg-violet-500"
                  data-testid="badge-photos"
                >
                  <Camera className="h-3 w-3" />
                  صور
                </span>
              )}
              {(article as any).articleType === 'infographic' && (
                <span 
                  className="px-3 py-1 rounded-full text-white text-sm font-bold flex items-center gap-1 bg-teal-500"
                  data-testid="badge-infographic"
                >
                  <BarChart2 className="h-3 w-3" />
                  إنفوجرافيك
                </span>
              )}
              {article.category && (
                <span 
                  className="px-2.5 py-1 rounded-md bg-white/20 backdrop-blur-sm text-white text-xs font-medium"
                  data-testid="badge-category"
                >
                  {article.category.nameAr}
                </span>
              )}
              <span className="text-white/60 text-xs flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {timeAgo}
              </span>
            </div>

            {/* Subtitle above main title */}
            {(article as any).subtitle && (
              <p className="text-white/80 text-sm font-medium mb-2" data-testid="text-article-subtitle">
                {(article as any).subtitle}
              </p>
            )}

            <h1 
              className="text-[26px] font-bold text-white leading-[1.4] mb-4"
              data-testid="text-article-title"
            >
              {article.title}
            </h1>

            {smartSummary && (
              <p className="text-white/75 text-[15px] leading-relaxed mb-6 line-clamp-4">
                {smartSummary}
              </p>
            )}

            <div className="flex justify-end">
              <button
                onClick={() => setShowDetails(true)}
                className="bg-white hover:bg-gray-100 text-black font-medium rounded-full px-3 py-1.5 text-xs transition-colors"
                data-testid="button-read-details"
              >
                اقرأ التفاصيل
              </button>
            </div>
          </div>
        </div>
      </div>

      {showDetails && (
        <motion.div
          className="fixed inset-0 z-50 bg-background"
          initial={{ y: "100%" }}
          animate={{ y: detailDragOffset }}
          exit={{ y: "100%" }}
          transition={{ type: "tween", duration: detailDragOffset > 0 ? 0 : 0.3, ease: [0.32, 0.72, 0, 1] }}
          dir="rtl"
        >
          <div 
            ref={detailScrollRef}
            className="h-full overflow-y-auto"
            style={{ overscrollBehaviorY: 'contain' }}
            onTouchStart={handleDetailTouchStart}
            onTouchMove={handleDetailTouchMove}
            onTouchEnd={handleDetailTouchEnd}
          >
            {article.isVideoTemplate && videoEmbedUrl ? (
              <div className="relative bg-black">
                {videoEmbedUrl.match(/\.(mp4|webm|ogg)$/i) ? (
                  <video
                    src={videoEmbedUrl}
                    className="w-full h-auto max-h-[80vh] object-contain"
                    autoPlay
                    controls
                    playsInline
                  />
                ) : (
                  <iframe
                    src={videoEmbedUrl}
                    className="w-full aspect-video"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                )}
              </div>
            ) : imageUrl && (
              <div className="relative bg-black">
                {/* For infographic articles, show the ORIGINAL full infographic image (not the banner) */}
                {(article as any).articleType === 'infographic' ? (
                  <>
                    <img
                      src={article.imageUrl || imageUrl}
                      alt={article.title}
                      className="w-full h-auto"
                      style={{ objectFit: 'contain', maxHeight: 'none' }}
                      data-testid="img-infographic-full"
                    />
                    {/* AI-Generated Image Badge */}
                    {(article as any).isAiGeneratedImage && (
                      <div className="absolute bottom-10 right-4">
                        <div 
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/90 backdrop-blur-sm rounded-full text-white text-xs font-medium shadow-lg"
                          data-testid="badge-ai-generated-image"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          <span>مولدة بالذكاء الاصطناعي</span>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <img
                      src={imageUrl}
                      alt={article.title}
                      className="w-full h-auto"
                      style={{ 
                        objectFit: 'contain',
                        objectPosition: getObjectPosition(article)
                      }}
                    />
                    {/* AI-Generated Image Badge */}
                    {(article as any).isAiGeneratedImage && (
                      <div className="absolute bottom-10 right-4">
                        <div 
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/90 backdrop-blur-sm rounded-full text-white text-xs font-medium shadow-lg"
                          data-testid="badge-ai-generated-image"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          <span>مولدة بالذكاء الاصطناعي</span>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Content Section - Curved top overlapping image */}
            <div className="px-4 py-6 bg-background rounded-t-[2rem] -mt-6 relative z-10">
              {/* Horizontal line indicator */}
              <div className="flex justify-center mb-4">
                <div className="w-12 h-1 bg-muted-foreground/30 rounded-full" />
              </div>

              {/* Category, Time & Views */}
              <div className="flex items-center gap-3 mb-5 flex-wrap">
                {article.category && (
                  <span 
                    className="px-3 py-1.5 rounded-md bg-primary/5 text-primary text-xs font-bold border border-primary/20"
                  >
                    {article.category.nameAr}
                  </span>
                )}
                <span className="text-muted-foreground text-xs">
                  {formatDistanceToNow(publishedDate, { addSuffix: true, locale: arSA })}
                </span>
                {article.newsType === 'breaking' && (
                  <span 
                    className="px-3 py-1 rounded-md text-white text-sm font-bold flex items-center gap-1 bg-red-600"
                    data-testid="badge-breaking-details"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    عاجل
                  </span>
                )}
              </div>

              {/* Subtitle above title */}
              {(article as any).subtitle && (
                <p className="text-muted-foreground text-sm font-medium mb-2" data-testid="text-details-subtitle">
                  {(article as any).subtitle}
                </p>
              )}

              {/* Title - Side aligned */}
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight mb-6">
                {article.title}
              </h1>

              {/* Author Section with Share/Bookmark on opposite side */}
              <div className="flex items-center justify-between gap-3 mb-6">
                {article.author && (
                  <div className="flex items-center gap-3">
                    {(article.author as any).profileImageUrl ? (
                      <img 
                        src={(article.author as any).profileImageUrl} 
                        alt={`${article.author.firstName} ${article.author.lastName}`}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm">
                        {article.author.firstName?.charAt(0) || 'م'}
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-foreground text-sm">
                        {article.author.firstName} {article.author.lastName}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {article.author.role === 'editor' ? 'محرر' : 
                         article.author.role === 'admin' ? 'مدير' : 
                         article.author.role === 'correspondent' ? 'مراسل' : 'كاتب'} 
                        {article.category && ` في قسم ${article.category.nameAr}`}
                      </p>
                    </div>
                  </div>
                )}
                
                {/* Bookmark button only */}
                <button 
                  className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${localBookmarked ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                  onClick={handleBookmarkClick}
                  data-testid="button-bookmark-content"
                >
                  {localBookmarked ? <BookmarkCheck className="h-5 w-5" /> : <Bookmark className="h-5 w-5" />}
                </button>
              </div>


              {/* Weekly Photos Display for صور الأسبوع */}
              {(article as any).articleType === 'weekly_photos' && (article as any).weeklyPhotosData?.photos && (
                <div className="mb-6">
                  <WeeklyPhotosDisplay 
                    photos={(article as any).weeklyPhotosData.photos}
                    title="صور"
                  />
                </div>
              )}

              {/* Article Content */}
              <div 
                className="prose prose-lg dark:prose-invert max-w-none text-foreground leading-relaxed [&_img]:rounded-lg [&_img]:my-4 [&_img]:max-w-full [&_img]:h-auto"
                dangerouslySetInnerHTML={{ __html: sanitizedContent }}
              />

              {/* Attached Images Section */}
              {(() => {
                const mediaAdditionalImages = mediaAssets
                  ?.filter((asset: any) => asset.displayOrder !== 0)
                  .sort((a: any, b: any) => a.displayOrder - b.displayOrder) || [];
                const albumImages = (article as any).albumImages || [];
                
                if (mediaAdditionalImages.length === 0 && albumImages.length === 0) return null;
                
                return (
                  <div className="mt-8 pt-6 border-t space-y-6">
                    <h3 className="text-lg font-bold">الصور المرفقة</h3>
                    <div className="space-y-6">
                      {mediaAdditionalImages.map((asset: any, index: number) => (
                        <ImageWithCaption
                          key={asset.id || `media-${index}`}
                          imageUrl={asset.mediaFile?.url || asset.url}
                          altText={asset.altText || asset.mediaFile?.altText || `صورة ${index + 1}`}
                          captionHtml={asset.captionHtml}
                          captionPlain={asset.captionPlain}
                          sourceName={asset.sourceName}
                          sourceUrl={asset.sourceUrl}
                          className="w-full"
                        />
                      ))}
                      {albumImages.map((url: string, index: number) => (
                        <ImageWithCaption
                          key={`album-${index}`}
                          imageUrl={url}
                          altText={`صورة ${mediaAdditionalImages.length + index + 1}`}
                          className="w-full"
                        />
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Keywords Section */}
              {(((article as any).seo?.keywords && (article as any).seo.keywords.length > 0) || (articleTags && articleTags.length > 0)) && (
                <div className="mt-8 pt-6 border-t space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground">الكلمات المفتاحية</h3>
                  <div className="flex flex-wrap gap-2">
                    {articleTags?.map((tag, index) => (
                      <span 
                        key={`tag-${tag.id}`}
                        className="px-3 py-1.5 rounded-md bg-primary/10 text-primary text-sm font-medium"
                        data-testid={`badge-tag-${index}`}
                      >
                        {tag.nameAr}
                      </span>
                    ))}
                    {(!articleTags || articleTags.length === 0) && (article as any).seo?.keywords?.map((keyword: string, index: number) => (
                      <span 
                        key={`seo-${index}`}
                        className="px-3 py-1.5 rounded-md bg-primary/10 text-primary text-sm font-medium"
                        data-testid={`badge-keyword-${index}`}
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* DMS Ad - أسفل تفاصيل الخبر */}
              <div className="my-6">
                <DmsMpuAd />
              </div>
              
              {/* Quiz Section */}
              <div className="mt-8 pt-6 border-t">
                <ArticleQuiz articleId={article.id} />
              </div>
              
              {/* Return to Home Button */}
              <div className="mt-8 mb-8 flex justify-center">
                <button
                  onClick={() => setShowDetails(false)}
                  className="px-12 py-4 bg-primary text-white text-lg font-bold rounded-full shadow-lg hover:bg-primary/90 transition-colors"
                  data-testid="button-return-home"
                >
                  العودة للرئيسية
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Fullscreen Video Overlay */}
      <AnimatePresence>
        {isVideoPlaying && videoEmbedUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black flex items-center justify-center"
            onClick={() => setIsVideoPlaying(false)}
          >
            <button
              onClick={(e) => { e.stopPropagation(); setIsVideoPlaying(false); }}
              className="absolute top-4 right-4 z-[110] w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center"
              data-testid="button-close-video"
            >
              <X className="h-6 w-6 text-white" />
            </button>
            <div className="w-full h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
              {videoEmbedUrl.match(/\.(mp4|webm|ogg)$/i) ? (
                <video
                  src={videoEmbedUrl}
                  className="w-full h-full object-contain"
                  autoPlay
                  controls
                  playsInline
                />
              ) : (
                <iframe
                  src={videoEmbedUrl}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                  allowFullScreen
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
