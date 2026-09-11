import "@/styles/article-detail.css";
import { ArticleSummary } from "@/components/public/ArticleSummary";
import { useArticleSummaryAudio } from "@/hooks/useArticleSummaryAudio";
import { useParams } from "wouter";
import { useArticleInsights, useArticleRecommendations } from "@/hooks/useArticleSidebarData";
import { getObjectPosition, getCacheBustedImageUrl } from "@/lib/imageUtils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CommentsTeaser } from "@/components/CommentsTeaser";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CommentSection } from "@/components/CommentSection";
import { ArticlePoll } from "@/components/ArticlePoll";
import { RecommendationsWidget } from "@/components/RecommendationsWidget";
import { AIRecommendationsPanel } from "@/components/AIRecommendationsBlock";
import { RelatedOpinionsSection } from "@/components/RelatedOpinionsSection";
import { Paywall } from "@/components/Paywall";
import StoryTimeline from "@/components/StoryTimeline";
import FollowStoryButton from "@/components/FollowStoryButton";
import { AdSlot } from "@/components/AdSlot";
import { NativeAdsSection } from "@/components/NativeAdsSection";
import { DmsLeaderboardAd, DmsMpuAd, useAdTracking } from "@/components/DmsAdSlot";
import { SocialShareBar } from "@/components/SocialShareBar";
import { DigitalPassportButton } from "@/components/passport/DigitalPassportButton";
import { FocusReader, FocusReaderTrigger } from "@/components/FocusReader";
// PassportTrustBadge removed from this page on 2026-05-16 (user request).
// Kept import out so esbuild doesn't pull the component into the bundle.
import { ImageWithCaption } from "@/components/ImageWithCaption";
import { VideoPlayer } from "@/components/VideoPlayer";
import { InfographicDetail } from "@/components/InfographicDetail";
import { DataInfographicPage } from "@/components/data-infographic/DataInfographicPage";
import { RelatedInfographics } from "@/components/RelatedInfographics";
import { WeeklyPhotosDisplay } from "@/components/WeeklyPhotosDisplay";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useBehaviorTracking } from "@/hooks/useBehaviorTracking";
import { useArticleReadTracking } from "@/hooks/useArticleReadTracking";
import { useCanonical } from "@/hooks/useCanonical";
import { apiRequest, apiUrl, queryClient } from "@/lib/queryClient";
import { signalContentPainted } from "@/lib/contentPaintedSignal";
import { isUnauthorizedError } from "@/lib/authUtils";
import {
  trackArticleView,
  trackArticleLike,
  trackBookmarkToggle,
  trackArticleComment,
} from "@/lib/analytics";
import {
  Heart,
  Bookmark,
  Clock,
  Sparkles,
  ChevronRight,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Archive,
  Zap,
  Lock,
  User,
  BookOpen,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { formatArticleTimestamp } from "@/lib/formatTime";
import type { ArticleWithDetails, CommentWithUser } from "@shared/schema";
import { useEffect, useState, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import DOMPurify from "isomorphic-dompurify";
import { transformArticleHtml } from "@/lib/legacyHtmlTransformer";
import { useHeroPreload } from "@/hooks/useHeroPreload";
import { ARTICLE_HERO_QUALITY, ARTICLE_HERO_FALLBACK_WIDTH } from "@shared/articleHeroPreload";
import { useNaturalAspectRatio } from "@/hooks/useNaturalAspectRatio";

// الإعلان البارز أعلى صفحة المقال (تحت الهيدر). أُعيد إظهاره 2026-07-09 (بعد إخفاء المونديال). للإخفاء: بدّل إلى false.
const SHOW_TOP_AD = true;

const AiArticleStats = lazy(() =>
  import("@/components/AiArticleStats").then(module => ({ default: module.AiArticleStats }))
);

export default function ArticleDetail() {
  const { slug } = useParams<{ slug: string }>();
  // Start sidebar data before the article-loading return (the chart can stay lazy).
  const insightsQuery = useArticleInsights(slug);
  const recommendationsQuery = useArticleRecommendations(slug);
  const { toast } = useToast();
  const { logBehavior } = useBehaviorTracking();
  const [, setLocation] = useLocation();
  

  const { data: user } = useQuery<{ id: string; name?: string; email?: string; role?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const { data: article, isLoading } = useQuery<ArticleWithDetails>({
    queryKey: ["/api/articles", slug],
    // Editorial credibility: corrections must surface instantly. Override the
    // global 5min staleTime and refetch on tab focus so editors verifying
    // their own save (and readers returning to the tab) see the latest copy.
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  // المحتوى الرئيسي جاهز → حرّر طبقة الإعلانات المؤجلة (انظر index.html)
  useEffect(() => {
    if (article) signalContentPainted();
  }, [article]);

  // If no stored summary, generate bullets in the background via API.
  // The endpoint no longer blocks on OpenAI — on a cold miss it kicks off
  // generation server-side and returns { source: "pending", bullets: [] }.
  // We poll a few times so the freshly-generated bullets appear within a few
  // seconds without ever blocking the request. Polling stops as soon as
  // bullets arrive (or the server reports a non-pending source), and is hard-
  // capped so a persistent generation failure can't loop forever.
  const shouldFetchBullets = !!article?.id && !article?.aiSummary?.trim();
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
  const aiBullets = Array.isArray(bulletsData?.bullets) ? bulletsData.bullets : [];
  const summaryText = article?.aiSummary?.trim() || aiBullets.join("\n\n") || article?.excerpt || "";

  // DMS Ad tracking for article page
  useAdTracking(article?.category?.nameAr || '', article?.id);

  const isVideoTemplate = !!(article?.isVideoTemplate && article?.videoUrl);
  // Cache-bust the hero so a re-uploaded image refreshes immediately for
  // anyone with the article page already loaded (mirrors ArticleCard).
  // Without this, the browser cache + Cloudflare edge can keep showing the
  // previous image even after the JSON is repurged.
  const heroImageUrl = useMemo(
    () => (article?.imageUrl ? getCacheBustedImageUrl(article.imageUrl, article.updatedAt) : null),
    [article?.imageUrl, article?.updatedAt],
  );
  useHeroPreload(!isVideoTemplate && heroImageUrl ? heroImageUrl : null, ARTICLE_HERO_QUALITY, ARTICLE_HERO_FALLBACK_WIDTH);

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
  useNaturalAspectRatio(articleBodyRef, sanitizedArticleHtml);

  // Track local reading history (for personal "match score" computation)
  useEffect(() => {
    if (!article?.id) return;
    const articleId = article.id;
    const startedAt = Date.now();
    let cancelled = false;
    let updateOnUnload: (() => void) | null = null;

    import("@/lib/readingHistory").then(({ recordArticleRead, updateTimeSpent }) => {
      if (cancelled) return;
      recordArticleRead(article, 0);
      updateOnUnload = () => {
        const seconds = Math.floor((Date.now() - startedAt) / 1000);
        updateTimeSpent(articleId, seconds);
      };
      window.addEventListener("beforeunload", updateOnUnload);
    });

    return () => {
      cancelled = true;
      if (updateOnUnload) {
        updateOnUnload();
        window.removeEventListener("beforeunload", updateOnUnload);
        updateOnUnload = null;
      }
    };
  }, [article?.id, article]);

  // Redirect opinion articles to their dedicated page
  useEffect(() => {
    if (article?.articleType === 'opinion' && slug) {
      setLocation(`/opinion/${slug}`);
    }
  }, [article?.articleType, slug, setLocation]);

  // Silently update URL to use short englishSlug for better social sharing
  useEffect(() => {
    if (article?.englishSlug && slug !== article.englishSlug) {
      const newPath = `/article/${article.englishSlug}`;
      window.history.replaceState(null, '', newPath);
    }
  }, [article?.englishSlug, slug]);

  const { data: commentsRaw } = useQuery<CommentWithUser[]>({
    queryKey: ["/api/articles", slug, "comments"],
    staleTime: 1000 * 60 * 2, // Cache for 2 minutes
  });
  const comments = Array.isArray(commentsRaw) ? commentsRaw : [];

  // Per-user liked-comment overlay (kept out of the cached comments payload).
  const { data: myLikesRaw } = useQuery<string[]>({
    queryKey: ["/api/articles", slug, "comments", "my-likes"],
    enabled: !!slug && !!user?.id,
  });
  const likedCommentIds = Array.isArray(myLikesRaw) ? myLikesRaw : [];

  // Toggle a like on a comment. Throws on failure so CommentSection rolls back.
  const handleLikeComment = async (commentId: string, nextLiked: boolean) => {
    await apiRequest(`/api/comments/${commentId}/like`, { method: nextLiked ? "POST" : "DELETE" });
    queryClient.invalidateQueries({ queryKey: ["/api/articles", slug, "comments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/articles", slug, "comments", "my-likes"] });
  };

  // Combined sidebar data for faster loading (fetches related, tags, and media in parallel)
  const { data: sidebarData } = useQuery<{
    related: ArticleWithDetails[];
    tags: Array<{ id: string; nameAr: string; nameEn: string; slug: string }>;
    mediaAssets: any[];
  }>({
    queryKey: ["/api/articles", slug, "sidebar"],
    enabled: !!slug,
    // Mirrors the article query: editors adding photographer photos need
    // them visible immediately on the public page.
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const relatedArticles = sidebarData?.related || [];
  const articleTags = sidebarData?.tags || [];
  const mediaAssets = sidebarData?.mediaAssets;

  // Get token from URL if present
  const searchParams = new URLSearchParams(window.location.search);
  const guestToken = searchParams.get('token');

  const { data: purchaseStatus, isLoading: isLoadingPurchaseStatus } = useQuery<{ hasPurchased: boolean }>({
    queryKey: ['/api/payments/check-purchase', article?.id],
    queryFn: async () => {
      const url = `/api/payments/check-purchase/${article?.id}${guestToken ? `?token=${guestToken}` : ''}`;
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to check purchase status");
      return response.json();
    },
    enabled: !!article?.isPaid && !!article?.id,
  });

  const resolvedAuthor = useMemo(() => 
    article?.articleType === 'opinion'
      ? article?.opinionAuthor
      : article?.author,
    [article?.articleType, article?.opinionAuthor, article?.author]
  );

  const { data: bylineProfile } = useQuery<{ title?: string | null }>({
    queryKey: ["/api/reporters", article?.staff?.slug],
    enabled: !!article?.staff?.slug && article?.articleType !== "infographic",
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const bylineName = [resolvedAuthor?.firstName, resolvedAuthor?.lastName].filter(Boolean).join(" ").trim()
    || article?.staff?.nameAr || "";
  const bylineTitle = bylineProfile?.title?.trim()
    || (bylineName === "صحيفة سبق" ? "صحيفة إلكترونية سعودية" : article?.reporterId === resolvedAuthor?.id ? "مراسل صحفي" : "كاتب الخبر");

  // Fetch existing short link for article (idempotent GET first)
  const { data: existingShortLink, isLoading: isLoadingShortLink, error: shortLinkError } = useQuery<{ shortCode: string; originalUrl: string } | null>({
    queryKey: ["/api/shortlinks/article", article?.id],
    queryFn: async () => {
      if (!article?.id) return null;
      try {
        const response = await fetch(apiUrl(`/api/shortlinks/article/${article.id}`), {
          credentials: "include",
        });
        if (response.status === 404) {
          return null;
        }
        if (!response.ok) {
          throw new Error(`${response.status}: ${await response.text()}`);
        }
        return await response.json();
      } catch (error) {
        console.error("[ShortLink] Error fetching:", error);
        return null;
      }
    },
    enabled: !!article?.id,
    staleTime: Infinity,
    retry: false,
  });

  // Create short link mutation — triggered lazily only when the user shows
  // intent to share (hover/touch/focus on share section). The endpoint is
  // public and CSRF-exempt (see server/csrf.ts), but we still avoid firing it
  // on every article view to reduce backend load and keep failures silent.
  const createShortLinkMutation = useMutation({
    mutationFn: async () => {
      if (!article) throw new Error("Article not loaded");
      const response = await apiRequest("/api/shortlinks", {
        method: "POST",
        silent: true,
        body: JSON.stringify({
          originalUrl: `https://sabq.org/article/${slug}`,
          articleId: article.id,
          utmMedium: "social",
          utmCampaign: "article_share",
        }),
      });
      return response;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/shortlinks/article", article?.id], data);
    },
    onError: (error) => {
      // Swallow errors silently — share UI falls back to the canonical URL.
      console.error("[ShortLink] Error creating short link:", error);
    },
  });

  // Lazy trigger: fire the create mutation only the first time the user
  // interacts with the share area (hover, touch, focus). On the first share
  // we use the canonical URL as an immediate fallback; subsequent shares can
  // pick up the short URL once it resolves.
  const ensureShortLink = useCallback(() => {
    if (
      article?.id &&
      !isLoadingShortLink &&
      !existingShortLink &&
      !createShortLinkMutation.isPending &&
      !createShortLinkMutation.isSuccess &&
      !createShortLinkMutation.data &&
      !createShortLinkMutation.isError
    ) {
      createShortLinkMutation.mutate();
    }
  }, [
    article?.id,
    isLoadingShortLink,
    existingShortLink,
    createShortLinkMutation,
  ]);

  // Use existing link if found, otherwise use created link, fallback to canonical URL
  const shortLink = existingShortLink || createShortLinkMutation.data;

  const { logArticleView } = useArticleReadTracking({
    articleId: article?.id || "",
    enabled: !!article && !!user,
  });

  useEffect(() => {
    if (!article?.id) return;
    const categoryName = article.category?.nameAr ?? article.category?.nameEn;
    trackArticleView(article.id, article.title || "", categoryName);
  }, [article?.id, article?.title, article?.category?.nameAr, article?.category?.nameEn]);

  // Focus mode (Task #80)
  const [focusOpen, setFocusOpen] = useState(false);

  // Ensure RTL direction is applied for Arabic content
  useEffect(() => {
    const previousDir = document.documentElement.dir;
    const previousLang = document.documentElement.lang;
    
    document.documentElement.dir = "rtl";
    document.documentElement.lang = "ar";
    
    // Cleanup: restore previous values when unmounting
    return () => {
      document.documentElement.dir = previousDir || "ltr";
      document.documentElement.lang = previousLang || "en";
    };
  }, []);

  useEffect(() => {
    if (article && user) {
      logArticleView();
    }
  }, [article?.id, user?.id]);

  // Update document.title for SEO (GA4 auto-tracks page views)
  useEffect(() => {
    if (article?.title) {
      document.title = `${article.title} | سبق`;
    }
    return () => {
      document.title = 'سبق - صحيفة إلكترونية سعودية';
    };
  }, [article?.title]);

  useCanonical(article ? `https://sabq.org/article/${article.englishSlug || slug}` : null);

  // Track article view ONLY after a genuine read: the reader must stay on the
  // page, with the tab visible, for at least READ_DWELL_MS. Mashing the refresh
  // button never reaches this threshold (each reload unmounts the page and clears
  // the timer), so it can no longer inflate the view counter. Fires at most once
  // per mount; the server also de-dupes per visitor as a second layer.
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
        .catch(err => console.error('[View] Error:', err));
    };

    // Accumulate only FOREGROUND time: while the tab is hidden we reset the
    // checkpoint so background/preloaded tabs never cross the threshold.
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

  // Load Twitter widgets script and render embedded tweets with theme support
  useEffect(() => {
    if (!article?.content) return;

    // Function to apply theme to all tweet blockquotes
    const applyThemeToTweets = () => {
      const isDark = document.documentElement.classList.contains('dark');
      const theme = isDark ? 'dark' : 'light';
      
      const tweetBlocks = document.querySelectorAll('blockquote.twitter-tweet');
      tweetBlocks.forEach((block) => {
        block.setAttribute('data-theme', theme);
      });
    };

    // Apply theme before loading widgets
    applyThemeToTweets();

    // Check if script is already loaded
    const existingScript = document.querySelector('script[src="https://platform.twitter.com/widgets.js"]');
    
    if (existingScript && window.twttr?.widgets) {
      // Script already loaded, just render tweets
      window.twttr.widgets.load();
    } else if (!existingScript) {
      // Load script for the first time
      const script = document.createElement('script');
      script.src = 'https://platform.twitter.com/widgets.js';
      script.async = true;
      script.charset = 'utf-8';
      
      script.onload = () => {
        applyThemeToTweets();
        if (window.twttr?.widgets) {
          window.twttr.widgets.load();
        }
      };

      script.onerror = () => {
        console.error('[ArticleDetail] Failed to load Twitter widgets script');
      };

      document.body.appendChild(script);
    }

    // Listen for theme changes and reload tweets
    let previousTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    
    const observer = new MutationObserver(() => {
      const currentTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
      
      // Only reload if theme actually changed
      if (currentTheme !== previousTheme) {
        previousTheme = currentTheme;
        applyThemeToTweets();
        if (window.twttr?.widgets) {
          window.twttr.widgets.load();
        }
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => {
      observer.disconnect();
    };
  }, [article?.content]);

  // googlebot-news 30-day noindex meta is owned by seoInjector
  // (server/seoInjector.ts) — duplicated client-side logic was
  // race-condition-prone with React reconciliation (removeChild error).

  // Add ImageObject JSON-LD for image SEO
  useEffect(() => {
    if (!article?.imageUrl) return;

    // Get hero image asset data (displayOrder === 0)
    const heroAsset = mediaAssets?.find((asset: any) => asset.displayOrder === 0);
    
    // Convert relative URL to absolute URL
    const absoluteImageUrl = article.imageUrl.startsWith('http') 
      ? article.imageUrl 
      : `${window.location.origin}${article.imageUrl}`;

    const imageObject: any = {
      "@context": "https://schema.org",
      "@type": "ImageObject",
      "contentUrl": absoluteImageUrl,
      "url": absoluteImageUrl,
      "caption": heroAsset?.captionPlain || article.title,
      "description": heroAsset?.altText || article.title,
    };

    // Add keywords if available
    if (heroAsset?.keywordTags && heroAsset.keywordTags.length > 0) {
      imageObject["keywords"] = heroAsset.keywordTags.join(", ");
    } else if (article.seo?.keywords && article.seo.keywords.length > 0) {
      imageObject["keywords"] = article.seo.keywords.join(", ");
    }

    // Add author/source if available
    if (heroAsset?.sourceName) {
      imageObject["author"] = {
        "@type": "Organization",
        "name": heroAsset.sourceName,
      };
      if (heroAsset.sourceUrl) {
        imageObject["author"]["url"] = heroAsset.sourceUrl;
      }
    }

    // Add copyright notice if available
    if (heroAsset?.rightsStatement) {
      imageObject["copyrightNotice"] = heroAsset.rightsStatement;
    }

    // Add script tag to head
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify(imageObject);
    script.id = 'image-structured-data';
    document.head.appendChild(script);

    return () => {
      document.getElementById('image-structured-data')?.remove();
    };
  }, [article?.id, article?.imageUrl, mediaAssets]);

  // Add Open Graph and Twitter Cards meta tags
  useEffect(() => {
    if (!article) return;

    const seoTitle = article.seo?.metaTitle || article.title;
    const seoDescription = article.seo?.metaDescription || article.excerpt || article.aiSummary || "";
    
    // Convert relative imageUrl to absolute URL
    let seoImage = article.imageUrl || `${window.location.origin}/og-image.png`;
    if (article.imageUrl && !article.imageUrl.startsWith('http')) {
      seoImage = `${window.location.origin}${article.imageUrl}`;
    }
    
    const seoUrl = window.location.href;

    // Get hero image asset data for alt text
    const heroAsset = mediaAssets?.find((asset: any) => asset.displayOrder === 0);
    const imageAlt = heroAsset?.altText || article.title;

    // Store original values to restore on cleanup
    const originalValues = new Map<HTMLMetaElement, string>();
    const createdTags: HTMLMetaElement[] = [];

    // Create or update meta tags, tracking changes
    const updateMetaTag = (property: string, content: string, isName = false) => {
      const attr = isName ? 'name' : 'property';
      let tag = document.querySelector(`meta[${attr}="${property}"]`) as HTMLMetaElement;
      
      if (!tag) {
        // New tag - track it for removal on cleanup
        tag = document.createElement('meta');
        tag.setAttribute(attr, property);
        document.head.appendChild(tag);
        createdTags.push(tag);
      } else {
        // Existing tag - store original value for restoration
        originalValues.set(tag, tag.content);
      }
      
      tag.content = content;
      return tag;
    };

    // Open Graph Tags
    updateMetaTag('og:type', 'article');
    updateMetaTag('og:title', seoTitle);
    updateMetaTag('og:description', seoDescription);
    updateMetaTag('og:image', seoImage);
    updateMetaTag('og:url', seoUrl);
    updateMetaTag('og:site_name', 'صحيفة سبق الإلكترونية');
    updateMetaTag('og:locale', 'ar_SA');

    // Open Graph Image Tags
    if (article.imageUrl) {
      updateMetaTag('og:image:alt', imageAlt);
      updateMetaTag('og:image:type', 'image/jpeg');
      updateMetaTag('og:image:width', '1200');
      updateMetaTag('og:image:height', '630');
    }

    if (article.publishedAt) {
      updateMetaTag('article:published_time', new Date(article.publishedAt).toISOString());
    }
    if (article.updatedAt && article.publishedAt) {
      const pubMs = new Date(article.publishedAt).getTime();
      const updMs = new Date(article.updatedAt).getTime();
      const articleAgeMs = Date.now() - pubMs;
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      const safeModified = (articleAgeMs > thirtyDaysMs && (updMs - pubMs) > 7 * 24 * 60 * 60 * 1000)
        ? new Date(article.publishedAt).toISOString()
        : new Date(article.updatedAt).toISOString();
      updateMetaTag('article:modified_time', safeModified);
    } else if (article.updatedAt) {
      updateMetaTag('article:modified_time', new Date(article.updatedAt).toISOString());
    }
    if (article.category?.nameAr) {
      updateMetaTag('article:section', article.category.nameAr);
    }

    // Twitter Cards
    updateMetaTag('twitter:card', 'summary_large_image', true);
    updateMetaTag('twitter:title', seoTitle, true);
    updateMetaTag('twitter:description', seoDescription, true);
    updateMetaTag('twitter:image', seoImage, true);
    
    // Twitter Card Image Tags
    if (article.imageUrl) {
      updateMetaTag('twitter:image:alt', imageAlt, true);
    }

    // SEO Meta Tags
    updateMetaTag('description', seoDescription, true);

    if (article.seo?.keywords && article.seo.keywords.length > 0) {
      updateMetaTag('keywords', article.seo.keywords.join(', '), true);
    }

    // Cleanup on unmount - restore original values or remove created tags
    return () => {
      // Remove newly created tags
      createdTags.forEach(tag => {
        if (tag.parentNode) {
          tag.parentNode.removeChild(tag);
        }
      });
      
      // Restore original values for existing tags
      originalValues.forEach((originalContent, tag) => {
        if (tag.parentNode) {
          tag.content = originalContent;
        }
      });
    };
  }, [article?.id, article?.seo, article?.imageUrl, mediaAssets]);

  // Inline AI-flavored feedback under the engagement buttons. After a
  // like/save we surface a friendly line that hints the action feeds
  // personalization, then auto-dismiss it. `kind` drives the icon tint.
  const [engagementHint, setEngagementHint] = useState<{
    text: string;
    kind: "like" | "bookmark" | "off";
  } | null>(null);
  const engagementHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showEngagementHint = useCallback(
    (text: string, kind: "like" | "bookmark" | "off") => {
      if (engagementHintTimer.current) clearTimeout(engagementHintTimer.current);
      setEngagementHint({ text, kind });
      engagementHintTimer.current = setTimeout(() => setEngagementHint(null), 5000);
    },
    [],
  );
  useEffect(
    () => () => {
      if (engagementHintTimer.current) clearTimeout(engagementHintTimer.current);
    },
    [],
  );

  // After a like/save, refresh list-type article queries + the profile
  // "liked" list so cards elsewhere reflect the new state. Deliberately
  // EXCLUDES this page's own detail query and its string-slug sub-queries
  // (comments/sidebar/ai-bullets) so a single tap doesn't trigger a refetch
  // storm here — the detail card is already updated via setQueryData.
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
      return await apiRequest(`/api/articles/${article.id}/react`, {
        method: "POST",
      });
    },
    onSuccess: (result: { hasReacted?: boolean } | undefined) => {
      const nowReacted = !!result?.hasReacted;
      // Reflect the toggle in the cache straight from the server's
      // authoritative result so the button flips instantly. The old
      // invalidate-only path relied on a background refetch that didn't
      // always re-render in time — that's why "liked" only appeared after
      // a second action (e.g. pressing save also refetched this query).
      queryClient.setQueryData<ArticleWithDetails>(["/api/articles", slug], (old) =>
        old
          ? {
              ...old,
              hasReacted: nowReacted,
              reactionsCount: Math.max(
                0,
                (old.reactionsCount || 0) +
                  (nowReacted === !!old.hasReacted ? 0 : nowReacted ? 1 : -1),
              ),
            }
          : old,
      );
      if (article) {
        if (nowReacted) logBehavior("reaction_add", { articleId: article.id });
        trackArticleLike(article.id, nowReacted);
      }
      showEngagementHint(
        nowReacted
          ? "تم تذكّر اهتمامك — سيقترح عليك الذكاء الاصطناعي المزيد من هذا النوع من الأخبار"
          : "أُلغي الإعجاب",
        nowReacted ? "like" : "off",
      );
      refreshEngagementLists();
    },
    onError: (error: Error) => {
      console.warn("React mutation error:", error.message);
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
    onSuccess: (result: { isBookmarked?: boolean } | undefined) => {
      const nowBookmarked = !!result?.isBookmarked;
      // Same instant, authoritative cache update as reactions so the save
      // button reflects state immediately without waiting on a refetch.
      queryClient.setQueryData<ArticleWithDetails>(["/api/articles", slug], (old) =>
        old ? { ...old, isBookmarked: nowBookmarked } : old,
      );
      if (article) {
        logBehavior(nowBookmarked ? "bookmark_add" : "bookmark_remove", {
          articleId: article.id,
        });
        trackBookmarkToggle(article.id, nowBookmarked);
      }
      showEngagementHint(
        nowBookmarked
          ? "حُفظ في مكتبتك — يأخذ الذكاء الاصطناعي اهتمامك بهذا الموضوع في الحسبان"
          : "أُزيل من المحفوظات",
        nowBookmarked ? "bookmark" : "off",
      );
      refreshEngagementLists();
    },
    onError: (error: Error) => {
      console.warn("Bookmark mutation error:", error.message);
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
      return await apiRequest(`/api/articles/${slug}/comments`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: (_result, variables) => {
      if (article) {
        logBehavior("comment_create", { articleId: article.id });
      }
      trackArticleComment(slug ?? "", variables?.parentId);
      queryClient.invalidateQueries({ queryKey: ["/api/articles", slug, "comments"] });
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

  const handleReact = useCallback(() => {
    reactMutation.mutate();
  }, [reactMutation]);

  const handleBookmark = useCallback(() => {
    bookmarkMutation.mutate();
  }, [bookmarkMutation]);

  const handleComment = useCallback((content: string, parentId?: string) => {
    commentMutation.mutate({ content, parentId });
  }, [commentMutation]);

  const { isLoadingAudio, isPlaying, provider: audioProvider, handlePlayAudio } = useArticleSummaryAudio(
    slug, String(article?.updatedAt ?? ''), Boolean(article?.aiSummary || article?.excerpt),
  );

  const timeAgo = article?.publishedAt
    ? formatArticleTimestamp(article.publishedAt, { format: 'relative', locale: 'ar' })
    : null;
  const publishedDateLabel = article?.publishedAt
    ? formatArticleTimestamp(article.publishedAt, { format: 'absolute', locale: 'ar' })
    : null;
  const publicationParts = useMemo(() => {
    if (!article?.publishedAt) return null;
    const date = new Date(article.publishedAt);
    if (Number.isNaN(date.getTime())) return null;
    const locale = "ar-SA-u-ca-gregory-nu-latn";
    return {
      iso: date.toISOString(),
      date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Riyadh" }).format(date),
      time: new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Riyadh" }).format(date),
    };
  }, [article?.publishedAt]);
  const editorialModifiedAt = (article as any)?.seoMetadata?.editorialModifiedAt as string | undefined;
  const meaningfulUpdatedDateLabel = editorialModifiedAt
    ? formatArticleTimestamp(editorialModifiedAt, { format: 'absolute', locale: 'ar' })
    : null;

  const getInitials = useCallback((firstName?: string | null, lastName?: string | null, email?: string | null) => {
    if (firstName && lastName) {
      return `${firstName?.[0]}${lastName?.[0]}`.toUpperCase();
    }
    if (firstName) return firstName?.[0].toUpperCase();
    if (email) return email[0].toUpperCase();
    return 'م';
  }, []);

  const readingTime = (() => {
    if (!article?.content) return 1;
    const wordsPerMinute = 200;
    const words = article.content.split(/\s+/).length;
    return Math.ceil(words / wordsPerMinute) || 1;
  })();

  const recentCommenters = useMemo(() => 
    comments
      .reduce((acc: any[], comment) => {
        if (!acc.find(u => u.id === comment.user.id)) {
          acc.push({
            id: comment.user.id,
            firstName: comment.user.firstName,
            lastName: comment.user.lastName,
            profileImageUrl: comment.user.profileImageUrl
          });
        }
        return acc;
      }, [])
      .slice(0, 3),
    [comments]
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background/95 relative z-10">
        <Header user={user} />
        <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
        </main>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="min-h-screen bg-background/95 relative z-10">
        <Header user={user} />
        <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-4">المقال غير موجود</h1>
            <p className="text-muted-foreground mb-8">
              عذراً، لم نتمكن من العثور على المقال المطلوب
            </p>
            <Button asChild>
              <Link href="/">
                <a>العودة للرئيسية</a>
              </Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // Check if this is an infographic article and render custom component
  if (article.articleType === 'infographic') {
    // Data-driven infographic (بياني) - uses new visual data storytelling system
    if (article.infographicType === 'data' && article.infographicData) {
      return (
        <div className="min-h-screen bg-background/95 relative z-10" dir="rtl">
          <Header user={user} />
          
          {/* Data Infographic with visual blocks */}
          <DataInfographicPage 
            article={article}
            onReact={handleReact}
            onBookmark={handleBookmark}
            hasReacted={article.hasReacted}
            isBookmarked={article.isBookmarked}
            shortLink={shortLink}
          />
          
          {/* Article Poll */}
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mb-8">
            <ArticlePoll articleId={article.id} />
          </div>

          {/* Comments Section */}
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
            <Separator className="mb-8" />
            <CommentSection
              articleId={article.id}
              comments={comments}
              currentUser={user}
              onSubmitComment={handleComment}
              onLikeComment={handleLikeComment}
              likedCommentIds={likedCommentIds}
            />
          </div>
        </div>
      );
    }
    
    // Image-based infographic (صوري) - uses traditional visual infographic viewer
    return (
      <div className="min-h-screen bg-background/95 relative z-10" dir="rtl">
        <Header user={user} />
        
        {/* Full-width Infographic Detail with integrated carousel */}
        <InfographicDetail 
          article={article}
          onReact={handleReact}
          onBookmark={handleBookmark}
          hasReacted={article.hasReacted}
          isBookmarked={article.isBookmarked}
          shortLink={shortLink}
        />
        
        {/* Article Poll */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mb-8">
          <ArticlePoll articleId={article.id} />
        </div>

        {/* Comments Section */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
          <Separator className="mb-8" />
          <CommentSection
            articleId={article.id}
            comments={comments}
            currentUser={user}
            onSubmitComment={handleComment}
            onLikeComment={handleLikeComment}
            likedCommentIds={likedCommentIds}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="article-detail public-page min-h-screen bg-background relative z-10" dir="rtl">
      <Header user={user} />

      {/* الإعلان البارز أعلى المقال — الإطفاء الفوري من اللوحة: إعدادات النظام ← إعلانات DMS أعلى الصفحات. SHOW_TOP_AD بقي كقاطع طوارئ في الكود. */}
      {SHOW_TOP_AD && (
        /* DMS Leaderboard Ad - Desktop only */
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 pt-4 max-w-7xl">
          <DmsLeaderboardAd />
        </div>
      )}

      <main className="article-detail-main container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-7xl">
        <nav aria-label="مسار التنقل" className="article-breadcrumbs">
          <Link href="/">الرئيسية</Link>
          {article.category && <><ChevronRight aria-hidden="true" /><Link href={`/category/${article.category.slug}`}>{article.category.nameAr}</Link></>}
          <ChevronRight aria-hidden="true" />
          <span aria-current="page">تفاصيل الخبر</span>
        </nav>

        <div className="article-detail-layout">
          {/* Main Content */}
          <article className="article-detail-content min-w-0">
            {/* Editorial header: typography and spacing carry the hierarchy. */}
            <header className="article-detail-header">
              <div className="article-detail-labels flex flex-wrap items-center gap-2">
                {article.category && (
                  <Badge
                    variant="secondary"
                    className="article-category-label gap-1"
                    data-testid="badge-article-category"
                  >
                    {article.category.icon} {article.category.nameAr}
                  </Badge>
                )}
                {/*
                  Per user 2026-05-16:
                  - "جواز المحتوى" (DigitalPassportButton) sits immediately
                    after the category badge. Dropped the `ms-auto` that
                    previously pushed it to the opposite end of the row.
                  - "موثق" (PassportTrustBadge) is removed from the web
                    surface entirely — kept only inside the iOS app.
                */}
                <DigitalPassportButton
                  slug={slug!}
                  language="ar"
                  className="!min-h-0 !h-auto !py-0.5 !px-2.5 !text-xs !font-semibold !gap-1 !rounded-md [&_svg]:!size-3 !shadow-none"
                />
                {article.isReading && (
                  <Badge
                    variant="secondary"
                    className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25 hover:bg-emerald-500/15 gap-1 font-bold text-xs px-2.5 py-0.5 rounded-md"
                    data-testid="badge-article-reading"
                  >
                    <BookOpen className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                    قراءة
                  </Badge>
                )}
                {article.newsType === 'breaking' && (
                  <Badge className="bg-red-600 hover:bg-red-700 text-white border-red-600 gap-1" data-testid="badge-article-urgent">
                    <Zap className="h-3 w-3" />
                    عاجل
                  </Badge>
                )}
                {article.status === 'archived' && (user?.role === 'system_admin' || user?.role === 'admin' || user?.role === 'editor') && (
                  <Badge variant="secondary" className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-700 gap-1" data-testid="badge-article-archived">
                    <Archive className="h-3 w-3" />
                    مؤرشف
                  </Badge>
                )}
                {/*
                  The "محتوى مُنشأ بالذكاء الاصطناعي" pill used to appear
                  here. Removed per editorial direction: the Content
                  Passport ("جواز المحتوى") right next to this row carries
                  the granular AI footprint (percentage + provenance), so
                  the standalone pill was both redundant and misleading
                  for articles where only the metadata was AI-enriched
                  while the prose itself was written by a human reporter.
                  The card-level badge in lists (ArticleCard.tsx) is kept
                  — lists don't have a passport entry point.
                */}
              </div>

              <h1 className="article-detail-title" data-testid="text-article-title">
                {article.title}
              </h1>
              {article.subtitle && (
                <p className="article-detail-subtitle" data-testid="text-article-subtitle">
                  {article.subtitle}
                </p>
              )}

              <div className="article-detail-byline">
                {resolvedAuthor && (
                <div className="article-detail-author flex items-center gap-3">
                  <Avatar className="article-byline-avatar h-12 w-12 shrink-0">
                    <AvatarImage 
                      src={resolvedAuthor?.profileImageUrl || ""} 
                      alt={`${resolvedAuthor?.firstName || ""} ${resolvedAuthor?.lastName || ""}`.trim() || resolvedAuthor?.email || ""}
                      className="object-cover"
                    />
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-bold">
                      {getInitials(resolvedAuthor?.firstName, resolvedAuthor?.lastName, resolvedAuthor?.email)}
                    </AvatarFallback>
                  </Avatar>
                  
                  {/* Author Name & Title */}
                  <div className="min-w-0">
                    {article.staff ? (
                      <Link 
                        href={`/reporter/${article.staff.slug}`} 
                        className="text-sm font-bold hover:text-primary transition-colors flex items-center gap-1" 
                        data-testid="link-reporter-profile"
                      >
                        <span data-testid="text-author-name">
                          {bylineName}
                        </span>
                        {article.staff.isVerified && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                        )}
                      </Link>
                    ) : (
                      <span className="text-sm font-bold" data-testid="text-author-name">
                        {bylineName}
                      </span>
                    )}
                    <span className="article-byline-title" data-testid="text-author-title">{bylineTitle}</span>
                  </div>

                </div>
                )}
                <div className="article-detail-metadata">
                  {publicationParts && (
                    <div className="article-publication-row">
                      <Clock aria-hidden="true" />
                      <time dateTime={publicationParts.iso} title={[publishedDateLabel, timeAgo].filter(Boolean).join(" — ")} aria-label={`نُشر في ${publishedDateLabel}`}>
                        <span>{publicationParts.date}</span>
                        <span className="article-publication-time">{publicationParts.time}</span>
                      </time>
                    </div>
                  )}
                  {meaningfulUpdatedDateLabel && (
                    <div className="article-publication-row article-updated-row">
                      <span className="article-metadata-label">آخر تحديث</span>
                      <time dateTime={editorialModifiedAt}>{meaningfulUpdatedDateLabel}</time>
                    </div>
                  )}
                  <div className="article-reading-meta">
                    <span><BookOpen aria-hidden="true" /> قراءة {readingTime} دقيقة</span>
                  </div>
                </div>

              </div>
            </header>

            {/* Featured Image or Video */}
            {(article as any).isVideoTemplate && (article as any).videoUrl ? (
              <VideoPlayer
                videoUrl={(article as any).videoUrl}
                thumbnailUrl={getCacheBustedImageUrl(
                  (article as any).videoThumbnailUrl || article.imageUrl,
                  article.updatedAt,
                )}
                title={article.title}
                className="article-detail-hero rounded-xl"
              />
            ) : article.imageUrl && (() => {
              const heroImageAsset = mediaAssets?.find(
                (asset: any) => asset.displayOrder === 0
              );
              const heroW = heroImageAsset?.mediaFile?.width;
              const heroH = heroImageAsset?.mediaFile?.height;
              const heroAspectRatio = heroW && heroH && heroW > 0 && heroH > 0
                ? `${heroW} / ${heroH}`
                : undefined;

              return (
                <ImageWithCaption
                  imageUrl={heroImageUrl ?? article.imageUrl}
                  altText={heroImageAsset?.altText || article.title}
                  captionHtml={heroImageAsset?.captionHtml}
                  captionPlain={heroImageAsset?.captionPlain || heroImageAsset?.altText || article.title}
                  sourceName={heroImageAsset?.sourceName}
                  sourceUrl={heroImageAsset?.sourceUrl}
                  isAiGenerated={(article as any).isAiGeneratedImage || false}
                  aiModel={(article as any).aiImageModel}
                  relatedArticleSlugs={heroImageAsset?.relatedArticleSlugs}
                  keywordTags={heroImageAsset?.keywordTags}
                  priority={true}
                  aspectRatio={heroAspectRatio}
                  className="article-detail-hero"
                  objectPosition={getObjectPosition(article)}
                />
              );
            })()}

            {(summaryText || (shouldFetchBullets && isLoadingBullets)) && (
              <ArticleSummary
                key={article.id}
                text={summaryText}
                loading={!summaryText && shouldFetchBullets && isLoadingBullets}
                audioProvider={audioProvider}
                isLoadingAudio={isLoadingAudio}
                isPlaying={isPlaying}
                onPlayAudio={handlePlayAudio}
              />
            )}

            <div className="article-detail-toolbar" data-testid="article-top-share">
              <div className="article-detail-toolbar-row">
                <div className="article-share-group" onMouseEnter={ensureShortLink} onTouchStart={ensureShortLink} onFocus={ensureShortLink}>
                  <span className="article-share-label">شارك:</span>
                  <SocialShareBar title={article.title} url={`https://sabq.org/article/${slug}`} copyUrl={`https://sabq.org/article/${slug}`} description={article.excerpt || ""} articleId={article.id} className="article-social-links" />
                </div>
              </div>
            </div>

            {/* DMS MPU Ad (mobile, under الموجز) — أُعيد إظهاره 2026-07-09 (أُخفي 2026-06-05 بطلب المستخدم). جوال فقط. */}
            <DmsMpuAd id="MPU" lazyLoad={true} />

            {/* Article Content or Paywall */}
            <div className="article-detail-body">
              {isLoadingPurchaseStatus ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-muted-foreground">جاري التحقق من حالة الشراء...</p>
                </div>
              ) : article.isPaid && !purchaseStatus?.hasPurchased ? (
                <Paywall 
                  article={{
                    id: article.id,
                    title: article.title,
                    content: article.content,
                    priceHalalas: article.priceHalalas || 0,
                    previewLength: article.previewLength ?? undefined,
                    imageUrl: article.imageUrl,
                    slug: article.slug
                  }}
                  onPurchaseComplete={() => {
                    queryClient.invalidateQueries({ queryKey: ['/api/payments/check-purchase', article.id] });
                  }}
                />
              ) : (
                <div 
                  ref={articleBodyRef}
                  className="article-prose prose prose-lg dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: sanitizedArticleHtml }}
                  data-testid="content-article-body"
                />
              )}
            </div>

            {/* Weekly Photos Section */}
            {article.articleType === 'weekly_photos' && (article as any).weeklyPhotosData?.photos && (
              <div className="article-detail-gallery">
                <WeeklyPhotosDisplay 
                  photos={(article as any).weeklyPhotosData.photos}
                  title="صور الأسبوع"
                />
              </div>
            )}

            {/* Additional Images - from mediaAssets table OR albumImages field */}
            {(() => {
              // First check mediaAssets from article_media_assets table
              // Note: API returns { ...assetFields, mediaFile: { ...mediaFileFields } }
              // تجاهل الصفوف بلا URL (يتيمة) — كانت تفتح قسم «الصور المرفقة» فارغاً.
              const mediaAdditionalImages = mediaAssets
                ?.filter((asset: any) => asset.displayOrder !== 0 && (asset.mediaFile?.url || asset.url))
                .sort((a: any, b: any) => a.displayOrder - b.displayOrder) || [];
              
              // Then check albumImages from article field (legacy/editor uploads)
              const albumImages = (article as any).albumImages || [];
              
              // If neither has images, don't render
              if (mediaAdditionalImages.length === 0 && albumImages.length === 0) return null;
              
              return (
                <div className="article-detail-gallery space-y-8">
                  <h3 className="text-lg font-bold mb-4">الصور المرفقة</h3>
                  <div className="space-y-8">
                    {/* Display mediaAssets first */}
                    {mediaAdditionalImages.map((asset: any, index: number) => (
                      <ImageWithCaption
                        key={asset.id || `media-${index}`}
                        imageUrl={asset.mediaFile?.url || asset.url}
                        altText={asset.altText || asset.mediaFile?.altText || `صورة ${index + 1}`}
                        captionHtml={asset.captionHtml}
                        captionPlain={asset.captionPlain}
                        sourceName={asset.sourceName}
                        sourceUrl={asset.sourceUrl}
                        relatedArticleSlugs={asset.relatedArticleSlugs}
                        keywordTags={asset.keywordTags}
                        className="w-full"
                      />
                    ))}
                    {/* Display albumImages (from article field) */}
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

            {/* Keywords - from SEO field OR article_tags table (after attached images) */}
            {((article.seo?.keywords && article.seo.keywords.length > 0) || articleTags.length > 0) && (
              <section className="article-detail-keywords">
                <h3 className="text-sm font-semibold text-muted-foreground">الكلمات المفتاحية</h3>
                <div className="flex flex-wrap gap-2">
                  {/* Display article tags first (from article_tags table - WhatsApp/Email) */}
                  {articleTags.map((tag, index) => (
                    <Link
                      key={`tag-${tag.id}`}
                      className="article-keyword"
                      href={`/keyword/${encodeURIComponent(tag.nameAr)}`}
                      data-testid={`badge-tag-${index}`}
                    >
                      {tag.nameAr}
                    </Link>
                  ))}
                  {/* Display SEO keywords if no article tags (from SEO field - editor) */}
                  {articleTags.length === 0 && article.seo?.keywords?.map((keyword, index) => (
                    <Link
                      key={`seo-${index}`}
                      className="article-keyword"
                      href={`/keyword/${encodeURIComponent(keyword)}`}
                      data-testid={`badge-keyword-${index}`}
                    >
                      {keyword}
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <div className="article-detail-toolbar article-bottom-share" data-testid="article-actions">
              <div className="article-detail-toolbar-row">
                <div className="article-share-group" onMouseEnter={ensureShortLink} onTouchStart={ensureShortLink} onFocus={ensureShortLink}>
                  <span className="article-share-label">شارك:</span>
                  <SocialShareBar title={article.title} url={`https://sabq.org/article/${slug}`} copyUrl={`https://sabq.org/article/${slug}`} description={article.excerpt || ""} articleId={article.id} className="article-social-links" />
                </div>
                {/* Engagement Actions */}
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

                  {/* Focus Mode trigger (Task #80) */}
                  <FocusReaderTrigger
                    language="ar"
                    className="article-action"
                    onClick={() => setFocusOpen(true)}
                  />
                </div>
              </div>

              {/* Inline AI-flavored feedback after like/save */}
              {engagementHint && (
                <div
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm animate-in fade-in slide-in-from-bottom-1 duration-300 ${
                    engagementHint.kind === "off"
                      ? "border-border bg-muted/50 text-muted-foreground"
                      : "border-green-500/20 bg-green-500/5 text-green-700 dark:text-green-400"
                  }`}
                  role="status"
                  aria-live="polite"
                  data-testid="engagement-ai-hint"
                >
                  {engagementHint.kind !== "off" && (
                    <Sparkles className="h-4 w-4 shrink-0 text-green-500" />
                  )}
                  <span>{engagementHint.text}</span>
                </div>
              )}

            </div>

            {/* Focus mode overlay (Task #80) */}
            {article && (
              <FocusReader
                open={focusOpen}
                onClose={() => setFocusOpen(false)}
                articleId={article.id}
                language="ar"
                isLoggedIn={!!user}
                title={article.title}
                subtitle={article.excerpt || article.subtitle || null}
                contentHtml={article.content}
                authorName={article.author ? `${article.author.firstName || ""} ${article.author.lastName || ""}`.trim() || article.author.email || null : null}
                publishedAt={article.publishedAt}
                articleSlug={slug}
                articleImageUrl={article.imageUrl}
                categoryName={article.category?.nameAr || article.category?.nameEn || null}
              />
            )}

            {/* Story Timeline */}
            {article.storyId && (
              <>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold">تطور القصة</h2>
                    <FollowStoryButton 
                      storyId={article.storyId} 
                      storyTitle={article.storyTitle || article.title}
                    />
                  </div>
                  <StoryTimeline storyId={article.storyId} />
                </div>
                <Separator />
              </>
            )}

            {/* Native Ads - Sponsored Content */}
            <NativeAdsSection
              articleId={article.id}
              categorySlug={article.category?.slug}
              keywords={articleTags?.map(tag => tag.nameAr) || []}
              limit={4}
            />

            {/* Article Poll */}
            <div className="mb-8">
              <ArticlePoll articleId={article.id} />
            </div>

            {/* Comments */}
            <CommentSection
              articleId={article.id}
              comments={comments}
              currentUser={user}
              onSubmitComment={handleComment}
              onLikeComment={handleLikeComment}
              likedCommentIds={likedCommentIds}
            />
          </article>

          {/* Sidebar */}
          <aside className="article-detail-sidebar" aria-label="المزيد عن الخبر">
            {/* AI Article Analytics */}
            <div className="article-sidebar-stats">
            <Suspense fallback={<Skeleton className="h-48 w-full" />}>
              <AiArticleStats query={insightsQuery} />
            </Suspense>
            </div>

            {/* Advertisement Slot - Article Sidebar */}
            <AdSlot slotId="sidebar" className="my-6" />

            {/* AI-Powered Smart Recommendations */}
            <div className="article-sidebar-recommendations"><AIRecommendationsPanel query={recommendationsQuery} /></div>

            {/* Related Opinion Articles */}
            {article?.category && (
              <div className="article-sidebar-opinions"><RelatedOpinionsSection
                categoryId={article.category.id}
                categoryName={article.category.nameAr}
                excludeArticleId={article.id}
                limit={5}
              /></div>
            )}

            {relatedArticles.length > 0 && (
              <div className="article-sidebar-related"><RecommendationsWidget
                articles={relatedArticles}
                title="اقرأ أيضاً"
                reason="آخر ما نُشر في القسم"
              /></div>
            )}
          </aside>
        </div>
      </main>

      <Footer />
    </div>
  );
}
