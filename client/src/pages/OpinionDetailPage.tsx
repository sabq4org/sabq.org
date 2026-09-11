import { ArticleSummary } from "@/components/public/ArticleSummary";
import "@/styles/article-detail.css";
import { useArticleSummaryAudio } from "@/hooks/useArticleSummaryAudio";
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
import { SocialShareBar } from "@/components/SocialShareBar";
import { FocusReader, FocusReaderTrigger } from "@/components/FocusReader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useBehaviorTracking } from "@/hooks/useBehaviorTracking";
import { useArticleReadTracking } from "@/hooks/useArticleReadTracking";
import { useCanonical } from "@/hooks/useCanonical";
import { apiRequest, apiUrl, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import {
  trackOpinionView,
  trackArticleLike,
  trackBookmarkToggle,
  trackArticleComment,
} from "@/lib/analytics";
import { DmsLeaderboardAd, DmsMpuAd, useAdTracking, updateSignalDataLayer, triggerAdsWhenReady, resetAdsTriggerFlag } from "@/components/DmsAdSlot";
import { transformArticleHtml } from "@/lib/legacyHtmlTransformer";
import { 
  ArrowRight, 
  Clock, 
  BookOpen,
  User,
  Calendar,
  Heart,
  Eye,
  Bookmark,
  Share2,
  CheckCircle2,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { arSA } from "date-fns/locale";
import type { ArticleWithDetails, CommentWithUser } from "@shared/schema";
import { useEffect, useState, useRef, useMemo } from "react";
import DOMPurify from "isomorphic-dompurify";
import { formatArticleTimestamp } from "@/lib/formatTime";

export default function OpinionDetailPage() {
  useAdTracking('رأي');
  
  const params = useParams();
  const slug = params.slug;
  const { toast } = useToast();
  const { logBehavior } = useBehaviorTracking();
  const [, setLocation] = useLocation();


  // Smart summary collapsible state
  const [focusOpen, setFocusOpen] = useState(false);

  const { data: user } = useQuery<{ id: string; name?: string; email?: string; role?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const { data: article, isLoading } = useQuery<ArticleWithDetails>({
    queryKey: ["/api/opinion", slug],
    enabled: !!slug,
  });

  const { data: bylineProfile } = useQuery<{ title?: string | null }>({
    queryKey: ["/api/reporters", article?.staff?.slug],
    enabled: !!article?.staff?.slug,
    staleTime: 5 * 60 * 1000,
    retry: false,
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
      fetch(apiUrl(`/api/articles/${articleId}/view`), { method: 'POST' })
        .then(r => r.json())
        .then(() => {})
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

  const sanitizedArticleHtml = useMemo(() => {
    if (!article?.content) return "";
    const sanitized = DOMPurify.sanitize(article.content, {
      ADD_TAGS: ['iframe', 'blockquote', 'img', 'figure', 'figcaption'],
      ADD_ATTR: [
        'allow', 'allowfullscreen', 'frameborder', 'scrolling', 'src',
        'data-lang', 'data-theme', 'data-video-embed', 'data-url', 'data-embed-url',
        'data-whatsapp-cta', 'data-phone', 'data-phrase', 'data-message',
        'data-align', 'data-width', 'data-caption',
        'class', 'alt', 'loading', 'width', 'height', 'srcset', 'sizes',
        'style',
        'fetchpriority', 'decoding', 'target', 'rel', 'aria-label', 'aria-hidden',
      ],
      ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    });
    return transformArticleHtml(sanitized);
  }, [article?.content]);

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
        console.warn("Share failed:", err);
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
  const { isLoadingAudio, isPlaying, provider: audioProvider, handlePlayAudio } = useArticleSummaryAudio(
    slug, String(article?.updatedAt ?? ''), Boolean(article?.aiSummary || article?.excerpt),
  );

  const getInitials = (firstName?: string | null, lastName?: string | null, email?: string | null) => {
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

  // staff.slug → ملف المراسل؛ وإلا صفحة الكاتب بالاسم (مثل iOS AuthorArticlesView)
  const authorProfileHref = article.staff?.slug
    ? `/reporter/${article.staff.slug}`
    : authorName !== "كاتب غير معروف"
      ? `/author/${encodeURIComponent(authorName)}`
      : null;

  const timeAgo = article.publishedAt
    ? formatDistanceToNow(new Date(article.publishedAt), {
        addSuffix: true,
        locale: arSA,
      })
    : null;
  const publishedDateLabel = article.publishedAt
    ? formatArticleTimestamp(article.publishedAt, { format: 'absolute', locale: 'ar' })
    : null;
  const publicationParts = (() => {
    if (!article.publishedAt) return null;
    const date = new Date(article.publishedAt);
    if (Number.isNaN(date.getTime())) return null;
    const locale = "ar-SA-u-ca-gregory-nu-latn";
    return {
      iso: date.toISOString(),
      date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Riyadh" }).format(date),
      time: new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Riyadh" }).format(date),
    };
  })();
  const editorialModifiedAt = (article as any)?.seoMetadata?.editorialModifiedAt as string | undefined;
  const meaningfulUpdatedDateLabel = editorialModifiedAt
    ? formatArticleTimestamp(editorialModifiedAt, { format: 'absolute', locale: 'ar' })
    : null;

  const authorTitle = bylineProfile?.title?.trim() || "كاتب رأي";

  return (
    <div className="article-detail public-page min-h-screen bg-background flex flex-col" dir="rtl">
      <Header user={user} />
      <NavigationBar />

      <main className="flex-1">
        <div className="article-detail-main container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <DmsLeaderboardAd />
          <DmsMpuAd topSlot />
          
          <div className="article-detail-layout">
            {/* Main Content */}
            <article className="article-detail-content min-w-0">
              {/* Article Header */}
              <header className="article-detail-header">
                <div className="article-detail-labels flex flex-wrap items-center gap-2">
                  <Badge className="article-category-label gap-1" data-testid="badge-opinion-type">
                    <BookOpen className="h-3 w-3" />
                    مقال رأي
                  </Badge>
                  {article.category && (
                    <Badge variant="secondary" className="article-category-label" data-testid="badge-category">
                      {article.category.icon} {article.category.nameAr}
                    </Badge>
                  )}
                </div>

                <h1 className="article-detail-title" data-testid="text-article-title">
                  {article.title}
                </h1>

                {article.subtitle && (
                  <p className="article-detail-subtitle" data-testid="text-article-subtitle">
                    {article.subtitle}
                  </p>
                )}

                {/* Author & Meta */}
                <div className="article-detail-byline">
                  {article.author && (
                    <div className="flex items-center gap-2">
                      {authorProfileHref ? (
                        <Link href={authorProfileHref}>
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
                        {authorProfileHref ? (
                          <Link href={authorProfileHref}>
                            <p className="font-bold text-base text-foreground hover:text-primary transition-colors cursor-pointer" data-testid="text-author-name">
                              {authorName}
                            </p>
                          </Link>
                        ) : (
                          <p className="font-bold text-base text-foreground" data-testid="text-author-name">
                            {authorName}
                          </p>
                        )}
                        {authorTitle && <span className="article-byline-title" data-testid="text-author-title">{authorTitle}</span>}
                        {meaningfulUpdatedDateLabel && (
                          <time dateTime={editorialModifiedAt} title={meaningfulUpdatedDateLabel} className="text-muted-foreground text-xs">
                            آخر تحديث: {meaningfulUpdatedDateLabel}
                          </time>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="article-detail-metadata">
                    {publicationParts && <div className="article-publication-row"><Clock aria-hidden="true" /><time dateTime={publicationParts.iso} title={[publishedDateLabel, timeAgo].filter(Boolean).join(" — ")} aria-label={`نُشر في ${publishedDateLabel}`}><span>{publicationParts.date}</span><span className="article-publication-time">{publicationParts.time}</span></time></div>}
                    <div className="article-reading-meta"><span><Eye aria-hidden="true" /> {(article.views || 0).toLocaleString("en-US")} مشاهدة</span></div>
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

              {(article.aiSummary || article.excerpt) && (
                <ArticleSummary
                  key={article.id}
                  text={article.aiSummary || article.excerpt || ""}
                  audioProvider={audioProvider}
                  isLoadingAudio={isLoadingAudio}
                  isPlaying={isPlaying}
                  onPlayAudio={handlePlayAudio}
                />
              )}

              {/* Article Content */}
              <div
                className="article-prose prose prose-lg dark:prose-invert max-w-none leading-loose text-justify"
                dangerouslySetInnerHTML={{ __html: sanitizedArticleHtml }}
                data-testid="text-article-content"
              />

              {/* Keywords follow the body, matching the public news detail. */}
              {((article.seo?.keywords && article.seo.keywords.length > 0) || articleTags.length > 0) && (
                <div className="article-detail-keywords">
                  <h3 className="text-sm font-semibold text-muted-foreground">الكلمات المفتاحية</h3>
                  <div className="flex flex-wrap gap-2">
                    {articleTags.map((tag, index) => (
                      <Badge key={`tag-${tag.id}`} variant="secondary" className="article-keyword cursor-pointer" onClick={() => setLocation(`/tag/${tag.slug}`)} data-testid={`badge-tag-${index}`}>
                        {tag.nameAr}
                      </Badge>
                    ))}
                    {articleTags.length === 0 && article.seo?.keywords?.map((keyword, index) => (
                      <Badge key={`seo-${index}`} variant="secondary" className="article-keyword cursor-pointer" onClick={() => setLocation(`/keyword/${encodeURIComponent(keyword)}`)} data-testid={`badge-keyword-${index}`}>
                        {keyword}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              {/* Author Bio Section */}
              {article.author && (
              <div className="bg-muted/50 rounded-lg p-6">
                  <div className="flex items-start gap-4">
                    {authorProfileHref ? (
                      <Link href={authorProfileHref}>
                        <Avatar className="h-20 w-20 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all">
                          <AvatarImage 
                            src={article.staff?.profileImage || article.author?.profileImageUrl || ""} 
                            alt={authorName}
                            className="object-cover"
                          />
                          <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                            {getInitials(article.author?.firstName, article.author?.lastName, article.author?.email)}
                          </AvatarFallback>
                        </Avatar>
                      </Link>
                    ) : (
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
                    )}
                    <div className="flex-1 space-y-2">
                      <h3 className="font-bold text-xl text-foreground">
                        عن الكاتب
                      </h3>
                      {authorProfileHref ? (
                        <Link href={authorProfileHref}>
                          <p className="font-semibold text-lg text-foreground hover:text-primary transition-colors cursor-pointer">
                            {authorName}
                          </p>
                        </Link>
                      ) : (
                        <p className="font-semibold text-lg text-foreground">
                          {authorName}
                        </p>
                      )}
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

              {/* Actions stay below the article body, alongside sharing. */}
              <div className="article-detail-toolbar article-bottom-share" data-testid="article-actions">
                <div className="article-detail-toolbar-row">
                  <div className="article-share-group">
                    <span className="article-share-label">شارك:</span>
                    <SocialShareBar title={article.title} url={window.location.href} copyUrl={window.location.href} description={article.excerpt || ""} articleId={article.id} className="article-social-links" />
                  </div>
                  <div className="article-engagement-actions flex flex-wrap items-center gap-2">
                    <Button
                      variant={article.hasReacted ? "default" : "outline"}
                      size="sm"
                      className="article-action gap-2 transition-colors"
                      onClick={handleReact}
                      disabled={reactMutation.isPending}
                      aria-pressed={!!article.hasReacted}
                      data-testid="button-article-react"
                    >
                      <Heart className={`h-4 w-4 ${article.hasReacted ? 'fill-current' : ''}`} />
                      <span>إعجاب ({article.reactionsCount || 0})</span>
                    </Button>

                    <Button
                      variant={article.isBookmarked ? "default" : "outline"}
                      size="sm"
                      className="article-action gap-2 transition-colors"
                      onClick={handleBookmark}
                      disabled={bookmarkMutation.isPending}
                      aria-pressed={!!article.isBookmarked}
                      data-testid="button-article-bookmark"
                    >
                      <Bookmark className={`h-4 w-4 ${article.isBookmarked ? 'fill-current' : ''}`} />
                      <span>{article.isBookmarked ? "محفوظ" : "حفظ"}</span>
                    </Button>

                    <FocusReaderTrigger
                      language="ar"
                      className="article-action"
                      onClick={() => setFocusOpen(true)}
                    />
                  </div>
                </div>
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
            <aside className="article-detail-sidebar" aria-label="المزيد عن المقال">
              {/* AI-Powered Smart Recommendations */}
              {slug && <AIRecommendationsBlock articleSlug={slug} />}

              {/* Recent News - Not opinions */}
              <RecentNewsSection
                excludeArticleId={article?.id}
                limit={5}
              />
            </aside>
          </div>
          <FocusReader
            open={focusOpen}
            onClose={() => setFocusOpen(false)}
            articleId={article.id}
            language="ar"
            isLoggedIn={!!user}
            title={article.title}
            subtitle={article.excerpt || article.subtitle || null}
            contentHtml={article.content}
            authorName={authorName}
            publishedAt={article.publishedAt}
            articleSlug={slug}
            articleImageUrl={article.imageUrl}
            categoryName={article.category?.nameAr || null}
          />
        </div>
      </main>

      <Footer />
    </div>
  );
}
