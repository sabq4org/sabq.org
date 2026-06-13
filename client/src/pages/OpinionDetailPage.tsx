import { useParams, useLocation, Link } from "wouter";
import { getObjectPosition } from "@/lib/imageUtils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { NavigationBar } from "@/components/NavigationBar";
import { Footer } from "@/components/Footer";
import { CommentSection } from "@/components/CommentSection";
import { RecommendationsWidget } from "@/components/RecommendationsWidget";
import { AIRecommendationsBlock } from "@/components/AIRecommendationsBlock";
import { RecentNewsSection } from "@/components/RecentNewsSection";
import { ImageWithCaption } from "@/components/ImageWithCaption";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { useBehaviorTracking } from "@/hooks/useBehaviorTracking";
import { useArticleReadTracking } from "@/hooks/useArticleReadTracking";
import { useCanonical } from "@/hooks/useCanonical";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import {
  trackOpinionView,
  trackArticleLike,
  trackBookmarkToggle,
  trackArticleComment,
} from "@/lib/analytics";
import { DmsLeaderboardAd, DmsMpuAd, useAdTracking, updateSignalDataLayer, triggerAdsWhenReady, resetAdsTriggerFlag } from "@/components/DmsAdSlot";
import { 
  ArrowRight, 
  Clock, 
  BookOpen,
  User,
  Calendar,
  Heart,
  Bookmark,
  Share2,
  Sparkles,
  ChevronUp,
  ChevronDown,
  Volume2,
  VolumeX,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { arSA } from "date-fns/locale";
import type { ArticleWithDetails, CommentWithUser } from "@shared/schema";
import { useEffect, useState, useRef } from "react";
import DOMPurify from "isomorphic-dompurify";

export default function OpinionDetailPage() {
  useAdTracking('رأي');
  
  const params = useParams();
  const slug = params.slug;
  const { toast } = useToast();
  const { logBehavior } = useBehaviorTracking();
  const [, setLocation] = useLocation();

  // Audio player state (ElevenLabs)
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Smart summary collapsible state
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);

  const { data: user } = useQuery<{ id: string; name?: string; email?: string; role?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const { data: article, isLoading } = useQuery<ArticleWithDetails>({
    queryKey: ["/api/opinion", slug],
    enabled: !!slug,
  });

  // Silently update URL to use short englishSlug for better social sharing
  useEffect(() => {
    if (article?.englishSlug && slug !== article.englishSlug) {
      const newPath = `/opinion/${article.englishSlug}`;
      window.history.replaceState(null, '', newPath);
    }
  }, [article?.englishSlug, slug]);

  const { data: commentsRaw } = useQuery<CommentWithUser[]>({
    queryKey: ["/api/opinion", slug, "comments"],
    enabled: !!slug,
  });
  const comments = Array.isArray(commentsRaw) ? commentsRaw : [];

  // Per-user liked-comment overlay (kept out of the cached comments payload).
  // Keyed by article id so the my-likes endpoint resolves via its UUID branch.
  const { data: myLikesRaw } = useQuery<string[]>({
    queryKey: ["/api/articles", article?.id, "comments", "my-likes"],
    enabled: !!article?.id && !!user?.id,
  });
  const likedCommentIds = Array.isArray(myLikesRaw) ? myLikesRaw : [];

  const { data: relatedArticlesRaw } = useQuery<ArticleWithDetails[]>({
    queryKey: ["/api/opinion", slug, "related"],
    enabled: !!slug,
  });
  const relatedArticles = Array.isArray(relatedArticlesRaw) ? relatedArticlesRaw : [];

  // Fetch article tags for keywords display and mediaAssets for image captions
  const { data: sidebarData } = useQuery<{
    tags: Array<{ id: string; nameAr: string; nameEn: string; slug: string }>;
    mediaAssets?: Array<{
      id: string;
      displayOrder: number;
      captionPlain?: string;
      captionHtml?: string;
      sourceName?: string;
      sourceUrl?: string;
      altText?: string;
      mediaFile?: {
        width?: number;
        height?: number;
      };
    }>;
  }>({
    queryKey: ["/api/articles", slug, "sidebar"],
    enabled: !!slug,
    staleTime: 1000 * 60 * 5,
  });
  const articleTags = sidebarData?.tags || [];
  const mediaAssets = sidebarData?.mediaAssets || [];

  const { logArticleView } = useArticleReadTracking({
    articleId: article?.id || "",
    enabled: !!article && !!user,
  });

  useEffect(() => {
    if (article && user) {
      logArticleView();
    }
  }, [article?.id, user?.id]);

  // Set document.title for SEO (GA4 auto-tracks page views)
  useEffect(() => {
    if (article?.title) {
      document.title = `${article.title} | سبق`;
    }
    return () => {
      document.title = 'سبق - صحيفة إلكترونية سعودية';
    };
  }, [article?.title]);

  useCanonical(article ? `https://sabq.org/article/${article.englishSlug || slug}` : null);

  // GA analytics view — fire immediately (separate from the inflated DB counter).
  useEffect(() => {
    if (!article?.id) return;
    const author = article.author
      ? `${article.author.firstName || ""} ${article.author.lastName || ""}`.trim()
      : "";
    trackOpinionView(article.id, article.title || "", author);
  }, [article?.id, article?.title, article?.author?.firstName, article?.author?.lastName]);

  // Count the view ONLY after a genuine read: ≥10s of foreground dwell on the
  // page. Mashing the refresh button never reaches the threshold (each reload
  // clears the timer), so it can't inflate the counter. The server also de-dupes
  // per visitor as a second layer.
  useEffect(() => {
    if (!article?.id) return;

    const READ_DWELL_MS = 10000; // 10s of foreground reading
    const articleId = article.id;
    let elapsed = 0;
    let lastTick = Date.now();
    let fired = false;

    const fire = () => {
      if (fired) return;
      fired = true;
      clearInterval(intervalId);
      fetch(`/api/articles/${articleId}/view`, { method: 'POST' })
        .then(r => r.json())
        .then(data => console.log('[OpinionView] Tracked:', data))
        .catch(err => console.error('[OpinionView] Error:', err));
    };

    const intervalId = setInterval(() => {
      const now = Date.now();
      if (document.visibilityState !== 'visible') {
        lastTick = now;
        return;
      }
      elapsed += now - lastTick;
      lastTick = now;
      if (elapsed >= READ_DWELL_MS) fire();
    }, 1000);

    return () => clearInterval(intervalId);
  }, [article?.id]);

  // DMS Ad tracking for opinion article page
  useEffect(() => {
    if (!article) return;
    resetAdsTriggerFlag();
    
    const authorName = article.author
      ? `${article.author.firstName || ""} ${article.author.lastName || ""}`.trim()
      : "";
    
    updateSignalDataLayer({
      channelLevel1: 'Opinion',
      channelLevel2: article.category?.nameAr ? article.category.nameAr : 'Opinion',
      articleId: article.id,
      articleTitle: article.title,
      author: authorName,
      publishDate: article.publishedAt ? new Date(article.publishedAt).toISOString() : undefined,
      keywords: article.seo?.keywords?.join(',') || undefined,
    });
    triggerAdsWhenReady();
  }, [article?.id]);

  // googlebot-news 30-day noindex meta is now handled server-side by
  // seoInjector (see server/seoInjector.ts ~line 174). The previous
  // client-side effect that did the same was racing against React's
  // reconciler when navigating between opinion articles and triggered
  // "Failed to execute 'removeChild' on 'Node'" — reported by DMS
  // 2026-05-18. Server-side handling is authoritative and works for
  // both bot crawls and JS-rendered visits.

  const reactMutation = useMutation({
    mutationFn: async () => {
      if (!article) return;
      return await apiRequest(`/api/articles/${article.id}/react`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      if (article) {
        logBehavior("reaction_add", { articleId: article.id });
        trackArticleLike(article.id, true);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/opinion", slug] });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "تسجيل دخول مطلوب",
          description: "يجب تسجيل الدخول للتفاعل مع المقالات",
          variant: "destructive",
        });
      } else {
        toast({
          title: "خطأ",
          description: error.message || "فشل في التفاعل",
          variant: "destructive",
        });
      }
    },
  });

  const bookmarkMutation = useMutation({
    mutationFn: async () => {
      if (!article) return;
      return await apiRequest(`/api/articles/${article.id}/bookmark`, {
        method: "POST",
      });
    },
    onSuccess: (result: any) => {
      if (article) {
        logBehavior(
          result?.isBookmarked ? "bookmark_add" : "bookmark_remove",
          { articleId: article.id }
        );
        trackBookmarkToggle(article.id, Boolean(result?.isBookmarked));
      }
      queryClient.invalidateQueries({ queryKey: ["/api/opinion", slug] });
      toast({
        title: "تم الحفظ",
        description: "تم تحديث المقالات المحفوظة",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "تسجيل دخول مطلوب",
          description: "يجب تسجيل الدخول لحفظ المقالات",
          variant: "destructive",
        });
      } else {
        toast({
          title: "خطأ",
          description: error.message || "فشل في الحفظ",
          variant: "destructive",
        });
      }
    },
  });

  const commentMutation = useMutation({
    mutationFn: async (data: { content: string; parentId?: string }) => {
      if (!article) return;
      return await apiRequest(`/api/articles/${article.id}/comments`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: (_result, variables) => {
      if (article) {
        logBehavior("comment_create", { articleId: article.id });
      }
      trackArticleComment(slug ?? "", variables?.parentId);
      queryClient.invalidateQueries({ queryKey: ["/api/opinion", slug, "comments"] });
      toast({
        title: "شكراً لمشاركتك",
        description: "يتم تحليل تعليقك الآن بواسطة الذكاء الاصطناعي للتأكد من التزامه بمعايير المجتمع. سيُنشر تلقائياً إذا كان آمناً.",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "تسجيل دخول مطلوب",
          description: "يجب تسجيل الدخول لإضافة تعليق",
          variant: "destructive",
        });
      } else {
        toast({
          title: "خطأ",
          description: error.message || "فشل في إضافة التعليق",
          variant: "destructive",
        });
      }
    },
  });

  const handleReact = async () => {
    reactMutation.mutate();
  };

  const handleBookmark = async () => {
    bookmarkMutation.mutate();
  };

  const handleShare = async () => {
    if (navigator.share && article) {
      try {
        await navigator.share({
          title: article.title,
          text: article.excerpt || article.subtitle || "",
          url: window.location.href,
        });
      } catch (err) {
        console.log("Share failed:", err);
      }
    }
  };

  const handleComment = async (content: string, parentId?: string) => {
    commentMutation.mutate({ content, parentId });
  };

  // Toggle a like on a comment. Throws on failure so CommentSection rolls back
  // its optimistic state; on success refresh authoritative counts + overlay.
  const handleLikeComment = async (commentId: string, nextLiked: boolean) => {
    await apiRequest(`/api/comments/${commentId}/like`, { method: nextLiked ? "POST" : "DELETE" });
    queryClient.invalidateQueries({ queryKey: ["/api/opinion", slug, "comments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/articles", article?.id, "comments", "my-likes"] });
  };

  // Handle audio playback using ElevenLabs (same as ArticleDetail)
  const handlePlayAudio = async () => {
    if (!article?.aiSummary && !article?.excerpt) {
      toast({
        title: "لا يوجد محتوى",
        description: "الموجز الذكي غير متوفر لهذا المقال",
        variant: "destructive",
      });
      return;
    }

    // If currently playing, stop playback
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0; // Reset to beginning
      setIsPlaying(false);
      return;
    }

    // If audio is already loaded but paused, resume playback
    if (audioRef.current && audioRef.current.src) {
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (error) {
        console.error('Error resuming audio:', error);
        toast({
          title: "خطأ",
          description: "فشل تشغيل الموجز الصوتي",
          variant: "destructive",
        });
      }
      return;
    }

    // Load and play new audio
    try {
      setIsLoadingAudio(true);
      
      // Add cache busting parameter to prevent browser from caching errors
      const timestamp = article?.updatedAt ? new Date(article.updatedAt).toISOString() : new Date().toISOString();
      const audioUrl = `/api/articles/${slug}/summary-audio?v=${encodeURIComponent(timestamp)}&tts=google-v1`;
      
      // Create audio element
      audioRef.current = new Audio(audioUrl);
      
      // Add event listeners
      audioRef.current.addEventListener('ended', () => {
        setIsPlaying(false);
      });
      
      audioRef.current.addEventListener('error', (e) => {
        console.error('Audio playback error:', e);
        toast({
          title: "خطأ",
          description: "فشل تشغيل الموجز الصوتي",
          variant: "destructive",
        });
        setIsPlaying(false);
        setIsLoadingAudio(false);
      });
      
      // Wait for audio to be ready, then play
      audioRef.current.addEventListener('canplaythrough', async () => {
        if (audioRef.current) {
          try {
            await audioRef.current.play();
            setIsPlaying(true);
            setIsLoadingAudio(false);
          } catch (playError) {
            console.error('Error playing audio:', playError);
            toast({
              title: "خطأ",
              description: "فشل تشغيل الموجز الصوتي",
              variant: "destructive",
            });
            setIsLoadingAudio(false);
          }
        }
      }, { once: true }); // Only fire once
      
      // Start loading the audio
      audioRef.current.load();
    } catch (error) {
      console.error('Error loading audio:', error);
      toast({
        title: "خطأ",
        description: "فشل تحميل الموجز الصوتي",
        variant: "destructive",
      });
      setIsLoadingAudio(false);
    }
  };

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [slug]);

  const getInitials = (firstName?: string | null, lastName?: string | null, email?: string) => {
    if (firstName && lastName) {
      return `${firstName?.[0]}${lastName?.[0]}`.toUpperCase();
    }
    if (firstName) return firstName?.[0].toUpperCase();
    if (email) return email[0].toUpperCase();
    return 'ر';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col" dir="rtl">
        <Header user={user} />
        <NavigationBar />
        <main className="flex-1">
          <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="max-w-4xl mx-auto">
              <Skeleton className="h-8 w-3/4 mb-4" />
              <Skeleton className="h-4 w-1/2 mb-8" />
              <Skeleton className="w-full aspect-[16/9] mb-8" />
              <div className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="min-h-screen bg-background flex flex-col" dir="rtl">
        <Header user={user} />
        <NavigationBar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <BookOpen className="h-16 w-16 mx-auto text-muted-foreground" />
            <h2 className="text-2xl font-bold text-foreground">
              المقال غير موجود
            </h2>
            <Link href="/opinion">
              <Button variant="default" data-testid="button-back-to-opinions">
                <ArrowRight className="ml-2 h-4 w-4" />
                العودة لمقالات الرأي
              </Button>
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const authorName = article.author
    ? `${article.author.firstName || ""} ${article.author.lastName || ""}`.trim() || "كاتب غير معروف"
    : "كاتب غير معروف";

  const timeAgo = article.publishedAt
    ? formatDistanceToNow(new Date(article.publishedAt), {
        addSuffix: true,
        locale: arSA,
      })
    : null;

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Header user={user} />
      <NavigationBar />

      <main className="flex-1">
        <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <DmsLeaderboardAd />
          <DmsMpuAd />
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <article className="lg:col-span-2 space-y-8">
              {/* Article Header */}
              <header className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className="bg-amber-600 hover:bg-amber-700 text-white border-0 gap-1 font-medium" data-testid="badge-opinion-type">
                    <BookOpen className="h-3 w-3" />
                    مقال رأي
                  </Badge>
                  {article.category && (
                    <Badge variant="secondary" data-testid="badge-category">
                      {article.category.icon} {article.category.nameAr}
                    </Badge>
                  )}
                </div>

                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight text-foreground" data-testid="text-article-title">
                  {article.title}
                </h1>

                {article.subtitle && (
                  <p className="text-xl text-muted-foreground leading-relaxed" data-testid="text-article-subtitle">
                    {article.subtitle}
                  </p>
                )}

                {/* Author & Meta */}
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  {article.author && (
                    <div className="flex items-center gap-2">
                      {article.staff?.slug ? (
                        <Link href={`/reporter/${article.staff.slug}`}>
                          <Avatar className="h-12 w-12 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all">
                            {(article.staff?.profileImage || article.author?.profileImageUrl) && (
                              <AvatarImage 
                                src={article.staff?.profileImage || article.author?.profileImageUrl || ""} 
                                alt={authorName}
                                className="object-cover"
                              />
                            )}
                            <AvatarFallback className="bg-primary/10 text-primary">
                              {getInitials(article.author?.firstName, article.author?.lastName, article.author?.email)}
                            </AvatarFallback>
                          </Avatar>
                        </Link>
                      ) : (
                        <Avatar className="h-12 w-12">
                          {article.author?.profileImageUrl && (
                            <AvatarImage 
                              src={article.author?.profileImageUrl} 
                              alt={authorName}
                              className="object-cover"
                            />
                          )}
                          <AvatarFallback className="bg-primary/10 text-primary">
                            {getInitials(article.author?.firstName, article.author?.lastName, article.author?.email)}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <div>
                        {article.staff?.slug ? (
                          <Link href={`/reporter/${article.staff.slug}`}>
                            <p className="font-bold text-base text-foreground hover:text-primary transition-colors cursor-pointer" data-testid="text-author-name">
                              {authorName}
                            </p>
                          </Link>
                        ) : (
                          <p className="font-bold text-base text-foreground" data-testid="text-author-name">
                            {authorName}
                          </p>
                        )}
                        {timeAgo && (
                          <p className="text-muted-foreground text-xs flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {timeAgo}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <Separator orientation="vertical" className="h-12" />

                  <div className="flex items-center gap-4 text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Heart className="h-4 w-4" />
                      {article.reactionsCount || 0}
                    </span>
                  </div>
                </div>
              </header>

              <Separator />

              {/* Featured Image with AI Badge */}
              {article.imageUrl && (() => {
                const heroImageAsset = mediaAssets?.find(
                  (asset: any) => asset.displayOrder === 0
                );
                return (
                  <ImageWithCaption
                    imageUrl={article.imageUrl}
                    altText={heroImageAsset?.altText || article.title}
                    captionHtml={heroImageAsset?.captionHtml}
                    captionPlain={heroImageAsset?.captionPlain || heroImageAsset?.altText || (article as any).imageCaption}
                    sourceName={heroImageAsset?.sourceName || (article as any).imageSource}
                    sourceUrl={heroImageAsset?.sourceUrl}
                    isAiGenerated={article.isAiGeneratedThumbnail || article.isAiGeneratedImage || false}
                    aiModel={(article as any).aiImageModel || undefined}
                    objectPosition={getObjectPosition(article)}
                    priority={true}
                  />
                );
              })()}

              {/* Smart Summary - Collapsible */}
              {(article.aiSummary || article.excerpt) && (
                <Collapsible open={isSummaryExpanded} onOpenChange={setIsSummaryExpanded}>
                  <div className="bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <h3 className="font-semibold text-sm text-primary">الموجز الذكي</h3>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant={isPlaying ? "default" : "ghost"}
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={handlePlayAudio}
                          disabled={isLoadingAudio}
                          data-testid="button-listen-summary"
                        >
                          {isLoadingAudio ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : isPlaying ? (
                            <VolumeX className="h-3.5 w-3.5" />
                          ) : (
                            <Volume2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" data-testid="button-toggle-summary">
                            {isSummaryExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                      </div>
                    </div>
                    <p 
                      className={`text-foreground/80 leading-relaxed text-sm ${!isSummaryExpanded ? 'line-clamp-2' : ''}`}
                      data-testid="text-smart-summary"
                    >
                      {article.aiSummary || article.excerpt}
                    </p>
                    <CollapsibleContent>
                      {/* Extra content shown when expanded - already in the paragraph above */}
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              )}

              {/* Keywords - show article tags first, fallback to SEO keywords */}
              {((article.seo?.keywords && article.seo.keywords.length > 0) || articleTags.length > 0) && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground">الكلمات المفتاحية</h3>
                  <div className="flex flex-wrap gap-2">
                    {/* Display article tags first if available */}
                    {articleTags.map((tag, index) => (
                      <Badge 
                        key={`tag-${tag.id}`}
                        variant="secondary"
                        className="cursor-pointer hover-elevate active-elevate-2 transition-all duration-300 hover:scale-105"
                        onClick={() => setLocation(`/tag/${tag.slug}`)}
                        data-testid={`badge-tag-${index}`}
                      >
                        {tag.nameAr}
                      </Badge>
                    ))}
                    {/* Fallback to SEO keywords if no article tags */}
                    {articleTags.length === 0 && article.seo?.keywords?.map((keyword, index) => (
                      <Badge 
                        key={`seo-${index}`}
                        variant="secondary"
                        className="cursor-pointer hover-elevate active-elevate-2 transition-all duration-300 hover:scale-105"
                        onClick={() => setLocation(`/keyword/${encodeURIComponent(keyword)}`)}
                        data-testid={`badge-keyword-${index}`}
                      >
                        {keyword}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Article Content */}
              <div 
                className="prose prose-lg dark:prose-invert max-w-none leading-loose text-justify"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(article.content) }}
                data-testid="text-article-content"
              />

              <Separator />

              {/* Author Bio Section */}
              {article.author && (
                <div className="bg-muted/50 rounded-lg p-6">
                  <div className="flex items-start gap-4">
                    <Avatar className="h-20 w-20">
                      <AvatarImage 
                        src={article.author?.profileImageUrl || ""} 
                        alt={authorName}
                        className="object-cover"
                      />
                      <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                        {getInitials(article.author?.firstName, article.author?.lastName, article.author?.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-2">
                      <h3 className="font-bold text-xl text-foreground">
                        عن الكاتب
                      </h3>
                      <p className="font-semibold text-lg text-foreground">
                        {authorName}
                      </p>
                      {((article as any).staff?.bioAr || article.author?.bio) && (
                        <p className="text-muted-foreground">
                          {(article as any).staff?.bioAr || article.author?.bio}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <Separator />

              {/* Share Actions */}
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant={article.hasReacted ? "default" : "outline"}
                  className="gap-2 hover-elevate"
                  onClick={handleReact}
                  data-testid="button-article-react"
                >
                  <Heart className={article.hasReacted ? 'fill-current' : ''} />
                  إعجاب ({article.reactionsCount || 0})
                </Button>

                <Button
                  variant={article.isBookmarked ? "default" : "outline"}
                  className="gap-2 hover-elevate"
                  onClick={handleBookmark}
                  data-testid="button-article-bookmark"
                >
                  <Bookmark className={article.isBookmarked ? 'fill-current' : ''} />
                  حفظ
                </Button>

                <Button
                  variant="outline"
                  className="gap-2 hover-elevate"
                  onClick={handleShare}
                  data-testid="button-article-share"
                >
                  <Share2 />
                  مشاركة
                </Button>
              </div>

              <Separator />

              {/* Comments */}
              <CommentSection
                articleId={article.id}
                comments={comments}
                currentUser={user}
                onSubmitComment={handleComment}
                onLikeComment={handleLikeComment}
                likedCommentIds={likedCommentIds}
                subjectNoun="المقال"
              />
            </article>

            {/* Sidebar */}
            <aside className="space-y-6">
              {/* AI-Powered Smart Recommendations */}
              {slug && <AIRecommendationsBlock articleSlug={slug} />}

              {/* Recent News - Not opinions */}
              <RecentNewsSection
                excludeArticleId={article?.id}
                limit={5}
              />
            </aside>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
