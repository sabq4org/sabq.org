import { useParams, Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import DOMPurify from "isomorphic-dompurify";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ImageWithCaption } from "@/components/ImageWithCaption";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiUrl, apiRequest, queryClient } from "@/lib/queryClient";
import { CommentsTeaser } from "@/components/CommentsTeaser";
import { CommentSection } from "@/components/CommentSection";
import {
  ArrowRight,
  ArrowUp,
  ChevronRight,
  Share2,
  Calendar,
  Check,
  Clock,
  Copy,
  Eye,
  Home,
  Circle,
  Loader2,
  MessageCircle,
  Pause,
  User,
  Sparkles,
  Volume2,
} from "lucide-react";
import { getLucideIcon } from "@/lib/lucideIconMap";
import { angleTheme } from "@/lib/angleTheme";
import { formatNumber, formatDate } from "@/lib/format";
import type { Topic, Angle, DisplayComment } from "@shared/schema";

type AngleWriter = {
  id?: string | null;
  name: string;
  avatar: string | null;
  slug: string | null;
};

type TopicDetailResponse = {
  topic: Topic;
  angle: Angle;
  writer: AngleWriter | null;
};


function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripDuplicateExcerptFromHtml(html: string, excerpt: string): string {
  const normalized = normalizeText(excerpt);
  if (!normalized) return html;

  return html.replace(/^<p[^>]*>([\s\S]*?)<\/p>\s*/i, (match, inner) => {
    const text = inner.replace(/<[^>]+>/g, " ");
    return normalizeText(text) === normalized ? "" : match;
  });
}

function prepareTopicContent(topic: Topic) {
  const excerpt = topic.excerpt?.trim();
  const content = topic.content;
  if (!content || !excerpt) return content;

  if (content.blocks?.length) {
    const first = content.blocks[0];
    if (
      first.type === "text" &&
      first.content &&
      normalizeText(first.content) === normalizeText(excerpt)
    ) {
      return { ...content, blocks: content.blocks.slice(1) };
    }
  }

  if (content.plainText) {
    const plain = content.plainText.trim();
    if (normalizeText(plain).startsWith(normalizeText(excerpt))) {
      const remainder = plain.slice(excerpt.length).trim();
      return { ...content, plainText: remainder || null };
    }
  }

  if (content.rawHtml) {
    const cleaned = stripDuplicateExcerptFromHtml(content.rawHtml, excerpt);
    if (cleaned !== content.rawHtml) {
      return { ...content, rawHtml: cleaned };
    }
  }

  return content;
}

/** يقدّر زمن القراءة بالدقائق من نصوص الموضوع (متوسط 180 كلمة/دقيقة للعربية). */
function estimateReadingMinutes(topic: Topic): number {
  const parts: string[] = [];
  if (topic.excerpt) parts.push(topic.excerpt);
  const content = topic.content;
  if (content?.blocks?.length) {
    for (const block of content.blocks) {
      if (block.content) parts.push(block.content);
      if (block.caption) parts.push(block.caption);
    }
  }
  if (content?.plainText) parts.push(content.plainText);
  if (content?.rawHtml) parts.push(content.rawHtml.replace(/<[^>]+>/g, " "));

  const words = normalizeText(parts.join(" ")).split(" ").filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 180));
}

function WriterByline({
  writer,
  angleName,
}: {
  writer: AngleWriter | null;
  angleName: string;
}) {
  if (!writer) return null;

  const avatar = (
    <Avatar className="h-12 w-12 shrink-0 ring-2 ring-[color:var(--angle-border)] ring-offset-2 ring-offset-background">
      {writer.avatar && (
        <AvatarImage src={writer.avatar} alt={writer.name} className="object-cover" />
      )}
      <AvatarFallback className="bg-[color:var(--angle-soft)] text-[color:var(--angle)] text-sm font-bold">
        {writer.name.charAt(0)}
      </AvatarFallback>
    </Avatar>
  );

  const writerHref = writer.id ? `/muqtarab/writer/${writer.id}` : null;

  const nameEl = writerHref ? (
    <Link href={writerHref}>
      <a
        className="font-bold text-base text-foreground hover:text-[color:var(--angle)] transition-colors"
        data-testid="text-writer-name"
      >
        {writer.name}
      </a>
    </Link>
  ) : (
    <p className="font-bold text-base text-foreground" data-testid="text-writer-name">
      {writer.name}
    </p>
  );

  return (
    <div className="flex items-center gap-3" data-testid="writer-byline">
      {writerHref ? <Link href={writerHref}>{avatar}</Link> : avatar}
      <div className="min-w-0">
        {nameEl}
        <p className="text-sm text-muted-foreground" data-testid="text-writer-role">
          كاتب زاوية {angleName}
        </p>
      </div>
    </div>
  );
}

function renderContentBlock(
  block: {
    type: "text" | "image" | "video" | "link" | "embed" | "quote" | "heading";
    content?: string;
    url?: string;
    alt?: string;
    caption?: string;
    level?: number;
    metadata?: Record<string, unknown>;
  },
  index: number
) {
  switch (block.type) {
    case "heading": {
      const HeadingTag = `h${block.level || 2}` as keyof JSX.IntrinsicElements;
      const headingClasses = {
        1: "text-3xl font-bold mb-4 mt-8",
        2: "text-2xl font-bold mb-3 mt-7",
        3: "text-xl font-semibold mb-2 mt-6",
        4: "text-lg font-semibold mb-2 mt-5",
        5: "text-base font-semibold mb-2 mt-4",
        6: "text-sm font-semibold mb-2 mt-4",
      };
      return (
        <HeadingTag
          key={index}
          className={headingClasses[block.level as keyof typeof headingClasses || 2]}
          data-testid={`content-heading-${index}`}
        >
          {block.content}
        </HeadingTag>
      );
    }

    case "text":
      return (
        <p
          key={index}
          className="text-foreground leading-[1.9] mb-5 text-lg"
          data-testid={`content-text-${index}`}
        >
          {block.content}
        </p>
      );

    case "image":
      return (
        <figure key={index} className="my-8" data-testid={`content-image-${index}`}>
          <img src={block.url} alt={block.alt || ""} className="w-full rounded-xl" />
          {block.caption && (
            <figcaption className="text-sm text-muted-foreground mt-2 text-center">
              {block.caption}
            </figcaption>
          )}
        </figure>
      );

    case "quote":
      return (
        <blockquote
          key={index}
          className="relative my-10 rounded-2xl border border-[color:var(--angle-border)] bg-[color:var(--angle-soft)]/40 px-6 py-5 pr-8 text-lg leading-relaxed text-foreground/90 not-italic"
          data-testid={`content-quote-${index}`}
        >
          <span
            className="absolute right-0 top-3 bottom-3 w-1 rounded-full bg-[color:var(--angle)]"
            aria-hidden="true"
          />
          {block.content}
        </blockquote>
      );

    case "video":
      return (
        <div key={index} className="my-8" data-testid={`content-video-${index}`}>
          <video src={block.url} controls className="w-full rounded-xl">
            Your browser does not support the video tag.
          </video>
          {block.caption && (
            <p className="text-sm text-muted-foreground mt-2 text-center">{block.caption}</p>
          )}
        </div>
      );

    case "link":
      return (
        <a
          key={index}
          href={block.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[color:var(--angle,#6366f1)] hover:underline inline-block my-2"
          data-testid={`content-link-${index}`}
        >
          {block.content || block.url}
        </a>
      );

    case "embed":
      return (
        <div
          key={index}
          className="my-8"
          data-testid={`content-embed-${index}`}
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(block.content || "") }}
        />
      );

    default:
      return (
        <p key={index} className="mb-5 text-lg leading-[1.9]" data-testid={`content-default-${index}`}>
          {block.content}
        </p>
      );
  }
}

type TtsState = "idle" | "loading" | "playing" | "paused";

export default function TopicDetail() {
  const { angleSlug, topicSlug } = useParams<{ angleSlug: string; topicSlug: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: user } = useQuery<{ id: string; name?: string; email?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const {
    data: topicData,
    isLoading: isLoadingTopic,
    error: topicError,
  } = useQuery<TopicDetailResponse>({
    queryKey: ["/api/muqtarab/angles", angleSlug, "topics", topicSlug],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/muqtarab/angles/${angleSlug}/topics/${topicSlug}`));
      if (!res.ok) throw new Error("Failed to fetch topic");
      return res.json();
    },
    enabled: !!angleSlug && !!topicSlug,
  });

  const { data: relatedData } = useQuery<{ topics: Topic[] }>({
    queryKey: ["/api/muqtarab/angles", angleSlug, "topics", "related"],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/muqtarab/angles/${angleSlug}/topics?limit=5`));
      if (!res.ok) throw new Error("Failed to fetch related topics");
      return res.json();
    },
    enabled: !!angleSlug && !!topicData?.topic?.id,
  });

  const topic = topicData?.topic;
  const angle = topicData?.angle;
  const writer = topicData?.writer ?? null;

  const relatedTopics = (relatedData?.topics ?? []).filter((t) => t.id !== topic?.id).slice(0, 3);

  // ---- التعليقات (نفس نظام تعليقات الأخبار/الرأي) ----
  const { data: commentsRaw } = useQuery<DisplayComment[]>({
    queryKey: ["/api/muqtarab/topics", topic?.id, "comments"],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/muqtarab/topics/${topic!.id}/comments`), {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch comments");
      return res.json();
    },
    enabled: !!topic?.id,
  });
  const comments = Array.isArray(commentsRaw) ? commentsRaw : [];

  // Per-user liked-comment overlay (kept out of the cached comments payload).
  const { data: myLikesRaw } = useQuery<string[]>({
    queryKey: ["/api/muqtarab/topics", topic?.id, "comments", "my-likes"],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/muqtarab/topics/${topic!.id}/comments/my-likes`), {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch liked comments");
      return res.json();
    },
    enabled: !!topic?.id && !!user?.id,
  });
  const likedCommentIds = Array.isArray(myLikesRaw) ? myLikesRaw : [];

  const recentCommenters = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ id: string; firstName?: string | null; lastName?: string | null; profileImageUrl?: string | null }> = [];
    for (const c of comments) {
      const u = (c as any).user;
      if (u && !seen.has(u.id)) {
        seen.add(u.id);
        out.push({ id: u.id, firstName: u.firstName, lastName: u.lastName, profileImageUrl: u.profileImageUrl });
      }
      if (out.length >= 3) break;
    }
    return out;
  }, [comments]);

  const commentMutation = useMutation({
    mutationFn: async (data: { content: string; parentId?: string }) => {
      if (!topic) return;
      return await apiRequest(`/api/muqtarab/topics/${topic.id}/comments`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/muqtarab/topics", topic?.id, "comments"] });
      toast({
        title: "شكراً لمشاركتك",
        description:
          "يتم تحليل تعليقك الآن بواسطة الذكاء الاصطناعي للتأكد من التزامه بمعايير المجتمع. سيُنشر تلقائياً إذا كان آمناً.",
      });
    },
    onError: (error: any) => {
      toast({
        title: error?.status === 401 ? "تسجيل دخول مطلوب" : "خطأ",
        description:
          error?.status === 401 ? "يجب تسجيل الدخول لإضافة تعليق" : error?.message || "فشل في إضافة التعليق",
        variant: "destructive",
      });
    },
  });

  const handleComment = (content: string, parentId?: string) => {
    commentMutation.mutate({ content, parentId });
  };

  // Toggle a like on a topic comment. Throws on failure so CommentSection
  // rolls back its optimistic state.
  const handleLikeComment = async (commentId: string, nextLiked: boolean) => {
    await apiRequest(`/api/topic-comments/${commentId}/like`, { method: nextLiked ? "POST" : "DELETE" });
    queryClient.invalidateQueries({ queryKey: ["/api/muqtarab/topics", topic?.id, "comments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/muqtarab/topics", topic?.id, "comments", "my-likes"] });
  };

  // ---- تتبع المشاهدة ----
  const viewedRef = useRef<string | null>(null);
  useEffect(() => {
    if (topic?.id && viewedRef.current !== topic.id) {
      viewedRef.current = topic.id;
      fetch(apiUrl(`/api/muqtarab/topics/${topic.id}/view`), {
        method: "POST",
        credentials: "include",
      }).catch(() => {});
    }
  }, [topic?.id]);

  // ---- شريط تقدم القراءة + زر العودة للأعلى ----
  const articleRef = useRef<HTMLDivElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const el = articleRef.current;
        const bar = progressRef.current;
        if (el && bar) {
          const start = el.offsetTop - 80;
          const end = el.offsetTop + el.offsetHeight - window.innerHeight;
          const raw = (window.scrollY - start) / Math.max(1, end - start);
          const pct = Math.min(1, Math.max(0, raw));
          bar.style.transform = `scaleX(${pct})`;
        }
        setShowBackToTop(window.scrollY > 700);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [topic?.id]);

  // ---- الاستماع للموجز (ElevenLabs TTS) ----
  const [ttsState, setTtsState] = useState<TtsState>("idle");
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsUrlRef = useRef<string | null>(null);

  const stopTts = useCallback(() => {
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current = null;
    }
    if (ttsUrlRef.current) {
      URL.revokeObjectURL(ttsUrlRef.current);
      ttsUrlRef.current = null;
    }
  }, []);

  useEffect(() => stopTts, [stopTts]);

  const handleListen = async () => {
    if (!topic?.excerpt) return;

    if (ttsState === "playing") {
      ttsAudioRef.current?.pause();
      setTtsState("paused");
      return;
    }
    if (ttsState === "paused" && ttsAudioRef.current) {
      ttsAudioRef.current.play();
      setTtsState("playing");
      return;
    }
    if (ttsState === "loading") return;

    setTtsState("loading");
    try {
      // النص يُبنى في الخادم من الموضوع المنشور نفسه — لا يُرسل نص حر من العميل
      const res = await fetch(apiUrl(`/api/muqtarab/topics/${topic.id}/summary-audio`));
      if (!res.ok) throw new Error("TTS failed");
      const blob = await res.blob();
      stopTts();
      const url = URL.createObjectURL(blob);
      ttsUrlRef.current = url;
      const audio = new Audio(url);
      ttsAudioRef.current = audio;
      audio.onended = () => setTtsState("idle");
      audio.onerror = () => setTtsState("idle");
      await audio.play();
      setTtsState("playing");
    } catch {
      setTtsState("idle");
      toast({
        title: "تعذر تشغيل الموجز الصوتي",
        description: "حاول مرة أخرى بعد قليل.",
        variant: "destructive",
      });
    }
  };

  // ---- المشاركة ----
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    if (navigator.share && topic) {
      try {
        await navigator.share({
          title: topic.title,
          text: topic.excerpt || "",
          url: window.location.href,
        });
        return;
      } catch {
        // المستخدم ألغى المشاركة — لا شيء يُفعل
      }
    } else {
      handleCopyLink();
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast({ title: "تم نسخ الرابط", description: "شارك الموضوع مع من تحب." });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast({ title: "تعذر نسخ الرابط", variant: "destructive" });
    }
  };

  const shareOnX = () => {
    if (!topic) return;
    const url = `https://x.com/intent/tweet?text=${encodeURIComponent(topic.title)}&url=${encodeURIComponent(window.location.href)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const shareOnWhatsApp = () => {
    if (!topic) return;
    const url = `https://wa.me/?text=${encodeURIComponent(`${topic.title}\n${window.location.href}`)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // ---- SEO ----
  useEffect(() => {
    if (topic && angle) {
      document.title = `${topic.title} - ${angle.nameAr} | مُقترب | سبق`;

      const metaDescription = document.querySelector('meta[name="description"]');
      const description = topic.excerpt || topic.title;

      if (metaDescription) {
        metaDescription.setAttribute("content", description);
      } else {
        const meta = document.createElement("meta");
        meta.name = "description";
        meta.content = description;
        document.head.appendChild(meta);
      }

      const setOgTag = (property: string, content: string) => {
        let tag = document.querySelector(`meta[property="${property}"]`);
        if (tag) {
          tag.setAttribute("content", content);
        } else {
          tag = document.createElement("meta");
          tag.setAttribute("property", property);
          tag.setAttribute("content", content);
          document.head.appendChild(tag);
        }
      };

      setOgTag("og:title", `${topic.title} - ${angle.nameAr} | مُقترب`);
      setOgTag("og:description", description);
      setOgTag("og:type", "article");

      const seoMeta = (topic.seoMeta as { ogImage?: string } | null) || {};
      const shareImageRaw =
        seoMeta.ogImage || topic.heroImageUrl || angle.coverImageUrl || "";
      if (shareImageRaw) {
        const shareImage = shareImageRaw.startsWith("http")
          ? shareImageRaw
          : `${window.location.origin}${shareImageRaw.startsWith("/") ? "" : "/"}${shareImageRaw}`;
        setOgTag("og:image", shareImage);
        setOgTag("og:image:width", "1200");
        setOgTag("og:image:height", "630");
      }
    }
  }, [topic, angle]);

  if (isLoadingTopic) {
    return (
      <div className="min-h-screen bg-background flex flex-col" dir="rtl">
        <Header user={user} />
        <div className="border-b bg-muted/30">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="max-w-3xl mx-auto space-y-6">
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-14 w-1/2" />
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="w-full aspect-[16/9] rounded-xl" />
            <div className="space-y-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (topicError || !topic || !angle) {
    return (
      <div className="min-h-screen bg-background flex flex-col" dir="rtl">
        <Header user={user} />
        <div className="border-b bg-muted/30">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Link href="/">
                <a className="hover:text-foreground transition-colors" data-testid="link-breadcrumb-home">
                  <Home className="h-4 w-4" />
                </a>
              </Link>
              <ChevronRight className="h-4 w-4" />
              <Link href="/muqtarab">
                <a className="hover:text-foreground transition-colors" data-testid="link-breadcrumb-muqtarab">
                  مُقترب
                </a>
              </Link>
              <ChevronRight className="h-4 w-4" />
              <span className="text-foreground">غير موجود</span>
            </div>
          </div>
        </div>
        <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-4" data-testid="text-error-title">
              الموضوع غير موجود
            </h1>
            <p className="text-muted-foreground mb-8" data-testid="text-error-description">
              عذراً، لم نتمكن من العثور على الموضوع المطلوب
            </p>
            <Button asChild data-testid="button-back-to-muqtarab">
              <Link href="/muqtarab">
                <a className="gap-2">
                  <ArrowRight className="h-4 w-4" />
                  العودة إلى مُقترب
                </a>
              </Link>
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const displayContent = prepareTopicContent(topic);
  const contentBlocks = displayContent?.blocks || [];
  const hasContent =
    contentBlocks.length > 0 || displayContent?.rawHtml || displayContent?.plainText;
  const theme = angleTheme(angle.colorHex);
  const AngleIcon = getLucideIcon(angle.iconKey, Circle);
  const keywords =
    (topic.seoMeta as { keywords?: string[] } | null)?.keywords?.filter(Boolean) ?? [];
  const readingMinutes = estimateReadingMinutes(topic);
  const viewCount = topic.viewCount ?? 0;

  return (
    <div
      className="relative min-h-screen bg-background flex flex-col"
      dir="rtl"
      style={theme.vars}
    >
      {/* شريط تقدم القراءة */}
      <div className="fixed inset-x-0 top-0 z-[60] h-1 bg-transparent" aria-hidden="true">
        <div
          ref={progressRef}
          className="h-full w-full origin-right"
          style={{ background: theme.gradient, transform: "scaleX(0)" }}
          data-testid="reading-progress"
        />
      </div>

      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div
          className="absolute -top-32 -left-24 h-96 w-96 rounded-full blur-3xl opacity-25"
          style={{ background: `radial-gradient(circle, ${theme.glow} 0%, transparent 70%)` }}
        />
        <div
          className="absolute bottom-0 right-0 h-80 w-80 rounded-full blur-3xl opacity-15"
          style={{ background: `radial-gradient(circle, ${theme.glow} 0%, transparent 70%)` }}
        />
      </div>

      <div className="h-1.5 w-full shrink-0" style={{ background: theme.gradient }} />

      <div className="relative z-10 flex flex-col flex-1">
        <Header user={user} />

        <div className="border-b bg-muted/30">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
              <Link href="/">
                <a className="hover:text-foreground transition-colors" data-testid="link-breadcrumb-home">
                  <Home className="h-4 w-4" />
                </a>
              </Link>
              <ChevronRight className="h-4 w-4" />
              <Link href="/muqtarab">
                <a className="hover:text-foreground transition-colors" data-testid="link-breadcrumb-muqtarab">
                  مُقترب
                </a>
              </Link>
              <ChevronRight className="h-4 w-4" />
              <Link href={`/muqtarab/${angleSlug}`}>
                <a
                  className="transition-colors hover:text-[color:var(--angle)]"
                  data-testid="link-breadcrumb-angle"
                >
                  {angle.nameAr}
                </a>
              </Link>
              <ChevronRight className="h-4 w-4" />
              <span className="text-foreground line-clamp-1" data-testid="text-breadcrumb-topic">
                {topic.title}
              </span>
            </div>
          </div>
        </div>

        <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
          <div className="max-w-3xl mx-auto">
            {/* ---- الترويسة ---- */}
            <header className="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <Link href={`/muqtarab/${angleSlug}`}>
                <a
                  className="mb-5 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold shadow-sm transition-transform hover:scale-[1.03]"
                  style={{ backgroundColor: theme.soft, color: theme.color }}
                  data-testid="chip-angle"
                >
                  <AngleIcon className="h-4 w-4" />
                  زاوية {angle.nameAr}
                </a>
              </Link>

              <h1
                className="text-3xl md:text-4xl lg:text-[2.75rem] font-bold leading-[1.35] text-foreground"
                data-testid="heading-topic-title"
              >
                {topic.title}
              </h1>

              <div
                className="mt-5 h-1 w-20 rounded-full"
                style={{ background: theme.gradient }}
                aria-hidden="true"
              />

              {/* الكاتب + بيانات القراءة */}
              <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
                <WriterByline writer={writer} angleName={angle.nameAr} />
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                  {topic.publishedAt && (
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-4 w-4" />
                      <span data-testid="text-published-date">{formatDate(topic.publishedAt)}</span>
                    </span>
                  )}
                  <span className="flex items-center gap-1.5" data-testid="text-reading-time">
                    <Clock className="h-4 w-4" />
                    {readingMinutes} {readingMinutes === 1 ? "دقيقة" : "دقائق"} قراءة
                  </span>
                  {viewCount > 0 && (
                    <span className="flex items-center gap-1.5" data-testid="text-view-count">
                      <Eye className="h-4 w-4" />
                      {formatNumber(viewCount)} مشاهدة
                    </span>
                  )}
                </div>
              </div>

              {/* أزرار المشاركة */}
              <div className="mt-6 flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleShare}
                  className="gap-2 border-[color:var(--angle-border)] text-[color:var(--angle)] hover:bg-[color:var(--angle-soft)] hover:text-[color:var(--angle)]"
                  data-testid="button-share"
                >
                  <Share2 className="h-4 w-4" />
                  مشاركة
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={shareOnX}
                  className="gap-2"
                  aria-label="مشاركة على X"
                  data-testid="button-share-x"
                >
                  <span className="text-sm font-bold leading-none" aria-hidden="true">𝕏</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={shareOnWhatsApp}
                  className="gap-2"
                  aria-label="مشاركة عبر واتساب"
                  data-testid="button-share-whatsapp"
                >
                  <MessageCircle className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyLink}
                  className="gap-2"
                  aria-label="نسخ الرابط"
                  data-testid="button-copy-link"
                >
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </header>

            {/* ---- الموجز الذكي ---- */}
            {topic.excerpt && (
              <aside
                className="mb-10 rounded-2xl p-[1.5px] animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100"
                style={{ background: theme.gradient }}
                data-testid="section-excerpt"
              >
                <div className="rounded-[calc(1rem-1.5px)] bg-background/95 backdrop-blur p-6 md:p-7">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4" style={{ color: theme.color }} />
                      <p
                        className="text-xs font-bold tracking-wide"
                        style={{ color: theme.color }}
                      >
                        الموجز الذكي
                      </p>
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0"
                        style={{ backgroundColor: theme.soft, color: theme.color }}
                      >
                        AI
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleListen}
                      disabled={ttsState === "loading"}
                      className="h-8 gap-1.5 text-xs font-semibold hover:bg-[color:var(--angle-soft)]"
                      style={{ color: theme.color }}
                      data-testid="button-listen-excerpt"
                    >
                      {ttsState === "loading" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : ttsState === "playing" ? (
                        <Pause className="h-3.5 w-3.5" />
                      ) : (
                        <Volume2 className="h-3.5 w-3.5" />
                      )}
                      {ttsState === "playing"
                        ? "إيقاف مؤقت"
                        : ttsState === "paused"
                          ? "متابعة الاستماع"
                          : "استمع للموجز"}
                    </Button>
                  </div>
                  <p
                    className="text-lg md:text-xl leading-relaxed text-foreground/90"
                    data-testid="text-excerpt"
                  >
                    {topic.excerpt}
                  </p>
                </div>
              </aside>
            )}

            {topic.heroImageUrl && (
              <div
                className="mb-10 overflow-hidden rounded-2xl shadow-lg animate-in fade-in duration-700 delay-150"
                style={{ boxShadow: `0 20px 50px -20px ${theme.glow}` }}
                data-testid="section-featured-image"
              >
                <ImageWithCaption
                  imageUrl={topic.heroImageUrl}
                  altText={topic.title}
                  priority
                />
              </div>
            )}

            {/* ---- المحتوى ---- */}
            <div ref={articleRef}>
              <article
                className="prose prose-lg max-w-none prose-headings:text-foreground prose-p:text-lg prose-p:leading-[1.9] prose-p:mb-5 prose-a:text-[color:var(--angle)]"
                data-testid="section-content"
              >
                {contentBlocks.length > 0 ? (
                  contentBlocks.map((block, index) => renderContentBlock(block, index))
                ) : displayContent?.rawHtml ? (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(displayContent.rawHtml),
                    }}
                    data-testid="content-raw-html"
                  />
                ) : displayContent?.plainText ? (
                  <p className="text-lg leading-[1.9]" data-testid="content-plain-text">
                    {displayContent.plainText}
                  </p>
                ) : (
                  !hasContent && (
                    <p className="text-muted-foreground text-center py-12" data-testid="text-no-content">
                      لا يوجد محتوى متاح لهذا الموضوع
                    </p>
                  )
                )}
              </article>
            </div>

            {/* فاصل نهاية الموضوع */}
            {hasContent && (
              <div className="my-10 flex items-center justify-center gap-3" aria-hidden="true">
                <span className="h-px w-16 bg-border" />
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-full"
                  style={{ backgroundColor: theme.soft, color: theme.color }}
                >
                  <AngleIcon className="h-4 w-4" />
                </span>
                <span className="h-px w-16 bg-border" />
              </div>
            )}

            {keywords.length > 0 && (
              <div className="mt-2 space-y-3" data-testid="section-keywords">
                <h3 className="text-sm font-semibold text-muted-foreground">الكلمات المفتاحية</h3>
                <div className="flex flex-wrap gap-2">
                  {keywords.map((keyword, index) => (
                    <Badge
                      key={`${keyword}-${index}`}
                      variant="secondary"
                      className="cursor-pointer transition-all duration-300 hover:scale-105 hover:bg-[color:var(--angle-soft)] hover:text-[color:var(--angle)]"
                      onClick={() => setLocation(`/keyword/${encodeURIComponent(keyword)}`)}
                      data-testid={`badge-keyword-${index}`}
                    >
                      #{keyword}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {angle.writerSignature && (
              <div
                className="mt-12 rounded-2xl border p-6 flex items-start gap-4"
                style={{ backgroundColor: theme.softer, borderColor: theme.border }}
                data-testid="writer-signature"
              >
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: theme.soft, color: theme.color }}
                >
                  <User className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold mb-1" style={{ color: theme.color }}>
                    توقيع الكاتب
                  </p>
                  <p className="text-base font-medium leading-relaxed whitespace-pre-wrap text-foreground">
                    {angle.writerSignature}
                  </p>
                </div>
              </div>
            )}

            {/* ---- النقاش / التعليقات ---- */}
            {topic && (
              <div className="mt-14 space-y-6">
                <CommentsTeaser
                  articleId={topic.id}
                  commentsCount={comments.length}
                  recentCommenters={recentCommenters}
                />
                <CommentSection
                  articleId={topic.id}
                  comments={comments}
                  currentUser={user}
                  onSubmitComment={handleComment}
                  onLikeComment={handleLikeComment}
                  likedCommentIds={likedCommentIds}
                  subjectNoun="الموضوع"
                />
              </div>
            )}

            {/* ---- المزيد من الزاوية ---- */}
            {relatedTopics.length > 0 && (
              <section className="mt-14" data-testid="section-related-topics">
                <h2
                  className="text-xl font-bold mb-5 flex items-center gap-2"
                  style={{ color: theme.color }}
                >
                  <AngleIcon className="h-5 w-5" />
                  المزيد من {angle.nameAr}
                </h2>
                <div className="grid gap-4">
                  {relatedTopics.map((related, idx) => (
                    <Link
                      key={related.id}
                      href={`/muqtarab/${angleSlug}/topic/${related.slug}`}
                    >
                      <Card className="group cursor-pointer border-[color:var(--angle-border)]/40 transition-all duration-300 hover:border-[color:var(--angle-border)] hover:shadow-md hover:-translate-y-0.5">
                        <CardContent className="flex items-start gap-4 p-4">
                          <span
                            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold tabular-nums"
                            style={{ backgroundColor: theme.soft, color: theme.color }}
                            aria-hidden="true"
                          >
                            {formatNumber(idx + 1)}
                          </span>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-foreground group-hover:text-[color:var(--angle)] transition-colors line-clamp-2">
                              {related.title}
                            </h3>
                            {related.excerpt && (
                              <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">
                                {related.excerpt}
                              </p>
                            )}
                            {related.publishedAt && (
                              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {formatDate(related.publishedAt)}
                              </p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <Separator className="my-10" />

            <div className="flex items-center justify-between gap-4 flex-wrap pb-4">
              <Button
                variant="ghost"
                asChild
                className="gap-2 text-[color:var(--angle)] hover:text-[color:var(--angle)] hover:bg-[color:var(--angle-soft)]"
                data-testid="button-back-to-angle"
              >
                <Link href={`/muqtarab/${angleSlug}`}>
                  <a className="flex items-center gap-2">
                    <ArrowRight className="h-4 w-4" />
                    العودة إلى {angle.nameAr}
                  </a>
                </Link>
              </Button>
              <Button variant="outline" asChild className="gap-2" data-testid="button-explore-angles">
                <Link href="/muqtarab">
                  <a>استكشف المزيد من الزوايا</a>
                </Link>
              </Button>
            </div>
          </div>
        </main>

        <Footer />
      </div>

      {/* زر العودة للأعلى */}
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className={`fixed bottom-6 left-6 z-50 flex h-11 w-11 items-center justify-center rounded-full border bg-background/90 shadow-lg backdrop-blur transition-all duration-300 hover:scale-105 ${
          showBackToTop ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 translate-y-3"
        }`}
        style={{ borderColor: theme.border, color: theme.color }}
        aria-label="العودة إلى الأعلى"
        data-testid="button-back-to-top"
      >
        <ArrowUp className="h-5 w-5" />
      </button>
    </div>
  );
}
