/**
 * تجربة تصميم معزولة لصفحة تفاصيل الخبر.
 * المسار: /lab/article/:slug
 * لا تُفهرس، لا تظهر في التنقل، ولا تستبدل /article/:slug.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import DOMPurify from "isomorphic-dompurify";
import {
  Bookmark,
  CheckCircle2,
  ChevronDown,
  Clock,
  Heart,
  Loader2,
  MessageSquare,
  Share2,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { ArticleWithDetails, CommentWithUser } from "@shared/schema";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CommentSection } from "@/components/CommentSection";
import { ArticlePoll } from "@/components/ArticlePoll";
import { Paywall } from "@/components/Paywall";
import StoryTimeline from "@/components/StoryTimeline";
import FollowStoryButton from "@/components/FollowStoryButton";
import { AdSlot } from "@/components/AdSlot";
import { NativeAdsSection } from "@/components/NativeAdsSection";
import { DmsLeaderboardAd, DmsMpuAd, useAdTracking } from "@/components/DmsAdSlot";
import { SocialShareBar } from "@/components/SocialShareBar";
import { DigitalPassportButton } from "@/components/passport/DigitalPassportButton";
import { FocusReader, FocusReaderTrigger } from "@/components/FocusReader";
import { ImageWithCaption } from "@/components/ImageWithCaption";
import { VideoPlayer } from "@/components/VideoPlayer";
import { WeeklyPhotosDisplay } from "@/components/WeeklyPhotosDisplay";
import { OptimizedImage } from "@/components/OptimizedImage";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useBehaviorTracking } from "@/hooks/useBehaviorTracking";
import { apiRequest, apiUrl, queryClient } from "@/lib/queryClient";
import { signalContentPainted } from "@/lib/contentPaintedSignal";
import { isUnauthorizedError } from "@/lib/authUtils";
import { getCacheBustedImageUrl, getObjectPosition } from "@/lib/imageUtils";
import { HERO_SIZES_ATTR } from "@/lib/cdnImage";
import { transformArticleHtml } from "@/lib/legacyHtmlTransformer";
import { formatArticleTimestamp } from "@/lib/formatTime";
import { useHeroPreload } from "@/hooks/useHeroPreload";
import { useNaturalAspectRatio } from "@/hooks/useNaturalAspectRatio";
import { trackArticleLike, trackBookmarkToggle, trackArticleComment } from "@/lib/analytics";
import "./articleLab.css";

const SHOW_TOP_AD = true;

type LabArticle = ArticleWithDetails & {
  subtitle?: string | null;
  excerpt?: string | null;
  seo?: { keywords?: string[]; metaTitle?: string; metaDescription?: string } | null;
  videoUrl?: string | null;
  videoThumbnailUrl?: string | null;
  weeklyPhotosData?: { photos?: Array<{ imageUrl: string; caption: string; credit?: string }> };
  priceHalalas?: number | null;
  previewLength?: number | null;
  isAiGeneratedImage?: boolean;
  aiImageModel?: string;
  aiBullets?: string[] | null;
  imageUrl?: string | null;
  publishedAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

type LabMediaAsset = {
  id?: string;
  displayOrder?: number;
  url?: string;
  altText?: string;
  captionHtml?: string;
  captionPlain?: string;
  sourceName?: string;
  sourceUrl?: string;
  relatedArticleSlugs?: string[];
  keywordTags?: string[];
  mediaFile?: {
    url?: string;
    altText?: string;
    width?: number;
    height?: number;
  };
};

type SidebarPayload = {
  related: ArticleWithDetails[];
  tags: Array<{ id: string; nameAr: string; nameEn: string; slug: string }>;
  mediaAssets: LabMediaAsset[];
};

type AiRecommendation = {
  id: string;
  title: string;
  slug: string;
  englishSlug?: string | null;
  publishedAt?: string | null;
  category?: { nameAr?: string | null };
  aiMetadata?: { reason?: string };
};

type RelatedOpinion = {
  id: string;
  title: string;
  slug: string;
  author?: { firstName?: string | null; lastName?: string | null };
};

function parseSummaryBullets(raw?: string | null): string[] {
  if (!raw || typeof raw !== "string") return [];
  const text = raw.trim();
  if (!text) return [];
  const byLine = text
    .split(/\r?\n+/)
    .map((l) => l.replace(/^\s*[-•*–·\d.)\s]+/, "").trim())
    .filter((l) => l.length > 4);
  if (byLine.length >= 2) return byLine.slice(0, 3);
  const cleaned = text.replace(/\s+/g, " ").trim();
  const bySentence = cleaned
    .split(/(?<=[\.!\?؟])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 4);
  if (bySentence.length >= 1) return bySentence.slice(0, 3);
  return [cleaned];
}

function getInitials(
  firstName?: string | null,
  lastName?: string | null,
  email?: string | null,
) {
  if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase();
  if (firstName) return firstName[0].toUpperCase();
  if (email) return email[0].toUpperCase();
  return "م";
}

function readingMinutes(html?: string | null) {
  if (!html) return 1;
  const words = html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function authorDisplayName(author?: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
} | null) {
  if (!author) return "";
  const name = `${author.firstName || ""} ${author.lastName || ""}`.trim();
  return name || author.email || "";
}

function articleHref(article: { englishSlug?: string | null; slug?: string | null }) {
  return `/lab/article/${article.englishSlug || article.slug}`;
}

function canonicalArticleHref(article: { englishSlug?: string | null; slug?: string | null }) {
  return `/article/${article.englishSlug || article.slug}`;
}

export default function ArticleDetailLab() {
  const { slug } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { logBehavior } = useBehaviorTracking();
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [readProgress, setReadProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const articleBodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsSummaryExpanded(false);
  }, [slug]);

  const { data: user } = useQuery<{ id: string; name?: string; email?: string; role?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const { data: articleRaw, isLoading } = useQuery<LabArticle>({
    queryKey: ["/api/articles", slug],
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const article = articleRaw ?? null;

  useEffect(() => {
    if (article) signalContentPainted();
  }, [article]);

  const storedBullets = useMemo(() => {
    if (Array.isArray(article?.aiBullets) && article.aiBullets.length > 0) {
      return article.aiBullets.slice(0, 3).map((b) => String(b).trim()).filter(Boolean);
    }
    return parseSummaryBullets(article?.aiSummary);
  }, [article?.aiBullets, article?.aiSummary]);
  const shouldFetchBullets = !!article?.id && storedBullets.length === 0;
  const { data: bulletsData, isLoading: isLoadingBullets } = useQuery<{ bullets: string[]; source?: string }>({
    queryKey: ["/api/articles", slug, "ai-bullets"],
    enabled: shouldFetchBullets,
    staleTime: 1000 * 60 * 30,
    retry: false,
    refetchInterval: (query) => {
      const d = query.state.data as { bullets?: string[]; source?: string } | undefined;
      const stillPending = d?.source === "pending" && (d?.bullets?.length ?? 0) === 0;
      return stillPending && query.state.dataUpdateCount < 5 ? 3500 : false;
    },
  });
  const aiBullets = storedBullets.length > 0 ? storedBullets : (bulletsData?.bullets || []);
  const summaryDetailText = (article?.aiSummary || article?.excerpt || "").trim();
  const showSummaryDetail = useMemo(() => {
    if (!summaryDetailText) return false;
    if (aiBullets.length === 0) return true;
    const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
    const joined = normalize(aiBullets.join(" "));
    const detail = normalize(summaryDetailText);
    if (!joined) return true;
    if (joined === detail) return false;
    const shorter = joined.length <= detail.length ? joined : detail;
    const longer = joined.length <= detail.length ? detail : joined;
    return !longer.includes(shorter) || longer.length > shorter.length * 1.35;
  }, [summaryDetailText, aiBullets]);
  const summaryNeedsToggle = useMemo(() => {
    const text = (aiBullets.length > 0 ? aiBullets.join(" ") : summaryDetailText).trim();
    return text.length > 120 || showSummaryDetail;
  }, [aiBullets, summaryDetailText, showSummaryDetail]);

  useAdTracking(article?.category?.nameAr || "", article?.id);

  const isVideoTemplate = !!(article?.isVideoTemplate && article?.videoUrl);
  const heroImageUrl = useMemo(
    () => (article?.imageUrl ? getCacheBustedImageUrl(article.imageUrl, article.updatedAt) : null),
    [article?.imageUrl, article?.updatedAt],
  );
  useHeroPreload(!isVideoTemplate && heroImageUrl ? heroImageUrl : null);

  const sanitizedArticleHtml = useMemo(() => {
    if (!article?.content) return "";
    const sanitized = DOMPurify.sanitize(article.content, {
      ADD_TAGS: ["iframe", "blockquote", "img", "figure", "figcaption"],
      ADD_ATTR: [
        "allow", "allowfullscreen", "frameborder", "scrolling", "src",
        "data-lang", "data-theme", "data-video-embed", "data-url", "data-embed-url",
        "data-whatsapp-cta", "data-phone", "data-phrase", "data-message",
        "data-align", "data-width", "data-caption",
        "class", "alt", "loading", "width", "height", "srcset", "sizes",
        "style",
        "fetchpriority", "decoding", "target", "rel", "aria-label", "aria-hidden",
      ],
      ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    });
    return transformArticleHtml(sanitized);
  }, [article?.content]);

  useNaturalAspectRatio(articleBodyRef, sanitizedArticleHtml);

  useEffect(() => {
    if (article?.articleType === "opinion" && slug) {
      setLocation(`/opinion/${slug}`);
    }
  }, [article?.articleType, slug, setLocation]);

  useEffect(() => {
    if (article?.articleType === "infographic" && slug) {
      setLocation(`/article/${article.englishSlug || slug}`);
    }
  }, [article?.articleType, article?.englishSlug, slug, setLocation]);

  useEffect(() => {
    if (article?.englishSlug && slug !== article.englishSlug) {
      window.history.replaceState(null, "", `/lab/article/${article.englishSlug}`);
    }
  }, [article?.englishSlug, slug]);

  const { data: commentsRaw } = useQuery<CommentWithUser[]>({
    queryKey: ["/api/articles", slug, "comments"],
    staleTime: 1000 * 60 * 2,
  });
  const comments = Array.isArray(commentsRaw) ? commentsRaw : [];

  const { data: myLikesRaw } = useQuery<string[]>({
    queryKey: ["/api/articles", slug, "comments", "my-likes"],
    enabled: !!slug && !!user?.id,
  });
  const likedCommentIds = Array.isArray(myLikesRaw) ? myLikesRaw : [];

  const handleLikeComment = async (commentId: string, nextLiked: boolean) => {
    await apiRequest(`/api/comments/${commentId}/like`, { method: nextLiked ? "POST" : "DELETE" });
    queryClient.invalidateQueries({ queryKey: ["/api/articles", slug, "comments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/articles", slug, "comments", "my-likes"] });
  };

  const { data: sidebarData } = useQuery<SidebarPayload>({
    queryKey: ["/api/articles", slug, "sidebar"],
    enabled: !!slug,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const relatedArticles = Array.isArray(sidebarData?.related) ? sidebarData.related : [];
  const articleTags = Array.isArray(sidebarData?.tags) ? sidebarData.tags : [];
  const mediaAssets = sidebarData?.mediaAssets;

  const { data: recommendationsRaw } = useQuery<AiRecommendation[]>({
    queryKey: ["/api/articles", slug, "ai-recommendations"],
    enabled: !!slug,
  });
  const recommendations = Array.isArray(recommendationsRaw) ? recommendationsRaw : [];

  const { data: relatedOpinionsRaw } = useQuery<{ articles: RelatedOpinion[] }>({
    queryKey: ["/api/opinion/related/category", article?.category?.id, { excludeId: article?.id, limit: 3 }],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: "3",
        ...(article?.id ? { excludeId: article.id } : {}),
      });
      const res = await fetch(apiUrl(`/api/opinion/related/category/${article?.category?.id}?${params}`), {
        credentials: "include",
      });
      if (!res.ok) return { articles: [] };
      return res.json();
    },
    enabled: !!article?.category?.id,
  });
  const relatedOpinions = Array.isArray(relatedOpinionsRaw?.articles) ? relatedOpinionsRaw.articles : [];

  const searchParams = new URLSearchParams(window.location.search);
  const guestToken = searchParams.get("token");
  const { data: purchaseStatus, isLoading: isLoadingPurchaseStatus } = useQuery<{ hasPurchased: boolean }>({
    queryKey: ["/api/payments/check-purchase", article?.id],
    queryFn: async () => {
      const url = apiUrl(`/api/payments/check-purchase/${article?.id}${guestToken ? `?token=${guestToken}` : ""}`);
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to check purchase status");
      return response.json();
    },
    enabled: !!article?.isPaid && !!article?.id,
  });

  const resolvedAuthor = useMemo(
    () => (article?.articleType === "opinion" ? article?.opinionAuthor : article?.author),
    [article?.articleType, article?.opinionAuthor, article?.author],
  );

  useEffect(() => {
    const previousDir = document.documentElement.dir;
    const previousLang = document.documentElement.lang;
    document.documentElement.dir = "rtl";
    document.documentElement.lang = "ar";
    return () => {
      document.documentElement.dir = previousDir || "ltr";
      document.documentElement.lang = previousLang || "en";
    };
  }, []);

  useEffect(() => {
    if (article?.title) {
      document.title = `تجربة | ${article.title} | سبق`;
    }
    return () => {
      document.title = "سبق - صحيفة إلكترونية سعودية";
    };
  }, [article?.title]);

  useEffect(() => {
    const existing = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    const created = !existing;
    const tag = existing ?? document.createElement("meta");
    const previous = existing?.content;
    tag.setAttribute("name", "robots");
    tag.content = "noindex, nofollow";
    if (created) document.head.appendChild(tag);
    return () => {
      if (created) tag.remove();
      else if (previous) tag.content = previous;
    };
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      setReadProgress(max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [article?.id]);

  useEffect(() => {
    if (!article?.content) return;
    const applyThemeToTweets = () => {
      const isDark = document.documentElement.classList.contains("dark");
      document.querySelectorAll("blockquote.twitter-tweet").forEach((block) => {
        block.setAttribute("data-theme", isDark ? "dark" : "light");
      });
    };
    applyThemeToTweets();
    const existingScript = document.querySelector('script[src="https://platform.twitter.com/widgets.js"]');
    const twttr = (window as unknown as { twttr?: { widgets?: { load: () => void } } }).twttr;
    if (existingScript && twttr?.widgets) {
      twttr.widgets.load();
    } else if (!existingScript) {
      const script = document.createElement("script");
      script.src = "https://platform.twitter.com/widgets.js";
      script.async = true;
      script.charset = "utf-8";
      script.onload = () => {
        applyThemeToTweets();
        const loaded = (window as unknown as { twttr?: { widgets?: { load: () => void } } }).twttr;
        loaded?.widgets?.load();
      };
      document.body.appendChild(script);
    }
  }, [article?.content]);

  const refreshEngagementLists = useCallback(() => {
    queryClient.invalidateQueries({
      predicate: (q) =>
        Array.isArray(q.queryKey) &&
        q.queryKey[0] === "/api/articles" &&
        typeof q.queryKey[1] !== "string",
    });
    queryClient.invalidateQueries({ queryKey: ["/api/profile/liked"] });
  }, []);

  const reactMutation = useMutation({
    mutationFn: async () => {
      if (!article) return;
      return await apiRequest(`/api/articles/${article.id}/react`, { method: "POST" });
    },
    onSuccess: (result: { hasReacted?: boolean } | undefined) => {
      const nowReacted = !!result?.hasReacted;
      queryClient.setQueryData<LabArticle>(["/api/articles", slug], (old) =>
        old
          ? {
              ...old,
              hasReacted: nowReacted,
              reactionsCount: Math.max(
                0,
                (old.reactionsCount || 0) + (nowReacted === !!old.hasReacted ? 0 : nowReacted ? 1 : -1),
              ),
            }
          : old,
      );
      if (article) {
        if (nowReacted) logBehavior("reaction_add", { articleId: article.id });
        trackArticleLike(article.id, nowReacted);
      }
    },
    onError: (error: Error) => {
      toast({
        title: isUnauthorizedError(error) ? "تسجيل دخول مطلوب" : "خطأ",
        description: isUnauthorizedError(error) ? "يجب تسجيل الدخول للتفاعل مع المقالات" : error.message,
        variant: "destructive",
      });
    },
  });

  const bookmarkMutation = useMutation({
    mutationFn: async () => {
      if (!article) return;
      return await apiRequest(`/api/articles/${article.id}/bookmark`, { method: "POST" });
    },
    onSuccess: (result: { isBookmarked?: boolean } | undefined) => {
      const nowBookmarked = !!result?.isBookmarked;
      queryClient.setQueryData<LabArticle>(["/api/articles", slug], (old) =>
        old ? { ...old, isBookmarked: nowBookmarked } : old,
      );
      if (article) {
        logBehavior(nowBookmarked ? "bookmark_add" : "bookmark_remove", { articleId: article.id });
        trackBookmarkToggle(article.id, nowBookmarked);
      }
    },
    onError: (error: Error) => {
      toast({
        title: isUnauthorizedError(error) ? "تسجيل دخول مطلوب" : "خطأ",
        description: isUnauthorizedError(error) ? "يجب تسجيل الدخول لحفظ المقالات" : error.message,
        variant: "destructive",
      });
    },
  });

  const commentMutation = useMutation({
    mutationFn: async (data: { content: string; parentId?: string }) => {
      return await apiRequest(`/api/articles/${slug}/comments`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: (_result, variables) => {
      if (article) logBehavior("comment_create", { articleId: article.id });
      trackArticleComment(slug ?? "", variables?.parentId);
      queryClient.invalidateQueries({ queryKey: ["/api/articles", slug, "comments"] });
      toast({
        title: "شكراً لمشاركتك",
        description: "يتم مراجعة تعليقك وفق معايير المجتمع.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: isUnauthorizedError(error) ? "تسجيل دخول مطلوب" : "خطأ",
        description: isUnauthorizedError(error) ? "يجب تسجيل الدخول لإضافة تعليق" : error.message,
        variant: "destructive",
      });
    },
  });

  const handlePlayAudio = useCallback(async () => {
    if (!article?.aiSummary && !article?.excerpt) return;
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      return;
    }
    if (audioRef.current && audioRef.current.src) {
      await audioRef.current.play();
      setIsPlaying(true);
      return;
    }
    try {
      setIsLoadingAudio(true);
      const timestamp = article?.updatedAt ? new Date(article.updatedAt).toISOString() : new Date().toISOString();
      const audioUrl = `/api/articles/${slug}/summary-audio?v=${encodeURIComponent(timestamp)}&tts=tafqit-v2`;
      audioRef.current = new Audio(audioUrl);
      audioRef.current.addEventListener("ended", () => setIsPlaying(false));
      audioRef.current.addEventListener("error", () => {
        setIsPlaying(false);
        setIsLoadingAudio(false);
      });
      audioRef.current.addEventListener("canplaythrough", async () => {
        if (!audioRef.current) return;
        await audioRef.current.play();
        setIsPlaying(true);
        setIsLoadingAudio(false);
      }, { once: true });
      audioRef.current.load();
    } catch {
      setIsLoadingAudio(false);
    }
  }, [article?.aiSummary, article?.excerpt, article?.updatedAt, slug]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [slug]);

  const timeAgo = article?.publishedAt
    ? formatArticleTimestamp(article.publishedAt, { format: "relative", locale: "ar" })
    : null;
  const absoluteTime = article?.publishedAt
    ? formatArticleTimestamp(article.publishedAt, { format: "absolute", locale: "ar" })
    : null;
  const updatedAgo = useMemo(() => {
    if (!article?.publishedAt || !article?.updatedAt) return null;
    const published = new Date(article.publishedAt).getTime();
    const updated = new Date(article.updatedAt).getTime();
    if (!Number.isFinite(published) || !Number.isFinite(updated)) return null;
    if (updated - published < 60 * 60 * 1000) return null;
    return formatArticleTimestamp(article.updatedAt, { format: "relative", locale: "ar" });
  }, [article?.publishedAt, article?.updatedAt]);

  const minutes = readingMinutes(article?.content);
  const canonicalSlug = article?.englishSlug || slug || "";
  const shareUrl = `https://sabq.org/article/${canonicalSlug}`;
  const heroAsset = mediaAssets?.find((asset) => asset.displayOrder === 0);
  const additionalMedia = (mediaAssets || [])
    .filter((asset) => asset.displayOrder !== 0 && (asset.mediaFile?.url || asset.url))
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
  const albumImages = article?.albumImages || [];
  const hasSummary = aiBullets.length > 0 || (shouldFetchBullets && isLoadingBullets) || !!article?.aiSummary || !!article?.excerpt;
  const seoKeywords = article?.seo?.keywords || [];

  const continueItems = useMemo(() => {
    const seen = new Set<string>();
    const items: Array<{
      key: string;
      href: string;
      title: string;
      meta: string;
      imageUrl?: string | null;
    }> = [];
    for (const rec of recommendations) {
      const href = articleHref(rec);
      if (seen.has(href)) continue;
      seen.add(href);
      items.push({
        key: `ai-${rec.id}`,
        href,
        title: rec.title,
        meta: rec.aiMetadata?.reason || rec.category?.nameAr || "مقترح لك",
        imageUrl: null,
      });
    }
    for (const rel of relatedArticles) {
      const href = articleHref(rel);
      if (seen.has(href)) continue;
      seen.add(href);
      items.push({
        key: `rel-${rel.id}`,
        href,
        title: rel.title,
        meta: [
          rel.category?.nameAr,
          rel.publishedAt ? formatArticleTimestamp(rel.publishedAt, { format: "relative", locale: "ar" }) : null,
        ].filter(Boolean).join(" · "),
        imageUrl: rel.imageUrl,
      });
    }
    return items.slice(0, 6);
  }, [recommendations, relatedArticles]);

  if (isLoading) {
    return (
      <div className="article-lab min-h-screen bg-background" dir="rtl">
        <Header user={user} />
        <main className="mx-auto w-full max-w-[var(--lab-measure-wide)] px-4 py-14">
          <Skeleton className="mb-6 h-3 w-24" />
          <Skeleton className="mb-3 h-10 w-11/12" />
          <Skeleton className="mb-8 h-10 w-8/12" />
          <Skeleton className="mb-4 h-3 w-1/2" />
          <Skeleton className="mb-10 aspect-[16/9] w-full" />
          <div className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-10/12" />
          </div>
        </main>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="article-lab min-h-screen bg-background" dir="rtl">
        <Header user={user} />
        <main className="mx-auto max-w-[var(--lab-measure)] px-4 py-24 text-center">
          <p className="article-lab-kicker mb-4">تجربة تصميم</p>
          <h1 className="article-lab-title mb-4 text-3xl">الخبر غير موجود</h1>
          <p className="text-muted-foreground mb-8">تعذّر العثور على هذا الخبر في النسخة التجريبية.</p>
          <Link href="/" className="text-primary underline-offset-4 hover:underline">
            العودة إلى الرئيسية
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  const authorName = authorDisplayName(resolvedAuthor);

  return (
    <div className="article-lab min-h-screen bg-background" dir="rtl" data-testid="article-lab-page">
      <div className="article-lab-progress" aria-hidden="true">
        <span style={{ width: `${readProgress}%` }} />
      </div>

      <Header user={user} />

      <div className="article-lab-notice">
        <div className="mx-auto flex max-w-[var(--lab-measure-wide)] flex-wrap items-center justify-between gap-2 px-4 py-2">
          <span>تجربة تصميم للقراءة — ليست صفحة الخبر المعتمدة</span>
          <Link
            href={canonicalArticleHref(article)}
            className="font-medium text-foreground underline-offset-4 hover:underline"
            data-testid="link-article-lab-canonical"
          >
            فتح الصفحة الحالية
          </Link>
        </div>
      </div>

      {SHOW_TOP_AD && (
        <div className="mx-auto max-w-5xl px-4 pt-5">
          <DmsLeaderboardAd />
        </div>
      )}

      <main className="pb-24 md:pb-16">
        <header className="mx-auto w-full max-w-[var(--lab-measure-wide)] px-4 pt-10 sm:pt-14">
          <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
            {article.category && (
              <p className="article-lab-kicker">
                <Link href={`/category/${article.category.slug}`}>{article.category.nameAr}</Link>
              </p>
            )}
            {article.newsType === "breaking" && (
              <span className="text-xs font-bold tracking-wide text-red-600" data-testid="text-article-lab-breaking">
                عاجل
              </span>
            )}
            {article.isReading && (
              <span className="text-xs text-muted-foreground">قراءة</span>
            )}
            {slug && (
              <DigitalPassportButton
                slug={slug}
                language="ar"
                variant="ghost"
                size="sm"
                className="!h-auto !min-h-0 !px-0 !py-0 !text-xs !font-medium !shadow-none text-muted-foreground"
              />
            )}
          </div>

          {article.subtitle && (
            <p className="article-lab-dek mb-3" data-testid="text-article-lab-subtitle">
              {article.subtitle}
            </p>
          )}

          <h1
            className="article-lab-title text-[2rem] sm:text-[2.55rem] lg:text-[3.15rem]"
            data-testid="text-article-lab-title"
          >
            {article.title}
          </h1>

          <div className="article-lab-byline mt-7 flex flex-wrap items-center gap-x-3 gap-y-2">
            {resolvedAuthor && (
              <div className="flex items-center gap-2.5">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={resolvedAuthor.profileImageUrl || ""} alt={authorName} className="object-cover" />
                  <AvatarFallback className="text-[11px]">{getInitials(resolvedAuthor.firstName, resolvedAuthor.lastName, resolvedAuthor.email)}</AvatarFallback>
                </Avatar>
                {article.staff ? (
                  <Link href={`/reporter/${article.staff.slug}`} data-testid="link-article-lab-author">
                    {authorName}
                    {article.staff.isVerified && <CheckCircle2 className="ms-1 inline h-3.5 w-3.5 text-primary" />}
                  </Link>
                ) : (
                  <span data-testid="text-article-lab-author">{authorName}</span>
                )}
              </div>
            )}
            {timeAgo && (
              <span className="inline-flex items-center gap-1" title={absoluteTime || undefined}>
                <Clock className="h-3 w-3 opacity-60" />
                {timeAgo}
              </span>
            )}
            <span>{minutes} د قراءة</span>
            {updatedAgo && <span>حدّث {updatedAgo}</span>}
          </div>
        </header>

        {isVideoTemplate && article.videoUrl ? (
          <div className="article-lab-hero mx-auto mt-8 w-full max-w-[var(--lab-measure-wide)] sm:px-4">
            <VideoPlayer
              videoUrl={article.videoUrl}
              thumbnailUrl={getCacheBustedImageUrl(article.videoThumbnailUrl || article.imageUrl, article.updatedAt)}
              title={article.title}
              className="rounded-none"
            />
          </div>
        ) : heroImageUrl ? (
          <figure className="article-lab-hero mx-auto mt-8 w-full max-w-[var(--lab-measure-wide)] sm:px-4">
            <OptimizedImage
              src={heroImageUrl}
              alt={heroAsset?.altText || article.title}
              priority
              fetchPriority="high"
              wrapperClassName="w-full"
              className="w-full h-auto"
              objectPosition={getObjectPosition(article)}
              sizes={HERO_SIZES_ATTR}
              aspectRatio={
                heroAsset?.mediaFile?.width && heroAsset?.mediaFile?.height
                  ? `${heroAsset.mediaFile.width} / ${heroAsset.mediaFile.height}`
                  : undefined
              }
            />
            {(heroAsset?.captionPlain || heroAsset?.captionHtml || heroAsset?.sourceName || article.isAiGeneratedImage) && (
              <figcaption className="article-lab-caption px-4 sm:px-0">
                {heroAsset?.captionHtml ? (
                  <span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(heroAsset.captionHtml) }} />
                ) : (
                  heroAsset?.captionPlain || heroAsset?.altText || ""
                )}
                {heroAsset?.sourceName && (
                  <cite>
                    {heroAsset.captionPlain || heroAsset?.captionHtml ? " — " : ""}
                    {heroAsset.sourceUrl ? (
                      <a href={heroAsset.sourceUrl} target="_blank" rel="noreferrer" className="hover:underline">
                        {heroAsset.sourceName}
                      </a>
                    ) : (
                      heroAsset.sourceName
                    )}
                  </cite>
                )}
              </figcaption>
            )}
          </figure>
        ) : null}

        <div className="mx-auto mt-10 w-full max-w-[var(--lab-measure)] px-4">
          {hasSummary && (
            <aside className="article-lab-summary mb-10" data-testid="block-article-lab-summary">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2>الموجز</h2>
                <button
                  type="button"
                  onClick={handlePlayAudio}
                  disabled={isLoadingAudio}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={isPlaying ? "إيقاف الاستماع" : "استماع للموجز"}
                  data-testid="button-article-lab-listen"
                >
                  {isLoadingAudio ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isPlaying ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                  {isPlaying ? "إيقاف" : "استمع"}
                </button>
              </div>
              {shouldFetchBullets && isLoadingBullets && aiBullets.length === 0 ? (
                <div className="space-y-2">
                  <Skeleton className="h-3 w-11/12" />
                  <Skeleton className="h-3 w-9/12" />
                </div>
              ) : !isSummaryExpanded && summaryNeedsToggle ? (
                <p className="line-clamp-3 leading-relaxed">{aiBullets.length > 0 ? aiBullets.join(" ") : summaryDetailText}</p>
              ) : aiBullets.length > 0 ? (
                <ul className="space-y-2">
                  {aiBullets.slice(0, 3).map((bullet, i) => (
                    <li key={i} className="leading-relaxed">{bullet}</li>
                  ))}
                </ul>
              ) : (
                <p className="leading-relaxed">{summaryDetailText}</p>
              )}
              {isSummaryExpanded && showSummaryDetail && aiBullets.length > 0 && (
                <p className="mt-3 text-muted-foreground leading-relaxed">{summaryDetailText}</p>
              )}
              {summaryNeedsToggle && (
                <button
                  type="button"
                  className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary"
                  onClick={() => setIsSummaryExpanded((v) => !v)}
                  aria-expanded={isSummaryExpanded}
                >
                  {isSummaryExpanded ? "طيّ" : "عرض المزيد"}
                  <ChevronDown className={`h-3 w-3 transition-transform ${isSummaryExpanded ? "rotate-180" : ""}`} />
                </button>
              )}
            </aside>
          )}

          <DmsMpuAd id="MPU" lazyLoad={true} />

          <div className="mt-8">
            {isLoadingPurchaseStatus ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">جاري التحقق من حالة الشراء...</p>
              </div>
            ) : article.isPaid && !purchaseStatus?.hasPurchased ? (
              <Paywall
                article={{
                  id: article.id,
                  title: article.title,
                  content: article.content || "",
                  priceHalalas: article.priceHalalas || 0,
                  previewLength: article.previewLength ?? undefined,
                  imageUrl: article.imageUrl,
                  slug: article.slug,
                }}
                onPurchaseComplete={() => {
                  queryClient.invalidateQueries({ queryKey: ["/api/payments/check-purchase", article.id] });
                }}
              />
            ) : (
              <div
                ref={articleBodyRef}
                className="article-lab-prose prose prose-lg dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: sanitizedArticleHtml }}
                data-testid="content-article-lab-body"
              />
            )}
          </div>

          {article.articleType === "weekly_photos" && article.weeklyPhotosData?.photos && (
            <div className="mt-12">
              <WeeklyPhotosDisplay
                photos={article.weeklyPhotosData.photos}
                title="صور الأسبوع"
              />
            </div>
          )}

          {(additionalMedia.length > 0 || albumImages.length > 0) && (
            <section className="mt-12 space-y-10">
              {additionalMedia.map((asset, index) => (
                <ImageWithCaption
                  key={asset.id || `media-${index}`}
                  imageUrl={asset.mediaFile?.url || asset.url || ""}
                  altText={asset.altText || asset.mediaFile?.altText || `صورة ${index + 1}`}
                  captionHtml={asset.captionHtml}
                  captionPlain={asset.captionPlain}
                  sourceName={asset.sourceName}
                  sourceUrl={asset.sourceUrl}
                  relatedArticleSlugs={asset.relatedArticleSlugs}
                  keywordTags={asset.keywordTags}
                  className="my-0"
                />
              ))}
              {albumImages.map((url: string, index: number) => (
                <ImageWithCaption
                  key={`album-${index}`}
                  imageUrl={url}
                  altText={`صورة ${additionalMedia.length + index + 1}`}
                  className="my-0"
                />
              ))}
            </section>
          )}

          {(articleTags.length > 0 || seoKeywords.length > 0) && (
            <nav className="mt-12 flex flex-wrap gap-x-4 gap-y-2" aria-label="الكلمات المفتاحية">
              {articleTags.map((tag) => (
                <Link
                  key={tag.id}
                  href={`/keyword/${encodeURIComponent(tag.nameAr)}`}
                  className="article-lab-tag"
                >
                  {tag.nameAr}
                </Link>
              ))}
              {articleTags.length === 0 && seoKeywords.map((keyword) => (
                <Link
                  key={keyword}
                  href={`/keyword/${encodeURIComponent(keyword)}`}
                  className="article-lab-tag"
                >
                  {keyword}
                </Link>
              ))}
            </nav>
          )}

          <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-y border-foreground/10 py-5">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 px-2"
                onClick={() => reactMutation.mutate()}
                aria-pressed={!!article.hasReacted}
                data-testid="button-article-lab-react"
              >
                <Heart className={`h-4 w-4 ${article.hasReacted ? "fill-current" : ""}`} />
                {article.reactionsCount || 0}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 px-2"
                onClick={() => bookmarkMutation.mutate()}
                aria-pressed={!!article.isBookmarked}
                data-testid="button-article-lab-bookmark"
              >
                <Bookmark className={`h-4 w-4 ${article.isBookmarked ? "fill-current" : ""}`} />
                {article.isBookmarked ? "محفوظ" : "حفظ"}
              </Button>
              <FocusReaderTrigger
                language="ar"
                variant="ghost"
                onClick={() => setFocusOpen(true)}
                className="px-2"
              />
            </div>
            <SocialShareBar
              title={article.title}
              url={shareUrl}
              copyUrl={shareUrl}
              description={article.excerpt || ""}
              articleId={article.id}
              className="justify-end"
            />
          </div>

          {article.storyId && (
            <section className="mt-12">
              <div className="mb-5 flex items-end justify-between gap-3">
                <h2 className="text-xl font-bold tracking-tight">تطور القصة</h2>
                <FollowStoryButton storyId={article.storyId} storyTitle={article.storyTitle || article.title} />
              </div>
              <StoryTimeline storyId={article.storyId} />
            </section>
          )}

          <AdSlot slotId="sidebar" className="my-10" />

          {continueItems.length > 0 && (
            <section className="article-lab-continue mt-6" data-testid="section-article-lab-continue">
              <h2 className="text-sm font-bold tracking-[0.12em] text-muted-foreground">واصل القراءة</h2>
              <ul className="mt-5 divide-y divide-foreground/10">
                {continueItems.map((item) => (
                  <li key={item.key}>
                    <Link href={item.href} className="group flex items-start gap-4 py-4">
                      {item.imageUrl && (
                        <img
                          src={item.imageUrl}
                          alt=""
                          className="h-16 w-16 shrink-0 object-cover"
                        />
                      )}
                      <span className="min-w-0">
                        <span className="block text-lg font-semibold leading-snug group-hover:text-primary">
                          {item.title}
                        </span>
                        {item.meta && (
                          <span className="mt-1 block text-xs text-muted-foreground">{item.meta}</span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {relatedOpinions.length > 0 && (
            <section className="mt-12">
              <h2 className="text-sm font-bold tracking-[0.12em] text-muted-foreground">
                رأي في السياق
              </h2>
              <ul className="mt-5 divide-y divide-foreground/10">
                {relatedOpinions.map((opinion) => (
                  <li key={opinion.id} className="py-4">
                    <Link href={`/opinion/${opinion.slug}`} className="block hover:text-primary">
                      <span className="block text-lg font-semibold leading-snug">{opinion.title}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {authorDisplayName(opinion.author) || "كاتب"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <NativeAdsSection
            articleId={article.id}
            categorySlug={article.category?.slug}
            keywords={articleTags.map((tag) => tag.nameAr)}
            limit={4}
          />

          <div className="mt-8">
            <ArticlePoll articleId={article.id} />
          </div>

          <div id="comments" className="mt-12">
            <CommentSection
              articleId={article.id}
              comments={comments}
              currentUser={user}
              onSubmitComment={(content, parentId) => commentMutation.mutate({ content, parentId })}
              onLikeComment={handleLikeComment}
              likedCommentIds={likedCommentIds}
            />
          </div>
        </div>
      </main>

      <nav className="article-lab-dock" aria-label="أدوات الخبر">
        <div className="mx-auto flex max-w-[var(--lab-measure)] items-center justify-around px-2 py-2">
          <button type="button" className="flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] text-muted-foreground" onClick={() => reactMutation.mutate()}>
            <Heart className={`h-4 w-4 ${article.hasReacted ? "fill-current text-foreground" : ""}`} />
            إعجاب
          </button>
          <button type="button" className="flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] text-muted-foreground" onClick={() => bookmarkMutation.mutate()}>
            <Bookmark className={`h-4 w-4 ${article.isBookmarked ? "fill-current text-foreground" : ""}`} />
            حفظ
          </button>
          <a href="#comments" className="flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] text-muted-foreground">
            <MessageSquare className="h-4 w-4" />
            تعليقات
          </a>
          <a
            href={shareUrl}
            className="flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] text-muted-foreground"
            onClick={(e) => {
              e.preventDefault();
              if (navigator.share) {
                navigator.share({ title: article.title, url: shareUrl }).catch(() => {});
              } else {
                navigator.clipboard.writeText(shareUrl);
                toast({ title: "تم النسخ", description: "تم نسخ رابط الخبر المعتمد" });
              }
            }}
          >
            <Share2 className="h-4 w-4" />
            مشاركة
          </a>
        </div>
      </nav>

      {article && (
        <FocusReader
          open={focusOpen}
          onClose={() => setFocusOpen(false)}
          articleId={article.id}
          language="ar"
          isLoggedIn={!!user}
          title={article.title}
          subtitle={article.excerpt || article.subtitle || null}
          contentHtml={article.content || ""}
          authorName={authorName || null}
          publishedAt={article.publishedAt}
          articleSlug={slug}
          articleImageUrl={article.imageUrl}
          categoryName={article.category?.nameAr || article.category?.nameEn || null}
        />
      )}

      <Footer />
    </div>
  );
}
