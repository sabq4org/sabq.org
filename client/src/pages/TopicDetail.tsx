import { useParams, Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState, useCallback, useMemo, type CSSProperties } from "react";
import DOMPurify from "isomorphic-dompurify";
import "@/styles/article-detail.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ImageWithCaption } from "@/components/ImageWithCaption";
import { ArticleSummary } from "@/components/public/ArticleSummary";
import { SocialShareBar } from "@/components/SocialShareBar";
import { FocusReader, FocusReaderTrigger } from "@/components/FocusReader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useCanonical } from "@/hooks/useCanonical";
import { apiUrl, apiRequest, queryClient } from "@/lib/queryClient";
import { transformArticleHtml } from "@/lib/legacyHtmlTransformer";
import { formatArticleTimestamp } from "@/lib/formatTime";
import { CommentsTeaser } from "@/components/CommentsTeaser";
import { CommentSection } from "@/components/CommentSection";
import {
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  Bookmark,
  BookOpen,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  Home,
  List,
  Loader2,
  MessageCircle,
  Pause,
  Quote,
  Share2,
  Sparkles,
  Type,
  User,
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
  bio?: string | null;
};

type TopicDetailResponse = {
  topic: Topic;
  angle: Angle;
  writer: AngleWriter | null;
};

type FeaturedTopicWithAngle = Topic & {
  angle?: Angle;
  writer?: { name: string; avatar: string | null } | null;
};

type ReaderFontSize = "sm" | "md" | "lg" | "xl";
type ReaderSurfaceMode = "default" | "warm" | "calm";

const READER_FONT_KEY = "sabq:muqtarab_font_size:v1";
const READER_SURFACE_KEY = "sabq:muqtarab_reading_bg:v1";
const SAVED_TOPICS_KEY = "sabq:saved_muqtarab_topics:v1";

const FONT_SIZE_CONFIG: Record<
  ReaderFontSize,
  { label: string; fontSize: string; lineHeight: string }
> = {
  sm: { label: "صغير", fontSize: "1.125rem", lineHeight: "1.95" },
  md: { label: "متوسط", fontSize: "1.25rem", lineHeight: "2.05" },
  lg: { label: "كبير", fontSize: "1.375rem", lineHeight: "2.12" },
  xl: { label: "كبير جداً", fontSize: "1.55rem", lineHeight: "2.18" },
};

const FONT_SIZE_ORDER: ReaderFontSize[] = ["sm", "md", "lg", "xl"];

export interface TocItem {
  id: string;
  text: string;
  level: number;
}

function readStoredFontSize(): ReaderFontSize {
  if (typeof window === "undefined") return "md";
  try {
    const v = window.localStorage.getItem(READER_FONT_KEY);
    if (v === "sm" || v === "md" || v === "lg" || v === "xl") return v;
  } catch {
    /* ignore */
  }
  return "md";
}

function readStoredSurface(): ReaderSurfaceMode {
  if (typeof window === "undefined") return "default";
  try {
    const v = window.localStorage.getItem(READER_SURFACE_KEY);
    if (v === "default" || v === "warm" || v === "calm") return v;
  } catch {
    /* ignore */
  }
  return "default";
}

function readSavedTopicIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SAVED_TOPICS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripTagsToText(html: string): string {
  return normalizeText(
    html
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&quot;/gi, '"')
      .replace(/&amp;/gi, "&"),
  );
}

function stripDuplicateLeadingElement(html: string, targetText: string): string {
  const normalizedTarget = normalizeText(targetText);
  if (!normalizedTarget) return html;

  return html.replace(
    /^\s*<(h1|h2|p)[^>]*>([\s\S]*?)<\/\1>\s*/i,
    (match, _tag, inner) => {
      const innerText = stripTagsToText(inner);
      return innerText === normalizedTarget ? "" : match;
    },
  );
}

function prepareTopicContent(topic: Topic) {
  const title = topic.title?.trim() || "";
  const excerpt = topic.excerpt?.trim() || "";
  const content = topic.content;
  if (!content) return content;

  let nextBlocks = content.blocks ? [...content.blocks] : [];
  if (nextBlocks.length > 0 && title) {
    const first = nextBlocks[0];
    if (
      (first.type === "heading" || first.type === "text") &&
      first.content &&
      normalizeText(first.content) === normalizeText(title)
    ) {
      nextBlocks = nextBlocks.slice(1);
    }
  }
  if (nextBlocks.length > 0 && excerpt) {
    const first = nextBlocks[0];
    if (
      first.type === "text" &&
      first.content &&
      normalizeText(first.content) === normalizeText(excerpt)
    ) {
      nextBlocks = nextBlocks.slice(1);
    }
  }

  let nextPlainText = content.plainText ?? undefined;
  if (nextPlainText) {
    let plain = nextPlainText.trim();
    if (title && normalizeText(plain).startsWith(normalizeText(title))) {
      plain = plain.slice(title.length).trim();
    }
    if (excerpt && normalizeText(plain).startsWith(normalizeText(excerpt))) {
      plain = plain.slice(excerpt.length).trim();
    }
    nextPlainText = plain || undefined;
  }

  let nextRawHtml = content.rawHtml ?? undefined;
  if (nextRawHtml) {
    let cleaned = nextRawHtml;
    if (title) cleaned = stripDuplicateLeadingElement(cleaned, title);
    if (excerpt) cleaned = stripDuplicateLeadingElement(cleaned, excerpt);
    nextRawHtml = cleaned;
  }

  return {
    ...content,
    blocks: nextBlocks,
    plainText: nextPlainText,
    rawHtml: nextRawHtml,
  };
}

/** يقدّر عدد الكلمات وزمن القراءة بالدقائق (متوسط 180 كلمة/دقيقة للعربية). */
function computeReadingMetrics(topic: Topic): { words: number; minutes: number } {
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
  else if (content?.rawHtml) parts.push(content.rawHtml.replace(/<[^>]+>/g, " "));

  const words = normalizeText(parts.join(" "))
    .split(" ")
    .filter(Boolean).length;
  return {
    words,
    minutes: Math.max(1, Math.ceil(words / 180)),
  };
}

/** يستخرج الفهرس (العناوين الفرعية) ويحقن معرّفات ثابتة + تنسيق الاقتباسات والآيات في HTML */
function enrichHtmlAndExtractToc(rawHtml: string): {
  html: string;
  toc: TocItem[];
  standoutQuote: string | null;
} {
  const toc: TocItem[] = [];
  let headingIdx = 0;
  let standoutQuote: string | null = null;

  const sanitized = DOMPurify.sanitize(rawHtml, {
    ADD_TAGS: ["iframe", "blockquote", "img", "figure", "figcaption"],
    ADD_ATTR: [
      "allow",
      "allowfullscreen",
      "frameborder",
      "scrolling",
      "src",
      "data-lang",
      "data-theme",
      "data-video-embed",
      "data-url",
      "data-embed-url",
      "data-align",
      "data-width",
      "data-caption",
      "class",
      "alt",
      "loading",
      "width",
      "height",
      "srcset",
      "sizes",
      "style",
      "fetchpriority",
      "decoding",
      "target",
      "rel",
      "aria-label",
      "aria-hidden",
      "id",
    ],
  });

  // Extract headings and add anchor IDs
  const withHeadings = sanitized.replace(
    /<h([1-4])([^>]*)>([\s\S]*?)<\/h\1>/gi,
    (full, levelStr, attrs, inner) => {
      const text = stripTagsToText(inner);
      if (!text) return full;
      const id = `topic-heading-${headingIdx++}`;
      const level = Math.max(2, Math.min(4, Number(levelStr) || 2));
      toc.push({ id, text, level });
      const cleanAttrs = String(attrs || "").replace(/\sid="[^"]*"/gi, "");
      return `<h${level}${cleanAttrs} id="${id}" class="scroll-mt-28">${inner}</h${level}>`;
    },
  );

  // Enhance standalone quote paragraphs («...» or "...") and Quranic verses (﴿...﴾)
  const enhanced = withHeadings.replace(
    /<p([^>]*)>([\s\S]*?)<\/p>/gi,
    (full, attrs, inner) => {
      const text = stripTagsToText(inner);
      if (!text) return full;

      // Quranic verse paragraph
      if (/^﴿[\s\S]+﴾/.test(text)) {
        return `<p${attrs} data-verse-paragraph="true">${inner}</p>`;
      }

      // Pure quoted story/statement paragraph at the opening or inside body
      const isQuotedParagraph =
        ((text.startsWith("«") && /»[.!؟…]?$/.test(text)) ||
          (text.startsWith('"') && /"[.!؟…]?$/.test(text))) &&
        text.length >= 25 &&
        text.length <= 420;

      if (isQuotedParagraph) {
        if (!standoutQuote) {
          standoutQuote = text.replace(/^[«"]|[»"][.!؟…]?$/g, "").trim();
        }
        return `<p${attrs} data-quote-paragraph="true">${inner}</p>`;
      }

      // Also pick a strong concluding or mid-article insight sentence if no quote found yet
      if (
        !standoutQuote &&
        text.length >= 55 &&
        text.length <= 185 &&
        (text.includes("ليس ") || text.includes("الفرق ") || text.includes("جودة "))
      ) {
        standoutQuote = text;
      }

      return full;
    },
  );

  return {
    html: transformArticleHtml(enhanced),
    toc,
    standoutQuote,
  };
}

/** يحوّل النص الذي يتضمن روابط مختصرة مثل ajh.sa إلى عناصر قابلة للنقر بأمان */
function renderTextWithLinks(text: string, accentColor: string) {
  const urlRegex = /((?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9-]+\.(?:sa|com|org|net|me|io)(?:\/[^\s]*)?)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, idx) => {
    if (urlRegex.test(part)) {
      urlRegex.lastIndex = 0;
      const href = part.startsWith("http") ? part : `https://${part}`;
      return (
        <a
          key={idx}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-semibold underline underline-offset-4 hover:opacity-80"
          style={{ color: accentColor }}
        >
          {part}
          <ExternalLink className="h-3 w-3" />
        </a>
      );
    }
    urlRegex.lastIndex = 0;
    return <span key={idx}>{part}</span>;
  });
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
    <div className="article-detail-author flex items-center gap-3" data-testid="writer-byline">
      {writerHref ? <Link href={writerHref}>{avatar}</Link> : avatar}
      <div className="min-w-0">
        {nameEl}
        <p className="article-byline-title text-sm text-muted-foreground" data-testid="text-writer-role">
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
  index: number,
  headingAnchorId?: string,
) {
  switch (block.type) {
    case "heading": {
      const HeadingTag = `h${block.level || 2}` as keyof JSX.IntrinsicElements;
      const headingClasses = {
        1: "text-3xl font-bold mb-4 mt-8 scroll-mt-28",
        2: "text-2xl font-bold mb-3 mt-7 scroll-mt-28",
        3: "text-xl font-semibold mb-2 mt-6 scroll-mt-28",
        4: "text-lg font-semibold mb-2 mt-5 scroll-mt-28",
        5: "text-base font-semibold mb-2 mt-4 scroll-mt-28",
        6: "text-sm font-semibold mb-2 mt-4 scroll-mt-28",
      };
      return (
        <HeadingTag
          key={index}
          id={headingAnchorId}
          className={headingClasses[(block.level as keyof typeof headingClasses) || 2]}
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
          className="text-foreground mb-5"
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
          className="relative my-8 rounded-2xl border border-[color:var(--angle-border)] bg-[color:var(--angle-soft)]/40 px-6 py-5 pr-8 leading-relaxed text-foreground/90 not-italic"
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
        <p key={index} className="mb-5" data-testid={`content-default-${index}`}>
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

  // ---- تفضيلات تجربة القارئ ----
  const [fontSize, setFontSize] = useState<ReaderFontSize>(() => readStoredFontSize());
  const [surfaceMode, setSurfaceMode] = useState<ReaderSurfaceMode>(() => readStoredSurface());
  const [focusOpen, setFocusOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(true);
  const [savedIds, setSavedIds] = useState<string[]>(() => readSavedTopicIds());
  const [readingPct, setReadingPct] = useState(0);
  const [selectedQuote, setSelectedQuote] = useState<{
    text: string;
    top: number;
    left: number;
  } | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(READER_FONT_KEY, fontSize);
    } catch {
      /* ignore */
    }
  }, [fontSize]);

  useEffect(() => {
    try {
      window.localStorage.setItem(READER_SURFACE_KEY, surfaceMode);
    } catch {
      /* ignore */
    }
  }, [surfaceMode]);

  const stepFontSize = (delta: -1 | 1) => {
    setFontSize((prev) => {
      const idx = FONT_SIZE_ORDER.indexOf(prev);
      const nextIdx = Math.min(FONT_SIZE_ORDER.length - 1, Math.max(0, idx + delta));
      return FONT_SIZE_ORDER[nextIdx];
    });
  };

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

  // جلب مواضيع الزاوية (للتنقل بين الموضوع السابق/التالي + المزيد من الزاوية)
  const { data: angleTopicsData } = useQuery<{ topics: Topic[] }>({
    queryKey: ["/api/muqtarab/angles", angleSlug, "topics", "series"],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/muqtarab/angles/${angleSlug}/topics?limit=30`));
      if (!res.ok) throw new Error("Failed to fetch angle topics");
      return res.json();
    },
    enabled: !!angleSlug && !!topicData?.topic?.id,
  });

  // جلب مواضيع مميزة من زوايا أخرى في مُقترب
  const { data: featuredTopicsRaw } = useQuery<FeaturedTopicWithAngle[]>({
    queryKey: ["/api/muqtarab/topics/featured", "sidebar-discover"],
    queryFn: async () => {
      try {
        const res = await fetch(apiUrl("/api/muqtarab/topics/featured?limit=10"));
        if (!res.ok) return [];
        return await res.json();
      } catch {
        return [];
      }
    },
    enabled: !!topicData?.topic?.id,
    staleTime: 5 * 60 * 1000,
  });

  const topic = topicData?.topic;
  const angle = topicData?.angle;
  const writer = topicData?.writer ?? null;

  const canonicalUrl =
    angleSlug && topic?.slug
      ? `https://sabq.org/muqtarab/${angleSlug}/topic/${topic.slug}`
      : null;
  useCanonical(canonicalUrl);

  const angleTopics = useMemo(
    () => (Array.isArray(angleTopicsData?.topics) ? angleTopicsData.topics : []),
    [angleTopicsData?.topics],
  );

  const relatedTopics = useMemo(
    () => angleTopics.filter((t) => t.id !== topic?.id).slice(0, 5),
    [angleTopics, topic?.id],
  );

  // تحديد الموضوع السابق والتالي داخل نفس الزاوية
  const { previousTopic, nextTopic, topicPositionIndex } = useMemo(() => {
    if (!topic?.id || angleTopics.length < 2) {
      return { previousTopic: null, nextTopic: null, topicPositionIndex: -1 };
    }
    const idx = angleTopics.findIndex((t) => t.id === topic.id);
    if (idx === -1) {
      return { previousTopic: null, nextTopic: null, topicPositionIndex: -1 };
    }
    // angleTopics مرتبة من الأحدث (0) إلى الأقدم (n-1)
    return {
      nextTopic: idx > 0 ? angleTopics[idx - 1] : null, // أحدث منه
      previousTopic: idx < angleTopics.length - 1 ? angleTopics[idx + 1] : null, // أقدم منه
      topicPositionIndex: angleTopics.length - idx,
    };
  }, [angleTopics, topic?.id]);

  // مواضيع من زوايا أخرى لاكتشاف المُقترَب
  const otherAnglesTopics = useMemo(() => {
    const list = Array.isArray(featuredTopicsRaw) ? featuredTopicsRaw : [];
    return list
      .filter((t) => t.id !== topic?.id && t.angleId !== angle?.id && t.angle?.slug)
      .slice(0, 4);
  }, [featuredTopicsRaw, topic?.id, angle?.id]);

  const isTopicSaved = !!topic?.id && savedIds.includes(topic.id);

  const handleToggleSaveTopic = () => {
    if (!topic?.id) return;
    setSavedIds((prev) => {
      const exists = prev.includes(topic.id);
      const next = exists ? prev.filter((id) => id !== topic.id) : [topic.id, ...prev];
      try {
        window.localStorage.setItem(SAVED_TOPICS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      toast({
        title: exists ? "تمت الإزالة من المحفوظات" : "تم حفظ الموضوع",
        description: exists
          ? "أُزيل الموضوع من قائمة قراءتك في مُقترب."
          : "يمكنك العودة لقراءة هذا الموضوع في أي وقت.",
      });
      return next;
    });
  };

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
    const out: Array<{
      id: string;
      firstName?: string | null;
      lastName?: string | null;
      profileImageUrl?: string | null;
    }> = [];
    for (const c of comments) {
      const u = (c as any).user;
      if (u && !seen.has(u.id)) {
        seen.add(u.id);
        out.push({
          id: u.id,
          firstName: u.firstName,
          lastName: u.lastName,
          profileImageUrl: u.profileImageUrl,
        });
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
          error?.status === 401
            ? "يجب تسجيل الدخول لإضافة تعليق"
            : error?.message || "فشل في إضافة التعليق",
        variant: "destructive",
      });
    },
  });

  const handleComment = (content: string, parentId?: string) => {
    commentMutation.mutate({ content, parentId });
  };

  const handleLikeComment = async (commentId: string, nextLiked: boolean) => {
    await apiRequest(`/api/topic-comments/${commentId}/like`, {
      method: nextLiked ? "POST" : "DELETE",
    });
    queryClient.invalidateQueries({ queryKey: ["/api/muqtarab/topics", topic?.id, "comments"] });
    queryClient.invalidateQueries({
      queryKey: ["/api/muqtarab/topics", topic?.id, "comments", "my-likes"],
    });
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
          const start = el.offsetTop - 100;
          const end = el.offsetTop + el.offsetHeight - window.innerHeight * 0.65;
          const raw = (window.scrollY - start) / Math.max(1, end - start);
          const pct = Math.min(1, Math.max(0, raw));
          bar.style.transform = `scaleX(${pct})`;
          setReadingPct(Math.round(pct * 100));
        }
        setShowBackToTop(window.scrollY > 550);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [topic?.id]);

  // ---- أداة مشاركة ونسخ الاقتباس عند تحديد النص ----
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        setSelectedQuote(null);
        return;
      }
      const text = normalizeText(selection.toString());
      if (text.length < 15 || text.length > 320) {
        setSelectedQuote(null);
        return;
      }
      const container = articleRef.current;
      const anchorNode = selection.anchorNode;
      if (!container || !anchorNode || !container.contains(anchorNode)) {
        setSelectedQuote(null);
        return;
      }
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setSelectedQuote(null);
        return;
      }
      setSelectedQuote({
        text,
        top: Math.max(72, rect.top - 52),
        left: Math.min(window.innerWidth - 140, Math.max(140, rect.left + rect.width / 2)),
      });
    };

    document.addEventListener("mouseup", handleSelectionChange);
    document.addEventListener("keyup", handleSelectionChange);
    return () => {
      document.removeEventListener("mouseup", handleSelectionChange);
      document.removeEventListener("keyup", handleSelectionChange);
    };
  }, []);

  // ---- الاستماع للموجز الصوتي ----
  const [ttsState, setTtsState] = useState<TtsState>("idle");
  const [audioProvider, setAudioProvider] = useState<string | null>(null);
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

  useEffect(() => {
    stopTts();
    setTtsState("idle");
    setAudioProvider(null);
  }, [topic?.id, stopTts]);

  const handleListen = async () => {
    if (!topic?.excerpt) return;

    if (ttsState === "playing") {
      ttsAudioRef.current?.pause();
      setTtsState("paused");
      return;
    }
    if (ttsState === "paused" && ttsAudioRef.current) {
      await ttsAudioRef.current.play();
      setTtsState("playing");
      return;
    }
    if (ttsState === "loading") return;

    setTtsState("loading");
    try {
      const res = await fetch(apiUrl(`/api/muqtarab/topics/${topic.id}/summary-audio`));
      if (!res.ok) throw new Error("TTS failed");
      const providerHeader = res.headers.get("X-TTS-Provider")?.trim().toLowerCase() ?? null;
      const blob = await res.blob();
      stopTts();
      const url = URL.createObjectURL(blob);
      ttsUrlRef.current = url;
      const audio = new Audio(url);
      ttsAudioRef.current = audio;
      audio.onended = () => setTtsState("idle");
      audio.onerror = () => setTtsState("idle");
      await audio.play();
      setAudioProvider(providerHeader);
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

  // ---- المشاركة والاقتباس ----
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
        // المستخدم ألغى المشاركة
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

  const formatQuoteAttribution = useCallback(
    (quoteText: string) => {
      const by = writer?.name ? `— ${writer.name}` : "";
      const angleLabel = angle?.nameAr ? ` (زاوية ${angle.nameAr} | مُقترب)` : "";
      return `«${quoteText}»\n${by}${angleLabel}\n${window.location.href}`;
    },
    [writer?.name, angle?.nameAr],
  );

  const handleCopyQuote = async (quoteText: string) => {
    try {
      await navigator.clipboard.writeText(formatQuoteAttribution(quoteText));
      toast({
        title: "تم نسخ الاقتباس",
        description: "نسخنا الاقتباس مع اسم الكاتب والرابط.",
      });
      setSelectedQuote(null);
    } catch {
      toast({ title: "تعذر نسخ الاقتباس", variant: "destructive" });
    }
  };

  const handleShareQuoteOnX = (quoteText: string) => {
    const by = writer?.name ? ` — ${writer.name}` : "";
    const tweet = `«${quoteText}»${by}`;
    const url = `https://x.com/intent/tweet?text=${encodeURIComponent(tweet)}&url=${encodeURIComponent(window.location.href)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setSelectedQuote(null);
  };

  const handleShareQuoteOnWhatsApp = (quoteText: string) => {
    const url = `https://wa.me/?text=${encodeURIComponent(formatQuoteAttribution(quoteText))}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setSelectedQuote(null);
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

  // تجهيز المحتوى والفهرس والاقتباس البارز
  const displayContent = useMemo(
    () => (topic ? prepareTopicContent(topic) : null),
    [topic],
  );

  const { enrichedRawHtml, tocItems, standoutQuote, focusContentHtml } = useMemo(() => {
    if (!displayContent) {
      return {
        enrichedRawHtml: "",
        tocItems: [] as TocItem[],
        standoutQuote: null as string | null,
        focusContentHtml: "",
      };
    }

    if (displayContent.blocks && displayContent.blocks.length > 0) {
      const toc: TocItem[] = [];
      let hIdx = 0;
      let quote: string | null = null;
      const htmlParts: string[] = [];

      for (const b of displayContent.blocks) {
        if (b.type === "heading" && b.content) {
          const id = `topic-heading-${hIdx++}`;
          const lvl = Math.max(2, Math.min(4, b.level || 2));
          toc.push({ id, text: b.content, level: lvl });
          htmlParts.push(`<h${lvl} id="${id}">${b.content}</h${lvl}>`);
        } else if (b.type === "quote" && b.content) {
          if (!quote) quote = b.content;
          htmlParts.push(`<blockquote>${b.content}</blockquote>`);
        } else if (b.content) {
          htmlParts.push(`<p>${b.content}</p>`);
        }
      }

      return {
        enrichedRawHtml: "",
        tocItems: toc,
        standoutQuote: quote,
        focusContentHtml: htmlParts.join(""),
      };
    }

    if (displayContent.rawHtml) {
      const res = enrichHtmlAndExtractToc(displayContent.rawHtml);
      return {
        enrichedRawHtml: res.html,
        tocItems: res.toc,
        standoutQuote: res.standoutQuote,
        focusContentHtml: res.html,
      };
    }

    if (displayContent.plainText) {
      const paragraphs = displayContent.plainText
        .split(/\n+/)
        .map((p) => p.trim())
        .filter(Boolean);
      const html = paragraphs.map((p) => `<p>${DOMPurify.sanitize(p)}</p>`).join("");
      return {
        enrichedRawHtml: html,
        tocItems: [] as TocItem[],
        standoutQuote: null,
        focusContentHtml: html,
      };
    }

    return {
      enrichedRawHtml: "",
      tocItems: [] as TocItem[],
      standoutQuote: null,
      focusContentHtml: "",
    };
  }, [displayContent]);

  const publicationParts = useMemo(() => {
    if (!topic?.publishedAt) return null;
    const date = new Date(topic.publishedAt);
    if (Number.isNaN(date.getTime())) return null;
    const locale = "ar-SA-u-ca-gregory-nu-latn";
    return {
      iso: date.toISOString(),
      date: new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Asia/Riyadh",
      }).format(date),
      time: new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: "Asia/Riyadh",
      }).format(date),
      relative: formatArticleTimestamp(topic.publishedAt, { format: "relative", locale: "ar" }),
    };
  }, [topic?.publishedAt]);

  if (isLoadingTopic) {
    return (
      <div className="article-detail public-page min-h-screen bg-background flex flex-col" dir="rtl">
        <Header user={user} />
        <div className="border-b bg-muted/30">
          <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <main className="flex-1 container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="article-detail-layout">
            <div className="space-y-6">
              <Skeleton className="h-6 w-28 rounded-full" />
              <Skeleton className="h-12 w-5/6" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="w-full aspect-[16/9] rounded-2xl" />
              <Skeleton className="h-28 w-full rounded-2xl" />
              <div className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
            <div className="space-y-6">
              <Skeleton className="h-64 w-full rounded-2xl" />
              <Skeleton className="h-72 w-full rounded-2xl" />
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (topicError || !topic || !angle) {
    return (
      <div className="article-detail public-page min-h-screen bg-background flex flex-col" dir="rtl">
        <Header user={user} />
        <div className="border-b bg-muted/30">
          <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
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
        <main className="flex-1 container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
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

  const contentBlocks = displayContent?.blocks || [];
  const hasContent =
    contentBlocks.length > 0 || Boolean(enrichedRawHtml) || Boolean(displayContent?.plainText);
  const theme = angleTheme(angle.colorHex);
  const AngleIcon = getLucideIcon(angle.iconKey, Circle);
  const keywords =
    (topic.seoMeta as { keywords?: string[] } | null)?.keywords?.filter(Boolean) ?? [];
  const { words: wordCount, minutes: readingMinutes } = computeReadingMetrics(topic);
  const remainingMinutes = Math.max(1, Math.ceil(readingMinutes * (1 - readingPct / 100)));
  const viewCount = topic.viewCount ?? 0;
  const activeFontConfig = FONT_SIZE_CONFIG[fontSize];
  const shareUrl =
    canonicalUrl ||
    (typeof window !== "undefined" ? window.location.href : `https://sabq.org/muqtarab/${angleSlug}/topic/${topic.slug}`);

  const rootStyle: CSSProperties = {
    ...theme.vars,
    ["--article-brand" as any]: theme.color,
  };

  const readingSurfaceClass =
    surfaceMode === "warm"
      ? "bg-[#fbf8f1] dark:bg-card/40 border border-[#efe6d5] dark:border-border/60 rounded-2xl p-5 sm:p-8 shadow-sm transition-colors"
      : surfaceMode === "calm"
        ? "bg-[#f4f8fb] dark:bg-card/40 border border-[#e3ebf2] dark:border-border/60 rounded-2xl p-5 sm:p-8 shadow-sm transition-colors"
        : "transition-colors";

  let blockHeadingCounter = 0;

  return (
    <div
      className="article-detail muqtarab-topic-detail public-page relative min-h-screen bg-background flex flex-col"
      dir="rtl"
      style={rootStyle}
    >
      {/* شريط تقدم القراءة العلوي */}
      <div className="fixed inset-x-0 top-0 z-[60] h-1 bg-transparent" aria-hidden="true">
        <div
          ref={progressRef}
          className="h-full w-full origin-right transition-transform duration-150"
          style={{ background: theme.gradient, transform: "scaleX(0)" }}
          data-testid="reading-progress"
        />
      </div>

      {/* أداة مشاركة الاقتباس العائمة عند تحديد نص */}
      {selectedQuote && (
        <div
          className="fixed z-[70] -translate-x-1/2 flex items-center gap-1 rounded-full border border-border bg-popover/95 px-2.5 py-1 text-xs font-semibold text-popover-foreground shadow-xl backdrop-blur animate-in fade-in zoom-in-95 duration-150"
          style={{ top: `${selectedQuote.top}px`, left: `${selectedQuote.left}px` }}
          role="toolbar"
          aria-label="خيارات اقتباس النص المحدد"
          data-testid="quote-selection-toolbar"
        >
          <button
            type="button"
            onClick={() => handleCopyQuote(selectedQuote.text)}
            className="no-min-touch-size inline-flex h-7 items-center gap-1 rounded-full px-2.5 py-0.5 hover:bg-muted transition-colors"
            data-testid="button-copy-selected-quote"
          >
            <Quote className="h-3.5 w-3.5" style={{ color: theme.color }} />
            <span>نسخ الاقتباس</span>
          </button>
          <span className="h-3.5 w-px bg-border" aria-hidden="true" />
          <button
            type="button"
            onClick={() => handleShareQuoteOnX(selectedQuote.text)}
            className="no-min-touch-size inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-muted transition-colors"
            aria-label="مشاركة الاقتباس على X"
            data-testid="button-share-selected-quote-x"
          >
            <span>𝕏</span>
          </button>
          <button
            type="button"
            onClick={() => handleShareQuoteOnWhatsApp(selectedQuote.text)}
            className="no-min-touch-size inline-flex h-7 w-7 items-center justify-center rounded-full text-[#25D366] hover:bg-muted transition-colors"
            aria-label="مشاركة الاقتباس عبر واتساب"
            data-testid="button-share-selected-quote-whatsapp"
          >
            <MessageCircle className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* خط لوني علوي بهوية الزاوية */}
      <div className="h-1.5 w-full shrink-0" style={{ background: theme.gradient }} />

      <div className="relative z-10 flex flex-col flex-1">
        <Header user={user} />

        {/* مسار التنقل (Breadcrumbs) */}
        <div className="border-b bg-muted/30">
          <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 sm:py-3">
            <nav
              aria-label="مسار التنقل"
              className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted-foreground flex-wrap"
            >
              <Link href="/">
                <a className="hover:text-foreground transition-colors" data-testid="link-breadcrumb-home">
                  <Home className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </a>
              </Link>
              <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
              <Link href="/muqtarab">
                <a className="hover:text-foreground transition-colors" data-testid="link-breadcrumb-muqtarab">
                  مُقترب
                </a>
              </Link>
              <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
              <Link href={`/muqtarab/${angleSlug}`}>
                <a
                  className="font-medium transition-colors hover:text-[color:var(--angle)]"
                  data-testid="link-breadcrumb-angle"
                >
                  زاوية {angle.nameAr}
                </a>
              </Link>
              <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
              <span className="text-foreground line-clamp-1" data-testid="text-breadcrumb-topic">
                {topic.title}
              </span>
            </nav>
          </div>
        </div>

        <main className="article-detail-main flex-1 container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 md:py-10">
          <div className="article-detail-layout">
            {/* ==================== العمود الرئيسي للقراءة ==================== */}
            <article className="article-detail-content min-w-0">
              {/* ---- الترويسة التحريرية ---- */}
              <header className="article-detail-header">
                <div className="article-detail-labels flex flex-wrap items-center gap-2">
                  <Link href={`/muqtarab/${angleSlug}`}>
                    <a
                      className="inline-flex items-center gap-1.5 sm:gap-2 rounded-full px-3 py-1 sm:px-3.5 sm:py-1.5 text-xs sm:text-sm font-bold shadow-sm transition-transform hover:scale-[1.02]"
                      style={{ backgroundColor: theme.soft, color: theme.color }}
                      data-testid="chip-angle"
                    >
                      <AngleIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      زاوية {angle.nameAr}
                    </a>
                  </Link>

                  <Link href="/muqtarab">
                    <a className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
                      <Sparkles className="h-3.5 w-3.5" style={{ color: theme.color }} />
                      مُقترب
                    </a>
                  </Link>

                  {topicPositionIndex > 0 && angleTopics.length > 1 && (
                    <Badge
                      variant="outline"
                      className="rounded-full text-xs font-medium border-[color:var(--angle-border)] text-muted-foreground"
                      data-testid="badge-topic-sequence"
                    >
                      المقال #{formatNumber(topicPositionIndex)} في الزاوية
                    </Badge>
                  )}
                </div>

                <h1
                  className="article-detail-title mt-3 sm:mt-4"
                  style={{ textWrap: "balance" } as CSSProperties}
                  data-testid="heading-topic-title"
                >
                  {topic.title}
                </h1>

                {/* الكاتب + بيانات النشر والقراءة */}
                <div className="article-detail-byline">
                  <WriterByline writer={writer} angleName={angle.nameAr} />

                  <div className="article-detail-metadata">
                    {publicationParts && (
                      <div className="article-publication-row">
                        <Calendar aria-hidden="true" />
                        <time
                          dateTime={publicationParts.iso}
                          title={publicationParts.relative}
                          data-testid="text-published-date"
                        >
                          <span>{publicationParts.date}</span>
                          <span className="article-publication-time">{publicationParts.time}</span>
                        </time>
                      </div>
                    )}

                    <div className="article-reading-meta flex items-center gap-3 flex-wrap">
                      <span data-testid="text-reading-time">
                        <Clock aria-hidden="true" />
                        {readingMinutes} {readingMinutes === 1 ? "دقيقة" : "دقائق"} قراءة
                      </span>
                      {wordCount > 0 && (
                        <span className="text-muted-foreground/85" data-testid="text-word-count">
                          · {formatNumber(wordCount)} كلمة
                        </span>
                      )}
                      {viewCount > 0 && (
                        <span data-testid="text-view-count">
                          <Eye aria-hidden="true" />
                          {formatNumber(viewCount)} مشاهدة
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* ---- شريط أدوات تجربة القارئ والمشاركة السريعة (مدمج ومنظم للهواتف وسطح المكتب) ---- */}
                <div
                  className="mt-3.5 rounded-xl sm:rounded-2xl border border-border/70 bg-muted/25 p-2 sm:px-3.5 sm:py-2.5 space-y-1.5 lg:space-y-0 lg:flex lg:items-center lg:justify-between lg:gap-3"
                  data-testid="reader-experience-toolbar"
                >
                  {/* الصف الأول: أدوات القراءة (حجم الخط + لون الخلفية + الحفظ + وضع التركيز) */}
                  <div className="flex items-center justify-between lg:justify-start gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar">
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* التحكم بحجم الخط */}
                      <div
                        className="inline-flex items-center rounded-lg border border-border/80 bg-background p-0.5 shadow-2xs shrink-0"
                        role="group"
                        aria-label="التحكم بحجم الخط"
                        data-testid="control-font-size"
                      >
                        <button
                          type="button"
                          onClick={() => stepFontSize(-1)}
                          disabled={fontSize === "sm"}
                          className="no-min-touch-size inline-flex h-7 w-7 items-center justify-center rounded-md text-[11px] font-bold text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
                          title="تصغير الخط"
                          aria-label="تصغير الخط"
                          data-testid="button-font-decrease"
                        >
                          A-
                        </button>
                        <span
                          className="px-1.5 text-[11px] font-semibold text-muted-foreground select-none flex items-center gap-1"
                          data-testid="text-font-size-label"
                        >
                          <Type className="h-3 w-3 shrink-0" style={{ color: theme.color }} />
                          <span className="hidden sm:inline">{activeFontConfig.label}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => stepFontSize(1)}
                          disabled={fontSize === "xl"}
                          className="no-min-touch-size inline-flex h-7 w-7 items-center justify-center rounded-md text-[11px] font-bold text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
                          title="تكبير الخط"
                          aria-label="تكبير الخط"
                          data-testid="button-font-increase"
                        >
                          A+
                        </button>
                      </div>

                      {/* نمط خلفية القراءة (أبيض / ورقي دافئ / هادئ) — متاح على الجوال وسطح المكتب */}
                      <div
                        className="inline-flex items-center gap-0.5 rounded-lg border border-border/80 bg-background p-0.5 shadow-2xs shrink-0"
                        role="group"
                        aria-label="خلفية القراءة"
                        data-testid="control-reading-surface"
                      >
                        {(
                          [
                            { id: "default", label: "أبيض", swatch: "bg-white border-border" },
                            { id: "warm", label: "ورقي", swatch: "bg-[#fbf8f1] border-[#e2d5be]" },
                            { id: "calm", label: "هادئ", swatch: "bg-[#f4f8fb] border-[#cbd9e4]" },
                          ] as const
                        ).map((mode) => (
                          <button
                            key={mode.id}
                            type="button"
                            onClick={() => setSurfaceMode(mode.id)}
                            aria-pressed={surfaceMode === mode.id}
                            className={`no-min-touch-size inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] sm:text-xs font-medium transition-colors shrink-0 ${
                              surfaceMode === mode.id
                                ? "bg-[color:var(--angle-soft)] text-[color:var(--angle)] font-bold"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                            data-testid={`button-surface-${mode.id}`}
                          >
                            <span className={`h-2.5 w-2.5 rounded-full border shrink-0 ${mode.swatch}`} />
                            <span>{mode.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* حفظ الموضوع */}
                      <Button
                        variant={isTopicSaved ? "default" : "outline"}
                        size="sm"
                        onClick={handleToggleSaveTopic}
                        aria-pressed={isTopicSaved}
                        className={`no-min-touch-size h-7 sm:h-8 px-2 sm:px-2.5 rounded-lg gap-1 text-[11px] sm:text-xs font-semibold shrink-0 ${
                          isTopicSaved
                            ? ""
                            : "bg-background hover:bg-[color:var(--angle-soft)] hover:text-[color:var(--angle)]"
                        }`}
                        style={isTopicSaved ? { backgroundColor: theme.color, color: "#fff" } : undefined}
                        data-testid="button-save-topic"
                      >
                        <Bookmark className={`h-3.5 w-3.5 shrink-0 ${isTopicSaved ? "fill-current" : ""}`} />
                        <span>{isTopicSaved ? "محفوظ" : "حفظ"}</span>
                      </Button>

                      {/* وضع القراءة المركّزة */}
                      <FocusReaderTrigger
                        language="ar"
                        onClick={() => setFocusOpen(true)}
                        className="no-min-touch-size h-7 sm:h-8 px-2 sm:px-2.5 rounded-lg border-border/80 bg-background text-[11px] sm:text-xs font-semibold hover:bg-[color:var(--angle-soft)] hover:text-[color:var(--angle)] shrink-0"
                      />
                    </div>
                  </div>

                  {/* الصف الثاني على الجوال / الطرف الأيسر على الشاشات الكبيرة: أزرار المشاركة السريعة العلوية */}
                  <div className="flex items-center justify-between lg:justify-end gap-1.5 border-t border-border/50 pt-1.5 lg:border-t-0 lg:pt-0 shrink-0">
                    <span className="text-[11px] font-semibold text-muted-foreground lg:hidden">
                      مشاركة سريعة
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleShare}
                        className="no-min-touch-size h-7 sm:h-8 px-2.5 rounded-lg gap-1 border-[color:var(--angle-border)] bg-background text-[11px] sm:text-xs font-semibold text-[color:var(--angle)] hover:bg-[color:var(--angle-soft)] hover:text-[color:var(--angle)]"
                        data-testid="button-share"
                      >
                        <Share2 className="h-3.5 w-3.5 shrink-0" />
                        مشاركة
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={shareOnX}
                        className="no-min-touch-size h-7 w-7 sm:h-8 sm:w-8 p-0 rounded-lg bg-background"
                        aria-label="مشاركة على X"
                        data-testid="button-share-x"
                      >
                        <span className="text-xs sm:text-sm font-bold leading-none" aria-hidden="true">
                          𝕏
                        </span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={shareOnWhatsApp}
                        className="no-min-touch-size h-7 w-7 sm:h-8 sm:w-8 p-0 rounded-lg bg-background text-[#25D366] hover:text-[#25D366]"
                        aria-label="مشاركة عبر واتساب"
                        data-testid="button-share-whatsapp"
                      >
                        <MessageCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopyLink}
                        className="no-min-touch-size h-7 w-7 sm:h-8 sm:w-8 p-0 rounded-lg bg-background"
                        aria-label="نسخ الرابط"
                        data-testid="button-copy-link"
                      >
                        {copied ? (
                          <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </header>

              {/* ---- الصورة البارزة ---- */}
              {topic.heroImageUrl && (
                <div
                  className="article-detail-hero overflow-hidden rounded-2xl shadow-md"
                  data-testid="section-featured-image"
                >
                  <ImageWithCaption
                    imageUrl={topic.heroImageUrl}
                    altText={topic.title}
                    priority
                  />
                </div>
              )}

              {/* ---- الموجز الذكي + الاستماع الصوتي ---- */}
              {topic.excerpt && (
                <div data-testid="section-excerpt">
                  <div className="sr-only" data-testid="text-excerpt">
                    {topic.excerpt}
                  </div>
                  <button
                    type="button"
                    onClick={handleListen}
                    className="sr-only"
                    data-testid="button-listen-excerpt"
                  >
                    استمع للموجز
                  </button>
                  <ArticleSummary
                    key={topic.id}
                    text={topic.excerpt}
                    audioProvider={audioProvider}
                    isLoadingAudio={ttsState === "loading"}
                    isPlaying={ttsState === "playing"}
                    onPlayAudio={handleListen}
                  />
                </div>
              )}

              {/* ---- فهرس محاور الموضوع (يظهر تلقائياً عند وجود عناوين فرعية) ---- */}
              {tocItems.length >= 2 && (
                <nav
                  aria-label="محاور الموضوع"
                  className="rounded-2xl border border-[color:var(--angle-border)] bg-[color:var(--angle-soft)]/35 p-3.5 sm:p-5"
                  data-testid="section-topic-toc"
                >
                  <button
                    type="button"
                    onClick={() => setTocOpen((v) => !v)}
                    className="no-min-touch-size flex w-full items-center justify-between gap-2 text-right"
                    aria-expanded={tocOpen}
                    data-testid="button-toggle-toc"
                  >
                    <span className="flex items-center gap-2 font-bold text-sm sm:text-base text-foreground">
                      <span
                        className="flex h-7 w-7 items-center justify-center rounded-lg"
                        style={{ backgroundColor: theme.soft, color: theme.color }}
                      >
                        <List className="h-4 w-4" />
                      </span>
                      محاور الموضوع
                      <Badge
                        variant="secondary"
                        className="text-xs"
                        style={{ backgroundColor: theme.soft, color: theme.color }}
                      >
                        {formatNumber(tocItems.length)}
                      </Badge>
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                        tocOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {tocOpen && (
                    <ol className="mt-3 grid gap-1.5 sm:gap-2 sm:grid-cols-2 pt-3 border-t border-border/60">
                      {tocItems.map((item, idx) => (
                        <li key={item.id}>
                          <a
                            href={`#${item.id}`}
                            onClick={(e) => {
                              e.preventDefault();
                              document
                                .getElementById(item.id)
                                ?.scrollIntoView({ behavior: "smooth", block: "start" });
                            }}
                            className="no-min-touch-size group flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm text-foreground/90 hover:bg-background/80 hover:text-[color:var(--angle)] transition-colors"
                            data-testid={`link-toc-${idx}`}
                          >
                            <span
                              className="flex h-5 w-5 sm:h-6 sm:w-6 shrink-0 items-center justify-center rounded-full text-[11px] sm:text-xs font-bold tabular-nums"
                              style={{ backgroundColor: theme.soft, color: theme.color }}
                            >
                              {formatNumber(idx + 1)}
                            </span>
                            <span className="line-clamp-1 font-medium">{item.text}</span>
                          </a>
                        </li>
                      ))}
                    </ol>
                  )}
                </nav>
              )}

              {/* ---- نص الموضوع الرئيسي ---- */}
              <div ref={articleRef} className={readingSurfaceClass}>
                <div
                  className="article-prose muqtarab-prose prose prose-lg dark:prose-invert max-w-none"
                  style={
                    {
                      fontSize: activeFontConfig.fontSize,
                      lineHeight: activeFontConfig.lineHeight,
                    } as CSSProperties
                  }
                  data-testid="section-content"
                >
                  {contentBlocks.length > 0 ? (
                    contentBlocks.map((block, index) => {
                      const anchorId =
                        block.type === "heading" && block.content
                          ? `topic-heading-${blockHeadingCounter++}`
                          : undefined;
                      return renderContentBlock(block, index, anchorId);
                    })
                  ) : enrichedRawHtml ? (
                    <div
                      dangerouslySetInnerHTML={{ __html: enrichedRawHtml }}
                      data-testid="content-raw-html"
                    />
                  ) : displayContent?.plainText ? (
                    <p data-testid="content-plain-text">{displayContent.plainText}</p>
                  ) : (
                    !hasContent && (
                      <p
                        className="text-muted-foreground text-center py-12"
                        data-testid="text-no-content"
                      >
                        لا يوجد محتوى متاح لهذا الموضوع
                      </p>
                    )
                  )}
                </div>

                {/* تلميح التحديد السريع للاقتباس */}
                {hasContent && (
                  <p className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Quote className="h-3.5 w-3.5 shrink-0" style={{ color: theme.color }} />
                    <span>تلميح للقارئ: حدّد أي جملة في المقال لنسخها أو مشاركتها كاقتباس مباشر.</span>
                  </p>
                )}
              </div>

              {/* ---- بطاقة أبرز اقتباس من الموضوع (قابلة للمشاركة بنقرة) ---- */}
              {standoutQuote && (
                <section
                  className="relative overflow-hidden rounded-2xl border p-4 sm:p-7"
                  style={{
                    backgroundColor: theme.softer,
                    borderColor: theme.border,
                  }}
                  aria-label="اقتباس مميز من الموضوع"
                  data-testid="section-standout-quote"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-xl"
                        style={{ backgroundColor: theme.soft, color: theme.color }}
                      >
                        <Quote className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </span>
                      <span className="text-xs font-bold" style={{ color: theme.color }}>
                        اقتباس من الزاوية
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyQuote(standoutQuote)}
                        className="no-min-touch-size h-7 sm:h-8 px-2.5 gap-1.5 text-xs font-semibold hover:bg-[color:var(--angle-soft)]"
                        style={{ color: theme.color }}
                        data-testid="button-copy-standout-quote"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        نسخ الاقتباس
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleShareQuoteOnX(standoutQuote)}
                        className="no-min-touch-size h-7 sm:h-8 px-2.5 text-xs font-bold hover:bg-[color:var(--angle-soft)]"
                        style={{ color: theme.color }}
                        aria-label="مشاركة الاقتباس على X"
                        data-testid="button-share-standout-quote-x"
                      >
                        𝕏
                      </Button>
                    </div>
                  </div>

                  <blockquote className="mt-3 text-base sm:text-xl font-bold leading-relaxed text-foreground">
                    «{standoutQuote}»
                  </blockquote>

                  {writer && (
                    <p className="mt-2 text-xs font-medium text-muted-foreground">
                      — {writer.name} · زاوية {angle.nameAr}
                    </p>
                  )}
                </section>
              )}

              {/* ---- الكلمات المفتاحية ---- */}
              {keywords.length > 0 && (
                <section className="article-detail-keywords" data-testid="section-keywords">
                  <h3 className="text-sm font-semibold text-muted-foreground">الكلمات المفتاحية</h3>
                  <div className="flex flex-wrap gap-2">
                    {keywords.map((keyword, index) => (
                      <Badge
                        key={`${keyword}-${index}`}
                        variant="secondary"
                        className="article-keyword cursor-pointer transition-colors hover:bg-[color:var(--angle-soft)] hover:text-[color:var(--angle)]"
                        onClick={() => setLocation(`/keyword/${encodeURIComponent(keyword)}`)}
                        data-testid={`badge-keyword-${index}`}
                      >
                        #{keyword}
                      </Badge>
                    ))}
                  </div>
                </section>
              )}

              {/* ---- شريط المشاركة والتفاعل السفلي ---- */}
              <div className="article-detail-toolbar article-bottom-share" data-testid="topic-bottom-actions">
                <div className="article-detail-toolbar-row">
                  <div className="article-share-group">
                    <span className="article-share-label">شارك الموضوع:</span>
                    <SocialShareBar
                      title={`${topic.title} — زاوية ${angle.nameAr}`}
                      url={shareUrl}
                      copyUrl={shareUrl}
                      description={topic.excerpt || ""}
                      articleId={topic.id}
                      className="article-social-links"
                    />
                  </div>

                  <div className="article-engagement-actions flex flex-wrap items-center gap-2">
                    <Button
                      variant={isTopicSaved ? "default" : "outline"}
                      size="sm"
                      onClick={handleToggleSaveTopic}
                      aria-pressed={isTopicSaved}
                      className="no-min-touch-size article-action h-9 gap-1.5 text-xs sm:text-sm"
                      data-testid="button-bottom-save-topic"
                    >
                      <Bookmark className={`h-4 w-4 ${isTopicSaved ? "fill-current" : ""}`} />
                      <span>{isTopicSaved ? "محفوظ في قائمتي" : "حفظ للقراءة"}</span>
                    </Button>

                    <FocusReaderTrigger
                      language="ar"
                      className="no-min-touch-size article-action h-9 text-xs sm:text-sm"
                      onClick={() => setFocusOpen(true)}
                    />
                  </div>
                </div>
              </div>

              {/* ---- بطاقة الكاتب وتوقيع الزاوية ---- */}
              {(writer || angle.writerSignature) && (
                <section
                  className="rounded-2xl border p-4 sm:p-7"
                  style={{ backgroundColor: theme.softer, borderColor: theme.border }}
                  aria-label="عن كاتب الزاوية"
                  data-testid="writer-signature"
                >
                  <div className="flex flex-col sm:flex-row items-start gap-3.5 sm:gap-4">
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      {writer ? (
                        writer.id ? (
                          <Link href={`/muqtarab/writer/${writer.id}`}>
                            <Avatar className="h-12 w-12 sm:h-16 sm:w-16 shrink-0 cursor-pointer ring-2 ring-[color:var(--angle-border)] ring-offset-2 ring-offset-background">
                              {writer.avatar && (
                                <AvatarImage
                                  src={writer.avatar}
                                  alt={writer.name}
                                  className="object-cover"
                                />
                              )}
                              <AvatarFallback
                                className="text-lg sm:text-xl font-bold"
                                style={{ backgroundColor: theme.soft, color: theme.color }}
                              >
                                {writer.name.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                          </Link>
                        ) : (
                          <Avatar className="h-12 w-12 sm:h-16 sm:w-16 shrink-0 ring-2 ring-[color:var(--angle-border)]">
                            {writer.avatar && (
                              <AvatarImage
                                src={writer.avatar}
                                alt={writer.name}
                                className="object-cover"
                              />
                            )}
                            <AvatarFallback
                              className="text-lg sm:text-xl font-bold"
                              style={{ backgroundColor: theme.soft, color: theme.color }}
                            >
                              {writer.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                        )
                      ) : (
                        <span
                          className="flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-full"
                          style={{ backgroundColor: theme.soft, color: theme.color }}
                        >
                          <User className="h-5 w-5" />
                        </span>
                      )}

                      <div className="sm:hidden min-w-0 flex-1">
                        <p className="text-[11px] font-bold" style={{ color: theme.color }}>
                          كاتب زاوية {angle.nameAr}
                        </p>
                        {writer && (
                          <h3 className="text-base font-bold text-foreground truncate">
                            {writer.id ? (
                              <Link href={`/muqtarab/writer/${writer.id}`}>
                                <a className="no-min-touch-size hover:text-[color:var(--angle)] transition-colors">
                                  {writer.name}
                                </a>
                              </Link>
                            ) : (
                              writer.name
                            )}
                          </h3>
                        )}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0 space-y-2.5 w-full">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="hidden sm:block">
                          <p className="text-xs font-bold" style={{ color: theme.color }}>
                            كاتب زاوية {angle.nameAr}
                          </p>
                          {writer && (
                            <h3 className="text-lg font-bold text-foreground">
                              {writer.id ? (
                                <Link href={`/muqtarab/writer/${writer.id}`}>
                                  <a className="no-min-touch-size hover:text-[color:var(--angle)] transition-colors">
                                    {writer.name}
                                  </a>
                                </Link>
                              ) : (
                                writer.name
                              )}
                            </h3>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {writer?.id && (
                            <Button
                              variant="outline"
                              size="sm"
                              asChild
                              className="no-min-touch-size h-8 px-3 text-xs rounded-xl border-[color:var(--angle-border)]"
                              data-testid="button-writer-profile"
                            >
                              <Link href={`/muqtarab/writer/${writer.id}`}>
                                <a className="no-min-touch-size">صفحة الكاتب</a>
                              </Link>
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            asChild
                            className="no-min-touch-size h-8 px-3 text-xs rounded-xl border-[color:var(--angle-border)] text-[color:var(--angle)] hover:bg-[color:var(--angle-soft)]"
                            data-testid="button-angle-archive"
                          >
                            <Link href={`/muqtarab/${angleSlug}`}>
                              <a className="no-min-touch-size">أرشيف زاوية {angle.nameAr}</a>
                            </Link>
                          </Button>
                        </div>
                      </div>

                      {writer?.bio && (
                        <p
                          className="text-xs sm:text-sm leading-relaxed text-muted-foreground"
                          data-testid="text-writer-bio"
                        >
                          {renderTextWithLinks(writer.bio, theme.color)}
                        </p>
                      )}

                      {angle.writerSignature &&
                        normalizeText(angle.writerSignature) !== normalizeText(writer?.bio || "") && (
                          <div className="pt-2 border-t border-border/60">
                            <p className="text-xs font-semibold mb-0.5" style={{ color: theme.color }}>
                              توقيع الكاتب
                            </p>
                            <p className="text-xs sm:text-sm font-medium leading-relaxed whitespace-pre-wrap text-foreground/90">
                              {renderTextWithLinks(angle.writerSignature, theme.color)}
                            </p>
                          </div>
                        )}
                    </div>
                  </div>
                </section>
              )}

              {/* ---- التنقل المتسلسل بين مواضيع الزاوية (السابق / التالي) ---- */}
              {(previousTopic || nextTopic) && (
                <nav
                  aria-label="التنقل بين مواضيع الزاوية"
                  className="grid gap-3 sm:gap-4 sm:grid-cols-2"
                  data-testid="nav-angle-sequence"
                >
                  {nextTopic ? (
                    <Link href={`/muqtarab/${angleSlug}/topic/${nextTopic.slug}`}>
                      <a
                        className="group flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-3.5 sm:p-4 transition-all hover:border-[color:var(--angle-border)] hover:shadow-md"
                        data-testid="link-next-topic"
                      >
                        <span className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground group-hover:text-[color:var(--angle)]">
                          <ArrowRight className="h-3.5 w-3.5" />
                          الموضوع الأحدث في {angle.nameAr}
                        </span>
                        <p className="mt-1.5 sm:mt-2 font-bold text-sm sm:text-base text-foreground group-hover:text-[color:var(--angle)] line-clamp-2">
                          {nextTopic.title}
                        </p>
                      </a>
                    </Link>
                  ) : (
                    <div className="hidden sm:block" />
                  )}

                  {previousTopic ? (
                    <Link href={`/muqtarab/${angleSlug}/topic/${previousTopic.slug}`}>
                      <a
                        className="group flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-3.5 sm:p-4 text-left sm:text-right transition-all hover:border-[color:var(--angle-border)] hover:shadow-md"
                        data-testid="link-previous-topic"
                      >
                        <span className="flex items-center justify-end sm:justify-start gap-1.5 text-xs font-bold text-muted-foreground group-hover:text-[color:var(--angle)]">
                          <span>الموضوع السابق في {angle.nameAr}</span>
                          <ArrowLeft className="h-3.5 w-3.5" />
                        </span>
                        <p className="mt-1.5 sm:mt-2 font-bold text-sm sm:text-base text-foreground group-hover:text-[color:var(--angle)] line-clamp-2">
                          {previousTopic.title}
                        </p>
                      </a>
                    </Link>
                  ) : null}
                </nav>
              )}

              {/* ---- النقاش / التعليقات ---- */}
              <div className="space-y-6 pt-2">
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

              <Separator />

              <div className="flex items-center justify-between gap-3 flex-wrap pb-2">
                <Button
                  variant="ghost"
                  asChild
                  className="no-min-touch-size h-9 gap-2 text-xs sm:text-sm text-[color:var(--angle)] hover:text-[color:var(--angle)] hover:bg-[color:var(--angle-soft)]"
                  data-testid="button-back-to-angle"
                >
                  <Link href={`/muqtarab/${angleSlug}`}>
                    <a className="no-min-touch-size flex items-center gap-2">
                      <ArrowRight className="h-4 w-4" />
                      العودة إلى زاوية {angle.nameAr}
                    </a>
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  asChild
                  className="no-min-touch-size h-9 gap-2 text-xs sm:text-sm"
                  data-testid="button-explore-angles"
                >
                  <Link href="/muqtarab">
                    <a className="no-min-touch-size">استكشف المزيد من الزوايا</a>
                  </Link>
                </Button>
              </div>
            </article>

            {/* ==================== القائمة الجانبية (Sidebar) ==================== */}
            <aside className="article-detail-sidebar" aria-label="بطاقة الزاوية ومواضيع ذات صلة">
              {/* 1. بطاقة تعريف الزاوية */}
              <section
                className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs"
                aria-label={`عن زاوية ${angle.nameAr}`}
                data-testid="sidebar-angle-card"
              >
                <div
                  className="relative p-5 text-white"
                  style={{ background: theme.gradient }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
                      style={{
                        backgroundColor: "rgba(255,255,255,0.2)",
                        backdropFilter: "blur(8px)",
                      }}
                    >
                      <AngleIcon className="h-6 w-6 text-white" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-medium text-white/80">زاوية في مُقترب</span>
                      <h2 className="text-xl font-bold leading-snug truncate">{angle.nameAr}</h2>
                    </div>
                  </div>
                </div>

                <div className="p-5 space-y-4">
                  {angle.shortDesc && (
                    <p
                      className="text-sm leading-relaxed text-muted-foreground"
                      data-testid="sidebar-angle-description"
                    >
                      {angle.shortDesc}
                    </p>
                  )}

                  {angleTopics.length > 0 && (
                    <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border/60 pt-3">
                      <span className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" style={{ color: theme.color }} />
                        مواضيع منشورة في الزاوية
                      </span>
                      <span className="font-bold text-foreground">
                        {formatNumber(angleTopics.length)} موضوع
                      </span>
                    </div>
                  )}

                  <Button
                    asChild
                    className="w-full gap-2 rounded-xl text-white shadow-xs hover:opacity-95"
                    style={{ backgroundColor: theme.color }}
                    data-testid="sidebar-button-visit-angle"
                  >
                    <Link href={`/muqtarab/${angleSlug}`}>
                      <a className="flex items-center justify-center gap-2">
                        <span>تصفّح جميع مواضيع {angle.nameAr}</span>
                        <ArrowLeft className="h-4 w-4" />
                      </a>
                    </Link>
                  </Button>
                </div>
              </section>

              {/* 2. المزيد من نفس الزاوية */}
              {relatedTopics.length > 0 && (
                <section
                  className="article-sidebar-module"
                  data-testid="section-related-topics"
                  aria-label={`المزيد من ${angle.nameAr}`}
                >
                  <div className="article-sidebar-heading">
                    <h2>
                      <span
                        className="article-sidebar-heading-icon"
                        style={{ backgroundColor: theme.soft, color: theme.color }}
                      >
                        <AngleIcon className="h-5 w-5" />
                      </span>
                      <span>المزيد من {angle.nameAr}</span>
                    </h2>
                    <div className="article-sidebar-heading-description">
                      <span>مقالات أخرى للكاتب في نفس الزاوية</span>
                    </div>
                  </div>

                  <div className="divide-y divide-border/60">
                    {relatedTopics.map((related, idx) => (
                      <Link
                        key={related.id}
                        href={`/muqtarab/${angleSlug}/topic/${related.slug}`}
                      >
                        <a
                          className="group flex items-start gap-3 py-3.5 first:pt-0 last:pb-0 transition-colors"
                          data-testid={`card-related-topic-${idx}`}
                        >
                          {related.heroImageUrl ? (
                            <img
                              src={related.heroImageUrl}
                              alt={related.title}
                              loading="lazy"
                              className="h-16 w-20 shrink-0 rounded-xl object-cover border border-border/60"
                            />
                          ) : (
                            <span
                              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-bold tabular-nums"
                              style={{ backgroundColor: theme.soft, color: theme.color }}
                              aria-hidden="true"
                            >
                              {formatNumber(idx + 1)}
                            </span>
                          )}

                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-bold leading-snug text-foreground group-hover:text-[color:var(--angle)] transition-colors line-clamp-2">
                              {related.title}
                            </h3>
                            <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                              {related.publishedAt && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {formatDate(related.publishedAt)}
                                </span>
                              )}
                              {(related.viewCount ?? 0) > 0 && (
                                <span className="flex items-center gap-1">
                                  <Eye className="h-3 w-3" />
                                  {formatNumber(related.viewCount ?? 0)}
                                </span>
                              )}
                            </div>
                          </div>
                        </a>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {/* 3. استكشف مواضيع من زوايا أخرى في مُقترب */}
              {otherAnglesTopics.length > 0 && (
                <section
                  className="article-sidebar-module"
                  data-testid="section-discover-muqtarab"
                  aria-label="مختارات من زوايا مُقترب"
                >
                  <div className="article-sidebar-heading">
                    <h2>
                      <span className="article-sidebar-heading-icon">
                        <BookOpen className="h-5 w-5" />
                      </span>
                      <span>مختارات من مُقترب</span>
                    </h2>
                    <div className="article-sidebar-heading-description">
                      <span>أحدث ما نُشر في الزوايا الأخرى</span>
                      <Link href="/muqtarab">
                        <a>كل الزوايا</a>
                      </Link>
                    </div>
                  </div>

                  <div className="divide-y divide-border/60">
                    {otherAnglesTopics.map((item) => {
                      const itemAngleColor = item.angle?.colorHex || "#6366f1";
                      const ItemIcon = getLucideIcon(item.angle?.iconKey, Sparkles);
                      return (
                        <Link
                          key={item.id}
                          href={`/muqtarab/${item.angle?.slug || "general"}/topic/${item.slug}`}
                        >
                          <a
                            className="group flex items-start gap-3 py-3.5 first:pt-0 last:pb-0"
                            data-testid={`discover-topic-${item.id}`}
                          >
                            {item.heroImageUrl ? (
                              <img
                                src={item.heroImageUrl}
                                alt={item.title}
                                loading="lazy"
                                className="h-16 w-20 shrink-0 rounded-xl object-cover border border-border/60"
                              />
                            ) : (
                              <span
                                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
                                style={{
                                  backgroundColor: `${itemAngleColor}1f`,
                                  color: itemAngleColor,
                                }}
                              >
                                <ItemIcon className="h-5 w-5" />
                              </span>
                            )}
                            <div className="min-w-0 flex-1">
                              {item.angle?.nameAr && (
                                <span
                                  className="inline-block text-[11px] font-bold mb-0.5"
                                  style={{ color: itemAngleColor }}
                                >
                                  زاوية {item.angle.nameAr}
                                </span>
                              )}
                              <h3 className="text-sm font-bold leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-2">
                                {item.title}
                              </h3>
                              {item.publishedAt && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {formatDate(item.publishedAt)}
                                </p>
                              )}
                            </div>
                          </a>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              )}
            </aside>
          </div>

          {/* نافذة القراءة المركّزة (Focus Mode) */}
          <FocusReader
            open={focusOpen}
            onClose={() => setFocusOpen(false)}
            articleId={topic.id}
            language="ar"
            isLoggedIn={!!user}
            title={topic.title}
            subtitle={topic.excerpt || null}
            contentHtml={focusContentHtml}
            authorName={writer?.name || null}
            publishedAt={topic.publishedAt}
            articleSlug={topic.slug}
            articleImageUrl={topic.heroImageUrl}
            categoryName={`زاوية ${angle.nameAr}`}
          />
        </main>

        <Footer />
      </div>

      {/* شريط عائم سفلي يوضح تقدم القراءة + زر العودة للأعلى (في اليمين لتجنب التداخل مع زر الصعود العام في اليسار) */}
      <div
        className={`fixed bottom-5 right-4 sm:bottom-6 sm:right-6 z-40 flex items-center gap-1.5 transition-all duration-300 ${
          showBackToTop ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 translate-y-3"
        }`}
      >
        {readingPct > 0 && readingPct < 100 && (
          <div
            className="flex items-center gap-1.5 rounded-full border bg-background/95 px-3 py-1.5 text-[11px] sm:text-xs font-semibold shadow-lg backdrop-blur"
            style={{ borderColor: theme.border }}
            data-testid="floating-reading-status"
          >
            <span className="tabular-nums font-bold" style={{ color: theme.color }}>
              {formatNumber(readingPct)}%
            </span>
            <span className="text-muted-foreground">
              · متبقي {formatNumber(remainingMinutes)} د
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="no-min-touch-size hidden sm:flex h-9 w-9 items-center justify-center rounded-full border bg-background/95 shadow-lg backdrop-blur transition-transform duration-300 hover:scale-105"
          style={{ borderColor: theme.border, color: theme.color }}
          aria-label="العودة إلى الأعلى"
          data-testid="button-back-to-top"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
