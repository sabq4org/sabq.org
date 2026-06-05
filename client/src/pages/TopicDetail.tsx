import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import DOMPurify from "isomorphic-dompurify";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ImageWithCaption } from "@/components/ImageWithCaption";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowRight,
  ChevronRight,
  Share2,
  Calendar,
  Home,
  Circle,
  User,
  Sparkles,
} from "lucide-react";
import { getLucideIcon } from "@/lib/lucideIconMap";
import { angleTheme } from "@/lib/angleTheme";
import type { Topic, Angle } from "@shared/schema";

type AngleWriter = {
  name: string;
  avatar: string | null;
  slug: string | null;
};

type TopicDetailResponse = {
  topic: Topic;
  angle: Angle;
  writer: AngleWriter | null;
};

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleDateString("ar-SA-u-ca-gregory", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

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

function WriterByline({
  writer,
  angleName,
}: {
  writer: AngleWriter | null;
  angleName: string;
}) {
  if (!writer) return null;

  const avatar = (
    <Avatar className="h-12 w-12 shrink-0">
      {writer.avatar && (
        <AvatarImage src={writer.avatar} alt={writer.name} className="object-cover" />
      )}
      <AvatarFallback className="bg-[color:var(--angle-soft)] text-[color:var(--angle)] text-sm font-bold">
        {writer.name.charAt(0)}
      </AvatarFallback>
    </Avatar>
  );

  const nameEl = writer.slug ? (
    <Link href={`/reporter/${writer.slug}`}>
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
    <div className="flex items-center gap-3 mt-4" data-testid="writer-byline">
      {writer.slug ? <Link href={`/reporter/${writer.slug}`}>{avatar}</Link> : avatar}
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
          className="border-r-4 border-[color:var(--angle,#6366f1)] pr-5 my-8 italic text-lg text-muted-foreground leading-relaxed"
          data-testid={`content-quote-${index}`}
        >
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

export default function TopicDetail() {
  const { angleSlug, topicSlug } = useParams<{ angleSlug: string; topicSlug: string }>();

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
      const res = await fetch(`/api/muqtarab/angles/${angleSlug}/topics/${topicSlug}`);
      if (!res.ok) throw new Error("Failed to fetch topic");
      return res.json();
    },
    enabled: !!angleSlug && !!topicSlug,
  });

  const { data: relatedData } = useQuery<{ topics: Topic[] }>({
    queryKey: ["/api/muqtarab/angles", angleSlug, "topics", "related"],
    queryFn: async () => {
      const res = await fetch(`/api/muqtarab/angles/${angleSlug}/topics?limit=5`);
      if (!res.ok) throw new Error("Failed to fetch related topics");
      return res.json();
    },
    enabled: !!angleSlug && !!topicData?.topic?.id,
  });

  const topic = topicData?.topic;
  const angle = topicData?.angle;
  const writer = topicData?.writer ?? null;

  const relatedTopics = (relatedData?.topics ?? []).filter((t) => t.id !== topic?.id).slice(0, 3);

  const viewedRef = useRef<string | null>(null);
  useEffect(() => {
    if (topic?.id && viewedRef.current !== topic.id) {
      viewedRef.current = topic.id;
      fetch(`/api/muqtarab/topics/${topic.id}/view`, {
        method: "POST",
        credentials: "include",
      }).catch(() => {});
    }
  }, [topic?.id]);

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
      if (topic.heroImageUrl) {
        setOgTag("og:image", topic.heroImageUrl);
      }
    }
  }, [topic, angle]);

  const handleShare = async () => {
    if (navigator.share && topic) {
      try {
        await navigator.share({
          title: topic.title,
          text: topic.excerpt || "",
          url: window.location.href,
        });
      } catch (err) {
        console.log("Share failed:", err);
      }
    }
  };

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

  return (
    <div
      className="relative min-h-screen bg-background flex flex-col"
      dir="rtl"
      style={theme.vars}
    >
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

        <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
          <div className="max-w-3xl mx-auto">
            <header className="mb-8">
              <Link href={`/muqtarab/${angleSlug}`}>
                <a
                  className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium"
                  style={{ backgroundColor: theme.soft, color: theme.color }}
                  data-testid="chip-angle"
                >
                  <AngleIcon className="h-4 w-4" />
                  {angle.nameAr}
                </a>
              </Link>
              <h1
                className="text-3xl md:text-4xl lg:text-[2.75rem] font-bold leading-tight text-foreground"
                data-testid="heading-topic-title"
              >
                {topic.title}
              </h1>
              <WriterByline writer={writer} angleName={angle.nameAr} />
              <div className="mt-5 flex items-center justify-between gap-4 flex-wrap">
                {topic.publishedAt && (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Calendar className="h-4 w-4" />
                    <span data-testid="text-published-date">{formatDate(topic.publishedAt)}</span>
                  </div>
                )}
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
              </div>
            </header>

            {topic.excerpt && (
              <aside
                className="mb-10 rounded-2xl border p-6 md:p-7"
                style={{ backgroundColor: theme.softer, borderColor: theme.border }}
                data-testid="section-excerpt"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="h-4 w-4" style={{ color: theme.color }} />
                  <p
                    className="text-xs font-semibold tracking-wide uppercase"
                    style={{ color: theme.color }}
                  >
                    الموجز
                  </p>
                </div>
                <p
                  className="text-lg md:text-xl leading-relaxed text-foreground/90"
                  data-testid="text-excerpt"
                >
                  {topic.excerpt}
                </p>
              </aside>
            )}

            {topic.heroImageUrl && (
              <div className="mb-10" data-testid="section-featured-image">
                <ImageWithCaption
                  imageUrl={topic.heroImageUrl}
                  altText={topic.title}
                  priority
                />
              </div>
            )}

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
                  <p
                    className="text-base font-medium leading-relaxed whitespace-pre-wrap text-foreground"
                  >
                    {angle.writerSignature}
                  </p>
                </div>
              </div>
            )}

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
                  {relatedTopics.map((related) => (
                    <Link
                      key={related.id}
                      href={`/muqtarab/${angleSlug}/topic/${related.slug}`}
                    >
                      <Card className="group hover:shadow-md transition-shadow border-[color:var(--angle-border)]/40 hover:border-[color:var(--angle-border)]">
                        <CardContent className="p-4">
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
    </div>
  );
}
