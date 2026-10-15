import { useAnalyticsPageMetadata } from "@/hooks/use-analytics";
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
import { useAnalyticsReadingEngagement } from "@/hooks/useAnalyticsReadingEngagement";
import { useCanonical } from "@/hooks/useCanonical";
import { apiRequest, apiUrl, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import {
  trackOpinionView,
  trackArticleLike,
  trackBookmarkToggle,
  trackArticleComment,
  trackReadingEngagement,
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
  ChevronLeft,
  ArrowLeft,
  Flame,
  Type,
  Minus,
  Plus,
  Copy,
  Check,
  PenTool,
  Quote,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { arSA } from "date-fns/locale";
import type { ArticleWithDetails, CommentWithUser } from "@shared/schema";
import { useEffect, useState, useRef, useMemo } from "react";
import DOMPurify from "isomorphic-dompurify";
import { formatArticleTimestamp } from "@/lib/formatTime";
import { cleanOpinionAuthorBio } from "@/components/public/OpinionCard";

type FontSizeOption = "small" | "medium" | "large" | "xlarge";
type ReadingSurfaceOption = "default" | "paper" | "calm";

const FONT_SIZE_STYLES: Record<FontSizeOption, { fontSize: string; lineHeight: string; label: string }> = {
  small: { fontSize: "18px", lineHeight: "1.9", label: "صغير" },
  medium: { fontSize: "20px", lineHeight: "2.05", label: "افتراضي" },
  large: { fontSize: "22px", lineHeight: "2.15", label: "كبير" },
  xlarge: { fontSize: "25px", lineHeight: "2.25", label: "كبير جداً" },
};

const FONT_SIZE_ORDER: FontSizeOption[] = ["small", "medium", "large", "xlarge"];

export default function OpinionDetailPage() {
  useAdTracking('رأي');
  
  const params = useParams();
  const slug = params.slug;
  const { toast } = useToast();
  const { logBehavior } = useBehaviorTracking();
  const [, setLocation] = useLocation();


  // Smart summary collapsible state
  const [focusOpen, setFocusOpen] = useState(false);

  // Reader Experience Controls (Font size, surface, reading progress, quote selection)
  const [fontSize, setFontSize] = useState<FontSizeOption>(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem("sabq:opinion:fontSize") as FontSizeOption | null;
      if (saved && FONT_SIZE_ORDER.includes(saved)) return saved;
    }
    return "medium";
  });
  const [readingSurface, setReadingSurface] = useState<ReadingSurfaceOption>(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem("sabq:opinion:surface") as ReadingSurfaceOption | null;
      if (saved === "default" || saved === "paper" || saved === "calm") return saved;
    }
    return "default";
  });
  const [readingProgress, setReadingProgress] = useState(0);
  const [selectionQuote, setSelectionQuote] = useState<{
    text: string;
    top: number;
    left: number;
  } | null>(null);
  const [copiedSelection, setCopiedSelection] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem("sabq:opinion:fontSize", fontSize);
    } catch {
      // Ignore storage error
    }
  }, [fontSize]);

  useEffect(() => {
    try {
      window.localStorage.setItem("sabq:opinion:surface", readingSurface);
    } catch {
      // Ignore storage error
    }
  }, [readingSurface]);

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

  // Fetch other opinion articles by the same author
  const authorIdForQuery = article?.authorId || article?.author?.id;
  const { data: authorArticlesPayload } = useQuery<{ articles: ArticleWithDetails[] }>({
    queryKey: [`/api/opinion?authorId=${encodeURIComponent(authorIdForQuery || "")}&limit=4`],
    enabled: !!authorIdForQuery,
    staleTime: 5 * 60 * 1000,
  });
  const authorOtherArticles = useMemo(() => {
    const list = Array.isArray(authorArticlesPayload?.articles) ? authorArticlesPayload.articles : [];
    return list.filter((item) => item.id !== article?.id).slice(0, 3);
  }, [authorArticlesPayload?.articles, article?.id]);

  // Fetch top-read opinion articles for the sidebar
  const { data: topOpinionsPayload } = useQuery<{ articles: ArticleWithDetails[] }>({
    queryKey: ["/api/opinion?sort=views&limit=6"],
    staleTime: 5 * 60 * 1000,
  });
  const topOpinions = useMemo(() => {
    const list = Array.isArray(topOpinionsPayload?.articles) ? topOpinionsPayload.articles : [];
    return list.filter((item) => item.id !== article?.id).slice(0, 5);
  }, [topOpinionsPayload?.articles, article?.id]);

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

  useAnalyticsPageMetadata(article?.title ? `${article.title} | سبق` : isLoading ? null : "تعذر عرض المقال | سبق");

  useCanonical(article ? `https://sabq.org/article/${article.englishSlug || slug}` : null);

  // One content view per route visit, independent of background metadata refreshes.
  const analyticsOpinionVisit = useRef<string | null>(null);
  useEffect(() => {
    if (!article?.id) return;
    const visit = `${slug}:${article.id}`;
    if (analyticsOpinionVisit.current === visit) return;
    analyticsOpinionVisit.current = visit;
    const author = article.author
      ? `${article.author.firstName || ""} ${article.author.lastName || ""}`.trim()
      : "";
    trackOpinionView(article.id, article.title || "", author);
  }, [slug, article?.id, article?.title, article?.author?.firstName, article?.author?.lastName]);

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

  const articleBodyRef = useRef<HTMLDivElement>(null);
  useAnalyticsReadingEngagement({
    articleId: article?.id || "",
    contentRef: articleBodyRef,
    enabled: !!article?.id,
    onEvent: (event) => trackReadingEngagement(event.name, event.params),
  });

  const estimatedReadMinutes = useMemo(() => {
    if (!article?.content) return 3;
    const plain = article.content.replace(/<[^>]*>/g, " ").trim();
    const words = plain ? plain.split(/\s+/).length : 0;
    return Math.max(1, Math.round(words / 200));
  }, [article?.content]);

  const remainingReadMinutes = useMemo(() => {
    if (readingProgress >= 95) return 0;
    return Math.max(1, Math.ceil(estimatedReadMinutes * (1 - readingProgress / 100)));
  }, [estimatedReadMinutes, readingProgress]);

  // Track reading scroll progress through articleBodyRef
  useEffect(() => {
    const updateProgress = () => {
      const el = articleBodyRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const totalScrollable = Math.max(1, rect.height - viewportHeight * 0.45);
      const scrolled = Math.min(Math.max(0, -rect.top + viewportHeight * 0.25), totalScrollable);
      setReadingProgress(Math.round((scrolled / totalScrollable) * 100));
    };

    updateProgress();
    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress);
    return () => {
      window.removeEventListener("scroll", updateProgress);
      window.removeEventListener("resize", updateProgress);
    };
  }, [sanitizedArticleHtml]);

  // Floating quote selection toolbar inside article body
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        setSelectionQuote(null);
        return;
      }
      const selectedText = selection.toString().trim();
      if (selectedText.length < 15 || selectedText.length > 360) {
        setSelectionQuote(null);
        return;
      }
      const container = articleBodyRef.current;
      if (!container) return;
      const anchorNode = selection.anchorNode;
      const focusNode = selection.focusNode;
      if (!anchorNode || !focusNode || !container.contains(anchorNode) || !container.contains(focusNode)) {
        setSelectionQuote(null);
        return;
      }
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setSelectionQuote(null);
        return;
      }
      setSelectionQuote({
        text: selectedText,
        top: Math.max(16, rect.top - 52),
        left: Math.min(
          window.innerWidth - 140,
          Math.max(140, rect.left + rect.width / 2),
        ),
      });
    };

    document.addEventListener("mouseup", handleSelectionChange);
    document.addEventListener("touchend", handleSelectionChange);
    return () => {
      document.removeEventListener("mouseup", handleSelectionChange);
      document.removeEventListener("touchend", handleSelectionChange);
    };
  }, []);

  const stepFontSize = (direction: -1 | 1) => {
    const idx = FONT_SIZE_ORDER.indexOf(fontSize);
    const nextIdx = Math.min(FONT_SIZE_ORDER.length - 1, Math.max(0, idx + direction));
    setFontSize(FONT_SIZE_ORDER[nextIdx]);
  };

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

  const cleanedAuthorBio = cleanOpinionAuthorBio((article as any).staff?.bioAr || article.author?.bio);
  const authorTitle = bylineProfile?.title?.trim() || cleanedAuthorBio || "كاتب رأي";

  const handleCopySelectedQuote = async () => {
    if (!selectionQuote || !article) return;
    const formatted = `«${selectionQuote.text}»\n— ${authorName} في مقالات سبق (${article.title})`;
    try {
      await navigator.clipboard.writeText(formatted);
      setCopiedSelection(true);
      toast({
        title: "تم نسخ الاقتباس",
        description: "يمكنك الآن لصق الاقتباس ومشاركته",
      });
      setTimeout(() => {
        setCopiedSelection(false);
        setSelectionQuote(null);
      }, 1400);
    } catch {
      toast({
        title: "تعذر النسخ",
        description: "يرجى المحاولة مرة أخرى",
        variant: "destructive",
      });
    }
  };

  const handleShareSelectedQuote = async () => {
    if (!selectionQuote || !article) return;
    const formatted = `«${selectionQuote.text}» — ${authorName} (${article.title})`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: article.title,
          text: formatted,
          url: window.location.href,
        });
        setSelectionQuote(null);
        return;
      } catch {
        // Fallback to copy
      }
    }
    await handleCopySelectedQuote();
  };

  const readingSurfaceClasses =
    readingSurface === "paper"
      ? "rounded-2xl border border-amber-900/15 bg-[#fbf7ee] dark:bg-amber-950/20 px-5 py-6 sm:px-8 sm:py-8 shadow-sm transition-colors"
      : readingSurface === "calm"
        ? "rounded-2xl border border-border/60 bg-muted/35 px-5 py-6 sm:px-8 sm:py-8 transition-colors"
        : "transition-colors";

  return (
    <div className="article-detail opinion-detail public-page min-h-screen bg-background flex flex-col" dir="rtl">
      {/* Top Reading Progress Bar */}
      <div
        className="fixed top-0 inset-x-0 z-50 h-1 bg-transparent pointer-events-none"
        aria-hidden="true"
      >
        <div
          className="h-full bg-primary transition-[width] duration-150 ease-out"
          style={{ width: `${readingProgress}%` }}
          data-testid="reading-progress-bar"
        />
      </div>

      {/* Floating Selection Quote Share/Copy Toolbar */}
      {selectionQuote && (
        <div
          className="fixed z-50 -translate-x-1/2 flex items-center gap-1 rounded-full border border-border bg-popover/95 px-2.5 py-1 text-xs font-medium text-popover-foreground shadow-lg backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
          style={{ top: `${selectionQuote.top}px`, left: `${selectionQuote.left}px` }}
          data-testid="opinion-selection-toolbar"
        >
          <button
            type="button"
            onClick={handleCopySelectedQuote}
            className="no-min-touch-size inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 py-0.5 hover:bg-muted transition-colors"
            data-testid="button-copy-quote"
          >
            {copiedSelection ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-primary" />
            )}
            <span>{copiedSelection ? "تم النسخ" : "نسخ الاقتباس"}</span>
          </button>
          <span className="h-3.5 w-px bg-border" />
          <button
            type="button"
            onClick={handleShareSelectedQuote}
            className="no-min-touch-size inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 py-0.5 hover:bg-muted transition-colors"
            data-testid="button-share-quote"
          >
            <Share2 className="h-3.5 w-3.5 text-primary" />
            <span>مشاركة</span>
          </button>
        </div>
      )}

      <Header user={user} />
      <NavigationBar />

      {/* DMS: الليدربورد مباشرة تحت القائمة الرئيسية كما في صفحة الخبر (طلب DMS 2026-09-29) */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 pt-4 max-w-7xl empty:hidden">
        <DmsLeaderboardAd />
      </div>

      <main className="flex-1">
        <div className="article-detail-main container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
          <DmsMpuAd topSlot />

          {/* Breadcrumbs */}
          <nav className="article-breadcrumbs" aria-label="مسار التنقل" data-testid="nav-opinion-breadcrumbs">
            <Link href="/" className="hover:text-foreground transition-colors" data-testid="breadcrumb-home">
              الرئيسية
            </Link>
            <ChevronLeft aria-hidden="true" />
            <Link href="/opinion" className="hover:text-foreground transition-colors" data-testid="breadcrumb-opinion">
              مقالات الرأي
            </Link>
            {article.category?.nameAr && (
              <>
                <ChevronLeft aria-hidden="true" />
                <span className="text-muted-foreground">{article.category.nameAr}</span>
              </>
            )}
            <ChevronLeft aria-hidden="true" />
            {authorProfileHref ? (
              <Link href={authorProfileHref} className="font-semibold text-foreground hover:text-primary transition-colors">
                {authorName}
              </Link>
            ) : (
              <span className="font-semibold text-foreground">{authorName}</span>
            )}
          </nav>
          
          <div className="article-detail-layout">
            {/* Main Content */}
            <article className="article-detail-content min-w-0">
              {/* Article Header */}
              <header className="article-detail-header">
                <div className="article-detail-labels flex flex-wrap items-center gap-2">
                  <Link href="/opinion">
                    <Badge className="article-category-label gap-1 cursor-pointer hover:opacity-90 transition-opacity" data-testid="badge-opinion-type">
                      <PenTool className="h-3 w-3" />
                      مقال رأي
                    </Badge>
                  </Link>
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
                    <div className="flex items-center gap-3">
                      {authorProfileHref ? (
                        <Link href={authorProfileHref}>
                          <Avatar className="h-12 w-12 cursor-pointer ring-2 ring-primary/15 hover:ring-primary/50 transition-all">
                            {(article.staff?.profileImage || article.author?.profileImageUrl) && (
                              <AvatarImage 
                                src={article.staff?.profileImage || article.author?.profileImageUrl || ""} 
                                alt={authorName}
                                className="object-cover"
                              />
                            )}
                            <AvatarFallback className="bg-primary/10 text-primary font-bold">
                              {getInitials(article.author?.firstName, article.author?.lastName, article.author?.email)}
                            </AvatarFallback>
                          </Avatar>
                        </Link>
                      ) : (
                        <Avatar className="h-12 w-12 ring-2 ring-primary/15">
                          {article.author?.profileImageUrl && (
                            <AvatarImage 
                              src={article.author?.profileImageUrl} 
                              alt={authorName}
                              className="object-cover"
                            />
                          )}
                          <AvatarFallback className="bg-primary/10 text-primary font-bold">
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
                        {authorTitle && <span className="article-byline-title line-clamp-1 max-w-md" data-testid="text-author-title">{authorTitle}</span>}
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
                    <div className="article-reading-meta">
                      <span><BookOpen aria-hidden="true" /> {estimatedReadMinutes} د قراءة</span>
                    </div>
                    <div className="article-reading-meta"><span><Eye aria-hidden="true" /> {(article.views || 0).toLocaleString("en-US")} مشاهدة</span></div>
                  </div>
                </div>
              </header>

              {/* Reader Experience Toolbar: Single sleek horizontal bar on mobile & desktop */}
              <div
                className="flex items-center justify-between gap-1.5 sm:gap-2.5 overflow-x-auto no-scrollbar rounded-xl sm:rounded-2xl border border-border/70 bg-muted/25 px-2.5 py-1.5 sm:px-3.5 sm:py-2"
                data-testid="opinion-reader-toolbar"
              >
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  {/* Font Size Controls */}
                  <div className="inline-flex items-center gap-0.5 rounded-lg border border-border/70 bg-background/90 p-0.5 shrink-0">
                    <span className="hidden md:inline-flex items-center gap-1 px-2 text-xs font-medium text-muted-foreground">
                      <Type className="h-3.5 w-3.5" />
                      <span>حجم الخط</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => stepFontSize(-1)}
                      disabled={fontSize === "small"}
                      className="no-min-touch-size inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
                      aria-label="تصغير حجم النص"
                      data-testid="button-font-decrease"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setFontSize("medium")}
                      className="no-min-touch-size inline-flex h-7 items-center justify-center px-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                      title={`الحجم الحالي: ${FONT_SIZE_STYLES[fontSize].label}`}
                      data-testid="button-font-reset"
                    >
                      ع
                    </button>
                    <button
                      type="button"
                      onClick={() => stepFontSize(1)}
                      disabled={fontSize === "xlarge"}
                      className="no-min-touch-size inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
                      aria-label="تكبير حجم النص"
                      data-testid="button-font-increase"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Reading Surface Controls */}
                  <div
                    className="inline-flex items-center gap-0.5 rounded-lg border border-border/70 bg-background/90 p-0.5 shrink-0"
                    role="group"
                    aria-label="خلفية القراءة"
                  >
                    {(
                      [
                        { id: "default", label: "أبيض", dot: "bg-background border-border" },
                        { id: "paper", label: "ورقي", dot: "bg-[#f5ebd6] border-amber-700/30" },
                        { id: "calm", label: "هادئ", dot: "bg-slate-200 dark:bg-slate-700 border-slate-400/40" },
                      ] as const
                    ).map((surface) => (
                      <button
                        key={surface.id}
                        type="button"
                        onClick={() => setReadingSurface(surface.id)}
                        className={`no-min-touch-size inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] sm:text-xs font-medium transition-colors shrink-0 ${
                          readingSurface === surface.id
                            ? "bg-primary/15 text-primary font-semibold"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                        aria-pressed={readingSurface === surface.id}
                        data-testid={`button-surface-${surface.id}`}
                      >
                        <span className={`h-2.5 w-2.5 rounded-full border shrink-0 ${surface.dot}`} />
                        <span>{surface.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Live Reading Progress Indicator */}
                  <span
                    className="hidden lg:inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                    data-testid="text-reading-progress"
                  >
                    <Clock className="h-3.5 w-3.5 text-primary" />
                    {readingProgress > 5 && readingProgress < 95
                      ? `متبقٍ ${remainingReadMinutes} د`
                      : readingProgress >= 95
                        ? "اكتملت القراءة"
                        : `${estimatedReadMinutes} د قراءة`}
                  </span>

                  <Button
                    variant={article.isBookmarked ? "default" : "outline"}
                    size="sm"
                    className="no-min-touch-size h-7 sm:h-8 rounded-lg px-2 sm:px-2.5 text-[11px] sm:text-xs gap-1 shrink-0"
                    onClick={handleBookmark}
                    disabled={bookmarkMutation.isPending}
                    aria-pressed={!!article.isBookmarked}
                    data-testid="button-top-bookmark"
                  >
                    <Bookmark className={`h-3.5 w-3.5 shrink-0 ${article.isBookmarked ? "fill-current" : ""}`} />
                    <span>{article.isBookmarked ? "محفوظ" : "حفظ"}</span>
                  </Button>

                  <FocusReaderTrigger
                    language="ar"
                    className="no-min-touch-size h-7 sm:h-8 rounded-lg px-2 sm:px-2.5 text-[11px] sm:text-xs font-medium border border-border/70 bg-background/90 hover:bg-muted shrink-0"
                    onClick={() => setFocusOpen(true)}
                  />
                </div>
              </div>

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
              <div className={readingSurfaceClasses} data-testid="opinion-reading-surface">
                <div
                  ref={articleBodyRef}
                  className="article-prose opinion-prose prose prose-lg dark:prose-invert max-w-none leading-loose text-justify"
                  style={{
                    fontSize: FONT_SIZE_STYLES[fontSize].fontSize,
                    lineHeight: FONT_SIZE_STYLES[fontSize].lineHeight,
                  }}
                  dangerouslySetInnerHTML={{ __html: sanitizedArticleHtml }}
                  data-testid="text-article-content"
                />
              </div>

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

              {/* Upgraded Author Column Card + Other Articles by Same Columnist */}
              {article.author && (
                <section
                  className="rounded-2xl border border-border/80 bg-gradient-to-br from-muted/50 via-background to-muted/30 p-4 sm:p-7 space-y-4 sm:space-y-6"
                  aria-label="عن الكاتب ومقالاته"
                  data-testid="opinion-author-card"
                >
                  <div className="flex items-start gap-3.5 sm:gap-5">
                    {authorProfileHref ? (
                      <Link href={authorProfileHref}>
                        <Avatar className="h-14 w-14 sm:h-20 sm:w-20 cursor-pointer ring-2 ring-primary/20 hover:ring-primary/50 transition-all shrink-0">
                          <AvatarImage 
                            src={article.staff?.profileImage || article.author?.profileImageUrl || ""} 
                            alt={authorName}
                            className="object-cover"
                          />
                          <AvatarFallback className="bg-primary/10 text-primary text-lg sm:text-2xl font-bold">
                            {getInitials(article.author?.firstName, article.author?.lastName, article.author?.email)}
                          </AvatarFallback>
                        </Avatar>
                      </Link>
                    ) : (
                      <Avatar className="h-14 w-14 sm:h-20 sm:w-20 ring-2 ring-primary/20 shrink-0">
                        <AvatarImage 
                          src={article.author?.profileImageUrl || ""} 
                          alt={authorName}
                          className="object-cover"
                        />
                        <AvatarFallback className="bg-primary/10 text-primary text-lg sm:text-2xl font-bold">
                          {getInitials(article.author?.firstName, article.author?.lastName, article.author?.email)}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div className="flex-1 min-w-0 space-y-1.5 sm:space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] sm:text-xs font-bold text-primary">
                          <PenTool className="h-3 w-3" />
                          عن الكاتب
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          {authorProfileHref && (
                            <Link href={authorProfileHref}>
                              <Button variant="outline" size="sm" className="no-min-touch-size h-7 sm:h-8 px-2.5 sm:px-3 rounded-full text-[11px] sm:text-xs gap-1.5" data-testid="button-author-all-articles">
                                <span>جميع مقالات الكاتب</span>
                                <ArrowLeft className="h-3.5 w-3.5" />
                              </Button>
                            </Link>
                          )}
                        </div>
                      </div>
                      {authorProfileHref ? (
                        <Link href={authorProfileHref}>
                          <h3 className="font-bold text-lg sm:text-xl text-foreground hover:text-primary transition-colors cursor-pointer">
                            {authorName}
                          </h3>
                        </Link>
                      ) : (
                        <h3 className="font-bold text-lg sm:text-xl text-foreground">
                          {authorName}
                        </h3>
                      )}
                      {((article as any).staff?.bioAr || article.author?.bio) && (
                        <p className="text-xs sm:text-base text-muted-foreground leading-relaxed">
                          {(article as any).staff?.bioAr || article.author?.bio}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* More Opinion Articles by this Author */}
                  {authorOtherArticles.length > 0 && (
                    <div className="pt-5 border-t border-border/70 space-y-3" data-testid="author-other-opinions">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                          <Quote className="h-4 w-4 text-primary" />
                          <span>مقالات أخرى بقلم {authorName}</span>
                        </h4>
                        {authorProfileHref && (
                          <Link href={authorProfileHref} className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1">
                            <span>الأرشيف الكامل</span>
                            <ArrowLeft className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {authorOtherArticles.map((other) => (
                          <Link
                            key={other.id}
                            href={`/opinion/${other.englishSlug || other.slug}`}
                            className="group rounded-xl border border-border/70 bg-background/80 p-3.5 hover:border-primary/40 hover:bg-muted/30 transition-all flex flex-col justify-between gap-2"
                            data-testid={`link-author-more-${other.id}`}
                          >
                            <p className="text-sm font-bold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                              {other.title}
                            </p>
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                              {other.publishedAt && (
                                <time dateTime={new Date(other.publishedAt).toISOString()}>
                                  {formatArticleTimestamp(other.publishedAt, { format: "relative", locale: "ar" })}
                                </time>
                              )}
                              <span className="inline-flex items-center gap-1">
                                <Eye className="h-3 w-3" />
                                {(other.views || 0).toLocaleString("en-US")}
                              </span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
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
              {/* Related Opinion Articles */}
              {relatedArticles.length > 0 && (
                <section className="article-sidebar-module" data-testid="sidebar-related-opinions">
                  <div className="article-sidebar-heading">
                    <h2>
                      <span className="article-sidebar-heading-icon">
                        <PenTool aria-hidden="true" />
                      </span>
                      <span>مقالات رأي ذات صلة</span>
                    </h2>
                    <div className="article-sidebar-heading-description">
                      <span>زوايا رأي متقاربة في الموضوع</span>
                      <Link href="/opinion">
                        <span>كل المقالات</span>
                        <ArrowLeft aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                  <div className="article-sidebar-module-list">
                    {relatedArticles.slice(0, 4).map((rel) => {
                      const relAuthor = rel.author
                        ? `${rel.author.firstName || ""} ${rel.author.lastName || ""}`.trim() || "كاتب رأي"
                        : "كاتب رأي";
                      const relAvatar = (rel as any).staff?.profileImage || rel.author?.profileImageUrl || "";
                      return (
                        <article key={rel.id} className="public-news-card public-news-card-compact">
                          <Link
                            href={`/opinion/${rel.englishSlug || rel.slug}`}
                            className="public-card-link flex items-start gap-3 py-3"
                            data-testid={`link-related-opinion-${rel.id}`}
                          >
                            <Avatar className="h-11 w-11 shrink-0 ring-1 ring-border">
                              {relAvatar ? <AvatarImage src={relAvatar} alt={relAuthor} className="object-cover" /> : null}
                              <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                                {relAuthor.slice(0, 2)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="public-card-body flex-1 min-w-0">
                              <h3 className="public-card-title font-bold text-foreground line-clamp-2">
                                {rel.title}
                              </h3>
                              <div className="sidebar-card-meta">
                                <span className="sidebar-card-byline font-medium">{relAuthor}</span>
                                {rel.publishedAt && (
                                  <time dateTime={new Date(rel.publishedAt).toISOString()}>
                                    {formatArticleTimestamp(rel.publishedAt, { format: "relative", locale: "ar" })}
                                  </time>
                                )}
                              </div>
                            </div>
                          </Link>
                        </article>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Top-Read Opinion Columns */}
              {topOpinions.length > 0 && (
                <section className="article-sidebar-module" data-testid="sidebar-top-opinions">
                  <div className="article-sidebar-heading">
                    <h2>
                      <span className="article-sidebar-heading-icon">
                        <Flame aria-hidden="true" />
                      </span>
                      <span>الأكثر قراءة في الرأي</span>
                    </h2>
                    <div className="article-sidebar-heading-description">
                      <span>أبرز مقالات الكتّاب تفاعلاً</span>
                      <Link href="/opinion">
                        <span>منبر الرأي</span>
                        <ArrowLeft aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                  <div className="article-sidebar-module-list">
                    {topOpinions.map((topItem, index) => {
                      const topAuthor = topItem.author
                        ? `${topItem.author.firstName || ""} ${topItem.author.lastName || ""}`.trim() || "كاتب رأي"
                        : "كاتب رأي";
                      return (
                        <article key={topItem.id} className="public-news-card public-news-card-compact">
                          <Link
                            href={`/opinion/${topItem.englishSlug || topItem.slug}`}
                            className="public-card-link flex items-start gap-3 py-3"
                            data-testid={`link-top-opinion-${topItem.id}`}
                          >
                            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-extrabold text-primary">
                              {index + 1}
                            </span>
                            <div className="public-card-body flex-1 min-w-0">
                              <h3 className="public-card-title font-bold text-foreground line-clamp-2">
                                {topItem.title}
                              </h3>
                              <div className="sidebar-card-meta">
                                <span className="sidebar-card-byline font-medium">{topAuthor}</span>
                                <span className="inline-flex items-center gap-1 text-xs">
                                  · <Eye className="h-3 w-3" /> {(topItem.views || 0).toLocaleString("en-US")}
                                </span>
                              </div>
                            </div>
                          </Link>
                        </article>
                      );
                    })}
                  </div>
                </section>
              )}

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
